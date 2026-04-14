import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://api-three-vert-96.vercel.app";

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

/** Send a bet challenge email to a user who has been invited to take the other side. */
export async function sendBetChallengeEmail({
  toEmail,
  toName,
  fromName,
  betTitle,
  stake,
  betId,
}: {
  toEmail: string;
  toName: string;
  fromName: string;
  betTitle: string;
  stake: number;
  betId: string;
}) {
  const transport = getTransport();
  if (!transport) {
    console.log(`[email] No Gmail credentials — skipping bet challenge email to ${toEmail}`);
    return;
  }

  const betUrl = `${APP_URL}/bet/${betId}`;
  const displayName = toName || "there";
  const challenger = fromName || "Someone";

  try {
    await transport.sendMail({
      from: `"Tilt" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${challenger} challenged you to a bet 🎯`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fff;">
          <h2 style="margin-bottom: 4px; font-size: 22px;">You've been challenged</h2>
          <p style="color: #666; margin-top: 4px;">Hey ${displayName}, <strong>${challenger}</strong> wants to bet you.</p>

          <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #111;">${betTitle}</p>
            <p style="margin: 0; color: #888; font-size: 14px;">Stake: <strong style="color: #2563eb;">${stake} chips</strong> · Pot: <strong style="color: #2563eb;">${stake * 2} chips</strong></p>
          </div>

          <a href="${betUrl}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            View the bet →
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px;">
            Or copy this link: <a href="${betUrl}" style="color:#2563eb;">${betUrl}</a>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email] Failed to send bet challenge email:", err);
  }
}

/** Send a notification email to the proposer when someone joins their bet. */
export async function sendBetJoinedEmail({
  toEmail,
  toName,
  joinerName,
  betTitle,
  stake,
  betId,
}: {
  toEmail: string;
  toName: string;
  joinerName: string;
  betTitle: string;
  stake: number;
  betId: string;
}) {
  const transport = getTransport();
  if (!transport) {
    console.log(`[email] No Gmail credentials — skipping bet joined email to ${toEmail}`);
    return;
  }

  const betUrl = `${APP_URL}/bet/${betId}`;

  try {
    await transport.sendMail({
      from: `"Tilt" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${joinerName} accepted your bet 🔥`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fff;">
          <h2 style="margin-bottom: 4px; font-size: 22px;">Your bet is live!</h2>
          <p style="color: #666; margin-top: 4px;"><strong>${joinerName}</strong> accepted your challenge. The pot is locked in.</p>

          <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #111;">${betTitle}</p>
            <p style="margin: 0; color: #888; font-size: 14px;">Total pot: <strong style="color: #2563eb;">${stake * 2} chips</strong></p>
          </div>

          <a href="${betUrl}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            View bet →
          </a>
        </div>
      `,
    });
  } catch (err) {
    console.error("[email] Failed to send bet joined email:", err);
  }
}

/** Send a password reset email. */
export async function sendPasswordResetEmail({
  toEmail,
  toName,
  resetUrl,
}: {
  toEmail: string;
  toName: string;
  resetUrl: string;
}) {
  const transport = getTransport();
  if (!transport) {
    console.log(`[email] No Gmail credentials — skipping password reset email to ${toEmail}`);
    return;
  }

  const displayName = toName || "there";

  try {
    await transport.sendMail({
      from: `"Tilt" <${process.env.GMAIL_USER}>`,
      to: toEmail,
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
  } catch (err) {
    console.error("[email] Failed to send password reset email:", err);
  }
}
