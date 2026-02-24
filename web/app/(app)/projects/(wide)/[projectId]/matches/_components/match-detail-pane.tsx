"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import React, { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ArenaMatchData,
  SampleInfo,
  TrialResult,
} from "@/lib/db/types/jsonb"; // 実際のパス

type ViewMode = "formatted" | "raw";

type MatchDetailInfo = {
  match: ArenaMatchData;
  sampleInfo: SampleInfo;
  trialA: TrialResult | null;
  trialB: TrialResult | null;
};

function toPretty(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function Block(props: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">{props.title}</div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
          {props.body}
        </pre>
      </div>
    </div>
  );
}

function railColor(role: string) {
  switch (role) {
    case "assistant":
      return "border-l-indigo-300";
    case "user":
      return "border-l-slate-300";
    case "system":
    case "developer":
      return "border-l-purple-200";
    default:
      return "border-l-slate-200";
  }
}

function MessageDivider() {
  return (
    <div className="flex items-center my-4">
      <div className="flex-1 border-t border-slate-200" />
      <div className="mx-3 text-slate-300 text-xs leading-none">•</div>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

function MessagesViewer(props: {
  messages: Array<{ role: string; content: string }>;
}) {
  if (!props.messages.length) return null;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 space-y-6">
        {props.messages.map((m, idx) => (
          <React.Fragment key={`${m.role}-${m.content.slice(0, 32)}-${idx}`}>
            <div
              className={["pl-4 border-l-2 space-y-1", railColor(m.role)].join(
                " ",
              )}
            >
              <div className="text-xs text-slate-500 font-medium">{m.role}</div>
              <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
                {m.content}
              </pre>
            </div>

            {idx < props.messages.length - 1 && <MessageDivider />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function HeaderKV(props: {
  label: string;
  value: string;
  right?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{props.label}</div>

      <div className="inline-flex items-center gap-1 max-w-full">
        <div className="font-mono text-sm text-slate-900 break-all">
          {props.value}
        </div>

        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
    </div>
  );
}

function TrialHeader(props: { model: string; winner?: boolean }) {
  const { model, winner } = props;

  return (
    <div
      className={[
        "px-5 py-4 flex items-center justify-between gap-3",
        "border-b border-slate-200",
        winner ? "!bg-emerald-600 !text-white" : "text-slate-900",
      ].join(" ")}
    >
      <div className="text-xl font-semibold truncate">{model}</div>

      {winner ? (
        <div className="flex items-center gap-2 font-semibold shrink-0">
          <span className="text-xl leading-none">🏆</span>
          <span className="text-2xl leading-none">Winner</span>
        </div>
      ) : null}
    </div>
  );
}

function TrialMeta(props: { trial: TrialResult }) {
  const t = props.trial;
  return (
    <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
      <span>
        tokens:{" "}
        <span className="font-mono text-slate-900">{t.tokens.input}</span> /{" "}
        <span className="font-mono text-slate-900">{t.tokens.output}</span>
      </span>
      <span>
        latency_ms:{" "}
        <span className="font-mono text-slate-900">{t.latency_ms}</span>
      </span>
      <span>
        cost_usd: <span className="font-mono text-slate-900">{t.cost_usd}</span>
      </span>
      {t.params?.temperature != null && (
        <span>
          temperature:{" "}
          <span className="font-mono text-slate-900">
            {t.params.temperature}
          </span>
        </span>
      )}
    </div>
  );
}

function isWinnerSide(
  winnerRaw: unknown,
  side: "A" | "B",
  modelA: string,
  modelB: string,
) {
  const w = String(winnerRaw ?? "").trim();
  if (!w) return false;

  const wl = w.toLowerCase();

  // 1) A/B
  if (wl === "a") return side === "A";
  if (wl === "b") return side === "B";

  // 2) model_a / model_b
  if (wl === "model_a") return side === "A";
  if (wl === "model_b") return side === "B";

  // 3) 実モデル名で入ってるケース（完全一致 or 含む）
  if (w === modelA) return side === "A";
  if (w === modelB) return side === "B";

  if (modelA && wl.includes(modelA.toLowerCase())) return side === "A";
  if (modelB && wl.includes(modelB.toLowerCase())) return side === "B";

  return false;
}

// Model A/B 表記を実モデル名に置換（本文/見出しどちらにも効く）
function replaceModelAB(text: string, modelA: string, modelB: string) {
  if (!text) return "";
  return text
    .replace(/\bModel\s*A\b/g, modelA)
    .replace(/\bModel\s*B\b/g, modelB)
    .replace(/\bmodel\s*a\b/gi, modelA)
    .replace(/\bmodel\s*b\b/gi, modelB);
}

/**
 * Judge output をできるだけ「画像の形式」に寄せて表示するためのパース
 * 期待: { A: "...", B: "...", winner: "A|B|tie", reason: "..." }
 */
type ParsedJudge = {
  winner?: "A" | "B" | "TIE";
  reason?: string; // 判定理由
  evalA?: string; // A評価
  evalB?: string; // B評価
  rawText: string; // フォールバック用
};

function tryParseJsonLoose(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeWinnerFromAny(x: unknown): "A" | "B" | "TIE" | undefined {
  const w = String(x ?? "")
    .trim()
    .toLowerCase();
  if (["a", "model_a", "left"].includes(w)) return "A";
  if (["b", "model_b", "right"].includes(w)) return "B";
  if (["tie", "draw"].includes(w)) return "TIE";
  return undefined;
}

function parseJudgeDetail(detail: any): ParsedJudge {
  const out = detail?.output;

  const rawText =
    typeof out === "string"
      ? out
      : out != null
        ? JSON.stringify(out, null, 2)
        : "";

  let obj: any | null = null;

  // 1) object ならそのまま
  if (out && typeof out === "object") obj = out;

  // 2) string が JSON っぽければ parse
  if (!obj && typeof out === "string") {
    const trimmed = out.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      obj = tryParseJsonLoose(trimmed);
    }
  }

  // 3) string 内に JSON 断片が埋まってる場合も拾う（最初の {...} を試す）
  if (!obj && typeof out === "string") {
    const m = out.match(/\{[\s\S]*\}/);
    if (m?.[0]) obj = tryParseJsonLoose(m[0]);
  }

  if (obj && typeof obj === "object") {
    const winner = normalizeWinnerFromAny(obj.winner);

    const evalA =
      typeof obj.A === "string"
        ? obj.A
        : typeof obj.a === "string"
          ? obj.a
          : undefined;

    const evalB =
      typeof obj.B === "string"
        ? obj.B
        : typeof obj.b === "string"
          ? obj.b
          : undefined;

    const reason =
      typeof obj.reason === "string"
        ? obj.reason
        : typeof obj.judgement_reason === "string"
          ? obj.judgement_reason
          : undefined;

    return { winner, reason, evalA, evalB, rawText };
  }

  // パース不可: raw を判定理由扱いで表示
  return { rawText, reason: rawText || undefined };
}

function WinnerPill(props: {
  winner?: "A" | "B" | "TIE";
  modelA: string;
  modelB: string;
}) {
  if (props.winner === "A") {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
        {props.modelA} 🏆 (左)
      </span>
    );
  }
  if (props.winner === "B") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
        {props.modelB} 🏆 (右)
      </span>
    );
  }
  if (props.winner === "TIE") {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-600 px-3 py-1 text-xs font-semibold text-white">
        Tie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
      Unknown
    </span>
  );
}

function JudgeCard(props: {
  index: number;
  judgeModel: string;
  parsed: ParsedJudge;
  modelA: string;
  modelB: string;
}) {
  const reasonText = props.parsed.reason
    ? replaceModelAB(props.parsed.reason, props.modelA, props.modelB)
    : "";

  const evalAText = props.parsed.evalA
    ? replaceModelAB(props.parsed.evalA, props.modelA, props.modelB)
    : "";

  const evalBText = props.parsed.evalB
    ? replaceModelAB(props.parsed.evalB, props.modelA, props.modelB)
    : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-purple-50 border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-semibold">
            {props.index}
          </div>
          <div className="font-semibold text-slate-900 truncate">
            {props.judgeModel}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="text-xs text-slate-500">判定</div>
          <WinnerPill
            winner={props.parsed.winner}
            modelA={props.modelA}
            modelB={props.modelB}
          />
        </div>
      </div>

      {/* body */}
      <div className="p-4 space-y-4">
        {/* 判定理由 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <MessageCircle size={16} />
            判定理由
          </div>

          <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
            <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
              {reasonText || "(empty)"}
            </pre>
          </div>
        </div>

        {/* A/B 評価（画像っぽく左右並び） */}
        {(evalAText || evalBText) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* A */}
            <div className="min-w-0 pl-4 border-l-4 border-blue-400">
              <div className="text-sm font-semibold text-blue-700 mb-2">
                {props.modelA} 評価
              </div>
              <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
                {evalAText || "(empty)"}
              </pre>
            </div>

            {/* B */}
            <div className="min-w-0 pl-4 border-l-4 border-emerald-400">
              <div className="text-sm font-semibold text-emerald-700 mb-2">
                {props.modelB} 評価
              </div>
              <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
                {evalBText || "(empty)"}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchDetailPane(props: {
  selectedInfo: MatchDetailInfo | null;
}) {
  const [view, setView] = useState<ViewMode>("formatted");

  // ✅ hooks は early return より前に
  const [copied, setCopied] = useState(false);

  const info = props.selectedInfo;

  const messages = useMemo(() => {
    if (!info) return [];

    const sampleInfo = (info as any)?.sampleInfo;
    const input = sampleInfo?.input;
    const msgs = input?.messages;

    if (!Array.isArray(msgs)) return [];

    return msgs
      .map((m: any) => {
        const role = typeof m?.role === "string" ? m.role : "unknown";

        // content が文字列の場合
        if (typeof m?.content === "string") {
          return { role, content: m.content };
        }

        // content が配列の場合（ContentPart[]）
        if (Array.isArray(m?.content)) {
          const parts = m.content
            .map((part: any) => {
              if (part.type === "text" && typeof part.text === "string") {
                return part.text;
              }
              if (part.type === "file_ref" && typeof part.path === "string") {
                return `[Attachment: ${part.path}]`;
              }
              if (part.type === "image_url") {
                const url = part.image_url?.url || part.url;
                if (typeof url === "string") {
                  // base64の場合は省略表示
                  if (url.startsWith("data:")) {
                    const match = url.match(/^data:([^;,]+)/);
                    const mimeType = match?.[1] || "image";
                    return `[Image: ${mimeType}]`;
                  }
                  return `[Image: ${url}]`;
                }
              }
              return JSON.stringify(part);
            })
            .join("\n");

          return { role, content: parts };
        }

        // その他の場合はJSONとして表示
        return { role, content: JSON.stringify(m?.content ?? "", null, 2) };
      })
      .filter((m) => m.content.trim().length > 0);
  }, [info]);

  // ✅ early return は hooks の後
  if (!info) {
    return <div className="text-slate-500">左からMatchを選択してください</div>;
  }

  const { match, trialA, trialB } = info;

  const copySampleId = async () => {
    const text = match.sample_id ?? "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
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

  return (
    <section className="h-full flex flex-col min-h-0">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="space-y-2">
          <HeaderKV
            label="Match Index"
            value={String(Number(match.match_id.replace(/^match_/, "")))}
          />
        </div>

        <SegmentedControl<ViewMode>
          value={view}
          onChange={setView}
          options={[
            { value: "formatted", label: "Formatted" },
            { value: "raw", label: "Raw JSON" },
          ]}
        />
      </div>

      {/* 本体 */}
      <div className="flex-1 min-h-0 overflow-auto space-y-8">
        {view === "raw" ? (
          <Block title="Raw Match Detail" body={toPretty(info)} />
        ) : (
          <>
            {/* Sample InputPrompt */}
            <div className="space-y-2">
              <div className="text-2xl font-medium text-slate-900">Sample</div>

              <TooltipProvider>
                <HeaderKV
                  label="Sample Id"
                  value={match.sample_id}
                  right={
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={copySampleId}
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
                          {copied ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </TooltipTrigger>

                      <TooltipContent side="top" align="end">
                        <span className="text-xs">
                          {copied ? "コピーしました" : "コピー"}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  }
                />
              </TooltipProvider>

              <div className="flex-1 min-h-0">
                <div className="bg-slate-200 p-5">
                  {messages.length > 0 ? (
                    <MessagesViewer messages={messages} />
                  ) : (
                    <Block
                      title="sample.info is missing or invalid"
                      body={toPretty((info as any)?.sampleInfo ?? null)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Trial outputs */}
            <div className="space-y-4">
              <div className="text-2xl font-medium text-slate-900">
                Trial Outputs
              </div>

              <div className="flex-1 min-h-0">
                <div className="bg-slate-200 p-5">
                  {(() => {
                    const winnerIsA = isWinnerSide(
                      match.winner,
                      "A",
                      match.model_a,
                      match.model_b,
                    );
                    const winnerIsB = isWinnerSide(
                      match.winner,
                      "B",
                      match.model_a,
                      match.model_b,
                    );

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* A */}
                        <div className="min-w-0 rounded-2xl bg-white overflow-hidden shadow-sm">
                          <TrialHeader
                            model={match.model_a}
                            winner={winnerIsA}
                          />

                          <div className="px-5 py-4 space-y-2">
                            {trialA ? (
                              <Block
                                title="Output"
                                body={toPretty(trialA.output)}
                              />
                            ) : (
                              <div className="text-sm text-slate-500">
                                Trial が見つかりません
                              </div>
                            )}
                          </div>
                        </div>

                        {/* B */}
                        <div className="min-w-0 rounded-2xl bg-white overflow-hidden shadow-sm">
                          <TrialHeader
                            model={match.model_b}
                            winner={winnerIsB}
                          />

                          <div className="px-5 py-4 space-y-2">
                            {trialB ? (
                              <Block
                                title="Output"
                                body={toPretty(trialB.output)}
                              />
                            ) : (
                              <div className="text-sm text-slate-500">
                                Trial が見つかりません
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Judge details */}
            <div className="space-y-3">
              <div className="text-2xl font-medium text-slate-900">
                Judge Details{" "}
                <span className="text-base text-slate-500 font-normal">
                  ({match.judge_models.length} judges)
                </span>
              </div>

              <div className="space-y-6">
                {match.judge_models.map((jm, idx) => {
                  const detail = match.judge_details?.[jm];
                  const parsed = parseJudgeDetail(detail);

                  return (
                    <JudgeCard
                      key={jm}
                      index={idx + 1}
                      judgeModel={jm}
                      parsed={parsed}
                      modelA={match.model_a}
                      modelB={match.model_b}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
