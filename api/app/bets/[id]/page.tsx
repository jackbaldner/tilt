'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Side {
  id: string;
  option: string;
  stake: number;
  status: string;
  user: { id: string; name: string | null; image: string | null };
}

interface Comment {
  id: string;
  body: string;
  user: { id: string; name: string | null; image: string | null };
  createdAt: string;
}

interface BetData {
  id: string;
  title: string;
  description: string | null;
  stake: number;
  options: string[];
  resolution: string;
  resolvedOption: string | null;
  resolutionNote: string | null;
  totalPot: number;
  aiResolvable: boolean;
  proposerId: string;
  proposer: { id: string; name: string | null; image: string | null };
  circle: { id: string; name: string; emoji: string };
  sides: Side[];
  comments: Comment[];
  createdAt: string;
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

export default function BetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const betId = params.id as string;

  const [bet, setBet] = useState<BetData | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [winningOption, setWinningOption] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState('');

  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);

  async function refreshBet() {
    const res = await apiFetch(`/api/bets/${betId}`);
    if (res.ok) {
      const data = await res.json();
      setBet(data.bet);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('tilt_token');
    if (!token) {
      router.replace('/');
      return;
    }
    (async () => {
      try {
        const [betRes, meRes] = await Promise.all([
          apiFetch(`/api/bets/${betId}`),
          apiFetch('/api/users/me'),
        ]);
        if (betRes.status === 401) {
          router.replace('/');
          return;
        }
        if (!betRes.ok) {
          setPageError('Bet not found');
          return;
        }
        const [betData, meData] = await Promise.all([betRes.json(), meRes.json()]);
        setBet(betData.bet);
        setUserId(meData.user?.id ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, betId]);

  async function handleJoin() {
    if (!selectedOption) return;
    setJoining(true);
    setJoinError('');
    const res = await apiFetch(`/api/bets/${betId}/sides`, {
      method: 'POST',
      body: JSON.stringify({ option: selectedOption }),
    });
    const data = await res.json();
    setJoining(false);
    if (!res.ok) {
      setJoinError(data.error ?? 'Failed to join');
      return;
    }
    await refreshBet();
  }

  async function handleResolve() {
    if (!winningOption) return;
    setResolving(true);
    const res = await apiFetch(`/api/bets/${betId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ winningOption, resolutionNote: resolveNote || null }),
    });
    setResolving(false);
    if (res.ok) await refreshBet();
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommenting(true);
    const res = await apiFetch(`/api/bets/${betId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: comment.trim() }),
    });
    setCommenting(false);
    if (res.ok) {
      setComment('');
      await refreshBet();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-600 text-sm">Loading...</div>
      </div>
    );
  }

  if (pageError || !bet) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">{pageError || 'Bet not found'}</p>
          <Link href="/dashboard" className="text-violet-400 text-sm mt-2 block hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const myBetSide = bet.sides.find(s => s.user.id === userId);
  const canJoin = !myBetSide && bet.resolution === 'pending';
  const canResolve = bet.proposerId === userId && bet.resolution === 'pending';
  const isResolved = bet.resolution !== 'pending';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 px-4 py-3 flex items-center gap-3">
        <Link
          href={`/circles/${bet.circle.id}`}
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl"
        >
          ‹
        </Link>
        <span className="text-sm text-zinc-400">
          {bet.circle.emoji} {bet.circle.name}
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Bet header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h1 className="text-xl font-bold leading-snug flex-1">{bet.title}</h1>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${
                isResolved
                  ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  : 'bg-yellow-900/30 text-yellow-400 border-yellow-900/50'
              }`}
            >
              {isResolved ? bet.resolution : 'open'}
            </span>
          </div>

          {bet.description && (
            <p className="text-zinc-400 text-sm mb-3">{bet.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span>🎯 {bet.stake} chips/side</span>
            <span>💰 {bet.totalPot} pot</span>
            <span>by {bet.proposer.name ?? 'Unknown'}</span>
          </div>

          {isResolved && bet.resolvedOption && (
            <div className="mt-3 bg-emerald-950/50 border border-emerald-900/50 rounded-xl p-3">
              <p className="text-emerald-400 font-semibold text-sm">✓ Winner: {bet.resolvedOption}</p>
              {bet.resolutionNote && (
                <p className="text-emerald-600 text-xs mt-1">{bet.resolutionNote}</p>
              )}
            </div>
          )}
        </div>

        {/* Sides */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            In the bet
          </h2>
          <div className="space-y-2">
            {bet.options.map(opt => {
              const optSides = bet.sides.filter(s => s.option === opt);
              const isWinner = isResolved && bet.resolvedOption === opt;
              return (
                <div key={opt} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${isWinner ? 'text-emerald-400' : ''}`}>
                      {isWinner ? '✓ ' : ''}
                      {opt}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {optSides.length} bettor{optSides.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {optSides.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {optSides.map(s => (
                        <span
                          key={s.id}
                          className={`text-xs px-2.5 py-1 rounded-full ${
                            s.status === 'won'
                              ? 'bg-emerald-900/50 text-emerald-400'
                              : s.status === 'lost'
                              ? 'bg-red-900/30 text-red-400'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {s.user.name ?? 'Anon'}
                          {s.user.id === userId ? ' (you)' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* My active side */}
        {myBetSide && !isResolved && (
          <div className="bg-violet-950/30 border border-violet-900/50 rounded-2xl p-4">
            <p className="text-violet-300 font-semibold text-sm">
              You bet {myBetSide.stake} chips on{' '}
              <span className="underline underline-offset-2">{myBetSide.option}</span>
            </p>
          </div>
        )}

        {/* Join bet */}
        {canJoin && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="font-semibold mb-3">Join this bet</h2>
            <div className="flex gap-2 mb-3">
              {bet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => setSelectedOption(opt)}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    selectedOption === opt
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {joinError && <p className="text-red-400 text-xs mb-2">{joinError}</p>}
            <button
              onClick={handleJoin}
              disabled={!selectedOption || joining}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {joining
                ? 'Joining...'
                : `Bet ${bet.stake} chips on ${selectedOption ?? '...'}`}
            </button>
          </div>
        )}

        {/* Resolve bet */}
        {canResolve && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="font-semibold mb-3">Resolve bet</h2>
            <div className="flex gap-2 mb-3">
              {bet.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => setWinningOption(opt)}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    winningOption === opt
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Resolution note (optional)"
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value)}
              className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-600 mb-3 transition-colors"
            />
            <button
              onClick={handleResolve}
              disabled={!winningOption || resolving}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {resolving ? 'Resolving...' : `Declare "${winningOption ?? '...'}" wins`}
            </button>
          </div>
        )}

        {/* Trash talk */}
        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Trash Talk
          </h2>
          <div className="space-y-2 mb-3">
            {bet.comments.length === 0 ? (
              <p className="text-zinc-600 text-sm">No trash talk yet. Start things off.</p>
            ) : (
              bet.comments.map(c => (
                <div
                  key={c.id}
                  className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-900/50 flex items-center justify-center text-xs font-bold text-violet-400 shrink-0">
                    {(c.user.name ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-zinc-400">
                      {c.user.name ?? 'Unknown'}
                    </span>
                    <p className="text-sm text-zinc-200 mt-0.5">{c.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleComment} className="flex gap-2">
            <input
              type="text"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Say something..."
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors text-sm"
            />
            <button
              type="submit"
              disabled={!comment.trim() || commenting}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl transition-colors text-sm font-semibold"
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
