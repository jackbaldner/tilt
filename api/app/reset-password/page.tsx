"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { TiltLogo } from "@/components/TiltLogo";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Missing reset token. Please use the link from your email.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reset failed");
        return;
      }
      login(data.user, data.token);
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
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
          {done ? (
            <div className="text-center py-2">
              <div className="text-3xl mb-4">✅</div>
              <h2 className="text-lg font-bold text-text mb-2">Password updated!</h2>
              <p className="text-muted text-sm">Redirecting you to the dashboard…</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-text mb-1">Set a new password</h2>
              <p className="text-muted text-sm mb-5">Choose a strong password for your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  disabled={submitting || !token}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm password"
                  disabled={submitting || !token}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
                {error && <p className="text-loss text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || !token || !password || !confirm}
                  className="w-full rounded-xl bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors text-base"
                >
                  {submitting ? "Saving…" : "Set new password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
