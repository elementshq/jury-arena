"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { ModelLabel } from "@/components/model-label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SectionLink } from "./section-link";

type RecentEvaluation = {
  id: string;
  createdAt: string | Date;
  comparison: Array<{ model: string; rating: number }>;
  judgeModels: string[];
  matchCount: number;
};

function HeadWithHelp(props: { label: string; help: string }) {
  return (
    <div className="flex items-start gap-1">
      <span>{props.label}</span>

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Info className="w-3 h-3 text-gray-400 cursor-help mt-0.5" />
            </span>
          </TooltipTrigger>

          <TooltipContent className="max-w-[320px] text-xs leading-relaxed">
            {props.help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function RecentEvaluationsSection(props: {
  projectId: string;
  datasetId: string;
  recentEvaluations: RecentEvaluation[];
  totalCount: number;
}) {
  const { projectId, datasetId, recentEvaluations, totalCount } = props;

  const router = useRouter();

  const toEvaluationHref = (evaluationId: string) => {
    return `/projects/${projectId}/evaluations/${evaluationId}`;
  };

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Evaluations</h2>
        <div className="text-sm text-muted-foreground">
          Recent evaluations (latest 5)
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[180px]">Created At</TableHead>

              <TableHead className="w-[520px]">
                <HeadWithHelp
                  label="Candidate Model"
                  help="The rating represents how well a candidate model performs compared to other models, based on pairwise evaluations."
                />
              </TableHead>

              <TableHead className="w-[380px]">Judge Model</TableHead>

              <TableHead className="w-[90px]">
                <HeadWithHelp
                  label="Match"
                  help="Number of pairwise comparisons used to calculate the rating."
                />
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {recentEvaluations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-6 text-center text-muted-foreground"
                >
                  No evaluations yet.
                </TableCell>
              </TableRow>
            ) : (
              recentEvaluations.map((evaluation) => (
                <TableRow
                  key={evaluation.id}
                  onClick={() => router.push(toEvaluationHref(evaluation.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      router.push(toEvaluationHref(evaluation.id));
                    }
                  }}
                  className="cursor-pointer hover:bg-slate-100"
                >
                  <TableCell className="align-top">
                    {new Date(evaluation.createdAt).toLocaleString("ja-JP")}
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      {[...evaluation.comparison]
                        .sort((a, b) => b.rating - a.rating)
                        .map((c) => (
                          <div
                            key={c.model}
                            className="flex items-center gap-3 min-w-0"
                          >
                            <div className="min-w-0">
                              <ModelLabel modelName={c.model} size="md" />
                            </div>
                            <span className="text-muted-foreground">
                              ({c.rating.toFixed?.(1) ?? c.rating})
                            </span>
                          </div>
                        ))}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    {evaluation.judgeModels.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {evaluation.judgeModels.map((model) => (
                          <ModelLabel key={model} modelName={model} size="md" />
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    {evaluation.matchCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SectionLink
        href={`/projects/${projectId}/evaluations?datasetId=${datasetId}&from=dataset&fromDatasetId=${datasetId}`}
        label={`View Evaluations (${totalCount})`}
      />
    </section>
  );
}
