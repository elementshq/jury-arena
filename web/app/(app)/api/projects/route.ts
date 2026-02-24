import { mkdir } from "node:fs/promises";
import { ZodError } from "zod";
import {
  type ProjectCreateModel,
  ProjectCreateSchema,
} from "@/lib/db/repository/project-repository";
import { getProjectWorksetDir } from "@/lib/resolve-dir";
import { createProject } from "@/lib/usecase/projects/create-project";

export async function POST(req: Request) {
  try {
    const json = await req.json();

    const input: ProjectCreateModel = ProjectCreateSchema.pick({
      name: true,
    }).parse(json);

    const { project } = await createProject(input);

    const projectDir = getProjectWorksetDir(project.id);
    await mkdir(projectDir, { recursive: true });

    return Response.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "validation error", issues: err.issues },
        { status: 400 },
      );
    }
    console.error(err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
