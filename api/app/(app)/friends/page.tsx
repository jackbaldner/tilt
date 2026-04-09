"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/app/providers";

interface Friend {
  friendshipId: string;
  id: string;
  name: string;
  email: string;
  username?: string;
  image?: string;
  chips: number;
  totalBets?: number;
  wonBets?: number;
}

interface FriendRequest {
  friendshipId: string;
  id: string;
  name: string;
  email: string;
  username?: string;
  image?: string;
  createdAt: string;
}

interface SearchUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  image?: string;
}

function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${s} rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent flex-shrink-0`}>
      {(name ?? "?")[0]?.toUpperCase()}
    </div>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function FriendsPage() {
  const { authFetch } = useApiClient();
  const router = useRouter();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [challenging, setChallenging] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const load = useCallback(async () => {
    const [fr, rr] = await Promise.all([
      authFetch("/api/friends"),
      authFetch("/api/friends/requests"),
    ]);
    if (fr.ok) {
      const d = await fr.json();
      setFriends(d.friends ?? []);
    }
    if (rr.ok) {
      const d = await rr.json();
      setRequests(d.requests ?? []);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const d = await res.json();
          setSearchResults(d.users ?? []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, authFetch]);

  async function sendRequest(identifier: string, userId: string) {
    setSending(userId);
    const res = await authFetch("/api/friends", {
      method: "POST",
      body: JSON.stringify({ identifier }),
    });
    setSending(null);
    if (res.ok) {
      const d = await res.json();
      if (d.status === "accepted") {
        showToast("Now friends!");
        load();
      } else {
        showToast("Friend request sent!");
        setSentTo((prev) => new Set(prev).add(userId));
      }
    } else {
      const d = await res.json();
      showToast(d.error ?? "Error sending request");
    }
  }

  async function respond(friendshipId: string, action: "accept" | "decline") {
    setRespondingTo(friendshipId);
    await authFetch(`/api/friends/${friendshipId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
    setRespondingTo(null);
    showToast(action === "accept" ? "Friend added!" : "Request declined");
    load();
  }

  async function removeFriend(friendshipId: string) {
    await authFetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
    showToast("Friend removed");
    load();
  }

  async function challenge(friendshipId: string) {
    setChallenging(friendshipId);
    const res = await authFetch(`/api/friends/${friendshipId}/challenge`, { method: "POST" });
    setChallenging(null);
    if (res.ok) {
      const d = await res.json();
      router.push(`/bet/new?circleId=${d.circleId}`);
    } else {
      showToast("Could not start challenge");
    }
  }

  async function copyInviteLink() {
    const link = `${window.location.origin}/invite`;
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const winRate = (f: Friend) =>
    f.totalBets && f.totalBets > 0
      ? Math.round(((f.wonBets ?? 0) / f.totalBets) * 100)
      : null;

  const friendIds = new Set(friends.map((f) => f.id));
  const requesterIds = new Set(requests.map((r) => r.id));

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-text">Friends</h1>
        <button
          onClick={() => { setShowAddFriend(!showAddFriend); setSearchQuery(""); setSearchResults([]); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-2 transition-colors"
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Friend
        </button>
      </div>

      {/* Add Friend panel */}
      {showAddFriend && (
        <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-sm">
          <p className="text-sm font-medium text-text mb-3">Find by username or email</p>
          <div className="relative mb-3">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">
              <SearchIcon />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search username or email..."
              autoFocus
              className="w-full bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text placeholder-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
            />
          </div>

          {searching && (
            <p className="text-subtle text-xs text-center py-2">Searching…</p>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((u) => {
                const alreadyFriend = friendIds.has(u.id);
                const sentRequest = sentTo.has(u.id);
                const hasPending = requesterIds.has(u.id);
                return (
                  <div key={u.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <Avatar name={u.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{u.name ?? u.email}</p>
                      {u.username && <p className="text-xs text-subtle">@{u.username}</p>}
                    </div>
                    {alreadyFriend ? (
                      <span className="text-xs text-muted">Friends</span>
                    ) : hasPending ? (
                      <span className="text-xs text-pending">Wants to add you</span>
                    ) : sentRequest ? (
                      <span className="text-xs text-muted">Sent</span>
                    ) : (
                      <button
                        onClick={() => sendRequest(u.email, u.id)}
                        disabled={sending === u.id}
                        className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-accent-2 transition-colors"
                      >
                        {sending === u.id ? "…" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-subtle text-sm text-center py-3">No users found</p>
          )}

          <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
            <span className="text-xs text-muted">Or share your invite link</span>
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted hover:text-text hover:border-border-2 transition-colors"
            >
              <LinkIcon />
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
      )}

      {/* Pending requests */}
      {requests.length > 0 && (
        <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-sm">
          <h2 className="text-sm font-semibold text-text mb-3">
            Friend requests
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-accent text-white text-xs font-bold rounded-full">{requests.length}</span>
          </h2>
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.friendshipId} className="flex items-center gap-3">
                <Avatar name={r.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{r.name ?? r.email}</p>
                  {r.username && <p className="text-xs text-subtle">@{r.username}</p>}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => respond(r.friendshipId, "accept")}
                    disabled={respondingTo === r.friendshipId}
                    className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center hover:bg-accent hover:text-white transition-colors disabled:opacity-40"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    onClick={() => respond(r.friendshipId, "decline")}
                    disabled={respondingTo === r.friendshipId}
                    className="w-8 h-8 rounded-lg bg-surface border border-border text-muted flex items-center justify-center hover:text-loss hover:border-loss/30 transition-colors disabled:opacity-40"
                  >
                    <XIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      {friends.length === 0 && requests.length === 0 && !showAddFriend ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3 text-accent">
            <UserIcon />
          </div>
          <p className="text-text font-semibold mb-1">No friends yet</p>
          <p className="text-muted text-sm mb-4">Add friends to challenge them to bets.</p>
          <button
            onClick={() => setShowAddFriend(true)}
            className="px-4 py-2 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent-2 transition-colors"
          >
            Add your first friend
          </button>
        </div>
      ) : friends.length > 0 ? (
        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-text">{friends.length} {friends.length === 1 ? "Friend" : "Friends"}</h2>
          </div>
          <div className="divide-y divide-border">
            {friends.map((f) => {
              const wr = winRate(f);
              return (
                <div key={f.friendshipId} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={f.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text truncate">{f.name ?? f.email}</p>
                      {f.username && <span className="text-xs text-subtle">@{f.username}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted">{f.chips.toLocaleString()} chips</span>
                      {wr !== null && (
                        <>
                          <span className="text-subtle text-xs">·</span>
                          <span className={`text-xs ${wr >= 50 ? "text-win" : "text-muted"}`}>{wr}% wins</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => challenge(f.friendshipId)}
                      disabled={challenging === f.friendshipId}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-accent/10 border border-accent/20 text-accent rounded-lg text-xs font-semibold hover:bg-accent hover:text-white transition-colors disabled:opacity-40"
                    >
                      <LightningIcon />
                      {challenging === f.friendshipId ? "…" : "Challenge"}
                    </button>
                    <button
                      onClick={() => removeFriend(f.friendshipId)}
                      className="w-7 h-7 rounded-lg border border-border text-subtle flex items-center justify-center hover:text-loss hover:border-loss/30 transition-colors"
                      title="Remove friend"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-text text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
