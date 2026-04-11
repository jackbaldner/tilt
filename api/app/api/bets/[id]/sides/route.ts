import { NextRequest, NextResponse } from "next/server";
import { one, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { sendBetJoinedEmail } from "@/lib/email";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { option } = await req.json();
  if (!option) return NextResponse.json({ error: "Option required" }, { status: 400 });

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") return NextResponse.json({ error: "Bet is already resolved" }, { status: 400 });

  const options = JSON.parse(bet.options) as string[];
  if (!options.includes(option)) return NextResponse.json({ error: "Invalid option" }, { status: 400 });

  // For circle bets, verify membership. For circle-less bets, anyone can join (by link/invite).
  if (bet.circleId) {
    const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
    if (!membership) return NextResponse.json({ error: "Not a circle member" }, { status: 403 });
  }

  const existing = await one<any>("SELECT * FROM BetSide WHERE betId = ? AND userId = ?", [betId, auth.id]);
  if (existing) return NextResponse.json({ error: "Already joined this bet" }, { status: 400 });

  // Prevent a third person from joining a 1:1 bet that already has 2 sides
  const sideCount = await one<any>("SELECT COUNT(*) as n FROM BetSide WHERE betId = ?", [betId]);
  if ((sideCount?.n ?? 0) >= 2) return NextResponse.json({ error: "Bet is full" }, { status: 400 });

  const user = await one<any>("SELECT * FROM User WHERE id = ?", [auth.id]);
  if (!user || user.chips < bet.stake) return NextResponse.json({ error: "Not enough chips" }, { status: 400 });

  const sideId = cuid();
  const timestamp = now();

  await transaction((db) => {
    db.run(
      "INSERT INTO BetSide (id, betId, userId, option, stake, status, createdAt) VALUES (?, ?, ?, ?, ?, 'active', ?)",
      [sideId, betId, auth.id, option, bet.stake, timestamp]
    );
    db.run("UPDATE User SET chips = chips - ?, updatedAt = ? WHERE id = ?", [bet.stake, timestamp, auth.id]);
    db.run("UPDATE Bet SET totalPot = totalPot + ?, updatedAt = ? WHERE id = ?", [bet.stake, timestamp, betId]);
    db.run(
      `INSERT INTO "Transaction" (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, 'bet_placed', ?, ?, ?)`,
      [cuid(), auth.id, betId, -bet.stake, `Joined bet: ${bet.title} (${option})`, timestamp]
    );
    if (bet.circleId) {
      db.run("UPDATE CircleMember SET chips = chips - ? WHERE circleId = ? AND userId = ?", [bet.stake, bet.circleId, auth.id]);
      db.run(
        "INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_joined', ?, ?)",
        [cuid(), bet.circleId, betId, auth.id, JSON.stringify({ betTitle: bet.title, option, stake: bet.stake }), timestamp]
      );
    }
    db.run(
      "INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)",
      [cuid(), auth.id, timestamp]
    );
    db.run("UPDATE UserStats SET totalBets = totalBets + 1, updatedAt = ? WHERE userId = ?", [timestamp, auth.id]);

    // In-app notification for the proposer
    db.run(
      "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_joined', ?, ?, ?, 0, ?)",
      [cuid(), bet.proposerId,
       `${user.username ?? user.name ?? "Someone"} accepted your bet`,
       bet.title,
       JSON.stringify({ betId }), timestamp]
    );
  });

  // Email the proposer (fire and forget)
  const proposer = await one<any>("SELECT name, email FROM User WHERE id = ?", [bet.proposerId]);
  if (proposer?.email) {
    sendBetJoinedEmail({
      toEmail: proposer.email,
      toName: proposer.name ?? "",
      joinerName: user.username ?? user.name ?? "Someone",
      betTitle: bet.title,
      stake: bet.stake,
      betId,
    });
  }

  const side = await one<any>("SELECT * FROM BetSide WHERE id = ?", [sideId]);
  const sideUser = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);

  return NextResponse.json({ side: { ...side, user: sideUser } }, { status: 201 });
}
