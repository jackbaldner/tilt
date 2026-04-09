'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Circle {
  id: string;
  name: string;
  emoji: string;
}

interface User {
  id: string;
  chips: number;
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

function CreateBetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultCircleId = searchParams.get('circle') ?? '';

  const [user, setUser] = useState<User | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');

  const [circleId, setCircleId] = useState(defaultCircleId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stake, setStake] = useState(100);
  const [options, setOptions] = useState(['Yes', 'No']);
  const [resolveAt, setResolveAt] = useState('');
  const [aiResolvable, setAiResolvable] = useState(false);

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
        const fetchedCircles = cData.circles ?? [];
        setCircles(fetchedCircles);
        if (!defaultCircleId && fetchedCircles.length > 0) {
          setCircleId(fetchedCircles[0].id);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router, defaultCircleId]);

  async function handleSuggest() {
    if (!circleId) return;
    setSuggesting(true);
    try {
      const res = await apiFetch('/api/ai/suggest-bet', {
        method: 'POST',
        body: JSON.stringify({ circleId }),
      });
      const data = await res.json();
      if (res.ok && data.suggestions?.length > 0) {
        const s = data.suggestions[0];
        setTitle(typeof s === 'string' ? s : s.title ?? '');
        if (typeof s === 'object' && s.description) setDescription(s.description);
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!circleId) {
      setError('Select a circle');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/api/bets', {
        method: 'POST',
        body: JSON.stringify({
          circleId,
          title: title.trim(),
          description: description.trim() || null,
          type: 'binary',
          stake,
          options: options.filter(Boolean),
          resolveAt: resolveAt || null,
          aiResolvable,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create bet');
      router.push(`/bets/${data.bet.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create bet');
    } finally {
      setSubmitting(false);
    }
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
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-900 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 transition-colors text-xl">
          ‹
        </Link>
        <h1 className="font-bold text-lg">New Bet</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Circle */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Circle
            </label>
            {circles.length === 0 ? (
              <p className="text-zinc-500 text-sm">
                You need to{' '}
                <Link href="/dashboard" className="text-violet-400 hover:underline">
                  create a circle
                </Link>{' '}
                first
              </p>
            ) : (
              <select
                value={circleId}
                onChange={e => setCircleId(e.target.value)}
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors"
              >
                {circles.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Proposition */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                The Bet
              </label>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting || !circleId}
                className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
              >
                {suggesting ? '✨ Thinking...' : '✨ AI Suggest'}
              </button>
            </div>
            <input
              type="text"
              placeholder="e.g. Lakers win vs Celtics tonight"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Details <span className="normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              placeholder="Any extra context or conditions..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
          </div>

          {/* Stake */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Stake{' '}
              <span className="normal-case font-normal text-zinc-600">
                ({user?.chips?.toLocaleString()} chips available)
              </span>
            </label>
            <div className="flex gap-2 mb-2">
              {[50, 100, 250, 500].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStake(v)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    stake === v
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={user?.chips ?? 9999}
              value={stake}
              onChange={e => setStake(parseInt(e.target.value) || 0)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Options
            </label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={e =>
                      setOptions(prev => prev.map((o, j) => (j === i ? e.target.value : o)))
                    }
                    placeholder={`Option ${i + 1}`}
                    required
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))}
                      className="w-10 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-red-400 hover:border-red-900 transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {options.length < 5 && (
                <button
                  type="button"
                  onClick={() => setOptions(prev => [...prev, ''])}
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>

          {/* Resolve date */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Resolve By <span className="normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={resolveAt}
              onChange={e => setResolveAt(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* AI resolvable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`w-11 h-6 rounded-full transition-colors relative ${
                aiResolvable ? 'bg-violet-600' : 'bg-zinc-800'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                  aiResolvable ? 'left-6' : 'left-1'
                }`}
              />
            </div>
            <input
              type="checkbox"
              checked={aiResolvable}
              onChange={e => setAiResolvable(e.target.checked)}
              className="sr-only"
            />
            <div>
              <p className="text-sm font-medium">AI Resolvable</p>
              <p className="text-xs text-zinc-600">Claude will try to auto-resolve this bet</p>
            </div>
          </label>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting || circles.length === 0}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-colors text-lg"
          >
            {submitting ? 'Creating...' : `Bet ${stake} chips`}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function CreateBetPage() {
  return (
    <Suspense>
      <CreateBetForm />
    </Suspense>
  );
}
