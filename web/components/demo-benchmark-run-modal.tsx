"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setActive } from "@/lib/active-benchmark";
import { setRunningBenchmark } from "./running-benchmark-banner";
import { BenchmarkRatingsChart } from "./benchmark-ratings-chart";
import { RatingLegend } from "./rating-legend";

// ---------------------------------------------------------------------------
// Sample evaluation links (pre-built demo results)
// ---------------------------------------------------------------------------

const DEMO_EVALUATION_PROJECTID = "c46d3901-f8c4-4e8f-acc8-7ab75f38dd0e";

const SAMPLE_RESULTS = [
  {
    label: "template samples en",
    href: `/projects/${DEMO_EVALUATION_PROJECTID}/evaluations/1906e2b1-752f-4440-8a0e-ccb61a3d70d8`,
  },
  {
    label: "template samples jp",
    href: `/projects/${DEMO_EVALUATION_PROJECTID}/evaluations/4b651e53-5a5b-4d2c-8115-40504ee2bb1d`,
  },
];

// ---------------------------------------------------------------------------
// Mock animation data — derived from the real "template samples en" evaluation
// ---------------------------------------------------------------------------

const MOCK_MODELS = [
  "openrouter/anthropic/claude-sonnet-4.6",
  "openrouter/moonshotai/kimi-k2.5",
  "openai/gpt-5.4",
  "openrouter/minimax/minimax-m2.5",
  "gemini/gemini-2.5-pro",
  "openrouter/bytedance-seed/seed-2.0-mini",
  "openrouter/z-ai/glm-5",
  "openrouter/qwen/qwen3-235b-a22b-2507",
  "openrouter/x-ai/grok-4",
];

const FINAL_RATINGS: Record<string, number> = {
  "openrouter/anthropic/claude-sonnet-4.6": 1690.26,
  "openrouter/moonshotai/kimi-k2.5": 1684.56,
  "openai/gpt-5.4": 1674.68,
  "openrouter/minimax/minimax-m2.5": 1616.82,
  "gemini/gemini-2.5-pro": 1581.2,
  "openrouter/bytedance-seed/seed-2.0-mini": 1456.95,
  "openrouter/z-ai/glm-5": 1406.47,
  "openrouter/qwen/qwen3-235b-a22b-2507": 1344.6,
  "openrouter/x-ai/grok-4": 1116.66,
};

const TOTAL_ANIM_STEPS = 20;
const INITIAL_RATING = 1500;

/** Generate rating series with random walk that converges to final values. */
function buildMockRatingSeries() {
  const modelPaths: Record<string, number[]> = {};

  for (const model of MOCK_MODELS) {
    const final = FINAL_RATINGS[model] ?? INITIAL_RATING;
    const path: number[] = [];
    let current = INITIAL_RATING;

    for (let s = 1; s <= TOTAL_ANIM_STEPS; s++) {
      if (s === TOTAL_ANIM_STEPS) {
        // Force exact final value on last step
        path.push(final);
      } else {
        const remaining = TOTAL_ANIM_STEPS - s;
        const needed = final - current;
        // Drift toward final value; noise shrinks as we approach the end
        const drift = needed / (remaining + 1);
        const noiseScale = Math.abs(final - INITIAL_RATING) * 0.25 * (remaining / TOTAL_ANIM_STEPS);
        const noise = (Math.random() - 0.5) * 2 * noiseScale;
        current = current + drift + noise;
        path.push(current);
      }
    }

    modelPaths[model] = path;
  }

  const series: Array<{ step: number; [model: string]: number }> = [];
  for (let s = 0; s < TOTAL_ANIM_STEPS; s++) {
    const row: { step: number; [model: string]: number } = { step: (s + 1) * 5 };
    for (const model of MOCK_MODELS) {
      row[model] = Math.round(modelPaths[model]![s]!);
    }
    series.push(row);
  }
  return series;
}

const MOCK_RATING_SERIES = buildMockRatingSeries();

/** Generate sample log lines for the animation. */
function buildMockLogs(): string[] {
  const modelShortName = (m: string) => m.split("/").at(-1) ?? m;
  const logs: string[] = [];
  const pairs = [
    [MOCK_MODELS[0], MOCK_MODELS[8]],
    [MOCK_MODELS[1], MOCK_MODELS[7]],
    [MOCK_MODELS[2], MOCK_MODELS[6]],
    [MOCK_MODELS[3], MOCK_MODELS[5]],
    [MOCK_MODELS[4], MOCK_MODELS[0]],
    [MOCK_MODELS[5], MOCK_MODELS[1]],
    [MOCK_MODELS[6], MOCK_MODELS[2]],
    [MOCK_MODELS[7], MOCK_MODELS[3]],
    [MOCK_MODELS[8], MOCK_MODELS[4]],
    [MOCK_MODELS[0], MOCK_MODELS[5]],
  ];
  pairs.forEach(([a, b], i) => {
    const winner = FINAL_RATINGS[a!]! > FINAL_RATINGS[b!]! ? a : b;
    const judge = MOCK_MODELS[i % 3];
    logs.push(
      `[Match ${i + 1}] ${modelShortName(a!)} vs ${modelShortName(b!)} → Winner: ${modelShortName(winner!)} (Judge: ${modelShortName(judge!)})`,
    );
    if (i % 3 === 2) {
      logs.push(`[Rating update at step ${(i + 1) * 5}]`);
    }
  });
  return logs;
}

const MOCK_LOGS = buildMockLogs();

const MOCK_BATCH_SIZE = 5;
const MOCK_COST_PER_STEP = { trial: 0.0042, judge: 0.0018 };

// How many ms between each animation step
const STEP_INTERVAL_MS = 600;
// How many ms between each log line
const LOG_INTERVAL_MS = 400;

const legendOrderMap = new Map<string, number>();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemoBenchmarkRunModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [animStep, setAnimStep] = useState(0);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const handleModelClick = useCallback((model: string) => {
    setSelectedModel((prev) => (prev === model ? null : model));
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (!open) return;
    setAnimStep(0);
    setLogLines([]);
    setDone(false);
    setSelectedModel(null);
  }, [open]);

  // Rating series animation
  useEffect(() => {
    if (!open || done) return;
    if (animStep >= TOTAL_ANIM_STEPS) {
      setDone(true);
      return;
    }

    const id = setTimeout(() => {
      setAnimStep((s) => s + 1);
    }, STEP_INTERVAL_MS);

    return () => clearTimeout(id);
  }, [open, animStep, done]);

  // Log line animation
  useEffect(() => {
    if (!open) return;
    if (logLines.length >= MOCK_LOGS.length) return;

    const id = setTimeout(() => {
      setLogLines((prev) => [...prev, MOCK_LOGS[prev.length]!]);
    }, LOG_INTERVAL_MS);

    return () => clearTimeout(id);
  }, [open, logLines]);

  // Auto-scroll logs
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on logLines change
  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, logLines.length]);

  // Cleanup global state when modal closes
  function handleOpenChange(v: boolean) {
    if (!v) {
      setRunningBenchmark(null);
      setActive(null);
    }
    onOpenChange(v);
  }

  const chartData = useMemo(
    () => MOCK_RATING_SERIES.slice(0, animStep),
    [animStep],
  );

  const xTicks = useMemo(() => chartData.map((r) => r.step), [chartData]);

  const finalStepValue = useMemo(
    () => (chartData.length > 0 ? (chartData.at(-1)?.step ?? 0) : 0),
    [chartData],
  );

  const getModelColor = useCallback((model: string) => {
    const idx = MOCK_MODELS.indexOf(model);
    return `hsl(${(idx * 360) / MOCK_MODELS.length}, 70%, 50%)`;
  }, []);

  const mockTrialCost = animStep * MOCK_COST_PER_STEP.trial;
  const mockJudgeCost = animStep * MOCK_COST_PER_STEP.judge;
  const mockTotalCost = mockTrialCost + mockJudgeCost;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl min-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Benchmark in Progress
            <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              Demo
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            This is a simulated evaluation for demo purposes. No actual API
            calls are made.
          </DialogDescription>
        </DialogHeader>

        {/* Header info */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Dataset</div>
              <div className="font-medium">template samples en</div>
            </div>
            <div>
              <div className="text-muted-foreground">Start Time</div>
              <div className="font-medium">
                {done ? "Simulation complete" : "Running (demo)"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Step</div>
              <div className="font-medium">
                {animStep} / {TOTAL_ANIM_STEPS}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {MOCK_BATCH_SIZE} matches per step (max {TOTAL_ANIM_STEPS} steps)
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Cost</div>
              <div className="font-medium font-mono">
                {animStep > 0 ? `$${mockTotalCost.toFixed(4)}` : "-"}
              </div>
              {animStep > 0 ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Trial ${mockTrialCost.toFixed(4)} / Judge ${mockJudgeCost.toFixed(4)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {/* Chart */}
          <div className="rounded-lg border p-3 overflow-hidden">
            <BenchmarkRatingsChart
              data={chartData as Parameters<typeof BenchmarkRatingsChart>[0]["data"]}
              modelNames={MOCK_MODELS}
              getModelColor={getModelColor}
              selectedModel={selectedModel}
              onModelClick={handleModelClick}
              xTicks={xTicks}
              finalStepValue={finalStepValue}
              LegendContent={(p) => (
                <RatingLegend
                  payload={p?.payload}
                  onModelClick={handleModelClick}
                  selectedModel={selectedModel}
                />
              )}
              legendOrderMap={legendOrderMap}
            />
          </div>

          {/* Logs */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Step Log</div>
              <div className="text-xs text-muted-foreground">
                {done ? "Simulation complete" : "Running..."}
              </div>
            </div>
            <div className="h-52 overflow-auto rounded-lg border bg-muted/10 p-3 font-mono text-xs leading-relaxed">
              {logLines.length === 0 ? (
                <div className="text-muted-foreground">Initializing...</div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: display-only
                logLines.map((l, i) => <div key={i}>{l}</div>)
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>

        {/* Demo CTA — always visible */}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            This is a simulated demo run. Real results are not stored.
          </p>
          <p className="text-sm text-amber-800">
            See actual evaluation results from the sample dataset below:
          </p>
          <div className="flex flex-col gap-1.5">
            {SAMPLE_RESULTS.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => handleOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 underline underline-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {r.label}
              </Link>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
