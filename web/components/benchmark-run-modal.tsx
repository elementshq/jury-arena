"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BenchmarkRatingsChart } from "./benchmark-ratings-chart";
// ★ 既存にある前提（あなたのプロジェクト側の実装をそのまま import してください）
import { RatingLegend } from "./rating-legend";
// import { RatingTooltip } from "./rating-tooltip";
import {
  setBenchmarkRunModalOpen,
  setRunningBenchmark,
} from "./running-benchmark-banner";

type BenchmarkState = {
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

const MAX_LINES = 50;

type ParsedSseEvent = { event: string; data: string };

function isTerminalStatus(s?: BenchmarkState["status"] | null) {
  return s === "finished" || s === "failed" || s === "stopped";
}

function isActiveStatus(s?: BenchmarkState["status"] | null) {
  return s === "queued" || s === "running";
}

function parseSseChunk(buffer: string): {
  events: ParsedSseEvent[];
  rest: string;
} {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: ParsedSseEvent[] = [];

  for (const part of parts) {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim() || "message";
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }

    const data = dataLines.join("\n");
    events.push({ event: eventName, data });
  }

  return { events, rest };
}

function sseEventToStatus(ev: string): BenchmarkState["status"] | null {
  if (ev === "done") return "finished";
  if (ev === "failed") return "failed";
  if (ev === "stopped") return "stopped";
  return null;
}

/**
 * SSE payloads
 */
type RatingPayload = {
  step: number;
  ratings: Record<string, number>;
};

type BundlePayload = {
  message?: string;
  rating?: RatingPayload;
  raw?: unknown;
};

function upsertRatingRow(
  series: BenchmarkState["ratingSeries"],
  payload: RatingPayload,
) {
  const row: { step: number; [modelName: string]: number } = {
    step: payload.step,
    ...payload.ratings,
  };

  const idx = series.findIndex((r) => r.step === payload.step);
  if (idx >= 0) {
    const next = [...series];
    next[idx] = { ...next[idx], ...row };
    return next;
  }
  return [...series, row].sort((a, b) => a.step - b.step);
}

// 例：Legend の表示順（元の legendOrderMap があるならそれを使ってください）
const legendOrderMap = new Map<string, number>();

export function BenchmarkRunModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  benchmarkId: string;
  onTerminal?: () => void;
}) {
  const { open, onOpenChange, benchmarkId, onTerminal } = props;

  const [state, setState] = useState<BenchmarkState | null>(null);

  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);

  const [stopping, setStopping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const prevStatusRef = useRef<BenchmarkState["status"] | null>(null);

  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const [confirmStopOpen, setConfirmStopOpen] = useState(false);

  const handleModelClick = useCallback((model: string) => {
    setSelectedModel((prev) => (prev === model ? null : model));
  }, []);

  const maybeClearRunningByTransition = useCallback(
    (nextStatus: BenchmarkState["status"]) => {
      const prev = prevStatusRef.current;

      if (prev == null) {
        prevStatusRef.current = nextStatus;
        return;
      }

      prevStatusRef.current = nextStatus;

      if (isTerminalStatus(nextStatus) && isActiveStatus(prev)) {
        onTerminal?.();
      }
    },
    [onTerminal],
  );

  useEffect(() => {
    if (open) setBenchmarkRunModalOpen(true);
    else setBenchmarkRunModalOpen(false);

    return () => {
      setBenchmarkRunModalOpen(false);
    };
  }, [open]);

  // state poll
  useEffect(() => {
    if (!open) return;
    prevStatusRef.current = null;

    let cancelled = false;
    const ac = new AbortController();

    async function tick() {
      try {
        const res = await fetch(
          `/api/benchmarks/${encodeURIComponent(benchmarkId)}/state`,
          { cache: "no-store", signal: ac.signal },
        );
        if (!res.ok) throw new Error(`state ${res.status}`);

        const data = (await res.json()) as BenchmarkState;

        if (!cancelled) {
          setState(data);
        }

        maybeClearRunningByTransition(data.status);

        if (isTerminalStatus(data.status)) return;

        setTimeout(tick, 1500);
      } catch {
        if (!cancelled) setTimeout(tick, 2000);
      }
    }

    tick();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, benchmarkId, maybeClearRunningByTransition]);

  // SSE stream
  useEffect(() => {
    if (!open) return;
    prevStatusRef.current = null;

    let cancelled = false;
    const ac = new AbortController();

    setStreamLines([]);
    setStreamConnected(false);

    async function connectLoop() {
      let backoffMs = 500;

      while (!cancelled) {
        try {
          setStreamConnected(false);

          const res = await fetch(
            `/api/benchmarks/${encodeURIComponent(benchmarkId)}/stream`,
            {
              method: "GET",
              headers: { accept: "text/event-stream" },
              cache: "no-store",
              signal: ac.signal,
            },
          );

          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

          setStreamConnected(true);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";

          let shouldStop = false;

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });

            const { events, rest } = parseSseChunk(buf);
            buf = rest;

            for (const ev of events) {
              if (ev.event === "message") {
                if (!ev.data) continue;
                setStreamLines((prev) => {
                  const next = [...prev, ev.data];
                  return next.length > MAX_LINES
                    ? next.slice(next.length - MAX_LINES)
                    : next;
                });
                continue;
              }

              if (ev.event === "rating" && ev.data) {
                try {
                  const payload = JSON.parse(ev.data) as RatingPayload;

                  setState((prev) => {
                    if (!prev) return prev;

                    const names =
                      prev.models?.names?.length > 0
                        ? prev.models.names
                        : Object.keys(payload.ratings);

                    return {
                      ...prev,
                      models:
                        prev.models?.names?.length > 0
                          ? prev.models
                          : { count: names.length, names },
                      step: {
                        ...prev.step,
                        current: Math.max(prev.step.current ?? 0, payload.step),
                      },
                      ratingSeries: upsertRatingRow(
                        prev.ratingSeries ?? [],
                        payload,
                      ),
                    };
                  });
                } catch (e) {
                  setStreamLines((prev) => {
                    const next = [...prev, `[rating parse error] ${String(e)}`];
                    return next.length > MAX_LINES
                      ? next.slice(next.length - MAX_LINES)
                      : next;
                  });
                }
                continue;
              }

              if (ev.event === "bundle" && ev.data) {
                try {
                  const x = JSON.parse(ev.data) as BundlePayload;
                  const payload = x.rating;
                  if (payload) {
                    setState((prev) => {
                      if (!prev) return prev;

                      const names =
                        prev.models?.names?.length > 0
                          ? prev.models.names
                          : Object.keys(payload.ratings);

                      return {
                        ...prev,
                        models:
                          prev.models?.names?.length > 0
                            ? prev.models
                            : { count: names.length, names },
                        step: {
                          ...prev.step,
                          current: Math.max(
                            prev.step.current ?? 0,
                            payload.step,
                          ),
                        },
                        ratingSeries: upsertRatingRow(
                          prev.ratingSeries ?? [],
                          payload,
                        ),
                      };
                    });
                  }
                } catch (e) {
                  setStreamLines((prev) => {
                    const next = [...prev, `[bundle parse error] ${String(e)}`];
                    return next.length > MAX_LINES
                      ? next.slice(next.length - MAX_LINES)
                      : next;
                  });
                }
                continue;
              }

              if (ev.event === "ingest") continue;

              if (ev.event === "error" && ev.data) {
                setStreamLines((prev) => {
                  const next = [...prev, `[SSE error] ${ev.data}`];
                  return next.length > MAX_LINES
                    ? next.slice(next.length - MAX_LINES)
                    : next;
                });
                continue;
              }

              const st = sseEventToStatus(ev.event);
              if (st) {
                maybeClearRunningByTransition(st);
                shouldStop = true;
                break;
              }
            }

            if (shouldStop) break;
          }

          setStreamConnected(false);
          backoffMs = 500;

          if (shouldStop) {
            cancelled = true;
            ac.abort();
            return;
          }
        } catch {
          setStreamConnected(false);

          if (ac.signal.aborted || cancelled) return;

          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 5000);
        }
      }
    }

    connectLoop();

    return () => {
      cancelled = true;
      ac.abort();
      setStreamConnected(false);
    };
  }, [open, benchmarkId, maybeClearRunningByTransition]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: streamLines の更新をトリガーに自動スクロールするため
  useLayoutEffect(() => {
    if (!open) return;

    const id = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });

    return () => cancelAnimationFrame(id);
  }, [open, streamLines.length]);

  const header = useMemo(() => {
    if (!state) return null;
    return (
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Dataset</div>
            <div className="font-medium">{state.datasetName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Start Time</div>
            <div className="font-medium">{state.startedAt ?? "-"}</div>
          </div>

          <div>
            <div className="text-muted-foreground">Step</div>
            <div className="font-medium">
              Status: {state.status} ({state.step.current}
              {state.step.total ? ` / ${state.step.total}` : ""} steps)
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Number of Models</div>
            <div className="font-medium">{state.models.count} models</div>
          </div>
        </div>
      </div>
    );
  }, [state]);

  const chartData = useMemo(() => {
    return (state?.ratingSeries ?? []).map((row) => ({ ...row }));
  }, [state]);

  const modelNames = useMemo(() => state?.models.names ?? [], [state]);

  const models = modelNames;

  const getModelColor = useCallback(
    (model: string) => {
      const idx = models.indexOf(model);
      return `hsl(${(idx * 360) / Math.max(models.length, 1)}, 70%, 50%)`;
    },
    [models],
  );

  // 元の finalStepValue / xTicks / yMin yMax を呼び出し元で作る（最低限の計算）
  const finalStepValue = useMemo(() => {
    const rows = state?.ratingSeries ?? [];
    if (rows.length === 0) return 0;
    return rows[rows.length - 1]?.step ?? 0;
  }, [state]);

  const xTicks = useMemo(() => {
    const rows = state?.ratingSeries ?? [];
    if (rows.length === 0) return [0];
    // 表示密度を落としたいならここで間引く（例：10ステップ刻み）
    return rows.map((r) => r.step);
  }, [state]);

  // yMin/yMax は chart 側で推定できるが、元の見た目に合わせてここで渡すことも可能
  // ここでは未指定（chart側推定）でOKにしている

  const canStop =
    !stopping && (state?.status === "queued" || state?.status === "running");

  async function onStop() {
    if (!canStop) return;
    try {
      setStopping(true);
      const res = await fetch(
        `/api/benchmarks/${encodeURIComponent(benchmarkId)}/stop`,
        { method: "POST", cache: "no-store" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`stop failed: ${res.status} ${text}`);
      }
      setConfirmStopOpen(false);
    } finally {
      setStopping(false);
    }
  }

  const onClickStop = useCallback(() => {
    if (!canStop) return;
    setConfirmStopOpen(true);
  }, [canStop]);

  useEffect(() => {
    if (open) return;

    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    document.body.removeAttribute("data-scroll-locked");

    setConfirmStopOpen(false);
  }, [open]);

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
      document.body.removeAttribute("data-scroll-locked");
    };
  }, []);

  return (
    <>
      {/* メイン（進捗）モーダル */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl min-w-3xl">
          <DialogHeader>
            <DialogTitle>Benchmark in Progress</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This evaluation is running in the background. The process will
              continue even if you close this screen.
            </DialogDescription>
          </DialogHeader>

          {header}

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border p-3 overflow-hidden">
              <BenchmarkRatingsChart
                data={chartData as any}
                modelNames={modelNames}
                getModelColor={getModelColor}
                selectedModel={selectedModel}
                onModelClick={handleModelClick}
                xTicks={xTicks}
                finalStepValue={finalStepValue}
                // yMin/yMax は必要ならここで渡す（元コードに合わせたい場合）
                // yMin={yMin}
                // yMax={yMax}
                // TooltipContent={<RatingTooltip />}
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

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Step Log</div>
                <div className="text-xs text-muted-foreground">
                  SSE: {streamConnected ? "connected" : "disconnected"}
                </div>
              </div>

              <div className="h-52 overflow-auto rounded-lg border bg-muted/10 p-3 font-mono text-xs leading-relaxed">
                {streamLines.length === 0 ? (
                  <div className="text-muted-foreground">ログ待機中...</div>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 表示用ログなので許容
                  streamLines.map((l, i) => <div key={i}>{l}</div>)
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive "
              onClick={onClickStop}
              disabled={!canStop}
            >
              Stop Evaluation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ★ 確認ダイアログ */}
      <Dialog open={confirmStopOpen} onOpenChange={setConfirmStopOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stop evaluation?</DialogTitle>
            <DialogDescription>
              This will stop the running evaluation. You can’t undo this action.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmStopOpen(false)}
              disabled={stopping}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onStop} disabled={!canStop}>
              {stopping ? "Stopping..." : "Stop"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
