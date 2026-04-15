"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useApiClient } from "@/app/providers";
import { isPrivateCircleName } from "@/lib/circleDisplay";

interface BetUser {
  id: string;
  name: string;
  image?: string;
}

interface BetSide {
  id: string;
  userId: string;
  option: string;
  stake: number;
  status: string;
  user: BetUser;
}

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: BetUser;
}

interface Dispute {
  id: string;
  reason: string;
  resolved: boolean;
  outcome?: string;
}

interface Bet {
  id: string;
  title: string;
  description?: string;
  type: string;
  stake: number;
  totalPot: number;
  resolution: string;
  resolvedOption?: string;
  resolutionNote?: string;
  createdAt: string;
  resolveAt?: string;
  options: string[];
  proposer: BetUser;
  circle: { id: string; name: string; emoji: string; memberCount?: number } | null;
  sides: BetSide[];
  comments: Comment[];
  disputes: Dispute[];
}

function Avatar({ user, size = "md" }: { user: BetUser; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-12 h-12 text-base" };
  if (user.image) {
    return <img src={user.image} alt={user.name} className={`${sizes[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent flex-shrink-0`}>
      {user.name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </svg>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse inline-block" />
      Live
    </span>
  );
}

export default function BetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: betId } = use(params);
  const { user, refreshUser } = useAuth();
  const { authFetch } = useApiClient();
  const router = useRouter();

  const [bet, setBet] = useState<Bet | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveWinnerId, setResolveWinnerId] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [error, setError] = useState("");
  const [shareMsg, setShareMsg] = useState("");

  const loadBet = useCallback(async () => {
    const res = await authFetch(`/api/bets/${betId}`);
    if (res.ok) {
      const data = await res.json();
      setBet(data.bet);
    }
    setLoading(false);
  }, [betId, authFetch]);

  useEffect(() => {
    loadBet();
  }, [loadBet]);

  async function joinBet(option: string) {
    if (!bet || joining) return;
    setJoining(option);
    setError("");
    const res = await authFetch(`/api/bets/${betId}/sides`, {
      method: "POST",
      body: JSON.stringify({ option }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to join");
    } else {
      await loadBet();
      refreshUser();
    }
    setJoining(null);
  }

  async function resolveBet() {
    if (!resolveWinnerId || resolving) return;
    setResolving(true);
    setError("");
    const res = await authFetch(`/api/bets/${betId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ winnerId: resolveWinnerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to resolve");
    } else {
      setBet((prev) => (prev ? { ...prev, ...data.bet } : null));
      refreshUser();
      setShowResolve(false);
    }
    setResolving(false);
  }

  async function postComment() {
    if (!comment.trim() || postingComment) return;
    setPostingComment(true);
    const res = await authFetch(`/api/bets/${betId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text: comment.trim() }),
    });
    if (res.ok) {
      setComment("");
      await loadBet();
    }
    setPostingComment(false);
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/bet/${betId}`;
    const title = bet?.title ? `Tilt bet: ${bet.title}` : "Tilt bet";

    // Prefer Web Share API on mobile (opens native share sheet)
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch (err: any) {
        // User cancelled the share sheet, or share failed. Fall through
        // to clipboard fallback only if it wasn't a deliberate cancel.
        if (err?.name === "AbortError") return;
      }
    }

    // Fallback: clipboard API
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMsg("Copied!");
        setTimeout(() => setShareMsg(""), 2000);
        return;
      }
    } catch {
      // Clipboard failed, fall through
    }

    // Last-resort fallback: show the URL so the user can copy it manually
    setShareMsg(url);
    setTimeout(() => setShareMsg(""), 8000);
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 text-center">
        <p className="text-muted">Bet not found.</p>
      </div>
    );
  }

  const mySide = bet.sides.find((s) => s.userId === user?.id);
  const iAmProposer = bet.proposer?.id === user?.id;
  const isLive = bet.resolution === "pending";
  const isResolved = bet.resolution === "resolved";
  const sidesCount = bet.sides.length;
  const waiting = sidesCount < 2;

  const sidesByOption: Record<string, BetSide[]> = {};
  for (const s of bet.sides) {
    if (!sidesByOption[s.option]) sidesByOption[s.option] = [];
    sidesByOption[s.option].push(s);
  }

  const is1v1 = bet
    ? (isPrivateCircleName(bet.circle?.name) || (bet.circle?.memberCount ?? 0) === 2)
    : false;
  // For 1:1 mode: first taker per option (at most one in a private circle)
  const firstTakerByOption: Record<string, BetSide | undefined> = {};
  for (const opt of bet.options) {
    firstTakerByOption[opt] = (sidesByOption[opt] ?? [])[0];
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted hover:text-text mb-4 transition-colors text-sm"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Bet header */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            {bet.circle && !is1v1 && (
              <a href={`/circle/${bet.circle.id}`} className="text-xs text-subtle hover:text-muted mb-1 block">
                {bet.circle.emoji} {bet.circle.name}
              </a>
            )}
            <h1 className="text-xl font-bold text-text leading-snug">{bet.title}</h1>
            {bet.description && (
              <p className="text-muted text-sm mt-1.5">{bet.description}</p>
            )}
          </div>
          <StatusPill bet={bet} userId={user?.id ?? ""} />
        </div>

        <div className="flex items-center gap-2 text-xs text-subtle">
          <Avatar user={bet.proposer} size="sm" />
          <span>{iAmProposer ? "You" : bet.proposer.name} proposed this</span>
          {bet.resolveAt && (
            <>
              <span>·</span>
              <span>Deadline: {new Date(bet.resolveAt).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Pot visualization */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-subtle mb-0.5">Total pot</p>
            <p className="text-3xl font-bold text-text">
              {bet.totalPot.toLocaleString()}
              <span className="text-muted text-base font-normal ml-1">chips</span>
            </p>
          </div>
          {isResolved && (() => {
            const winSide = bet.sides.find((s) => s.status === "won");
            if (!winSide) return null;
            const winnerName = winSide.userId === user?.id ? "You" : (winSide.user.name ?? winSide.user.id);
            return (
              <div className="text-right">
                <p className="text-xs text-subtle mb-0.5">Winner</p>
                <p className="text-win font-semibold">{winnerName}</p>
              </div>
            );
          })()}
        </div>

        {/* Sides */}
        <div className="space-y-3">
          {bet.options.map((opt) => {
            const optSides = sidesByOption[opt] ?? [];
            const isMySide = mySide?.option === opt;
            const hasAny = optSides.length > 0;
            const isWinner = isResolved && bet.resolvedOption === opt;
            const isLoser = isResolved && bet.resolvedOption !== opt && hasAny;

            // 1:1 mode computed values
            const takenBySide = firstTakerByOption[opt];
            const takenByOther = is1v1 && takenBySide && takenBySide.userId !== user?.id;
            const lockedInPrivate = is1v1 && takenByOther && !mySide;
            const isMyAvailableSideInPrivate = is1v1 && !takenBySide && !mySide;
            const isClickable =
              isLive && !mySide && waiting && !lockedInPrivate;

            return (
              <div
                key={opt}
                className={`rounded-xl border px-4 py-3 ${
                  isWinner
                    ? "border-win/40 bg-win/5"
                    : isLoser
                    ? "border-loss/20 bg-loss/5 opacity-60"
                    : isMySide
                    ? "border-accent/40 bg-accent/5"
                    : lockedInPrivate
                    ? "border-border bg-surface opacity-60"
                    : isMyAvailableSideInPrivate
                    ? "border-accent bg-accent/5"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isWinner && (
                      <span className="text-win">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                    <span className={`font-semibold text-sm ${isWinner ? "text-win" : isMySide ? "text-accent" : isMyAvailableSideInPrivate ? "text-accent" : "text-text"}`}>
                      {opt}
                    </span>
                    {isMySide && <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">You</span>}
                    {lockedInPrivate && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-border">
                        Taken · {takenBySide?.user?.name ?? "Someone"}
                      </span>
                    )}
                    {isMyAvailableSideInPrivate && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                        Your side →
                      </span>
                    )}
                  </div>
                  {!is1v1 && (
                    <span className="text-xs text-subtle">{optSides.length} {optSides.length === 1 ? "person" : "people"}</span>
                  )}
                </div>
                {optSides.length > 0 && !is1v1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {optSides.map((s) => (
                      <div key={s.id} className="flex items-center gap-1">
                        <Avatar user={s.user} size="sm" />
                        <span className="text-xs text-muted">{s.user.id === user?.id ? "You" : s.user.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isLive && !mySide && waiting && (
                  <button
                    onClick={() => isClickable && joinBet(opt)}
                    disabled={joining !== null || !isClickable}
                    className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                      lockedInPrivate
                        ? "bg-surface-2 text-muted border border-border cursor-not-allowed opacity-60"
                        : "bg-accent hover:bg-accent-2 disabled:opacity-40 text-white"
                    }`}
                  >
                    {joining === opt ? "Joining…" : lockedInPrivate ? "Taken" : `Take ${opt} · ${bet.stake} chips`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {waiting && isLive && !mySide && (
          <p className="text-xs text-subtle text-center mt-3">
            Pick a side to lock it in.
          </p>
        )}
        {waiting && isLive && mySide && (
          <div className="mt-3 p-3 rounded-xl bg-pending/5 border border-pending/20 text-center">
            <p className="text-pending text-sm font-medium">Waiting for someone to take the other side</p>
            <button
              onClick={copyShareLink}
              className="mt-2 text-xs text-accent hover:underline flex items-center gap-1 mx-auto"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
              {shareMsg || "Copy bet link to share"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-loss text-sm mb-3 px-1">{error}</p>
      )}

      {/* Resolve */}
      {isLive && !waiting && iAmProposer && (
        <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-sm">
          {!showResolve ? (
            <button
              onClick={() => setShowResolve(true)}
              className="w-full py-2.5 rounded-xl bg-accent/5 border border-accent/20 text-accent font-semibold text-sm hover:bg-accent/10 transition-colors"
            >
              Resolve bet
            </button>
          ) : (
            <div>
              <p className="text-sm font-medium text-text mb-3">Who won?</p>
              <div className="flex gap-2 mb-3">
                {bet.sides.map((side) => (
                  <button
                    key={side.userId}
                    onClick={() => setResolveWinnerId(side.userId)}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      resolveWinnerId === side.userId
                        ? "bg-win border-win text-white"
                        : "bg-surface border-border text-muted hover:border-border-2"
                    }`}
                  >
                    <Avatar user={side.user} size="sm" />
                    {side.userId === user?.id ? "You" : (side.user.name ?? side.user.id)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowResolve(false); setResolveWinnerId(""); }}
                  className="flex-1 py-2 rounded-xl border border-border text-muted text-sm hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={resolveBet}
                  disabled={!resolveWinnerId || resolving}
                  className="flex-1 py-2 rounded-xl bg-win text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {resolving ? "Resolving…" : "Confirm"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resolution result */}
      {isResolved && mySide && (
        <div className={`rounded-2xl p-5 mb-4 text-center border ${
          mySide.status === "won"
            ? "bg-win/5 border-win/25"
            : "bg-loss/5 border-loss/25"
        }`}>
          <div className={`flex justify-center mb-2 ${mySide.status === "won" ? "text-win" : "text-loss"}`}>
            {mySide.status === "won" ? (
              <TrophyIcon />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
          </div>
          <p className={`text-xl font-bold ${mySide.status === "won" ? "text-win" : "text-loss"}`}>
            {mySide.status === "won" ? "You Won!" : "You Lost"}
          </p>
          {mySide.status === "won" && (
            <p className="text-muted text-sm mt-1">
              +{Math.floor(bet.totalPot / (sidesByOption[mySide.option]?.length ?? 1)).toLocaleString()} chips
            </p>
          )}
          {bet.resolutionNote && (
            <p className="text-subtle text-xs mt-2">{bet.resolutionNote}</p>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-text mb-3">
          Trash talk {bet.comments.length > 0 && <span className="text-subtle font-normal">({bet.comments.length})</span>}
        </h2>

        {bet.comments.length === 0 && (
          <p className="text-subtle text-xs mb-3">No comments yet. Trash talk away.</p>
        )}

        <div className="space-y-3 mb-3">
          {bet.comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar user={c.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-text">
                    {c.user.id === user?.id ? "You" : c.user.name}
                  </span>
                  <span className="text-xs text-subtle">
                    {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-sm text-muted mt-0.5">{c.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && postComment()}
            placeholder="Add a comment…"
            className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
          <button
            onClick={postComment}
            disabled={!comment.trim() || postingComment}
            className="px-3 py-2 rounded-xl bg-accent disabled:opacity-40 text-white text-sm hover:bg-accent-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ bet, userId }: { bet: Bet; userId: string }) {
  const mySide = bet.sides.find((s) => s.userId === userId);
  if (bet.resolution === "resolved") {
    if (!mySide) return <span className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-muted border border-border font-medium">Resolved</span>;
    const won = mySide.status === "won";
    return (
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${won ? "bg-win/10 text-win border-win/20" : "bg-loss/10 text-loss border-loss/20"}`}>
        {won ? "Won" : "Lost"}
      </span>
    );
  }
  if (bet.sides.length < 2) {
    return <span className="text-xs px-2.5 py-1 rounded-full bg-pending/10 text-pending border border-pending/20 font-medium">Open</span>;
  }
  return (
    <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-medium inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      Live
    </span>
  );
}
