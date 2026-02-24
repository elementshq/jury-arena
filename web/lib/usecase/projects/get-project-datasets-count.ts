import { db } from "@/lib/db/core";
import { countProjectDatasets } from "@/lib/db/queries/queries";

export async function getProjectDatasetsCount(params: { projectId: string }) {
  return countProjectDatasets(db, params);
}
