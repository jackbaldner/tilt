"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./providers";
import { TiltLogo } from "@/components/TiltLogo";

type Tab = "login" | "signup";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? "/dashboard";
  const [tab, setTab] = useState<Tab>("login");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup fields
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextUrl);
    }
  }, [user, loading, router, nextUrl]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      login(data.user, data.token);
      router.push(nextUrl);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!signupUsername.trim() || !signupEmail.trim() || !signupPassword) {
      setError("All fields are required");
      return;
    }
    if (signupPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: signupUsername.trim(),
          email: signupEmail.trim().toLowerCase(),
          password: signupPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        return;
      }
      login(data.user, data.token);
      router.push(nextUrl);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -10%, #2563eb18, transparent)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <TiltLogo size="lg" />
          </div>
          <p className="text-muted mt-3 text-base">Bet your friends on anything.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-surface border border-border rounded-xl p-1 mb-6">
          {(["login", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-text"
              }`}
            >
              {t === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm shadow-slate-100">
          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              {error && <p className="text-loss text-sm">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !loginEmail.trim() || !loginPassword}
                className="w-full rounded-xl bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors text-base"
              >
                {submitting ? "Signing in…" : "Log In"}
              </button>
              <div className="text-right">
                <Link href="/forgot-password" className="text-sm text-accent hover:underline">
                  Forgot password?
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                  placeholder="yourhandle"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={signupConfirm}
                  onChange={(e) => setSignupConfirm(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full rounded-xl bg-surface border border-border px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition disabled:opacity-50 text-base"
                />
              </div>
              {error && <p className="text-loss text-sm">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !signupUsername.trim() || !signupEmail.trim() || !signupPassword}
                className="w-full rounded-xl bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 transition-colors text-base"
              >
                {submitting ? "Creating account…" : "Create Account"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-subtle text-xs mt-6">
          By continuing, you agree to our Terms of Service.
        </p>
      </div>
    </div>
  );
}
