import { NextRequest, NextResponse } from "next/server";
import { all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

// GET /api/friends/requests — list pending incoming friend requests
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  await ensureFriendshipTable();

  const requests = await all<any>(
    `SELECT f.id as friendshipId, u.id, u.name, u.email, u.image, u.username, f.createdAt
     FROM Friendship f
     JOIN User u ON u.id = f.requesterId
     WHERE f.addresseeId = ? AND f.status = 'pending'
     ORDER BY f.createdAt DESC`,
    [auth.id]
  );

  return NextResponse.json({ requests });
}
