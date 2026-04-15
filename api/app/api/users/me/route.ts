import { NextRequest, NextResponse } from "next/server";
import { one, all, run, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { getBalance } from "@/lib/wallet";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const user = await one<any>("SELECT id, email, name, username, image, createdAt, updatedAt FROM User WHERE id = ?", [auth.id]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [chips, stats, memberships, transactions] = await Promise.all([
    getBalance(auth.id, "CHIPS"),
    one<any>("SELECT * FROM UserStats WHERE userId = ?", [auth.id]),
    all<any>(
      "SELECT cm.*, c.id as circleId, c.name as circleName, c.emoji FROM CircleMember cm JOIN Circle c ON c.id = cm.circleId WHERE cm.userId = ?",
      [auth.id]
    ),
    // Show BOTH credits (user was the destination — grants, winnings,
    // refunds) and debits (user was the source — joining bets). `direction`
    // is 'credit' when chips came IN and 'debit' when they went OUT, and
    // `signedAmount` is positive/negative for direct display.
    all<{
      id: string;
      amount: number;
      signedAmount: number;
      direction: "credit" | "debit";
      currency: string;
      type: string;
      ref_type: string | null;
      ref_id: string | null;
      createdAt: string;
    }>(
      `SELECT id, amount, signedAmount, direction, currency, type, ref_type, ref_id, createdAt FROM (
        SELECT le.id, le.amount, le.amount AS signedAmount, 'credit' AS direction,
               le.currency, le.entry_type AS type, le.ref_type, le.ref_id,
               le.created_at AS createdAt
        FROM LedgerEntry le
        JOIN Wallet w ON w.id = le.to_wallet_id
        WHERE w.owner_type = 'user' AND w.owner_id = ?
        UNION ALL
        SELECT le.id, le.amount, -le.amount AS signedAmount, 'debit' AS direction,
               le.currency, le.entry_type AS type, le.ref_type, le.ref_id,
               le.created_at AS createdAt
        FROM LedgerEntry le
        JOIN Wallet w ON w.id = le.from_wallet_id
        WHERE w.owner_type = 'user' AND w.owner_id = ?
      )
      ORDER BY createdAt DESC
      LIMIT 20`,
      [auth.id, auth.id]
    ),
  ]);

  return NextResponse.json({
    user: {
      ...user,
      chips,
      stats,
      memberships: memberships.map((m: any) => ({
        ...m,
        circle: { id: m.circleId, name: m.circleName, emoji: m.emoji },
      })),
      transactions,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { name, username, image } = await req.json();

  if (username) {
    const existing = await one<any>("SELECT id FROM User WHERE username = ?", [username]);
    if (existing && existing.id !== auth.id) {
      return NextResponse.json({ error: "Username taken" }, { status: 400 });
    }
  }

  await run(
    "UPDATE User SET name = COALESCE(?, name), username = COALESCE(?, username), image = COALESCE(?, image), updatedAt = ? WHERE id = ?",
    [name?.trim() ?? null, username?.trim() ?? null, image ?? null, now(), auth.id]
  );

  const updatedUser = await one<any>("SELECT id, email, name, username, image, createdAt, updatedAt FROM User WHERE id = ?", [auth.id]);
  const chips = await getBalance(auth.id, "CHIPS");
  return NextResponse.json({ user: { ...updatedUser, chips } });
}
