"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Props = {
  projectId: string;
  datasetId: string;
  datasetName?: string;
};

export function DeleteDatasetButton({
  projectId,
  datasetId,
  datasetName,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (isPending) return;

    setError(null);

    try {
      const res = await fetch(`/api/datasets/${datasetId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(text || `Delete failed (HTTP ${res.status})`);
        return;
      }

      startTransition(() => {
        router.push(`/projects/${projectId}`);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-2">
      {error && <div className="text-sm text-destructive">{error}</div>}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive "
            disabled={isPending}
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{datasetName ? ` “${datasetName}”` : " dataset"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

            <Button
              variant="destructive"
              disabled={isPending}
              onClick={onDelete}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
