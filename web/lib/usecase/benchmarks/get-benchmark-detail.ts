import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/core";
import {
  findBenchmarkByIdWithDatasetName,
  findFinalStepByBenchmarkId,
  findRatingStepsForHistoryLight,
  getModelStatsByBenchmarkId,
  getTrialResultsForCoverage,
} from "@/lib/db/queries/queries";
import { arenaMatches, trials } from "@/lib/db/schema";
import {
  type ArenaMatchData,
  type BenchmarkConfig,
  BenchmarkConfigSchema,
  type BenchmarkInfo,
  BenchmarkInfoSchema,
  type RatingStepData,
  RatingStepDataSchema,
} from "@/lib/db/types/jsonb";

export type CoverageInfo = {
  completedMatches: number;
  skippedMatches: number;
  totalMatches: number;
  sessionCoverage: number; // percentage
  failureBreakdown: {
    unsupportedInput: number;
    contextOverflow: number;
    otherError: number;
  };
};

export type ModelCoverageInfo = {
  totalTrials: number;
  completedTrials: number;
  skippedTrials: number;
  modelCoverage: number; // percentage
  failureBreakdown: {
    unsupportedInput: number;
    contextOverflow: number;
    otherError: number;
  };
};

export type GetBenchmarkDetailParams = {
  benchmarkId: string;
};

type MatchPair = {
  sampleId: string;
  modelA: string;
  modelB: string;
};

/**
 * arena_matches から、coverage に必要な最小情報だけ抜く（matchData丸ごと取らない）
 */
async function getMatchPairsByBenchmarkId(
  benchmarkId: string,
): Promise<MatchPair[]> {
  const rows = await db
    .select({
      sampleId: arenaMatches.sampleId,
      modelA: sql<string>`${arenaMatches.matchData}->>'model_a'`,
      modelB: sql<string>`${arenaMatches.matchData}->>'model_b'`,
    })
    .from(arenaMatches)
    .where(eq(arenaMatches.benchmarkId, benchmarkId));

  // model_a / model_b が null/空の不正データは落とす（念のため）
  return rows
    .map((r) => ({
      sampleId: r.sampleId,
      modelA: (r.modelA ?? "").trim(),
      modelB: (r.modelB ?? "").trim(),
    }))
    .filter((r) => r.sampleId && r.modelA && r.modelB);
}

async function calculateCoverageFromPairs(
  pairs: MatchPair[],
  benchmarkId: string,
): Promise<CoverageInfo> {
  const totalMatches = pairs.length;

  let completedMatches = 0;
  let skippedMatches = 0;

  const failureBreakdown = {
    unsupportedInput: 0,
    contextOverflow: 0,
    otherError: 0,
  };

  // match ごとに 2 trial
  const trialPairs: Array<{ sampleId: string; modelName: string }> = [];
  for (const p of pairs) {
    trialPairs.push(
      { sampleId: p.sampleId, modelName: p.modelA },
      { sampleId: p.sampleId, modelName: p.modelB },
    );
  }

  const trialResults = await getTrialResultsForCoverage(db, trialPairs, benchmarkId);

  for (const p of pairs) {
    const a = trialResults.get(`${p.sampleId}:${p.modelA}`);
    const b = trialResults.get(`${p.sampleId}:${p.modelB}`);

    // まだ trial が無い/未保存なら、coverage計算対象外（= completed/skipped に入れない）
    // ※ここを skipped 扱いにすると 0% になるので注意
    if (!a || !b) continue;

    if (a.skipped || b.skipped) {
      skippedMatches++;
      const reason = a.skipped ? a.reason : b.reason;

      switch (reason) {
        case "UNSUPPORTED_INPUT":
          failureBreakdown.unsupportedInput++;
          break;
        case "CONTEXT_OVERFLOW":
          failureBreakdown.contextOverflow++;
          break;
        default:
          failureBreakdown.otherError++;
          break;
      }
    } else {
      completedMatches++;
    }
  }

  const sessionCoverage =
    totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 100;

  return {
    completedMatches,
    skippedMatches,
    totalMatches,
    sessionCoverage,
    failureBreakdown,
  };
}

async function calculateModelCoverageFromPairs(
  pairs: MatchPair[],
  models: string[],
  benchmarkId: string,
): Promise<Record<string, ModelCoverageInfo>> {
  const modelCoverageMap: Record<string, ModelCoverageInfo> = {};

  for (const m of models) {
    modelCoverageMap[m] = {
      totalTrials: 0,
      completedTrials: 0,
      skippedTrials: 0,
      modelCoverage: 100,
      failureBreakdown: {
        unsupportedInput: 0,
        contextOverflow: 0,
        otherError: 0,
      },
    };
  }

  // unique (sampleId, model)
  const trialPairsArray: Array<{ sampleId: string; modelName: string }> = [];
  const seen = new Set<string>();

  for (const p of pairs) {
    const keyA = `${p.sampleId}:${p.modelA}`;
    const keyB = `${p.sampleId}:${p.modelB}`;
    if (!seen.has(keyA)) {
      seen.add(keyA);
      trialPairsArray.push({ sampleId: p.sampleId, modelName: p.modelA });
    }
    if (!seen.has(keyB)) {
      seen.add(keyB);
      trialPairsArray.push({ sampleId: p.sampleId, modelName: p.modelB });
    }
  }

  const trialResults = await getTrialResultsForCoverage(db, trialPairsArray, benchmarkId);

  for (const pair of trialPairsArray) {
    const key = `${pair.sampleId}:${pair.modelName}`;
    const coverage = modelCoverageMap[pair.modelName];
    if (!coverage) continue;

    const tr = trialResults.get(key);
    // trial が無いなら集計から除外（0%化を防ぐ）
    if (!tr) continue;

    coverage.totalTrials++;

    if (tr.skipped) {
      coverage.skippedTrials++;
      switch (tr.reason) {
        case "UNSUPPORTED_INPUT":
          coverage.failureBreakdown.unsupportedInput++;
          break;
        case "CONTEXT_OVERFLOW":
          coverage.failureBreakdown.contextOverflow++;
          break;
        default:
          coverage.failureBreakdown.otherError++;
          break;
      }
    } else {
      coverage.completedTrials++;
    }
  }

  for (const m of models) {
    const c = modelCoverageMap[m];
    c.modelCoverage =
      c.totalTrials > 0 ? (c.completedTrials / c.totalTrials) * 100 : 100;
  }

  return modelCoverageMap;
}

/**
 * Summaryページの最重要API。
 * ここが遅いとページ全体が遅いので、cache + DB最小取得で高速化する。
 */
export function getBenchmarkDetail(params: GetBenchmarkDetailParams) {
  return unstable_cache(
    async (): Promise<{
      benchmark: {
        id: string;
        datasetId: string;
        datasetName: string;
        name: string;
        config: BenchmarkConfig;
        info: BenchmarkInfo;
        createdAt: string;
      };
      // ★ ここは UI 互換のため RatingStepData[] に戻す（チャートがこれを前提にしているはず）
      ratingHistory: RatingStepData[];
      modelStats: Record<string, any>;
      finalStep: RatingStepData | null;
      baselineModel: string;
      matcheCount: number;
      coverage: CoverageInfo;
      modelCoverage: Record<string, ModelCoverageInfo>;
    }> => {
      const { benchmarkId } = params;

      // Benchmark + DatasetName をまとめて取得
      const benchmarkRow = await findBenchmarkByIdWithDatasetName(db, {
        benchmarkId,
      });
      if (!benchmarkRow) throw new Error("benchmark not found");

      const config = BenchmarkConfigSchema.parse(benchmarkRow.config);
      const info = BenchmarkInfoSchema.parse(benchmarkRow.info);
      const allModels = config.models.trials;

      const HISTORY_STEPS = 300;

      // ここまでは DB 集計/軽量 fetch を並列
      const [finalStepRow, ratingHistoryLight, modelStatsRaw, pairs] =
        await Promise.all([
          findFinalStepByBenchmarkId(db, { benchmarkId }),
          findRatingStepsForHistoryLight(db, {
            benchmarkId,
            limit: HISTORY_STEPS,
          }),
          getModelStatsByBenchmarkId(db, { benchmarkId }),
          getMatchPairsByBenchmarkId(benchmarkId),
        ]);

      // ratingHistory は UI 互換のため RatingStepData 形式へ
      // （findRatingStepsForHistoryLight が stepData を返している前提）
      const ratingHistory: RatingStepData[] = ratingHistoryLight.map((r) => {
        // r.stepData がある想定。無い場合は r.rankings から組むように直してね。
        if ("stepData" in r) {
          return RatingStepDataSchema.parse((r as any).stepData);
        }
        // fallback（もし light 側が独自 shape の場合）
        return {
          step: (r as any).step,
          rankings: (r as any).rankings,
          stats: (r as any).stats ?? {},
          cost: (r as any).cost ?? { judge_total_usd: 0, trial_total_usd: 0 },
          created_at:
            (r as any).createdAt instanceof Date
              ? (r as any).createdAt.toISOString()
              : String((r as any).createdAt ?? ""),
        } as RatingStepData;
      });

      // finalStep parse
      let finalStep: RatingStepData | null = null;
      if (finalStepRow) {
        finalStep = RatingStepDataSchema.parse(finalStepRow.stepData);
      }

      // matchCount（pairs の数で十分。count(*) 叩かない）
      const matcheCount = pairs.length;

      // Coverage は正しいロジックで復元（軽量データで）
      const [coverage, modelCoverage] = await Promise.all([
        calculateCoverageFromPairs(pairs, benchmarkId),
        calculateModelCoverageFromPairs(pairs, allModels, benchmarkId),
      ]);

      // modelStats（finalStep がある場合のみ）
      const modelStats: Record<string, any> = {};
      if (finalStep) {
        for (const [model, data] of Object.entries(finalStep.rankings)) {
          const stats = (modelStatsRaw as any)[model];
          const avgCostUsd = stats?.avgCostUsd ?? 0;
          const avgLatencyMs = stats?.avgLatencyMs ?? 0;

          modelStats[model] = {
            rating: Number((data as any).rating ?? 0),
            games: Number((data as any).games ?? 0),
            cost: Number(avgCostUsd) * 1000,
            speed: Number(avgLatencyMs) / 1000,
          };
        }
      }

      return {
        benchmark: {
          id: benchmarkRow.id,
          datasetId: benchmarkRow.datasetId,
          datasetName: benchmarkRow.datasetName,
          name: benchmarkRow.name,
          config,
          info,
          createdAt: benchmarkRow.createdAt.toISOString(),
        },
        ratingHistory,
        modelStats,
        finalStep,
        baselineModel: config.baseline_model,
        matcheCount,
        coverage,
        modelCoverage,
      };
    },
    ["benchmark-detail", params.benchmarkId],
    { revalidate: 60 },
  )();
}
