import fs from "node:fs";
import path from "node:path";

export function resolveWorkerDir(): string {
  const env = process.env.WORKER_DIR;
  const cwd = process.cwd();

  const candidate =
    env ??
    (path.basename(cwd) === "web"
      ? path.resolve(cwd, "..", "worker")
      : path.resolve(cwd, "worker"));

  if (!fs.existsSync(candidate)) {
    throw new Error(`Resolved WORKER_DIR does not exist: ${candidate}`);
  }

  return candidate;
}

export function getWorkerConfigDir() {
  return path.join(resolveWorkerDir(), "config");
}

export function getWorksetsDir() {
  return path.join(resolveWorkerDir(), "worksets");
}

export function getProjectWorksetDir(projectId: string) {
  return path.join(getWorksetsDir(), projectId);
}

export function getBenchmarkDir(
  projectId: string,
  datasetId: string,
  benchmarkId: string,
) {
  return path.join(
    getProjectWorksetDir(projectId),
    "datasets",
    datasetId,
    "benchmarks",
    benchmarkId,
  );
}

export function getDatasetDir(projectId: string, datasetId: string) {
  return path.join(getProjectWorksetDir(projectId), "datasets", datasetId);
}

export function getSampleInfoPath(args: {
  projectId: string;
  datasetId: string;
  sampleId: string;
}) {
  const workerDir = resolveWorkerDir();
  return path.join(
    workerDir,
    "worksets",
    args.projectId,
    "datasets",
    args.datasetId,
    "samples",
    args.sampleId,
    "info.json",
  );
}

export function resolveWebDir(): string {
  const env = process.env.WEB_DIR;
  const cwd = process.cwd();

  const candidate =
    env ?? (path.basename(cwd) === "web" ? cwd : path.resolve(cwd, "web"));

  if (!fs.existsSync(candidate)) {
    throw new Error(`Resolved WEB_DIR does not exist: ${candidate}`);
  }
  return candidate;
}

export function getTemplateDir() {
  return path.join(resolveWebDir(), "lib", "templates");
}

export function getTemplateFilePath(templateKey: string) {
  return path.join(getTemplateDir(), `${templateKey}.jsonl`);
}
