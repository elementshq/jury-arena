import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";
import { SampleRepository } from "@/lib/db/repository/sample-repository";
import { getSampleInfoPath, getTemplateFilePath } from "@/lib/resolve-dir";
import {
  DatasetSourceKind,
  type DatasetTemplateKey,
} from "@/lib/templates/dataset-source";
import { loadInfoJsonl } from "@/lib/templates/load-jsonl-template";
import { pickUniqueName } from "./pick-unique-name";

export type createDatasetFromTemplateInput = {
  projectId: string;
  name: string;
  source: {
    kind: DatasetSourceKind;
    templateKey: DatasetTemplateKey;
  };
};

export type createDatasetFromTemplateResult = {
  datasetId: string;
  insertedSamples: number;
};

export async function createDatasetFromTemplate(
  input: createDatasetFromTemplateInput,
): Promise<createDatasetFromTemplateResult> {
  const { projectId, name, source } = input;

  if (source.kind !== DatasetSourceKind.Template) {
    throw new Error("unsupported source kind");
  }

  // 1) load template
  const templatePath = getTemplateFilePath(source.templateKey);
  const infos = await loadInfoJsonl(templatePath);

  if (!infos.length) {
    throw new Error("template is empty");
  }

  // 2) create dataset
  const baseName = await pickUniqueName(projectId, name);
  const datasetRepository = new DatasetRepository(db);
  const created = await datasetRepository.save({
    projectId,
    name: baseName,
  });
  if (!created?.id) {
    throw new Error("failed to create dataset");
  }

  const datasetId = created.id;

  // 3) create samples (DB)
  const sampleRepository = new SampleRepository(db);
  const rows = infos.map((info) => ({
    id: uuidv4(),
    info,
    datasetId,
  }));
  await sampleRepository.saveAll(rows);

  // 4) write worksets files
  for (const r of rows) {
    const outPath = getSampleInfoPath({
      projectId,
      datasetId,
      sampleId: r.id,
    });

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(r.info, null, 2), "utf-8");
  }

  return {
    datasetId,
    insertedSamples: rows.length,
  };
}
