"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useApiClient } from "@/app/providers";

interface Friend {
  id: string;
  name: string;
  username?: string;
  image?: string;
  friendshipId: string;
}

interface AiSuggestion {
  title: string;
  description?: string;
  type: string;
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

function Avatar({ name, image, size = "md" }: { name: string; image?: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  if (image) return <img src={image} alt={name} className={`${cls} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${cls} rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent flex-shrink-0`}>
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

interface PrefillCircle {
  id: string;
  name: string;
  emoji: string;
}

export default function NewBetPage() {
  const { user } = useAuth();
  const { authFetch } = useApiClient();
  const router = useRouter();
  const params = useSearchParams();
  const prefilledUserId = params.get("userId");
  const prefilledCircleId = params.get("circleId");

  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [prefilledCircle, setPrefilledCircle] = useState<PrefillCircle | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stake, setStake] = useState(50);
  const [customStake, setCustomStake] = useState("");
  const [resolveAt, setResolveAt] = useState("");
  const [proposerOption, setProposerOption] = useState<"Yes" | "No" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const STAKES = [25, 50, 100, 250];

  useEffect(() => {
    authFetch("/api/friends").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      const list: Friend[] = data.friends ?? [];
      setFriends(list);
      if (prefilledUserId) {
        const match = list.find((f) => f.id === prefilledUserId);
        if (match) setSelectedFriend(match);
      }
    });
  }, [authFetch, prefilledUserId]);

  // Load the prefilled circle (if ?circleId= in URL) so we can both (a)
  // show a "posting to X" chip in the header and (b) actually include
  // the circleId in the POST body. Without this, bets created from a
  // circle page get orphaned into the user's top-level bet list.
  useEffect(() => {
    if (!prefilledCircleId) return;
    authFetch(`/api/circles/${prefilledCircleId}`).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      if (data.circle) {
        setPrefilledCircle({
          id: data.circle.id,
          name: data.circle.name,
          emoji: data.circle.emoji,
        });
      }
    });
  }, [authFetch, prefilledCircleId]);

  const fetchSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const res = await authFetch("/api/ai/suggest-bet", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSuggestions(false);
    }
  }, [authFetch]);

  async function polishTitle() {
    if (!title.trim() || title.length < 5) return;
    try {
      const res = await authFetch("/api/ai/polish-bet", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (!proposerOption) {
      setError("Pick your side (Yes or No)");
      return;
    }

    const finalStake = customStake ? parseInt(customStake) : stake;
    if (!finalStake || finalStake < 1) {
      setError("Set a valid stake");
      return;
    }
    if (user && finalStake > user.chips) {
      setError(`Not enough chips. You have ${user.chips}.`);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await authFetch("/api/bets", {
        method: "POST",
        body: JSON.stringify({
          circleId: prefilledCircle?.id ?? undefined,
          challengedUserId: selectedFriend?.id ?? undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          type: "binary",
          stake: finalStake,
          options: ["Yes", "No"],
          proposerOption,
          resolveAt: resolveAt || undefined,
          aiResolvable: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create bet");
        return;
      }
      router.push(`/bet/${data.bet.id}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const finalStake = customStake ? parseInt(customStake) || 0 : stake;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-muted hover:text-text transition-colors"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-text">New Bet</h1>
      </div>

      {/* Prefilled circle context — show the user which circle this bet will land in */}
      {prefilledCircle && (
        <div className="mb-4 flex items-center justify-between gap-2 bg-accent/5 border border-accent/20 rounded-xl px-3 py-2 text-sm">
          <span className="text-muted">Posting to</span>
          <span className="text-text font-medium flex items-center gap-1.5">
            <span>{prefilledCircle.emoji}</span>
            <span>{prefilledCircle.name}</span>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Who are you betting? */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">Who are you betting?</label>

          {friends.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-subtle">
              No friends yet.{" "}
              <a href="/friends" className="text-accent hover:underline">Add friends</a>
              {" "}to challenge them, or create the bet anyway and share the link.
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {/* "Anyone" option — clears selection */}
              <button
                type="button"
                onClick={() => setSelectedFriend(null)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  !selectedFriend
                    ? "bg-accent/10 border-accent text-accent"
                    : "bg-white border-border text-muted hover:border-border-2"
                }`}
              >
                Anyone
              </button>

              {friends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFriend(f)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    selectedFriend?.id === f.id
                      ? "bg-accent/10 border-accent text-accent"
                      : "bg-white border-border text-muted hover:border-border-2"
                  }`}
                >
                  <Avatar name={f.name} image={f.image} size="sm" />
                  {f.username ?? f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bet title */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-muted">What's the bet?</label>
            {title.length >= 10 && (
              <button
                type="button"
                onClick={polishTitle}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-2 font-medium"
              >
                <SparkleIcon /> Polish with AI
              </button>
            )}
          </div>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lakers win tonight vs Nuggets"
            rows={2}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none text-base"
          />
        </div>

        {/* Description (optional) */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Details <span className="text-subtle font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add any clarifying details..."
            rows={2}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-none text-sm"
          />
        </div>

        {/* Stake */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-muted">Stake per side</label>
            <span className="text-xs text-subtle">You have {user?.chips?.toLocaleString()} chips</span>
          </div>
          <div className="flex gap-2 mb-2">
            {STAKES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStake(s); setCustomStake(""); }}
                className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                  stake === s && !customStake
                    ? "bg-accent border-accent text-white"
                    : "bg-white border-border text-muted hover:border-border-2"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={customStake}
            onChange={(e) => setCustomStake(e.target.value)}
            placeholder="Custom amount"
            min="1"
            className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm"
          />
        </div>

        {/* Your side */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">Your side</label>
          <div className="flex gap-2">
            {(["Yes", "No"] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setProposerOption(side)}
                className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  proposerOption === side
                    ? "bg-accent border-accent text-white"
                    : "bg-white border-border text-muted hover:border-border-2"
                }`}
              >
                {side}
              </button>
            ))}
          </div>
        </div>

        {/* Resolve date (optional) */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Deadline <span className="text-subtle font-normal">(optional)</span>
          </label>
          <input
            type="datetime-local"
            value={resolveAt}
            onChange={(e) => setResolveAt(e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 text-sm"
          />
        </div>

        {/* Pot preview */}
        {finalStake > 0 && (
          <div className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-subtle mb-1">Pot when both join</p>
              <p className="text-2xl font-bold text-text">
                {(finalStake * 2).toLocaleString()}
                <span className="text-muted text-base font-normal ml-1">chips</span>
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <span className="text-subtle text-sm font-medium">vs</span>
                {selectedFriend ? (
                  <Avatar name={selectedFriend.name} image={selectedFriend.image} size="sm" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs text-muted">?</div>
                )}
              </div>
              <p className="text-xs text-subtle mt-1">{finalStake} + {finalStake}</p>
            </div>
          </div>
        )}

        {error && <p className="text-loss text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !title.trim() || finalStake < 1 || !proposerOption}
          className="w-full bg-accent hover:bg-accent-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-base shadow-sm"
        >
          {submitting
            ? "Creating bet…"
            : selectedFriend
            ? `Challenge ${selectedFriend.username ?? selectedFriend.name}`
            : "Create Bet"}
        </button>
      </form>

      {/* AI suggestions */}
      <div className="mt-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted">Need ideas?</p>
          <button
            onClick={fetchSuggestions}
            disabled={loadingSuggestions}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-2 font-medium disabled:opacity-50"
          >
            <SparkleIcon /> {loadingSuggestions ? "Thinking…" : "Suggest bets"}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setTitle(s.title); if (s.description) setDescription(s.description); }}
                className="w-full text-left bg-white border border-border hover:border-accent/40 hover:bg-accent/5 rounded-xl px-4 py-3 transition-colors"
              >
                <p className="text-text text-sm font-medium">{s.title}</p>
                {s.description && (
                  <p className="text-subtle text-xs mt-0.5 line-clamp-1">{s.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
