"use client";

import { useState } from "react";
import { setRunningBenchmark } from "@/components/running-benchmark-banner";
import { Button } from "@/components/ui/button";

const ACTIVE_KEY = "jury-arena:active-benchmark-id";

function setActive(v: string | null) {
  if (typeof window === "undefined") return;
  if (!v) window.localStorage.removeItem(ACTIVE_KEY);
  else window.localStorage.setItem(ACTIVE_KEY, v);
  window.dispatchEvent(new Event("active-benchmark-changed"));
}

export function StartBenchmarkButton(props: {
  projectId: string;
  datasetId: string;
  datasetName: string;
  config: any;
  onStarted?: () => void;
  disabled?: boolean;
}) {
  const { projectId, datasetId, datasetName, config, onStarted, disabled } =
    props;
  const [starting, setStarting] = useState(false);

  async function onStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    setStarting(true);
    try {
      // In demo mode, skip the API call and use a mock benchmark ID directly.
      if (process.env.NEXT_PUBLIC_DEMO === "1") {
        const benchmarkId = `demo-mock-${Date.now()}`;
        setRunningBenchmark({ benchmarkId, projectId, datasetId, datasetName, startedAt: Date.now() });
        setActive(benchmarkId);
        onStarted?.();
        return;
      }

      const res = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          datasetId,
          config,
          resume: false,
        }),
        cache: "no-store",
      });

      const bodyText = await res.text().catch(() => "");

      const payload = JSON.parse(bodyText) as {
        benchmarkId: string;
        benchmarkName?: string;
        configPath?: string;
        pid?: number;
        ok?: boolean;
      };

      if (!res.ok) {
        throw new Error(bodyText || "failed to start benchmark");
      }

      // running banner 用
      setRunningBenchmark({
        benchmarkId: payload.benchmarkId,
        projectId,
        datasetId,
        datasetName,
        startedAt: Date.now(),
      });

      // progress host 用（これで Host がモーダルを開ける）
      setActive(payload.benchmarkId);

      onStarted?.();
    } finally {
      setStarting(false);
    }
  }

  return (
    <Button type="button" onClick={onStart} disabled={starting || disabled}>
      {starting ? "Starting..." : "Run Evaluation"}
    </Button>
  );
}
