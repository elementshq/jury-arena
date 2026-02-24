import { z } from "zod";
import {
  DatasetSourceKind,
  DatasetTemplateKey,
} from "@/lib/templates/dataset-source";
import { createDatasetFromTemplate } from "@/lib/usecase/datasets/create-dataset-from-template";

const templateKeyValues = Object.values(DatasetTemplateKey) as [
  DatasetTemplateKey,
  ...DatasetTemplateKey[],
];

const BodySchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).optional(),
  templateKey: z.enum(templateKeyValues).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(json);

  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  try {
    const result = await createDatasetFromTemplate({
      projectId: parsed.data.projectId,
      name: parsed.data.name ?? DatasetTemplateKey.Basic20Jmtbench,
      source: {
        kind: DatasetSourceKind.Template,
        templateKey:
          parsed.data.templateKey ?? DatasetTemplateKey.Basic20Jmtbench,
      },
    });

    return Response.json(result);
  } catch (err) {
    console.error(err);
    return new Response(err instanceof Error ? err.message : "internal error", {
      status: 500,
    });
  }
}
