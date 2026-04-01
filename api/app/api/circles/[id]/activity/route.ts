import { NextRequest, NextResponse } from "next/server";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: circleId } = await params;

  const membership = one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "30");

  const activities = all<any>(
    `SELECT a.*, b.id as betId, b.title as betTitle
     FROM Activity a
     LEFT JOIN Bet b ON b.id = a.betId
     WHERE a.circleId = ?
     ORDER BY a.createdAt DESC LIMIT ?`,
    [circleId, limit]
  );

  return NextResponse.json({
    activities: activities.map((a: any) => ({
      ...a,
      data: JSON.parse(a.data ?? "{}"),
      bet: a.betId ? { id: a.betId, title: a.betTitle } : null,
    })),
  });
}
