import { NextRequest, NextResponse } from "next/server";
import { one, interactiveTransaction, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import {
  resolveBetInTx,
  refundBetInTx,
  type ResolveBetResult,
  type RefundBetResult,
} from "@/lib/wallet";
import { decideOutcome } from "@/lib/resolveOutcome";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { winningOption, resolutionNote } = await req.json();
  if (!winningOption) {
    return NextResponse.json({ error: "winningOption required" }, { status: 400 });
  }

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") {
    return NextResponse.json({ error: "Bet already resolved" }, { status: 400 });
  }

  // Only proposer (or circle owner, if the bet is in a circle) can resolve.
  if (bet.proposerId !== auth.id) {
    if (bet.circleId) {
      const circle = await one<{ ownerId: string }>("SELECT ownerId FROM Circle WHERE id = ?", [bet.circleId]);
      if (circle?.ownerId !== auth.id) {
        return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
    }
  }

  // Decide the outcome from the current sides.
  const allSides = await interactiveTransaction(async (tx) =>
    tx.all<{ id: string; userId: string; option: string; stake: number }>(
      "SELECT id, userId, option, stake FROM BetSide WHERE betId = ?",
      [betId]
    )
  );
  const distinctUserIds = new Set(allSides.map((s) => s.userId));
  const distinctOptions = [...new Set(allSides.map((s) => s.option))];
  const outcome = decideOutcome(distinctUserIds.size, distinctOptions, winningOption);

  const timestamp = now();

  try {
    await interactiveTransaction(async (tx) => {
      if (outcome.kind === "resolve") {
        // Winning path: call wallet.resolveBetInTx for the chip movement,
        // then use the returned payouts to update stats accurately.
        const result: ResolveBetResult = await resolveBetInTx(tx, { betId, winningOption });

        const payoutByUserId = new Map<string, { payout: number; stake: number }>();
        for (const p of result.payouts) {
          payoutByUserId.set(p.userId, { payout: p.payout, stake: p.stake });
        }

        for (const side of allSides) {
          const payoutInfo = payoutByUserId.get(side.userId);
          const isWinner = side.option === winningOption && payoutInfo !== undefined;

          await tx.run(
            "UPDATE BetSide SET status = ? WHERE id = ?",
            [isWinner ? "won" : "lost", side.id]
          );

          // Ensure UserStats row exists
          await tx.run(
            `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt)
             VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
            [cuid(), side.userId, timestamp]
          );

          if (isWinner && payoutInfo) {
            // Real profit = what they received back minus what they put in.
            // Can be zero or negative in pathological cases (shouldn't happen
            // with fixed-stake bets, but guard anyway).
            const profit = payoutInfo.payout - payoutInfo.stake;
            const profitCredit = profit > 0 ? profit : 0;
            await tx.run(
              `UPDATE UserStats
                 SET wonBets = wonBets + 1,
                     totalChipsWon = totalChipsWon + ?,
                     biggestWin = MAX(biggestWin, ?),
                     currentStreak = CASE WHEN currentStreak < 0 THEN 1 ELSE currentStreak + 1 END,
                     longestStreak = MAX(longestStreak, CASE WHEN currentStreak < 0 THEN 1 ELSE currentStreak + 1 END),
                     updatedAt = ?
               WHERE userId = ?`,
              [profitCredit, profitCredit, timestamp, side.userId]
            );
            await tx.run(
              `INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt)
               VALUES (?, ?, 'bet_resolved', ?, ?, ?, 0, ?)`,
              [
                cuid(),
                side.userId,
                "You won! 🏆",
                `${bet.title} — you won ${payoutInfo.payout} chips${profit > 0 ? ` (+${profit} profit)` : ""}`,
                JSON.stringify({ betId, circleId: bet.circleId, payout: payoutInfo.payout, profit }),
                timestamp,
              ]
            );
          } else {
            // Loser: mark lost, debit stake, break streak.
            await tx.run(
              `UPDATE UserStats
                 SET lostBets = lostBets + 1,
                     totalChipsLost = totalChipsLost + ?,
                     currentStreak = 0,
                     updatedAt = ?
               WHERE userId = ?`,
              [side.stake, timestamp, side.userId]
            );
            await tx.run(
              `INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt)
               VALUES (?, ?, 'bet_resolved', 'Bet resolved', ?, ?, 0, ?)`,
              [
                cuid(),
                side.userId,
                `${bet.title} — "${winningOption}" won, better luck next time`,
                JSON.stringify({ betId, circleId: bet.circleId }),
                timestamp,
              ]
            );
          }
        }

        // Mark bet resolved
        await tx.run(
          "UPDATE Bet SET resolution = 'resolved', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?",
          [winningOption, timestamp, resolutionNote ?? null, timestamp, betId]
        );
      } else {
        // Refund path: lone joiner or tie/push. Chips go back to joiners;
        // no one wins, no one loses, no stats changes beyond marking sides as voided.
        const reason = outcome.kind === "lone_joiner_refund" ? "lone_joiner" : "tie";
        const result: RefundBetResult = await refundBetInTx(tx, { betId, reason });

        // Mark every BetSide as voided (not won/lost).
        for (const side of allSides) {
          await tx.run(
            "UPDATE BetSide SET status = 'voided' WHERE id = ?",
            [side.id]
          );
        }

        // Notify each joiner that their bet was refunded — DIFFERENT
        // content depending on refund reason so users understand what
        // happened.
        const notifBody =
          outcome.kind === "lone_joiner_refund"
            ? `${bet.title} — no one took the other side, your stake was refunded`
            : `${bet.title} — no one picked "${winningOption}", everyone refunded`;

        for (const refund of result.refunds) {
          await tx.run(
            `INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt)
             VALUES (?, ?, 'bet_voided', 'Bet voided', ?, ?, 0, ?)`,
            [
              cuid(),
              refund.userId,
              notifBody,
              JSON.stringify({ betId, circleId: bet.circleId, refund: refund.amount, reason }),
              timestamp,
            ]
          );
        }

        // Auto-populate the resolution note when user didn't provide one,
        // so the bet history explains why it was voided.
        const autoNote =
          outcome.kind === "lone_joiner_refund"
            ? "Voided — no takers on the other side"
            : `Voided — no one picked "${winningOption}"`;
        const finalNote = resolutionNote?.trim()
          ? `${resolutionNote.trim()} (${autoNote.toLowerCase()})`
          : autoNote;

        await tx.run(
          "UPDATE Bet SET resolution = 'voided', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?",
          [winningOption, timestamp, finalNote, timestamp, betId]
        );
      }

      // Activity feed entry — common to both paths, but different type
      // and data based on outcome.
      if (bet.circleId) {
        const activityType = outcome.kind === "resolve" ? "bet_resolved" : "bet_voided";
        const activityData =
          outcome.kind === "resolve"
            ? { betTitle: bet.title, winningOption, totalPot: bet.totalPot }
            : {
                betTitle: bet.title,
                reason: outcome.kind === "lone_joiner_refund" ? "lone_joiner" : "tie",
                attemptedOption: winningOption,
              };
        await tx.run(
          `INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [cuid(), bet.circleId, betId, auth.id, activityType, JSON.stringify(activityData), timestamp]
        );
      }
    });
  } catch (err: unknown) {
    console.error("Resolve failed:", err);
    const msg = err instanceof Error ? err.message : "Resolution failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const resolvedBet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  return NextResponse.json({
    bet: { ...resolvedBet, options: JSON.parse(resolvedBet.options) },
    outcome: outcome.kind,
  });
}
