"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SampleInfo } from "@/lib/db/types/jsonb";

export interface SampleListItem {
  id?: string;
  message: string;
  createdAt: Date;
}

// SplitView が持つ「詳細込み」データ（info は必須）
export interface SampleWithInfo extends SampleListItem {
  info: SampleInfo;
}

export function useSampleSelection(args: { samples: SampleWithInfo[] }) {
  const { samples } = args;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [selectedInfo, setSelectedInfo] = useState<SampleInfo | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    selectedIdRef.current = null;
    setSelectedInfo(null);
  }, []);

  const selectedSample = useMemo<SampleWithInfo | null>(() => {
    if (!selectedId) return null;
    return samples.find((s) => s.id === selectedId) ?? null;
  }, [samples, selectedId]);

  // 一覧が変わって、選択中のIDが存在しなくなったらクリア
  useEffect(() => {
    if (!selectedId) return;
    if (!samples.some((s) => s.id === selectedId)) {
      clearSelection();
    }
  }, [samples, selectedId, clearSelection]);

  const selectSample = useCallback((sample: SampleWithInfo) => {
    const id = sample.id ?? null;

    setSelectedId(id);
    selectedIdRef.current = id;

    // 取得済み info をそのまま使う（遅延ロードしない）
    setSelectedInfo(sample.info ?? null);
  }, []);

  return {
    selectedId,
    selectedSample, // SampleWithInfo | null
    selectedInfo, // SampleInfo | null
    selectSample,
    clearSelection,
  };
}
