import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { PageHeader } from "@/components/page-header";
import { getBenchmarkDetail } from "@/lib/usecase/benchmarks/get-benchmark-detail";
import { getMatches } from "@/lib/usecase/matches/get-matches";
import { getProject } from "@/lib/usecase/projects/get-project";
import { MatchesSplitView } from "./_components/matches-split-view";

function parseNum(v: string | undefined, fallback: number) {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default async function Page(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    benchmarkId?: string;
    limit?: string;
    offset?: string;
    q?: string;
  }>;
}) {
  const { projectId } = await props.params;
  const sp = await props.searchParams;

  const benchmarkId = sp.benchmarkId;
  if (!benchmarkId) notFound();

  const limit = parseNum(sp.limit, 200);
  const offset = parseNum(sp.offset, 0);
  const q = (sp.q ?? "").trim() || undefined;

  const [project, result, benchmarkDetail] = await Promise.all([
    getProject({ projectId }),
    getMatches({ benchmarkId, limit, offset, search: q }),
    getBenchmarkDetail({ benchmarkId }),
  ]);

  if (!project) notFound();

  const items = [
    {
      id: `project:${projectId}`,
      label: project.name,
      href: `/projects/${projectId}`,
      isCurrent: false,
    },
    {
      id: `benchmark:${benchmarkId}`,
      label: `Evaluation`,
      href: `/projects/${projectId}/evaluations/${benchmarkId}`,
      isCurrent: false,
    },
    {
      id: `matches`,
      label: "Matches",
      href: `/projects/${projectId}/matches?benchmarkId=${encodeURIComponent(
        benchmarkId,
      )}`,
      isCurrent: true,
    },
  ];

  const datasetId = benchmarkDetail.benchmark.datasetId;
  const sampleListHref = `/projects/${projectId}/samples?datasetId=${encodeURIComponent(datasetId)}`;

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      <MatchesSplitView
        sampleListHref={sampleListHref}
        matches={result.matches.map((m: any) => ({
          id: m.id,
          matchNumber: m.matchIndex,
          sampleId: m.sampleId,
          createdAt: m.createdAt,

          modelA: m.match.model_a,
          modelB: m.match.model_b,
          winner: m.match.winner,
          judgeCount: m.match.judge_models?.length ?? 0,

          targetModel: m.match.model_a,
          opponentModel: m.match.model_b,

          // ✅ 巨大オブジェクトを保持せず、matchIdだけ
          matchId: m.id,
        }))}
      >
        <PageHeader>
          <Breadcrumb items={items} />
        </PageHeader>
      </MatchesSplitView>
    </div>
  );
}
