// =================================================================================================
// jsonb.ts（修正版・全量）
// =================================================================================================
import { z } from "zod";

// ===== Usage Log Metadata =====
export const UsageLogMetadataSchema = z.record(z.string(), z.unknown()); // 柔軟なメタデータ構造
export type UsageLogMetadata = z.infer<typeof UsageLogMetadataSchema>;

// ===== Sample Info =====

/**
 * Content part for messages
 * Supports text and file attachments (via file_ref)
 */
export const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const FileRefContentPartSchema = z.object({
  type: z.literal("file_ref"),
  path: z.string(), // Relative path within ZIP (e.g., "attachments/doc1.pdf")
});

export const ImageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
  }),
});

export const ContentPartSchema = z.union([
  TextContentPartSchema,
  FileRefContentPartSchema,
  ImageUrlContentPartSchema,
]);

export type TextContentPart = z.infer<typeof TextContentPartSchema>;
export type FileRefContentPart = z.infer<typeof FileRefContentPartSchema>;
export type ImageUrlContentPart = z.infer<typeof ImageUrlContentPartSchema>;
export type ContentPart = z.infer<typeof ContentPartSchema>;

/**
 * Message schema supporting both simple string content and structured content parts
 */
export const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([
    z.string(), // Simple text message (backward compatible)
    z.array(ContentPartSchema), // Structured content with attachments
  ]),
});

export const SampleInfoSchema = z.object({
  input: z.object({
    messages: z.array(MessageSchema),
  }),
  json_schema: z.record(z.string(), z.unknown()).optional(),
  usage_output: z
    .union([
      z.string(),
      z.record(z.string(), z.unknown()),
      z.array(z.unknown()),
    ])
    .nullable()
    .optional(),
});

export type SampleInfo = z.infer<typeof SampleInfoSchema>;

// ===== Trial Result =====
export const TrialResultSchema = z.object({
  output: z.union([
    z.string(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
  }),
  latency_ms: z.number(),
  cost_usd: z.number(),
  params: z
    .object({
      temperature: z.number().optional(),
      system: z.string().optional(),
    })
    .optional(),
});

export type TrialResult = z.infer<typeof TrialResultSchema>;

// ===== Benchmark Config =====
export const BenchmarkConfigSchema = z.object({
  models: z.object({
    trials: z.array(z.string()),
    judges: z.array(z.string()),
  }),
  baseline_model: z.string(),
  execution: z.object({
    seed: z.number(),
    n_parallel: z.number(),
    match_batch_size: z.number(),
  }),
  selection: z.object({
    strategy: z.string(),
    baseline_weight: z.number().optional(),
    prefer_close_ratings: z.boolean().optional(),
    avoid_recent_duplicates: z.boolean().optional(),
    recent_window: z.number().int().optional(),
  }),
  rating: z.object({
    backend: z.union([z.literal("elo"), z.literal("glicko2")]),
    elo: z
      .object({
        k_initial: z.number(),
        k_default: z.number(),
        k_stable: z.number(),
        draw_value: z.number(),
      })
      .optional(),
    glicko2: z
      .object({
        initial_mu: z.number(),
        initial_phi: z.number(),
        initial_sigma: z.number(),
        tau: z.number(),
        epsilon: z.number(),
      })
      .optional(),
  }),
  stopping: z.object({
    max_matches: z.number(),
    min_star_per_model: z.number(),
  }),
});

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

// ===== Benchmark Info =====
export const BenchmarkInfoSchema = z.object({
  dataset: z.string(),
  created_at: z.string(),
});

export type BenchmarkInfo = z.infer<typeof BenchmarkInfoSchema>;

// ===== Arena Match Data =====
export const JudgeDetailSchema = z.object({
  output: z.string(),
  winner: z.string(),
});

export const ArenaMatchDataSchema = z.object({
  match_id: z.string(),
  sample_id: z.string(),
  model_a: z.string(),
  model_b: z.string(),
  judge_models: z.array(z.string()),
  judge_prompt: z.string(),
  winner: z.string(), // "model_name" | "tie"
  judge_details: z.record(z.string(), JudgeDetailSchema),
  created_at: z.string(),
});

export type ArenaMatchData = z.infer<typeof ArenaMatchDataSchema>;

// ===== Rating Step Data =====
export const ModelRankingSchema = z
  .object({
    rating: z.number(),
    games: z.number(),
  })
  .passthrough();

export const RatingStepDataSchema = z.object({
  step: z.number(),
  rankings: z.record(z.string(), ModelRankingSchema),
  stats: z.object({
    baseline_win_rate: z.number().optional(),
    best_model: z
      .object({
        model: z.string(),
        rating: z.number(),
        games: z.number(),
        win_rate: z.number(),
      })
      .optional(),
  }),
  cost: z.object({
    judge_total_usd: z.number(),
    trial_total_usd: z.number(),
  }),
  created_at: z.string(),
});

export type RatingStepData = z.infer<typeof RatingStepDataSchema>;
