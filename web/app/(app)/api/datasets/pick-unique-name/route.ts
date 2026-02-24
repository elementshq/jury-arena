import { pickUniqueName } from "@/lib/usecase/datasets/pick-unique-name";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { projectId, baseName } = await req.json();
  const name = await pickUniqueName(projectId, baseName);
  return Response.json({ name });
}
