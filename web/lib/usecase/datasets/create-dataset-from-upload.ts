import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";
import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";
import { SampleRepository } from "@/lib/db/repository/sample-repository";
import { type SampleInfo, SampleInfoSchema } from "@/lib/db/types/jsonb";
import { getSampleInfoPath } from "@/lib/resolve-dir";
import { pickUniqueName } from "./pick-unique-name";

/**
 * JSONL ONLY:
 * - 1行 = 1 Sample（JSONオブジェクト）
 * - 各行は SampleInfoSchema に準拠
 */
export type CreateDatasetFromUploadInput = {
  projectId: string;
  name: string;

  /** JSONL file content */
  content: string;

  /** purely for UI / reference (not injected into samples by default) */
  fileName?: string;

  /** safety limit (DoS prevention). default 5000 */
  maxSamples?: number;

  /** skip empty lines. default true */
  skipEmptyLines?: boolean;
};

export type CreateDatasetFromUploadResult = {
  datasetId: string;
  insertedSamples: number;
};

// -----------------------------
// Helpers
// -----------------------------
function splitLines(
  content: string,
): Array<{ line: string; lineNumber: number }> {
  // remove BOM then split
  const s = content.replace(/^\uFEFF/, "");
  return s.split(/\r?\n/).map((line, i) => ({ line, lineNumber: i + 1 }));
}

function formatZodIssues(issues: z.ZodIssue[]): string {
  // e.g. input.messages.0.role: Invalid enum value...
  return issues
    .map((i) => {
      const p = i.path?.length ? i.path.join(".") : "(root)";
      return `${p}: ${i.message}`;
    })
    .join("; ");
}

function parseJsonlSamples(opts: {
  content: string;
  skipEmptyLines: boolean;
  maxSamples: number;
}): SampleInfo[] {
  const { content, skipEmptyLines, maxSamples } = opts;

  if (!content || !content.trim()) {
    throw new Error("upload content is empty");
  }

  const raw = splitLines(content);

  const lines = raw.filter(({ line }) =>
    skipEmptyLines ? Boolean(line.trim()) : true,
  );
  if (!lines.length) throw new Error("upload content is empty");

  if (lines.length > maxSamples) {
    throw new Error(`too many samples: ${lines.length} (max ${maxSamples})`);
  }

  const samples: SampleInfo[] = [];

  for (const { line, lineNumber } of lines) {
    const t = line.trim();
    if (!t) continue;

    let obj: unknown;
    try {
      obj = JSON.parse(t);
    } catch {
      throw new Error(`line ${lineNumber}: invalid JSON`);
    }

    const parsed = SampleInfoSchema.safeParse(obj);
    if (!parsed.success) {
      throw new Error(
        `line ${lineNumber}: ${formatZodIssues(parsed.error.issues)}`,
      );
    }

    samples.push(parsed.data);
  }

  if (!samples.length) throw new Error("upload content is empty");
  return samples;
}

// -----------------------------
// Main
// -----------------------------
export async function createDatasetFromUpload(
  input: CreateDatasetFromUploadInput,
): Promise<CreateDatasetFromUploadResult> {
  const {
    projectId,
    name,
    content,
    // fileName is currently not injected into samples (jsonl-only strict)
    // fileName,
    maxSamples = 5000,
    skipEmptyLines = true,
  } = input;

  // 0) parse/validate JSONL first (fail fast; do not create dataset if invalid)
  const sampleInfos = parseJsonlSamples({
    content,
    skipEmptyLines,
    maxSamples,
  });

  // 1) create dataset
  const datasetRepository = new DatasetRepository(db);
  const uniqueName = await pickUniqueName(projectId, name);

  const created = await datasetRepository.save({
    projectId,
    name: uniqueName,
  });
  if (!created?.id) throw new Error("failed to create dataset");
  const datasetId = created.id;

  // 2) create samples (DB)
  const sampleRepository = new SampleRepository(db);

  const rows = sampleInfos.map((info) => ({
    id: uuidv4(),
    info,
    datasetId,
  }));

  // NOTE:
  // - ここで DB に insert 成功した後にファイル書き込みが失敗すると
  //   「DBにはあるがworksetsファイルがない」状態になり得ます。
  // - 整合性を強くしたいなら「ファイルはキャッシュ扱いにする」か
  //   「後で補修するジョブ」を用意するのが現実解です。
  await sampleRepository.saveAll(rows);

  // 3) write worksets files (same as template)
  await Promise.all(
    rows.map(async (r) => {
      const outPath = getSampleInfoPath({
        projectId,
        datasetId,
        sampleId: r.id,
      });

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(r.info, null, 2), "utf-8");
    }),
  );

  return {
    datasetId,
    insertedSamples: rows.length,
  };
}
