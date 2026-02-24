import "server-only";

import { db } from "@/lib/db/core";
import { SampleRepository } from "@/lib/db/repository/sample-repository";

/**
 * Dataset capabilities information
 */
export type DatasetCapabilities = {
  requiresPdf: boolean;
  requiresImage: boolean;
  totalSamples: number;
  pdfSampleCount: number; // Number of samples requiring PDF
};

/**
 * Check if a message content contains file_ref
 */
function hasFileRef(
  content: unknown,
  type: "pdf" | "image" | "file_ref",
): boolean {
  if (!content || typeof content !== "object") return false;

  // Handle array of content parts
  if (Array.isArray(content)) {
    return content.some((part) => hasFileRef(part, type));
  }

  // Handle single content object
  const obj = content as Record<string, unknown>;

  // Check for file_ref type
  if (obj.type === "file_ref") {
    if (type === "file_ref") return true;

    // Check if file_ref points to PDF or image
    const path = obj.path;
    if (typeof path === "string") {
      const lowerPath = path.toLowerCase();
      if (type === "pdf" && lowerPath.endsWith(".pdf")) return true;
      if (
        type === "image" &&
        (lowerPath.endsWith(".png") ||
          lowerPath.endsWith(".jpg") ||
          lowerPath.endsWith(".jpeg") ||
          lowerPath.endsWith(".gif") ||
          lowerPath.endsWith(".webp"))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Analyze dataset samples and detect required capabilities
 *
 * @param datasetId - Dataset ID to analyze
 * @returns Dataset capabilities
 */
export async function analyzeDatasetCapabilities(
  datasetId: string,
): Promise<DatasetCapabilities> {
  const sampleRepository = new SampleRepository(db);

  // Get all samples for this dataset
  const samples = await sampleRepository.filter({
    where: { datasetId },
  });

  let requiresPdf = false;
  let requiresImage = false;
  let pdfSampleCount = 0;

  for (const sample of samples) {
    const info = sample.info as Record<string, unknown>;

    let sampleHasPdf = false;

    // Check input.messages array
    const input = info.input;
    if (typeof input === "object" && input !== null) {
      const inputObj = input as Record<string, unknown>;
      const messages = inputObj.messages;

      if (Array.isArray(messages)) {
        for (const message of messages) {
          if (typeof message === "object" && message !== null) {
            const msg = message as Record<string, unknown>;
            const content = msg.content;

            if (hasFileRef(content, "pdf")) {
              sampleHasPdf = true;
              requiresPdf = true;
            }
            if (hasFileRef(content, "image")) {
              requiresImage = true;
            }
          }
        }
      }
    }

    if (sampleHasPdf) {
      pdfSampleCount++;
    }
  }

  return {
    requiresPdf,
    requiresImage,
    totalSamples: samples.length,
    pdfSampleCount,
  };
}

/**
 * Check if dataset requires PDF support
 */
export async function datasetRequiresPdf(
  datasetId: string,
): Promise<boolean> {
  const capabilities = await analyzeDatasetCapabilities(datasetId);
  return capabilities.requiresPdf;
}

/**
 * Check if dataset requires image support
 */
export async function datasetRequiresImage(
  datasetId: string,
): Promise<boolean> {
  const capabilities = await analyzeDatasetCapabilities(datasetId);
  return capabilities.requiresImage;
}
