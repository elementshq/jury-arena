"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type MatchWithInfo,
  useMatchSelection,
} from "../_hooks/use-match-selection";
import { isDemo } from "@/lib/is-demo";
import { MatchDetailEmptyState } from "./match-detail-empty-state";
import { MatchDetailPane } from "./match-detail-pane";
import { MatchListPane } from "./match-list-pane";

const ITEMS_PER_PAGE = 10;

/**
 * hash から matchIndex を読む: #matchIndex=237
 */
function readMatchIndexFromHash(): number | null {
  if (typeof window === "undefined") return null;

  const h = window.location.hash || "";
  const s = h.startsWith("#") ? h.slice(1) : h;
  const params = new URLSearchParams(s);

  const raw = params.get("matchIndex");
  if (!raw) return null;

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * hash に matchIndex を書く（他の hash パラメータがあれば保持）
 */
function writeMatchIndexToHash(matchIndex: number | null) {
  if (typeof window === "undefined") return;

  const h = window.location.hash || "";
  const s = h.startsWith("#") ? h.slice(1) : h;
  const params = new URLSearchParams(s);

  if (matchIndex != null) params.set("matchIndex", String(matchIndex));
  else params.delete("matchIndex");

  const next = params.toString();
  const nextHash = next ? `#${next}` : "";

  // 履歴を汚さない
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
}

export function MatchesSplitView(props: {
  children: React.ReactNode;
  matches: MatchWithInfo[];
  sampleListHref: string;
  projectId: string;
}) {
  const { children, matches, sampleListHref, projectId } = props;

  const [searchQuery, setSearchQuery] = useState("");
  const [targetModel, setTargetModel] = useState<string | null>(null);
  const [opponentModel, setOpponentModel] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const selection = useMatchSelection({ matches });
  const {
    selectedId,
    selectedMatch,
    selectedInfo,
    selectMatch,
    clearSelection,
    setSelectedInfo,
  } = selection;

  /**
   * クリック：選択 + hash更新（matchIndex） + 詳細取得
   */
  const handleSelectMatch = useCallback(
    async (m: MatchWithInfo) => {
      selectMatch(m);

      const idx = m.matchNumber ?? null;
      writeMatchIndexToHash(idx != null ? Number(idx) : null);

      // 詳細取得（matchIdがある場合のみ）
      if (m.matchId) {
        try {
          const url = isDemo
            ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/projects/${projectId}/matches/detail/${m.matchId}.json`
            : `/api/matches/${m.matchId}`;
          const response = await fetch(url);
          if (response.ok) {
            const detail = await response.json();
            setSelectedInfo(detail);
          } else {
            console.error("Failed to fetch match detail");
          }
        } catch (error) {
          console.error("Error fetching match detail:", error);
        }
      }
    },
    [selectMatch, setSelectedInfo, projectId],
  );

  /**
   * 初期復元：hash の matchIndex から選択を復元
   */
  useEffect(() => {
    const applyFromHash = () => {
      const idx = readMatchIndexFromHash();
      if (idx == null) return;

      const current = selectedMatch?.matchNumber ?? null;
      if (current != null && Number(current) === idx) return;

      const found = matches.find((m) => Number(m.matchNumber) === idx);
      if (found) {
        selectMatch(found);
      } else {
        writeMatchIndexToHash(null);
        clearSelection();
      }
    };

    applyFromHash();

    const onHashChange = () => applyFromHash();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [matches, selectedMatch, selectMatch, clearSelection]);

  /**
   * モデル候補（Match からユニーク抽出）
   */
  const modelOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) {
      if (m.targetModel) s.add(m.targetModel);
      if (m.opponentModel) s.add(m.opponentModel);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  /**
   * フィルタ
   */
  const filteredMatches = useMemo(() => {
    let list = matches;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const idHit = (m.id ?? "").toLowerCase().includes(q);
        const matchNoHit =
          m.matchNumber != null && String(m.matchNumber).includes(q);
        const sampleIdHit = (m.sampleId ?? "").toLowerCase().includes(q);
        return idHit || matchNoHit || sampleIdHit;
      });
    }

    if (targetModel) {
      list = list.filter(
        (m) => m.targetModel === targetModel || m.opponentModel === targetModel,
      );
    }

    if (opponentModel) {
      list = list.filter(
        (m) =>
          m.targetModel === opponentModel || m.opponentModel === opponentModel,
      );
    }

    if (targetModel && opponentModel) {
      list = list.filter((m) => {
        const a = m.targetModel ?? null;
        const b = m.opponentModel ?? null;
        return (
          (a === targetModel && b === opponentModel) ||
          (a === opponentModel && b === targetModel)
        );
      });
    }

    return list;
  }, [matches, searchQuery, targetModel, opponentModel]);

  /**
   * ページング
   */
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMatches.length / ITEMS_PER_PAGE)),
    [filteredMatches.length],
  );

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMatches.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMatches, currentPage]);

  /**
   * フィルタで一覧が変わったとき、選択が一覧外なら解除し hash も消す
   */
  useEffect(() => {
    if (!selectedId) return;

    const exists = filteredMatches.some((m) => m.id === selectedId);
    if (!exists) {
      clearSelection();
      writeMatchIndexToHash(null);
    }
  }, [filteredMatches, selectedId, clearSelection]);

  if (matches.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center py-12">
        <p className="text-slate-500">Match Not Found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <MatchListPane
        matches={paginated}
        selectedId={selectedId}
        onSelectMatch={handleSelectMatch}
        sampleListHref={sampleListHref}
        searchQuery={searchQuery}
        onChangeSearchQuery={(q) => {
          setSearchQuery(q);
          setCurrentPage(1);
        }}
        modelOptions={modelOptions}
        targetModel={targetModel}
        opponentModel={opponentModel}
        onChangeTargetModel={(m) => {
          setTargetModel(m);
          setCurrentPage(1);
        }}
        onChangeOpponentModel={(m) => {
          setOpponentModel(m);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        totalPages={totalPages}
        onChangePage={(p) => setCurrentPage(p)}
      >
        {children}
      </MatchListPane>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-auto p-6">
          {selectedMatch ? (
            <MatchDetailPane selectedInfo={selectedInfo as any} />
          ) : (
            <MatchDetailEmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
