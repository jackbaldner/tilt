// Update this to your deployed API URL in production
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export const ENDPOINTS = {
  // Auth
  mobileToken: "/api/auth/mobile-token",
  signup: "/api/auth/signup",

  // Friends
  friends: "/api/friends",
  friendRequests: "/api/friends/requests",
  friend: (id: string) => `/api/friends/${id}`,
  friendChallenge: (id: string) => `/api/friends/${id}/challenge`,

  // Circles
  circles: "/api/circles",
  circle: (id: string) => `/api/circles/${id}`,
  circleActivity: (id: string) => `/api/circles/${id}/activity`,
  circleLeaderboard: (id: string) => `/api/circles/${id}/leaderboard`,
  circleInvite: (id: string) => `/api/circles/${id}/invite`,
  circleBets: (id: string) => `/api/circles/${id}/bets`,
  joinCircle: (code: string) => `/api/circles/join/${code}`,

  // Bets
  bets: "/api/bets",
  bet: (id: string) => `/api/bets/${id}`,
  betSides: (id: string) => `/api/bets/${id}/sides`,
  betResolve: (id: string) => `/api/bets/${id}/resolve`,
  betDispute: (id: string) => `/api/bets/${id}/dispute`,
  betComments: (id: string) => `/api/bets/${id}/comments`,

  // Users
  me: "/api/users/me",
  userStats: (id: string) => `/api/users/${id}/stats`,

  // Notifications
  notifications: "/api/notifications",

  // AI
  suggestBet: "/api/ai/suggest-bet",
  polishBet: "/api/ai/polish-bet",
  resolveBet: "/api/ai/resolve-bet",
};
