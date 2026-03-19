import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  appendLog,
  attachProcess,
  createBenchmarkId,
  initBenchmarkRuntime,
} from "@/lib/benchmark-runtime";
import { BenchmarkConfigSchema } from "@/lib/config/schema";
import { configToYaml } from "@/lib/config/to-yaml";
import { BenchmarkInfoSchema } from "@/lib/db/types/jsonb";
import { getWorkerConfigDir, resolveWorkerDir } from "@/lib/resolve-dir";
import { createBenchmark } from "@/lib/usecase/benchmarks/create-benchmark";
import { getDataset } from "@/lib/usecase/benchmarks/get-dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  const body = await req.json();
  const { projectId, datasetId } = body;

  const parsed = BenchmarkConfigSchema.safeParse(body.config);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid config",
        details: parsed.error.flatten?.() ?? parsed.error,
      },
      { status: 400 },
    );
  }

  const config = parsed.data;
  if (parsed.data.baseline_model === undefined) {
    config.baseline_model = parsed.data.models.trials[0] ?? undefined;
  }

  const benchmarkName =
    body.benchmarkName ??
    new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14);

  const configName = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  const benchmarkId = createBenchmarkId();

  const dataset = await getDataset({ datasetId });
  if (!dataset) {
    return NextResponse.json(
      { error: `Dataset not found: ${datasetId}` },
      { status: 404 },
    );
  }

  const WORKER_DIR = resolveWorkerDir();
  const configDir = getWorkerConfigDir();
  await mkdir(configDir, { recursive: true });

  const yamlText = configToYaml(config);
  const configPath = path.join(configDir, `${safeName(configName)}.yaml`);
  await writeFile(configPath, yamlText, "utf-8");

  const totalSteps = Math.ceil(
    config.stopping.max_matches / config.execution.match_batch_size,
  );

  initBenchmarkRuntime({
    benchmarkId,
    projectId,
    datasetId,
    datasetName: dataset.name,
    models: config.models?.trials ?? [],
    totalSteps,
    matchBatchSize: config.execution.match_batch_size,
    maxMatches: config.stopping.max_matches,
    tempConfigPath: configPath,
  });

  // Create benchmark record in the database
  await createBenchmark({
    id: benchmarkId,
    name: benchmarkName,
    datasetId,
    config: config,
    info: BenchmarkInfoSchema.parse({
      dataset: datasetId,
      created_at: new Date().toISOString(),
    }),
  });

  appendLog(benchmarkId, `[SYSTEM] Config written: ${configPath}`);
  appendLog(benchmarkId, `[SYSTEM] Benchmark name: ${benchmarkName}`);
  appendLog(benchmarkId, `[SYSTEM] workerDir: ${WORKER_DIR}`); // デバッグ用（後で消してOK）

  const proc = spawn(
    "uv",
    [
      "run",
      "python",
      "-u",
      "scripts/benchmark/02_run_benchmark.py",
      projectId,
      datasetId,
      "--config",
      configPath,
      "--benchmark-name",
      benchmarkId,
    ],
    {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        // PYTHONPATH は入れてもOK（mylib対策）
        PYTHONPATH: [process.env.PYTHONPATH, WORKER_DIR]
          .filter(Boolean)
          .join(path.delimiter),
      },
    },
  );

  attachProcess(benchmarkId, proc);

  return NextResponse.json({
    ok: true,
    benchmarkId,
    benchmarkName,
    configPath,
    pid: proc.pid,
  });
}
