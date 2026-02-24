"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type LegendOrderMap = Map<string, number>;

export function BenchmarkRatingsChart(props: {
  data: Array<Record<string, number | string>>;
  modelNames: string[];

  // 元コンポーネントに寄せるための追加props（既存の実装を渡して使う）
  getModelColor: (model: string) => string;
  selectedModel?: string | null;
  onModelClick?: (model: string) => void;

  // x/y の見た目調整
  xTicks?: number[]; // 例: [0, 50, 100, ...]
  finalStepValue?: number; // 例: finalStepValue
  yMin?: number;
  yMax?: number;

  // Tooltip / Legend の差し替え（元のコンポーネントを使える）
  TooltipContent?: React.ReactElement;
  LegendContent?: (p: any) => React.ReactNode;

  legendOrderMap?: LegendOrderMap;
}) {
  const {
    data,
    modelNames,
    getModelColor,
    selectedModel = null,
    onModelClick,
    xTicks,
    finalStepValue,
    yMin,
    yMax,
    TooltipContent,
    LegendContent,
    legendOrderMap,
  } = props;

  // モデル表示順は元の「sortedModels」に合わせたいので、ここでは受け取った順で描画
  // （必要なら外側でソートして modelNames を渡す）
  const sortedModels = modelNames;

  // y domain が未指定なら data から推定（50刻み）
  const computedY = (() => {
    if (typeof yMin === "number" && typeof yMax === "number") {
      return { yMin, yMax };
    }
    let min = Infinity;
    let max = -Infinity;

    for (const row of data) {
      for (const m of sortedModels) {
        const v = row[m];
        if (typeof v === "number" && Number.isFinite(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { yMin: 0, yMax: 100 };
    }

    // 50刻みっぽく寄せる
    const pad = 50;
    const minSnap = Math.floor(min / pad) * pad;
    const maxSnap = Math.ceil(max / pad) * pad;
    return { yMin: minSnap, yMax: maxSnap };
  })();

  const tickCount = Math.floor((computedY.yMax - computedY.yMin) / 50) + 1;

  return (
    <div className="my-1">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-gray-900">Rating</h3>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, left: 5, bottom: 28 }}
          >
            <CartesianGrid vertical={false} stroke="#e5e7eb" />
            <ReferenceLine x={0} stroke="#e5e7eb" strokeWidth={1} />
            {typeof finalStepValue === "number" && (
              <ReferenceLine
                x={finalStepValue}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
            )}

            <XAxis
              dataKey="step"
              ticks={xTicks}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              domain={[0, "dataMax"]}
              label={{
                value: "Step",
                position: "insideBottom",
                offset: -5,
                fontSize: 14,
                fontWeight: "bold",
              }}
            />

            <YAxis
              domain={[computedY.yMin, computedY.yMax]}
              tickCount={tickCount}
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

            <Tooltip content={TooltipContent ?? undefined} />

            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{
                width: "100%",
                maxWidth: "100%",
                overflow: "hidden",
              }}
              itemSorter={(item: any) =>
                legendOrderMap?.get(String(item?.value ?? item?.dataKey)) ??
                999999
              }
              content={LegendContent ?? undefined}
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
                onClick={() => onModelClick?.(model)}
                opacity={
                  selectedModel ? (selectedModel === model ? 1 : 0.25) : 1
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
