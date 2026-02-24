import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { getDatasetDetail } from "@/lib/usecase/datasets/get-dataset-detail";
import { getProject } from "@/lib/usecase/projects/get-project";
import { DatasetHeader } from "./_components/dataset-header";
import { DeleteDatasetSection } from "./_components/delete-dataset-section";
import { RecentEvaluationsSection } from "./_components/recent-evaluations-section";
import { SamplesSection } from "./_components/samples-section";

export default async function Page(props: {
  params: Promise<{ projectId: string; datasetId: string }>;
}) {
  const { projectId, datasetId } = await props.params;

  const [project, detail] = await Promise.all([
    getProject({ projectId }),
    getDatasetDetail({ projectId, datasetId }),
  ]);
  if (!project) notFound();
  if (!detail?.dataset) notFound();

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: false,
    },
    {
      id: `dataset:${datasetId}`,
      label: detail.dataset.name,
      href: `/projects/${projectId}/datasets/${datasetId}`,
      isCurrent: true,
    },
  ];

  return (
    <>
      <PageHeader>
        <Breadcrumb items={items} />
      </PageHeader>

      <div className="px-2">
        <DatasetHeader
          projectId={projectId}
          datasetId={datasetId}
          initialName={detail.dataset.name}
        />

        <RecentEvaluationsSection
          projectId={projectId}
          datasetId={datasetId}
          recentEvaluations={detail.recentEvaluations}
          totalCount={detail.benchmarkCount}
        />

        <SamplesSection
          projectId={projectId}
          datasetId={datasetId}
          count={detail.sampleCount}
        />

        <DeleteDatasetSection
          projectId={projectId}
          datasetId={datasetId}
          datasetName={detail.dataset.name}
        />
      </div>
    </>
  );
}
