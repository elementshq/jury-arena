import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { getBenchmarkDetail } from "@/lib/usecase/benchmarks/get-benchmark-detail";
import { getDataset } from "@/lib/usecase/evaluations/get-dataset";
import { getProject } from "@/lib/usecase/projects/get-project";
import MatchResultSection from "./_components.tsx/match-result-section";
import OverviewSection from "./_components.tsx/overview-section";

function buildEvaluationsHref(params: {
  projectId: string;
  datasetId?: string;
  from?: string;
  fromDatasetId?: string;
}) {
  const { projectId, datasetId, from, fromDatasetId } = params;

  const sp = new URLSearchParams();
  if (datasetId) sp.set("datasetId", datasetId);
  if (from) sp.set("from", from);
  if (fromDatasetId) sp.set("fromDatasetId", fromDatasetId);

  const qs = sp.toString();
  return qs
    ? `/projects/${projectId}/evaluations?${qs}`
    : `/projects/${projectId}/evaluations`;
}

export default async function Page(props: {
  params: Promise<{ projectId: string; evaluationId: string }>;
  searchParams: Promise<{
    datasetId?: string;
    from?: string;
    fromDatasetId?: string;
  }>;
}) {
  const { projectId, evaluationId } = await props.params;
  const { datasetId, from, fromDatasetId } = await props.searchParams;

  const [project, benchmark, fromDataset] = await Promise.all([
    getProject({ projectId }),
    getBenchmarkDetail({ benchmarkId: evaluationId }),
    fromDatasetId
      ? getDataset({ datasetId: fromDatasetId })
      : Promise.resolve(null),
  ]);

  if (!project) return notFound();

  const evaluationsHref = buildEvaluationsHref({
    projectId,
    // 「一覧に戻る」時の dataset filter は、明示で付いてた時だけ維持
    datasetId,
    from,
    fromDatasetId,
  });

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
      href: evaluationsHref,
      isCurrent: false,
    },
    {
      id: `evaluation:${evaluationId}`,
      label: benchmark.benchmark.name,
      href: `/projects/${projectId}/evaluations/${evaluationId}`,
      isCurrent: true,
    },
  ];

  // Always show back to dataset link using the benchmark's dataset
  const backToDataset = {
    href: `/projects/${projectId}/datasets/${benchmark.benchmark.datasetId}`,
    label: "Back to Dataset",
  };

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

        <OverviewSection
          ratingHistory={benchmark.ratingHistory}
          modelStats={benchmark.modelStats}
          finalStep={benchmark.finalStep}
          baselineModel={benchmark.baselineModel}
          matchCount={benchmark.matcheCount}
          coverage={benchmark.coverage}
          modelCoverage={benchmark.modelCoverage}
        />

        <div className="h-30" />

        <MatchResultSection evaluationId={evaluationId} projectId={projectId} />

        <div className="h-80" />
      </div>
    </>
  );
}
