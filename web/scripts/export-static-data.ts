/**
 * DB -> JSON export script for static demo site.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/export-static-data.ts
 *
 * Exports all data needed by the web UI for the specified datasets
 * into public/data/ as static JSON files.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray, sql, count, or } from "drizzle-orm";
import { Pool } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../lib/db/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const TARGET_DATASET_IDS = [
  "50660426-c42a-4e71-83ac-26cead3693c5",
  "b1dc9849-46c4-469f-813c-92fe95c3ceb9",
];

const OUT_DIR = path.resolve(__dirname, "../public/data");

// ---------------------------------------------------------------------------
// DB connection
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const {
  projects,
  datasets,
  samples,
  benchmarks,
  trials,
  arenaMatches,
  ratingSteps,
} = schema;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function writeJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  -> ${path.relative(OUT_DIR, filePath)}`);
}

function byteLen(v: string) {
  return Buffer.byteLength(v, "utf8");
}

function truncateString(value: unknown, maxBytes: number): string {
  if (value == null) return "";
  if (typeof value === "string") {
    if (byteLen(value) <= maxBytes) return value;
    const approx = Math.max(0, Math.floor(maxBytes * 0.9));
    return `${value.slice(0, approx)}\n\n[... truncated]`;
  }
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (byteLen(s) <= maxBytes) return s;
  const approx = Math.max(0, Math.floor(maxBytes * 0.9));
  return `${s.slice(0, approx)}\n\n[... truncated]`;
}

function sanitizeSampleInfo(info: any) {
  const msgs = info?.input?.messages;
  if (!Array.isArray(msgs)) return;
  for (const msg of msgs) {
    if (!msg) continue;
    if (typeof msg.content === "string") {
      if (msg.content.includes("data:")) {
        msg.content = msg.content.replace(
          /data:[^ \n\r\t]+/g,
          "[inline data removed]",
        );
      }
      continue;
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part) continue;
        if (part.type === "image_url") {
          const url = part.image_url?.url;
          if (typeof url === "string" && url.startsWith("data:")) {
            const m = url.match(/^data:([^;,]+)/);
            const mime = m?.[1] || "image";
            part.image_url.url = `[Image data removed: ${mime}]`;
          }
        }
      }
    }
  }
  if (info.usage_output != null) {
    info.usage_output = truncateString(info.usage_output, 200_000);
  }
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

async function exportProject(projectId: string) {
  console.log("\n=== Exporting project ===");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) throw new Error(`Project not found: ${projectId}`);
  console.log(`  Project: ${project.name} (${project.id})`);

  // projects.json (single project wrapped in array for compatibility)
  writeJson(path.join(OUT_DIR, "projects.json"), [project]);

  return project;
}

async function exportDatasetsList(projectId: string) {
  console.log("\n=== Exporting datasets list ===");

  // Get datasets with counts
  const sampleCounts = db
    .select({
      datasetId: samples.datasetId,
      cnt: sql<number>`count(*)`.mapWith(Number).as("sample_cnt"),
    })
    .from(samples)
    .groupBy(samples.datasetId)
    .as("sample_counts");

  const benchmarkCounts = db
    .select({
      datasetId: benchmarks.datasetId,
      cnt: sql<number>`count(distinct ${benchmarks.id})`
        .mapWith(Number)
        .as("benchmark_cnt"),
    })
    .from(benchmarks)
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .groupBy(benchmarks.datasetId)
    .as("benchmark_counts");

  const lastEvaluated = db
    .select({
      datasetId: benchmarks.datasetId,
      lastEvaluatedAt: sql<string>`max(${benchmarks.createdAt})`.as(
        "last_evaluated_at",
      ),
    })
    .from(benchmarks)
    .groupBy(benchmarks.datasetId)
    .as("last_evaluated");

  const rows = await db
    .select({
      id: datasets.id,
      projectId: datasets.projectId,
      name: datasets.name,
      createdAt: datasets.createdAt,
      sampleCount:
        sql<number>`coalesce(${sampleCounts.cnt}, 0)`.mapWith(Number),
      benchmarkCount:
        sql<number>`coalesce(${benchmarkCounts.cnt}, 0)`.mapWith(Number),
      lastEvaluatedAt: lastEvaluated.lastEvaluatedAt,
    })
    .from(datasets)
    .leftJoin(sampleCounts, eq(sampleCounts.datasetId, datasets.id))
    .leftJoin(benchmarkCounts, eq(benchmarkCounts.datasetId, datasets.id))
    .leftJoin(lastEvaluated, eq(lastEvaluated.datasetId, datasets.id))
    .where(
      and(
        eq(datasets.projectId, projectId),
        inArray(datasets.id, TARGET_DATASET_IDS),
      ),
    )
    .orderBy(desc(datasets.createdAt));

  // Project index: datasets + total + recentEvaluated
  const total = rows.length;
  const recentEvaluated = rows
    .filter((r) => r.lastEvaluatedAt != null)
    .slice(0, 4);

  writeJson(path.join(OUT_DIR, "projects", projectId, "index.json"), {
    datasets: rows,
    total,
    recentEvaluated,
  });

  return rows;
}

async function exportDatasetDetail(
  projectId: string,
  datasetId: string,
) {
  console.log(`\n=== Exporting dataset detail: ${datasetId} ===`);

  const [dataset] = await db
    .select()
    .from(datasets)
    .where(eq(datasets.id, datasetId))
    .limit(1);

  if (!dataset) {
    console.log(`  Dataset not found, skipping`);
    return;
  }

  // Sample count
  const [{ cnt: sampleCount }] = await db
    .select({ cnt: sql<number>`count(*)`.mapWith(Number) })
    .from(samples)
    .where(eq(samples.datasetId, datasetId));

  // Benchmark count (completed only)
  const [{ cnt: benchmarkCount }] = await db
    .select({
      cnt: sql<number>`count(distinct ${benchmarks.id})`.mapWith(Number),
    })
    .from(benchmarks)
    .innerJoin(ratingSteps, eq(ratingSteps.benchmarkId, benchmarks.id))
    .where(eq(benchmarks.datasetId, datasetId));

  // Recent benchmarks (up to 5)
  const recentBenchmarks = await db
    .select()
    .from(benchmarks)
    .where(eq(benchmarks.datasetId, datasetId))
    .orderBy(desc(benchmarks.createdAt))
    .limit(5);

  // For each benchmark, get finalStep + judgeModels + matchCount
  const recentEvaluations = [];
  for (const b of recentBenchmarks) {
    const [finalStep] = await db
      .select()
      .from(ratingSteps)
      .where(eq(ratingSteps.benchmarkId, b.id))
      .orderBy(desc(ratingSteps.step))
      .limit(1);

    if (!finalStep) continue;

    const stepData = finalStep.stepData as any;
    const comparison = Object.entries(stepData.rankings || {}).map(
      ([model, v]: [string, any]) => ({
        model,
        rating: Number(v.rating ?? 0),
        games: Number(v.games ?? 0),
      }),
    );

    // Judge models from latest match
    const [latestMatch] = await db
      .select({ matchData: arenaMatches.matchData })
      .from(arenaMatches)
      .where(eq(arenaMatches.benchmarkId, b.id))
      .orderBy(desc(arenaMatches.matchIndex))
      .limit(1);

    const judgeModels = (latestMatch?.matchData as any)?.judge_models ?? [];

    // Match count
    const [{ cnt: matchCount }] = await db
      .select({ cnt: sql<number>`count(*)`.mapWith(Number) })
      .from(arenaMatches)
      .where(eq(arenaMatches.benchmarkId, b.id));

    recentEvaluations.push({
      id: b.id,
      createdAt: finalStep.createdAt,
      comparison,
      matchCount,
      judgeModels,
    });
  }

  writeJson(
    path.join(OUT_DIR, "projects", projectId, "datasets", datasetId, "index.json"),
    {
      dataset,
      sampleCount,
      benchmarkCount,
      recentEvaluations,
    },
  );
}

async function exportEvaluationsList(projectId: string) {
  console.log("\n=== Exporting evaluations list ===");

  // Get all benchmarks for our target datasets that have rating steps
  const rows = await db
    .select({
      benchmarkId: benchmarks.id,
      benchmarkName: benchmarks.name,
      datasetId: datasets.id,
      datasetName: datasets.name,
      benchmarkCreatedAt: benchmarks.createdAt,
    })
    .from(benchmarks)
    .innerJoin(datasets, eq(benchmarks.datasetId, datasets.id))
    .where(
      and(
        eq(datasets.projectId, projectId),
        inArray(datasets.id, TARGET_DATASET_IDS),
      ),
    )
    .orderBy(desc(benchmarks.createdAt));

  const evaluations = [];
  for (const row of rows) {
    const [finalStep] = await db
      .select()
      .from(ratingSteps)
      .where(eq(ratingSteps.benchmarkId, row.benchmarkId))
      .orderBy(desc(ratingSteps.step))
      .limit(1);

    if (!finalStep) continue;

    const stepData = finalStep.stepData as any;
    const comparison = Object.entries(stepData.rankings || {}).map(
      ([model, v]: [string, any]) => ({
        model,
        rating: Number(v.rating ?? 0),
        games: Number(v.games ?? 0),
      }),
    );

    const [latestMatch] = await db
      .select({ matchData: arenaMatches.matchData })
      .from(arenaMatches)
      .where(eq(arenaMatches.benchmarkId, row.benchmarkId))
      .orderBy(desc(arenaMatches.matchIndex))
      .limit(1);

    const judgeModels = (latestMatch?.matchData as any)?.judge_models ?? [];

    const [{ cnt: matchCount }] = await db
      .select({ cnt: sql<number>`count(*)`.mapWith(Number) })
      .from(arenaMatches)
      .where(eq(arenaMatches.benchmarkId, row.benchmarkId));

    evaluations.push({
      id: row.benchmarkId,
      datasetId: row.datasetId,
      datasetName: row.datasetName,
      createdAt: finalStep.createdAt,
      comparison,
      matchCount,
      judgeModels,
    });
  }

  writeJson(
    path.join(OUT_DIR, "projects", projectId, "evaluations.json"),
    evaluations,
  );

  return evaluations;
}

async function exportBenchmarkDetail(
  projectId: string,
  benchmarkId: string,
) {
  console.log(`\n=== Exporting benchmark detail: ${benchmarkId} ===`);

  // Benchmark + dataset name
  const [benchmarkRow] = await db
    .select({
      id: benchmarks.id,
      datasetId: benchmarks.datasetId,
      datasetName: datasets.name,
      name: benchmarks.name,
      config: benchmarks.config,
      info: benchmarks.info,
      createdAt: benchmarks.createdAt,
    })
    .from(benchmarks)
    .innerJoin(datasets, eq(datasets.id, benchmarks.datasetId))
    .where(eq(benchmarks.id, benchmarkId))
    .limit(1);

  if (!benchmarkRow) {
    console.log(`  Benchmark not found, skipping`);
    return;
  }

  const config = benchmarkRow.config as any;
  const allModels: string[] = config?.models?.trials ?? [];

  // Final step
  const [finalStepRow] = await db
    .select()
    .from(ratingSteps)
    .where(eq(ratingSteps.benchmarkId, benchmarkId))
    .orderBy(desc(ratingSteps.step))
    .limit(1);

  if (!finalStepRow) {
    console.log(`  No rating steps, skipping`);
    return;
  }

  const finalStep = finalStepRow.stepData as any;

  // Rating history (up to 300 steps)
  const historyRows = await db
    .select({
      step: ratingSteps.step,
      createdAt: ratingSteps.createdAt,
      stepData: ratingSteps.stepData,
    })
    .from(ratingSteps)
    .where(eq(ratingSteps.benchmarkId, benchmarkId))
    .orderBy(desc(ratingSteps.step))
    .limit(300);

  const ratingHistory = historyRows.reverse().map((r) => r.stepData);

  // Model stats via raw SQL
  const statsRes = await db.execute(sql`
    WITH pairs AS (
      SELECT am.sample_id, (am.match_data->>'model_a') AS model_name
      FROM arena_matches am WHERE am.benchmark_id = ${benchmarkId}
      UNION ALL
      SELECT am.sample_id, (am.match_data->>'model_b') AS model_name
      FROM arena_matches am WHERE am.benchmark_id = ${benchmarkId}
    )
    SELECT
      t.model_name,
      AVG((t.result->>'cost_usd')::numeric)::double precision AS avg_cost_usd,
      AVG((t.result->>'latency_ms')::numeric)::double precision AS avg_latency_ms,
      COUNT(*)::integer AS cnt
    FROM pairs p
    JOIN trials t ON t.sample_id = p.sample_id AND t.model_name = p.model_name AND t.benchmark_id = ${benchmarkId}
    GROUP BY t.model_name
  `);

  const modelStatsRaw: Record<string, any> = {};
  const statsRows: any[] = (statsRes as any).rows ?? (statsRes as any);
  for (const r of statsRows) {
    modelStatsRaw[String(r.model_name)] = {
      avgCostUsd: Number(r.avg_cost_usd ?? 0),
      avgLatencyMs: Number(r.avg_latency_ms ?? 0),
      count: Number(r.cnt ?? 0),
    };
  }

  // Build modelStats from finalStep + DB stats
  const modelStats: Record<string, any> = {};
  if (finalStep) {
    for (const [model, data] of Object.entries(finalStep.rankings || {})) {
      const stats = modelStatsRaw[model];
      modelStats[model] = {
        rating: Number((data as any).rating ?? 0),
        games: Number((data as any).games ?? 0),
        cost: Number(stats?.avgCostUsd ?? 0) * 1000,
        speed: Number(stats?.avgLatencyMs ?? 0) / 1000,
      };
    }
  }

  // Match pairs for coverage
  const matchPairsRows = await db
    .select({
      sampleId: arenaMatches.sampleId,
      modelA: sql<string>`${arenaMatches.matchData}->>'model_a'`,
      modelB: sql<string>`${arenaMatches.matchData}->>'model_b'`,
    })
    .from(arenaMatches)
    .where(eq(arenaMatches.benchmarkId, benchmarkId));

  const matcheCount = matchPairsRows.length;

  // Coverage calculation
  const trialPairs: Array<{ sampleId: string; modelName: string }> = [];
  for (const p of matchPairsRows) {
    trialPairs.push(
      { sampleId: p.sampleId, modelName: p.modelA },
      { sampleId: p.sampleId, modelName: p.modelB },
    );
  }

  // Fetch trial results for coverage
  const trialResultsMap = new Map<
    string,
    { skipped: boolean; reason?: string }
  >();
  if (trialPairs.length > 0) {
    const pairConditions = trialPairs.map(({ sampleId, modelName }) =>
      and(eq(trials.sampleId, sampleId), eq(trials.modelName, modelName)),
    );

    // Process in chunks to avoid too many OR conditions
    const CHUNK = 500;
    for (let i = 0; i < pairConditions.length; i += CHUNK) {
      const chunk = pairConditions.slice(i, i + CHUNK);
      const trialRows = await db
        .select({
          sampleId: trials.sampleId,
          modelName: trials.modelName,
          result: trials.result,
        })
        .from(trials)
        .where(and(eq(trials.benchmarkId, benchmarkId), or(...chunk)));

      for (const t of trialRows) {
        const key = `${t.sampleId}:${t.modelName}`;
        const output = (t.result as any)?.output;
        if (
          output &&
          typeof output === "object" &&
          !Array.isArray(output) &&
          output.skipped === true
        ) {
          trialResultsMap.set(key, {
            skipped: true,
            reason: output.reason,
          });
        } else {
          trialResultsMap.set(key, { skipped: false });
        }
      }
    }
  }

  // Session coverage
  let completedMatches = 0;
  let skippedMatches = 0;
  const failureBreakdown = {
    unsupportedInput: 0,
    contextOverflow: 0,
    otherError: 0,
  };

  for (const p of matchPairsRows) {
    const a = trialResultsMap.get(`${p.sampleId}:${p.modelA}`);
    const b = trialResultsMap.get(`${p.sampleId}:${p.modelB}`);
    if (!a || !b) continue;

    if (a.skipped || b.skipped) {
      skippedMatches++;
      const reason = a.skipped ? a.reason : b.reason;
      switch (reason) {
        case "UNSUPPORTED_INPUT":
          failureBreakdown.unsupportedInput++;
          break;
        case "CONTEXT_OVERFLOW":
          failureBreakdown.contextOverflow++;
          break;
        default:
          failureBreakdown.otherError++;
          break;
      }
    } else {
      completedMatches++;
    }
  }

  const coverage = {
    completedMatches,
    skippedMatches,
    totalMatches: matcheCount,
    sessionCoverage:
      matcheCount > 0 ? (completedMatches / matcheCount) * 100 : 100,
    failureBreakdown,
  };

  // Model coverage
  const modelCoverage: Record<string, any> = {};
  const seen = new Set<string>();
  const uniqueTrialPairs: Array<{ sampleId: string; modelName: string }> = [];
  for (const p of matchPairsRows) {
    for (const [sid, mn] of [
      [p.sampleId, p.modelA],
      [p.sampleId, p.modelB],
    ]) {
      const key = `${sid}:${mn}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTrialPairs.push({ sampleId: sid, modelName: mn });
      }
    }
  }

  for (const m of allModels) {
    modelCoverage[m] = {
      totalTrials: 0,
      completedTrials: 0,
      skippedTrials: 0,
      modelCoverage: 100,
      failureBreakdown: {
        unsupportedInput: 0,
        contextOverflow: 0,
        otherError: 0,
      },
    };
  }

  for (const pair of uniqueTrialPairs) {
    const mc = modelCoverage[pair.modelName];
    if (!mc) continue;
    const tr = trialResultsMap.get(`${pair.sampleId}:${pair.modelName}`);
    if (!tr) continue;
    mc.totalTrials++;
    if (tr.skipped) {
      mc.skippedTrials++;
      switch (tr.reason) {
        case "UNSUPPORTED_INPUT":
          mc.failureBreakdown.unsupportedInput++;
          break;
        case "CONTEXT_OVERFLOW":
          mc.failureBreakdown.contextOverflow++;
          break;
        default:
          mc.failureBreakdown.otherError++;
          break;
      }
    } else {
      mc.completedTrials++;
    }
  }

  for (const m of allModels) {
    const c = modelCoverage[m];
    c.modelCoverage =
      c.totalTrials > 0 ? (c.completedTrials / c.totalTrials) * 100 : 100;
  }

  writeJson(
    path.join(
      OUT_DIR,
      "projects",
      projectId,
      "evaluations",
      benchmarkId,
      "index.json",
    ),
    {
      benchmark: {
        id: benchmarkRow.id,
        datasetId: benchmarkRow.datasetId,
        datasetName: benchmarkRow.datasetName,
        name: benchmarkRow.name,
        config,
        info: benchmarkRow.info,
        createdAt: benchmarkRow.createdAt,
      },
      ratingHistory,
      modelStats,
      finalStep,
      baselineModel: config?.baseline_model ?? "",
      matcheCount,
      coverage,
      modelCoverage,
    },
  );

  return benchmarkId;
}

async function exportMatches(
  projectId: string,
  benchmarkId: string,
) {
  console.log(`\n=== Exporting matches for benchmark: ${benchmarkId} ===`);

  // Match list (lightweight)
  const matchRows = await db
    .select({
      id: arenaMatches.id,
      matchIndex: arenaMatches.matchIndex,
      sampleId: arenaMatches.sampleId,
      createdAt: arenaMatches.createdAt,
      matchData: arenaMatches.matchData,
    })
    .from(arenaMatches)
    .where(eq(arenaMatches.benchmarkId, benchmarkId))
    .orderBy(desc(arenaMatches.createdAt), desc(arenaMatches.id));

  // List format (lightweight - extract only needed fields)
  const matchList = matchRows.map((row) => {
    const md = row.matchData as any;
    return {
      id: row.id,
      matchIndex: row.matchIndex,
      sampleId: row.sampleId,
      createdAt: row.createdAt,
      match: {
        match_id: md.match_id,
        sample_id: md.sample_id,
        model_a: md.model_a,
        model_b: md.model_b,
        winner: md.winner,
        judge_models: md.judge_models ?? [],
        created_at: md.created_at,
      },
    };
  });

  writeJson(
    path.join(OUT_DIR, "projects", projectId, "matches", `${benchmarkId}.json`),
    { matches: matchList },
  );

  // Match details (full, for each match)
  console.log(`  Exporting ${matchRows.length} match details...`);
  for (const row of matchRows) {
    const md = row.matchData as any;

    // Remove judge_prompt (base64 PDF)
    delete md.judge_prompt;

    // Truncate judge_details.output
    if (md.judge_details) {
      for (const detail of Object.values(md.judge_details) as any[]) {
        if (detail?.output && typeof detail.output === "string") {
          if (byteLen(detail.output) > 10_000) {
            detail.output = `${detail.output.slice(0, 9000)}\n\n[... truncated]`;
          }
        }
      }
    }

    // Get sample info
    const [sampleRow] = await db
      .select({ id: samples.id, info: samples.info })
      .from(samples)
      .where(eq(samples.id, row.sampleId))
      .limit(1);

    const sampleInfo = sampleRow ? { ...(sampleRow.info as any) } : null;
    if (sampleInfo) {
      sanitizeSampleInfo(sampleInfo);
    }

    // Get trials for model_a and model_b
    const trialRows = await db
      .select({
        modelName: trials.modelName,
        result: trials.result,
      })
      .from(trials)
      .where(
        and(
          eq(trials.benchmarkId, benchmarkId),
          eq(trials.sampleId, row.sampleId),
          inArray(trials.modelName, [md.model_a, md.model_b]),
        ),
      );

    const trialMap: Record<string, any> = {};
    for (const t of trialRows) {
      const result = { ...(t.result as any) };
      result.output = truncateString(result.output, 300_000);
      trialMap[t.modelName] = result;
    }

    writeJson(
      path.join(
        OUT_DIR,
        "projects",
        projectId,
        "matches",
        "detail",
        `${row.id}.json`,
      ),
      {
        id: row.id,
        matchIndex: row.matchIndex,
        sampleId: row.sampleId,
        createdAt: row.createdAt,
        match: md,
        sampleInfo,
        trialA: trialMap[md.model_a] ?? null,
        trialB: trialMap[md.model_b] ?? null,
      },
    );
  }
}

async function exportSamples(
  projectId: string,
  datasetId: string,
) {
  console.log(`\n=== Exporting samples for dataset: ${datasetId} ===`);

  const sampleRows = await db
    .select({
      id: samples.id,
      info: samples.info,
      createdAt: samples.createdAt,
    })
    .from(samples)
    .where(eq(samples.datasetId, datasetId))
    .orderBy(desc(samples.createdAt), desc(samples.id));

  const sanitized = sampleRows.map((row) => {
    const info = { ...(row.info as any) };
    sanitizeSampleInfo(info);
    return { id: row.id, info, createdAt: row.createdAt };
  });

  writeJson(
    path.join(OUT_DIR, "projects", projectId, "samples", `${datasetId}.json`),
    { samples: sanitized, total: sanitized.length },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Starting static data export...");
  console.log(`Output: ${OUT_DIR}`);

  // Clean output dir
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true });
  }

  // 1. Find project
  const [datasetRow] = await db
    .select({ projectId: datasets.projectId })
    .from(datasets)
    .where(eq(datasets.id, TARGET_DATASET_IDS[0]))
    .limit(1);

  if (!datasetRow) throw new Error("Dataset not found");
  const projectId = datasetRow.projectId;

  // 2. Export project
  await exportProject(projectId);

  // 3. Export datasets list
  await exportDatasetsList(projectId);

  // 4. For each dataset: detail + samples
  for (const datasetId of TARGET_DATASET_IDS) {
    await exportDatasetDetail(projectId, datasetId);
    await exportSamples(projectId, datasetId);
  }

  // 5. Export evaluations list
  const evaluations = await exportEvaluationsList(projectId);

  // 6. For each benchmark: detail + matches
  if (evaluations) {
    for (const ev of evaluations) {
      await exportBenchmarkDetail(projectId, ev.id);
      await exportMatches(projectId, ev.id);
    }
  }

  console.log("\n=== Export complete! ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Export failed:", err);
  pool.end();
  process.exit(1);
});
