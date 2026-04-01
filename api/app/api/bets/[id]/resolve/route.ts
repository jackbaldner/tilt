import { NextRequest, NextResponse } from "next/server";
import { one, all, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const TX_INSERT = `INSERT INTO \`Transaction\` (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { winningOption, resolutionNote } = await req.json();
  if (!winningOption) return NextResponse.json({ error: "Winning option required" }, { status: 400 });

  const bet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") return NextResponse.json({ error: "Bet already resolved" }, { status: 400 });

  const circle = one<any>("SELECT * FROM Circle WHERE id = ?", [bet.circleId]);
  if (bet.proposerId !== auth.id && circle?.ownerId !== auth.id) {
    return NextResponse.json({ error: "Not authorized to resolve" }, { status: 403 });
  }

  const options = JSON.parse(bet.options) as string[];
  if (!options.includes(winningOption)) return NextResponse.json({ error: "Invalid option" }, { status: 400 });

  const sides = all<any>("SELECT * FROM BetSide WHERE betId = ?", [betId]);
  const winners = sides.filter((s: any) => s.option === winningOption);
  const losers = sides.filter((s: any) => s.option !== winningOption);
  const totalPot = bet.totalPot;
  const winnerCount = winners.length;
  const payoutPerWinner = winnerCount > 0 ? Math.floor(totalPot / winnerCount) : 0;
  const timestamp = now();

  transaction((db) => {
    db.prepare("UPDATE Bet SET resolution = 'resolved', resolvedOption = ?, resolvedAt = ?, resolutionNote = ?, updatedAt = ? WHERE id = ?")
      .run(winningOption, timestamp, resolutionNote ?? null, timestamp, betId);

    for (const side of winners) {
      db.prepare("UPDATE BetSide SET status = 'won' WHERE id = ?").run(side.id);
      db.prepare("UPDATE User SET chips = chips + ?, updatedAt = ? WHERE id = ?").run(payoutPerWinner, timestamp, side.userId);
      db.prepare("UPDATE CircleMember SET chips = chips + ? WHERE circleId = ? AND userId = ?").run(payoutPerWinner, bet.circleId, side.userId);
      db.prepare(TX_INSERT).run(cuid(), side.userId, betId, "bet_won", payoutPerWinner, `Won bet: ${bet.title}`, timestamp);
      db.prepare("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)").run(cuid(), side.userId, timestamp);
      const profit = payoutPerWinner - side.stake;
      db.prepare("UPDATE UserStats SET wonBets = wonBets + 1, totalChipsWon = totalChipsWon + ?, currentStreak = currentStreak + 1, updatedAt = ? WHERE userId = ?").run(profit > 0 ? profit : 0, timestamp, side.userId);
      if (profit > 0) {
        const stats = db.prepare("SELECT biggestWin, longestStreak, currentStreak FROM UserStats WHERE userId = ?").get(side.userId) as any;
        if (stats && profit > stats.biggestWin) {
          db.prepare("UPDATE UserStats SET biggestWin = ? WHERE userId = ?").run(profit, side.userId);
        }
        if (stats && (stats.currentStreak + 1) > stats.longestStreak) {
          db.prepare("UPDATE UserStats SET longestStreak = currentStreak + 1 WHERE userId = ?").run(side.userId);
        }
      }
      db.prepare("INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', ?, ?, ?, 0, ?)").run(
        cuid(), side.userId, "You won! 🎉", `${bet.title} — you won ${payoutPerWinner} chips!`,
        JSON.stringify({ betId, circleId: bet.circleId }), timestamp
      );
    }

    for (const side of losers) {
      db.prepare("UPDATE BetSide SET status = 'lost' WHERE id = ?").run(side.id);
      db.prepare(TX_INSERT).run(cuid(), side.userId, betId, "bet_lost", 0, `Lost bet: ${bet.title}`, timestamp);
      db.prepare("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)").run(cuid(), side.userId, timestamp);
      db.prepare("UPDATE UserStats SET lostBets = lostBets + 1, totalChipsLost = totalChipsLost + ?, currentStreak = 0, updatedAt = ? WHERE userId = ?").run(side.stake, timestamp, side.userId);
      db.prepare("INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_resolved', 'Bet resolved', ?, ?, 0, ?)").run(
        cuid(), side.userId, `${bet.title} — better luck next time`,
        JSON.stringify({ betId, circleId: bet.circleId }), timestamp
      );
    }

    db.prepare("INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_resolved', ?, ?)").run(
      cuid(), bet.circleId, betId, auth.id,
      JSON.stringify({ betTitle: bet.title, winningOption, winnerCount, totalPot, payoutPerWinner }),
      timestamp
    );
  });

  const resolvedBet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  return NextResponse.json({ bet: { ...resolvedBet, options: JSON.parse(resolvedBet.options) } });
}
