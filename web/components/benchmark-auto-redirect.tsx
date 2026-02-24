"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { setActive } from "@/lib/active-benchmark";
import {
  getRunningBenchmark,
  type RunningBenchmark,
  setRunningBenchmark,
  // ※ isBenchmarkRunModalOpen を使って「モーダルが開いてる時はポーリングしない」にしたいなら import
  // isBenchmarkRunModalOpen,
  // EVT_MODAL_OPEN_CHANGED,
} from "./running-benchmark-banner";

type BenchmarkState = {
  status: "queued" | "running" | "finished" | "failed" | "stopped";
};

function isTerminalStatus(s?: BenchmarkState["status"] | null) {
  return s === "finished" || s === "failed" || s === "stopped";
}

export function BenchmarkAutoRedirect() {
  const router = useRouter();
  const [running, setRunning] = useState<RunningBenchmark | null>(null);

  // 多重push防止
  const pushedRef = useRef<string | null>(null);

  useEffect(() => {
    const sync = () => setRunning(getRunningBenchmark());
    sync();

    const LS_KEY = "jury-arena:running-benchmark";
    const EVT_RUNNING_CHANGED = "running-benchmark-changed";

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) sync();
    };
    const onCustom = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT_RUNNING_CHANGED, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT_RUNNING_CHANGED, onCustom);
    };
  }, []);

  useEffect(() => {
    if (!running) return;

    if (pushedRef.current === running.benchmarkId) return;

    let cancelled = false;
    const ac = new AbortController();

    const tick = async () => {
      if (cancelled || ac.signal.aborted) return;

      try {
        const res = await fetch(
          `/api/benchmarks/${encodeURIComponent(running.benchmarkId)}/state`,
          { cache: "no-store", signal: ac.signal },
        );
        if (!res.ok) throw new Error(`state ${res.status}`);

        const data = (await res.json()) as BenchmarkState;
        if (cancelled || ac.signal.aborted) return;

        if (isTerminalStatus(data.status)) {
          pushedRef.current = running.benchmarkId;

          // 先に必要情報を保持（running はこの effect のクロージャで保持されてるのでOK）
          const projectId = running.projectId;
          const benchmarkId = running.benchmarkId;

          // グローバル状態を掃除
          setRunningBenchmark(null);
          setActive(null);

          // 問答無用で遷移
          router.push(`/projects/${projectId}/evaluations/${benchmarkId}`);
          return;
        }

        setTimeout(tick, 1500);
      } catch {
        if (cancelled || ac.signal.aborted) return;
        setTimeout(tick, 2000);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [running, router]);

  return null;
}
