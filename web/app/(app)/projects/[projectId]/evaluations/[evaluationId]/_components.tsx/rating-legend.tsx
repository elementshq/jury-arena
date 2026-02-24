import { ModelLabel } from "@/components/model-label";

export function RatingLegend({
  payload,
  onModelClick,
  selectedModel,
}: {
  payload?: any[];
  onModelClick?: (model: string) => void;
  selectedModel?: string;
}) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-col gap-2 pl-4">
      {payload.map((item: any) => {
        const model = String(item.value ?? item.dataKey);
        const isActive = !selectedModel || selectedModel === model;

        return (
          <button
            key={model}
            type="button"
            onClick={() => onModelClick?.(model)}
            className="flex items-center gap-2 text-left"
            style={{ opacity: isActive ? 1 : 0.3 }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <ModelLabel modelName={model} size="sm" className="max-w-[100px]" />
          </button>
        );
      })}
    </div>
  );
}
