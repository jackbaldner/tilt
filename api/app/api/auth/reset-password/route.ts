import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sign } from "jsonwebtoken";
import { one, run } from "@/lib/db";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "tilt-super-secret-key-change-in-prod-32chars";

// POST /api/auth/reset-password
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const user = await one<any>(
      "SELECT id, email, name, username, chips, reset_token, reset_token_expires FROM User WHERE reset_token = ?",
      [token]
    );

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }

    if (new Date(user.reset_token_expires) < new Date()) {
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 });
    }

    const passwordHash = await hash(password, 10);
    await run(
      "UPDATE User SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updatedAt = ? WHERE id = ?",
      [passwordHash, new Date().toISOString(), user.id]
    );

    const jwtToken = sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "90d" });
    const { reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;

    return NextResponse.json({ token: jwtToken, user: safeUser });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
