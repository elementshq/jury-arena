"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/core";
import { datasets } from "@/lib/db/schema";

const Schema = z.object({
  projectId: z.uuid(),
  datasetId: z.uuid(),
  name: z.string().trim().min(1, "name is required").max(80, "name too long"),
});

export async function updateDatasetName(input: {
  projectId: string;
  datasetId: string;
  name: string;
}) {
  const { projectId, datasetId, name } = Schema.parse(input);

  const [updated] = await db
    .update(datasets)
    .set({ name })
    .where(and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)))
    .returning();

  if (!updated) throw new Error("dataset not found");

  revalidatePath(`/projects/${projectId}/datasets/${datasetId}`);

  return { ok: true as const, name: updated.name };
}
