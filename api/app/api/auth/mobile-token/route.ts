import { NextRequest, NextResponse } from "next/server";
import { sign, verify } from "jsonwebtoken";
import { one, run, cuid, now } from "@/lib/db";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  chips: number;
}

// POST /api/auth/mobile-token — create/login user, get JWT
export async function POST(req: NextRequest) {
  try {
    const { email, name, image } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Upsert user
    let user = await one<UserRow>("SELECT id, email, name, image, chips FROM User WHERE email = ?", [email]);

    if (!user) {
      const id = cuid();
      const timestamp = now();
      await run(
        `INSERT INTO User (id, email, name, image, chips, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1000, ?, ?)`,
        [id, email, name ?? null, image ?? null, timestamp, timestamp]
      );
      await run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), id, timestamp]
      );
      user = await one<UserRow>("SELECT id, email, name, image, chips FROM User WHERE id = ?", [id]);
    } else {
      if (name || image) {
        await run(
          `UPDATE User SET name = COALESCE(?, name), image = COALESCE(?, image), updatedAt = ? WHERE id = ?`,
          [name ?? null, image ?? null, now(), user.id]
        );
        user = await one<UserRow>("SELECT id, email, name, image, chips FROM User WHERE id = ?", [user.id]);
      }
      await run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), user!.id, now()]
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const token = sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "90d" });

    return NextResponse.json({ token, user });
  } catch (error) {
    console.error("Mobile token error:", error);
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

    const user = await one<UserRow>(
      "SELECT id, email, name, image, chips FROM User WHERE id = ?",
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
