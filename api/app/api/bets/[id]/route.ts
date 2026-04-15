import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { verify } from "jsonwebtoken";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();

  // Try to authenticate, but don't fail if unauthenticated — this endpoint
  // is readable by anyone (for shareable bet links).
  const authHeader = req.headers.get("authorization");
  let currentUserId: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = verify(
        token,
        process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars"
      ) as { sub: string };
      currentUserId = payload.sub;
    } catch {
      currentUserId = null;
    }
  }

  const { id } = await params;

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [id]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });

  const sides = await all<any>(
    "SELECT bs.*, u.id as userId, u.name as userName, u.username as userUsername, u.image as userImage FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId = ?",
    [id]
  );
  const comments = await all<any>(
    "SELECT c.*, u.id as userId, u.name as userName, u.image as userImage FROM Comment c JOIN User u ON u.id = c.userId WHERE c.betId = ? ORDER BY c.createdAt ASC",
    [id]
  );
  const proposer = await one<any>("SELECT id, name, username, image FROM User WHERE id = ?", [bet.proposerId]);
  const circle = bet.circleId
    ? await one<any>("SELECT id, name, emoji FROM Circle WHERE id = ?", [bet.circleId])
    : null;
  const circleMemberCount = bet.circleId
    ? (await one<{ count: number }>("SELECT COUNT(*) AS count FROM CircleMember WHERE circleId = ?", [bet.circleId]))?.count ?? 0
    : 0;
  const disputes = await all<any>("SELECT * FROM Dispute WHERE betId = ?", [id]);

  return NextResponse.json({
    bet: {
      ...bet,
      options: JSON.parse(bet.options),
      proposer,
      circle: circle ? { ...circle, memberCount: circleMemberCount } : null,
      sides: sides.map((s: any) => ({
        ...s,
        user: { id: s.userId, name: s.userName, username: s.userUsername, image: s.userImage },
      })),
      comments: comments.map((c: any) => ({ ...c, user: { id: c.userId, name: c.userName, image: c.userImage } })),
      disputes,
    },
  });
}
