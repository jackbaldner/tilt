import { NextRequest, NextResponse } from "next/server";
import { sign, verify } from "jsonwebtoken";
import { compare } from "bcryptjs";
import { one, run, cuid, now } from "@/lib/db";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  image: string | null;
  password_hash: string | null;
}

// POST /api/auth/mobile-token — login with email + password, get JWT
export async function POST(req: NextRequest) {
  try {
    await ensureFriendshipTable();

    const { email, password } = await req.json();

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await one<UserRow>(
      "SELECT id, email, name, username, image, password_hash FROM User WHERE email = ?",
      [email.toLowerCase().trim()]
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

    // Ensure UserStats row exists
    await run(
      `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
      [cuid(), user.id, now()]
    );

    const token = sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "90d" });
    const { password_hash: _, ...safeUser } = user;

    return NextResponse.json({ token, user: safeUser });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET /api/auth/mobile-token — verify token
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const payload = verify(token, JWT_SECRET) as { sub: string };

    const user = await one<Omit<UserRow, "password_hash">>(
      "SELECT id, email, name, username, image FROM User WHERE id = ?",
      [payload.sub]
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
