import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { option } = await req.json();
  if (!option) return NextResponse.json({ error: "Option required" }, { status: 400 });

  const bet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });
  if (bet.resolution !== "pending") return NextResponse.json({ error: "Bet is already resolved" }, { status: 400 });

  const options = JSON.parse(bet.options) as string[];
  if (!options.includes(option)) return NextResponse.json({ error: "Invalid option" }, { status: 400 });

  const membership = one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const existing = one<any>("SELECT * FROM BetSide WHERE betId = ? AND userId = ?", [betId, auth.id]);
  if (existing) return NextResponse.json({ error: "Already joined this bet" }, { status: 400 });

  const user = one<any>("SELECT * FROM User WHERE id = ?", [auth.id]);
  if (!user || user.chips < bet.stake) return NextResponse.json({ error: "Not enough chips" }, { status: 400 });

  const sideId = cuid();
  const timestamp = now();

  transaction((db) => {
    db.prepare("INSERT INTO BetSide (id, betId, userId, option, stake, status, createdAt) VALUES (?, ?, ?, ?, ?, 'active', ?)").run(sideId, betId, auth.id, option, bet.stake, timestamp);
    db.prepare("UPDATE User SET chips = chips - ?, updatedAt = ? WHERE id = ?").run(bet.stake, timestamp, auth.id);
    db.prepare("UPDATE Bet SET totalPot = totalPot + ?, updatedAt = ? WHERE id = ?").run(bet.stake, timestamp, betId);
    db.prepare(`INSERT INTO \`Transaction\` (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, 'bet_placed', ?, ?, ?)`).run(cuid(), auth.id, betId, -bet.stake, `Joined bet: ${bet.title} (${option})`, timestamp);
    db.prepare("UPDATE CircleMember SET chips = chips - ? WHERE circleId = ? AND userId = ?").run(bet.stake, bet.circleId, auth.id);
    db.prepare("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)").run(cuid(), auth.id, timestamp);
    db.prepare("UPDATE UserStats SET totalBets = totalBets + 1, updatedAt = ? WHERE userId = ?").run(timestamp, auth.id);
    db.prepare("INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_joined', ?, ?)").run(cuid(), bet.circleId, betId, auth.id, JSON.stringify({ betTitle: bet.title, option, stake: bet.stake }), timestamp);
  });

  const side = one<any>("SELECT * FROM BetSide WHERE id = ?", [sideId]);
  const sideUser = one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);

  return NextResponse.json({ side: { ...side, user: sideUser } }, { status: 201 });
}
