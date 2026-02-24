import { db } from "@/lib/db/core";
import { DatasetRepository } from "@/lib/db/repository/dataset-repository";

export async function pickUniqueName(projectId: string, baseName: string) {
  // 既存の "baseName" or "baseName (n)" を拾って最大 n を決める簡易版
  const datasetRepository = new DatasetRepository(db);
  const rows = await datasetRepository.filter({ where: { projectId } });

  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(?: \\((\\d+)\\))?$`);
  let max = 0;
  let exactExists = false;

  for (const r of rows) {
    const m = re.exec(r.name);
    if (!m) continue;
    if (!m[1]) exactExists = true;
    else max = Math.max(max, Number(m[1]));
  }

  if (!exactExists) return baseName;
  return `${baseName} (${max + 1})`;
}
