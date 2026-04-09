"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./providers";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      login(data.user, data.token);
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemo() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `demo+${Date.now()}@tilt.app`,
          name: "Demo User",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      login(data.user, data.token);
      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Background gradient */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, #8b5cf620, transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            <span className="text-3xl">🎲</span>
          </div>
          <h1 className="text-4xl font-bold text-text tracking-tight">Tilt</h1>
          <p className="text-muted mt-2 text-base">
            Bet your friends on anything.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-muted mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={submitting}
                className="w-full rounded-xl bg-bg border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition disabled:opacity-50 text-base"
              />
            </div>

            {error && (
              <p className="text-loss text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full rounded-xl bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors text-base"
            >
              {submitting ? "Signing in…" : "Continue →"}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-2 text-subtle">or</span>
            </div>
          </div>

          <button
            onClick={handleDemo}
            disabled={submitting}
            className="w-full rounded-xl bg-surface-2 hover:bg-border border border-border disabled:opacity-40 disabled:cursor-not-allowed text-muted font-medium py-3 px-4 transition-colors text-sm"
          >
            Try a demo account
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-subtle text-xs mt-6">
          No password needed. Enter your email and you're in.
        </p>
      </div>
    </div>
  );
}
