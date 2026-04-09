"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useApiClient } from "@/app/providers";
import { TiltLogo } from "@/components/TiltLogo";

interface CirclePreview {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  owner: { id: string; name: string };
  memberCount: number;
  betCount: number;
}

function BrokenLinkIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-subtle mx-auto mb-3">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
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
        <BrokenLinkIcon />
        <h1 className="text-xl font-bold text-text mb-2">Invalid invite link</h1>
        <p className="text-muted text-sm mb-6">This invite link is no longer valid.</p>
        <a href="/dashboard" className="text-accent hover:underline text-sm font-medium">Go to dashboard</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% -10%, #2563eb18, transparent)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <TiltLogo size="md" />
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm text-center">
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
            className="w-full bg-accent hover:bg-accent-2 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
          >
            {joining ? "Joining…" : user ? `Join ${circle.name}` : "Sign in to join"}
          </button>

          {user && (
            <a href="/dashboard" className="block mt-3 text-subtle text-xs hover:text-muted transition-colors">
              Go to dashboard instead
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
