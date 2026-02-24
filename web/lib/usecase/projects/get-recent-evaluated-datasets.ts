import { db } from "@/lib/db/core";
import { findRecentEvaluatedDatasets } from "@/lib/db/queries/queries";

export async function getRecentEvaluatedDatasets(params: {
	projectId: string;
	limit?: number;
}) {
	const { projectId, limit } = params;
	return findRecentEvaluatedDatasets(db, { projectId, limit });
}
