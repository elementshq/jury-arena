"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SampleInfo } from "@/lib/db/types/jsonb";
import type { SampleWithInfo } from "../_hooks/use-sample-selection";
import { MessageViewer } from "./message-viewer";
import { SampleDetailEmptyState } from "./sample-detail-empty-state";
import { SampleInfoJsonViewer } from "./sample-info-json-viewer";

function SampleIdHeader(props: {
  sampleId: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="text-xs text-slate-500">Sample Id</div>

      <div className="inline-flex items-center gap-1">
        <div className="font-mono text-sm text-slate-900 break-all">
          {props.sampleId}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={props.onCopy}
              className={[
                "inline-flex items-center justify-center",
                "h-7 w-7 rounded",
                "bg-transparent",
                "text-slate-500 hover:text-slate-900",
                "hover:bg-slate-100",
                "focus:outline-none focus:ring-2 focus:ring-slate-300",
              ].join(" ")}
              aria-label="Copy Sample Id"
            >
              {props.copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>

          <TooltipContent side="top" align="center">
            <span className="text-xs">
              {props.copied ? "コピーしました" : "コピー"}
            </span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

type ViewMode = "messages" | "raw";
type OpenAIMessage = { role?: string; content?: unknown };

function extractMessages(info: SampleInfo): OpenAIMessage[] {
  const anyInfo = info as unknown as { input?: { messages?: unknown } };
  const messages = anyInfo?.input?.messages;
  return Array.isArray(messages) ? (messages as OpenAIMessage[]) : [];
}

export function SampleDetailPane(props: {
  selectedId: string | null;
  selectedInfo: SampleInfo | null;
  selectedSample: SampleWithInfo | null;
}) {
  const { selectedId, selectedInfo, selectedSample } = props;

  // ✅ hooks は early return より前
  const [view, setView] = useState<ViewMode>("messages");
  const [copied, setCopied] = useState(false);

  const idToShow = selectedId ?? selectedSample?.id ?? null;
  const infoToShow = selectedInfo;

  const messages = useMemo(() => {
    if (!infoToShow) return [];
    return extractMessages(infoToShow);
  }, [infoToShow]);

  const copySampleId = async () => {
    if (!idToShow) return;

    try {
      await navigator.clipboard.writeText(idToShow);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = idToShow;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (!idToShow || !infoToShow) {
    return <SampleDetailEmptyState />;
  }

  return (
    <section className="h-full flex flex-col min-h-0">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <TooltipProvider>
          <SampleIdHeader
            sampleId={idToShow}
            onCopy={copySampleId}
            copied={copied}
          />
        </TooltipProvider>

        <SegmentedControl<ViewMode>
          value={view}
          onChange={setView}
          options={[
            { value: "messages", label: "Messages" },
            { value: "raw", label: "Raw JSON" },
          ]}
        />
      </div>

      {/* 本体 */}
      <div className="flex-1 min-h-0">
        <div className="bg-slate-200 p-5">
          {view === "messages" ? (
            <MessageViewer messages={messages} />
          ) : (
            <SampleInfoJsonViewer info={infoToShow} />
          )}
        </div>
      </div>
    </section>
  );
}
