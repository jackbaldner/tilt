import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { one, run } from "@/lib/db";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { sendPasswordResetEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://api-three-vert-96.vercel.app";

// POST /api/auth/forgot-password
export async function POST(req: NextRequest) {
  try {
    await ensureFriendshipTable();

    const { email } = await req.json();
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const user = await one<any>("SELECT id, email, name, username FROM User WHERE email = ?", [
      email.trim().toLowerCase(),
    ]);

    // Always return success to avoid email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

    await run("UPDATE User SET reset_token = ?, reset_token_expires = ?, updatedAt = ? WHERE id = ?", [
      token,
      expires,
      new Date().toISOString(),
      user.id,
    ]);

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const displayName = user.username ?? user.name ?? "there";

    await sendPasswordResetEmail({
      toEmail: user.email,
      toName: displayName,
      resetUrl,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
