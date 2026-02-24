import { db } from "@/lib/db/core";
import { findArenaMatchDetail } from "@/lib/db/queries/queries";

/**
 * マッチの詳細を取得（右ペイン表示用）
 */
export async function getMatchDetail(params: { matchId: string }) {
  const match = await findArenaMatchDetail(db, {
    matchId: params.matchId,
  });

  if (!match) {
    throw new Error(`Match not found: ${params.matchId}`);
  }

  return { match };
}
