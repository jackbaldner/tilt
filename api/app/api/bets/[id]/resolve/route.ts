import { NextRequest, NextResponse } from "next/server";
import { one, all, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { resolveBet, refundBet } from "@/lib/wallet";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { winningOption, resolutionNote } = await req.json();
  if (!winningOption) return NextResponse.json({ error: "winningOption required" }, { status: 400 });

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") return NextResponse.json({ error: "Bet already resolved" }, { status: 400 });

  // Only proposer (or circle owner if circle exists) can resolve
  if (bet.proposerId !== auth.id) {
    if (bet.circleId) {
      const circle = await one<any>("SELECT ownerId FROM Circle WHERE id = ?", [bet.circleId]);
      if (circle?.ownerId !== auth.id) {
        return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
    }
  }

  const sides = await all<{ id: string; userId: string; option: string; stake: number }>(
    "SELECT id, userId, option, stake FROM BetSide WHERE betId = ?",
    [betId]
  );
  const distinctUsers = new Set(sides.map((s) => s.userId));
  const distinctOptions = [...new Set(sides.map((s) => s.option))];

  // Wallet operation: refund if lone joiner or no winner side; otherwise resolve
  if (distinctUsers.size < 2) {
    await refundBet({ betId, reason: "lone_joiner" });
  } else if (!distinctOptions.includes(winningOption)) {
    await refundBet({ betId, reason: "tie" });
  } else {
    await resolveBet({ betId, winningOption });
  }

  const winnerSides = sides.filter((s) => s.option === winningOption);
  const loserSides = sides.filter((s) => s.option !== winningOption);
  const totalPot = bet.totalPot;
  const timestamp = now();

  await transaction((db) => {
    // Mark bet resolved
    db.run(
      "UPDATE Bet SET resolution = 'resolved', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?",
      [winningOption, timestamp, resolutionNote ?? null, timestamp, betId]
    );

    // Winner sides: mark won, update stats, notify
    for (const side of winnerSides) {
      db.run("UPDATE BetSide SET status = 'won' WHERE id = ?", [side.id]);
      db.run(
        "INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)",
        [cuid(), side.userId, timestamp]
      );
      const profit = totalPot - side.stake;
      db.run(
        "UPDATE UserStats SET wonBets = wonBets + 1, totalChipsWon = totalChipsWon + ?, currentStreak = currentStreak + 1, updatedAt = ? WHERE userId = ?",
        [profit > 0 ? profit : 0, timestamp, side.userId]
      );
      db.run(
        "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', 'You won!', ?, ?, 0, ?)",
        [cuid(), side.userId, `${bet.title} — you won!`,
         JSON.stringify({ betId, circleId: bet.circleId }), timestamp]
      );
    }

    // Loser sides: mark lost, update stats, notify
    for (const side of loserSides) {
      db.run("UPDATE BetSide SET status = 'lost' WHERE id = ?", [side.id]);
      db.run(
        "INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)",
        [cuid(), side.userId, timestamp]
      );
      db.run(
        "UPDATE UserStats SET lostBets = lostBets + 1, totalChipsLost = totalChipsLost + ?, currentStreak = 0, updatedAt = ? WHERE userId = ?",
        [side.stake, timestamp, side.userId]
      );
      db.run(
        "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', 'Bet resolved', ?, ?, 0, ?)",
        [cuid(), side.userId, `${bet.title} — better luck next time`,
         JSON.stringify({ betId, circleId: bet.circleId }), timestamp]
      );
    }

    if (bet.circleId) {
      db.run(
        "INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_resolved', ?, ?)",
        [cuid(), bet.circleId, betId, auth.id,
         JSON.stringify({ betTitle: bet.title, winningOption, totalPot }),
         timestamp]
      );
    }
  });

  const resolvedBet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  return NextResponse.json({ bet: { ...resolvedBet, options: JSON.parse(resolvedBet.options) } });
}
