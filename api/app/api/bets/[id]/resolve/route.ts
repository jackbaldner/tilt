import { NextRequest, NextResponse } from "next/server";
import { one, all, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";

const TX_INSERT = `INSERT INTO "Transaction" (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { winnerId, resolutionNote } = await req.json();
  if (!winnerId) return NextResponse.json({ error: "Winner required" }, { status: 400 });

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

  const sides = await all<any>("SELECT * FROM BetSide WHERE betId = ?", [betId]);
  const winnerSide = sides.find((s: any) => s.userId === winnerId);
  if (!winnerSide) return NextResponse.json({ error: "Winner is not a participant" }, { status: 400 });

  const loserSides = sides.filter((s: any) => s.userId !== winnerId);
  const totalPot = bet.totalPot;
  const timestamp = now();

  const winnerStats = await one<any>(
    "SELECT biggestWin, longestStreak, currentStreak FROM UserStats WHERE userId = ?",
    [winnerId]
  );
  const profit = totalPot - winnerSide.stake;

  await transaction((db) => {
    // Mark bet resolved — store winnerId in resolvedOption for reference
    db.run(
      "UPDATE Bet SET resolution = 'resolved', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?",
      [winnerId, timestamp, resolutionNote ?? null, timestamp, betId]
    );

    // Winner: mark won, credit full pot
    db.run("UPDATE BetSide SET status = 'won' WHERE betId = ? AND userId = ?", [betId, winnerId]);
    db.run("UPDATE User SET chips = chips + ?, updatedAt = ? WHERE id = ?", [totalPot, timestamp, winnerId]);
    if (bet.circleId) {
      db.run("UPDATE CircleMember SET chips = chips + ? WHERE circleId = ? AND userId = ?", [totalPot, bet.circleId, winnerId]);
    }
    db.run(TX_INSERT, [cuid(), winnerId, betId, "bet_won", totalPot, `Won bet: ${bet.title}`, timestamp]);
    db.run(
      "INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)",
      [cuid(), winnerId, timestamp]
    );
    db.run(
      "UPDATE UserStats SET wonBets = wonBets + 1, totalChipsWon = totalChipsWon + ?, currentStreak = currentStreak + 1, updatedAt = ? WHERE userId = ?",
      [profit > 0 ? profit : 0, timestamp, winnerId]
    );
    if (profit > 0 && winnerStats) {
      if (profit > (winnerStats.biggestWin ?? 0)) {
        db.run("UPDATE UserStats SET biggestWin = ? WHERE userId = ?", [profit, winnerId]);
      }
      if ((winnerStats.currentStreak ?? 0) + 1 > (winnerStats.longestStreak ?? 0)) {
        db.run("UPDATE UserStats SET longestStreak = currentStreak + 1 WHERE userId = ?", [winnerId]);
      }
    }
    db.run(
      "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', 'You won!', ?, ?, 0, ?)",
      [cuid(), winnerId, `${bet.title} — you won ${totalPot} chips!`,
       JSON.stringify({ betId, circleId: bet.circleId }), timestamp]
    );

    // Losers: mark lost, no chip adjustment (chips already deducted on bet placement)
    for (const side of loserSides) {
      db.run("UPDATE BetSide SET status = 'lost' WHERE id = ?", [side.id]);
      db.run(TX_INSERT, [cuid(), side.userId, betId, "bet_lost", 0, `Lost bet: ${bet.title}`, timestamp]);
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
         JSON.stringify({ betTitle: bet.title, winnerId, totalPot }),
         timestamp]
      );
    }
  });

  const resolvedBet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  return NextResponse.json({ bet: { ...resolvedBet, options: JSON.parse(resolvedBet.options) } });
}
