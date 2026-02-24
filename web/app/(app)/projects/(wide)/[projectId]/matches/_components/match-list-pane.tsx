"use client";

import { Search } from "lucide-react";
import { useMemo } from "react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { SectionLink } from "./section-link";

export type MatchListItem = {
  id?: string; // ★ optional にする（MatchWithInfo に合わせる）
  matchNumber?: number | null;
  sampleId?: string | null;
  createdAt: Date;

  // 表示用
  modelA?: string | null;
  modelB?: string | null;
  winner?: string | null; // model name | "tie"
};

function isWinner(
  winner: string | null | undefined,
  model: string | null | undefined,
) {
  if (!winner || !model) return false;
  if (winner === "tie") return false;
  return winner === model;
}

export function MatchListPane<T extends MatchListItem>(props: {
  children?: React.ReactNode;

  matches: T[];
  selectedId: string | null;
  onSelectMatch: (match: T) => void;

  sampleListHref: string;

  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;

  modelOptions: string[];
  targetModel: string | null;
  opponentModel: string | null;
  onChangeTargetModel: (model: string | null) => void;
  onChangeOpponentModel: (model: string | null) => void;

  currentPage: number;
  totalPages: number;
  onChangePage: (page: number) => void;
}) {
  const {
    children,
    matches,
    selectedId,
    onSelectMatch,

    sampleListHref,

    searchQuery,
    onChangeSearchQuery,

    modelOptions,
    targetModel,
    opponentModel,
    onChangeTargetModel,
    onChangeOpponentModel,

    currentPage,
    totalPages,
    onChangePage,
  } = props;

  const opponentOptions = useMemo(() => {
    return modelOptions.filter((m) => m !== targetModel);
  }, [modelOptions, targetModel]);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i + 1),
    [totalPages],
  );

  return (
    <div className="w-[480px] shrink-0 border-r flex flex-col min-h-0 bg-white">
      {/* ヘッダ領域 */}
      <div className="border-b">
        {children ? <div className="px-6 pt-4">{children}</div> : null}

        <div className="px-6">
          <div className="mt-4 flex justify-end">
            <SectionLink href={sampleListHref} label={`View Samples`} />
          </div>

          {/* 検索フォーム */}
          <div className="my-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Match Index または Sample ID で検索..."
                value={searchQuery}
                onChange={(e) => onChangeSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* モデルペア */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <div className="text-[12px] text-slate-600">Target Model</div>
              <Select
                value={targetModel ?? "__all__"}
                onValueChange={(v) =>
                  onChangeTargetModel(v === "__all__" ? null : v)
                }
              >
                <SelectTrigger className="w-full min-w-0 overflow-hidden [&>span]:truncate [&>span]:block">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {modelOptions.map((m) => (
                    <SelectItem
                      key={m}
                      value={m}
                      className="max-w-[320px] truncate"
                      title={m}
                    >
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="text-[12px] text-slate-600">Opponent</div>
              <Select
                value={opponentModel ?? "__all__"}
                onValueChange={(v) =>
                  onChangeOpponentModel(v === "__all__" ? null : v)
                }
              >
                <SelectTrigger className="w-full min-w-0 overflow-hidden [&>span]:truncate [&>span]:block">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {opponentOptions.map((m) => (
                    <SelectItem
                      key={m}
                      value={m}
                      className="max-w-[320px] truncate"
                      title={m}
                    >
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* リスト領域（スクロール） */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableBody>
            {matches.map((match, idx) => {
              const matchId = match.id ?? null;
              const isSelected =
                !!matchId && !!selectedId && matchId === selectedId;

              // key は id が無い可能性があるのでフォールバック
              const key =
                match.id ??
                (match.matchNumber != null
                  ? `matchNo:${match.matchNumber}`
                  : null) ??
                `row:${idx}`;

              return (
                <TableRow
                  key={key}
                  className={[
                    "cursor-pointer",
                    "hover:bg-slate-50",
                    isSelected ? "bg-slate-100" : "",
                  ].join(" ")}
                  onClick={() => onSelectMatch(match)}
                >
                  <TableCell className="py-3 px-6">
                    <div className="flex items-stretch gap-2">
                      {/* 左：Match番号ブロック（縦センタリング） */}
                      <div className="w-[72px] shrink-0 flex flex-col justify-center text-sm">
                        <div className="text-slate-500 leading-tight">
                          Match
                        </div>
                        <div className="font-semibold text-slate-900">
                          #{match.matchNumber ?? "—"}
                        </div>
                      </div>

                      {/* 右：モデル2行 */}
                      <div className="flex-1 space-y-1 text-sm">
                        {/* Model A */}
                        <div
                          className={[
                            "flex items-center justify-between gap-2 rounded px-2 py-1",
                            "min-w-0",
                            isWinner(match.winner, match.modelA)
                              ? "bg-emerald-600 text-white"
                              : "text-slate-800",
                          ].join(" ")}
                        >
                          <span className="truncate">
                            {match.modelA || "—"}
                          </span>

                          {isWinner(match.winner, match.modelA) && (
                            <span className="shrink-0">
                              <span className="inline-flex items-center rounded-md border border-white/70 bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                                Winner
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Model B */}
                        <div
                          className={[
                            "flex items-center justify-between gap-2 rounded px-2 py-1",
                            "min-w-0",
                            isWinner(match.winner, match.modelB)
                              ? "bg-emerald-600 text-white"
                              : "text-slate-800",
                          ].join(" ")}
                        >
                          <span className="truncate">
                            {match.modelB || "—"}
                          </span>

                          {isWinner(match.winner, match.modelB) && (
                            <span className="shrink-0">
                              <span className="inline-flex items-center rounded-md border border-white/70 bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                                Winner
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {matches.length === 0 && (
          <div className="px-6 py-10 text-center text-slate-500">
            Match Not Found
          </div>
        )}

        {/* ページャー（リスト末尾） */}
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
