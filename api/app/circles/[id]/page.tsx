'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Circle {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  ownerId: string;
  _count: { bets: number; members: number };
}

interface Bet {
  id: string;
  title: string;
  stake: number;
  totalPot: number;
  resolution: string;
  resolvedOption: string | null;
  options: string[];
  proposer: { id: string; name: string | null };
  sides: { userId?: string; user?: { id: string }; option: string; status: string }[];
}

interface LeaderboardEntry {
  userId: string;
  chips: number;
  role: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    stats: { totalBets: number; wonBets: number; lostBets: number };
  };
}

type Tab = 'bets' | 'leaderboard';

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

export default function CirclePage() {
  const router = useRouter();
  const params = useParams();
  const circleId = params.id as string;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('bets');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tilt_token');
    if (!token) {
      router.replace('/');
      return;
    }
    (async () => {
      try {
        const [cRes, bRes, lRes, mRes] = await Promise.all([
          apiFetch(`/api/circles/${circleId}`),
          apiFetch(`/api/circles/${circleId}/bets`),
          apiFetch(`/api/circles/${circleId}/leaderboard`),
          apiFetch('/api/users/me'),
        ]);
        if (cRes.status === 401) {
          router.replace('/');
          return;
        }
        if (!cRes.ok) {
          router.replace('/dashboard');
          return;
        }
        const [cData, bData, lData, mData] = await Promise.all([
          cRes.json(),
          bRes.json(),
          lRes.json(),
          mRes.json(),
        ]);
        setCircle(cData.circle);
        setBets(bData.bets ?? []);
        setLeaderboard(lData.leaderboard ?? []);
        setUserId(mData.user?.id ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, circleId]);

  async function copyInviteLink() {
    if (!circle) return;
    const url = `${window.location.origin}/join/${circle.inviteCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (!circle) return null;

  const pendingBets = bets.filter(b => b.resolution === 'pending');
  const resolvedBets = bets.filter(b => b.resolution !== 'pending');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl">
          ‹
        </Link>
        <span className="text-xl">{circle.emoji}</span>
        <h1 className="font-bold text-lg flex-1 truncate">{circle.name}</h1>
        <button
          onClick={copyInviteLink}
          className="text-xs text-violet-400 hover:text-violet-300 border border-violet-900/50 rounded-full px-3 py-1 transition-colors shrink-0"
        >
          {copied ? '✓ Copied!' : '+ Invite'}
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <Link
          href={`/bets/create?circle=${circleId}`}
          className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 rounded-2xl py-3 font-semibold transition-colors"
        >
          🎰 New Bet
        </Link>

        <div className="flex bg-zinc-900 border border-zinc-800 rounded-2xl p-1 gap-1">
          {(['bets', 'leaderboard'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${
                tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'bets' ? `Bets (${bets.length})` : 'Leaderboard'}
            </button>
          ))}
        </div>

        {tab === 'bets' && (
          <div className="space-y-4">
            {pendingBets.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Open
                </h3>
                <div className="space-y-2">
                  {pendingBets.map(bet => (
                    <BetCard key={bet.id} bet={bet} userId={userId} />
                  ))}
                </div>
              </section>
            )}
            {resolvedBets.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Resolved
                </h3>
                <div className="space-y-2">
                  {resolvedBets.map(bet => (
                    <BetCard key={bet.id} bet={bet} userId={userId} />
                  ))}
                </div>
              </section>
            )}
            {bets.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500 text-sm">No bets yet.</p>
                <p className="text-zinc-600 text-xs mt-1">Be the first to start something</p>
              </div>
            )}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.userId}
                className={`flex items-center gap-4 rounded-2xl p-4 border ${
                  entry.userId === userId
                    ? 'bg-violet-950/30 border-violet-900/50'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <span className="text-lg font-bold w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (
                    <span className="text-zinc-600 text-sm">{i + 1}</span>
                  )}
                </span>
                <div className="w-9 h-9 rounded-full bg-violet-900/50 flex items-center justify-center text-sm font-bold text-violet-400 shrink-0">
                  {(entry.user.name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {entry.user.name ?? 'Unknown'}
                    {entry.userId === userId && (
                      <span className="text-violet-400 ml-1">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {entry.user.stats.wonBets}W / {entry.user.stats.lostBets}L
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-violet-300">{entry.chips.toLocaleString()}</p>
                  <p className="text-xs text-zinc-600">chips</p>
                </div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500 text-sm">No members yet</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function BetCard({ bet, userId }: { bet: Bet; userId: string | null }) {
  const myBetSide = bet.sides.find(
    s => s.user?.id === userId || s.userId === userId
  );
  const isResolved = bet.resolution !== 'pending';

  return (
    <Link
      href={`/bets/${bet.id}`}
      className="block bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-sm leading-snug flex-1">{bet.title}</p>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
            isResolved
              ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
              : 'bg-yellow-900/30 text-yellow-400 border-yellow-900/50'
          }`}
        >
          {isResolved ? 'done' : 'open'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>💰 {bet.totalPot} pot</span>
        <span>
          {bet.sides.length} bettor{bet.sides.length !== 1 ? 's' : ''}
        </span>
        {myBetSide && (
          <span
            className={`font-medium ${
              myBetSide.status === 'won'
                ? 'text-emerald-400'
                : myBetSide.status === 'lost'
                ? 'text-red-400'
                : 'text-violet-400'
            }`}
          >
            {myBetSide.status === 'won'
              ? '✓ Won'
              : myBetSide.status === 'lost'
              ? '✗ Lost'
              : `You: ${myBetSide.option}`}
          </span>
        )}
      </div>
      {isResolved && bet.resolvedOption && (
        <p className="text-xs text-emerald-500 mt-1.5">Winner: {bet.resolvedOption}</p>
      )}
    </Link>
  );
}
