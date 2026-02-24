import { db } from "@/lib/db/core";
import {
  type ProjectModel,
  ProjectRepository,
} from "@/lib/db/repository/project-repository";

export type GetProjectParams = {
  projectId: string;
};

export type ProjectView = ProjectModel;

export async function getProject(
  params: GetProjectParams,
): Promise<ProjectView | null> {
  const { projectId } = params;

  const projectRepository = new ProjectRepository(db);
  const project = await projectRepository.find({ id: projectId });

  return project;
}
