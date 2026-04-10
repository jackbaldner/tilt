import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { randomBytes } from "crypto";
import { one, run } from "@/lib/db";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
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

    if (resend) {
      await resend.emails.send({
        from: "Tilt <onboarding@resend.dev>",
        to: user.email,
        subject: "Reset your Tilt password",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 8px;">Reset your password</h2>
            <p style="color: #666;">Hey ${displayName}, click the button below to set a new password. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:700;">
              Reset Password
            </a>
            <p style="color:#999;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
            <p style="color:#bbb;font-size:12px;margin-top:8px;">${resetUrl}</p>
          </div>
        `,
      });
    } else {
      // No email service configured — log the link for local dev
      console.log(`[forgot-password] Reset link for ${user.email}: ${resetUrl}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
