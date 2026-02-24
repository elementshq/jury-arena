import { db } from "@/lib/db/core";
import { findProjectDatasets } from "@/lib/db/queries/queries";

export type GetProjectDatasetsParams = {
  projectId: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "name" | "sampleCount" | "benchmarkCount";
  orderDir?: "asc" | "desc";
};

export async function getProjectDatasets(params: GetProjectDatasetsParams) {
  const { projectId, search, limit, offset, orderBy, orderDir } = params;

  const datasets = await findProjectDatasets(db, {
    projectId,
    search,
    limit,
    offset,
    orderBy: orderBy ?? "createdAt",
    orderDir: orderDir ?? "desc",
  });

  return datasets;
}
