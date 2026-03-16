import "server-only";

import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Conn } from "@/lib/db/core";
import {
  arenaMatches,
  benchmarks,
  datasets,
  ratingSteps,
  samples,
  trials,
} from "@/lib/db/schema";
import {
  type ArenaMatchData,
  ArenaMatchDataSchema,
  type RatingStepData,
  RatingStepDataSchema,
  type SampleInfo,
  SampleInfoSchema,
  type TrialResult,
  TrialResultSchema,
} from "@/lib/db/types/jsonb";
import type { DatasetModel } from "../repository/dataset-repository";

// ---------------------------------------------------------------------------------------------
// Helpers（追加）
// ---------------------------------------------------------------------------------------------
function byteLen(v: string) {
  return Buffer.byteLength(v, "utf8");
}

/**
 * unknown を “文字列化して” maxBytes 以内に収める（object/array も必ず抑える）
 */
function truncateUnknownToString(value: unknown, maxBytes: number): string {
  if (value == null) return "";

  if (typeof value === "string") {
    if (byteLen(value) <= maxBytes) return value;
    const approxChars = Math.max(0, Math.floor(maxBytes * 0.9));
    return `${value.slice(0, approxChars)}\n\n[... truncated]`;
  }

  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }

  if (byteLen(s) <= maxBytes) return s;
  const approxChars = Math.max(0, Math.floor(maxBytes * 0.9));
  return `${s.slice(0, approxChars)}\n\n[... truncated]`;
}

/**
 * SampleInfo内の data:（base64等）を除去
 * - message.content が string の場合も保険で除去
 * - message.content が配列の場合、image_url の data: を置換
 * - file_ref はそのまま（UIで [Attachment: path] 表示）
 */
function sanitizeSampleInfoInPlace(sampleInfo: any) {
  const msgs = sampleInfo?.input?.messages;
  if (!Array.isArray(msgs)) return;

  for (const msg of msgs) {
    if (!msg) continue;

    // content: string
    if (typeof msg.content === "string") {
      if (msg.content.includes("data:")) {
        msg.content = msg.content.replace(
          /data:[^ \n\r\t]+/g,
          "[inline data removed]",
        );
      }
      continue;
    }

    // content: ContentPart[]
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part) continue;

        if (part.type === "image_url") {
          const url = part.image_url?.url;
          if (typeof url === "string" && url.startsWith("data:")) {
            const m = url.match(/^data:([^;,]+)/);
            const mime = m?.[1] || "image";
            part.image_url.url = `[Image data removed: ${mime}]`;
          }
        }

        // file_ref: keep
        // text: keep
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 既存関数群（あなたの貼り付け通り）
// ---------------------------------------------------------------------------------------------
export async function countProjectDatasets(
  conn: Conn,
  params: { projectId: string },
): Promise<number> {
  const row = await conn
    .select({ cnt: sql<number>`count(*)`.mapWith(Number) })
    .from(datasets)
    .where(eq(datasets.projectId, params.projectId));

  return row[0]?.cnt ?? 0;
}

export async function countArenaMatchesByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string },
) {
  const rows = await conn
    .select({ value: count() })
    .from(arenaMatches)
    .where(eq(arenaMatches.benchmarkId, params.benchmarkId));

  return Number(rows[0]?.value ?? 0);
}

export async function getProjectDatasetCount(
  conn: Conn,
  projectId: string,
): Promise<number> {
  const rows = await conn
    .select({
      cnt: sql<number>`count(*)`.mapWith(Number),
    })
    .from(datasets)
    .where(eq(datasets.projectId, projectId));

  return rows[0]?.cnt ?? 0;
}

// dataset内のsample数を取得
export async function getDatasetSampleCount(
  conn: Conn,
  params: { datasetId: string },
): Promise<number> {
  const rows = await conn
    .select({ count: sql<number>`count(*)` })
    .from(samples)
    .where(eq(samples.datasetId, params.datasetId));

  return Number(rows[0]?.count ?? 0);
}

export async function getProjectSampleCount(
  conn: Conn,
  params: { projectId: string },
): Promise<number> {
  const rows = await conn
    .select({ count: sql<number>`count(*)` })
    .from(samples)
    .innerJoin(datasets, eq(samples.datasetId, datasets.id))
    .where(eq(datasets.projectId, params.projectId));

  return Number(rows[0]?.count ?? 0);
}

// dataset横断でproject内のbenchmark数を取得 (only completed benchmarks)
export async function getProjectBenchmarkCount(
  conn: Conn,
  params: { projectId: string },
): Promise<number> {
  const rows = await conn
    .select({ count: sql<number>`count(distinct ${benchmarks.id})` })
    .from(benchmarks)
    .innerJoin(datasets, eq(benchmarks.datasetId, datasets.id))
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .where(eq(datasets.projectId, params.projectId));

  return Number(rows[0]?.count ?? 0);
}

// dataset内のbenchmark数を取得 (only completed benchmarks)
export async function getDatasetBenchmarkCount(
  conn: Conn,
  params: { datasetId: string },
): Promise<number> {
  const rows = await conn
    .select({ count: sql<number>`count(distinct ${benchmarks.id})` })
    .from(benchmarks)
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .where(eq(benchmarks.datasetId, params.datasetId));

  return Number(rows[0]?.count ?? 0);
}

// 一覧用（offset pagination）: Dataset + counts を1クエリで返す
export async function findProjectDatasets(
  conn: Conn,
  params: {
    projectId: string;
    search?: string;
    limit?: number;
    offset?: number;
    orderBy?: "createdAt" | "name" | "sampleCount" | "benchmarkCount";
    orderDir?: "asc" | "desc";
  },
): Promise<
  (DatasetModel & {
    sampleCount: number;
    benchmarkCount: number;
  })[]
> {
  const {
    projectId,
    search,
    limit,
    offset,
    orderBy = "createdAt",
    orderDir = "desc",
  } = params;

  // samples count per dataset
  const sampleCounts = conn
    .select({
      datasetId: samples.datasetId,
      sampleCnt: sql<number>`count(*)`.mapWith(Number).as("sample_cnt"),
    })
    .from(samples)
    .groupBy(samples.datasetId)
    .as("sample_counts");

  // benchmarks count per dataset (only completed benchmarks with rating_steps)
  const benchmarkCounts = conn
    .select({
      datasetId: benchmarks.datasetId,
      benchmarkCnt: sql<number>`count(distinct ${benchmarks.id})`
        .mapWith(Number)
        .as("benchmark_cnt"),
    })
    .from(benchmarks)
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .groupBy(benchmarks.datasetId)
    .as("benchmark_counts");

  const sampleCountExpr = sql<number>`coalesce(${sampleCounts.sampleCnt}, 0)`
    .mapWith(Number)
    .as("sampleCount");

  const benchmarkCountExpr =
    sql<number>`coalesce(${benchmarkCounts.benchmarkCnt}, 0)`
      .mapWith(Number)
      .as("benchmarkCount");

  const dir = orderDir === "asc" ? asc : desc;

  const orderCol = (() => {
    switch (orderBy) {
      case "name":
        return datasets.name;
      case "sampleCount":
        return sampleCountExpr;
      case "benchmarkCount":
        return benchmarkCountExpr;
      case "createdAt":
        return datasets.createdAt;
      default:
        return datasets.createdAt;
    }
  })();

  let q = conn
    .select({
      id: datasets.id,
      projectId: datasets.projectId,
      name: datasets.name,
      createdAt: datasets.createdAt,
      sampleCount: sampleCountExpr,
      benchmarkCount: benchmarkCountExpr,
    })
    .from(datasets)
    .leftJoin(sampleCounts, eq(sampleCounts.datasetId, datasets.id))
    .leftJoin(benchmarkCounts, eq(benchmarkCounts.datasetId, datasets.id))
    .where(
      and(
        eq(datasets.projectId, projectId),
        search
          ? sql`lower(${datasets.name}) like ${"%" + search.toLowerCase() + "%"}`
          : undefined,
      ),
    )
    .orderBy(dir(orderCol), desc(datasets.id))
    .$dynamic();

  if (limit !== undefined) q = q.limit(limit);
  if (offset !== undefined) q = q.offset(offset);

  return q;
}

export async function findRecentEvaluatedDatasets(
  conn: Conn,
  params: { projectId: string; limit?: number },
): Promise<
  (DatasetModel & {
    sampleCount: number;
    benchmarkCount: number;
    lastEvaluatedAt: Date | null;
  })[]
> {
  const { projectId, limit = 6 } = params;

  // samples count per dataset
  const sampleCounts = conn
    .select({
      datasetId: samples.datasetId,
      sampleCnt: sql<number>`count(*)`.mapWith(Number).as("sample_cnt"),
    })
    .from(samples)
    .groupBy(samples.datasetId)
    .as("sample_counts");

  // benchmarks count per dataset (only completed benchmarks with rating_steps)
  const benchmarkCounts = conn
    .select({
      datasetId: benchmarks.datasetId,
      benchmarkCnt: sql<number>`count(distinct ${benchmarks.id})`
        .mapWith(Number)
        .as("benchmark_cnt"),
    })
    .from(benchmarks)
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .groupBy(benchmarks.datasetId)
    .as("benchmark_counts");

  // last evaluated time per dataset (max benchmark createdAt)
  const lastEvaluated = conn
    .select({
      datasetId: benchmarks.datasetId,
      lastEvaluatedAt: sql<Date>`max(${benchmarks.createdAt})`.as(
        "last_evaluated_at",
      ),
    })
    .from(benchmarks)
    .groupBy(benchmarks.datasetId)
    .as("last_evaluated");

  const sampleCountExpr = sql<number>`coalesce(${sampleCounts.sampleCnt}, 0)`
    .mapWith(Number)
    .as("sampleCount");

  const benchmarkCountExpr =
    sql<number>`coalesce(${benchmarkCounts.benchmarkCnt}, 0)`
      .mapWith(Number)
      .as("benchmarkCount");

  const lastEvaluatedExpr =
    sql<Date | null>`${lastEvaluated.lastEvaluatedAt}`.as("lastEvaluatedAt");

  let q = conn
    .select({
      id: datasets.id,
      projectId: datasets.projectId,
      name: datasets.name,
      createdAt: datasets.createdAt,
      sampleCount: sampleCountExpr,
      benchmarkCount: benchmarkCountExpr,
      lastEvaluatedAt: lastEvaluatedExpr,
    })
    .from(datasets)
    .leftJoin(sampleCounts, eq(sampleCounts.datasetId, datasets.id))
    .leftJoin(benchmarkCounts, eq(benchmarkCounts.datasetId, datasets.id))
    .leftJoin(lastEvaluated, eq(lastEvaluated.datasetId, datasets.id))
    .where(
      and(
        eq(datasets.projectId, projectId),
        sql`${lastEvaluated.lastEvaluatedAt} is not null`,
      ),
    )
    .orderBy(desc(lastEvaluated.lastEvaluatedAt), desc(datasets.id))
    .$dynamic();

  if (limit !== undefined) q = q.limit(limit);

  return q;
}

// ベンチマークIDで最終ステップを取得
export async function findFinalStepByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string },
): Promise<
  | {
      id: string;
      benchmarkId: string;
      step: number;
      stepData: RatingStepData;
      createdAt: Date;
    }
  | undefined
> {
  const items = await conn.query.ratingSteps.findMany({
    where: eq(ratingSteps.benchmarkId, params.benchmarkId),
    orderBy: (ratingSteps, { desc }) => [desc(ratingSteps.step)],
    limit: 1,
  });

  if (items.length === 0) return undefined;

  const item = items[0];
  return {
    ...item,
    stepData: RatingStepDataSchema.parse(item.stepData),
  };
}

// judgeモデル取得
export async function getJudgeModelsByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string },
): Promise<string[]> {
  const rows = await conn
    .select({
      judgeModels: sql<string[]>`
        COALESCE(
          ARRAY(
            SELECT jsonb_array_elements_text(${arenaMatches.matchData} -> 'judge_models')
          ),
          ARRAY[]::text[]
        )
      `,
    })
    .from(arenaMatches)
    .where(eq(arenaMatches.benchmarkId, params.benchmarkId))
    .orderBy(desc(arenaMatches.matchIndex))
    .limit(1);

  return rows[0]?.judgeModels ?? [];
}

// 一覧用（offset pagination）
export async function getProjectBenchmarks(
  conn: Conn,
  params: {
    projectId: string;
    datasetId?: string;
    limit?: number;
    offset?: number;
  },
) {
  const { projectId, datasetId, limit, offset } = params;

  const conditions = [eq(datasets.projectId, projectId)];
  if (datasetId) {
    conditions.push(eq(datasets.id, datasetId));
  }

  let q = conn
    .select({
      benchmark: benchmarks,
      datasetName: datasets.name,
      datasetId: datasets.id,
    })
    .from(benchmarks)
    .innerJoin(datasets, eq(benchmarks.datasetId, datasets.id))
    .where(and(...conditions))
    .orderBy(desc(benchmarks.createdAt))
    .$dynamic();

  if (limit !== undefined) q = q.limit(limit);
  if (offset !== undefined) q = q.offset(offset);

  return q;
}

// 一覧用（offset pagination）
export async function findProjectSamples(
  conn: Conn,
  params: {
    projectId: string;
    datasetId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<
  {
    id: string;
    info: SampleInfo;
    createdAt: Date;
  }[]
> {
  const { projectId, datasetId, limit, offset } = params;

  const where = and(
    eq(datasets.projectId, projectId),
    datasetId ? eq(samples.datasetId, datasetId) : undefined,
  );

  let q = conn
    .select({
      id: samples.id,
      info: samples.info,
      createdAt: samples.createdAt,
    })
    .from(samples)
    .innerJoin(datasets, eq(samples.datasetId, datasets.id))
    .where(where)
    .orderBy(desc(samples.createdAt), desc(samples.id))
    .$dynamic();

  if (limit !== undefined) q = q.limit(limit);
  if (offset !== undefined) q = q.offset(offset);

  const rows = await q;

  return rows.map((row) => {
    const parsed = SampleInfoSchema.safeParse(row.info);

    if (!parsed.success) {
      throw new Error(`Invalid SampleInfo: ${row.id}`);
    }

    return {
      ...row,
      info: parsed.data,
    };
  });
}

/**
 * 一覧用の軽量型（matchDataから必要な部分だけ抽出）
 */
export type ArenaMatchListData = {
  match_id: string;
  sample_id: string;
  model_a: string;
  model_b: string;
  winner: string;
  judge_models: string[];
  created_at: string;
};

export type ArenaMatchListItem = {
  id: string;
  matchIndex: number;
  sampleId: string;
  createdAt: Date;
  match: ArenaMatchListData;
};

/**
 * 詳細用の完全な型（右ペイン表示用）
 */
export type ArenaMatchWithDetail = {
  id: string;
  matchIndex: number;
  sampleId: string;
  createdAt: Date;

  match: ArenaMatchData;

  sampleInfo: SampleInfo;
  trialA: TrialResult | null;
  trialB: TrialResult | null;
};

/**
 * 一覧用の軽量クエリ（matchDataから必要な部分のみ抽出）
 */
export async function findArenaMatchesList(
  conn: Conn,
  params: {
    benchmarkId: string;
    limit?: number;
    offset?: number;
    search?: string; // SampleId or MatchIndex
  },
): Promise<ArenaMatchListItem[]> {
  const { benchmarkId, limit, offset, search } = params;

  let searchCondition: any | undefined;

  if (search && search.trim() !== "") {
    const trimmed = search.trim();
    const conditions: any[] = [];

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && Number.isInteger(numeric)) {
      conditions.push(eq(arenaMatches.matchIndex, numeric));
    }

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (uuidRegex.test(trimmed)) {
      conditions.push(eq(arenaMatches.sampleId, trimmed));
    }

    if (conditions.length === 1) searchCondition = conditions[0];
    else if (conditions.length > 1) searchCondition = or(...conditions);
  }

  const where = and(eq(arenaMatches.benchmarkId, benchmarkId), searchCondition);

  let q = conn
    .select({
      id: arenaMatches.id,
      matchIndex: arenaMatches.matchIndex,
      sampleId: arenaMatches.sampleId,
      createdAt: arenaMatches.createdAt,

      matchId: sql<string>`${arenaMatches.matchData}->>'match_id'`,
      modelA: sql<string>`${arenaMatches.matchData}->>'model_a'`,
      modelB: sql<string>`${arenaMatches.matchData}->>'model_b'`,
      winner: sql<string>`${arenaMatches.matchData}->>'winner'`,
      createdAtStr: sql<string>`${arenaMatches.matchData}->>'created_at'`,
      judgeModels: sql<string[]>`
        COALESCE(
          ARRAY(
            SELECT jsonb_array_elements_text(${arenaMatches.matchData} -> 'judge_models')
          ),
          ARRAY[]::text[]
        )
      `,
    })
    .from(arenaMatches)
    .where(where)
    .orderBy(desc(arenaMatches.createdAt), desc(arenaMatches.id))
    .$dynamic();

  if (limit !== undefined) q = q.limit(limit);
  if (offset !== undefined) q = q.offset(offset);

  const rows = await q;

  return rows.map((row) => {
    const match: ArenaMatchListData = {
      match_id: row.matchId,
      sample_id: row.sampleId,
      model_a: row.modelA,
      model_b: row.modelB,
      winner: row.winner,
      judge_models: row.judgeModels,
      created_at: row.createdAtStr,
    };

    return {
      id: row.id,
      matchIndex: row.matchIndex,
      sampleId: row.sampleId,
      createdAt: row.createdAt,
      match,
    };
  });
}

/**
 * 詳細取得用（1件のみ、全データ取得 + base64除去 + サイズ制限）
 */
export async function findArenaMatchDetail(
  conn: Conn,
  params: {
    matchId: string; // arenaMatches.id
  },
): Promise<ArenaMatchWithDetail | null> {
  // 1) arena_matchを取得
  const [row] = await conn
    .select({
      id: arenaMatches.id,
      benchmarkId: arenaMatches.benchmarkId,
      matchIndex: arenaMatches.matchIndex,
      sampleId: arenaMatches.sampleId,
      matchData: arenaMatches.matchData,
      createdAt: arenaMatches.createdAt,
    })
    .from(arenaMatches)
    .where(eq(arenaMatches.id, params.matchId))
    .limit(1);

  if (!row) return null;

  // 2) matchData を parse
  const matchParsed = ArenaMatchDataSchema.safeParse(row.matchData);
  if (!matchParsed.success) {
    throw new Error(`Invalid ArenaMatchData: ${row.id}`);
  }
  const match = matchParsed.data as any;

  // 2.5) judge_prompt を削除（base64 PDF を含む巨大フィールド、matches画面では不要）
  delete match.judge_prompt;

  // 3) judge_details.output を truncate（各judge 10KB）
  const MAX_JUDGE_OUTPUT_BYTES = 10_000;
  if (match.judge_details) {
    for (const [_, detail] of Object.entries(match.judge_details) as [
      string,
      any,
    ][]) {
      if (detail?.output && typeof detail.output === "string") {
        if (byteLen(detail.output) > MAX_JUDGE_OUTPUT_BYTES) {
          const approxChars = Math.max(
            0,
            Math.floor(MAX_JUDGE_OUTPUT_BYTES * 0.9),
          );
          detail.output = `${detail.output.slice(0, approxChars)}\n\n[... truncated]`;
        }
      }
    }
  }

  // 4) sampleInfo を取得
  const [sampleRow] = await conn
    .select({ id: samples.id, info: samples.info })
    .from(samples)
    .where(eq(samples.id, row.sampleId))
    .limit(1);

  if (!sampleRow) {
    throw new Error(`Sample not found: ${row.sampleId}`);
  }

  const sampleParsed = SampleInfoSchema.safeParse(sampleRow.info);
  if (!sampleParsed.success) {
    throw new Error(`Invalid SampleInfo: ${row.sampleId}`);
  }
  const sampleInfo = sampleParsed.data as any;

  // 5) SampleInfoから base64/data: を除去（PDFは file_ref のパス表示だけで十分）
  sanitizeSampleInfoInPlace(sampleInfo);

  // 5.5) usage_output を truncate（200KB）
  if (sampleInfo.usage_output != null) {
    sampleInfo.usage_output = truncateUnknownToString(
      sampleInfo.usage_output,
      200_000,
    );
  }

  // 6) trials を取得（benchmarkId で絞る）
  const trialRows = await conn
    .select({
      sampleId: trials.sampleId,
      modelName: trials.modelName,
      result: trials.result,
    })
    .from(trials)
    .where(
      and(
        eq(trials.benchmarkId, row.benchmarkId),
        eq(trials.sampleId, row.sampleId),
        inArray(trials.modelName, [match.model_a, match.model_b]),
      ),
    );

  const trialMap = new Map<string, TrialResult>();

  // ✅ string/object/array すべてを強制的に文字列化してサイズ制限
  const MAX_TRIAL_OUTPUT_BYTES = 300_000; // 300KB / trial

  for (const t of trialRows) {
    const p = TrialResultSchema.safeParse(t.result);
    if (!p.success) {
      throw new Error(`Invalid TrialResult: ${t.sampleId} ${t.modelName}`);
    }
    const trial = p.data as any;

    // output を必ず軽量化（base64を含む巨大object/arrayもここで落ちる）
    trial.output = truncateUnknownToString(
      trial.output,
      MAX_TRIAL_OUTPUT_BYTES,
    );

    trialMap.set(t.modelName, trial);
  }

  const trialA = trialMap.get(match.model_a) ?? null;
  const trialB = trialMap.get(match.model_b) ?? null;

  return {
    id: row.id,
    matchIndex: row.matchIndex,
    sampleId: row.sampleId,
    createdAt: row.createdAt,
    match,
    sampleInfo,
    trialA,
    trialB,
  };
}

// （下の関数群もあなたの元コード通りなら、そのまま残してOK）
export async function getModelStatsBySampleIds(
  conn: Conn,
  sampleIds: string[],
): Promise<
  Map<
    string,
    {
      avgCostUsd: number;
      avgLatencyMs: number;
      count: number;
    }
  >
> {
  if (sampleIds.length === 0) {
    return new Map();
  }

  const results = await conn
    .select({
      modelName: trials.modelName,
      avgCostUsd: sql<number>`AVG((result->>'cost_usd')::numeric)::double precision`,
      avgLatencyMs: sql<number>`AVG((result->>'latency_ms')::numeric)::double precision`,
      count: sql<number>`COUNT(*)::integer`,
    })
    .from(trials)
    .where(inArray(trials.sampleId, sampleIds))
    .groupBy(trials.modelName);

  const statsMap = new Map<
    string,
    { avgCostUsd: number; avgLatencyMs: number; count: number }
  >();
  for (const row of results) {
    statsMap.set(row.modelName, {
      avgCostUsd: row.avgCostUsd,
      avgLatencyMs: row.avgLatencyMs,
      count: row.count,
    });
  }

  return statsMap;
}

export async function getTrialResultsForCoverage(
  conn: Conn,
  trialPairs: Array<{ sampleId: string; modelName: string }>,
  benchmarkId?: string,
): Promise<
  Map<
    string,
    {
      skipped: boolean;
      reason?: string;
    }
  >
> {
  if (trialPairs.length === 0) {
    return new Map();
  }

  const pairConditions = trialPairs.map(({ sampleId, modelName }) =>
    and(eq(trials.sampleId, sampleId), eq(trials.modelName, modelName)),
  );

  const whereClause = benchmarkId
    ? and(eq(trials.benchmarkId, benchmarkId), or(...pairConditions))
    : or(...pairConditions);

  const results = await conn
    .select({
      sampleId: trials.sampleId,
      modelName: trials.modelName,
      result: trials.result,
    })
    .from(trials)
    .where(whereClause);

  const resultsMap = new Map<string, { skipped: boolean; reason?: string }>();

  for (const row of results) {
    const key = `${row.sampleId}:${row.modelName}`;
    const parsed = TrialResultSchema.parse(row.result);

    if (
      parsed.output &&
      typeof parsed.output === "object" &&
      !Array.isArray(parsed.output) &&
      "skipped" in parsed.output &&
      (parsed.output as any).skipped === true
    ) {
      resultsMap.set(key, {
        skipped: true,
        reason:
          "reason" in (parsed.output as any) &&
          typeof (parsed.output as any).reason === "string"
            ? (parsed.output as any).reason
            : undefined,
      });
    } else {
      resultsMap.set(key, { skipped: false });
    }
  }

  return resultsMap;
}

export type ProjectEvaluationsSummaryRow = {
  benchmarkId: string;
  benchmarkName: string;
  datasetId: string;
  datasetName: string;

  finalStepId: string;
  finalStepCreatedAt: Date;
  finalStepData: unknown;

  matchCount: number;
  judgeModels: string[];
};

export async function findProjectEvaluationsSummary(
  conn: Conn,
  params: {
    projectId: string;
    datasetId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ProjectEvaluationsSummaryRow[]> {
  const { projectId, datasetId, limit = 50, offset = 0 } = params;

  // benchmark_id ごとの match count
  const matchCounts = conn
    .select({
      benchmarkId: arenaMatches.benchmarkId,
      cnt: sql<number>`count(*)`.mapWith(Number).as("cnt"),
    })
    .from(arenaMatches)
    .groupBy(arenaMatches.benchmarkId)
    .as("match_counts");

  // LATERAL: benchmarkごとの最新rating_stepを1件取る（rn不要）
  const latestStep = sql`
    LATERAL (
      SELECT
        ${sql.identifier("rating_steps")}.id            AS id,
        ${sql.identifier("rating_steps")}.created_at   AS created_at,
        ${sql.identifier("rating_steps")}.step_data    AS step_data
      FROM ${sql.identifier("rating_steps")}
      WHERE ${sql.identifier("rating_steps")}.benchmark_id = ${benchmarks.id}
      ORDER BY ${sql.identifier("rating_steps")}.step DESC
      LIMIT 1
    ) AS latest_steps
  `;

  // LATERAL: benchmarkごとの最新arena_matchから judge_models を取る（rn不要）
  const latestMatch = sql`
    LATERAL (
      SELECT
        COALESCE(
          ARRAY(
            SELECT jsonb_array_elements_text(${arenaMatches.matchData} -> 'judge_models')
          ),
          ARRAY[]::text[]
        ) AS judge_models
      FROM ${sql.identifier("arena_matches")}
      WHERE ${sql.identifier("arena_matches")}.benchmark_id = ${benchmarks.id}
      ORDER BY ${sql.identifier("arena_matches")}.match_index DESC
      LIMIT 1
    ) AS latest_match
  `;

  const where = and(
    eq(datasets.projectId, projectId),
    datasetId ? eq(datasets.id, datasetId) : undefined,
  );

  /**
   * 注意：
   * - LATERAL の join 条件は "ON true" にします
   * - Drizzle の型が辛いので any で握っています（まず動かす）
   */
  const rows = await (conn as any)
    .select({
      benchmarkId: benchmarks.id,
      benchmarkName: benchmarks.name,
      datasetId: datasets.id,
      datasetName: datasets.name,

      finalStepId: sql<string>`latest_steps.id`,
      finalStepCreatedAt: sql<Date>`latest_steps.created_at`,
      finalStepData: sql<unknown>`latest_steps.step_data`,

      matchCount: sql<number>`coalesce(${matchCounts.cnt}, 0)`
        .mapWith(Number)
        .as("match_count"),

      judgeModels: sql<
        string[]
      >`coalesce(latest_match.judge_models, ARRAY[]::text[])`.as(
        "judge_models",
      ),
    })
    .from(benchmarks)
    .innerJoin(datasets, eq(benchmarks.datasetId, datasets.id))
    // 最新ステップが無いベンチマークは「評価として出したくない」ので inner join
    .innerJoin(latestStep, sql`true`)
    .leftJoin(matchCounts, eq(matchCounts.benchmarkId, benchmarks.id))
    .leftJoin(latestMatch, sql`true`)
    .where(where)
    .orderBy(desc(benchmarks.createdAt), desc(benchmarks.id))
    .limit(limit)
    .offset(offset);

  return rows.map((r: any) => ({
    benchmarkId: r.benchmarkId,
    benchmarkName: r.benchmarkName,
    datasetId: r.datasetId,
    datasetName: r.datasetName,

    finalStepId: r.finalStepId,
    finalStepCreatedAt: r.finalStepCreatedAt,
    finalStepData: r.finalStepData,

    matchCount: Number(r.matchCount ?? 0),
    judgeModels: Array.isArray(r.judgeModels) ? r.judgeModels : [],
  }));
}

/**
 * Summary用: benchmark と datasetName を1発で取る
 */
export async function findBenchmarkByIdWithDatasetName(
  conn: Conn,
  params: { benchmarkId: string },
): Promise<{
  id: string;
  datasetId: string;
  datasetName: string;
  name: string;
  config: unknown;
  info: unknown;
  createdAt: Date;
} | null> {
  const [row] = await conn
    .select({
      id: benchmarks.id,
      datasetId: benchmarks.datasetId,
      datasetName: datasets.name,
      name: benchmarks.name,
      config: benchmarks.config,
      info: benchmarks.info,
      createdAt: benchmarks.createdAt,
    })
    .from(benchmarks)
    .innerJoin(datasets, eq(datasets.id, benchmarks.datasetId))
    .where(eq(benchmarks.id, params.benchmarkId))
    .limit(1);

  return row ?? null;
}

/**
 * Summary用 ratingHistory（軽量）
 * - stepData の rankings から rating だけを抽出して返す
 * - zod parse を避ける
 */
export async function findRatingStepsForHistoryLight(
  conn: Conn,
  params: { benchmarkId: string; limit: number },
): Promise<
  Array<{
    step: number;
    createdAt: Date;
    stepData: RatingStepData; // ★これを返す
  }>
> {
  const rows = await conn
    .select({
      step: ratingSteps.step,
      createdAt: ratingSteps.createdAt,
      stepData: ratingSteps.stepData,
    })
    .from(ratingSteps)
    .where(eq(ratingSteps.benchmarkId, params.benchmarkId))
    .orderBy(desc(ratingSteps.step))
    .limit(params.limit);

  // descで取ったので、チャートのX軸が昇順なら反転
  const normalized = rows
    .map((r) => ({
      step: r.step,
      createdAt: r.createdAt,
      stepData: RatingStepDataSchema.parse(r.stepData),
    }))
    .reverse();

  return normalized;
}

/**
 * Summary用: modelStats をベンチマーク単位でDB集計
 * - sampleIds をアプリで列挙しない
 * - arena_matches 経由で trials を絞る
 */
export async function getModelStatsByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string },
): Promise<
  Record<
    string,
    {
      avgCostUsd: number;
      avgLatencyMs: number;
      count: number;
    }
  >
> {
  const rows = await conn.execute(sql`
    WITH pairs AS (
      SELECT
        am.sample_id AS sample_id,
        (am.match_data->>'model_a') AS model_name
      FROM arena_matches am
      WHERE am.benchmark_id = ${params.benchmarkId}

      UNION ALL

      SELECT
        am.sample_id AS sample_id,
        (am.match_data->>'model_b') AS model_name
      FROM arena_matches am
      WHERE am.benchmark_id = ${params.benchmarkId}
    )
    SELECT
      t.model_name AS model_name,
      AVG((t.result->>'cost_usd')::numeric)::double precision AS avg_cost_usd,
      AVG((t.result->>'latency_ms')::numeric)::double precision AS avg_latency_ms,
      COUNT(*)::integer AS cnt
    FROM pairs p
    JOIN trials t
      ON t.sample_id = p.sample_id
     AND t.model_name = p.model_name
     AND t.benchmark_id = ${params.benchmarkId}
    GROUP BY t.model_name
  `);

  // drizzle execute の返りは driver 次第で rows 形式が異なるので、最低限の変換をする
  const out: Record<
    string,
    { avgCostUsd: number; avgLatencyMs: number; count: number }
  > = {};
  const resultRows: any[] = (rows as any).rows ?? (rows as any);
  for (const r of resultRows) {
    const model = String(r.model_name);
    out[model] = {
      avgCostUsd: Number(r.avg_cost_usd ?? 0),
      avgLatencyMs: Number(r.avg_latency_ms ?? 0),
      count: Number(r.cnt ?? 0),
    };
  }
  return out;
}

/**
 * Summary用: セッション coverage をDBで一発集計
 * ルール:
 * - trialA, trialB 両方存在し、どちらも skipped=false => completed
 * - どちらか skipped=true => skipped (reasonは skipped 側をカウント)
 *
 * 注意:
 * - trials が無い試合は totalMatches には含める（= matchはあるが未実行/欠損）
 *   既存の calculateCoverage は「無い場合 continue」だったので仕様を合わせたければ
 *   totalMatches の定義を変える/未実行を otherError 扱いにするなど調整可能。
 *   ここでは UI 的に分かりやすいよう「matchは全件 total」にしています。
 */
export async function getCoverageByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string },
): Promise<{
  completedMatches: number;
  skippedMatches: number;
  totalMatches: number;
  sessionCoverage: number;
  failureBreakdown: {
    unsupportedInput: number;
    contextOverflow: number;
    otherError: number;
  };
}> {
  const res = await conn.execute(sql`
    WITH m AS (
      SELECT
        am.id AS match_id,
        am.sample_id AS sample_id,
        (am.match_data->>'model_a') AS model_a,
        (am.match_data->>'model_b') AS model_b
      FROM arena_matches am
      WHERE am.benchmark_id = ${params.benchmarkId}
    ),
    j AS (
      SELECT
        m.match_id,
        -- trialA
        (ta.result->'output'->>'skipped')::boolean AS a_skipped,
        (ta.result->'output'->>'reason') AS a_reason,
        -- trialB
        (tb.result->'output'->>'skipped')::boolean AS b_skipped,
        (tb.result->'output'->>'reason') AS b_reason
      FROM m
      LEFT JOIN trials ta
        ON ta.sample_id = m.sample_id AND ta.model_name = m.model_a AND ta.benchmark_id = ${params.benchmarkId}
      LEFT JOIN trials tb
        ON tb.sample_id = m.sample_id AND tb.model_name = m.model_b AND tb.benchmark_id = ${params.benchmarkId}
    )
    SELECT
      COUNT(*)::integer AS total_matches,

      SUM(
        CASE
          WHEN COALESCE(a_skipped,false) = false
           AND COALESCE(b_skipped,false) = false
           AND a_skipped IS NOT NULL
           AND b_skipped IS NOT NULL
          THEN 1 ELSE 0
        END
      )::integer AS completed_matches,

      SUM(
        CASE
          WHEN COALESCE(a_skipped,false) = true OR COALESCE(b_skipped,false) = true
          THEN 1 ELSE 0
        END
      )::integer AS skipped_matches,

      SUM(
        CASE
          WHEN (COALESCE(a_skipped,false) = true AND a_reason = 'UNSUPPORTED_INPUT')
            OR (COALESCE(b_skipped,false) = true AND b_reason = 'UNSUPPORTED_INPUT')
          THEN 1 ELSE 0
        END
      )::integer AS unsupported_input,

      SUM(
        CASE
          WHEN (COALESCE(a_skipped,false) = true AND a_reason = 'CONTEXT_OVERFLOW')
            OR (COALESCE(b_skipped,false) = true AND b_reason = 'CONTEXT_OVERFLOW')
          THEN 1 ELSE 0
        END
      )::integer AS context_overflow,

      SUM(
        CASE
          WHEN (COALESCE(a_skipped,false) = true AND (a_reason IS NULL OR (a_reason <> 'UNSUPPORTED_INPUT' AND a_reason <> 'CONTEXT_OVERFLOW')))
            OR (COALESCE(b_skipped,false) = true AND (b_reason IS NULL OR (b_reason <> 'UNSUPPORTED_INPUT' AND b_reason <> 'CONTEXT_OVERFLOW')))
          THEN 1 ELSE 0
        END
      )::integer AS other_error
    FROM j
  `);

  const rows: any[] = (res as any).rows ?? (res as any);
  const r = rows[0] ?? {};

  const totalMatches = Number(r.total_matches ?? 0);
  const completedMatches = Number(r.completed_matches ?? 0);
  const skippedMatches = Number(r.skipped_matches ?? 0);

  const sessionCoverage =
    totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 100;

  return {
    completedMatches,
    skippedMatches,
    totalMatches,
    sessionCoverage,
    failureBreakdown: {
      unsupportedInput: Number(r.unsupported_input ?? 0),
      contextOverflow: Number(r.context_overflow ?? 0),
      otherError: Number(r.other_error ?? 0),
    },
  };
}

/**
 * Summary用: modelCoverage をDB集計で一発
 * - (sample, model) のペアをアプリ側で列挙しない
 * - config.models.trials のモデルだけ返す（存在しないモデルも0で埋める）
 */
export async function getModelCoverageByBenchmarkId(
  conn: Conn,
  params: { benchmarkId: string; models: string[] },
): Promise<
  Record<
    string,
    {
      totalTrials: number;
      completedTrials: number;
      skippedTrials: number;
      modelCoverage: number;
      failureBreakdown: {
        unsupportedInput: number;
        contextOverflow: number;
        otherError: number;
      };
    }
  >
> {
  const res = await conn.execute(sql`
    WITH pairs AS (
      SELECT DISTINCT
        am.sample_id AS sample_id,
        (am.match_data->>'model_a') AS model_name
      FROM arena_matches am
      WHERE am.benchmark_id = ${params.benchmarkId}

      UNION

      SELECT DISTINCT
        am.sample_id AS sample_id,
        (am.match_data->>'model_b') AS model_name
      FROM arena_matches am
      WHERE am.benchmark_id = ${params.benchmarkId}
    ),
    joined AS (
      SELECT
        p.model_name,
        (t.result->'output'->>'skipped')::boolean AS skipped,
        (t.result->'output'->>'reason') AS reason
      FROM pairs p
      LEFT JOIN trials t
        ON t.sample_id = p.sample_id AND t.model_name = p.model_name AND t.benchmark_id = ${params.benchmarkId}
    )
    SELECT
      model_name,
      COUNT(*)::integer AS total_trials,
      SUM(CASE WHEN COALESCE(skipped,false)=false AND skipped IS NOT NULL THEN 1 ELSE 0 END)::integer AS completed_trials,
      SUM(CASE WHEN COALESCE(skipped,false)=true THEN 1 ELSE 0 END)::integer AS skipped_trials,
      SUM(CASE WHEN COALESCE(skipped,false)=true AND reason='UNSUPPORTED_INPUT' THEN 1 ELSE 0 END)::integer AS unsupported_input,
      SUM(CASE WHEN COALESCE(skipped,false)=true AND reason='CONTEXT_OVERFLOW' THEN 1 ELSE 0 END)::integer AS context_overflow,
      SUM(CASE WHEN COALESCE(skipped,false)=true AND (reason IS NULL OR (reason <> 'UNSUPPORTED_INPUT' AND reason <> 'CONTEXT_OVERFLOW')) THEN 1 ELSE 0 END)::integer AS other_error
    FROM joined
    GROUP BY model_name
  `);

  const rows: any[] = (res as any).rows ?? (res as any);

  // DB結果 -> map
  const tmp: Record<string, any> = {};
  for (const r of rows) {
    const model = String(r.model_name);
    const total = Number(r.total_trials ?? 0);
    const completed = Number(r.completed_trials ?? 0);
    const skipped = Number(r.skipped_trials ?? 0);

    tmp[model] = {
      totalTrials: total,
      completedTrials: completed,
      skippedTrials: skipped,
      modelCoverage: total > 0 ? (completed / total) * 100 : 100,
      failureBreakdown: {
        unsupportedInput: Number(r.unsupported_input ?? 0),
        contextOverflow: Number(r.context_overflow ?? 0),
        otherError: Number(r.other_error ?? 0),
      },
    };
  }

  // configにあるモデルを全部返す（無いものは0埋め）
  const out: Record<string, any> = {};
  for (const model of params.models) {
    out[model] =
      tmp[model] ??
      ({
        totalTrials: 0,
        completedTrials: 0,
        skippedTrials: 0,
        modelCoverage: 100,
        failureBreakdown: {
          unsupportedInput: 0,
          contextOverflow: 0,
          otherError: 0,
        },
      } as const);
  }

  return out;
}
