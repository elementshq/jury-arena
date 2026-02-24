"use client";

import { Sparkles, Upload, Check } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DatasetTemplates,
  type DatasetTemplateKey,
} from "@/lib/templates/dataset-source";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // template
  onCreateFromTemplate: (title?: string, templateKey?: DatasetTemplateKey) => Promise<void> | void;

  // ✅ upload（jsonl）
  onCreateFromUpload: (args: {
    title: string;
    content: string;
    fileName?: string;
  }) => Promise<void> | void;

  // ✅ upload（zip）
  onCreateFromZipUpload?: (args: {
    title: string;
    zipBuffer: ArrayBuffer;
    fileName?: string;
  }) => Promise<void> | void;

  projectId: string;
}

function stripExt(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function isValidFileName(fileName: string) {
  return /\.(jsonl|zip)$/i.test(fileName);
}

function isJsonlFileName(fileName: string) {
  return /\.jsonl$/i.test(fileName);
}

function isZipFileName(fileName: string) {
  return /\.zip$/i.test(fileName);
}

function splitNonEmptyLines(content: string) {
  return content
    .replace(/^\uFEFF/, "") // BOM
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function previewLines(content: string, maxLines: number) {
  const lines = splitNonEmptyLines(content);
  const shown = lines.slice(0, maxLines);
  return {
    total: lines.length,
    shown,
    text:
      shown.join("\n") +
      (lines.length > maxLines
        ? `\n... (${lines.length - maxLines} more)`
        : ""),
  };
}

/**
 * 軽いクライアント検証（完全検証はサーバで Zod に任せる）
 * - 先頭N行だけ JSON.parse を試す
 */
function validateJsonlLight(content: string, maxCheckLines = 20) {
  const lines = splitNonEmptyLines(content);
  if (!lines.length) return { ok: false as const, message: "File is empty" };

  const n = Math.min(lines.length, maxCheckLines);
  for (let i = 0; i < n; i++) {
    const line = lines[i]!;
    try {
      const obj = JSON.parse(line);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return {
          ok: false as const,
          message: `Line ${i + 1}: JSON must be an object`,
        };
      }
    } catch {
      return { ok: false as const, message: `Line ${i + 1}: invalid JSON` };
    }
  }
  return { ok: true as const };
}

export function UploadModal({
  open,
  onOpenChange,
  onCreateFromTemplate,
  onCreateFromUpload,
  onCreateFromZipUpload,
  projectId,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [uploadType, setUploadType] = useState<"upload" | "template" | null>(
    null,
  );

  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<DatasetTemplateKey | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [fileContent, setFileContent] = useState("");
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!fileContent) return null;
    return previewLines(fileContent, 10);
  }, [fileContent]);

  function resetState() {
    setTitle("");
    setUploadType(null);
    setSelectedTemplateKey(null);
    setFileName(undefined);
    setFileContent("");
    setFileBuffer(null);
    setSubmitting(false);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function pickUniqueTitle(baseName: string) {
    const res = await fetch("/api/datasets/pick-unique-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, baseName }),
    });

    if (res.ok) {
      const data = (await res.json()) as { name: string };
      return data.name;
    }
    return baseName;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidFileName(file.name)) {
      setFileName(file.name);
      setFileContent("");
      setFileBuffer(null);
      setErrorMsg('Only ".jsonl" and ".zip" files are supported.');
      return;
    }

    setFileName(file.name);
    setUploadType("upload");

    // title auto-fill (unique)
    if (!title) {
      const base = stripExt(file.name);
      const unique = await pickUniqueTitle(base);
      setTitle(unique);
    }

    const reader = new FileReader();

    if (isZipFileName(file.name)) {
      // ZIP file: read as ArrayBuffer
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        setFileBuffer(buffer);
        setFileContent(""); // Clear text content
        setErrorMsg(null); // No validation for ZIP yet
      };
      reader.onerror = () => {
        setErrorMsg("Failed to read file");
      };
      reader.readAsArrayBuffer(file);
    } else {
      // JSONL file: read as text (existing logic)
      reader.onload = (event) => {
        const content = (event.target?.result ?? "") as string;
        setFileContent(content);
        setFileBuffer(null); // Clear buffer

        const v = validateJsonlLight(content);
        if (!v.ok) setErrorMsg(v.message);
      };
      reader.onerror = () => {
        setErrorMsg("Failed to read file");
      };
      reader.readAsText(file);
    }
  };

  const handleUseTemplate = async () => {
    setErrorMsg(null);
    setUploadType("template");

    const baseName = title?.trim() || "template samples";
    const unique = await pickUniqueTitle(baseName);
    setTitle(unique);

    setFileName(undefined);
    setFileContent("");
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!uploadType) return;

    setSubmitting(true);
    try {
      if (uploadType === "template") {
        const datasetTitle = title?.trim() || "template samples";
        await onCreateFromTemplate(datasetTitle, selectedTemplateKey ?? undefined);

        resetState();
        onOpenChange(false);
        return;
      }

      // upload
      const datasetTitle = title?.trim();
      if (!datasetTitle) throw new Error("Title is required");

      if (fileBuffer) {
        // ZIP upload
        if (!onCreateFromZipUpload) {
          throw new Error("ZIP upload not supported");
        }

        await onCreateFromZipUpload({
          title: datasetTitle,
          zipBuffer: fileBuffer,
          fileName,
        });
      } else {
        // JSONL upload (existing logic)
        if (!fileContent.trim()) throw new Error("File content is empty");

        const v = validateJsonlLight(fileContent);
        if (!v.ok) throw new Error(v.message);

        await onCreateFromUpload({
          title: datasetTitle,
          content: fileContent,
          fileName,
        });
      }

      resetState();
      onOpenChange(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "internal error");
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add evaluation data</DialogTitle>
          <DialogDescription>
            Upload a JSONL file or ZIP (with attachments) or start with a template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder='e.g. "customer-support-logs"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-slate-600">
              This becomes the dataset name. Must be unique within the project.
            </p>
          </div>

          {!uploadType && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-24 flex flex-col gap-2"
                disabled={submitting}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6" />
                <span>Upload</span>
                <span className="text-xs text-slate-600">.jsonl or .zip</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-24 flex flex-col gap-2"
                disabled={submitting}
                onClick={handleUseTemplate}
              >
                <Sparkles className="h-6 w-6" />
                <span>Use template</span>
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".jsonl,.zip"
            className="hidden"
            onChange={handleFileUpload}
            disabled={submitting}
          />

          {uploadType === "upload" && (
            <div className="space-y-2">
              <Label>File</Label>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-slate-800 truncate">
                  {fileName ?? "(no file selected)"}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
              </div>

              {fileBuffer && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-900">
                    ZIP file selected: {fileName} ({(fileBuffer.byteLength / 1024).toFixed(1)} KB)
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    ZIP must contain samples.jsonl and attachments/ directory
                  </p>
                </div>
              )}

              {preview && !fileBuffer && (
                <>
                  <Label className="mt-2 block">Preview (first 10 lines)</Label>
                  <Textarea
                    value={preview.text}
                    readOnly
                    className="h-40 resize-none font-mono text-xs"
                  />
                  <p className="text-xs text-slate-600">
                    Detected {preview.total} samples (non-empty lines).
                  </p>
                </>
              )}

              {!fileBuffer && (
                <div className="rounded-md border p-3 text-xs text-slate-700 bg-slate-50">
                  <div className="font-medium mb-1">JSONL format</div>
                  <div className="font-mono whitespace-pre-wrap">
                    {`{"input":{"messages":[{"role":"user","content":"..."}]}}
{"input":{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."}]}}`}
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadType === "template" && (
            <div className="space-y-2">
              <Label>Language</Label>
              <div className="grid grid-cols-2 gap-3">
                {DatasetTemplates.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={submitting}
                    onClick={() => setSelectedTemplateKey(t.key)}
                    className={`relative flex items-center justify-center rounded-md border p-3 text-sm font-medium transition-colors ${
                      selectedTemplateKey === t.key
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {selectedTemplateKey === t.key && (
                      <Check className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-blue-500" />
                    )}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => {
              resetState();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={Boolean(
              submitting ||
              !uploadType ||
              !title.trim() ||
              (uploadType === "template" && !selectedTemplateKey) ||
              (uploadType === "upload" && !fileBuffer && (!fileContent.trim() || !!errorMsg)) ||
              (uploadType === "upload" && fileBuffer && !fileName)
            )}
          >
            {submitting ? "Adding..." : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
