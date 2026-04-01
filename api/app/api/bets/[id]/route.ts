import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [id]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const sides = await all<any>(
    "SELECT bs.*, u.id as userId, u.name as userName, u.image as userImage FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId = ?",
    [id]
  );
  const comments = await all<any>(
    "SELECT c.*, u.id as userId, u.name as userName, u.image as userImage FROM Comment c JOIN User u ON u.id = c.userId WHERE c.betId = ? ORDER BY c.createdAt ASC",
    [id]
  );
  const proposer = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [bet.proposerId]);
  const circle = await one<any>("SELECT id, name, emoji FROM Circle WHERE id = ?", [bet.circleId]);
  const disputes = await all<any>("SELECT * FROM Dispute WHERE betId = ?", [id]);

  return NextResponse.json({
    bet: {
      ...bet,
      options: JSON.parse(bet.options),
      proposer,
      circle,
      sides: sides.map((s: any) => ({ ...s, user: { id: s.userId, name: s.userName, image: s.userImage } })),
      comments: comments.map((c: any) => ({ ...c, user: { id: c.userId, name: c.userName, image: c.userImage } })),
      disputes,
    },
  });
}
