import { SectionLink } from "./section-link";

export function SamplesSection(props: {
  projectId: string;
  datasetId: string;
  count: number;
}) {
  const { projectId, datasetId, count } = props;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Samples</h2>
      </div>

      <SectionLink
        href={`/projects/${projectId}/samples?datasetId=${datasetId}&from=dataset&fromDatasetId=${datasetId}`}
        label={`View Samples (${count})`}
      />
    </section>
  );
}
