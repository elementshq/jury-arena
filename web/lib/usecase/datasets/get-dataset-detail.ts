import { notFound } from "next/navigation";
import { db } from "@/lib/db/core";
import {
  countArenaMatchesByBenchmarkId,
  findFinalStepByBenchmarkId,
  getDatasetBenchmarkCount,
  getDatasetSampleCount,
  getJudgeModelsByBenchmarkId,
} from "@/lib/db/queries/queries";
import { OrderDirection } from "@/lib/db/query-options";
import { BenchmarkRepository } from "@/lib/db/repository/benchmark-repository";
import {
  type DatasetModel,
  DatasetRepository,
} from "@/lib/db/repository/dataset-repository";
import { benchmarks as benchmarkTable } from "@/lib/db/schema";
import {
  type RatingStepData,
  RatingStepDataSchema,
} from "@/lib/db/types/jsonb";

export type DatasetDetailRecentEvaluation = {
  id: string; // ratingSteps.id を入れる想定
  createdAt: Date; // finalStep.createdAt
  comparison: Array<{ model: string; rating: number; games: number }>;
  matchCount: number;
  judgeModels: string[];
};

export type DatasetDetail = {
  dataset: DatasetModel;
  sampleCount: number;
  benchmarkCount: number;
  recentEvaluations: DatasetDetailRecentEvaluation[];
};

function toComparison(stepData: RatingStepData): {
  comparison: DatasetDetailRecentEvaluation["comparison"];
} {
  const step = RatingStepDataSchema.parse(stepData);

  const comparison = Object.entries(step.rankings).map(([model, v]) => ({
    model,
    rating: Number(v.rating ?? 0),
    games: Number(v.games ?? 0),
  }));

  return { comparison };
}

export async function getDatasetDetail(params: {
  projectId: string;
  datasetId: string;
}): Promise<DatasetDetail> {
  const { datasetId } = params;

  const datasetRepository = new DatasetRepository(db);
  const benchmarkRepository = new BenchmarkRepository(db);

  const [dataset, sampleCount, benchmarkCount, recentBenchmarks] =
    await Promise.all([
      datasetRepository.find({ id: datasetId }),
      getDatasetSampleCount(db, { datasetId }),
      getDatasetBenchmarkCount(db, { datasetId }),
      benchmarkRepository.filter({
        where: { datasetId },
        orderBy: {
          key: benchmarkTable.createdAt,
          direction: OrderDirection.Desc,
        },
        limit: 5,
      }),
    ]);

  if (!dataset) notFound();

  // benchmarkごとに finalStep と judgeModels を並列取得
  const recentEvaluations = (
    await Promise.all(
      recentBenchmarks.map(async (b) => {
        const [finalStep, judgeModels, matchCount] = await Promise.all([
          findFinalStepByBenchmarkId(db, { benchmarkId: b.id }),
          getJudgeModelsByBenchmarkId(db, { benchmarkId: b.id }),
          countArenaMatchesByBenchmarkId(db, { benchmarkId: b.id }),
        ]);

        if (!finalStep) return undefined; // step未生成のbenchmarkは表示しない方針

        const { comparison } = toComparison(finalStep.stepData);

        return {
          id: b.id,
          createdAt: finalStep.createdAt,
          comparison,
          matchCount,
          judgeModels,
        } satisfies DatasetDetailRecentEvaluation;
      }),
    )
  ).filter((x): x is DatasetDetailRecentEvaluation => x !== undefined);

  return {
    dataset,
    sampleCount,
    benchmarkCount,
    recentEvaluations,
  };
}
