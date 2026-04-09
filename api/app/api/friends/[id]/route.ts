import { NextRequest, NextResponse } from "next/server";
import { one, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

// PATCH /api/friends/[id] — accept a friend request
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const { id } = await params;
  const friendship = await one<any>("SELECT * FROM Friendship WHERE id = ?", [id]);

  if (!friendship) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (friendship.addresseeId !== auth.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (friendship.status !== "pending") return NextResponse.json({ error: "Already responded" }, { status: 409 });

  const { action } = await req.json(); // "accept" | "decline"
  if (action === "accept") {
    await run("UPDATE Friendship SET status = 'accepted', updatedAt = ? WHERE id = ?", [now(), id]);
    return NextResponse.json({ status: "accepted" });
  } else {
    await run("DELETE FROM Friendship WHERE id = ?", [id]);
    return NextResponse.json({ status: "declined" });
  }
}

// DELETE /api/friends/[id] — remove a friend or cancel a pending request
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const { id } = await params;
  const friendship = await one<any>("SELECT * FROM Friendship WHERE id = ?", [id]);

  if (!friendship) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (friendship.requesterId !== auth.id && friendship.addresseeId !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await run("DELETE FROM Friendship WHERE id = ?", [id]);
  return NextResponse.json({ status: "removed" });
}
