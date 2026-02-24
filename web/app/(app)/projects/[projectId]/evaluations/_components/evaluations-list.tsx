"use client";

import { Check, Info, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ModelLabel } from "@/components/model-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DatasetDetailRecentEvaluation = {
  id: string;
  createdAt: Date;
  comparison: Array<{ model: string; rating: number; games: number }>;
  matchCount: number;
  judgeModels: string[];
};

const ITEMS_PER_PAGE = 10;

function formatJa(d: Date) {
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function judgeRowKey(evaluationId: string, model: string) {
  return `${evaluationId}:judge:${model}`;
}

function HeadWithHelp(props: { label: string; help: string }) {
  return (
    <div className="flex items-start gap-1">
      <span>{props.label}</span>

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Info className="w-3 h-3 text-gray-400 cursor-help mt-0.5" />
            </span>
          </TooltipTrigger>

          <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
            {props.help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function EvaluationsList(props: {
  evaluations: DatasetDetailRecentEvaluation[];
  datasets: Array<{ id: string; name: string }>;

  selectedDatasetId: string | null;
  selectedDataset?: { id: string; name: string };

  // datasetId を外した URL（from 等は維持済み）
  clearFilterHref: string;

  projectId: string;
}) {
  const {
    evaluations,
    datasets,
    selectedDatasetId,
    selectedDataset,
    clearFilterHref,
    projectId,
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllModels, setShowAllModels] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const toEvaluationHref = (evaluationId: string) => {
    return `/projects/${projectId}/evaluations/${evaluationId}`;
  };

  const onChangeDataset = (datasetId: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (datasetId) next.set("datasetId", datasetId);
    else next.delete("datasetId");
    router.push(`${pathname}?${next.toString()}`);
    setCurrentPage(1);
  };

  const onClearDatasetFilter = () => {
    router.push(clearFilterHref);
    setCurrentPage(1);
  };

  const filteredEvaluations = useMemo(() => {
    const src = evaluations ?? [];
    if (!searchQuery.trim()) return src;

    const q = searchQuery.toLowerCase();

    return src.filter((e) => {
      if (e.comparison?.some((x) => x.model?.toLowerCase().includes(q)))
        return true;
      if (e.judgeModels?.some((m) => m?.toLowerCase().includes(q))) return true;
      return formatJa(e.createdAt).toLowerCase().includes(q);
    });
  }, [evaluations, searchQuery]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredEvaluations.length / ITEMS_PER_PAGE)),
    [filteredEvaluations.length],
  );

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvaluations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredEvaluations, currentPage]);

  const hasSearch = !!searchQuery.trim();
  const isFiltering = !!selectedDatasetId;

  if ((evaluations?.length ?? 0) === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">No evaluation history</p>
        <p className="text-sm text-slate-400 mt-2">
          Please run a benchmark from the Datasets tab
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="mb-6 space-y-3">
        {/* 検索 + 右フィルタ */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by model name or date..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>

          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={[
                  "shrink-0",
                  isFiltering ? "ring-slate-300" : "",
                ].join(" ")}
                aria-label="Filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-[280px] p-2">
              <Command>
                <CommandInput placeholder="Search datasets..." />
                <CommandList>
                  <CommandEmpty>No matching datasets found</CommandEmpty>

                  <CommandGroup heading="Dataset">
                    <CommandItem
                      value="__all__"
                      onSelect={() => {
                        onChangeDataset(null);
                        setFilterOpen(false);
                      }}
                    >
                      <span className="flex-1">All datasets</span>
                      {!selectedDatasetId && (
                        <Check className="h-4 w-4 text-slate-600" />
                      )}
                    </CommandItem>

                    {datasets.map((d) => {
                      const active = selectedDatasetId === d.id;
                      return (
                        <CommandItem
                          key={d.id}
                          value={`${d.name} ${d.id}`}
                          onSelect={() => {
                            onChangeDataset(d.id);
                            setFilterOpen(false);
                          }}
                        >
                          <span className="flex-1">{d.name}</span>
                          {active && (
                            <Check className="h-4 w-4 text-slate-600" />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <SegmentedControl<"top3" | "all">
            value={showAllModels ? "all" : "top3"}
            onChange={(v) => setShowAllModels(v === "all")}
            options={[
              { value: "top3", label: "Top 3" },
              { value: "all", label: "All models" },
            ]}
          />
        </div>

        {/* 絞り込みバッジ（検索フォーム下） */}
        {(selectedDataset || hasSearch || showAllModels) && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedDataset && (
              <Badge
                variant="secondary"
                className="flex items-center gap-2 px-3 py-1.5 w-fit"
              >
                <span className="text-sm">{selectedDataset.name}</span>
                <button
                  type="button"
                  onClick={onClearDatasetFilter}
                  className="hover:bg-slate-300 rounded-full p-0.5"
                  aria-label="Clear dataset filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {filteredEvaluations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No search results found</p>
          <p className="text-sm text-slate-400 mt-2">
            Please try a different keyword
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[180px]">Created At</TableHead>

                  <TableHead className="w-[520px]">
                    <HeadWithHelp
                      label="Candidate Model"
                      help="The rating represents how well a candidate model performs compared to other models, based on pairwise evaluations."
                    />
                  </TableHead>

                  <TableHead className="w-[380px]">Judge Model</TableHead>

                  <TableHead className="w-[90px]">
                    <HeadWithHelp
                      label="Match"
                      help="Number of pairwise comparisons used to calculate the rating."
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-6 text-center text-muted-foreground"
                    >
                      No evaluations yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((evaluation) => {
                    const sorted = [...(evaluation.comparison ?? [])].sort(
                      (a, b) => b.rating - a.rating,
                    );

                    const displayedModels = showAllModels
                      ? sorted
                      : sorted.slice(0, 3);
                    const remainingCount = Math.max(0, sorted.length - 3);

                    const judgeModels = Array.from(
                      new Set(evaluation.judgeModels ?? []),
                    );

                    return (
                      <TableRow
                        key={evaluation.id}
                        onClick={() =>
                          router.push(toEvaluationHref(evaluation.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            router.push(toEvaluationHref(evaluation.id));
                          }
                        }}
                        className="cursor-pointer hover:bg-slate-100"
                      >
                        <TableCell className="align-top">
                          {formatJa(evaluation.createdAt)}
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex flex-col gap-1">
                            {displayedModels.map((c) => (
                              <div
                                key={`${evaluation.id}:${c.model}`}
                                className="flex items-center gap-3 min-w-0"
                              >
                                <div className="min-w-0">
                                  <ModelLabel modelName={c.model} size="md" />
                                </div>
                                <span className="text-muted-foreground">
                                  ({c.rating.toFixed?.(1) ?? c.rating})
                                </span>
                              </div>
                            ))}

                            {!showAllModels && remainingCount > 0 && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                +{remainingCount} more
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          {judgeModels.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {judgeModels.map((model) => (
                                <ModelLabel
                                  key={judgeRowKey(evaluation.id, model)}
                                  modelName={model}
                                  size="md"
                                />
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>

                        <TableCell className="align-top">
                          {evaluation.matchCount}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={
                        currentPage === 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }

                      if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }

                      return null;
                    },
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      className={
                        currentPage === totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
