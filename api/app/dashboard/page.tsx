'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  name: string | null;
  email: string;
  chips: number;
}

interface Circle {
  id: string;
  name: string;
  emoji: string;
  members: { userId: string }[];
  _count: { bets: number };
}

function apiFetch(url: string, opts?: RequestInit) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('tilt_token') : '';
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [circleName, setCircleName] = useState('');
  const [circleEmoji, setCircleEmoji] = useState('🎯');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tilt_token');
    if (!token) {
      router.replace('/');
      return;
    }
    (async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          apiFetch('/api/users/me'),
          apiFetch('/api/circles'),
        ]);
        if (uRes.status === 401) {
          router.replace('/');
          return;
        }
        const [uData, cData] = await Promise.all([uRes.json(), cRes.json()]);
        setUser(uData.user);
        setCircles(cData.circles ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await apiFetch('/api/circles', {
      method: 'POST',
      body: JSON.stringify({ name: circleName, emoji: circleEmoji }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setCircles(prev => [data.circle, ...prev]);
      setShowCreate(false);
      setCircleName('');
      setCircleEmoji('🎯');
    }
  }

  function logout() {
    localStorage.removeItem('tilt_token');
    router.replace('/');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-violet-400">Tilt</h1>
        <div className="flex items-center gap-3">
          <div className="bg-violet-950/50 border border-violet-900/50 rounded-full px-3 py-1 text-sm">
            <span className="text-violet-300 font-semibold">{user?.chips?.toLocaleString()}</span>
            <span className="text-zinc-500 ml-1">chips</span>
          </div>
          <button
            onClick={logout}
            className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold">
            Hey, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h2>
          <p className="text-zinc-500 text-sm mt-1">Ready to put some chips on the line?</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/bets/create"
            className="bg-violet-600 hover:bg-violet-500 rounded-2xl p-4 flex flex-col gap-2 transition-colors"
          >
            <span className="text-2xl">🎰</span>
            <span className="font-semibold">New Bet</span>
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-2 text-left transition-colors"
          >
            <span className="text-2xl">👥</span>
            <span className="font-semibold">New Circle</span>
          </button>
        </div>

        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Your Circles
          </h3>
          {circles.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No circles yet.</p>
              <p className="text-zinc-600 text-xs mt-1">Create one and invite your crew</p>
            </div>
          ) : (
            <div className="space-y-2">
              {circles.map(c => (
                <Link
                  key={c.id}
                  href={`/circles/${c.id}`}
                  className="flex items-center gap-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-4 transition-colors group"
                >
                  <span className="text-3xl">{c.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {c.members?.length ?? 0} members · {c._count?.bets ?? 0} bets
                    </p>
                  </div>
                  <span className="text-zinc-700 group-hover:text-zinc-500 transition-colors text-lg">
                    ›
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-1">Create a Circle</h2>
            <p className="text-zinc-500 text-sm mb-5">A circle is a group where you bet with friends</p>
            <form onSubmit={handleCreateCircle} className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={circleEmoji}
                  onChange={e => setCircleEmoji(e.target.value)}
                  className="w-14 bg-zinc-800 rounded-xl px-2 py-2 text-center text-2xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  value={circleName}
                  onChange={e => setCircleName(e.target.value)}
                  placeholder="Circle name"
                  required
                  className="flex-1 bg-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl py-2.5 text-sm font-semibold transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
