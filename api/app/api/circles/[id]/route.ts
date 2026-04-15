import { NextRequest, NextResponse } from "next/server";
import { one, all, run, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { getBalance } from "@/lib/wallet";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id } = await params;

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [id]);
  if (!circle) return NextResponse.json({ error: "Circle not found" }, { status: 404 });

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [id, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const members = await all<any>(
    `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage
     FROM CircleMember cm JOIN User u ON u.id = cm.userId WHERE cm.circleId = ? ORDER BY cm.joinedAt ASC`,
    [id]
  );
  const memberBalances = await Promise.all(members.map((m: any) => getBalance(m.userId, "CHIPS")));
  const betCountRow = await one<any>("SELECT COUNT(*) as count FROM Bet WHERE circleId = ?", [id]);
  const betCount = betCountRow?.count ?? 0;
  const owner = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [circle.ownerId]);

  return NextResponse.json({
    circle: {
      ...circle,
      owner,
      members: members.map((m: any, i: number) => ({
        ...m,
        chips: memberBalances[i],
        user: { id: m.userId, name: m.userName, image: m.userImage, chips: memberBalances[i] },
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

  // __private__ circles are the internal containers for 1:1 friend
  // challenges. Their `name` field encodes a deterministic key that the
  // challenge lookup uses to reuse the same circle for a given pair of
  // users. Renaming one breaks that lookup and orphans bets. Block the
  // edit entirely rather than trying to partially allow it.
  if (circle.name?.startsWith("__private__")) {
    return NextResponse.json(
      { error: "Private friend-challenge circles can't be edited" },
      { status: 400 }
    );
  }

  const body = await req.json();

  // Distinguish "field was omitted" (undefined → keep existing) from
  // "field was explicitly cleared" (null or empty string → set to null).
  // Using COALESCE blindly would prevent ever clearing a description.
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    if (trimmed.startsWith("__private__")) {
      return NextResponse.json(
        { error: "Name cannot start with the reserved prefix __private__" },
        { status: 400 }
      );
    }
    updates.push("name = ?");
    values.push(trimmed);
  }

  if (body.description !== undefined) {
    if (body.description === null || body.description === "") {
      updates.push("description = NULL");
    } else if (typeof body.description === "string") {
      updates.push("description = ?");
      values.push(body.description.trim());
    }
  }

  if (typeof body.emoji === "string" && body.emoji.trim()) {
    updates.push("emoji = ?");
    values.push(body.emoji.trim());
  }

  if (updates.length === 0) {
    return NextResponse.json({ circle });
  }

  updates.push("updatedAt = ?");
  values.push(now());
  values.push(id);

  await run(
    `UPDATE Circle SET ${updates.join(", ")} WHERE id = ?`,
    values
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
