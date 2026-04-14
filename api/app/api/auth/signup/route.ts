import { NextRequest, NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import { hash } from "bcryptjs";
import { one, run, cuid, now } from "@/lib/db";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { grant, getBalance } from "@/lib/wallet";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

// POST /api/auth/signup — create a new account
export async function POST(req: NextRequest) {
  try {
    await ensureFriendshipTable();

    const { username, email, password } = await req.json();

    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "Username, email, and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const usernameTrimmed = username.trim();

    // Check uniqueness
    const existingEmail = await one<any>("SELECT id FROM User WHERE email = ?", [emailLower]);
    if (existingEmail) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const existingUsername = await one<any>("SELECT id FROM User WHERE username = ?", [usernameTrimmed]);
    if (existingUsername) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    const passwordHash = await hash(password, 10);
    const id = cuid();
    const timestamp = now();

    await run(
      `INSERT INTO User (id, email, name, username, password_hash, image, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [id, emailLower, usernameTrimmed, usernameTrimmed, passwordHash, timestamp, timestamp]
    );
    await run(
      `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
      [cuid(), id, timestamp]
    );
    await grant({ userId: id, currency: "CHIPS", amount: 1000, reason: "signup" });

    const [user, chips] = await Promise.all([
      one<any>("SELECT id, email, name, username, image FROM User WHERE id = ?", [id]),
      getBalance(id, "CHIPS"),
    ]);
    const token = sign({ sub: id, email: emailLower }, JWT_SECRET, { expiresIn: "90d" });

    return NextResponse.json({ token, user: { ...user, chips } }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
