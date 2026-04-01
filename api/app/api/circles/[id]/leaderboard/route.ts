import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const membership = one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const members = all<any>(
    `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage, u.chips as globalChips,
     us.totalBets, us.wonBets, us.lostBets, us.totalChipsWon, us.totalChipsLost, us.biggestWin, us.currentStreak, us.longestStreak
     FROM CircleMember cm
     JOIN User u ON u.id = cm.userId
     LEFT JOIN UserStats us ON us.userId = cm.userId
     WHERE cm.circleId = ?
     ORDER BY cm.chips DESC`,
    [circleId]
  );

  const leaderboard = members.map((m: any) => ({
    ...m,
    user: {
      id: m.userId,
      name: m.userName,
      image: m.userImage,
      chips: m.globalChips,
      stats: {
        totalBets: m.totalBets ?? 0,
        wonBets: m.wonBets ?? 0,
        lostBets: m.lostBets ?? 0,
        totalChipsWon: m.totalChipsWon ?? 0,
        totalChipsLost: m.totalChipsLost ?? 0,
        biggestWin: m.biggestWin ?? 0,
        currentStreak: m.currentStreak ?? 0,
        longestStreak: m.longestStreak ?? 0,
      },
    },
  }));

  return NextResponse.json({ leaderboard });
}
