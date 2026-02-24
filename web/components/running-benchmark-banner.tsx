"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type RunningBenchmark = {
  benchmarkId: string;
  projectId: string;
  datasetId: string;
  datasetName: string;

  // 追加: ゴミ掃除用
  startedAt: number; // Date.now()
  ttlMs?: number;
};

const LS_KEY = "jury-arena:running-benchmark";
const EVT_RUNNING_CHANGED = "running-benchmark-changed";

// 追加: modal が開いている間は banner 側の監視を止める
export const MODAL_OPEN_KEY = "jury-arena:benchmark-run-modal-open";
export const EVT_MODAL_OPEN_CHANGED = "benchmark-run-modal-open-changed";

// 好みで調整（例: 6時間）
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function setRunningBenchmark(value: RunningBenchmark | null) {
  if (typeof window === "undefined") return;

  if (!value) {
    window.localStorage.removeItem(LS_KEY);
  } else {
    const v: RunningBenchmark = {
      ...value,
      startedAt: value.startedAt ?? Date.now(),
      ttlMs: value.ttlMs ?? DEFAULT_TTL_MS,
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(v));
  }
  window.dispatchEvent(new Event(EVT_RUNNING_CHANGED));
}

function isExpired(v: RunningBenchmark) {
  const ttl = v.ttlMs ?? DEFAULT_TTL_MS;
  return Date.now() - v.startedAt > ttl;
}

export function getRunningBenchmark(): RunningBenchmark | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(LS_KEY);
  if (!raw) return null;

  try {
    const v = JSON.parse(raw) as RunningBenchmark;

    if (!v || typeof v.benchmarkId !== "string") {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    if (typeof v.startedAt !== "number") {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    if (isExpired(v)) {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }

    return v;
  } catch {
    window.localStorage.removeItem(LS_KEY);
    return null;
  }
}

// modal open フラグ
export function setBenchmarkRunModalOpen(isOpen: boolean) {
  if (typeof window === "undefined") return;

  if (isOpen) window.localStorage.setItem(MODAL_OPEN_KEY, "1");
  else window.localStorage.removeItem(MODAL_OPEN_KEY);

  window.dispatchEvent(new Event(EVT_MODAL_OPEN_CHANGED));
}

export function isBenchmarkRunModalOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MODAL_OPEN_KEY) === "1";
}

/**
 * ヘッダー直下に出す「実行中バー」
 * - benchmarkId が localStorage にある間表示
 * - modal を開いていない時だけ state をポーリングして終了を検知 → localStorage を消す
 */
export function RunningBenchmarkBanner(props: {
  onViewProgress: (benchmarkId: string) => void;
}) {
  const { onViewProgress } = props;
  const [running, setRunning] = useState<RunningBenchmark | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const sync = () => setRunning(getRunningBenchmark());
    const syncModal = () => setModalOpen(isBenchmarkRunModalOpen());

    sync();
    syncModal();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) sync();
      if (e.key === MODAL_OPEN_KEY) syncModal();
    };

    const onRunning = () => sync();
    const onModal = () => syncModal();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT_RUNNING_CHANGED, onRunning);
    window.addEventListener(EVT_MODAL_OPEN_CHANGED, onModal);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT_RUNNING_CHANGED, onRunning);
      window.removeEventListener(EVT_MODAL_OPEN_CHANGED, onModal);
    };
  }, []);

  if (!running) return null;

  return (
    <div className="flex items-center justify-between bg-blue-50 px-4 py-1 border-y border-blue-200">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex size-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
        <span className="font-medium">
          Running benchmark: {running.datasetName}
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onViewProgress(running.benchmarkId);
        }}
      >
        View Progress
      </Button>
    </div>
  );
}
