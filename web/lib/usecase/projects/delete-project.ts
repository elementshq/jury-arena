import { db } from "@/lib/db/core";
import { ProjectRepository } from "@/lib/db/repository/project-repository";

export type DeleteProjectParams = {
  projectId: string;
};

export async function deleteProject(
  params: DeleteProjectParams,
): Promise<void> {
  const { projectId } = params;

  const projectRepository = new ProjectRepository(db);
  await projectRepository.delete({ id: projectId });
}
