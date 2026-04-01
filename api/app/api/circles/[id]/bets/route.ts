import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") ?? "30");

  let whereClause = "WHERE b.circleId = ?";
  const queryParams: any[] = [circleId];

  if (status === "pending") {
    whereClause += " AND b.resolution = 'pending'";
  } else if (status === "resolved") {
    whereClause += " AND b.resolution IN ('resolved', 'cancelled', 'void')";
  }

  const bets = await all<any>(
    `SELECT b.*, u.name as proposerName, u.image as proposerImage,
     (SELECT COUNT(*) FROM Comment c WHERE c.betId = b.id) as commentCount
     FROM Bet b JOIN User u ON u.id = b.proposerId
     ${whereClause} ORDER BY b.createdAt DESC LIMIT ?`,
    [...queryParams, limit]
  );

  const enriched = await Promise.all(bets.map(async (b: any) => {
    const sides = await all<any>(
      `SELECT bs.*, u.id as userId, u.name as userName, u.image as userImage
       FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId = ?`,
      [b.id]
    );
    return {
      ...b,
      options: JSON.parse(b.options),
      proposer: { id: b.proposerId, name: b.proposerName, image: b.proposerImage },
      sides: sides.map((s: any) => ({ ...s, user: { id: s.userId, name: s.userName, image: s.userImage } })),
      _count: { comments: b.commentCount },
    };
  }));

  return NextResponse.json({ bets: enriched });
}
