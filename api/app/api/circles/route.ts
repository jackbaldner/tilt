import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";
import { getBalance } from "@/lib/wallet";
import { isPrivateCircleName } from "@/lib/circleDisplay";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const circles = await all<any>(
    `SELECT c.*, u.name as ownerName, u.image as ownerImage,
     (SELECT COUNT(*) FROM CircleMember cm2 WHERE cm2.circleId = c.id) as memberCount,
     (SELECT COUNT(*) FROM Bet b WHERE b.circleId = c.id) as betCount
     FROM Circle c
     JOIN CircleMember cm ON cm.circleId = c.id
     JOIN User u ON u.id = c.ownerId
     WHERE cm.userId = ?
     ORDER BY c.updatedAt DESC`,
    [auth.id]
  );

  // Private circles (1:1 friend-challenge containers) are plumbing, not
  // user-facing circles. Exclude them from the list entirely — the friend
  // challenge UI surfaces these as "Challenge from X" cards elsewhere,
  // not as circles in the "Your circles" list.
  const visibleCircles = circles.filter(
    (c: any) => !isPrivateCircleName(c.name)
  );

  const enriched = await Promise.all(visibleCircles.map(async (c: any) => {
    const members = await all<any>(
      `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage
       FROM CircleMember cm JOIN User u ON u.id = cm.userId
       WHERE cm.circleId = ? ORDER BY cm.joinedAt ASC`,
      [c.id]
    );
    const memberBalances = await Promise.all(members.map((m: any) => getBalance(m.userId, "CHIPS")));
    return {
      ...c,
      owner: { id: c.ownerId, name: c.ownerName, image: c.ownerImage },
      members: members.map((m: any, i: number) => ({
        ...m,
        chips: memberBalances[i],
        user: { id: m.userId, name: m.userName, image: m.userImage, chips: memberBalances[i] },
      })),
      _count: { bets: c.betCount },
    };
  }));

  return NextResponse.json({ circles: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { name, description, emoji } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = cuid();
  const inviteCode = cuid();
  const memberId = cuid();
  const timestamp = now();

  await run(
    `INSERT INTO Circle (id, name, description, emoji, inviteCode, ownerId, isPremium, theme, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, 'emerald', ?, ?)`,
    [id, name.trim(), description?.trim() ?? null, emoji ?? "🎯", inviteCode, auth.id, timestamp, timestamp]
  );
  await run(
    `INSERT INTO CircleMember (id, circleId, userId, role, joinedAt) VALUES (?, ?, ?, 'owner', ?)`,
    [memberId, id, auth.id, timestamp]
  );
  await run(
    `INSERT INTO Activity (id, circleId, userId, type, data, createdAt) VALUES (?, ?, ?, 'circle_created', ?, ?)`,
    [cuid(), id, auth.id, JSON.stringify({ circleName: name.trim() }), timestamp]
  );

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [id]);
  const members = await all<any>(
    `SELECT cm.*, u.id as userId, u.name as userName, u.image as userImage FROM CircleMember cm JOIN User u ON u.id = cm.userId WHERE cm.circleId = ?`,
    [id]
  );
  const memberBalances = await Promise.all(members.map((m: any) => getBalance(m.userId, "CHIPS")));

  return NextResponse.json({
    circle: {
      ...circle,
      members: members.map((m: any, i: number) => ({
        ...m,
        chips: memberBalances[i],
        user: { id: m.userId, name: m.userName, image: m.userImage, chips: memberBalances[i] },
      })),
    },
  }, { status: 201 });
}
