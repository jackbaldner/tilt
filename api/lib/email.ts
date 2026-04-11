import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://api-three-vert-96.vercel.app";

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
  if (!resend) {
    console.log(`[email] No RESEND_API_KEY — skipping bet challenge email to ${toEmail}`);
    return;
  }
  const betUrl = `${APP_URL}/bet/${betId}`;
  const displayName = toName ?? "there";
  const challenger = fromName ?? "Someone";

  try {
    await resend.emails.send({
      from: "Tilt <onboarding@resend.dev>",
      to: toEmail,
      subject: `${challenger} challenged you to a bet 🎯`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fff;">
          <h2 style="margin-bottom: 4px; font-size: 22px;">You've been challenged</h2>
          <p style="color: #666; margin-top: 4px;">Hey ${displayName}, <strong>${challenger}</strong> wants to bet you.</p>

          <div style="background: #f9f9f9; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #111;">${betTitle}</p>
            <p style="margin: 0; color: #888; font-size: 14px;">Stake: <strong style="color: #2563eb;">${stake} chips</strong> per side · Pot: <strong style="color: #2563eb;">${stake * 2} chips</strong></p>
          </div>

          <a href="${betUrl}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
            Accept the bet →
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
  if (!resend) {
    console.log(`[email] No RESEND_API_KEY — skipping bet joined email to ${toEmail}`);
    return;
  }
  const betUrl = `${APP_URL}/bet/${betId}`;

  try {
    await resend.emails.send({
      from: "Tilt <onboarding@resend.dev>",
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
