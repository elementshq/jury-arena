"use client";

import { FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ModelLabel } from "@/components/model-label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelDefinition } from "@/lib/config/models-types";
import { supportsPdfBase64 } from "@/lib/config/models-utils";

type ModelPickerBaseProps = {
  title: string;
  models: string[];
  modelDefinitions?: ModelDefinition[]; // Optional: for showing badges
  modelEvaluableCounts?: Map<string, { evaluable: number; total: number }>; // Evaluable sample counts per model
  maxHeightClassName?: string; // 例: "max-h-96"
  helperRight?: React.ReactNode; // 右側の補助表示（例: "3つまで選択可能"）
  emptyText?: string;
  showPdfBadge?: boolean; // Show PDF support badge
};

type ModelPickerMultiProps = ModelPickerBaseProps & {
  mode: "multi";
  selected: string[];
  onChange: (next: string[]) => void;
  maxSelect?: number; // 例: 3
  countText?: (selectedCount: number, maxSelect?: number) => React.ReactNode;
};

type ModelPickerSingleProps = ModelPickerBaseProps & {
  mode: "single";
  selected: string | null;
  onChange: (next: string | null) => void;
  countText?: (selected: string | null) => React.ReactNode;
};

type ModelPickerProps = ModelPickerMultiProps | ModelPickerSingleProps;

function filterModels(models: string[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) => m.toLowerCase().includes(q));
}

export function ModelPicker(props: ModelPickerProps) {
  const {
    title,
    models,
    modelDefinitions,
    modelEvaluableCounts,
    helperRight,
    maxHeightClassName = "max-h-96",
    emptyText = "No matching models found",
    showPdfBadge = false,
  } = props;

  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => filterModels(models, search),
    [models, search],
  );

  const isSelected = (model: string) => {
    if (props.mode === "multi") return props.selected.includes(model);
    return props.selected === model;
  };

  const toggle = (model: string) => {
    if (props.mode === "multi") {
      const selected = props.selected;
      const exists = selected.includes(model);

      if (exists) {
        props.onChange(selected.filter((m) => m !== model));
        return;
      }

      const max = props.maxSelect;
      if (typeof max === "number" && selected.length >= max) return;

      props.onChange([...selected, model]);
      return;
    }

    // single
    props.onChange(props.selected === model ? null : model);
  };

  const getModelDefinition = (modelName: string): ModelDefinition | undefined => {
    return modelDefinitions?.find((m) => m.model === modelName);
  };

  const modelSupportsPdf = (modelName: string): boolean => {
    const def = getModelDefinition(modelName);
    return def ? supportsPdfBase64(def) : false;
  };

  const countLine = useMemo(() => {
    if (props.mode === "multi") {
      if (props.countText)
        return props.countText(props.selected.length, props.maxSelect);
      if (typeof props.maxSelect === "number") {
        return (
          <span>
            Selected: {props.selected.length} / {props.maxSelect}
          </span>
        );
      }
      return <span>Selected: {props.selected.length}</span>;
    }

    if (props.countText) return props.countText(props.selected);
    return (
      <span>{props.selected ? `Selected: ${props.selected}` : "None"}</span>
    );
  }, [props]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Label className="text-base">{title}</Label>
        {helperRight}
      </div>

      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search models..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div
        className={`space-y-1 overflow-y-auto border rounded-lg p-2 ${maxHeightClassName}`}
      >
        {filtered.length === 0 ? (
          <div className="text-sm text-slate-500 px-2 py-3">{emptyText}</div>
        ) : (
          filtered.map((model) => (
            <label
              key={model}
              className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isSelected(model)}
                onChange={() => toggle(model)}
                className="h-4 w-4"
              />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <ModelLabel modelName={model} size="md" />
                {showPdfBadge && modelSupportsPdf(model) && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200"
                  >
                    <FileText className="h-2.5 w-2.5 mr-0.5" />
                    PDF
                  </Badge>
                )}
                {modelEvaluableCounts && (() => {
                  const counts = modelEvaluableCounts.get(model);
                  if (!counts) return null;
                  const { evaluable, total } = counts;
                  const isPartial = evaluable < total;
                  const skipped = total - evaluable;

                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-4 ${
                              isPartial
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {evaluable}/{total}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <div className="text-xs">
                            <div>Evaluated samples: {evaluable} / {total}</div>
                            {isPartial && (
                              <div className="text-amber-300">
                                Skipped: {skipped} (PDF not supported)
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </div>
            </label>
          ))
        )}
      </div>

      <p className="text-xs text-slate-600 mt-2">{countLine}</p>
    </div>
  );
}
