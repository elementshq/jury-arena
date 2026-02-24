"use client";

import * as React from "react";

type Role = "system" | "developer" | "user" | "assistant" | "tool";

type ViewerMessage = {
  role?: Role | string;
  content?: unknown;
};

function toTextContent(content: unknown): string | null {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") return "";
        const obj = p as Record<string, unknown>;

        // Text content
        if (obj.type === "text" && typeof obj.text === "string") {
          return obj.text;
        }

        // File reference - show full path
        if (obj.type === "file_ref" && typeof obj.path === "string") {
          return `[Attachment: ${obj.path}]`;
        }

        // Image URL
        if (obj.type === "image_url") {
          const url = (obj.image_url as any)?.url || (obj as any).url;
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

        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  }

  return null;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
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

export function MessageViewer(props: { messages: ViewerMessage[] }) {
  const normalized = React.useMemo(() => {
    return (props.messages ?? [])
      .map((m) => {
        const role = typeof m?.role === "string" ? m.role : "unknown";
        const text = toTextContent(m?.content);
        return text && text.trim() ? { role, text } : null;
      })
      .filter(Boolean) as { role: string; text: string }[];
  }, [props.messages]);

  if (normalized.length === 0) return null;

  const seen = new Map<string, number>();

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 space-y-6">
        {normalized.map((m, idx) => {
          const baseKey = `${m.role}:${hashString(m.text)}`;
          const count = seen.get(baseKey) ?? 0;
          seen.set(baseKey, count + 1);

          return (
            <React.Fragment key={`${baseKey}#${count}`}>
              <div
                className={[
                  "pl-4 border-l-2 space-y-1",
                  railColor(m.role),
                ].join(" ")}
              >
                {/* role label */}
                <div className="text-xs text-slate-500 font-medium">
                  {m.role}
                </div>

                {/* message body */}
                <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900">
                  {m.text}
                </pre>
              </div>

              {/* divider */}
              {idx < normalized.length - 1 && <MessageDivider />}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
