/**
 * Static data layer: reads pre-exported JSON files from public/data/
 * instead of querying PostgreSQL.
 *
 * Drop-in replacement for usecase/ functions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SampleInfo } from "@/lib/db/types/jsonb";

// ---------------------------------------------------------------------------
// JSON file reader
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(process.cwd(), "public/data");

function readJson<T>(relativePath: string): T {
  const filePath = path.join(DATA_DIR, relativePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function readJsonSafe<T>(relativePath: string): T | null {
  try {
    return readJson<T>(relativePath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Date conversion helpers
// ---------------------------------------------------------------------------
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  return new Date();
}

function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null;
  return toDate(v);
}

// ---------------------------------------------------------------------------
// Types (matching existing DB model types)
// ---------------------------------------------------------------------------
type ProjectModel = {
  id: string;
  name: string;
  createdAt: Date;
};

type DatasetWithCounts = {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
  sampleCount: number;
  benchmarkCount: number;
  lastEvaluatedAt?: Date | null;
};

type DatasetModel = {
  id: string;
  projectId: string;
  name: string;
  createdAt: Date;
};

type EvaluationSummary = {
  id: string;
  datasetId?: string;
  datasetName?: string;
  createdAt: Date;
  comparison: Array<{ model: string; rating: number; games: number }>;
  matchCount: number;
  judgeModels: string[];
};

type SampleItem = {
  id: string;
  info: SampleInfo;
  createdAt: Date;
};

type MatchListItem = {
  id: string;
  matchIndex: number;
  sampleId: string;
  createdAt: Date;
  match: {
    match_id: string;
    sample_id: string;
    model_a: string;
    model_b: string;
    winner: string;
    judge_models: string[];
    created_at: string;
  };
};

// ---------------------------------------------------------------------------
// Raw JSON types (before date hydration)
// ---------------------------------------------------------------------------
type RawProject = Omit<ProjectModel, "createdAt"> & { createdAt: string };
type RawDatasetWithCounts = Omit<DatasetWithCounts, "createdAt" | "lastEvaluatedAt"> & {
  createdAt: string;
  lastEvaluatedAt?: string | null;
};
type RawEvaluation = Omit<EvaluationSummary, "createdAt"> & { createdAt: string };
type RawSample = Omit<SampleItem, "createdAt"> & { createdAt: string };
type RawMatch = Omit<MatchListItem, "createdAt"> & { createdAt: string };

// ---------------------------------------------------------------------------
// Project functions
// ---------------------------------------------------------------------------
export async function getProjects(): Promise<ProjectModel[]> {
  const raw = readJson<RawProject[]>("projects.json");
  return raw.map((r) => ({ ...r, createdAt: toDate(r.createdAt) }));
}

export async function getProject(params: {
  projectId: string;
}): Promise<ProjectModel | null> {
  const projects = await getProjects();
  return projects.find((p) => p.id === params.projectId) ?? null;
}

// ---------------------------------------------------------------------------
// Dataset functions
// ---------------------------------------------------------------------------
function hydrateDatasets(raw: RawDatasetWithCounts[]): DatasetWithCounts[] {
  return raw.map((r) => ({
    ...r,
    createdAt: toDate(r.createdAt),
    lastEvaluatedAt: toDateOrNull(r.lastEvaluatedAt),
  }));
}

export async function getProjectDatasets(params: {
  projectId: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: string;
}): Promise<DatasetWithCounts[]> {
  const data = readJson<{ datasets: RawDatasetWithCounts[] }>(
    `projects/${params.projectId}/index.json`,
  );

  let items = hydrateDatasets(data.datasets);

  // Search filter
  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter((d) => d.name.toLowerCase().includes(q));
  }

  // Sort
  const orderBy = params.orderBy ?? "createdAt";
  const dir = params.orderDir ?? "desc";
  items = [...items].sort((a, b) => {
    let cmp = 0;
    if (orderBy === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (orderBy === "sampleCount") {
      cmp = a.sampleCount - b.sampleCount;
    } else if (orderBy === "benchmarkCount") {
      cmp = a.benchmarkCount - b.benchmarkCount;
    } else {
      cmp = a.createdAt.getTime() - b.createdAt.getTime();
    }
    return dir === "asc" ? cmp : -cmp;
  });

  // Pagination
  const offset = params.offset ?? 0;
  if (params.limit !== undefined) {
    items = items.slice(offset, offset + params.limit);
  } else if (offset > 0) {
    items = items.slice(offset);
  }

  return items;
}

export async function getProjectDatasetsCount(params: {
  projectId: string;
}): Promise<number> {
  const data = readJson<{ total: number }>(
    `projects/${params.projectId}/index.json`,
  );
  return data.total;
}

export async function getRecentEvaluatedDatasets(params: {
  projectId: string;
  limit?: number;
}): Promise<DatasetWithCounts[]> {
  const data = readJson<{ recentEvaluated: RawDatasetWithCounts[] }>(
    `projects/${params.projectId}/index.json`,
  );
  const limit = params.limit ?? 4;
  return hydrateDatasets(data.recentEvaluated).slice(0, limit);
}

export async function getDataset(params: {
  datasetId: string;
}): Promise<DatasetModel | null> {
  const projects = await getProjects();
  for (const project of projects) {
    const data = readJsonSafe<{ datasets: RawDatasetWithCounts[] }>(
      `projects/${project.id}/index.json`,
    );
    if (!data) continue;
    const found = data.datasets.find((d) => d.id === params.datasetId);
    if (found)
      return {
        id: found.id,
        projectId: found.projectId,
        name: found.name,
        createdAt: toDate(found.createdAt),
      };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dataset detail
// ---------------------------------------------------------------------------
export async function getDatasetDetail(params: {
  projectId: string;
  datasetId: string;
}) {
  const raw = readJsonSafe<{
    dataset: RawDatasetWithCounts;
    sampleCount: number;
    benchmarkCount: number;
    recentEvaluations: RawEvaluation[];
  }>(`projects/${params.projectId}/datasets/${params.datasetId}/index.json`);

  if (!raw) return null;

  return {
    dataset: {
      id: raw.dataset.id,
      projectId: raw.dataset.projectId,
      name: raw.dataset.name,
      createdAt: toDate(raw.dataset.createdAt),
    } as DatasetModel,
    sampleCount: raw.sampleCount,
    benchmarkCount: raw.benchmarkCount,
    recentEvaluations: raw.recentEvaluations.map((e) => ({
      ...e,
      createdAt: toDate(e.createdAt),
    })) as EvaluationSummary[],
  };
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------
export async function getProjectEvaluations(params: {
  projectId: string;
  datasetId?: string;
}): Promise<EvaluationSummary[]> {
  const raw = readJson<RawEvaluation[]>(
    `projects/${params.projectId}/evaluations.json`,
  );

  let evaluations = raw.map((e) => ({
    ...e,
    createdAt: toDate(e.createdAt),
  })) as EvaluationSummary[];

  if (params.datasetId) {
    evaluations = evaluations.filter((e) => e.datasetId === params.datasetId);
  }

  return evaluations;
}

// ---------------------------------------------------------------------------
// Benchmark detail
// ---------------------------------------------------------------------------
// biome-ignore lint: using any for the flexible JSON structure from export
export async function getBenchmarkDetail(params: { benchmarkId: string }): Promise<any> {
  const projects = await getProjects();
  for (const project of projects) {
    // biome-ignore lint: flexible JSON structure
    const data = readJsonSafe<any>(
      `projects/${project.id}/evaluations/${params.benchmarkId}/index.json`,
    );
    if (data) return data;
  }
  throw new Error(`Benchmark not found: ${params.benchmarkId}`);
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------
export async function getMatches(params: {
  benchmarkId: string;
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const projects = await getProjects();
  for (const project of projects) {
    const data = readJsonSafe<{ matches: RawMatch[] }>(
      `projects/${project.id}/matches/${params.benchmarkId}.json`,
    );
    if (!data) continue;

    let matches: MatchListItem[] = data.matches.map((m) => ({
      ...m,
      createdAt: toDate(m.createdAt),
    }));

    if (params.search) {
      const q = params.search.trim().toLowerCase();
      matches = matches.filter((m) => {
        const idxHit = String(m.matchIndex).includes(q);
        const sampleHit = m.sampleId.toLowerCase().includes(q);
        return idxHit || sampleHit;
      });
    }

    const offset = params.offset ?? 0;
    const limit = params.limit ?? 200;
    matches = matches.slice(offset, offset + limit);

    return { matches };
  }

  return { matches: [] };
}

export async function getMatchDetail(params: { matchId: string }) {
  const projects = await getProjects();
  for (const project of projects) {
    const data = readJsonSafe<Record<string, unknown>>(
      `projects/${project.id}/matches/detail/${params.matchId}.json`,
    );
    if (data) return { match: data };
  }
  throw new Error(`Match not found: ${params.matchId}`);
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------
export async function getProjectSamples(params: {
  projectId: string;
  datasetId?: string;
  limit?: number;
  offset?: number;
}) {
  if (params.datasetId) {
    const data = readJsonSafe<{ samples: RawSample[]; total: number }>(
      `projects/${params.projectId}/samples/${params.datasetId}.json`,
    );
    if (!data) return { samples: [], page: { limit: params.limit, offset: params.offset }, total: 0 };

    let samples: SampleItem[] = data.samples.map((s) => ({
      ...s,
      createdAt: toDate(s.createdAt),
    }));
    const total = data.total;

    const offset = params.offset ?? 0;
    if (params.limit !== undefined) {
      samples = samples.slice(offset, offset + params.limit);
    } else if (offset > 0) {
      samples = samples.slice(offset);
    }

    return { samples, page: { limit: params.limit, offset: params.offset }, total };
  }

  // No datasetId: merge all samples
  const projectData = readJsonSafe<{ datasets: RawDatasetWithCounts[] }>(
    `projects/${params.projectId}/index.json`,
  );
  if (!projectData) return { samples: [], page: { limit: params.limit, offset: params.offset }, total: 0 };

  let allSamples: SampleItem[] = [];
  for (const ds of projectData.datasets) {
    const data = readJsonSafe<{ samples: RawSample[] }>(
      `projects/${params.projectId}/samples/${ds.id}.json`,
    );
    if (data) {
      allSamples.push(
        ...data.samples.map((s) => ({ ...s, createdAt: toDate(s.createdAt) })),
      );
    }
  }

  allSamples.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = allSamples.length;
  const offset = params.offset ?? 0;
  if (params.limit !== undefined) {
    allSamples = allSamples.slice(offset, offset + params.limit);
  } else if (offset > 0) {
    allSamples = allSamples.slice(offset);
  }

  return { samples: allSamples, page: { limit: params.limit, offset: params.offset }, total };
}

// ---------------------------------------------------------------------------
// Resolve project context (simplified for demo)
// ---------------------------------------------------------------------------
export const ResolveProjectContextResultKind = {
  Redirect: "redirect",
  Ok: "ok",
} as const;

export async function resolveProjectContext(params: {
  candidateProjectIds: string[];
}) {
  const projects = await getProjects();
  if (projects.length === 0) throw new Error("No projects in static data");

  const match = params.candidateProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .find(Boolean);

  const selected = match ?? projects[0];

  return {
    kind: ResolveProjectContextResultKind.Ok as string,
    selectedProject: selected,
    projects,
  };
}

// ---------------------------------------------------------------------------
// Setup requirements stub (demo has no setup issues)
// ---------------------------------------------------------------------------
export function getSetupIssues() {
  return [];
}

// ---------------------------------------------------------------------------
// Project candidates stub (demo doesn't use cookies)
// ---------------------------------------------------------------------------
export async function getProjectCandidateIds() {
  return [];
}

// ---------------------------------------------------------------------------
// Dataset capabilities stub (demo returns no special requirements)
// ---------------------------------------------------------------------------
export type DatasetCapabilities = {
  requiresPdf: boolean;
  requiresImage: boolean;
  totalSamples: number;
  pdfSampleCount: number;
};

export async function analyzeDatasetCapabilities(
  _datasetId: string,
): Promise<DatasetCapabilities> {
  return {
    requiresPdf: false,
    requiresImage: false,
    totalSamples: 0,
    pdfSampleCount: 0,
  };
}

export async function datasetRequiresPdf(_datasetId: string): Promise<boolean> {
  return false;
}

export async function datasetRequiresImage(
  _datasetId: string,
): Promise<boolean> {
  return false;
}
