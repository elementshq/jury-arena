import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";

export type GetDatasetParams = {
  datasetId: string;
};

export async function getDataset(params: GetDatasetParams) {
  const { datasetId } = params;
  const datasetRepository = new DatasetRepository(db);
  const dataset = await datasetRepository.find({ id: datasetId });

  if (!dataset) {
    return null;
  }

  return dataset;
}
