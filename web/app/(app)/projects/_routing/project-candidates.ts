import { cookies } from "next/headers";
import { SELECTED_PROJECT_COOKIE } from "@/lib/server/cookies";

export async function getProjectCandidateIds(params?: { projectId?: string }) {
  const c = await cookies();
  const cookieId = c.get(SELECTED_PROJECT_COOKIE)?.value ?? null;

  // 優先順位：URL params -> cookie
  const ids = [params?.projectId ?? null, cookieId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  // 重複排除（同じIDが並ぶのを防ぐ）
  return Array.from(new Set(ids));
}
