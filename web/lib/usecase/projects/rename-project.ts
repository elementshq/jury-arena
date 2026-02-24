import { db } from "@/lib/db/core";
import {
  type ProjectModel,
  ProjectRepository,
} from "@/lib/db/repository/project-repository";

export type RenameProjectInput = {
  projectId: ProjectModel["id"];
  name: string;
};

export type RenameProjectOutput = {
  project: ProjectModel;
};

export async function renameProject(
  input: RenameProjectInput,
): Promise<RenameProjectOutput> {
  const projectRepository = new ProjectRepository(db);

  // update が返り値として更新後行を返す想定
  const project = await projectRepository.update({
    id: input.projectId,
    name: input.name,
  });

  return { project };
}
