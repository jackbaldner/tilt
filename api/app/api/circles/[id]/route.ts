import { NextRequest, NextResponse } from "next/server";
import { one, all, run, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [id]);
  if (!circle) return NextResponse.json({ error: "Circle not found" }, { status: 404 });

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [id, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const members = await all<any>(
    `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage, u.chips as userChips
     FROM CircleMember cm JOIN User u ON u.id = cm.userId WHERE cm.circleId = ? ORDER BY cm.chips DESC`,
    [id]
  );
  const betCountRow = await one<any>("SELECT COUNT(*) as count FROM Bet WHERE circleId = ?", [id]);
  const betCount = betCountRow?.count ?? 0;
  const owner = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [circle.ownerId]);

  return NextResponse.json({
    circle: {
      ...circle,
      owner,
      members: members.map((m: any) => ({
        ...m,
        user: { id: m.userId, name: m.userName, image: m.userImage, chips: m.userChips },
      })),
      _count: { bets: betCount, members: members.length },
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [id]);
  if (!circle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (circle.ownerId !== auth.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });

  const { name, description, emoji } = await req.json();
  await run(
    `UPDATE Circle SET name = COALESCE(?, name), description = COALESCE(?, description), emoji = COALESCE(?, emoji), updatedAt = ? WHERE id = ?`,
    [name?.trim() ?? null, description?.trim() ?? null, emoji ?? null, now(), id]
  );

  return NextResponse.json({ circle: await one("SELECT * FROM Circle WHERE id = ?", [id]) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [id]);
  if (!circle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (circle.ownerId !== auth.id) return NextResponse.json({ error: "Not owner" }, { status: 403 });

  await run("DELETE FROM Circle WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
