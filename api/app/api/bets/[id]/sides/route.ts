import { NextRequest, NextResponse } from "next/server";
import { one, all, cuid, now, interactiveTransaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { shouldBlockJoin } from "@/lib/circleDisplay";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { sendBetJoinedEmail } from "@/lib/email";
import { joinBetInTx, InsufficientFundsError } from "@/lib/wallet";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { option } = await req.json();
  if (!option) return NextResponse.json({ error: "Option required" }, { status: 400 });

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") {
    return NextResponse.json({ error: "Bet is already resolved" }, { status: 400 });
  }

  const options = JSON.parse(bet.options) as string[];
  if (!options.includes(option)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  // For circle bets, verify membership. For circle-less bets, anyone can join (by link/invite).
  if (bet.circleId) {
    const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
    if (!membership) return NextResponse.json({ error: "Not a circle member" }, { status: 403 });
  }

  // Early exit for duplicate joins: if the user already has a side in this
  // bet, return it immediately without entering the transaction. This is
  // the happy-path fast check — the LedgerEntry.idempotency_key UNIQUE
  // constraint inside joinBetInTx is the ultimate source of truth and
  // will still fire if a race slips past this check.
  const existingSide = await one<any>(
    "SELECT * FROM BetSide WHERE betId = ? AND userId = ?",
    [betId, auth.id]
  );
  if (existingSide) {
    const existingUser = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);
    return NextResponse.json({ side: { ...existingSide, user: existingUser } });
  }

  // 1:1 side-lock: in private circles, each option can hold at most one
  // joiner. Look up the circle name + the options already taken, then
  // consult the pure `shouldBlockJoin` rule. Reject cleanly before we
  // open a transaction.
  if (bet.circleId) {
    const circle = await one<{ name: string }>(
      "SELECT name FROM Circle WHERE id = ?",
      [bet.circleId]
    );
    if (circle?.name) {
      const currentSides = await all<{ option: string }>(
        "SELECT option FROM BetSide WHERE betId = ?",
        [betId]
      );
      const lock = shouldBlockJoin(circle.name, currentSides, option);
      if (lock.blocked) {
        return NextResponse.json(
          { error: lock.reason ?? "That side is already taken" },
          { status: 409 }
        );
      }
    }
  }

  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
  const timestamp = now();
  const user = await one<{ id: string; name: string | null; username: string | null; image: string | null }>(
    "SELECT id, name, username, image FROM User WHERE id = ?",
    [auth.id]
  );

  // --- Atomic: join bet + totalPot bump + stats + activity + notification ---
  let wasDuplicate = false;
  try {
    await interactiveTransaction(async (tx) => {
      try {
        await joinBetInTx(tx, {
          betId,
          userId: auth.id,
          option,
          stake: bet.stake,
          idempotencyKey,
        });
      } catch (err: unknown) {
        const msg = String((err as Error)?.message ?? err);
        // Race: another request (same user, same bet) slipped in between
        // our existing-side check above and this insert. Translate the
        // UNIQUE constraint into a duplicate marker and short-circuit the
        // rest of the bookkeeping.
        if (
          msg.includes("UNIQUE constraint failed") &&
          (msg.includes("BetSide") || msg.includes("idempotency_key"))
        ) {
          wasDuplicate = true;
          return;
        }
        throw err;
      }

      await tx.run(
        "UPDATE Bet SET totalPot = totalPot + ?, updatedAt = ? WHERE id = ?",
        [bet.stake, timestamp, betId]
      );

      if (bet.circleId) {
        await tx.run(
          "INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_joined', ?, ?)",
          [
            cuid(),
            bet.circleId,
            betId,
            auth.id,
            JSON.stringify({ betTitle: bet.title, option, stake: bet.stake }),
            timestamp,
          ]
        );
      }

      await tx.run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), auth.id, timestamp]
      );
      await tx.run(
        "UPDATE UserStats SET totalBets = totalBets + 1, updatedAt = ? WHERE userId = ?",
        [timestamp, auth.id]
      );

      // In-app notification for the proposer
      await tx.run(
        "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_joined', ?, ?, ?, 0, ?)",
        [
          cuid(),
          bet.proposerId,
          `${user?.username ?? user?.name ?? "Someone"} accepted your bet`,
          bet.title,
          JSON.stringify({ betId }),
          timestamp,
        ]
      );
    });
  } catch (err: unknown) {
    if (err instanceof InsufficientFundsError) {
      return NextResponse.json({ error: "Not enough chips to cover your stake" }, { status: 400 });
    }
    console.error("Join bet failed:", err);
    const msg = err instanceof Error ? err.message : "Failed to join bet";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (wasDuplicate) {
    // A concurrent request won the race; return the existing row.
    const existing = await one<any>(
      "SELECT * FROM BetSide WHERE betId = ? AND userId = ?",
      [betId, auth.id]
    );
    if (!existing) {
      // Extremely unlikely (idempotency_key was hit but no BetSide row).
      // Fail loud so we see it in logs rather than ship null.
      return NextResponse.json(
        { error: "Join state inconsistent — please retry" },
        { status: 500 }
      );
    }
    const existingUser = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);
    return NextResponse.json({ side: { ...existing, user: existingUser } });
  }

  // Email the proposer (fire and forget, post-commit)
  const proposer = await one<any>("SELECT name, email FROM User WHERE id = ?", [bet.proposerId]);
  if (proposer?.email) {
    sendBetJoinedEmail({
      toEmail: proposer.email,
      toName: proposer.name ?? "",
      joinerName: user?.username ?? user?.name ?? "Someone",
      betTitle: bet.title,
      stake: bet.stake,
      betId,
    });
  }

  const side = await one<any>("SELECT * FROM BetSide WHERE betId = ? AND userId = ?", [betId, auth.id]);
  const sideUser = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);

  return NextResponse.json({ side: { ...side, user: sideUser } }, { status: 201 });
}
