import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

// GET /api/friends — list accepted friends
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const friends = await all<any>(
    `SELECT
       f.id as friendshipId,
       u.id, u.name, u.email, u.image, u.username,
       us.totalBets, us.wonBets
     FROM Friendship f
     JOIN User u ON u.id = CASE WHEN f.requesterId = ? THEN f.addresseeId ELSE f.requesterId END
     LEFT JOIN UserStats us ON us.userId = u.id
     WHERE (f.requesterId = ? OR f.addresseeId = ?) AND f.status = 'accepted'
     ORDER BY u.name ASC`,
    [auth.id, auth.id, auth.id]
  );

  return NextResponse.json({ friends });
}

// POST /api/friends — send a friend request by email or username
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const { identifier } = await req.json(); // email or username
  if (!identifier?.trim()) {
    return NextResponse.json({ error: "Provide an email or username" }, { status: 400 });
  }

  const target = await one<any>(
    "SELECT id, name, email, username FROM User WHERE email = ? OR username = ?",
    [identifier.trim(), identifier.trim()]
  );

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.id === auth.id) {
    return NextResponse.json({ error: "You can't friend yourself" }, { status: 400 });
  }

  // Check if friendship already exists in either direction
  const existing = await one<any>(
    `SELECT * FROM Friendship
     WHERE (requesterId = ? AND addresseeId = ?) OR (requesterId = ? AND addresseeId = ?)`,
    [auth.id, target.id, target.id, auth.id]
  );

  if (existing) {
    if (existing.status === "accepted") {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }
    if (existing.requesterId === auth.id) {
      return NextResponse.json({ error: "Request already sent" }, { status: 409 });
    }
    // They sent us a request — auto-accept
    const ts = now();
    await run("UPDATE Friendship SET status = 'accepted', updatedAt = ? WHERE id = ?", [ts, existing.id]);
    return NextResponse.json({ status: "accepted", friend: target });
  }

  const ts = now();
  await run(
    "INSERT INTO Friendship (id, requesterId, addresseeId, status, createdAt, updatedAt) VALUES (?, ?, ?, 'pending', ?, ?)",
    [cuid(), auth.id, target.id, ts, ts]
  );

  return NextResponse.json({ status: "requested", friend: target }, { status: 201 });
}
