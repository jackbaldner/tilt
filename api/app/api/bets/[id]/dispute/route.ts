import { NextRequest, NextResponse } from "next/server";
import { one, all, run, cuid, now } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { reason } = await req.json();
  if (!reason?.trim()) return NextResponse.json({ error: "Reason required" }, { status: 400 });

  const bet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });

  const membership = one<any>("SELECT * FROM CircleMember WHERE circleId = ? AND userId = ?", [bet.circleId, auth.id]);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const id = cuid();
  run("INSERT INTO Dispute (id, betId, raisedById, reason, votes, resolved, createdAt) VALUES (?, ?, ?, ?, '{}', 0, ?)",
    [id, betId, auth.id, reason.trim(), now()]);
  run("UPDATE Bet SET resolution = 'disputed', updatedAt = ? WHERE id = ?", [now(), betId]);

  return NextResponse.json({ dispute: one("SELECT * FROM Dispute WHERE id = ?", [id]) }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;
  const { id: betId } = await params;

  const { disputeId, vote } = await req.json();
  const dispute = one<any>("SELECT * FROM Dispute WHERE id = ?", [disputeId]);
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

  const votes = JSON.parse(dispute.votes);
  votes[auth.id] = vote;
  run("UPDATE Dispute SET votes = ? WHERE id = ?", [JSON.stringify(votes), disputeId]);

  // Check for majority
  const sides = all<any>("SELECT * FROM BetSide WHERE betId = ?", [betId]);
  const memberCount = sides.length;
  const voteValues = Object.values(votes) as string[];
  const voteCounts: Record<string, number> = {};
  for (const v of voteValues) voteCounts[v] = (voteCounts[v] ?? 0) + 1;
  const majority = Math.ceil(memberCount / 2);
  for (const [option, count] of Object.entries(voteCounts)) {
    if (count >= majority) {
      run("UPDATE Dispute SET resolved = 1, outcome = ? WHERE id = ?", [option, disputeId]);
      run("UPDATE Bet SET resolution = 'pending', updatedAt = ? WHERE id = ?", [now(), betId]);
      break;
    }
  }

  return NextResponse.json({ dispute: one("SELECT * FROM Dispute WHERE id = ?", [disputeId]) });
}
