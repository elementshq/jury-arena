import { db } from "@/lib/db/core";
import {
  type ProjectCreateModel,
  type ProjectModel,
  ProjectRepository,
} from "@/lib/db/repository/project-repository";

export async function createProject(
  input: ProjectCreateModel,
): Promise<{ project: ProjectModel }> {
  const projectRepository = new ProjectRepository(db);

  const project = await projectRepository.save({
    name: input.name,
  });

  return { project };
}
