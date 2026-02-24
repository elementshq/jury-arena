import { db } from "@/lib/db/core";
import {
  type ProjectModel,
  ProjectRepository,
} from "@/lib/db/repository/project-repository";

export type ProjectsView = ProjectModel[];

export async function getProjects(): Promise<ProjectsView> {
  const projectRepository = new ProjectRepository(db);

  const projects = await projectRepository.filter();

  return projects;
}
