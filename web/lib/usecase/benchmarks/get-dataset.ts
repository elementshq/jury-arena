import { db } from "@/lib/db/core";
import {
  type DatasetModel,
  DatasetRepository,
} from "@/lib/db/repository/dataset-repository";

export type GetDatasetParams = {
  datasetId: string;
};

export type DatasetView = DatasetModel;

export async function getDataset(
  params: GetDatasetParams,
): Promise<DatasetView | null> {
  const { datasetId } = params;

  const datasetRepository = new DatasetRepository(db);
  const dataset = await datasetRepository.find({ id: datasetId });

  return dataset;
}
