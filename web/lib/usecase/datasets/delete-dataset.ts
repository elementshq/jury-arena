import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";

export type DeleteDatasetParams = {
  datasetId: string;
};

export async function deleteDataset(
  params: DeleteDatasetParams,
): Promise<void> {
  const { datasetId } = params;

  const datasetRepository = new DatasetRepository(db);
  await datasetRepository.delete({ id: datasetId });
}
