"use client";

import { ChevronDown, Info } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ModelLabel } from "@/components/model-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Tooltip as UiTooltip,
} from "@/components/ui/tooltip";
import { RatingLegend } from "./rating-legend";

type CoverageInfo = {
  completedMatches: number;
  skippedMatches: number;
  totalMatches: number;
  sessionCoverage: number;
  failureBreakdown: {
    unsupportedInput: number;
    contextOverflow: number;
    otherError: number;
  };
};

type ModelCoverageInfo = {
  totalTrials: number;
  completedTrials: number;
  skippedTrials: number;
  modelCoverage: number;
  failureBreakdown: {
    unsupportedInput: number;
    contextOverflow: number;
    otherError: number;
  };
};

// TableHeaderで使ってる幅と同じテンプレを用意
const COLS = "grid grid-cols-[320px_150px_150px_150px_150px_150px]";

function ModelCoverageRow({
  model,
  stats,
  isBaseline,
  coverage,
  showDetails,
}: {
  model: string;
  stats: any;
  isBaseline: boolean;
  coverage?: ModelCoverageInfo;
  showDetails: boolean;
}) {
  const shouldShowDetails = showDetails && !!coverage;

  return (
    <>
      <TableRow
        className={[
          "hover:bg-transparent",
          isBaseline ? "bg-blue-50 hover:bg-blue-50" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <TableCell className="align-top">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <ModelLabel modelName={model} size="md" />
            </div>
            {isBaseline && (
              <span className="text-xs text-blue-600">(baseline)</span>
            )}
          </div>
        </TableCell>

        <TableCell className="align-top text-muted-foreground">
          {Number(stats?.rating ?? 0).toFixed(1)}
        </TableCell>

        <TableCell className="align-top text-muted-foreground">
          {Number(stats?.cost ?? 0).toFixed(2)}
        </TableCell>

        <TableCell className="align-top text-muted-foreground">
          {Number(stats?.speed ?? 0).toFixed(2)}
        </TableCell>

        <TableCell className="align-top text-muted-foreground">
          {coverage ? (
            <span>{coverage.modelCoverage.toFixed(1)}%</span>
          ) : (
            <span>-</span>
          )}
        </TableCell>

        <TableCell className="align-top text-muted-foreground">
          {Number(stats?.games ?? 0)}
        </TableCell>
      </TableRow>

      {shouldShowDetails && coverage && (
        <TableRow
          className={[
            "hover:bg-transparent",
            isBaseline ? "bg-blue-50 hover:bg-blue-50" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <TableCell colSpan={6} className="py-2 px-0">
            <div className={`${COLS} px-6 text-sm text-muted-foreground`}>
              {/* 1〜4列は空にして、詳細をSample coverage列(5列目)に寄せる */}
              <div />
              <div />
              <div />
              <div />

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span>Context overflow:</span>
                  <span className="tabular-nums">
                    {coverage.failureBreakdown.contextOverflow}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Unsupported input:</span>
                  <span className="tabular-nums">
                    {coverage.failureBreakdown.unsupportedInput}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Other error:</span>
                  <span className="tabular-nums">
                    {coverage.failureBreakdown.otherError}
                  </span>
                </div>
              </div>

              <div />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function OverviewSection({
  ratingHistory,
  modelStats,
  finalStep,
  baselineModel,
  onModelClick,
  selectedModel,
  matchCount,
  coverage,
  modelCoverage,
}: any & {
  coverage?: CoverageInfo;
  modelCoverage?: Record<string, ModelCoverageInfo>;
}) {
  const models = useMemo(() => Object.keys(modelStats ?? {}), [modelStats]);
  const [showCoverageDetails, setShowCoverageDetails] = useState(false);

  // 初期レーティング
  const initialRating = 1500;

  // 初期ステップ（step=0）
  const initialStep = useMemo(
    () => ({
      step: 0,
      rankings: Object.fromEntries(
        models.map((model) => [model, { rating: initialRating, games: 0 }]),
      ),
    }),
    [models],
  );

  // 初期ステップを含む完全なレーティング履歴
  const fullRatingHistory = useMemo(
    () => [initialStep, ...(ratingHistory ?? [])],
    [initialStep, ratingHistory],
  );

  // 最終ステップでのレーティング順にモデルをソート（降順）
  const sortedModels = useMemo(() => {
    if (!ratingHistory?.length) return models;
    const finalStepRankings =
      ratingHistory[ratingHistory.length - 1]?.rankings ?? {};
    return [...models].sort((a, b) => {
      const ratingA = finalStepRankings[a]?.rating ?? 0;
      const ratingB = finalStepRankings[b]?.rating ?? 0;
      return ratingB - ratingA;
    });
  }, [models, ratingHistory]);

  // モデルの色（Chart.js の hsl を踏襲）
  const getModelColor = useCallback(
    (model: string) => {
      const idx = models.indexOf(model);
      return `hsl(${(idx * 360) / Math.max(models.length, 1)}, 70%, 50%)`;
    },
    [models],
  );

  const legendOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    sortedModels.forEach((model, i) => {
      m.set(model, i);
    });
    return m;
  }, [sortedModels]);

  // X軸 tick: 常に 5step 刻み
  const xTicks = useMemo(() => {
    const steps = fullRatingHistory.map((s: any) => Number(s.step ?? 0));
    const maxStep = steps.length ? Math.max(...steps) : 0;

    const ticks: number[] = [];
    for (let i = 0; i <= maxStep; i += 5) ticks.push(i);

    // 最終 step が 5 の倍数でない場合も必ず表示
    if (maxStep % 5 !== 0) ticks.push(maxStep);

    return ticks;
  }, [fullRatingHistory]);

  // 0 と FinalStep に縦罫線を追加する
  const finalStepValue = useMemo(() => {
    if (!fullRatingHistory.length) return 0;
    return Math.max(...fullRatingHistory.map((s: any) => Number(s.step ?? 0)));
  }, [fullRatingHistory]);

  // Y軸domain計算（20%余裕）
  const { yMin, yMax } = useMemo(() => {
    const allRatings = fullRatingHistory.flatMap((step: any) =>
      Object.values(step.rankings ?? {}).map((data: any) => data.rating),
    );
    const minRating = allRatings.length ? Math.min(...allRatings) : 0;
    const maxRating = allRatings.length ? Math.max(...allRatings) : 0;
    const range = maxRating - minRating || 1;
    return {
      yMin: Math.floor(minRating - range * 0.2),
      yMax: Math.ceil(maxRating + range * 0.2),
    };
  }, [fullRatingHistory]);

  // Recharts用：Rating推移の配列データに変換
  const ratingLineData = useMemo(() => {
    return fullRatingHistory.map((s: any) => {
      const row: Record<string, number | null> = { step: s.step };
      for (const m of models) {
        row[m] = s.rankings?.[m]?.rating ?? null;
      }
      return row;
    });
  }, [fullRatingHistory, models]);

  // Scatter用：各モデル1点のデータ
  const costScatterPoints = useMemo(
    () =>
      models.map((model) => ({
        model,
        x: modelStats?.[model]?.cost ?? 0,
        y: modelStats?.[model]?.rating ?? 0,
      })),
    [models, modelStats],
  );

  const latencyScatterPoints = useMemo(
    () =>
      models.map((model) => ({
        model,
        x: modelStats?.[model]?.speed ?? 0, // speedにlatencyが入っている前提
        y: modelStats?.[model]?.rating ?? 0,
      })),
    [models, modelStats],
  );

  // X軸のdomain（20%余裕）
  const { costXMin, costXMax, latencyXMin, latencyXMax } = useMemo(() => {
    const costs = models.map((m) => modelStats?.[m]?.cost ?? 0);
    const lats = models.map((m) => modelStats?.[m]?.speed ?? 0);

    const minCost = costs.length ? Math.min(...costs) : 0;
    const maxCost = costs.length ? Math.max(...costs) : 0;
    const minLat = lats.length ? Math.min(...lats) : 0;
    const maxLat = lats.length ? Math.max(...lats) : 0;

    const costW = maxCost - minCost || 1;
    const latW = maxLat - minLat || 1;

    return {
      costXMin: Math.max(0, minCost - costW * 0.2),
      costXMax: maxCost + costW * 0.2,
      latencyXMin: Math.max(0, minLat - latW * 0.2),
      latencyXMax: maxLat + latW * 0.2,
    };
  }, [models, modelStats]);

  // Tooltip（Rating推移）：そのstepの値を降順ソート
  const RatingTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const rows = [...payload]
      .filter((p) => p?.value != null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return (
      <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
        <div className="text-xs text-slate-600">Step: {label}</div>
        <div className="mt-1 space-y-1">
          {rows.map((p: any) => (
            <div
              key={p.dataKey}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-slate-800">{p.dataKey}</span>
              </div>
              <span className="tabular-nums text-slate-900">
                {Number(p.value).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 小数点以下切り捨て（表示用）
  const floorNumber = (v: any) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return Math.floor(n);
  };

  // Scatter Tooltip（小数点以下切り捨て）
  const ScatterTooltip =
    (xLabel: string) =>
    ({ active, payload }: any) => {
      if (!active || !payload?.length) return null;
      const p = payload[0]?.payload;
      if (!p) return null;
      return (
        <div className="rounded-md border bg-white px-3 py-2 shadow-sm">
          <div className="text-sm text-slate-900">
            <ModelLabel modelName={p.model} size="sm" />
          </div>
          <div className="mt-1 text-xs text-slate-700">
            {xLabel}: {floorNumber(p.x)}
          </div>
          <div className="text-xs text-slate-700">
            Rating: {floorNumber(p.y)}
          </div>
        </div>
      );
    };

  // クリックでモデル選択（必要なら）
  const handleModelClick = (model: string) => {
    onModelClick?.(model);
  };

  const ScatterLegendTop = () => {
    return (
      <div className="mb-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sortedModels.map((model) => {
            const active = !selectedModel || selectedModel === model;
            return (
              <button
                key={model}
                type="button"
                onClick={() => handleModelClick(model)}
                className="flex items-center gap-2 text-xs"
                style={{ opacity: active ? 1 : 0.35 }}
                title={model}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getModelColor(model) }}
                />
                <ModelLabel modelName={model} size="sm" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const ScatterDot = (props: any) => {
    const { cx, cy, fill } = props;
    if (cx == null || cy == null) return null;
    return <circle cx={cx} cy={cy} r={7} fill={fill} />;
  };

  // ★ finalStep が null でも落ちないように安全に計算
  const judgeTotalUsd = finalStep?.cost?.judge_total_usd ?? 0;
  const trialTotalUsd = finalStep?.cost?.trial_total_usd ?? 0;
  const totalCost = judgeTotalUsd + trialTotalUsd;

  const totalMatches = matchCount ?? 0;
  const costPerMatch = totalMatches > 0 ? totalCost / totalMatches : null;

  const bestModelName = finalStep?.stats?.best_model?.model ?? "-";
  const bestModelRating = finalStep?.stats?.best_model?.rating;

  return (
    <div className="">
      <h2 className="mt-1 text-4xl font-bold tracking-tight select-text">
        Evaluation Summary
      </h2>

      {/* 統計サマリー */}
      {finalStep ? (
        <div className="mt-10">
          <div className="flex gap-24 items-end">
            {/* Top Rating Model - Primary (Left, Large) */}
            <div className="space-y-2">
              <h2 className="text-sm text-gray-600">Top Rating Model</h2>
              <div className="text-4xl font-bold text-gray-900">
                {bestModelName}
              </div>
              <div className="text-base text-gray-600">
                Rating:{" "}
                {typeof bestModelRating === "number"
                  ? bestModelRating.toFixed(1)
                  : "-"}
              </div>
            </div>

            {/* Right Side - Two Columns for Cost Info */}
            <div className="flex gap-12 items-end">
              {/* Evaluation Cost */}
              <div className="space-y-1 min-w-[200px]">
                <h2 className="text-sm text-gray-600">&nbsp;</h2>
                <div className="text-xl font-bold text-gray-900 flex items-start gap-1">
                  ${totalCost.toFixed(2)} total
                  <TooltipProvider delayDuration={150}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Info className="w-3 h-3 text-gray-400 cursor-help mt-0.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
                        Total cost across all evaluated model pairs (trials +
                        judging)
                      </TooltipContent>
                    </UiTooltip>
                  </TooltipProvider>
                </div>
                <div className="text-sm text-gray-500">
                  Trial: ${trialTotalUsd.toFixed(2)} &nbsp;&nbsp; Judge: $
                  {judgeTotalUsd.toFixed(2)}
                </div>
              </div>

              {/* Matches Info */}
              <div className="space-y-1 min-w-[150px]">
                <h2 className="text-sm text-gray-600">&nbsp;</h2>
                <div className="text-xl font-bold text-gray-900 flex items-start gap-1">
                  {totalMatches} matches
                  <TooltipProvider delayDuration={150}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Info className="w-3 h-3 text-gray-400 cursor-help mt-0.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
                        Total number of pairwise comparisons run in this
                        evaluation
                      </TooltipContent>
                    </UiTooltip>
                  </TooltipProvider>
                </div>
                <div className="text-sm text-gray-500">
                  ({costPerMatch != null ? `$${costPerMatch.toFixed(2)}` : "-"}{" "}
                  / match)
                </div>
              </div>

              {/* Trial Coverage */}
              {coverage && (
                <div className="space-y-1 min-w-[150px]">
                  <h2 className="text-sm text-gray-600">&nbsp;</h2>
                  <div className="text-xl font-bold text-gray-900 flex items-end gap-1">
                    {coverage.sessionCoverage.toFixed(1)}%
                    <div className="flex flex-col leading-[1.1]">
                      <span>trial</span>
                      <span>coverage</span>
                    </div>
                    <TooltipProvider delayDuration={150}>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex self-start">
                            <Info className="w-3 h-3 text-gray-400 cursor-help mt-0.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
                          <div className="space-y-1">
                            <div className="font-medium">Trial Coverage</div>
                            <div>
                              Percentage of trials in this session that were
                              completed or intentionally skipped.
                            </div>
                            <div className="pt-1 border-t mt-2">
                              <div>Completed: {coverage.completedMatches}</div>
                              <div>Skipped: {coverage.skippedMatches}</div>
                            </div>
                          </div>
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-sm text-gray-500">
                    ({coverage.completedMatches}+{coverage.skippedMatches} /{" "}
                    {coverage.totalMatches})
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border bg-muted/10 p-4 text-sm text-muted-foreground">
          Ratings and cost summary are not available yet (the evaluation may
          have been stopped immediately after starting).
        </div>
      )}

      {/* Rating推移（Recharts） */}
      <div className="my-12">
        <div className="mb-5">
          <h3 className="text-xl font-semibold text-gray-900">Rating</h3>
        </div>

        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={ratingLineData}
              margin={{ top: 10, right: 20, left: 5, bottom: 28 }}
            >
              <CartesianGrid vertical={false} stroke="#e5e7eb" />
              <ReferenceLine x={0} stroke="#e5e7eb" strokeWidth={1} />
              <ReferenceLine
                x={finalStepValue}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <XAxis
                dataKey="step"
                ticks={xTicks}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                label={{
                  value: "Step",
                  position: "insideBottom",
                  offset: -5,
                  fontSize: 14,
                  fontWeight: "bold",
                }}
              />
              <YAxis
                domain={[yMin, yMax]}
                tickCount={Math.floor((yMax - yMin) / 50) + 1}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                label={{
                  value: "Rating",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 14,
                  fontWeight: "bold",
                }}
              />
              <Tooltip content={<RatingTooltip />} />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                wrapperStyle={{ paddingLeft: 0 }}
                itemSorter={(item: any) =>
                  legendOrderMap.get(String(item?.value ?? item?.dataKey)) ??
                  999999
                }
                content={(props: any) => (
                  <RatingLegend
                    payload={props?.payload}
                    onModelClick={handleModelClick}
                    selectedModel={selectedModel}
                  />
                )}
              />

              {sortedModels.map((model) => (
                <Line
                  key={model}
                  type="linear"
                  dataKey={model}
                  name={model}
                  stroke={getModelColor(model)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  onClick={() => handleModelClick(model)}
                  opacity={
                    selectedModel ? (selectedModel === model ? 1 : 0.25) : 1
                  }
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost vs Rating / Latency vs Rating（Recharts） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cost vs Rating */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Cost vs Rating
          </h3>
          <ScatterLegendTop />
          <div
            className={[
              "h-[300px]",
              "focus:outline-none",
              "[&_.recharts-wrapper]:outline-none",
              "[&_.recharts-wrapper:focus]:outline-none",
              "[&_.recharts-wrapper:focus-visible]:outline-none",
              "[&_svg:focus]:outline-none",
              "[&_svg:focus-visible]:outline-none",
            ].join(" ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 10, right: 10, left: 10, bottom: 50 }}
              >
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[costXMin, costXMax]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => floorNumber(v)}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Cost ($/1000 req)",
                    position: "insideBottom",
                    offset: -5,
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[yMin, yMax]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => floorNumber(v)}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Rating",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                />
                <ZAxis type="number" dataKey={() => 1} range={[60, 60]} />
                <Tooltip content={ScatterTooltip("Cost ($/1000 req)")} />

                {sortedModels.map((model) => (
                  <Scatter
                    key={model}
                    name={model}
                    data={costScatterPoints.filter((p) => p.model === model)}
                    fill={getModelColor(model)}
                    onClick={() => handleModelClick(model)}
                    opacity={
                      selectedModel ? (selectedModel === model ? 1 : 0.25) : 1
                    }
                    isAnimationActive={false}
                    shape={<ScatterDot />}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency vs Rating */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Request Latency vs Rating
          </h3>

          <ScatterLegendTop />
          <div
            className={[
              "h-[300px]",
              "focus:outline-none",
              "[&_.recharts-wrapper]:outline-none",
              "[&_.recharts-wrapper:focus]:outline-none",
              "[&_.recharts-wrapper:focus-visible]:outline-none",
              "[&_svg:focus]:outline-none",
              "[&_svg:focus-visible]:outline-none",
            ].join(" ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 10, right: 10, left: 10, bottom: 50 }}
              >
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[latencyXMin, latencyXMax]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => floorNumber(v)}
                  label={{
                    value: "Request Latency (s)",
                    position: "insideBottom",
                    offset: -5,
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[yMin, yMax]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => floorNumber(v)}
                  label={{
                    value: "Rating",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 14,
                    fontWeight: "bold",
                  }}
                />
                <ZAxis type="number" dataKey={() => 1} range={[60, 60]} />
                <Tooltip content={ScatterTooltip("Request Latency (s)")} />

                {sortedModels.map((model) => (
                  <Scatter
                    key={model}
                    name={model}
                    data={latencyScatterPoints.filter((p) => p.model === model)}
                    fill={getModelColor(model)}
                    onClick={() => handleModelClick(model)}
                    opacity={
                      selectedModel ? (selectedModel === model ? 1 : 0.25) : 1
                    }
                    shape={<ScatterDot />}
                    isAnimationActive={false}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* モデル統計テーブル */}
      <section className="mt-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-md text-gray-600">Model Performance Summary</h2>
          </div>

          <button
            type="button"
            onClick={() => setShowCoverageDetails((v) => !v)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label={
              showCoverageDetails
                ? "Collapse coverage details"
                : "Expand coverage details"
            }
          >
            <span>Coverage details</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showCoverageDetails ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          <Table className="table-fixed w-full">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[320px]">Model</TableHead>
                <TableHead className="w-[150px]">Rating</TableHead>
                <TableHead className="w-[150px]">
                  <div className="flex flex-col">
                    <span>Cost</span>
                    <span>($/1000 req)</span>
                  </div>
                </TableHead>
                <TableHead className="w-[150px]">
                  <div className="flex flex-col">
                    <span>Request</span>
                    <span>Latency (s)</span>
                  </div>
                </TableHead>
                <TableHead className="w-[150px]">
                  <div className="flex items-start gap-1">
                    <div className="flex flex-col">
                      <span>Sample</span>
                      <span>Coverage</span>
                    </div>
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0 mt-0.5" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            % of unique dataset samples this model successfully
                            evaluated (skips/errors excluded).
                          </p>
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="w-[150px]">
                  <div className="flex items-start gap-1">
                    <div className="flex flex-col">
                      <span>Completed</span>
                      <span>Matches</span>
                    </div>
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0 mt-0.5" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            Number of pairwise matches finished for this model.
                          </p>
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {Object.keys(modelStats ?? {}).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No model stats yet.
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(modelStats)
                  .sort(
                    ([, a]: any, [, b]: any) =>
                      (b?.rating ?? 0) - (a?.rating ?? 0),
                  )
                  .map(([model, stats]: any) => {
                    const isBaseline = baselineModel === model;
                    const coverage = modelCoverage?.[model];

                    return (
                      <ModelCoverageRow
                        key={model}
                        model={model}
                        stats={stats}
                        isBaseline={isBaseline}
                        coverage={coverage}
                        showDetails={showCoverageDetails}
                      />
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

export default OverviewSection;
