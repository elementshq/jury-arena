import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";
import { SampleRepository } from "@/lib/db/repository/sample-repository";
import { getDatasetDir, getSampleInfoPath } from "@/lib/resolve-dir";
import { pickUniqueName } from "./pick-unique-name";
import { processZipDataset } from "./process-zip-dataset";

/**
 * Input for creating dataset from ZIP upload
 */
export type CreateDatasetFromZipInput = {
  projectId: string;
  name: string;
  zipBuffer: Buffer;
  fileName?: string;
  maxSamples?: number;
  skipEmptyLines?: boolean;
};

/**
 * Result of dataset creation from ZIP
 */
export type CreateDatasetFromZipResult = {
  datasetId: string;
  insertedSamples: number;
  hasAttachments: boolean;
  attachmentCount: number;
};

/**
 * Create dataset from ZIP upload (JSONL + attachments)
 *
 * Process:
 * 1. Extract and validate ZIP contents
 * 2. Validate samples.jsonl against schema
 * 3. Check file_ref references exist in ZIP
 * 4. Create dataset in database
 * 5. Insert samples into database
 * 6. Save ZIP file and attachments to worksets directory
 * 7. Write sample info files
 */
export async function createDatasetFromZip(
  input: CreateDatasetFromZipInput,
): Promise<CreateDatasetFromZipResult> {
  const {
    projectId,
    name,
    zipBuffer,
    maxSamples = 5000,
    skipEmptyLines = true,
  } = input;

  // Step 1: Process ZIP file
  const { samples, attachments } = await processZipDataset(zipBuffer, {
    maxSamples,
    skipEmptyLines,
  });

  console.log(
    `[DEBUG] processZipDataset returned: samples=${samples.length}, attachments=${attachments.size}`,
  );
  if (attachments.size > 0) {
    console.log(`[DEBUG] Attachment paths:`, Array.from(attachments.keys()));
  }

  if (samples.length === 0) {
    throw new Error("No valid samples found in ZIP file");
  }

  // Step 2: Pick unique dataset name
  const datasetName = await pickUniqueName(projectId, name);

  // Step 3: Create dataset in database
  const datasetRepo = new DatasetRepository(db);
  const dataset = await datasetRepo.save({
    projectId,
    name: datasetName,
  });

  const datasetId = dataset.id;

  try {
    // Step 4: Prepare sample records for bulk insert
    const sampleRecords = samples.map((s) => ({
      id: `${datasetId}-${s.id}`,
      datasetId,
      info: s.info,
    }));

    // Step 5: Insert samples into database
    const sampleRepo = new SampleRepository(db);
    await sampleRepo.saveAll(sampleRecords);

    // Step 6: Create worksets directory structure
    const datasetDir = getDatasetDir(projectId, datasetId);

    console.log(`[DEBUG] Creating dataset directory: ${datasetDir}`);
    await fs.mkdir(datasetDir, { recursive: true });

    // Step 7: Save original ZIP file
    const zipPath = path.join(datasetDir, "dataset.zip");
    await fs.writeFile(zipPath, zipBuffer);

    // Step 8: Save attachments directory
    console.log(`[DEBUG] Step 8: Saving attachments... count=${attachments.size}`);
    if (attachments.size > 0) {
      for (const [filePath, buffer] of attachments) {
        const fullPath = path.join(datasetDir, filePath);
        const dir = path.dirname(fullPath);

        console.log(`[DEBUG] Saving attachment: "${filePath}" -> "${fullPath}"`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, buffer);
        console.log(`[DEBUG] Attachment saved: ${fullPath}`);
      }
      console.log(`[DEBUG] All attachments saved successfully`);
    } else {
      console.log(`[DEBUG] No attachments to save (attachments.size = 0)`);
    }

    // Step 9: Write individual sample info files
    for (const record of sampleRecords) {
      const samplePath = getSampleInfoPath({
        projectId,
        datasetId,
        sampleId: record.id,
      });
      const sampleDir = path.dirname(samplePath);

      await fs.mkdir(sampleDir, { recursive: true });
      await fs.writeFile(samplePath, JSON.stringify(record.info, null, 2));
    }

    return {
      datasetId,
      insertedSamples: samples.length,
      hasAttachments: attachments.size > 0,
      attachmentCount: attachments.size,
    };
  } catch (error) {
    // Rollback: attempt to delete dataset if file operations failed
    // Note: This is best-effort cleanup, not a true transaction
    try {
      await datasetRepo.delete({ id: datasetId });
    } catch (rollbackError) {
      console.error("Failed to rollback dataset creation:", rollbackError);
    }

    throw error;
  }
}
