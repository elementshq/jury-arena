import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DatasetNameEditable } from "./dataset-name-editable";

export function DatasetHeader(props: {
  projectId: string;
  datasetId: string;
  initialName: string;
}) {
  const { projectId, datasetId, initialName } = props;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="mt-1 text-2xl font-semibold">
          <DatasetNameEditable
            projectId={projectId}
            datasetId={datasetId}
            initialName={initialName}
          />
        </h1>
      </div>

      <Button asChild>
        <Link
          href={`/projects/${projectId}/datasets/${datasetId}/evaluations/new`}
        >
          + New Evaluation
        </Link>
      </Button>
    </div>
  );
}
