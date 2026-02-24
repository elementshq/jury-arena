import { z } from "zod";

/**
 * モデル名
 */
const ModelName = z.string().min(1);

/**
 * models
 */
const ModelsSchema = z.object({
  trials: z.array(ModelName).min(1),
  judges: z.array(ModelName).min(1),
});

/**
 * プロバイダ別の並列度制限
 */
const ProviderParallelLimitsSchema = z.object({
  openai: z.number().int().min(1).optional(),
  gemini: z.number().int().min(1).optional(),
  anthropic: z.number().int().min(1).optional(),
  default: z.number().int().min(1).optional(),
});

/**
 * execution
 */
const ExecutionSchema = z.object({
  seed: z.number().int(),
  n_parallel: z.number().int().min(1),
  match_batch_size: z.number().int().min(1),
  provider_parallel_limits: ProviderParallelLimitsSchema.optional(),
});

/**
 * selection
 */
const SelectionSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("baseline_star_adaptive"),
    baseline_weight: z.number().min(0).max(1),
    prefer_close_ratings: z.boolean(),
    avoid_recent_duplicates: z.boolean(),
    recent_window: z.number().int().min(1),
  }),
  z.object({
    strategy: z.literal("glicko2"),
    baseline_weight: z.number().min(0).max(1),
    avoid_recent_duplicates: z.boolean(),
    recent_window: z.number().int().min(1),
  }),
]);

/**
 * rating (Elo)
 */
const EloRatingSchema = z.object({
  k_initial: z.number().positive(),
  k_default: z.number().positive(),
  k_stable: z.number().positive(),
  draw_value: z.number().min(0).max(1),
});

const Glicko2RatingSchema = z.object({
  initial_mu: z.number().positive(),
  initial_phi: z.number().positive(),
  initial_sigma: z.number().positive(),
  tau: z.number().positive(),
  epsilon: z.number().positive(),
});

const RatingSchema = z.object({
  backend: z.union([z.literal("elo"), z.literal("glicko2")]),
  elo: EloRatingSchema.optional(),
  glicko2: Glicko2RatingSchema.optional(),
});

/**
 * stopping
 */
const StoppingSchema = z.object({
  max_matches: z.number().int().min(1),
  min_star_per_model: z.number().int().min(1),
});

/**
 * Arena / Benchmark Config (root)
 */
export const BenchmarkConfigSchema = z.object({
  models: ModelsSchema,
  baseline_model: ModelName.optional(),
  judge_output_language: z.enum(["en", "ja"]).default("en"),
  execution: ExecutionSchema,
  selection: SelectionSchema,
  rating: RatingSchema,
  stopping: StoppingSchema,
});

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;
