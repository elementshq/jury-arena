import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { getDataset } from "@/lib/usecase/evaluations/get-dataset";
import { getProject } from "@/lib/usecase/projects/get-project";
import { getProjectDatasets } from "@/lib/usecase/projects/get-project-datasets";
import { getProjectSamples } from "@/lib/usecase/projects/get-project-samples";
import { SamplesSplitView } from "./_components/sample-split-view";

export default async function Page(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    datasetId?: string;
    from?: string;
    fromDatasetId?: string;
  }>;
}) {
  const { projectId } = await props.params;
  const { datasetId, from, fromDatasetId } = await props.searchParams;

  const [project, result, dataset, fromDataset, datasets] = await Promise.all([
    getProject({ projectId }),
    getProjectSamples({
      projectId: projectId,
      datasetId,
    }),
    datasetId ? getDataset({ datasetId }) : Promise.resolve(null),
    fromDatasetId
      ? getDataset({ datasetId: fromDatasetId })
      : Promise.resolve(null),
    getProjectDatasets({
      projectId: projectId,
    }),
  ]);

  if (!project) notFound();

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: false,
    },
    {
      id: `samples`,
      label: "Samples",
      href: `/projects/${projectId}/samples`,
      isCurrent: true,
    },
  ];

  const showBack = from === "dataset" && fromDatasetId && fromDataset;

  const backToDataset = showBack
    ? {
        href: `/projects/${projectId}/datasets/${fromDatasetId}`,
        label: "Back to Dataset",
      }
    : null;

  // datasetId だけ外す（その他の params は維持したい）
  const clearFilterHref =
    from || fromDatasetId
      ? `/projects/${projectId}/samples?` +
        new URLSearchParams({
          ...(from ? { from } : {}),
          ...(fromDatasetId ? { fromDatasetId } : {}),
        }).toString()
      : `/projects/${projectId}/samples`;

  // Helper to extract display text from content (string or ContentPart[])
  const extractMessageText = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const parts: string[] = [];

      // Extract text parts
      const textParts = content.filter((p) => p.type === "text");
      if (textParts.length > 0) {
        parts.push(textParts.map((p) => p.text).join(" "));
      }

      // Extract file_ref parts and show as attachments
      const fileRefs = content.filter((p) => p.type === "file_ref");
      if (fileRefs.length > 0) {
        const fileNames = fileRefs.map((p) => {
          const path = p.path || "";
          // Extract filename from path (e.g., "attachments/file.pdf" -> "file.pdf")
          const fileName = path.split("/").pop() || path;
          return `📎 ${fileName}`;
        });
        parts.push(...fileNames);
      }

      return parts.join("\n");
    }
    return "";
  };

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <SamplesSplitView
        samples={result.samples.map((s) => ({
          id: s.id,
          message: extractMessageText(s.info.input.messages[0]?.content),
          info: s.info,
          createdAt: s.createdAt,
        }))}
        datasets={datasets.map((d) => ({ id: d.id, name: d.name }))}
        selectedDatasetId={datasetId ?? null}
        filterDataset={
          dataset
            ? {
                id: dataset.id,
                name: dataset.name,
              }
            : undefined
        }
        clearFilterHref={clearFilterHref}
      >
        <PageHeader>
          <Breadcrumb items={items} />
        </PageHeader>
        {backToDataset && (
          <Link
            href={backToDataset.href}
            className="inline-flex items-center gap-2 text-sm hover:bg-slate-100 rounded transition-colors h-auto px-2 py-1"
          >
            <ArrowLeft className="h-4 w-4" />
            {backToDataset.label}
          </Link>
        )}
      </SamplesSplitView>
    </div>
  );
}
