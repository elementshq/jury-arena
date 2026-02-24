"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * 左リスト表示用の最小単位（あなたの型に合わせて）
 */
export interface MatchListItem {
  id?: string;
  matchNumber?: number | null;
  sampleId?: string | null;
  createdAt: Date;
  preview?: string | null;
}

/**
 * SplitView が持つ「詳細込み」データ
 * info は右ペイン用（スキーマ未確定なので unknown）
 * 軽量化のためoptionalに変更（クリック時にmatchIdで詳細取得）
 */
export interface MatchWithInfo extends MatchListItem {
  info?: unknown;
  matchId?: string; // 詳細取得用のID

  // フィルタ用（モデルペア）
  targetModel?: string | null;
  opponentModel?: string | null;

  // 表示用
  modelA?: string | null;
  modelB?: string | null;
  winner?: string | null;
  judgeCount?: number; // Judge models数
}

export function useMatchSelection(args: { matches: MatchWithInfo[] }) {
  const { matches } = args;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [selectedInfo, setSelectedInfo] = useState<unknown | null>(null);

  const selectedMatch = useMemo(() => {
    if (!selectedId) return null;
    return matches.find((m) => m.id === selectedId) ?? null;
  }, [matches, selectedId]);

  const clearSelection = useCallback(() => {
    selectedIdRef.current = null;
    setSelectedId(null);
    setSelectedInfo(null);
  }, []);

  const selectMatch = useCallback((match: MatchWithInfo) => {
    const id = match.id ?? null;
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedInfo(match.info ?? null);
  }, []);

  const setInfo = useCallback((info: unknown) => {
    setSelectedInfo(info);
  }, []);

  return {
    selectedId,
    selectedIdRef,
    selectedMatch,
    selectedInfo,
    selectMatch,
    clearSelection,
    setSelectedInfo: setInfo,
  };
}
