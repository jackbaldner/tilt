"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth, useApiClient } from "@/app/providers";

function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { authFetch } = useApiClient();
  const [pendingRequests, setPendingRequests] = useState(0);

  const fetchPending = useCallback(async () => {
    try {
      const res = await authFetch("/api/friends/requests");
      if (res.ok) {
        const d = await res.json();
        setPendingRequests((d.requests ?? []).length);
      }
    } catch {
      // ignore
    }
  }, [authFetch]);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-border safe-area-inset-bottom z-50">
      <div className="max-w-lg mx-auto flex">
        <NavLink href="/dashboard" label="Home" pathname={pathname}>
          <HomeIcon active={pathname === "/dashboard" || pathname.startsWith("/dashboard/")} />
        </NavLink>

        <NavLink href="/friends" label="Friends" pathname={pathname}>
          <div className="relative">
            <FriendsIcon active={pathname === "/friends" || pathname.startsWith("/friends/")} />
            {pendingRequests > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingRequests > 9 ? "9+" : pendingRequests}
              </span>
            )}
          </div>
        </NavLink>

        <NavLink href="/bet/new" label="Bet" pathname={pathname}>
          <PlusIcon active={pathname === "/bet/new"} />
        </NavLink>

        <NavLink href="/profile" label={user?.name?.split(" ")[0] ?? "You"} pathname={pathname}>
          <PersonIcon active={pathname === "/profile"} />
        </NavLink>
      </div>
    </nav>
  );
}

function NavLink({ href, label, pathname, children }: { href: string; label: string; pathname: string; children: React.ReactNode }) {
  const active = pathname === href || (href !== "/bet/new" && pathname.startsWith(href + "/"));
  return (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors ${
        active ? "text-accent" : "text-subtle hover:text-muted"
      }`}
    >
      {children}
      <span className="text-xs font-medium">{label}</span>
    </Link>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function FriendsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center -mt-1 ${active ? "bg-accent" : "bg-accent/10 border border-accent/20"}`}>
      <svg width="18" height="18" fill="none" stroke={active ? "white" : "#2563EB"} strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </div>
  );
}

function PersonIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-bg pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
