import { NextRequest, NextResponse } from "next/server";
import { one, all, run, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const user = one<any>("SELECT * FROM User WHERE id = ?", [auth.id]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const stats = one<any>("SELECT * FROM UserStats WHERE userId = ?", [auth.id]);
  const memberships = all<any>(
    "SELECT cm.*, c.id as circleId, c.name as circleName, c.emoji FROM CircleMember cm JOIN Circle c ON c.id = cm.circleId WHERE cm.userId = ?",
    [auth.id]
  );
  const transactions = all<any>(
    "SELECT * FROM \"Transaction\" WHERE userId = ? ORDER BY createdAt DESC LIMIT 10",
    [auth.id]
  );

  return NextResponse.json({
    user: {
      ...user,
      stats,
      memberships: memberships.map((m: any) => ({
        ...m,
        circle: { id: m.circleId, name: m.circleName, emoji: m.emoji },
      })),
      transactions,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { name, username, image } = await req.json();

  if (username) {
    const existing = one<any>("SELECT id FROM User WHERE username = ?", [username]);
    if (existing && existing.id !== auth.id) {
      return NextResponse.json({ error: "Username taken" }, { status: 400 });
    }
  }

  run(
    "UPDATE User SET name = COALESCE(?, name), username = COALESCE(?, username), image = COALESCE(?, image), updatedAt = ? WHERE id = ?",
    [name?.trim() ?? null, username?.trim() ?? null, image ?? null, now(), auth.id]
  );

  return NextResponse.json({ user: one("SELECT * FROM User WHERE id = ?", [auth.id]) });
}
