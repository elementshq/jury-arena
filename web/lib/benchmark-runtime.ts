import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import fg from "fast-glob";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db/core";
import { ArenaMatchRepository } from "./db/repository/arena-match-repository";
import { RatingStepRepository } from "./db/repository/rating-step-repository";
import { trials } from "./db/schema";
import {
  type ArenaMatchData,
  ArenaMatchDataSchema,
  type RatingStepData,
  RatingStepDataSchema,
  type TrialResult,
  TrialResultSchema,
} from "./db/types/jsonb";
import { getBenchmarkDir } from "./resolve-dir";

export type BenchmarkStatus =
  | "queued"
  | "running"
  | "finished"
  | "failed"
  | "stopped";

export type BenchmarkState = {
  benchmarkId: string;
  projectId: string;
  datasetId: string;
  datasetName: string;

  status: BenchmarkStatus;
  startedAt?: string;
  finishedAt?: string;

  step: { current: number; total?: number };

  matches: { batchSize: number; max: number };

  models: { count: number; names: string[] };

  ratingSeries: Array<{ step: number; [modelName: string]: number }>;

  logs: Array<{ at: string; step: number; message: string }>;
};

export type IngestEvent =
  | {
      type: "trial";
      sampleId: string;
      modelName: string;
      filePath: string;
      result: TrialResult;
    }
  | {
      type: "arena_match";
      benchmarkId: string;
      matchIndex: number;
      filePath: string;
      matchData: ArenaMatchData;
    }
  | {
      type: "rating_step";
      benchmarkId: string;
      step: number;
      filePath: string;
      stepData: RatingStepData;
      ratingsRow: { step: number; [modelName: string]: number };
    }
  | {
      type: "ingest_error";
      filePath: string;
      message: string;
    };

type BenchmarkRuntime = {
  proc?: ChildProcessWithoutNullStreams;
  state: BenchmarkState;

  subscribers: Set<(line: string) => void>;
  statusSubscribers: Set<(status: BenchmarkStatus) => void>;
  ingestSubscribers: Set<(ev: IngestEvent) => void>;

  logLimit: number;
  lastStep: number;

  watchers: {
    benchmarkRoot?: FSWatcher; // benchmarks を watch (arena_matches, ratings, trials)
  };

  // ファイルイベント重複抑止
  seenKeys: Set<string>;

  // sampleId::modelName -> latest runIndex
  latestTrialIndex: Map<string, number>;

  // 一度だけ実行する scan を抑止
  scanned: {
    arena: boolean;
    ratings: boolean;
    trials: boolean;
  };

  // benchmarkDir を検知したか（1回だけログ出す）
  sawBenchmarkDir: boolean;

  // Next.js経由で作成された一時設定ファイルのパス（終了時に削除）
  tempConfigPath?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __benchmarkRuntimeStore: Map<string, BenchmarkRuntime> | undefined;
}

const store: Map<string, BenchmarkRuntime> =
  global.__benchmarkRuntimeStore ?? new Map();
global.__benchmarkRuntimeStore = store;

/**
 * ============================================================
 * Path helpers
 * ============================================================
 */

// /.../benchmarks/[benchmarkId]/arena_matches/00001.json -> matchIndex=1
export function parseArenaMatchPath(
  filePath: string,
): { matchIndex: number } | null {
  const base = path.basename(filePath);
  const m = base.match(/^(\d+)\.json$/);
  if (!m) return null;
  const matchIndex = Number(m[1]);
  if (!Number.isFinite(matchIndex)) return null;
  return { matchIndex };
}

// /.../benchmarks/[benchmarkId]/ratings/step001.json -> step=1
export function parseRatingStepPath(filePath: string): { step: number } | null {
  const base = path.basename(filePath);
  const m = base.match(/^step(\d+)\.json$/);
  if (!m) return null;
  const step = Number(m[1]);
  if (!Number.isFinite(step)) return null;
  return { step };
}

/**
 * trials:
 * /worker/worksets/[projectId]/datasets/[datasetId]/benchmarks/[benchmarkName]/trials/[SampleId]/gpt-5/trial.json
 * /worker/worksets/[projectId]/datasets/[datasetId]/benchmarks/[benchmarkName]/trials/[SampleId]/openrouter/anthropic/claude-opus-4.5/trial.json
 *
 * - SampleId: trials直下の1階層目
 * - modelName: SampleIdの次〜trial.json直前までの可変長パス（/区切りを維持）
 */
export function parseTrialPath(
  filePath: string,
): { sampleId: string; modelName: string } | null {
  const norm = filePath.split(path.sep).join("/");
  if (!norm.endsWith("/trial.json")) return null;

  // /trials/<sampleId>/<...modelPath...>/trial.json
  const m = norm.match(/\/trials\/([^/]+)\/(.+)\/trial\.json$/);
  if (!m) return null;

  const sampleId = m[1];
  const modelName = m[2]; // 可変長パスそのまま（例: "gpt-5" / "openrouter/anthropic/claude-opus-4.5")

  if (!sampleId || !modelName) return null;

  return { sampleId, modelName };
}

export function buildWatchGlobs(state: BenchmarkState) {
  const benchmarkDir = getBenchmarkDir(
    state.projectId,
    state.datasetId,
    state.benchmarkId,
  );

  return {
    arenaMatchesGlob: path.join(benchmarkDir, "arena_matches", "*.json"),
    ratingsGlob: path.join(benchmarkDir, "ratings", "step*.json"),
    trialsGlob: path.join(benchmarkDir, "trials", "*", "**", "trial.json"),
  };
}

/**
 * ============================================================
 * Helpers
 * ============================================================
 */

function toRatingsRow(stepData: RatingStepData) {
  const row: { step: number; [modelName: string]: number } = {
    step: stepData.step,
  };
  for (const [model, v] of Object.entries(stepData.rankings)) {
    row[model] = v.rating;
  }
  return row;
}

function upsertRatingSeries(
  series: BenchmarkState["ratingSeries"],
  row: { step: number; [modelName: string]: number },
) {
  const idx = series.findIndex((x) => x.step === row.step);
  if (idx >= 0) series[idx] = row;
  else series.push(row);
  series.sort((a, b) => a.step - b.step);
}

function normPath(p: string) {
  return p.split(path.sep).join("/");
}

/**
 * ============================================================
 * Runtime store
 * ============================================================
 */

export function createBenchmarkId(): string {
  return uuidv4();
}

export function getBenchmarkRuntime(benchmarkId: string) {
  return store.get(benchmarkId);
}

export function listBenchmarks() {
  return [...store.values()].map((r) => r.state);
}

export function initBenchmarkRuntime(args: {
  benchmarkId: string;
  projectId: string;
  datasetId: string;
  datasetName: string;
  models?: string[];
  totalSteps?: number;
  matchBatchSize?: number;
  maxMatches?: number;
  logLimit?: number;
  tempConfigPath?: string;
}) {
  const runtime: BenchmarkRuntime = {
    proc: undefined,
    subscribers: new Set(),
    statusSubscribers: new Set(),
    ingestSubscribers: new Set(),
    logLimit: args.logLimit ?? 200,
    lastStep: 0,
    watchers: {},
    seenKeys: new Set(),
    latestTrialIndex: new Map(),
    scanned: { arena: false, ratings: false, trials: false },
    sawBenchmarkDir: false,
    tempConfigPath: args.tempConfigPath,
    state: {
      benchmarkId: args.benchmarkId,
      projectId: args.projectId,
      datasetId: args.datasetId,
      datasetName: args.datasetName,
      status: "queued",
      startedAt: undefined,
      finishedAt: undefined,
      step: { current: 0, total: args.totalSteps },
      matches: { batchSize: args.matchBatchSize ?? 0, max: args.maxMatches ?? 0 },
      models: { count: args.models?.length ?? 0, names: args.models ?? [] },
      ratingSeries: [],
      logs: [],
    },
  };

  store.set(args.benchmarkId, runtime);
  return runtime;
}

export function appendLog(benchmarkId: string, message: string) {
  const rt = store.get(benchmarkId);
  if (!rt) return;

  const m = message.match(/---\s*Step\s+(\d+)\s*---/i);
  if (m) {
    const step = Number(m[1]);
    if (Number.isFinite(step)) {
      rt.lastStep = step;
      rt.state.step.current = step;
    }
  }

  const at = new Date().toISOString();
  const step = rt.state.step.current ?? 0;

  rt.state.logs.push({ at, step, message });

  if (rt.state.logs.length > rt.logLimit) {
    rt.state.logs.splice(0, rt.state.logs.length - rt.logLimit);
  }

  for (const fn of rt.subscribers) fn(message);
}

export function setStatus(benchmarkId: string, status: BenchmarkStatus) {
  const rt = store.get(benchmarkId);
  if (!rt) return;

  if (rt.state.status === status) return;

  rt.state.status = status;

  if (status === "running" && !rt.state.startedAt) {
    rt.state.startedAt = new Date().toISOString();
  }

  if (status === "finished" || status === "failed" || status === "stopped") {
    rt.state.finishedAt = new Date().toISOString();
  }

  for (const fn of rt.statusSubscribers) fn(status);
}

export function subscribe(benchmarkId: string, fn: (line: string) => void) {
  const rt = store.get(benchmarkId);
  if (!rt) return { ok: false as const };

  rt.subscribers.add(fn);
  return {
    ok: true as const,
    unsubscribe: () => rt.subscribers.delete(fn),
  };
}

export function subscribeStatus(
  benchmarkId: string,
  fn: (status: BenchmarkStatus) => void,
) {
  const rt = store.get(benchmarkId);
  if (!rt) return { ok: false as const };

  rt.statusSubscribers.add(fn);
  return {
    ok: true as const,
    unsubscribe: () => rt.statusSubscribers.delete(fn),
  };
}

export function subscribeIngest(
  benchmarkId: string,
  fn: (ev: IngestEvent) => void,
) {
  const rt = store.get(benchmarkId);
  if (!rt) return { ok: false as const };

  rt.ingestSubscribers.add(fn);
  return {
    ok: true as const,
    unsubscribe: () => rt.ingestSubscribers.delete(fn),
  };
}

function emitIngest(rt: BenchmarkRuntime, ev: IngestEvent) {
  if (ev.type === "ingest_error") {
    appendLog(
      rt.state.benchmarkId,
      `[INGEST_ERROR] ${ev.filePath} ${ev.message}`,
    );
  }
  for (const fn of rt.ingestSubscribers) fn(ev);
}

/**
 * ============================================================
 * Ingest watchers
 * ============================================================
 */

function stopIngestWatchers(rt: BenchmarkRuntime) {
  try {
    rt.watchers.benchmarkRoot?.close().catch(() => {});
  } catch {
    // ignore
  }
  rt.watchers.benchmarkRoot = undefined;
}

/**
 * プロセス終了後に trial ファイルを最終スキャンして DB に取りこぼしなく投入する。
 * seenKeys をリセットして再処理を許可し、upsert なので安全。
 */
async function finalTrialScan(rt: BenchmarkRuntime): Promise<void> {
  const benchmarkDir = getBenchmarkDir(
    rt.state.projectId,
    rt.state.datasetId,
    rt.state.benchmarkId,
  );
  const benchmarksRoot = path.dirname(benchmarkDir);

  try {
    const files = await fg(`${rt.state.benchmarkId}/trials/*/**/trial.json`, {
      cwd: benchmarksRoot,
      absolute: true,
      onlyFiles: true,
    });

    for (const fp of files) {
      const parsedPath = parseTrialPath(fp);
      if (!parsedPath) continue;
      const { sampleId, modelName } = parsedPath;

      try {
        const json = JSON.parse(fs.readFileSync(fp, "utf-8"));
        const parsed = TrialResultSchema.safeParse(json);
        if (!parsed.success) continue;
        const result = parsed.data;

        await db
          .insert(trials)
          .values({
            benchmarkId: rt.state.benchmarkId,
            sampleId,
            modelName,
            costUsd: String(result.cost_usd),
            result,
          })
          .onConflictDoUpdate({
            target: [trials.benchmarkId, trials.sampleId, trials.modelName],
            set: { result, costUsd: String(result.cost_usd) },
          });
      } catch {
        // best-effort: ファイル読み取りエラーやDB制約違反は無視
      }
    }

    appendLog(
      rt.state.benchmarkId,
      `[INGEST] final trial scan: ${files.length} files processed`,
    );
  } catch (e) {
    appendLog(
      rt.state.benchmarkId,
      `[INGEST_ERROR] final trial scan: ${String(e)}`,
    );
  }
}

function startIngestWatchersIfNeeded(rt: BenchmarkRuntime) {
  const benchmarkDir = getBenchmarkDir(
    rt.state.projectId,
    rt.state.datasetId,
    rt.state.benchmarkId,
  );
  // ✅ benchmarkDir の親（benchmarks）を watch
  const benchmarksRoot = path.dirname(benchmarkDir);

  const arenaDir = path.join(benchmarkDir, "arena_matches");
  const ratingsDir = path.join(benchmarkDir, "ratings");
  const trialsDir = path.join(benchmarkDir, "trials");

  const watchOpts = {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  } as const;

  appendLog(
    rt.state.benchmarkId,
    `[INGEST] benchmarksRoot=${benchmarksRoot} exists=${fs.existsSync(
      benchmarksRoot,
    )}`,
  );
  appendLog(
    rt.state.benchmarkId,
    `[INGEST] benchmarkDir=${benchmarkDir} exists=${fs.existsSync(benchmarkDir)}`,
  );

  /**
   * handlers
   */

  const onRatingFile = async (filePath: string) => {
    const parsedPath = parseRatingStepPath(filePath);
    if (!parsedPath) return;

    const key = `rating_step:${rt.state.benchmarkId}:${parsedPath.step}`;
    if (rt.seenKeys.has(key)) return;

    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return;
    }

    const parsed = RatingStepDataSchema.safeParse(json);
    if (!parsed.success) {
      emitIngest(rt, {
        type: "ingest_error",
        filePath,
        message: `invalid rating step json: ${parsed.error.message}`,
      });
      return;
    }

    const stepFile = parsed.data;
    const ratingsRow = toRatingsRow(stepFile);

    try {
      const ratingStepRepository = new RatingStepRepository(db);
      await ratingStepRepository.save({
        benchmarkId: rt.state.benchmarkId,
        step: stepFile.step,
        stepData: stepFile,
      });

      upsertRatingSeries(rt.state.ratingSeries, ratingsRow);
      rt.seenKeys.add(key);

      emitIngest(rt, {
        type: "rating_step",
        benchmarkId: rt.state.benchmarkId,
        step: stepFile.step,
        filePath,
        stepData: stepFile,
        ratingsRow,
      });
    } catch (e) {
      const err: any = (e as any)?.cause ?? e;
      if (err?.code === "23505") {
        rt.seenKeys.add(key);
        return; // unique衝突はOK扱い
      }
      logDbError(rt, e, "rating_step.save");
      emitIngest(rt, {
        type: "ingest_error",
        filePath,
        message: `db save rating_step failed: ${String(e)}`,
      });
    }
  };

  const onMatchFile = async (filePath: string) => {
    const parsedPath = parseArenaMatchPath(filePath);
    if (!parsedPath) return;

    const { matchIndex } = parsedPath;
    const key = `arena_match:${rt.state.benchmarkId}:${matchIndex}`;
    if (rt.seenKeys.has(key)) return;

    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return;
    }

    const parsed = ArenaMatchDataSchema.safeParse(json);
    if (!parsed.success) {
      emitIngest(rt, {
        type: "ingest_error",
        filePath,
        message: `invalid arena match json: ${parsed.error.message}`,
      });
      return;
    }

    const matchData = parsed.data;

    try {
      const arenaMatchRepository = new ArenaMatchRepository(db);
      await arenaMatchRepository.save({
        benchmarkId: rt.state.benchmarkId,
        matchIndex,
        sampleId: matchData.sample_id,
        matchData,
      });

      rt.seenKeys.add(key);

      emitIngest(rt, {
        type: "arena_match",
        benchmarkId: rt.state.benchmarkId,
        matchIndex,
        filePath,
        matchData,
      });
    } catch (e) {
      const err: any = (e as any)?.cause ?? e;
      if (err?.code === "23505") {
        rt.seenKeys.add(key);
        return; // unique衝突はOK扱い
      }
      logDbError(rt, e, "arena_match.save");
      emitIngest(rt, {
        type: "ingest_error",
        filePath,
        message: `db save arena_match failed: ${String(e)}`,
      });
    }
  };

  const onTrialFile = async (filePath: string) => {
    const parsedPath = parseTrialPath(filePath);
    if (!parsedPath) return;

    const { sampleId, modelName } = parsedPath;

    // ファイルイベント重複抑止（change/addの多重発火対策）
    const fileKey = `trial_file:${filePath}`;
    if (rt.seenKeys.has(fileKey)) return;
    rt.seenKeys.add(fileKey);

    try {
      let json: unknown;
      try {
        json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {
        return;
      }

      const parsed = TrialResultSchema.safeParse(json);
      if (!parsed.success) {
        emitIngest(rt, {
          type: "ingest_error",
          filePath,
          message: `invalid trial json: ${parsed.error.message}`,
        });
        return;
      }

      const result = parsed.data;

      // benchmarkId 付きで upsert（同一 benchmark 内の同じ sample+model は上書き）
      await db
        .insert(trials)
        .values({
          benchmarkId: rt.state.benchmarkId,
          sampleId,
          modelName,
          costUsd: String(result.cost_usd),
          result,
        })
        .onConflictDoUpdate({
          target: [trials.benchmarkId, trials.sampleId, trials.modelName],
          set: {
            result,
            costUsd: String(result.cost_usd),
          },
        });

      emitIngest(rt, { type: "trial", sampleId, modelName, filePath, result });
    } catch (e) {
      logDbError(rt, e, "trials.upsert");
      emitIngest(rt, {
        type: "ingest_error",
        filePath,
        message: `db upsert trial failed: ${String(e)}`,
      });
    }
  };

  /**
   * ✅ scan を「benchmarksRoot から benchmarkId 以下を探す」方式に変更
   * benchmarkDir がまだ無くても OK（空になるだけ）
   */
  const scanArenaAndRatings = async () => {
    // arena
    if (!rt.scanned.arena) {
      rt.scanned.arena = true;
      try {
        const files = await fg(`${rt.state.benchmarkId}/arena_matches/*.json`, {
          cwd: benchmarksRoot,
          absolute: true,
          onlyFiles: true,
        });
        for (const fp of files) void onMatchFile(fp);
      } catch (e) {
        appendLog(
          rt.state.benchmarkId,
          `[INGEST_ERROR] (scan) arena ${String(e)}`,
        );
      }
    }

    // ratings
    if (!rt.scanned.ratings) {
      rt.scanned.ratings = true;
      try {
        const files = await fg(`${rt.state.benchmarkId}/ratings/step*.json`, {
          cwd: benchmarksRoot,
          absolute: true,
          onlyFiles: true,
        });
        for (const fp of files) void onRatingFile(fp);
      } catch (e) {
        appendLog(
          rt.state.benchmarkId,
          `[INGEST_ERROR] (scan) ratings ${String(e)}`,
        );
      }
    }
  };

  const scanTrials = async () => {
    if (rt.scanned.trials) return;
    rt.scanned.trials = true;

    try {
      const files = await fg(`${rt.state.benchmarkId}/trials/*/**/trial.json`, {
        cwd: benchmarksRoot,
        absolute: true,
        onlyFiles: true,
      });
      for (const fp of files) void onTrialFile(fp);
    } catch (e) {
      appendLog(
        rt.state.benchmarkId,
        `[INGEST_ERROR] (scan) trials ${String(e)}`,
      );
    }
  };

  /**
   * watchers
   */

  if (!rt.watchers.benchmarkRoot) {
    const w = chokidar.watch(benchmarksRoot, {
      ...watchOpts,
      depth: 10,
    });

    rt.watchers.benchmarkRoot = w;

    w.on("ready", () => {
      appendLog(
        rt.state.benchmarkId,
        `[WATCH] benchmarks ready ${benchmarksRoot}`,
      );
      // ready 後に一度 scan（存在しなくてもOKな glob なので安全）
      void scanArenaAndRatings();
    });

    w.on("error", (e) => {
      appendLog(
        rt.state.benchmarkId,
        `[INGEST_ERROR] (watch) benchmarks ${String(e)}`,
      );
    });

    // ✅ 重要: addDir を拾って benchmarkDir 作成を確実に検知し、scan を再実行
    w.on("addDir", (p) => {
      const n = normPath(p);
      const bd = normPath(benchmarkDir);

      if (n === bd && !rt.sawBenchmarkDir) {
        rt.sawBenchmarkDir = true;
        appendLog(
          rt.state.benchmarkId,
          `[WATCH] benchmarkDir created ${benchmarkDir}`,
        );
      }

      // benchmarkId 配下のディレクトリができたら scan をやり直せるようにフラグを戻す
      // （rating/arena/trials はすぐ作られるので、ここで scan し直すのが確実）
      if (n === bd || n.startsWith(bd + "/")) {
        rt.scanned.arena = false;
        rt.scanned.ratings = false;
        rt.scanned.trials = false;
        void scanArenaAndRatings();
        void scanTrials();
      }
    });

    // ✅ add / change は最小限だけ処理（ログは出さない）
    w.on("add", (p) => {
      const n = normPath(p);
      const arenaPrefix = normPath(arenaDir) + "/";
      const ratingsPrefix = normPath(ratingsDir) + "/";
      const trialsPrefix = normPath(trialsDir) + "/";

      if (n.startsWith(ratingsPrefix) && /\/step\d+\.json$/.test(n)) {
        void onRatingFile(p);
        return;
      }
      if (n.startsWith(arenaPrefix) && /\/\d+\.json$/.test(n)) {
        void onMatchFile(p);
        return;
      }
      if (n.startsWith(trialsPrefix) && n.endsWith("/trial.json")) {
        void onTrialFile(p);
      }
    });

    w.on("change", (p) => {
      const n = normPath(p);
      const arenaPrefix = normPath(arenaDir) + "/";
      const ratingsPrefix = normPath(ratingsDir) + "/";
      const trialsPrefix = normPath(trialsDir) + "/";

      if (n.startsWith(ratingsPrefix) && /\/step\d+\.json$/.test(n)) {
        void onRatingFile(p);
        return;
      }
      if (n.startsWith(arenaPrefix) && /\/\d+\.json$/.test(n)) {
        void onMatchFile(p);
        return;
      }
      if (n.startsWith(trialsPrefix) && n.endsWith("/trial.json")) {
        void onTrialFile(p);
      }
    });
  }

  appendLog(
    rt.state.benchmarkId,
    `[INGEST] watching benchmarks root: ${benchmarksRoot}`,
  );
}

/**
 * ============================================================
 * stop & attach process
 * ============================================================
 */

export function stopBenchmark(benchmarkId: string) {
  const rt = store.get(benchmarkId);
  if (!rt) return { ok: false as const, error: "not_found" as const };

  if (!rt.proc) return { ok: false as const, error: "no_process" as const };
  if (rt.state.status !== "running" && rt.state.status !== "queued") {
    return { ok: false as const, error: "not_running" as const };
  }

  try {
    rt.proc.kill("SIGTERM");
    // watcher はプロセス終了後の最終scanまで活かす（proc.on("close") で停止）
    setStatus(benchmarkId, "stopped");
    appendLog(benchmarkId, "[SYSTEM] Stopped (SIGTERM sent).");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "kill_failed" as const };
  }
}

export function attachProcess(
  benchmarkId: string,
  proc: ChildProcessWithoutNullStreams,
) {
  const rt = store.get(benchmarkId);
  if (!rt) return;

  rt.proc = proc;
  setStatus(benchmarkId, "running");

  startIngestWatchersIfNeeded(rt);

  proc.stdout.setEncoding("utf-8");
  proc.stderr.setEncoding("utf-8");

  proc.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.length) appendLog(benchmarkId, line);
    }
  });

  proc.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.length) appendLog(benchmarkId, `[stderr] ${line}`);
    }
  });

  proc.on("close", (code) => {
    // Next.js経由で作成された一時設定ファイルを削除
    if (rt.tempConfigPath) {
      try {
        if (fs.existsSync(rt.tempConfigPath)) {
          fs.unlinkSync(rt.tempConfigPath);
          appendLog(
            benchmarkId,
            `[CLEANUP] Removed temporary config file: ${rt.tempConfigPath}`,
          );
        }
      } catch (e) {
        appendLog(
          benchmarkId,
          `[WARN] Failed to remove temporary config file: ${String(e)}`,
        );
      }
    }

    if (rt.state.status !== "stopped") {
      if (code === 0) {
        setStatus(benchmarkId, "finished");
        appendLog(benchmarkId, "[SYSTEM] Process exited with code=0");
      } else {
        setStatus(benchmarkId, "failed");
        appendLog(benchmarkId, `[SYSTEM] Process exited with code=${code}`);
      }
    }

    // プロセス終了後、最終 trial scan → watcher 停止
    void finalTrialScan(rt).finally(() => {
      stopIngestWatchers(rt);
    });
  });

  proc.on("error", (err) => {
    stopIngestWatchers(rt);
    setStatus(benchmarkId, "failed");
    appendLog(benchmarkId, `[SYSTEM] Process error: ${String(err)}`);
  });
}

function logDbError(rt: BenchmarkRuntime, e: unknown, label: string) {
  const err: any = (e as any)?.cause ?? e;
  appendLog(
    rt.state.benchmarkId,
    `[DB_ERROR][${label}] ${String(err?.message ?? err)}`,
  );
  appendLog(
    rt.state.benchmarkId,
    `[DB_ERROR][${label}] code=${err?.code ?? ""}`,
  );
  appendLog(
    rt.state.benchmarkId,
    `[DB_ERROR][${label}] detail=${err?.detail ?? ""}`,
  );
  appendLog(
    rt.state.benchmarkId,
    `[DB_ERROR][${label}] constraint=${err?.constraint ?? ""}`,
  );
  appendLog(
    rt.state.benchmarkId,
    `[DB_ERROR][${label}] table=${err?.table ?? ""}`,
  );
}
