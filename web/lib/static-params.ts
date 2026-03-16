/**
 * generateStaticParams helpers for MODE=demo static export.
 *
 * Reads project/dataset/evaluation IDs from public/data/ JSON files
 * so that Next.js can pre-render all dynamic routes at build time.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "public/data");

function readJson<T>(relativePath: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, relativePath), "utf-8");
  return JSON.parse(raw) as T;
}

type RawProject = { id: string };
type RawDataset = { id: string };
type RawEvaluation = { id: string };

function getProjectIds(): string[] {
  try {
    const projects = readJson<RawProject[]>("projects.json");
    return projects.map((p) => p.id);
  } catch {
    return [];
  }
}

function getDatasetIds(projectId: string): string[] {
  try {
    const data = readJson<{ datasets: RawDataset[] }>(
      `projects/${projectId}/index.json`,
    );
    return data.datasets.map((d) => d.id);
  } catch {
    return [];
  }
}

function getEvaluationIds(projectId: string): string[] {
  try {
    const data = readJson<RawEvaluation[]>(
      `projects/${projectId}/evaluations.json`,
    );
    return data.map((e) => e.id);
  } catch {
    return [];
  }
}

/** /projects/[projectId] */
export function generateProjectParams() {
  return getProjectIds().map((id) => ({ projectId: id }));
}

/** /projects/[projectId]/datasets/[datasetId] */
export function generateDatasetParams() {
  return getProjectIds().flatMap((projectId) =>
    getDatasetIds(projectId).map((datasetId) => ({ projectId, datasetId })),
  );
}

/** /projects/[projectId]/evaluations/[evaluationId] */
export function generateEvaluationParams() {
  return getProjectIds().flatMap((projectId) =>
    getEvaluationIds(projectId).map((evaluationId) => ({
      projectId,
      evaluationId,
    })),
  );
}

/** /projects/[projectId]/matches/[benchmarkId] */
export function generateMatchParams() {
  return getProjectIds().flatMap((projectId) =>
    getEvaluationIds(projectId).map((benchmarkId) => ({
      projectId,
      benchmarkId,
    })),
  );
}
