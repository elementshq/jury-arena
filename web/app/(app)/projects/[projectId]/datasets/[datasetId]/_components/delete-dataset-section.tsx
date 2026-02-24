import { DeleteDatasetButton } from "./delete-dataset-button";

export function DeleteDatasetSection(props: {
  projectId: string;
  datasetId: string;
  datasetName: string;
}) {
  const { projectId, datasetId, datasetName } = props;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Delete dataset</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This action cannot be undone.
      </p>

      <div className="mt-4">
        <DeleteDatasetButton
          projectId={projectId}
          datasetId={datasetId}
          datasetName={datasetName}
        />
      </div>
    </section>
  );
}
