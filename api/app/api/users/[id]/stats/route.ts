import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { getBalance } from "@/lib/wallet";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: userId } = await params;

  const user = await one<any>("SELECT id, name, image, createdAt FROM User WHERE id = ?", [userId]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [chips, stats] = await Promise.all([
    getBalance(userId, "CHIPS"),
    one<any>("SELECT * FROM UserStats WHERE userId = ?", [userId]),
  ]);
  const recentBets = await all<any>(
    `SELECT bs.*, b.id as betId, b.title as betTitle, b.resolution, b.resolvedAt, c.id as circleId, c.name as circleName
     FROM BetSide bs
     JOIN Bet b ON b.id = bs.betId
     JOIN Circle c ON c.id = b.circleId
     WHERE bs.userId = ?
     ORDER BY bs.createdAt DESC LIMIT 10`,
    [userId]
  );

  return NextResponse.json({
    user: { ...user, chips, stats },
    recentBets: recentBets.map((rb: any) => ({
      ...rb,
      bet: { id: rb.betId, title: rb.betTitle, resolution: rb.resolution, resolvedAt: rb.resolvedAt, circle: { id: rb.circleId, name: rb.circleName } },
    })),
  });
}
