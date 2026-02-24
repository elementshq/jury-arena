import { db } from "@/lib/db/core";
import { findProjectEvaluationsSummary } from "@/lib/db/queries/queries";
import {
  type RatingStepData,
  RatingStepDataSchema,
} from "@/lib/db/types/jsonb";

export type DatasetDetailRecentEvaluation = {
  id: string; // benchmark.id
  createdAt: Date; // final step createdAt
  comparison: Array<{ model: string; rating: number; games: number }>;
  matchCount: number;
  judgeModels: string[];
};

export type GetProjectEvaluationsParams = {
  projectId: string;
  datasetId?: string;
  limit?: number;
  offset?: number;
};

function toComparison(
  stepData: unknown,
): DatasetDetailRecentEvaluation["comparison"] {
  const step = RatingStepDataSchema.parse(stepData as RatingStepData);

  return Object.entries(step.rankings).map(([model, v]) => ({
    model,
    rating: Number(v.rating ?? 0),
    games: Number(v.games ?? 0),
  }));
}

export async function getProjectEvaluations(
  params: GetProjectEvaluationsParams,
) {
  const { projectId, datasetId, limit = 50, offset = 0 } = params;

  const rows = await findProjectEvaluationsSummary(db, {
    projectId,
    datasetId,
    limit,
    offset,
  });

  return rows.map((r) => ({
    id: r.benchmarkId,
    createdAt: r.finalStepCreatedAt,
    comparison: toComparison(r.finalStepData),
    matchCount: r.matchCount,
    judgeModels: r.judgeModels,
  }));
}
