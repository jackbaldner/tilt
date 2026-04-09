import { NextRequest, NextResponse } from "next/server";
import { one, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

// POST /api/friends/[id]/challenge — get or create a private 1:1 circle, return circleId
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const { id: friendshipId } = await params;
  const friendship = await one<any>("SELECT * FROM Friendship WHERE id = ?", [friendshipId]);

  if (!friendship || friendship.status !== "accepted") {
    return NextResponse.json({ error: "Not friends" }, { status: 403 });
  }
  if (friendship.requesterId !== auth.id && friendship.addresseeId !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const friendId = friendship.requesterId === auth.id ? friendship.addresseeId : friendship.requesterId;
  const friend = await one<any>("SELECT id, name FROM User WHERE id = ?", [friendId]);
  if (!friend) return NextResponse.json({ error: "Friend not found" }, { status: 404 });

  // Look for an existing private 1:1 circle between the two users (name convention)
  const privateName = `__private__${[auth.id, friendId].sort().join("__")}`;
  let circle = await one<any>("SELECT * FROM Circle WHERE name = ?", [privateName]);

  if (!circle) {
    const circleId = cuid();
    const inviteCode = cuid().slice(0, 8);
    const ts = now();
    const displayName = `${auth.name ?? "You"} vs ${friend.name ?? "Friend"}`;

    await run(
      `INSERT INTO Circle (id, name, description, emoji, ownerId, inviteCode, isPremium, theme, createdAt, updatedAt)
       VALUES (?, ?, ?, '⚡', ?, ?, 0, 'emerald', ?, ?)`,
      [circleId, privateName, displayName, auth.id, inviteCode, ts, ts]
    );
    // Add both members
    await run(
      "INSERT OR IGNORE INTO CircleMember (id, circleId, userId, role, chips, joinedAt) VALUES (?, ?, ?, 'owner', 0, ?)",
      [cuid(), circleId, auth.id, ts]
    );
    await run(
      "INSERT OR IGNORE INTO CircleMember (id, circleId, userId, role, chips, joinedAt) VALUES (?, ?, ?, 'member', 0, ?)",
      [cuid(), circleId, friendId, ts]
    );
    circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [circleId]);
  }

  return NextResponse.json({ circleId: circle.id });
}
