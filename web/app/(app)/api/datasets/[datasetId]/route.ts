import { ZodError } from "zod";
import { DatasetSchema } from "@/lib/db/repository/dataset-repository";
import { deleteDataset } from "@/lib/usecase/datasets/delete-dataset";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ datasetId: string }> },
) {
  try {
    const { datasetId } = await ctx.params;
    const id = DatasetSchema.shape.id.parse(datasetId);
    await deleteDataset({ datasetId: id });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "validation error", issues: err.issues },
        { status: 400 },
      );
    }
    console.error(err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
