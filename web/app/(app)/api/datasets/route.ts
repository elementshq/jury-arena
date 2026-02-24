import { getProjectDatasets } from "@/lib/usecase/projects/get-project-datasets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ items: [] }, { status: 400 });
  }

  const search = url.searchParams.get("search") || undefined;
  const orderBy = url.searchParams.get("orderBy") as
    | "createdAt"
    | "name"
    | undefined;
  const orderDir = url.searchParams.get("orderDir") as
    | "asc"
    | "desc"
    | undefined;
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");

  const limit = Number(limitRaw ?? "20");
  const offset = Number(offsetRaw ?? "0");

  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, limit))
    : 20;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const items = await getProjectDatasets({
    projectId,
    search,
    limit: safeLimit,
    offset: safeOffset,
    orderBy,
    orderDir,
  });

  return Response.json({ items });
}
