import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now, transaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { circleId, title, description, type, stake, options, resolveAt, aiResolvable } = await req.json();

  if (!circleId || !title || !type || !stake || !options?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const user = await one<any>("SELECT * FROM User WHERE id = ?", [auth.id]);
  if (!user || user.chips < stake) {
    return NextResponse.json({ error: "Not enough chips" }, { status: 400 });
  }

  const betId = cuid();
  const sideId = cuid();
  const timestamp = now();

  await transaction((db) => {
    db.run(
      `INSERT INTO Bet (id, circleId, proposerId, title, description, type, stake, options, resolveAt, resolution, aiResolvable, totalPot, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [betId, circleId, auth.id, title.trim(), description?.trim() ?? null,
       type, stake, JSON.stringify(options), resolveAt ? new Date(resolveAt).toISOString() : null,
       aiResolvable ? 1 : 0, stake, timestamp, timestamp]
    );
    db.run(`INSERT INTO BetSide (id, betId, userId, option, stake, status, createdAt) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [sideId, betId, auth.id, options[0], stake, timestamp]);
    db.run("UPDATE User SET chips = chips - ?, updatedAt = ? WHERE id = ?", [stake, timestamp, auth.id]);
    db.run(
      `INSERT INTO "Transaction" (id, userId, betId, type, amount, description, createdAt) VALUES (?, ?, ?, 'bet_placed', ?, ?, ?)`,
      [cuid(), auth.id, betId, -stake, `Placed bet: ${title}`, timestamp]
    );
    db.run("UPDATE CircleMember SET chips = chips - ? WHERE circleId = ? AND userId = ?", [stake, circleId, auth.id]);
    db.run("INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)", [cuid(), auth.id, timestamp]);
    db.run("UPDATE UserStats SET totalBets = totalBets + 1, updatedAt = ? WHERE userId = ?", [timestamp, auth.id]);
    db.run("INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_created', ?, ?)",
      [cuid(), circleId, betId, auth.id, JSON.stringify({ betTitle: title, stake, type }), timestamp]);
  });

  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  const sides = await all<any>(
    "SELECT bs.*, u.name as userName, u.image as userImage FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId = ?",
    [betId]
  );
  const proposer = await one<any>("SELECT id, name, image FROM User WHERE id = ?", [auth.id]);

  return NextResponse.json({
    bet: {
      ...bet,
      options: JSON.parse(bet.options),
      proposer,
      sides: sides.map((s: any) => ({ ...s, user: { id: s.userId, name: s.userName, image: s.userImage } })),
    },
  }, { status: 201 });
}
