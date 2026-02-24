import { z } from "zod";
import { createDatasetFromUpload } from "@/lib/usecase/datasets/create-dataset-from-upload";
import { createDatasetFromZip } from "@/lib/usecase/datasets/create-dataset-from-zip";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().min(1),

    /**
     * JSONL content (1 line = 1 sample)
     * Each line must be a JSON object matching SampleInfoSchema.
     */
    content: z.string().min(1),

    /** optional: for display only (not injected into samples) */
    fileName: z.string().optional(),

    /** optional safety knobs */
    maxSamples: z.number().int().positive().max(50000).optional(),
    skipEmptyLines: z.boolean().optional(),
  })
  .strict();

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "internal error";
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // Check if this is a ZIP upload (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      const projectId = formData.get("projectId") as string;
      const name = formData.get("name") as string;
      const file = formData.get("file") as File;

      if (!projectId || !name || !file) {
        return new Response(
          "Missing required fields: projectId, name, file",
          { status: 400 }
        );
      }

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Process ZIP upload
      const result = await createDatasetFromZip({
        projectId,
        name,
        zipBuffer: buffer,
        fileName: file.name,
      });

      return Response.json(result, { status: 200 });
    }

    // JSON upload (JSONL content)
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      // ZodError は message が長くなりがちなので issues を素直に返す
      const msg = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return new Response(msg, { status: 400 });
    }

    const result = await createDatasetFromUpload({
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      content: parsed.data.content,
      fileName: parsed.data.fileName,
      maxSamples: parsed.data.maxSamples,
      skipEmptyLines: parsed.data.skipEmptyLines,
    });

    return Response.json(result, { status: 200 });
  } catch (err) {
    // createDatasetFromUpload/createDatasetFromZip は
    // - JSONL/Schema 由来: Error(message="line N: ...")
    // - DB/FS 由来: Error(...)
    // を投げる想定。
    const msg = errorToString(err);

    // 入力由来（ユーザー修正で直る系）は 400 に寄せる
    // ※ "line N:" 形式は JSONL/Schema 検証の fail-fast を想定
    const isClientError =
      msg.startsWith("line ") ||
      msg.includes("upload content is empty") ||
      msg.startsWith("too many samples:") ||
      msg.includes("samples.jsonl not found") ||
      msg.includes("file_ref path not found");

    if (!isClientError) {
      console.error(err);
    }

    return new Response(msg, { status: isClientError ? 400 : 500 });
  }
}
