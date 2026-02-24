import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Projects テーブル
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Usage Logs テーブル
export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").notNull(), // 生データをJSONBで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("usage_logs_project_id_idx").on(table.projectId)],
);

// Datasets テーブル
export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("datasets_project_name_unique").on(table.projectId, table.name),
    index("datasets_project_id_idx").on(table.projectId),
  ],
);

// Samples テーブル
export const samples = pgTable(
  "samples",
  {
    id: text("id").primaryKey().notNull(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    info: jsonb("info").notNull(), // input, json_schema, usage_output等をJSONBで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("samples_dataset_id_idx").on(table.datasetId)],
);

// Trials テーブル
export const trials = pgTable(
  "trials",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    benchmarkId: uuid("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    sampleId: text("sample_id")
      .notNull()
      .references(() => samples.id, { onDelete: "cascade" }),
    modelName: text("model_name").notNull(),
    result: jsonb("result").notNull(), // output, tokens, latency_ms, cost_usd等をJSONBで保持
    costUsd: text("cost_usd"), // numeric型の代わりにtextで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("trials_benchmark_sample_model_unique").on(
      table.benchmarkId,
      table.sampleId,
      table.modelName,
    ),
    index("trials_sample_id_idx").on(table.sampleId),
    index("trials_benchmark_id_idx").on(table.benchmarkId),
  ],
);

// Benchmarks テーブル
export const benchmarks = pgTable(
  "benchmarks",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config").notNull(), // config.yamlの内容をJSONBで保持
    info: jsonb("info").notNull(), // info.jsonの内容をJSONBで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("benchmarks_dataset_name_unique").on(table.datasetId, table.name),
    index("benchmarks_dataset_id_idx").on(table.datasetId),
  ],
);

// Arena Matches テーブル
export const arenaMatches = pgTable(
  "arena_matches",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    benchmarkId: uuid("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    matchIndex: integer("match_index").notNull(),
    sampleId: text("sample_id")
      .notNull()
      .references(() => samples.id, { onDelete: "cascade" }),
    matchData: jsonb("match_data").notNull(), // match詳細をJSONBで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("arena_matches_benchmark_match_unique").on(
      table.benchmarkId,
      table.matchIndex,
    ),
    index("arena_matches_benchmark_id_idx").on(table.benchmarkId),
    index("arena_matches_sample_id_idx").on(table.sampleId),
  ],
);

// Rating Steps テーブル
export const ratingSteps = pgTable(
  "rating_steps",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    benchmarkId: uuid("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    stepData: jsonb("step_data").notNull(), // rankings, stats, cost等をJSONBで保持
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("rating_steps_benchmark_step_unique").on(
      table.benchmarkId,
      table.step,
    ),
    index("rating_steps_benchmark_id_idx").on(table.benchmarkId),
  ],
);

// リレーション定義
export const projectsRelations = relations(projects, ({ many }) => ({
  usageLogs: many(usageLogs),
  datasets: many(datasets),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  project: one(projects, {
    fields: [usageLogs.projectId],
    references: [projects.id],
  }),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id],
  }),
  samples: many(samples),
  benchmarks: many(benchmarks),
}));

export const samplesRelations = relations(samples, ({ one, many }) => ({
  dataset: one(datasets, {
    fields: [samples.datasetId],
    references: [datasets.id],
  }),
  trials: many(trials),
  arenaMatches: many(arenaMatches),
}));

export const trialsRelations = relations(trials, ({ one }) => ({
  sample: one(samples, { fields: [trials.sampleId], references: [samples.id] }),
  benchmark: one(benchmarks, {
    fields: [trials.benchmarkId],
    references: [benchmarks.id],
  }),
}));

export const benchmarksRelations = relations(benchmarks, ({ one, many }) => ({
  dataset: one(datasets, {
    fields: [benchmarks.datasetId],
    references: [datasets.id],
  }),
  arenaMatches: many(arenaMatches),
  ratingSteps: many(ratingSteps),
  trials: many(trials),
}));

export const arenaMatchesRelations = relations(arenaMatches, ({ one }) => ({
  benchmark: one(benchmarks, {
    fields: [arenaMatches.benchmarkId],
    references: [benchmarks.id],
  }),
  sample: one(samples, {
    fields: [arenaMatches.sampleId],
    references: [samples.id],
  }),
}));

export const ratingStepsRelations = relations(ratingSteps, ({ one }) => ({
  benchmark: one(benchmarks, {
    fields: [ratingSteps.benchmarkId],
    references: [benchmarks.id],
  }),
}));
