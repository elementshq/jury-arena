import { notFound } from "next/navigation";
import { getProject } from "@/lib/usecase/projects/get-project";
import { getProjectDatasets } from "@/lib/usecase/projects/get-project-datasets";
import { getProjectDatasetsCount } from "@/lib/usecase/projects/get-project-datasets-count";
import { getRecentEvaluatedDatasets } from "@/lib/usecase/projects/get-recent-evaluated-datasets";
import { DatasetPageClient } from "./_components/dataset-page-client";

export default async function Page(props: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await props.params;

  const project = await getProject({ projectId });
  if (!project) notFound();

  const PAGE_SIZE = 6;

  const [datasets, total, recent] = await Promise.all([
    getProjectDatasets({ projectId, limit: PAGE_SIZE, offset: 0 }),
    getProjectDatasetsCount({ projectId }),
    getRecentEvaluatedDatasets({ projectId, limit: 4 }),
  ]);

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: true,
    },
  ];

  return (
    <DatasetPageClient
      projectId={projectId}
      projectName={project.name}
      breadcrumbItems={items}
      initialDatasets={datasets}
      total={total}
      recent={recent}
      pageSize={PAGE_SIZE}
    />
  );
}
