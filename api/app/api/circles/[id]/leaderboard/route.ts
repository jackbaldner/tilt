import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { getBalance } from "@/lib/wallet";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const members = await all<any>(
    `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage,
     us.totalBets, us.wonBets, us.lostBets, us.totalChipsWon, us.totalChipsLost, us.biggestWin, us.currentStreak, us.longestStreak
     FROM CircleMember cm
     JOIN User u ON u.id = cm.userId
     LEFT JOIN UserStats us ON us.userId = cm.userId
     WHERE cm.circleId = ?`,
    [circleId]
  );

  // Fetch wallet balances for all members in parallel
  const balances = await Promise.all(members.map((m: any) => getBalance(m.userId, "CHIPS")));

  // Sort by wallet balance descending
  const membersWithChips = members.map((m: any, i: number) => ({ ...m, walletChips: balances[i] }));
  membersWithChips.sort((a: any, b: any) => b.walletChips - a.walletChips);

  const leaderboard = membersWithChips.map((m: any) => ({
    ...m,
    chips: m.walletChips,
    user: {
      id: m.userId,
      name: m.userName,
      image: m.userImage,
      chips: m.walletChips,
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
