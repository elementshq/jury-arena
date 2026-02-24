import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DatasetModel } from "@/lib/db/repository/dataset-repository";

interface DatasetCardProps {
  dataset: DatasetModel & {
    sampleCount: number;
    benchmarkCount: number;
  };
  isRunning?: boolean;
  isAnyRunning?: boolean;
  sortBy?: "created" | "lastEvaluated";
}

export function DatasetCard({ dataset, isRunning }: DatasetCardProps) {
  const getTimeAgo = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;

    if (isNaN(d.getTime())) return "-";

    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);

    if (diffInMinutes < 1) return "just now";
    if (diffInMinutes < 60)
      return `${diffInMinutes} minute${diffInMinutes === 1 ? "" : "s"} ago`;
    if (diffInMinutes < 1440) {
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.floor(diffInMinutes / 1440);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  return (
    <Card className="h-[140px] w-[260px] rounded-lg border bg-card p-4 hover:bg-slate-50 transition-colors cursor-pointer relative group flex flex-col">
      {/* Running Indicator */}
      {isRunning && (
        <div className="absolute top-3 right-3">
          <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
        </div>
      )}

      <div className="flex flex-col flex-1">
        {/* Title */}
        <div className="flex flex-col flex-1">
          <h3 className="text-[14px] leading-5 font-semibold text-slate-900 truncate">
            {dataset.name}
          </h3>

          {/* Stats (2 columns: label on top, value below) */}
          <div className="mt-3 grid grid-cols-[4fr_6fr]">
            <div>
              <div className="text-[11px] leading-4 tracking-wide text-slate-500 uppercase">
                Samples
              </div>
              <div className="mt-1 text-[16px] leading-5 text-slate-900 tabular-nums">
                {dataset.sampleCount}
              </div>
            </div>

            <div>
              <div className="text-[11px] leading-4 tracking-wide text-slate-500 uppercase">
                Evaluations
              </div>
              <div
                className={[
                  "mt-1 text-[16px] leading-5 tabular-nums",
                  dataset.benchmarkCount === 0
                    ? "text-slate-400"
                    : "text-slate-900",
                ].join(" ")}
              >
                {dataset.benchmarkCount}
              </div>
            </div>
          </div>

          {/* Updated date (bottom-left) */}
          <div className="mt-auto pt-3 text-[12px] leading-4 text-slate-400">
            {getTimeAgo(dataset.createdAt)}
          </div>
        </div>
      </div>
    </Card>
  );
}
