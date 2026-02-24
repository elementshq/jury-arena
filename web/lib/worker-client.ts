export type WorkerStartBenchmarkRequest = {
  config: unknown; // ← UI側は BenchmarkConfig を渡す想定
  benchmarkName?: string;
};

export type WorkerStartBenchmarkResponse = {
  benchmarkId: string;
  benchmarkName?: string;
};

export type WorkerBenchmarkState = {
  benchmarkId: string;
  projectName: string;
  datasetName: string;

  status: "queued" | "running" | "finished" | "failed" | "stopped";
  startedAt?: string;
  finishedAt?: string;

  step: { current: number; total?: number };

  models: { count: number; names: string[] };

  ratingSeries: Array<{ step: number; [modelName: string]: number }>;

  logs: Array<{ at: string; step: number; message: string }>;
};

export async function workerStartBenchmark(
  projectId: string,
  datasetId: string,
  body: WorkerStartBenchmarkRequest,
  signal?: AbortSignal,
): Promise<WorkerStartBenchmarkResponse> {
  const res = await fetch(
    `/api/projects/${projectId}/datasets/${datasetId}/benchmarks`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`workerStartBenchmark failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function workerGetBenchmarkState(
  benchmarkId: string,
  signal?: AbortSignal,
): Promise<WorkerBenchmarkState> {
  const res = await fetch(
    `/api/benchmarks/${encodeURIComponent(benchmarkId)}/state`,
    {
      method: "GET",
      signal,
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`workerGetBenchmarkState failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function workerOpenBenchmarkStream(
  benchmarkId: string,
  signal?: AbortSignal,
) {
  const res = await fetch(
    `/api/benchmarks/${encodeURIComponent(benchmarkId)}/stream`,
    {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal,
      cache: "no-store",
    },
  );

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`workerOpenBenchmarkStream failed: ${res.status} ${text}`);
  }
  return res;
}

export async function workerStopBenchmark(
  benchmarkId: string,
  signal?: AbortSignal,
) {
  const res = await fetch(
    `/api/benchmarks/${encodeURIComponent(benchmarkId)}/stop`,
    {
      method: "POST",
      signal,
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`workerStopBenchmark failed: ${res.status} ${text}`);
  }
  return res.json();
}
