import { db } from "@/lib/db/core";
import {
  type ProjectModel,
  ProjectRepository,
} from "@/lib/db/repository/project-repository";

/**
 * Resolves the active project by prioritizing `candidateProjectIds` in order.
 * Creates a default project if none exist, and redirects to the resolved
 * project when the first candidate is missing or invalid.
 */
export const ResolveProjectContextResultKind = {
  Redirect: "redirect",
  Ok: "ok",
} as const;
export type ResolveProjectContextResultKind =
  (typeof ResolveProjectContextResultKind)[keyof typeof ResolveProjectContextResultKind];

export type ResolveProjectContextParams = {
  candidateProjectIds: string[];
};

export type ResolveProjectContextResult =
  | {
      kind: typeof ResolveProjectContextResultKind.Redirect;
      redirectTo: string;
    }
  | {
      kind: typeof ResolveProjectContextResultKind.Ok;
      selectedProject: ProjectModel;
      projects: ProjectModel[];
    };

function reorderByActive(
  projects: ProjectModel[],
  activeId: string,
): ProjectModel[] {
  const idx = projects.findIndex((p) => p.id === activeId);
  if (idx <= 0) return projects;
  const active = projects[idx];
  if (!active) return projects;
  return [active, ...projects.slice(0, idx), ...projects.slice(idx + 1)];
}

function pickFirstExisting(
  projects: ProjectModel[],
  candidateIds: string[],
): { pickedId: string; usedCandidateId: string | null } {
  const set = new Set(projects.map((p) => p.id));

  for (const id of candidateIds) {
    if (set.has(id)) return { pickedId: id, usedCandidateId: id };
  }

  // fallback
  if (projects.length === 0) {
    throw new Error("No projects available to pick from.");
  }
  return { pickedId: projects[0].id, usedCandidateId: null };
}

export async function resolveProjectContext(
  params: ResolveProjectContextParams,
): Promise<ResolveProjectContextResult> {
  const projectRepository = new ProjectRepository(db);

  // 1) ensure: 0件なら Default を作成
  let projects = await projectRepository.filter();
  if (projects.length === 0) {
    const created = await projectRepository.save({ name: "My First Project" });
    projects = [created];
  }

  // 2) 優先順で active を決定（候補 -> fallback）
  const { pickedId, usedCandidateId } = pickFirstExisting(
    projects,
    params.candidateProjectIds,
  );

  const selectedProject = projects.find((p) => p.id === pickedId);
  if (!selectedProject) {
    throw new Error(`Project with id ${pickedId} not found`);
  }
  const ordered = reorderByActive(projects, pickedId);

  /**
   * URL正規化のルール:
   * - 「最優先候補（= candidateProjectIds[0]）」が存在して採用されたときだけ ok
   * - それ以外は /projects/{pickedId} に寄せる（= redirect）
   *
   * これにより:
   * - /projects は candidate[0] が無いので必ず redirect
   * - /projects/[id] で id が有効なら ok
   * - /projects/[id] で id が無効なら redirect
   */
  const first = params.candidateProjectIds[0] ?? null;
  const firstIsValidAndUsed = first != null && first === usedCandidateId;

  if (!firstIsValidAndUsed) {
    return {
      kind: ResolveProjectContextResultKind.Redirect,
      redirectTo: `/projects/${pickedId}`,
    };
  }

  return {
    kind: ResolveProjectContextResultKind.Ok,
    selectedProject: selectedProject,
    projects: ordered,
  };
}
