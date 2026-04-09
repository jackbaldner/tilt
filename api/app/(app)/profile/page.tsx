"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, useApiClient } from "@/app/providers";

interface UserStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  totalChipsWon: number;
  totalChipsLost: number;
  biggestWin: number;
  currentStreak: number;
  longestStreak: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface ProfileData {
  id: string;
  email: string;
  name?: string;
  image?: string;
  chips: number;
  stats?: UserStats;
  recentTransactions?: Transaction[];
}

function FlameIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.88 1.58-5.42 4-6.9V10c0 .55.45 1 1 1s1-.45 1-1V5.14C10.6 4.43 11.28 4 12 4c1.88 0 3.46 1.17 4.11 2.83C17.3 5.72 18 4.43 18 3c2 2.07 3 4.5 3 7 0 4.42-4.03 8-9 8z" />
    </svg>
  );
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { authFetch } = useApiClient();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch("/api/users/me");
    if (res.ok) {
      const data = await res.json();
      setProfile(data.user ?? data);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
    refreshUser();
  }, [load, refreshUser]);

  async function saveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    const res = await authFetch("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data.user ?? data);
      await refreshUser();
      setEditing(false);
    }
    setSaving(false);
  }

  const stats = profile?.stats;
  const winRate = stats && stats.totalBets > 0
    ? Math.round((stats.wonBets / stats.totalBets) * 100)
    : 0;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <h1 className="text-xl font-bold text-text mb-5">Profile</h1>

      {/* Avatar + name */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-2xl font-bold text-accent flex-shrink-0">
            {(profile?.name ?? user?.name ?? "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  autoFocus
                  className="flex-1 bg-surface border border-accent rounded-xl px-3 py-1.5 text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button
                  onClick={saveName}
                  disabled={saving}
                  className="px-3 py-1.5 bg-accent text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-accent-2 transition-colors"
                >
                  {saving ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-2 py-1.5 text-muted text-sm hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-text text-lg truncate">
                  {profile?.name ?? user?.name ?? "Unknown"}
                </p>
                <button
                  onClick={() => { setEditing(true); setNameInput(profile?.name ?? user?.name ?? ""); }}
                  className="text-subtle hover:text-muted text-xs transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
            <p className="text-muted text-sm truncate">{profile?.email ?? user?.email}</p>
          </div>
        </div>

        {/* Chips balance */}
        <div className="bg-accent/5 border border-accent/15 rounded-xl p-3 flex items-center justify-between">
          <p className="text-sm text-muted font-medium">Chip balance</p>
          <p className="text-xl font-bold text-text">
            {(profile?.chips ?? user?.chips ?? 0).toLocaleString()}
            <span className="text-muted text-sm font-normal ml-1">chips</span>
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="text-sm font-semibold text-text mb-3">Stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total bets" value={stats.totalBets} />
            <StatCard label="Win rate" value={`${winRate}%`} highlight={winRate >= 50} />
            <StatCard label="Won" value={stats.wonBets} highlight />
            <StatCard label="Lost" value={stats.lostBets} />
            <StatCard label="Biggest win" value={`${stats.biggestWin.toLocaleString()} chips`} highlight={stats.biggestWin > 0} />
            <StatCard label="Best streak" value={`${stats.longestStreak}W`} highlight={stats.longestStreak > 0} />
          </div>
          {stats.currentStreak > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-pending font-medium">
              <FlameIcon />
              {stats.currentStreak} win streak
            </div>
          )}
        </div>
      )}

      {/* Recent transactions */}
      {profile?.recentTransactions && profile.recentTransactions.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
          <h2 className="text-sm font-semibold text-text mb-3">Recent activity</h2>
          <div className="space-y-3">
            {profile.recentTransactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between">
                <p className="text-sm text-muted truncate flex-1 pr-2">{tx.description}</p>
                <p className={`text-sm font-semibold flex-shrink-0 ${tx.amount > 0 ? "text-win" : tx.amount < 0 ? "text-loss" : "text-subtle"}`}>
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={logout}
        className="w-full py-3 rounded-xl border border-border text-muted hover:text-loss hover:border-loss/30 transition-colors text-sm font-medium"
      >
        Sign out
      </button>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <p className="text-xs text-subtle mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-accent" : "text-text"}`}>{value}</p>
    </div>
  );
}
