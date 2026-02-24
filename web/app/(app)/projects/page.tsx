import { redirect } from "next/navigation";
import {
  ResolveProjectContextResultKind,
  resolveProjectContext,
} from "@/lib/usecase/projects/resolve-project-context";
import { getProjectCandidateIds } from "./_routing/project-candidates";

export default async function Page() {
  const candidateProjectIds = await getProjectCandidateIds();
  const result = await resolveProjectContext({ candidateProjectIds });

  if (result.kind === ResolveProjectContextResultKind.Redirect) {
    redirect(result.redirectTo);
  }

  // /projects 自体は canonical を /projects/{id} に寄せたいので redirect が自然
  redirect(`/projects/${result.selectedProject.id}`);
}
