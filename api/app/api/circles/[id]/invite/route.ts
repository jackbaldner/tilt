import { NextRequest, NextResponse } from "next/server";
import { one, run, cuid } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const circle = await one<any>("SELECT id, inviteCode, ownerId FROM Circle WHERE id = ?", [circleId]);
  if (!circle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  return NextResponse.json({
    inviteCode: circle.inviteCode,
    inviteUrl: `${API_URL}/join/${circle.inviteCode}`,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [circleId]);
  if (!circle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (circle.ownerId !== auth.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });

  const newCode = cuid();
  await run("UPDATE Circle SET inviteCode = ? WHERE id = ?", [newCode, circleId]);

  return NextResponse.json({
    inviteCode: newCode,
    inviteUrl: `${API_URL}/join/${newCode}`,
  });
}
