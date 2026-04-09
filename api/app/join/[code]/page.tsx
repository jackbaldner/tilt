'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface CirclePreview {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  owner: { id: string; name: string | null };
  memberCount: number;
  betCount: number;
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

export default function JoinCirclePage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [circle, setCircle] = useState<CirclePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tilt_token');
    setIsLoggedIn(!!token);

    (async () => {
      try {
        const res = await fetch(`/api/circles/join/${code}`);
        if (!res.ok) {
          setError('Invalid or expired invite link');
          return;
        }
        const data = await res.json();
        setCircle(data.circle);
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  async function handleJoin() {
    const token = localStorage.getItem('tilt_token');
    if (!token) {
      // Store intended destination and redirect to login
      localStorage.setItem('tilt_after_login', `/join/${code}`);
      router.push('/');
      return;
    }
    setJoining(true);
    const res = await apiFetch(`/api/circles/join/${code}`, { method: 'POST' });
    const data = await res.json();
    setJoining(false);
    if (res.ok) {
      router.replace(`/circles/${data.circle.id}`);
    } else {
      setError(data.error ?? 'Failed to join');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (error || !circle) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">😕</div>
          <h1 className="text-xl font-bold mb-2">Invalid Invite</h1>
          <p className="text-zinc-500 text-sm mb-6">{error || 'This invite link is no longer valid.'}</p>
          <Link href="/" className="text-violet-400 hover:underline text-sm">
            Go to Tilt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">{circle.emoji}</div>
          <h1 className="text-2xl font-bold mb-1">{circle.name}</h1>
          {circle.description && (
            <p className="text-zinc-400 text-sm">{circle.description}</p>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold text-violet-300">{circle.memberCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">members</p>
            </div>
            <div className="w-px bg-zinc-800" />
            <div>
              <p className="text-2xl font-bold text-violet-300">{circle.betCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">bets</p>
            </div>
            <div className="w-px bg-zinc-800" />
            <div>
              <p className="text-sm font-semibold truncate max-w-[80px]">
                {circle.owner.name ?? 'Someone'}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">owner</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors text-lg mb-3"
        >
          {joining ? 'Joining...' : isLoggedIn ? 'Join Circle' : 'Sign in & Join'}
        </button>

        <p className="text-center text-zinc-600 text-xs">
          You&apos;ll get 1,000 chips to start betting
        </p>
      </div>
    </div>
  );
}
