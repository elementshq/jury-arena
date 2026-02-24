import { db } from "@/lib/db/core";
import {
  findProjectSamples,
  getDatasetSampleCount,
  getProjectSampleCount,
} from "@/lib/db/queries/queries";

export type GetProjectSamplesParams = {
  projectId: string;
  datasetId?: string;
  limit?: number;
  offset?: number;
};

export async function getProjectSamples(params: GetProjectSamplesParams) {
  const { projectId, datasetId, limit, offset } = params;

  const [samples, total] = await Promise.all([
    findProjectSamples(db, { projectId, datasetId, limit, offset }),
    datasetId
      ? getDatasetSampleCount(db, { datasetId })
      : getProjectSampleCount(db, { projectId }),
  ]);

  return { samples, page: { limit, offset }, total };
}
