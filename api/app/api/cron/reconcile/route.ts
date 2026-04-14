import { NextRequest, NextResponse } from "next/server";
import { reconcileAll } from "@/lib/wallet";

export async function GET(req: NextRequest) {
  // Verify the request is from the cron scheduler
  const cronSecret = req.headers.get("authorization");
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await reconcileAll();

  if (!report.ok) {
    // Fire Discord webhook alert
    const webhook = process.env.DISCORD_ALERT_WEBHOOK;
    if (webhook) {
      const message = report.invariantHolds
        ? `⚠️ Wallet drift detected on ${report.drifted.length} wallets`
        : `🚨 CRITICAL: total wallet sum is ${report.totalBalanceSum} (should be 0)`;
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: message + "\n```" + JSON.stringify(report, null, 2).slice(0, 1500) + "```",
          }),
        });
      } catch {
        // Don't block the response if webhook fails
      }
    }
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
