// DATABASE_URL="postgres://postgres:postgres@localhost:5432/app" \
// npx tsx web/lib/db/workset-import.ts \
//   --root ../worker/worksets/0b7d907d-4d9e-4b90-b0e0-f5a6a1f3dc02 \
//   --project "0b7d907d-4d9e-4b90-b0e0-f5a6a1f3dc02" \
//   --dataset "3876cf8d-c2c9-44c4-8878-3cce65f92ccd"

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import YAML from "yaml";
import * as schema from "./schema";
import {
  arenaMatches,
  benchmarks,
  datasets,
  projects,
  ratingSteps,
  samples,
  trials,
  usageLogs,
} from "./schema";

/**
 * 前提フォルダ構成:
 * /worksets/[projectId]/datasets/[datasetId]/benchmarks/[benchmarkId]
 * /worksets/[projectId]/datasets/[datasetId]/samples
 * /worksets/[projectId]/datasets/[datasetId]/trials
 *
 * root は /worksets/[projectId] を指す想定
 *
 * 重要:
 * - --project, --dataset は「name」ではなく UUID（テーブルの id）を渡す
 * - benchmarks のフォルダ名も UUID (= benchmarkId)
 * - samples.id / trials.sample_id / arena_matches.sample_id は text 前提（sampleKey をそのまま入れる）
 */

type Args = {
  root: string; // /worksets/[projectId]
  project: string; // project UUID (projects.id)
  dataset: string; // dataset UUID (datasets.id) かつフォルダ名
};

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = val;
      i++;
    }
  }

  const root = args.root ?? "/mnt/data/worksets/PROJECT_ID";
  const project = args.project ?? path.basename(root); // UUID想定
  const dataset = args.dataset ?? ""; // UUID想定
  return { root, project, dataset };
}

function resolveRoot(inputRoot: string): string {
  const cwd = process.cwd();
  let resolved = path.resolve(cwd, inputRoot);

  // よくある事故: web/ から ./worker/... を渡してしまう
  if (path.basename(cwd) === "web") {
    const normalized = inputRoot.replace(/\\/g, "/");
    if (normalized.startsWith("./worker/") || normalized === "./worker") {
      resolved = path.resolve(cwd, "..", normalized.slice(2)); // "./" を落として "../worker/..."
    }
  }
  return resolved;
}

function isUuidLike(x: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    x,
  );
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dir: string): Promise<string[]> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
}

async function listFiles(dir: string): Promise<string[]> {
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents.filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function parseIntSafe(x: string): number | null {
  const n = Number.parseInt(x, 10);
  return Number.isFinite(n) ? n : null;
}

function basenameNoExt(p: string): string {
  return path.basename(p, path.extname(p));
}

async function main() {
  const parsed = parseArgs(process.argv);
  const root = resolveRoot(parsed.root);
  const projectId = parsed.project;
  const datasetId = parsed.dataset;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL が未設定です");

  if (!projectId || !isUuidLike(projectId)) {
    throw new Error(`--project は UUID を指定してください: ${projectId}`);
  }
  if (!datasetId || !isUuidLike(datasetId)) {
    throw new Error(`--dataset は UUID を指定してください: ${datasetId}`);
  }

  const datasetsDir = path.join(root, "datasets");
  if (!(await exists(datasetsDir))) {
    throw new Error(`datasets/ が見つかりません: ${datasetsDir}`);
  }

  const datasetRoot = path.join(datasetsDir, datasetId);
  if (!(await exists(datasetRoot))) {
    const dsDirs = (await listDirs(datasetsDir)).map((d) => path.basename(d));
    throw new Error(
      `dataset フォルダが見つかりません: ${datasetRoot}\n` +
        `datasets/ 配下: ${dsDirs.join(", ")}`,
    );
  }

  // 前提3フォルダ
  const samplesDir = path.join(datasetRoot, "samples");
  const benchmarksDir = path.join(datasetRoot, "benchmarks");

  // 任意（存在すれば読む）
  const usageLogsDir = path.join(root, "usage_logs");

  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  const db = drizzle(pg, { schema });

  try {
    // 1) project upsert (ID で確定)
    const existingProject = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true },
    });
    if (!existingProject) {
      await db.insert(projects).values({ id: projectId, name: projectId });
    }

    // 2) dataset upsert (ID で確定)
    const existingDataset = await db.query.datasets.findFirst({
      where: eq(datasets.id, datasetId),
      columns: { id: true, projectId: true },
    });
    if (!existingDataset) {
      await db.insert(datasets).values({
        id: datasetId,
        projectId,
        name: datasetId,
      });
    } else if (existingDataset.projectId !== projectId) {
      throw new Error(
        `datasets.id=${datasetId} は projects.id=${existingDataset.projectId} に紐づいています（指定は ${projectId}）`,
      );
    }

    // 3) samples: folder名(sampleKey) -> samples.id(text) のマッピング
    const sampleKeyToId = new Map<string, string>();

    if (await exists(samplesDir)) {
      const sampleDirs = (await listDirs(samplesDir)).filter(
        (p) => path.basename(p) !== ".DS_Store",
      );

      for (const dir of sampleDirs) {
        const sampleKey = path.basename(dir); // ★ text id
        const infoPath = path.join(dir, "info.json");
        if (!(await exists(infoPath))) continue;

        const info = JSON.parse(await fs.readFile(infoPath, "utf-8"));

        // 既存検索: info->>'original_sample_id'
        const existing = await db
          .select({ id: samples.id })
          .from(samples)
          .where(
            and(
              eq(samples.datasetId, datasetId),
              sql`${samples.info} ->> 'original_sample_id' = ${sampleKey}`,
            ),
          )
          .limit(1);

        if (existing.length) {
          sampleKeyToId.set(sampleKey, existing[0]!.id);
          continue;
        }

        const id = sampleKey;

        const infoWithId = {
          ...info,
          original_sample_id: sampleKey,
          source: {
            dataset: datasetId,
            path: path.relative(root, infoPath),
          },
        };

        await db.insert(samples).values({ id, datasetId, info: infoWithId });
        sampleKeyToId.set(sampleKey, id);
      }
    }

    // 4) trials: dataset-level trials/ は廃止（trials_cache/ は DB に入れない）
    //    per-benchmark trials は benchmark ループ内で import する

    // 5) usage_logs (任意)
    if (await exists(usageLogsDir)) {
      const jsonlFiles = (await listFiles(usageLogsDir)).filter((p) =>
        p.endsWith(".jsonl"),
      );

      const existingIdsRows = await db
        .select({ id: sql<string>`${usageLogs.metadata} ->> 'id'` })
        .from(usageLogs)
        .where(eq(usageLogs.projectId, projectId));

      const existingIds = new Set(
        existingIdsRows.map((r) => r.id).filter(Boolean),
      );

      for (const f of jsonlFiles) {
        const rl = readline.createInterface({
          input: createReadStream(f, { encoding: "utf-8" }),
          crlfDelay: Infinity,
        });

        const batch: { projectId: string; metadata: any }[] = [];
        for await (const line of rl) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let obj: any;
          try {
            obj = JSON.parse(trimmed);
          } catch {
            continue;
          }

          const id = obj?.id != null ? String(obj.id) : null;
          if (id && existingIds.has(id)) continue;
          if (id) existingIds.add(id);

          batch.push({
            projectId,
            metadata: { ...obj, source: { file: path.relative(root, f) } },
          });

          if (batch.length >= 500) {
            await db.insert(usageLogs).values(batch);
            batch.length = 0;
          }
        }
        if (batch.length) await db.insert(usageLogs).values(batch);
      }
    }

    // 6) benchmarks + arena_matches + rating_steps
    if (await exists(benchmarksDir)) {
      // benchmarks/ 配下のフォルダ名は UUID (= benchmarkId)
      const benchmarkDirs = await listDirs(benchmarksDir);

      for (const bdir of benchmarkDirs) {
        const benchmarkIdFromFolder = path.basename(bdir);
        if (!isUuidLike(benchmarkIdFromFolder)) continue; // 念のため

        const configPath = path.join(bdir, "config.yaml");
        const infoPath = path.join(bdir, "info.json");
        if (!(await exists(configPath)) || !(await exists(infoPath))) continue;

        const configYaml = await fs.readFile(configPath, "utf-8");
        const config = YAML.parse(configYaml);
        const info = JSON.parse(await fs.readFile(infoPath, "utf-8"));

        // DB側も benchmark.id を「フォルダ UUID」に固定する
        const existingBenchmark = await db.query.benchmarks.findFirst({
          where: eq(benchmarks.id, benchmarkIdFromFolder),
          columns: { id: true, datasetId: true },
        });

        if (!existingBenchmark) {
          await db.insert(benchmarks).values({
            id: benchmarkIdFromFolder,
            datasetId,
            // name は一旦 id と同じで入れる（必要なら後で変更）
            name: benchmarkIdFromFolder,
            config: {
              ...config,
              source: { path: path.relative(root, configPath) },
            },
            info: {
              ...info,
              source: { path: path.relative(root, infoPath) },
            },
          });
        } else if (existingBenchmark.datasetId !== datasetId) {
          throw new Error(
            `benchmarks.id=${benchmarkIdFromFolder} は datasets.id=${existingBenchmark.datasetId} に紐づいています（指定は ${datasetId}）`,
          );
        } else {
          // 既存なら更新
          await db
            .update(benchmarks)
            .set({
              name: benchmarkIdFromFolder,
              config: {
                ...config,
                source: { path: path.relative(root, configPath) },
              },
              info: {
                ...info,
                source: { path: path.relative(root, infoPath) },
              },
            })
            .where(eq(benchmarks.id, benchmarkIdFromFolder));
        }

        const benchmarkId = benchmarkIdFromFolder;

        // arena_matches
        const arenaDir = path.join(bdir, "arena_matches");
        if (await exists(arenaDir)) {
          const files = (await listFiles(arenaDir)).filter((p) =>
            p.endsWith(".json"),
          );

          const rows: {
            benchmarkId: string;
            matchIndex: number;
            sampleId: string;
            matchData: any;
          }[] = [];

          for (const f of files) {
            const j = JSON.parse(await fs.readFile(f, "utf-8"));

            const sampleKey = String(j.sample_id ?? "");
            const sampleId = sampleKeyToId.get(sampleKey);
            if (!sampleId) continue;

            const idx =
              parseIntSafe(basenameNoExt(f)) ??
              (typeof j.match_id === "string" && j.match_id.startsWith("match_")
                ? parseIntSafe(j.match_id.replace("match_", ""))
                : null);
            if (idx == null) continue;

            rows.push({
              benchmarkId,
              matchIndex: idx,
              sampleId,
              matchData: { ...j, source: { path: path.relative(root, f) } },
            });
          }

          for (const batch of chunk(rows, 500)) {
            if (!batch.length) continue;
            await db
              .insert(arenaMatches)
              .values(batch)
              .onConflictDoUpdate({
                target: [arenaMatches.benchmarkId, arenaMatches.matchIndex],
                set: {
                  sampleId: sql`excluded.sample_id`,
                  matchData: sql`excluded.match_data`,
                },
              });
          }
        }

        // rating_steps
        const ratingsDir = path.join(bdir, "ratings");
        if (await exists(ratingsDir)) {
          const files = (await listFiles(ratingsDir)).filter((p) =>
            p.endsWith(".json"),
          );

          const rows: { benchmarkId: string; step: number; stepData: any }[] =
            [];
          for (const f of files) {
            const j = JSON.parse(await fs.readFile(f, "utf-8"));

            const step =
              typeof j.step === "number"
                ? j.step
                : basenameNoExt(f).startsWith("step")
                  ? parseIntSafe(basenameNoExt(f).replace("step", ""))
                  : null;
            if (step == null) continue;

            rows.push({
              benchmarkId,
              step,
              stepData: { ...j, source: { path: path.relative(root, f) } },
            });
          }

          for (const batch of chunk(rows, 500)) {
            if (!batch.length) continue;
            await db
              .insert(ratingSteps)
              .values(batch)
              .onConflictDoUpdate({
                target: [ratingSteps.benchmarkId, ratingSteps.step],
                set: { stepData: sql`excluded.step_data` },
              });
          }
        }

        // per-benchmark trials
        const benchmarkTrialsDir = path.join(bdir, "trials");
        if (await exists(benchmarkTrialsDir)) {
          const trialJsonPaths = (await walk(benchmarkTrialsDir)).filter((p) =>
            p.endsWith(`${path.sep}trial.json`),
          );

          for (const p of trialJsonPaths) {
            const j = JSON.parse(await fs.readFile(p, "utf-8"));

            const sampleKey = String(j.sample_id ?? "");
            const sampleId = sampleKeyToId.get(sampleKey);
            if (!sampleId) continue;

            const modelName = String(j.model ?? path.basename(path.dirname(p)));
            const costUsd =
              typeof j.cost_usd === "number" ? String(j.cost_usd) : j.cost_usd;

            const result = {
              output: j.output,
              tokens: j.tokens,
              latency_ms: j.latency_ms,
              cost_usd: j.cost_usd,
              params: j.params,
              created_at: j.created_at,
              source: { path: path.relative(root, p) },
            };

            await db
              .insert(trials)
              .values({
                benchmarkId,
                sampleId,
                modelName,
                result,
                costUsd: costUsd != null ? String(costUsd) : null,
              })
              .onConflictDoUpdate({
                target: [trials.benchmarkId, trials.sampleId, trials.modelName],
                set: {
                  result,
                  costUsd: costUsd != null ? String(costUsd) : null,
                },
              });
          }
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          cwd: process.cwd(),
          root,
          projectId,
          datasetId,
          samples: sampleKeyToId.size,
        },
        null,
        2,
      ),
    );
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
