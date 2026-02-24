"use client";

import { useRouter } from "next/navigation";
import { DatasetTemplateKey } from "@/lib/templates/dataset-source";
import { DatasetEmpty } from "./dataset-empty";
import { UploadModal } from "./upload-modal";

export function DatasetUploadProvider(props: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showEmpty?: boolean; // dataset 0件の時だけ true にする想定
}) {
  const { projectId, open, onOpenChange, showEmpty } = props;
  const router = useRouter();

  async function createFromTemplate(title?: string, templateKey?: DatasetTemplateKey) {
    const key = templateKey || DatasetTemplateKey.Basic20Jmtbench;
    const res = await fetch("/api/datasets/from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: title || key,
        templateKey: key,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("create dataset from template failed", res.status, text);
      alert("Template import failed. See console.");
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  async function createFromUpload(args: {
    title: string;
    content: string;
    fileName?: string;
  }) {
    const res = await fetch("/api/datasets/from-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: args.title,
        content: args.content,
        fileName: args.fileName,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("create dataset from upload failed", res.status, text);
      throw new Error(text || "Upload failed");
    }

    onOpenChange(false);
    router.refresh();
  }

  async function createFromZipUpload(args: {
    title: string;
    zipBuffer: ArrayBuffer;
    fileName?: string;
  }) {
    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("name", args.title);
    formData.append("file", new Blob([args.zipBuffer]), args.fileName || "dataset.zip");

    const res = await fetch("/api/datasets/from-upload", {
      method: "POST",
      body: formData, // No Content-Type header - browser sets it with boundary
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("create dataset from ZIP failed", res.status, text);
      throw new Error(text || "ZIP upload failed");
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <>
      {showEmpty ? <DatasetEmpty onUpload={() => onOpenChange(true)} /> : null}

      <UploadModal
        open={open}
        onOpenChange={onOpenChange}
        projectId={projectId}
        onCreateFromTemplate={createFromTemplate}
        onCreateFromUpload={createFromUpload}
        onCreateFromZipUpload={createFromZipUpload}
      />
    </>
  );
}
