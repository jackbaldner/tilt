import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const comments = all<any>(
    "SELECT c.*, u.id as userId, u.name as userName, u.image as userImage FROM Comment c JOIN User u ON u.id = c.userId WHERE c.betId = ? ORDER BY c.createdAt ASC",
    [betId]
  );

  return NextResponse.json({
    comments: comments.map((c: any) => ({
      ...c,
      user: { id: c.userId, name: c.userName, image: c.userImage },
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Text required" }, { status: 400 });

  const bet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });

  const membership = one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const id = cuid();
  const timestamp = now();
  run("INSERT INTO Comment (id, betId, userId, text, createdAt) VALUES (?, ?, ?, ?, ?)", [id, betId, auth.id, text.trim(), timestamp]);
  run("INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'comment', ?, ?)",
    [cuid(), bet.circleId, betId, auth.id, JSON.stringify({ betTitle: bet.title, text: text.trim() }), timestamp]);

  const comment = one<any>("SELECT * FROM Comment WHERE id = ?", [id]);
  const user = one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);

  return NextResponse.json({ comment: { ...comment, user } }, { status: 201 });
}
