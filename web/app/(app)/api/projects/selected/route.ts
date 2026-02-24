import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SELECTED_PROJECT_COOKIE,
  selectedProjectCookie,
} from "@/lib/server/cookies";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    projectId?: string;
  } | null;
  const projectId = body?.projectId;
  if (!projectId)
    return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const c = await cookies();
  c.set(SELECTED_PROJECT_COOKIE, projectId, selectedProjectCookie.options);

  return NextResponse.json({ ok: true });
}
