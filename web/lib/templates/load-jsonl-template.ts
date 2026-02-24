import fs from "node:fs/promises";

export type InfoJson = {
  input: { messages: Array<{ role: string; content: unknown }> };
  usage_output: unknown;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * JSONL(1行=1JSON)を読み込み、InfoJson配列として返す
 * - 空行は無視
 * - JSON parse 失敗は即エラー（最小構成）
 * - 必須: input.messages が配列
 */
export async function loadInfoJsonl(filePath: string): Promise<InfoJson[]> {
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items: InfoJson[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      throw new Error(`Invalid JSON at line ${i + 1}: ${(e as Error).message}`);
    }

    if (
      !isObject(obj) ||
      !isObject(obj.input) ||
      !Array.isArray(obj.input.messages)
    ) {
      throw new Error(
        `Invalid shape at line ${i + 1}: expected { input: { messages: [...] } }`,
      );
    }

    items.push(obj as InfoJson);
  }

  return items;
}
