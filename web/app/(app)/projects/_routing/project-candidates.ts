export async function getProjectCandidateIds(params?: { projectId?: string }) {
  // Demo mode: cookies() is not available in static export
  if (process.env.MODE === "demo") {
    return params?.projectId ? [params.projectId] : [];
  }

  const { cookies } = await import("next/headers");
  const { SELECTED_PROJECT_COOKIE } = await import("@/lib/server/cookies");
  const c = await cookies();
  const cookieId = c.get(SELECTED_PROJECT_COOKIE)?.value ?? null;

  // 優先順位：URL params -> cookie
  const ids = [params?.projectId ?? null, cookieId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  // 重複排除（同じIDが並ぶのを防ぐ）
  return Array.from(new Set(ids));
}
