import { db } from "@/lib/db/core";
import { findArenaMatchesList } from "@/lib/db/queries/queries";

/**
 * 一覧用の軽量クエリ（matchDataから必要な部分のみ取得）
 */
export async function getMatches(params: {
  benchmarkId: string;
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const rows = await findArenaMatchesList(db, {
    benchmarkId: params.benchmarkId,
    limit: params.limit,
    offset: params.offset,
    search: params.search,
  });

  return { matches: rows };
}
