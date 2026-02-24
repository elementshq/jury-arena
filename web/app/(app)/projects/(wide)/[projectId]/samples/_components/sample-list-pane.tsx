"use client";

import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type {
  SampleListItem,
  SampleWithInfo,
} from "../_hooks/use-sample-selection";

function buildPreview(input: string) {
  const firstLine = input.split("\n")[0] ?? "";
  const preview = firstLine.slice(0, 30);
  const needsTruncate = input.length > 30 || input.includes("\n");
  return needsTruncate ? `${preview}…` : preview;
}

export function SampleListPane(props: {
  children?: React.ReactNode;

  // 表示は list で十分
  samples: SampleListItem[];
  selectedId: string | null;

  datasets: Array<{ id: string; name: string }>;
  selectedDatasetId: string | null;
  onChangeDataset: (datasetId: string | null) => void;

  filterDataset?: { id: string; name: string };
  onClearFilter?: () => void;

  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;

  currentPage: number;
  totalPages: number;
  onChangePage: (page: number) => void;

  // クリック時は info 付きが必要なので WithInfo
  onSelectSample: (sample: SampleWithInfo) => void;
}) {
  const {
    children,
    samples,
    selectedId,

    datasets,
    selectedDatasetId,
    onChangeDataset,

    filterDataset,
    onClearFilter,

    searchQuery,
    onChangeSearchQuery,

    currentPage,
    totalPages,
    onChangePage,

    onSelectSample,
  } = props;

  const [filterOpen, setFilterOpen] = useState(false);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  const isFiltering = !!selectedDatasetId;

  return (
    <div className="w-[480px] shrink-0 border-r flex flex-col min-h-0 bg-white">
      <div className="border-b">
        <div className="px-6">
          {children}

          <div className="my-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Sample ID / Inputで検索..."
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
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
                  <CommandInput placeholder="Datasetを検索..." />
                  <CommandList>
                    <CommandEmpty>該当するDatasetがありません</CommandEmpty>

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
          </div>

          {filterDataset && (
            <div className="-mt-2 mb-4">
              <Badge
                variant="secondary"
                className="flex items-center gap-2 px-3 py-1.5 w-fit"
              >
                <span className="text-sm">{filterDataset.name}</span>
                <button
                  type="button"
                  onClick={onClearFilter}
                  className="hover:bg-slate-300 rounded-full p-0.5"
                  aria-label="Clear dataset filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableBody>
            {samples.map((sample) => {
              const isSelected =
                !!sample.id && !!selectedId && sample.id === selectedId;

              return (
                <TableRow
                  key={sample.id ?? `${sample.createdAt.getTime()}`}
                  className={[
                    "cursor-pointer",
                    "hover:bg-slate-50",
                    isSelected ? "bg-slate-100" : "",
                  ].join(" ")}
                  // samples には実体として info 付きが来てる想定（SplitView の paginated を渡している）
                  onClick={() => onSelectSample(sample as SampleWithInfo)}
                >
                  <TableCell className="py-3 px-6">
                    <div className="text-[11px] text-slate-400 font-mono lowercase">
                      {sample.id}
                    </div>
                    <div className="text-sm text-slate-800 mt-1 line-clamp-2 break-words">
                      {buildPreview(sample.message)}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 flex justify-center border-t bg-white">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => onChangePage(Math.max(1, currentPage - 1))}
                    className={
                      canGoPrev
                        ? "cursor-pointer"
                        : "pointer-events-none opacity-50"
                    }
                  />
                </PaginationItem>

                {pageNumbers.map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => onChangePage(page)}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }

                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }

                  return null;
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      onChangePage(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      canGoNext
                        ? "cursor-pointer"
                        : "pointer-events-none opacity-50"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
}
