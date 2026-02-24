"use client";

import { useState } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { DatasetList } from "./dataset-card-list";
import {
  DatasetListHeaderActions,
  type DatasetSortBy,
} from "./dataset-list-header-actions";
import { DatasetListWithLoadMore } from "./dataset-list-with-load-more";
import { DatasetUploadProvider } from "./dataset-upload-provider";

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-sm font-medium text-muted-foreground">
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

export function DatasetPageClient(props: {
  projectId: string;
  projectName: string;
  breadcrumbItems: any[];
  initialDatasets: any[];
  total: number;
  recent: any[];
  pageSize: number;
}) {
  const { projectId, initialDatasets, recent, pageSize } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<DatasetSortBy>("createdAt");

  const isFiltered = search !== "" || sortBy !== "createdAt";

  return (
    <>
      <PageHeader>
        <Breadcrumb items={props.breadcrumbItems} />
        <DatasetListHeaderActions
          projectId={projectId}
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
      </PageHeader>

      <div className="px-2">
        {initialDatasets.length === 0 && !isFiltered ? (
          <DatasetUploadProvider
            projectId={projectId}
            open={open}
            onOpenChange={setOpen}
            showEmpty
          />
        ) : (
          <div className="space-y-15">
            {recent.length > 0 && !isFiltered && (
              <Section title="Recently Evaluated Datasets">
                <DatasetList datasets={recent} />
              </Section>
            )}

            <Section title="All Datasets">
              <DatasetListWithLoadMore
                key={`${projectId}:${props.total}:${search}:${sortBy}`}
                initialItems={isFiltered ? [] : initialDatasets}
                projectId={projectId}
                pageSize={pageSize}
                total={isFiltered ? 0 : props.total}
                search={search}
                sortBy={sortBy}
              />
            </Section>

            {/* 空表示じゃない時もモーダルは開けるように常設 */}
            <DatasetUploadProvider
              projectId={projectId}
              open={open}
              onOpenChange={setOpen}
              showEmpty={false}
            />
          </div>
        )}
      </div>
    </>
  );
}
