import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ModelsYamlSchema, type ModelsYaml } from "./models-types";

// Re-export types for backward compatibility
export type {
  ModelInputCapabilities,
  ModelCapabilities,
  ModelDefinition,
  ModelsYaml,
} from "./models-types";

// Re-export utility functions for backward compatibility
export {
  supportsInput,
  supportsPdfBase64,
  supportsImageBase64,
} from "./models-utils";

export async function loadModels(): Promise<ModelsYaml> {
  const filePath = path.join(process.cwd(), "config", "models.yaml");

  let text: string | null = null;

  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      if (process.env.MODE === "demo") {
        // デモモード: models.yaml 未作成 → example にフォールバック
        const examplePath = path.join(process.cwd(), "config", "models.example.yaml");
        try {
          text = await fs.readFile(examplePath, "utf8");
        } catch {
          return { model_list: [] };
        }
      } else {
        // 通常モード: models.yaml 未作成 → 空定義として扱う
        return { model_list: [] };
      }
    } else {
      throw err;
    }
  }

  const data = yaml.load(text);

  const parsed = ModelsYamlSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Invalid models.yaml: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ")}`,
    );
  }

  const seen = new Set<string>();
  for (const m of parsed.data.model_list) {
    if (seen.has(m.model)) {
      throw new Error(`Duplicate model in models.yaml: ${m.model}`);
    }
    seen.add(m.model);
  }

  return parsed.data;
}
