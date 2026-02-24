import { getBenchmarkRuntime } from "@/lib/benchmark-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ benchmarkId: string }> },
) {
  const { benchmarkId } = await ctx.params;

  const rt = getBenchmarkRuntime(benchmarkId);
  if (!rt) return new Response("not found", { status: 404 });

  return Response.json(rt.state);
}
