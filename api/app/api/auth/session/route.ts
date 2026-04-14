import { NextRequest, NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { compare } from "bcryptjs";
import { one, run, cuid, now } from "@/lib/db";
import { setSessionCookie } from "@/lib/web-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

const JWT_SECRET =
  process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

// POST /api/auth/session — web login with email + password, sets cookie
export async function POST(req: NextRequest) {
  try {
    await ensureFriendshipTable();

    const body = await req.json();
    const { email, password } = body as { email: string; password: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await one<any>(
      "SELECT id, email, name, username, image, password_hash FROM User WHERE email = ?",
      [email.trim().toLowerCase()]
    );

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.password_hash) {
      return NextResponse.json({ error: "Account has no password set. Please sign up again." }, { status: 401 });
    }

    const valid = await compare(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await run(
      `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
      [cuid(), user.id, now()]
    );

    const token = sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "90d" });
    const { password_hash: _, ...safeUser } = user;

    const res = NextResponse.json({ user: safeUser, token });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    console.error("Session POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/auth/session — logout, clears cookie
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("tilt_token");
  return res;
}
