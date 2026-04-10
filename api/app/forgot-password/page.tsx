"use client";

import { useState } from "react";
import Link from "next/link";
import { TiltLogo } from "@/components/TiltLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #2563eb18, transparent)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TiltLogo size="lg" />
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm shadow-slate-100">
          {sent ? (
            <div className="text-center py-2">
              <div className="text-3xl mb-4">📬</div>
              <h2 className="text-lg font-bold text-text mb-2">Check your email</h2>
              <p className="text-muted text-sm">
                If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-text mb-1">Forgot your password?</h2>
              <p className="text-muted text-sm mb-5">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
                {error && <p className="text-loss text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="w-full rounded-xl bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors text-base"
                >
                  {submitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-subtle text-sm mt-5">
          <Link href="/" className="text-accent hover:underline">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
