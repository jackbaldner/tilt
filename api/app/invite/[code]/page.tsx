"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useApiClient } from "@/app/providers";

interface CirclePreview {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  owner: { id: string; name: string };
  memberCount: number;
  betCount: number;
}

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { authFetch } = useApiClient();
  const router = useRouter();

  const [circle, setCircle] = useState<CirclePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/circles/join/${code}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setCircle(data.circle);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [code]);

  async function join() {
    if (!user) {
      // Store invite code and redirect to login
      sessionStorage.setItem("pendingInvite", code);
      router.push("/");
      return;
    }
    setJoining(true);
    setError("");
    const res = await authFetch(`/api/circles/join/${code}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to join");
      setJoining(false);
      return;
    }
    router.push(`/circle/${data.circle.id}`);
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !circle) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 text-center">
        <p className="text-3xl mb-3">🔗</p>
        <h1 className="text-xl font-bold text-text mb-2">Invalid invite link</h1>
        <p className="text-muted text-sm mb-6">This invite link is no longer valid.</p>
        <a href="/dashboard" className="text-accent hover:underline text-sm">Go to dashboard</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-20"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% -20%, #8b5cf630, transparent)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-2xl font-bold text-text">🎲 Tilt</span>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl text-center">
          <div className="text-4xl mb-3">{circle.emoji}</div>
          <h1 className="text-2xl font-bold text-text mb-1">{circle.name}</h1>
          {circle.description && (
            <p className="text-muted text-sm mb-2">{circle.description}</p>
          )}
          <p className="text-subtle text-xs mb-4">
            Created by {circle.owner.name} · {circle.memberCount} members · {circle.betCount} bets
          </p>

          <div className="border-t border-border pt-4 mb-4">
            <p className="text-muted text-sm">
              {user ? (
                <>You've been invited to join this circle</>
              ) : (
                <>Sign in to join this circle</>
              )}
            </p>
          </div>

          {error && <p className="text-loss text-sm mb-3">{error}</p>}

          <button
            onClick={join}
            disabled={joining}
            className="w-full bg-accent hover:bg-accent-2 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {joining ? "Joining…" : user ? `Join ${circle.name}` : "Sign in to join"}
          </button>

          {user && (
            <a href="/dashboard" className="block mt-3 text-subtle text-xs hover:text-muted">
              Go to dashboard instead
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
