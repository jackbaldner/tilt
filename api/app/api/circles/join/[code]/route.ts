import { NextRequest, NextResponse } from "next/server";
import { one, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE inviteCode = ?", [code]);
  if (!circle) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

  const owner = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [circle.ownerId]);
  const memberCountRow = await one<any>("SELECT COUNT(*) as count FROM CircleMember WHERE circleId = ?", [circle.id]);
  const betCountRow = await one<any>("SELECT COUNT(*) as count FROM Bet WHERE circleId = ?", [circle.id]);
  const memberCount = memberCountRow?.count ?? 0;
  const betCount = betCountRow?.count ?? 0;

  return NextResponse.json({
    circle: { id: circle.id, name: circle.name, description: circle.description, emoji: circle.emoji, owner, memberCount, betCount },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { code } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE inviteCode = ?", [code]);
  if (!circle) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

  const existing = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circle.id, auth.id]);
  if (existing) {
    return NextResponse.json({ circle, alreadyMember: true });
  }

  const timestamp = now();
  await run(
    "INSERT INTO CircleMember (id, circleId, userId, role, joinedAt) VALUES (?, ?, ?, 'member', ?)",
    [cuid(), circle.id, auth.id, timestamp]
  );
  await run(
    "INSERT INTO Activity (id, circleId, userId, type, data, createdAt) VALUES (?, ?, ?, 'member_joined', ?, ?)",
    [cuid(), circle.id, auth.id, JSON.stringify({ userName: auth.name }), timestamp]
  );

  return NextResponse.json({ circle, joined: true });
}
