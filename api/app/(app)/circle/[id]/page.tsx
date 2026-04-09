"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useApiClient } from "@/app/providers";

interface CircleUser {
  id: string;
  name: string;
  image?: string;
  chips?: number;
}

interface CircleMember {
  userId: string;
  role: string;
  chips: number;
  joinedAt: string;
  user: CircleUser;
}

interface Circle {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  theme: string;
  ownerId: string;
  inviteCode?: string;
  owner: CircleUser;
  members: CircleMember[];
  _count: { bets: number; members: number };
}

interface Bet {
  id: string;
  title: string;
  stake: number;
  totalPot: number;
  resolution: string;
  resolvedOption?: string;
  createdAt: string;
  proposer: CircleUser;
  sides: Array<{ userId: string; option: string; status: string }>;
  options: string[];
}

type Tab = "bets" | "leaderboard";

function Avatar({ user, size = "md" }: { user: CircleUser; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-11 h-11 text-base" };
  if (user.image) {
    return <img src={user.image} alt={user.name} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent flex-shrink-0`}>
      {user.name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm font-bold text-amber-500">1</span>;
  if (rank === 2) return <span className="text-sm font-bold text-slate-400">2</span>;
  if (rank === 3) return <span className="text-sm font-bold text-amber-700">3</span>;
  return <span className="text-xs text-subtle">{rank}</span>;
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export default function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: circleId } = use(params);
  const { user } = useAuth();
  const { authFetch } = useApiClient();
  const router = useRouter();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("bets");
  const [inviteUrl, setInviteUrl] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  const load = useCallback(async () => {
    const [circleRes, betsRes] = await Promise.all([
      authFetch(`/api/circles/${circleId}`),
      authFetch(`/api/circles/${circleId}/bets`),
    ]);
    if (circleRes.ok) {
      const data = await circleRes.json();
      setCircle(data.circle);
    }
    if (betsRes.ok) {
      const data = await betsRes.json();
      setBets(data.bets ?? data);
    }
    setLoading(false);
  }, [circleId, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function getInviteLink() {
    if (inviteUrl) {
      copy(inviteUrl);
      return;
    }
    const res = await authFetch(`/api/circles/${circleId}/invite`);
    if (res.ok) {
      const data = await res.json();
      const url = `${window.location.origin}/invite/${data.inviteCode}`;
      setInviteUrl(url);
      copy(url);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setShareMsg("Copied!");
      setTimeout(() => setShareMsg(""), 2000);
    });
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8">
        <div className="bg-surface border border-border rounded-2xl h-32 animate-pulse mb-4" />
        <div className="bg-surface border border-border rounded-2xl h-48 animate-pulse" />
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center">
        <p className="text-muted">Circle not found.</p>
        <Link href="/dashboard" className="text-accent text-sm mt-2 block hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  const activeBets = bets.filter((b) => b.resolution === "pending");
  const resolvedBets = bets.filter((b) => b.resolution === "resolved");
  const sortedMembers = [...circle.members].sort((a, b) => b.chips - a.chips);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted hover:text-text mb-4 transition-colors text-sm"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Circle header */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl mb-2">{circle.emoji}</div>
            <h1 className="text-xl font-bold text-text">{circle.name}</h1>
            {circle.description && (
              <p className="text-muted text-sm mt-1">{circle.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-subtle">
              <span>{circle._count.members} members</span>
              <span>·</span>
              <span>{circle._count.bets} bets</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href={`/bet/new?circleId=${circleId}`}
              className="text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-3 py-2 rounded-xl transition-colors text-center whitespace-nowrap shadow-sm"
            >
              + Bet
            </Link>
            <button
              onClick={getInviteLink}
              className="flex items-center gap-1.5 text-sm text-muted bg-surface border border-border hover:border-border-2 px-3 py-2 rounded-xl transition-colors"
            >
              <ShareIcon />
              {shareMsg || "Invite"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface border border-border rounded-xl p-1 mb-4">
        {(["bets", "leaderboard"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${
              tab === t ? "bg-white text-text shadow-sm border border-border" : "text-subtle hover:text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Bets tab */}
      {tab === "bets" && (
        <div className="space-y-3">
          {activeBets.length === 0 && resolvedBets.length === 0 && (
            <div className="bg-surface border border-dashed border-border-2 rounded-2xl p-6 text-center">
              <p className="text-muted text-sm">No bets yet in this circle.</p>
              <Link href={`/bet/new?circleId=${circleId}`} className="text-accent text-sm hover:underline mt-1 block">
                Create the first bet
              </Link>
            </div>
          )}

          {activeBets.length > 0 && (
            <>
              <p className="text-xs text-subtle font-medium uppercase tracking-wide px-1">Active</p>
              {activeBets.map((bet) => (
                <BetRow key={bet.id} bet={bet} userId={user?.id ?? ""} />
              ))}
            </>
          )}

          {resolvedBets.length > 0 && (
            <>
              <p className="text-xs text-subtle font-medium uppercase tracking-wide px-1 mt-4">Past</p>
              {resolvedBets.slice(0, 10).map((bet) => (
                <BetRow key={bet.id} bet={bet} userId={user?.id ?? ""} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Leaderboard tab */}
      {tab === "leaderboard" && (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          {sortedMembers.map((m, i) => {
            const isMe = m.userId === user?.id;
            return (
              <div
                key={m.userId}
                className={`flex items-center gap-3 px-4 py-3.5 ${i !== 0 ? "border-t border-border" : ""} ${isMe ? "bg-accent/5" : ""}`}
              >
                <div className="w-7 text-center flex items-center justify-center">
                  <RankBadge rank={i + 1} />
                </div>
                <Avatar user={m.user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-medium truncate">
                    {isMe ? "You" : m.user.name}
                  </p>
                  <p className="text-subtle text-xs capitalize">{m.role}</p>
                </div>
                <div className="text-right">
                  <p className="text-text text-sm font-bold">{m.chips.toLocaleString()}</p>
                  <p className="text-subtle text-xs">chips</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BetRow({ bet, userId }: { bet: Bet; userId: string }) {
  const mySide = bet.sides.find((s) => s.userId === userId);
  const isResolved = bet.resolution === "resolved";
  const isWaiting = !isResolved && bet.sides.length < 2;

  return (
    <Link href={`/bet/${bet.id}`} className="block">
      <div className="bg-white border border-border rounded-2xl p-4 hover:border-border-2 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-text text-sm font-semibold leading-snug line-clamp-2 flex-1">{bet.title}</p>
          {isResolved ? (
            mySide ? (
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium border ${mySide.status === "won" ? "bg-win/10 text-win border-win/20" : "bg-loss/10 text-loss border-loss/20"}`}>
                {mySide.status === "won" ? "Won" : "Lost"}
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-border flex-shrink-0">Done</span>
            )
          ) : isWaiting ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-pending/10 text-pending border border-pending/20 flex-shrink-0">Open</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex-shrink-0">Live</span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-subtle">
          <div className="flex items-center gap-2">
            <span>{bet.proposer.name}</span>
            {bet.sides.length > 0 && <span>· {bet.sides.length} joined</span>}
          </div>
          <span className="font-medium text-text">{bet.totalPot.toLocaleString()} chips</span>
        </div>
      </div>
    </Link>
  );
}
