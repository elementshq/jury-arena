import Link from "next/link";
import { SectionLink } from "./section-link";

function MatchResultSection({
  evaluationId,
  projectId,
}: {
  evaluationId: string;
  projectId: string;
}) {
  return (
    <div>
      <h3 className="mt-1 text-3xl font-bold tracking-tight select-text">
        Match Results
      </h3>
      <div className="h-4" />

      <SectionLink
        href={`/projects/${projectId}/matches/${evaluationId}`}
        label="View Match Results"
      />
    </div>
  );
}

export default MatchResultSection;
