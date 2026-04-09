import { NextRequest, NextResponse } from "next/server";
import { all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

// GET /api/users/search?q=... — search users by name or username
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  const pattern = `%${q}%`;
  const users = await all<any>(
    `SELECT id, name, email, username, image FROM User
     WHERE id != ? AND (name LIKE ? OR username LIKE ? OR email = ?)
     LIMIT 10`,
    [auth.id, pattern, pattern, q]
  );

  return NextResponse.json({ users });
}
