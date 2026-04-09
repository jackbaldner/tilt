import { NextRequest, NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { one, run, cuid, now } from "@/lib/db";
import { setSessionCookie } from "@/lib/web-auth";

const JWT_SECRET =
  process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  chips: number;
}

// POST /api/auth/session — web login, sets cookie
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name } = body as { email: string; name?: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    let user = await one<UserRow>(
      "SELECT id, email, name, image, chips FROM User WHERE email = ?",
      [email]
    );

    if (!user) {
      const id = cuid();
      const ts = now();
      const displayName = name ?? email.split("@")[0];
      await run(
        `INSERT INTO User (id, email, name, image, chips, createdAt, updatedAt) VALUES (?, ?, ?, NULL, 1000, ?, ?)`,
        [id, email, displayName, ts, ts]
      );
      await run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), id, ts]
      );
      user = await one<UserRow>(
        "SELECT id, email, name, image, chips FROM User WHERE id = ?",
        [id]
      );
    } else {
      await run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), user.id, now()]
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const token = sign({ sub: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "90d",
    });

    const res = NextResponse.json({ user, token });
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
