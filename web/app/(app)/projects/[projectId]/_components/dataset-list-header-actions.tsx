"use client";

import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DatasetUploadProvider } from "./dataset-upload-provider";

export type DatasetSortBy = "createdAt" | "name";

export function DatasetListHeaderActions(props: {
  projectId: string;
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: DatasetSortBy;
  onSortByChange: (value: DatasetSortBy) => void;
}) {
  const { projectId, search, onSearchChange, sortBy, onSortByChange } = props;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex gap-2 items-center">
      <Button
        variant="outline"
        className="whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        New Dataset
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Filters">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[320px] p-0">
          <div className="px-4 py-3 text-sm font-semibold">Filters</div>
          <Separator />

          <div className="p-4 space-y-4">
            <div>
              <label
                htmlFor="dataset-search"
                className="text-xs text-slate-600 mb-1 block"
              >
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="dataset-search"
                  type="text"
                  placeholder="Search datasets..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label
                className="text-xs text-slate-600 mb-1 block"
                htmlFor="sort-select"
              >
                Sort by
              </label>
              <Select
                value={sortBy}
                onValueChange={(v) => onSortByChange(v as DatasetSortBy)}
              >
                <SelectTrigger id="sort-select" className="w-full">
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created date</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <DatasetUploadProvider
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        showEmpty={false}
      />
    </div>
  );
}
