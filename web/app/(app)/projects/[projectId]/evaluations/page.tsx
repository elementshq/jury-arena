import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { generateProjectParams } from "@/lib/static-params";
import { getProject } from "@/lib/usecase/projects/get-project";
import { getProjectDatasets } from "@/lib/usecase/projects/get-project-datasets";
import { getProjectEvaluations } from "@/lib/usecase/projects/get-project-evaluations";
import { EvaluationsList } from "./_components/evaluations-list";

export const generateStaticParams =
  process.env.MODE === "demo" ? generateProjectParams : undefined;

function buildEvaluationsBaseHref(params: {
  projectId: string;
  from?: string;
  fromDatasetId?: string;
}) {
  const { projectId, from, fromDatasetId } = params;

  const sp = new URLSearchParams();
  if (from) sp.set("from", from);
  if (fromDatasetId) sp.set("fromDatasetId", fromDatasetId);

  const qs = sp.toString();
  return qs
    ? `/projects/${projectId}/evaluations?${qs}`
    : `/projects/${projectId}/evaluations`;
}

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

  const [project, evaluations, datasets] = await Promise.all([
    getProject({ projectId }),
    getProjectEvaluations({ projectId, datasetId }),
    getProjectDatasets({ projectId, limit: 200, offset: 0 }),
  ]);

  if (!project) return notFound();

  const selectedDataset = datasetId
    ? (datasets.find((d) => d.id === datasetId) ?? null)
    : null;

  const fromDataset = fromDatasetId
    ? (datasets.find((d) => d.id === fromDatasetId) ?? null)
    : null;

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: false,
    },
    {
      id: `evaluations`,
      label: "Evaluations",
      href: buildEvaluationsBaseHref({ projectId, from, fromDatasetId }),
      isCurrent: true,
    },
  ];

  const showBack = from === "dataset" && fromDatasetId && fromDataset;

  const backToDataset = showBack
    ? {
        href: `/projects/${projectId}/datasets/${fromDatasetId}`,
        label: `Back to Dataset`,
      }
    : null;

  // datasetId だけ外す（from/fromDatasetId は維持）
  const clearFilterHref = buildEvaluationsBaseHref({
    projectId,
    from,
    fromDatasetId,
  });

  return (
    <>
      <PageHeader>
        <Breadcrumb items={items} />
      </PageHeader>

      <div className="px-2">
        {backToDataset && (
          <Link
            href={backToDataset.href}
            className="inline-flex items-center gap-2 text-sm hover:bg-slate-100 rounded transition-colors h-auto px-2 py-1"
          >
            <ArrowLeft className="h-4 w-4" />
            {backToDataset.label}
          </Link>
        )}

        <div className="pt-6">
          <EvaluationsList
            evaluations={evaluations}
            datasets={datasets.map((d) => ({ id: d.id, name: d.name }))}
            selectedDatasetId={selectedDataset?.id ?? null}
            selectedDataset={
              selectedDataset
                ? { id: selectedDataset.id, name: selectedDataset.name }
                : undefined
            }
            clearFilterHref={clearFilterHref}
            projectId={projectId}
          />
        </div>

        <div className="h-16" />
      </div>
    </>
  );
}
