"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth, useApiClient } from "@/app/providers";

interface Bet {
  id: string;
  title: string;
  description?: string;
  stake: number;
  totalPot: number;
  resolution: string;
  resolvedOption?: string;
  createdAt: string;
  resolveAt?: string;
  circle?: { id: string; name: string; emoji: string };
  proposer?: { id: string; name: string };
  sides: Array<{ userId: string; option: string; status: string; userName?: string }>;
  options: string[];
}

interface Circle {
  id: string;
  name: string;
  emoji: string;
  theme: string;
  _memberCount?: number;
  _activeBets?: number;
  myChips?: number;
}

function BetStatusBadge({ bet, userId }: { bet: Bet; userId: string }) {
  const mySide = bet.sides.find((s) => s.userId === userId);
  if (bet.resolution === "resolved") {
    if (!mySide) return <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-border">Resolved</span>;
    const won = mySide.status === "won";
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${won ? "bg-win/10 text-win border border-win/20" : "bg-loss/10 text-loss border border-loss/20"}`}>
        {won ? "Won" : "Lost"}
      </span>
    );
  }
  const sideCount = bet.sides.length;
  if (sideCount < 2) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-pending/10 text-pending border border-pending/20">Open</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">Live</span>;
}

function BetCard({ bet, userId }: { bet: Bet; userId: string }) {
  const mySide = bet.sides.find((s) => s.userId === userId);
  const otherSides = bet.sides.filter((s) => s.userId !== userId);

  return (
    <Link href={`/bet/${bet.id}`} className="block">
      <div className="bg-white border border-border rounded-2xl p-4 hover:border-border-2 hover:shadow-sm transition-all active:scale-[0.98]">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-text text-sm leading-tight line-clamp-2">{bet.title}</p>
            {bet.circle && (
              <p className="text-xs text-subtle mt-1">
                {bet.circle.emoji} {bet.circle.name}
              </p>
            )}
          </div>
          <BetStatusBadge bet={bet} userId={userId} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {mySide && (
              <div className="text-xs">
                <span className="text-subtle">You: </span>
                <span className="text-text font-medium">{mySide.option}</span>
              </div>
            )}
            {otherSides[0] && (
              <div className="text-xs">
                <span className="text-subtle">vs </span>
                <span className="text-muted">{otherSides[0].userName ?? "..."}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-text">{bet.totalPot.toLocaleString()} <span className="text-subtle font-normal text-xs">chips</span></p>
            <p className="text-xs text-subtle">pot</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CircleCard({ circle }: { circle: Circle }) {
  return (
    <Link href={`/circle/${circle.id}`} className="block">
      <div className="bg-white border border-border rounded-2xl p-4 hover:border-border-2 hover:shadow-sm transition-all active:scale-[0.98] min-w-[160px]">
        <div className="text-xl mb-2">{circle.emoji}</div>
        <p className="font-semibold text-text text-sm leading-tight">{circle.name}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-subtle">
          {circle._memberCount != null && <span>{circle._memberCount} members</span>}
          {circle._activeBets != null && <span>{circle._activeBets} active</span>}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const { authFetch } = useApiClient();

  const [bets, setBets] = useState<Bet[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [newCircleEmoji, setNewCircleEmoji] = useState("");
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [betsRes, circlesRes] = await Promise.all([
        authFetch("/api/bets"),
        authFetch("/api/circles"),
      ]);
      if (betsRes.ok) {
        const data = await betsRes.json();
        setBets(data.bets ?? data);
      }
      if (circlesRes.ok) {
        const data = await circlesRes.json();
        setCircles(data.circles ?? data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadData();
    refreshUser();
  }, [loadData, refreshUser]);

  async function createCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!newCircleName.trim()) return;
    setCreating(true);
    const res = await authFetch("/api/circles", {
      method: "POST",
      body: JSON.stringify({ name: newCircleName.trim(), emoji: newCircleEmoji || "⚡" }),
    });
    if (res.ok) {
      const data = await res.json();
      setCircles((prev) => [data.circle ?? data, ...prev]);
      setShowCreateCircle(false);
      setNewCircleName("");
      setNewCircleEmoji("");
    }
    setCreating(false);
  }

  const activeBets = bets.filter((b) => b.resolution !== "resolved");
  const pastBets = bets.filter((b) => b.resolution === "resolved").slice(0, 5);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">
            Hey, {user?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-muted text-sm mt-0.5">
            <span className="text-accent font-semibold">{user?.chips?.toLocaleString()}</span>{" "}
            chips available
          </p>
        </div>
        <Link
          href="/bet/new"
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Bet
        </Link>
      </div>

      {/* Circles */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text">Your circles</h2>
          <button
            onClick={() => setShowCreateCircle(!showCreateCircle)}
            className="text-xs text-accent hover:text-accent-2 font-medium"
          >
            + New circle
          </button>
        </div>

        {showCreateCircle && (
          <form onSubmit={createCircle} className="bg-white border border-border rounded-2xl p-4 mb-3 shadow-sm">
            <p className="text-sm font-medium text-text mb-3">Create a circle</p>
            <div className="flex gap-2 mb-3">
              <input
                value={newCircleEmoji}
                onChange={(e) => setNewCircleEmoji(e.target.value)}
                className="w-12 bg-surface border border-border rounded-xl px-2 py-2 text-center text-lg focus:outline-none focus:border-accent"
                maxLength={2}
                placeholder="⚡"
              />
              <input
                value={newCircleName}
                onChange={(e) => setNewCircleName(e.target.value)}
                placeholder="Circle name (e.g. Work Guys)"
                autoFocus
                className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-text text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreateCircle(false)}
                className="flex-1 text-sm text-muted py-2 rounded-xl border border-border hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newCircleName.trim()}
                className="flex-1 text-sm font-semibold text-white bg-accent py-2 rounded-xl disabled:opacity-40 hover:bg-accent-2 transition-colors"
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        {circles.length === 0 && !loading ? (
          <div className="bg-surface border border-dashed border-border-2 rounded-2xl p-6 text-center">
            <p className="text-muted text-sm">No circles yet.</p>
            <p className="text-subtle text-xs mt-1">Create one to start betting with friends.</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {circles.map((c) => (
              <CircleCard key={c.id} circle={c} />
            ))}
          </div>
        )}
      </section>

      {/* Active Bets */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-text mb-3">
          Active bets{activeBets.length > 0 && <span className="text-subtle font-normal text-sm ml-1">({activeBets.length})</span>}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : activeBets.length === 0 ? (
          <div className="bg-surface border border-dashed border-border-2 rounded-2xl p-6 text-center">
            <p className="text-muted text-sm">No active bets.</p>
            <Link href="/bet/new" className="text-accent text-sm hover:underline mt-1 block">
              Create your first bet
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} userId={user!.id} />
            ))}
          </div>
        )}
      </section>

      {/* Past Bets */}
      {pastBets.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-text mb-3">Recent results</h2>
          <div className="space-y-3">
            {pastBets.map((bet) => (
              <BetCard key={bet.id} bet={bet} userId={user!.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
