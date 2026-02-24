"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DatasetList } from "./dataset-card-list";
import type { DatasetSortBy } from "./dataset-list-header-actions";

type DatasetItem = Parameters<typeof DatasetList>[0]["datasets"][number];

function buildUrl(params: {
  projectId: string;
  limit: number;
  offset: number;
  search?: string;
  sortBy?: DatasetSortBy;
}) {
  const url = new URL("/api/datasets", window.location.origin);
  url.searchParams.set("projectId", params.projectId);
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("offset", String(params.offset));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.sortBy) {
    url.searchParams.set("orderBy", params.sortBy);
    url.searchParams.set("orderDir", params.sortBy === "name" ? "asc" : "desc");
  }
  return url.toString();
}

export function DatasetListWithLoadMore(props: {
  initialItems: DatasetItem[];
  projectId: string;
  pageSize?: number;
  total: number;
  search?: string;
  sortBy?: DatasetSortBy;
}) {
  const { initialItems, projectId, pageSize = 20, total, search, sortBy } =
    props;

  const [items, setItems] = useState<DatasetItem[]>(initialItems);
  const [offset, setOffset] = useState(initialItems.length);
  const [canLoadMore, setCanLoadMore] = useState(initialItems.length < total);

  const [isPending, startTransition] = useTransition();

  // When filters change (key changes → remount), load the first page if no initialItems
  useEffect(() => {
    if (initialItems.length > 0) return;

    startTransition(async () => {
      const res = await fetch(
        buildUrl({ projectId, limit: pageSize, offset: 0, search, sortBy }),
        { cache: "no-store" },
      );

      if (!res.ok) return;

      const data: { items: DatasetItem[] } = await res.json();
      setItems(data.items);
      setOffset(data.items.length);
      setCanLoadMore(data.items.length === pageSize);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- runs once on mount

  async function onLoadMore() {
    if (isPending || !canLoadMore) return;

    startTransition(async () => {
      const res = await fetch(
        buildUrl({ projectId, limit: pageSize, offset, search, sortBy }),
        { cache: "no-store" },
      );

      if (!res.ok) {
        setCanLoadMore(false);
        return;
      }

      const data: { items: DatasetItem[] } = await res.json();

      setItems((prev) => [...prev, ...data.items]);
      setOffset((prev) => prev + data.items.length);

      setCanLoadMore(data.items.length === pageSize);
    });
  }

  return (
    <div className="space-y-6">
      {isPending && items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No datasets found.
        </p>
      ) : (
        <DatasetList datasets={items} />
      )}

      {canLoadMore && (
        <div className="flex justify-center py-6">
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={isPending}
            className="flex flex-col items-center gap-1 px-6 py-3"
          >
            {isPending ? (
              "Loading..."
            ) : (
              <>
                <span>Load more</span>
                <ChevronDown className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
