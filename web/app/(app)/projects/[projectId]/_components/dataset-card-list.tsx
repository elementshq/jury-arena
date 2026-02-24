import Link from "next/link";
import type { DatasetModel } from "@/lib/db/repository/dataset-repository";
import { DatasetCard } from "./dataset-card";

export function DatasetList({
  datasets,
}: {
  datasets: (DatasetModel & {
    sampleCount: number;
    benchmarkCount: number;
  })[];
}) {
  return (
    <div className="grid justify-center gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {datasets.map((d) => (
        <Link
          key={d.id}
          href={`/projects/${d.projectId}/datasets/${d.id}`}
          className="block focus:outline-none"
        >
          <DatasetCard key={d.id} dataset={d} />
        </Link>
      ))}
    </div>
  );
}
