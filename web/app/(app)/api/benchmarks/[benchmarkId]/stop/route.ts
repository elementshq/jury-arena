import { stopBenchmark } from "@/lib/benchmark-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ benchmarkId: string }> },
) {
  const { benchmarkId } = await ctx.params;

  const r = stopBenchmark(benchmarkId);
  if (!r.ok) return Response.json(r, { status: 400 });
  return Response.json({ ok: true });
}
