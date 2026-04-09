"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers";

function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const links = [
    { href: "/dashboard", label: "Home", icon: HomeIcon },
    { href: "/bet/new", label: "Bet", icon: PlusIcon },
    { href: "/profile", label: user?.name?.split(" ")[0] ?? "You", icon: PersonIcon },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-border safe-area-inset-bottom z-50">
      <div className="max-w-lg mx-auto flex">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors ${
                active ? "text-accent" : "text-subtle hover:text-muted"
              }`}
            >
              <Icon active={active} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function PlusIcon({ active }: { active: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center -mt-1 ${active ? "bg-accent" : "bg-accent/20 border border-accent/30"}`}>
      <svg width="18" height="18" fill="none" stroke={active ? "white" : "currentColor"} strokeWidth="2.5" viewBox="0 0 24 24">
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
