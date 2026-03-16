"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateDatasetName } from "../actions";

type Props = {
  projectId: string;
  datasetId: string;
  initialName: string;
  className?: string;
};

export function DatasetNameEditable({
  projectId,
  datasetId,
  initialName,
  className,
}: Props) {
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const savedOnceRef = useRef(false);

  useEffect(() => {
    setValue(initialName);
    if (!isEditing) setDraft(initialName);
  }, [initialName, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    savedOnceRef.current = false;

    queueMicrotask(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isEditing]);

  function openEdit() {
    if (isPending) return;
    setError(null);
    setDraft(value);
    setIsEditing(true);
  }

  function cancel() {
    setError(null);
    setDraft(value);
    setIsEditing(false);
  }

  function commitSave() {
    if (!isEditing) return;
    if (savedOnceRef.current) return;
    savedOnceRef.current = true;

    const next = draft.trim();

    if (next.length === 0) {
      setError("空は不可");
      savedOnceRef.current = false;
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return;
    }

    if (next === value) {
      setError(null);
      setIsEditing(false);
      return;
    }

    const prev = value;

    setValue(next);
    setError(null);
    setIsEditing(false);

    startTransition(async () => {
      try {
        await updateDatasetName({ projectId, datasetId, name: next });
        router.refresh();
      } catch {
        setValue(prev);
        setDraft(prev);
        setError("保存に失敗しました");
        router.refresh();
      }
    });
  }

  function onRootPointerDownCapture(e: React.PointerEvent<HTMLDivElement>) {
    if (!isEditing) return;
    const root = rootRef.current;
    if (!root) return;

    if (!root.contains(e.target as Node)) {
      commitSave();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  return (
    <div
      ref={rootRef}
      className={className}
      onPointerDownCapture={onRootPointerDownCapture}
    >
      {!isEditing ? (
        <div className="group inline-flex items-center gap-2">
          {/* タイトルはただのテキスト。クリックしても編集しない */}
          <span className="text-4xl font-bold tracking-tight select-text">
            {value}
          </span>

          {/* 編集は鉛筆ボタンのみ（デモモードでは非表示） */}
          {process.env.NEXT_PUBLIC_DEMO !== "1" && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openEdit}
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Rename dataset"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}

          {isPending ? (
            <span className="ml-1 text-sm opacity-60">saving...</span>
          ) : null}
        </div>
      ) : (
        <div className="inline-flex items-end">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setError(null);
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => commitSave()}
            disabled={isPending}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={[
              "w-[min(560px,90vw)]",
              "bg-slate-50 rounded-sm px-1 -mx-1",
              "text-4xl font-bold tracking-tight",
              "outline-none",
              "border-0 shadow-none ring-0",
              "focus:ring-0 focus:border-0",
            ].join(" ")}
            aria-label="Dataset name"
          />
        </div>
      )}

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
