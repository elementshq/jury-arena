"use client";

import { useEffect, useState } from "react";
import {
  ACTIVE_KEY,
  EVT_ACTIVE_CHANGED,
  getActive,
  setActive,
} from "@/lib/active-benchmark";
import { BenchmarkRunModal } from "./benchmark-run-modal";
import { RunningBenchmarkBanner } from "./running-benchmark-banner";

export function BenchmarkProgressGlobalBar() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setActiveId(getActive());
    sync();

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_KEY) sync();
    };
    const onCustom = () => sync();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT_ACTIVE_CHANGED, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT_ACTIVE_CHANGED, onCustom);
    };
  }, []);

  useEffect(() => {
    if (activeId) setOpen(true);
  }, [activeId]);

  function onViewProgress(id: string) {
    setActive(id);
    setOpen(true);
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setTimeout(() => {
        setActive(null);
      }, 0);
    }
  }

  return (
    <>
      <RunningBenchmarkBanner onViewProgress={onViewProgress} />

      {activeId && (
        <BenchmarkRunModal
          open={open}
          onOpenChange={onOpenChange}
          benchmarkId={activeId}
          onTerminal={() => {}}
        />
      )}
    </>
  );
}
