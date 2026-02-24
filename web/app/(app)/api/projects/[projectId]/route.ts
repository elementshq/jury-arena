import { ZodError } from "zod";
import {
  ProjectCreateSchema,
  ProjectSchema,
} from "@/lib/db/repository/project-repository";
import { deleteProject } from "@/lib/usecase/projects/delete-project";
import { renameProject } from "@/lib/usecase/projects/rename-project";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await ctx.params;
    const id = ProjectSchema.shape.id.parse(projectId);

    await deleteProject({ projectId: id });

    return new Response(null, { status: 204 });
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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await ctx.params;
    const id = ProjectSchema.shape.id.parse(projectId);

    const json = await req.json();
    const body = ProjectCreateSchema.pick({ name: true }).parse(json);

    const { project } = await renameProject({
      projectId: id,
      name: body.name,
    });

    return Response.json({ project }, { status: 200 });
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
