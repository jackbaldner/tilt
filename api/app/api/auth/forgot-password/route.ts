import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { one, run } from "@/lib/db";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { sendPasswordResetEmail } from "@/lib/email";

/**
 * Resolve the public app URL for email links. In development we fall
 * back to localhost; in production we require NEXT_PUBLIC_APP_URL to be
 * set so password reset emails never ship a stale hardcoded URL. If the
 * env var is missing in production we fail loud at request time rather
 * than silently email users a broken link.
 */
function getAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set in production — password reset emails would contain an invalid URL"
    );
  }
  return "http://localhost:3000";
}

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

    const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;
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
