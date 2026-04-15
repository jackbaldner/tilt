import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now, interactiveTransaction } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { ensureFriendshipTable } from "@/lib/ensure-tables";
import { sendBetChallengeEmail } from "@/lib/email";
import { joinBetInTx, InsufficientFundsError } from "@/lib/wallet";

// GET /api/bets — list bets for the current user (all bets they have a side in)
export async function GET(req: NextRequest) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const bets = await all<any>(
    `SELECT DISTINCT b.*, u.id as proposerId, u.name as proposerName, u.image as proposerImage,
            c.id as circleId, c.name as circleName, c.emoji as circleEmoji
     FROM Bet b
     JOIN User u ON u.id = b.proposerId
     LEFT JOIN Circle c ON c.id = b.circleId
     JOIN BetSide bs ON bs.betId = b.id AND bs.userId = ?
     ORDER BY b.createdAt DESC
     LIMIT 50`,
    [auth.id]
  );

  const betIds = bets.map((b: any) => b.id);
  let sides: any[] = [];
  if (betIds.length > 0) {
    const sidePlaceholders = betIds.map(() => "?").join(",");
    sides = await all<any>(
      `SELECT bs.*, u.name as userName FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId IN (${sidePlaceholders})`,
      betIds
    );
  }

  const sidesByBet: Record<string, any[]> = {};
  for (const s of sides) {
    if (!sidesByBet[s.betId]) sidesByBet[s.betId] = [];
    sidesByBet[s.betId].push(s);
  }

  return NextResponse.json({
    bets: bets.map((b: any) => ({
      ...b,
      options: JSON.parse(b.options),
      proposer: { id: b.proposerId, name: b.proposerName, image: b.proposerImage },
      circle: b.circleId ? { id: b.circleId, name: b.circleName, emoji: b.circleEmoji } : null,
      sides: (sidesByBet[b.id] ?? []).map((s: any) => ({ ...s, userName: s.userName })),
    })),
  });
}

export async function POST(req: NextRequest) {
  await ensureFriendshipTable();
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const {
    circleId,
    challengedUserId,
    title,
    description,
    type,
    stake: rawStake,
    options,
    proposerOption,
    resolveAt,
    aiResolvable,
  } = body;

  // --- Input validation ---
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
  if (!Array.isArray(options) || options.length < 2) {
    return NextResponse.json({ error: "At least two options are required" }, { status: 400 });
  }
  if (!proposerOption) {
    return NextResponse.json({ error: "proposerOption is required" }, { status: 400 });
  }
  if (!options.includes(proposerOption)) {
    return NextResponse.json({ error: "proposerOption must be one of the options" }, { status: 400 });
  }

  const stake = Number(rawStake);
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isInteger(stake)) {
    return NextResponse.json({ error: "Stake must be a positive integer" }, { status: 400 });
  }

  // If a circle is specified, verify membership (outside the tx — it's a read)
  if (circleId) {
    const membership = await one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [circleId, auth.id]);
    if (!membership) return NextResponse.json({ error: "Not a circle member" }, { status: 403 });
  }

  const betId = cuid();
  const timestamp = now();
  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;

  // --- Atomic creation: Bet + BetSide + wallet transfer + activity + stats
  // ALL happen in one interactive transaction. If joinBetInTx fails with
  // insufficient funds or any other error, the entire transaction rolls
  // back and nothing is persisted.
  try {
    await interactiveTransaction(async (tx) => {
      // 1. Insert the Bet row itself.
      await tx.run(
        `INSERT INTO Bet (id, circleId, proposerId, title, description, type, stake, options, resolveAt, resolution, aiResolvable, totalPot, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          betId,
          circleId ?? null,
          auth.id,
          title.trim(),
          description?.trim() ?? null,
          type,
          stake,
          JSON.stringify(options),
          resolveAt ? new Date(resolveAt).toISOString() : null,
          aiResolvable ? 1 : 0,
          stake, // totalPot starts at the proposer's stake since they're joining in the same tx
          timestamp,
          timestamp,
        ]
      );

      // 2. Join the proposer as the first side. This debits their wallet
      //    and inserts the BetSide row — if they don't have enough chips,
      //    this throws InsufficientFundsError and rolls back the Bet insert.
      await joinBetInTx(tx, {
        betId,
        userId: auth.id,
        option: proposerOption,
        stake,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:proposer` : undefined,
      });

      // 3. Activity feed entry (only for circle bets).
      if (circleId) {
        await tx.run(
          "INSERT INTO Activity (id, circleId, betId, userId, type, data, createdAt) VALUES (?, ?, ?, ?, 'bet_created', ?, ?)",
          [cuid(), circleId, betId, auth.id, JSON.stringify({ betTitle: title.trim(), stake, type, proposerOption }), timestamp]
        );
      }

      // 4. Stats bump — totalBets for the proposer. Ensure row exists first.
      await tx.run(
        `INSERT OR IGNORE INTO UserStats (id, userId, totalBets, wonBets, lostBets, totalChipsWon, totalChipsLost, biggestWin, currentStreak, longestStreak, updatedAt)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)`,
        [cuid(), auth.id, timestamp]
      );
      await tx.run(
        "UPDATE UserStats SET totalBets = totalBets + 1, updatedAt = ? WHERE userId = ?",
        [timestamp, auth.id]
      );
    });
  } catch (err: unknown) {
    if (err instanceof InsufficientFundsError) {
      return NextResponse.json({ error: "Not enough chips to cover your stake" }, { status: 400 });
    }
    console.error("Bet creation failed:", err);
    const msg = err instanceof Error ? err.message : "Failed to create bet";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // --- Fire-and-forget side-effects after commit ---
  const bet = await one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  const betSides = await all<any>(
    "SELECT bs.*, u.name as userName, u.image as userImage FROM BetSide bs JOIN User u ON u.id = bs.userId WHERE bs.betId = ?",
    [betId]
  );
  const proposer = await one<any>("SELECT id, name, username, image FROM User WHERE id = ?", [auth.id]);

  // Determine who to notify: explicit challengedUserId, or the other member of a private 1:1 circle
  let notifyUserId: string | null = challengedUserId ?? null;
  if (!notifyUserId && circleId) {
    const circle = await one<any>("SELECT name FROM Circle WHERE id = ?", [circleId]);
    if (circle?.name?.startsWith("__private__")) {
      const otherMember = await one<any>(
        "SELECT userId FROM CircleMember WHERE circleId = ? AND userId != ?",
        [circleId, auth.id]
      );
      notifyUserId = otherMember?.userId ?? null;
    }
  }

  if (notifyUserId) {
    const challenged = await one<any>("SELECT id, name, email FROM User WHERE id = ?", [notifyUserId]);
    if (challenged?.email) {
      const proposerName = proposer?.username ?? proposer?.name ?? "Someone";
      // In-app notification (fire and forget — best effort, not part of atomic creation)
      run(
        "INSERT INTO Notification (id, userId, type, title, body, data, read, createdAt) VALUES (?, ?, 'bet_challenge', ?, ?, ?, 0, ?)",
        [
          cuid(),
          notifyUserId,
          `${proposerName} challenged you`,
          `${title.trim()} · ${stake} chips`,
          JSON.stringify({ betId }),
          now(),
        ]
      ).catch((e) => console.error("Failed to insert notification:", e));
      // Email notification (fire and forget)
      sendBetChallengeEmail({
        toEmail: challenged.email,
        toName: challenged.name ?? "",
        fromName: proposerName,
        betTitle: title.trim(),
        stake,
        betId,
      });
    }
  }

  return NextResponse.json(
    {
      bet: {
        ...bet,
        options: JSON.parse(bet.options),
        proposer,
        sides: betSides.map((s: any) => ({ ...s, user: { id: s.userId, name: s.userName, image: s.userImage } })),
      },
    },
    { status: 201 }
  );
}
