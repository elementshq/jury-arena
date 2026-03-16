import * as fs from "node:fs";
import * as path from "node:path";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { analyzeDatasetCapabilities, type DatasetCapabilities } from "@/lib/config/dataset-capabilities";
import { loadModels } from "@/lib/config/models";
import { generateDatasetParams } from "@/lib/static-params";
import { getDataset } from "@/lib/usecase/evaluations/get-dataset";
import { getProject } from "@/lib/usecase/projects/get-project";

function getDemoDatasetCapabilities(projectId: string, datasetId: string): DatasetCapabilities {
  try {
    const filePath = path.resolve(
      process.cwd(),
      `public/data/projects/${projectId}/datasets/${datasetId}/index.json`,
    );
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { sampleCount?: number };
    return {
      totalSamples: json.sampleCount ?? 0,
      pdfSampleCount: 0,
      requiresPdf: false,
      requiresImage: false,
    };
  } catch {
    return { totalSamples: 0, pdfSampleCount: 0, requiresPdf: false, requiresImage: false };
  }
}
import { NewEvaluation } from "./_components/new-evaluation";

export const generateStaticParams =
  process.env.MODE === "demo" ? generateDatasetParams : undefined;

export default async function Page(props: {
  params: Promise<{ projectId: string; datasetId: string }>;
}) {
  const { projectId, datasetId } = await props.params;

  const models = await loadModels();

  const [project, dataset, datasetCapabilities] = await Promise.all([
    getProject({ projectId }),
    getDataset({ datasetId }),
    process.env.MODE === "demo"
      ? Promise.resolve(getDemoDatasetCapabilities(projectId, datasetId))
      : analyzeDatasetCapabilities(datasetId),
  ]);
  if (!project) notFound();
  if (!dataset) notFound();

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: false,
    },
    {
      id: `dataset:${datasetId}`,
      label: dataset.name,
      href: `/projects/${projectId}/datasets/${datasetId}`,
      isCurrent: false,
    },
    {
      id: `new-evaluation`,
      label: "New Evaluation",
      href: `/projects/${projectId}/datasets/${datasetId}/evaluations/new`,
      isCurrent: true,
    },
  ];

  return (
    <>
      <PageHeader>
        <Breadcrumb items={items} />
      </PageHeader>

      <NewEvaluation
        input={{
          datasetId: dataset.id,
          datasetName: dataset.name,
          projectId: project.id,
          projectName: project.name,
        }}
        models={models.model_list}
        datasetCapabilities={datasetCapabilities}
      ></NewEvaluation>
    </>
  );
}
