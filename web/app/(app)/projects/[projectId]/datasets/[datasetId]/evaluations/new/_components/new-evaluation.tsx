"use client";

import { Check, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModelLabel } from "@/components/model-label";
import { getRunningBenchmark } from "@/components/running-benchmark-banner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DatasetCapabilities } from "@/lib/config/dataset-capabilities";
import type { ModelDefinition } from "@/lib/config/models-types";
import { supportsPdfBase64 } from "@/lib/config/models-utils";
import type { BenchmarkConfig } from "@/lib/config/schema";
import { ModelPicker } from "./model-picker";
import { StartBenchmarkButton } from "./start-benchmark-button";

export type EvaluationInput = {
  datasetId: string;
  datasetName: string;
  projectId: string;
  projectName: string;
};

export type EvaluationSetupValue = {
  candidateModels: string[];
  judgeModels: string[];
  maxMatches: number | null;
  judgeOutputLanguage: "en" | "ja";
  ratingBackend: "glicko2" | "elo";
};

const OUTPUT_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
] as const;

const RATING_BACKENDS = [
  { value: "glicko2", label: "Glicko-2" },
  { value: "elo", label: "ELO" },
] as const;

const SELECTION_CONFIG: Record<
  "glicko2" | "elo",
  BenchmarkConfig["selection"]
> = {
  glicko2: {
    strategy: "glicko2",
    baseline_weight: 0,
    avoid_recent_duplicates: true,
    recent_window: 10,
  },
  elo: {
    strategy: "baseline_star_adaptive",
    baseline_weight: 0.6,
    prefer_close_ratings: true,
    avoid_recent_duplicates: true,
    recent_window: 10,
  },
};

const RATING_CONFIG: Record<"glicko2" | "elo", BenchmarkConfig["rating"]> = {
  glicko2: {
    backend: "glicko2",
    glicko2: {
      initial_mu: 1500,
      initial_phi: 350,
      initial_sigma: 0.06,
      tau: 0.5,
      epsilon: 1e-6,
    },
  },
  elo: {
    backend: "elo",
    elo: {
      k_initial: 32,
      k_default: 16,
      k_stable: 8,
      draw_value: 0.5,
    },
  },
};

const DEFAULT_CONFIG: Omit<
  BenchmarkConfig,
  "models" | "stopping" | "judge_output_language" | "rating"
> & {
  stopping: Omit<BenchmarkConfig["stopping"], "max_matches">;
} = {
  execution: {
    seed: 42,
    n_parallel: 5,
    match_batch_size: 5,
    provider_parallel_limits: {
      openai: 5,
      gemini: 5,
      anthropic: 5,
      default: 5,
    },
  },
  selection: {
    strategy: "glicko2",
    baseline_weight: 0,
    avoid_recent_duplicates: true,
    recent_window: 10,
  },
  stopping: { min_star_per_model: 3 },
};

const PDF_PROVIDER_PARALLEL_LIMITS = {
  openai: 3,
  gemini: 3,
  anthropic: 3,
  default: 3,
} as const;

function buildConfig(
  value: EvaluationSetupValue,
  requiresPdf: boolean,
): BenchmarkConfig {
  return {
    ...DEFAULT_CONFIG,
    execution: {
      ...DEFAULT_CONFIG.execution,
      ...(requiresPdf
        ? { provider_parallel_limits: PDF_PROVIDER_PARALLEL_LIMITS }
        : {}),
    },
    models: {
      trials: value.candidateModels,
      judges: value.judgeModels,
    },
    selection: SELECTION_CONFIG[value.ratingBackend],
    rating: RATING_CONFIG[value.ratingBackend],
    stopping: {
      ...DEFAULT_CONFIG.stopping,
      max_matches: value.maxMatches ?? 100,
    },
    ...(value.candidateModels.length > 0
      ? { baseline_model: value.candidateModels[0] }
      : {}),
    judge_output_language: value.judgeOutputLanguage,
  };
}

export function NewEvaluation(props: {
  input: EvaluationInput;
  defaultValue?: Partial<EvaluationSetupValue>;
  models: ModelDefinition[];
  datasetCapabilities: DatasetCapabilities;
}) {
  const { input, models: allModels, datasetCapabilities } = props;

  // Calculate evaluable sample count for each model
  const modelEvaluableCounts = useMemo(() => {
    const counts = new Map<string, { evaluable: number; total: number }>();
    const { totalSamples, pdfSampleCount } = datasetCapabilities;

    for (const model of allModels) {
      const supportsPdf = supportsPdfBase64(model);
      const evaluable = supportsPdf
        ? totalSamples
        : totalSamples - pdfSampleCount;

      counts.set(model.model, { evaluable, total: totalSamples });
    }

    return counts;
  }, [allModels, datasetCapabilities]);

  const models = allModels.map((m) => m.model);

  const [candidateModels, setCandidateModels] = useState<string[]>(
    props.defaultValue?.candidateModels ?? [],
  );
  const [judgeModels, setJudgeModels] = useState<string[]>(
    props.defaultValue?.judgeModels ?? [],
  );
  const [maxMatches, setMaxMatches] = useState<number | null>(
    props.defaultValue?.maxMatches ?? 100,
  );
  const [judgeOutputLanguage, setJudgeOutputLanguage] = useState<"en" | "ja">(
    props.defaultValue?.judgeOutputLanguage ?? "en",
  );
  const [ratingBackend, setRatingBackend] = useState<"glicko2" | "elo">(
    props.defaultValue?.ratingBackend ?? "glicko2",
  );

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const value: EvaluationSetupValue = useMemo(
    () => ({
      candidateModels,
      judgeModels,
      maxMatches,
      judgeOutputLanguage,
      ratingBackend,
    }),
    [
      candidateModels,
      judgeModels,
      maxMatches,
      judgeOutputLanguage,
      ratingBackend,
    ],
  );

  const canRunBenchmark =
    candidateModels.length >= 2 &&
    judgeModels.length >= 1 &&
    maxMatches !== null &&
    maxMatches > 0;
  const config = useMemo(
    () => buildConfig(value, datasetCapabilities.requiresPdf),
    [value, datasetCapabilities.requiresPdf],
  );

  const [runningBenchmarkId, setRunningBenchmarkId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const LS_KEY = "jury-arena:running-benchmark";
    const EVT_RUNNING_CHANGED = "running-benchmark-changed";

    const sync = () => {
      const rb = getRunningBenchmark();
      setRunningBenchmarkId(rb?.benchmarkId ?? null);
    };
    sync();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) sync();
    };
    const onCustom = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT_RUNNING_CHANGED, onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT_RUNNING_CHANGED, onCustom);
    };
  }, []);

  const isBenchmarkRunning = runningBenchmarkId != null;

  return (
    <div className="h-[100dvh] max-w-5xl mx-auto flex flex-col">
      {/* Scroll Area (settings) */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Dataset capabilities info */}
        {datasetCapabilities.requiresPdf && (
          <Card className="bg-blue-50 border-blue-200 p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <title>Information</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-900 mb-1">
                  This dataset contains PDF attachments
                </h3>
                <p className="text-sm text-blue-700">
                  For models without PDF support, affected samples will be
                  skipped (e.g.,{" "}
                  {datasetCapabilities.totalSamples -
                    datasetCapabilities.pdfSampleCount}
                  /{datasetCapabilities.totalSamples} evaluated)
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Model Selection - 2 Pane Layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* Candidate Models */}
          <ModelPicker
            mode="multi"
            title="Candidate Model"
            models={models}
            modelDefinitions={allModels}
            modelEvaluableCounts={modelEvaluableCounts}
            selected={candidateModels}
            onChange={setCandidateModels}
            maxHeightClassName="max-h-96"
            showPdfBadge={true}
            countText={(n) => <>Selected: {n} models</>}
          />

          {/* Judge Models */}
          <ModelPicker
            mode="multi"
            title="Judge Model"
            models={models}
            modelDefinitions={allModels}
            modelEvaluableCounts={modelEvaluableCounts}
            selected={judgeModels}
            onChange={setJudgeModels}
            maxSelect={3}
            helperRight={
              <span className="text-xs text-slate-500">
                You can select up to 3 items
              </span>
            }
            maxHeightClassName="max-h-96"
            showPdfBadge={true}
            countText={(n, max) => (
              <>
                Selected: {n} / {max} models
              </>
            )}
          />
        </div>

        {/* Selected Models Summary */}
        {(candidateModels.length > 0 || judgeModels.length > 0) && (
          <Card className="bg-slate-100 border border-slate-100 p-4 mt-4">
            <h3 className="text-sm mb-3 text-slate-900">Selection Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-600 mb-2">
                  Candidate Model ({candidateModels.length})
                </div>
                <div className="space-y-1">
                  {candidateModels.map((model) => (
                    <div
                      key={model}
                      className="flex items-center justify-between bg-white rounded px-2 py-1"
                    >
                      <ModelLabel modelName={model} size="md" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-2">
                  Judge Model ({judgeModels.length})
                </div>
                <div className="space-y-1">
                  {judgeModels.map((model) => (
                    <div
                      key={model}
                      className="flex items-center justify-between bg-white rounded px-2 py-1"
                    >
                      <ModelLabel modelName={model} size="md" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Max Matches */}
        <div className="mt-8">
          <Label htmlFor="maxMatches" className="text-base mb-3 block">
            Max Matches
          </Label>
          <Input
            id="maxMatches"
            type="number"
            min="1"
            max="1000"
            value={maxMatches ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                setMaxMatches(null);
              } else {
                const num = parseInt(val, 10);
                setMaxMatches(Number.isNaN(num) ? null : Math.max(1, num));
              }
            }}
          />
          <p className="text-sm text-slate-500 mt-2">
            Specify the maximum number of matches to run (1-1000). Required to
            run evaluation.
          </p>
        </div>

        {/* Rating Backend */}
        <div className="mt-8">
          <Label className="text-base mb-3 block">Rating System</Label>
          <div className="inline-flex gap-3">
            {RATING_BACKENDS.map((rb) => (
              <button
                key={rb.value}
                type="button"
                onClick={() => setRatingBackend(rb.value)}
                className={`relative w-32 flex flex-col items-center justify-center rounded-md border px-6 py-3 text-sm font-medium transition-colors ${
                  ratingBackend === rb.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {ratingBackend === rb.value && (
                  <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-blue-500" />
                )}
                <span>{rb.label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-2">
            Algorithm used to compute model ratings from match results.<br />
            We recommend Glicko-2 in most cases due to its higher sample efficiency.
          </p>
        </div>

        {/* Judge Output Language */}
        <div className="mt-8">
          <Label className="text-base mb-3 block">Judge Output Language</Label>
          <div className="inline-flex gap-3">
            {OUTPUT_LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                type="button"
                onClick={() => setJudgeOutputLanguage(lang.value)}
                className={`relative w-32 flex flex-col items-center justify-center rounded-md border px-6 py-3 text-sm font-medium transition-colors ${
                  judgeOutputLanguage === lang.value
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {judgeOutputLanguage === lang.value && (
                  <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-blue-500" />
                )}
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-2">
            Language used for the judge model&apos;s evaluation output.
          </p>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="sticky bottom-0 bg-white border-t px-4 pt-8 pb-20">
        <Button
          className="w-full"
          onClick={() =>
            canRunBenchmark && !isBenchmarkRunning && setShowConfirmDialog(true)
          }
          disabled={!canRunBenchmark || isBenchmarkRunning}
          title={
            isBenchmarkRunning
              ? "Cannot start because a benchmark is already running"
              : undefined
          }
        >
          <Play className="mr-2 h-4 w-4" />
          {isBenchmarkRunning ? "Running..." : "Run"}
        </Button>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Do you want to run the evaluation?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The evaluation will start with the following settings:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="bg-slate-50 rounded p-3 space-y-3 text-sm">
            <div>
              <span className="text-slate-600">Dataset: </span>
              <span className="text-slate-900">{input.datasetName}</span>
            </div>

            <div>
              <span className="text-slate-600">Candidate Models: </span>
              <span className="text-slate-900">
                {candidateModels.length} items
              </span>
            </div>
            <div className="space-y-1 pl-3">
              {candidateModels.map((m) => (
                <div key={m}>
                  <ModelLabel modelName={m} size="sm" />
                </div>
              ))}
            </div>

            <div>
              <span className="text-slate-600">Judge Models: </span>
              <span className="text-slate-900">{judgeModels.length} items</span>
            </div>
            <div className="space-y-1 pl-3">
              {judgeModels.map((m) => (
                <div key={m}>
                  <ModelLabel modelName={m} size="sm" />
                </div>
              ))}
            </div>

            <div>
              <span className="text-slate-600">Max Matches: </span>
              <span className="text-slate-900">{maxMatches ?? "-"} items</span>
            </div>

            <div>
              <span className="text-slate-600">Rating System: </span>
              <span className="text-slate-900">
                {RATING_BACKENDS.find((rb) => rb.value === ratingBackend)
                  ?.label ?? ratingBackend}
              </span>
            </div>

            <div>
              <span className="text-slate-600">Output Language: </span>
              <span className="text-slate-900">
                {OUTPUT_LANGUAGES.find((l) => l.value === judgeOutputLanguage)
                  ?.label ?? judgeOutputLanguage}
              </span>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <StartBenchmarkButton
                projectId={input.projectId}
                datasetId={input.datasetId}
                datasetName={input.datasetName}
                config={config}
                onStarted={() => setShowConfirmDialog(false)}
                disabled={isBenchmarkRunning}
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
