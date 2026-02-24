import { NextResponse } from "next/server";
import { getMatchDetail } from "@/lib/usecase/matches/get-match-detail";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const params = await context.params;
    const { matchId } = params;

    const result = await getMatchDetail({ matchId });

    return NextResponse.json(result.match);
  } catch (error) {
    console.error("[API] Get match detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch match detail" },
      { status: 500 },
    );
  }
}
