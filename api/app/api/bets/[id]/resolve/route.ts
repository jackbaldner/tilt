import { NextRequest, NextResponse } from "next/server";
import { one, all, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const TX_INSERT = `INSERT INTO "Transaction" (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { winningOption, resolutionNote } = await req.json();
  if (!winningOption) return NextResponse.json({ error: "Winning option required" }, { status: 400 });

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") return NextResponse.json({ error: "Bet already resolved" }, { status: 400 });

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [bet.circleId]);
  if (bet.proposerId !== auth.id && circle?.ownerId !== auth.id) {
    return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
  }

  const options = JSON.parse(bet.options) as string[];
  if (!options.includes(winningOption)) return NextResponse.json({ error: "Invalid option" }, { status: 400 });

  const sides = await all<any>("SELECT * FROM BetSide WHERE betId = ?", [betId]);
  const winners = sides.filter((s: any) => s.option === winningOption);
  const losers = sides.filter((s: any) => s.option !== winningOption);
  const totalPot = bet.totalPot;
  const winnerCount = winners.length;
  const payoutPerWinner = winnerCount > 0 ? Math.floor(totalPot / winnerCount) : 0;
  const timestamp = now();

  // Pre-fetch winner stats so we can do biggestWin/longestStreak checks without reads in transaction
  const winnerStatsMap: Record<string, any> = {};
  for (const w of winners) {
    const stats = await one<any>("SELECT biggestWin, longestStreak, currentStreak FROM UserStats WHERE userId = ?", [w.userId]);
    winnerStatsMap[w.userId] = stats;
  }

  await transaction((db) => {
    db.run("UPDATE Bet SET resolution = 'resolved', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?",
      [winningOption, timestamp, resolutionNote ?? null, timestamp, betId]);

    for (const side of winners) {
      const profit = payoutPerWinner - side.stake;
      const stats = winnerStatsMap[side.userId];
      db.run("UPDATE BetSide SET status = 'won' WHERE id = ?", [side.id]);
      db.run("UPDATE User SET chips = chips + ?, updatedAt = ? WHERE id = ?", [payoutPerWinner, timestamp, side.userId]);
      db.run("UPDATE CircleMember SET chips = chips + ? WHERE circleId = ? AND userId = ?", [payoutPerWinner, bet.circleId, side.userId]);
      db.run(TX_INSERT, [cuid(), side.userId, betId, "bet_won", payoutPerWinner, `Won bet: ${bet.title}`, timestamp]);
      db.run("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)", [cuid(), side.userId, timestamp]);
      db.run("UPDATE UserStats SET wonBets = wonBets + 1, totalChipsWon = totalChipsWon + ?, currentStreak = currentStreak + 1, updatedAt = ? WHERE userId = ?",
        [profit > 0 ? profit : 0, timestamp, side.userId]);
      if (profit > 0 && stats) {
        if (profit > (stats.biggestWin ?? 0)) {
          db.run("UPDATE UserStats SET biggestWin = ? WHERE userId = ?", [profit, side.userId]);
        }
        if ((stats.currentStreak ?? 0) + 1 > (stats.longestStreak ?? 0)) {
          db.run("UPDATE UserStats SET longestStreak = currentStreak + 1 WHERE userId = ?", [side.userId]);
        }
      }
      db.run("INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', ?, ?, ?, 0, ?)",
        [cuid(), side.userId, "You won! 🎉", `${bet.title} — you won ${payoutPerWinner} chips!`,
         JSON.stringify({ betId, circleId: bet.circleId }), timestamp]);
    }

    for (const side of losers) {
      db.run("UPDATE BetSide SET status = 'lost' WHERE id = ?", [side.id]);
      db.run(TX_INSERT, [cuid(), side.userId, betId, "bet_lost", 0, `Lost bet: ${bet.title}`, timestamp]);
      db.run("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)", [cuid(), side.userId, timestamp]);
      db.run("UPDATE UserStats SET lostBets = lostBets + 1, totalChipsLost = totalChipsLost + ?, currentStreak = 0, updatedAt = ? WHERE userId = ?",
        [side.stake, timestamp, side.userId]);
      db.run("INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', 'Bet resolved', ?, ?, 0, ?)",
        [cuid(), side.userId, `${bet.title} — better luck next time`,
         JSON.stringify({ betId, circleId: bet.circleId }), timestamp]);
    }

    db.run("INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_resolved', ?, ?)",
      [cuid(), bet.circleId, betId, auth.id,
       JSON.stringify({ betTitle: bet.title, winningOption, winnerCount, totalPot, payoutPerWinner }),
       timestamp]);
  });

  const resolvedBet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  return NextResponse.json({ bet: { ...resolvedBet, options: JSON.parse(resolvedBet.options) } });
}
