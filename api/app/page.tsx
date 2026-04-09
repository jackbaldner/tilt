"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./providers";
import { TiltLogo } from "@/components/TiltLogo";

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
      {/* Subtle blue gradient wash at the top */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, #2563eb18, transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <TiltLogo size="lg" />
          </div>
          <p className="text-muted mt-3 text-base">
            Bet your friends on anything.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm shadow-slate-100">
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
                className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
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
              {submitting ? "Signing in…" : "Continue"}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-subtle">or</span>
            </div>
          </div>

          <button
            onClick={handleDemo}
            disabled={submitting}
            className="w-full rounded-xl bg-surface hover:bg-surface-2 border border-border disabled:opacity-40 disabled:cursor-not-allowed text-muted font-medium py-3 px-4 transition-colors text-sm"
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
