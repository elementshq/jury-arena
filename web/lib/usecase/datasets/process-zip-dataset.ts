import "server-only";

import AdmZip from "adm-zip";
import path from "node:path";
import { type ContentPart, SampleInfoSchema } from "@/lib/db/types/jsonb";

/**
 * Result of ZIP processing
 */
export type ProcessedZipDataset = {
  samples: Array<{
    id: string;
    info: unknown; // Will be validated against SampleInfoSchema
  }>;
  attachments: Map<string, Buffer>; // path -> file content
};

/**
 * Extract and validate ZIP dataset
 *
 * Expected structure:
 * ```
 * dataset.zip
 *   samples.jsonl
 *   attachments/
 *     doc1.pdf
 *     doc2.pdf
 * ```
 *
 * @param zipBuffer - ZIP file as Buffer
 * @param options - Processing options
 * @returns Processed dataset with samples and attachments
 */
export async function processZipDataset(
  zipBuffer: Buffer,
  options: {
    maxSamples?: number;
    skipEmptyLines?: boolean;
  } = {},
): Promise<ProcessedZipDataset> {
  const { maxSamples = 5000, skipEmptyLines = true } = options;

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (error) {
    throw new Error(
      `Invalid ZIP file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = zip.getEntries();

  // Filter out macOS metadata files
  let validEntries = entries.filter(
    (e) => !e.entryName.startsWith("__MACOSX/") && !e.entryName.startsWith("._"),
  );

  // Check if all files are in a single subdirectory (common when zipping a folder)
  const rootPaths = validEntries
    .filter((e) => !e.isDirectory)
    .map((e) => e.entryName.split("/")[0]);

  const uniqueRootDirs = new Set(rootPaths);

  // If all files are in a single subdirectory, strip that prefix
  if (uniqueRootDirs.size === 1 && rootPaths[0] && rootPaths[0] !== "") {
    const prefix = `${rootPaths[0]}/`;
    validEntries = validEntries
      .filter((e) => e.entryName.startsWith(prefix))
      .map((e) => {
        // Create a new entry-like object with stripped name
        const strippedName = e.entryName.slice(prefix.length);
        return {
          ...e,
          entryName: strippedName,
          getData: e.getData.bind(e),
        };
      })
      .filter((e) => e.entryName !== ""); // Remove empty entries
  }

  // Find .jsonl file at root level
  const samplesEntry = validEntries.find(
    (e) => !e.isDirectory && e.entryName.endsWith(".jsonl") && !e.entryName.includes("/"),
  );

  if (!samplesEntry) {
    const availableFiles = validEntries
      .filter((e) => !e.isDirectory)
      .map((e) => e.entryName)
      .join(", ");

    throw new Error(
      `ZIP must contain a .jsonl file at the root level (e.g., 'samples.jsonl'). Found files: ${availableFiles || "(none)"}`,
    );
  }

  // Extract JSONL content
  let samplesContent: string;
  try {
    samplesContent = samplesEntry.getData().toString("utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read ${samplesEntry.entryName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Parse JSONL
  const samples = parseJsonlWithFileRefs(samplesContent, {
    maxSamples,
    skipEmptyLines,
  });

  // Collect all file_ref paths from samples (normalized to NFC)
  const referencedPaths = new Set<string>();
  for (const sample of samples) {
    const info = sample.info as any;
    if (info?.input?.messages) {
      for (const message of info.input.messages) {
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === "file_ref" && part.path) {
              // Normalize to NFC for consistent comparison (especially for Japanese filenames)
              const normalizedPath = part.path.normalize("NFC");
              console.log(`[DEBUG] Found file_ref: "${part.path}" -> normalized: "${normalizedPath}"`);
              referencedPaths.add(normalizedPath);
            }
          }
        }
      }
    }
  }
  console.log(`[DEBUG] Total referenced paths: ${referencedPaths.size}`);

  // Extract attachments
  const attachments = new Map<string, Buffer>();
  const missingFiles: string[] = [];

  for (const refPath of referencedPaths) {
    // Compare using normalized paths (NFC) for both sides
    const entry = validEntries.find(
      (e) => !e.isDirectory && e.entryName.normalize("NFC") === refPath,
    );

    if (!entry) {
      missingFiles.push(refPath);
      continue;
    }

    try {
      const buffer = entry.getData();
      attachments.set(refPath, buffer);
    } catch (error) {
      throw new Error(
        `Failed to extract ${refPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing referenced files in ZIP:\n` +
        missingFiles.map((f) => `  - ${f}`).join("\n") +
        `\n\nAvailable files in ZIP:\n` +
        validEntries
          .filter((e) => !e.isDirectory)
          .map((e) => `  - ${e.entryName.normalize("NFC")}`)
          .join("\n"),
    );
  }

  return { samples, attachments };
}

/**
 * Parse JSONL content with file_ref validation
 */
function parseJsonlWithFileRefs(
  content: string,
  options: {
    maxSamples: number;
    skipEmptyLines: boolean;
  },
): Array<{ id: string; info: unknown }> {
  const { maxSamples, skipEmptyLines } = options;

  if (!content || !content.trim()) {
    throw new Error("samples.jsonl is empty");
  }

  // Remove BOM and split lines
  const text = content.replace(/^\uFEFF/, "");
  const allLines = text.split(/\r?\n/);

  const lines = skipEmptyLines
    ? allLines.filter((line) => line.trim())
    : allLines;

  if (lines.length === 0) {
    throw new Error("samples.jsonl contains no valid lines");
  }

  if (lines.length > maxSamples) {
    throw new Error(
      `Too many samples: ${lines.length} (maximum ${maxSamples} allowed)`,
    );
  }

  const samples: Array<{ id: string; info: unknown }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const lineNumber = i + 1;

    // Parse JSON
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (error) {
      const preview = line.length > 150 ? line.slice(0, 150) + "..." : line;
      throw new Error(
        `Line ${lineNumber}: Invalid JSON - ${error instanceof Error ? error.message : String(error)}\n\nLine content:\n${preview}`,
      );
    }

    // Validate against schema
    const parsed = SampleInfoSchema.safeParse(obj);
    if (!parsed.success) {
      const errors = parsed.error.issues
        .map((issue) => {
          const pathStr = issue.path.length ? issue.path.join(".") : "(root)";
          return `${pathStr}: ${issue.message}`;
        })
        .join("; ");
      throw new Error(`Line ${lineNumber}: Schema validation failed - ${errors}`);
    }

    // Generate sample ID
    const sampleId = `sample-${String(lineNumber).padStart(4, "0")}`;

    samples.push({
      id: sampleId,
      info: parsed.data,
    });
  }

  return samples;
}

/**
 * Check if a sample has file references
 */
export function hasFileReferences(sampleInfo: unknown): boolean {
  const info = sampleInfo as any;
  if (!info?.input?.messages) return false;

  for (const message of info.input.messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "file_ref") {
          return true;
        }
      }
    }
  }

  return false;
}
