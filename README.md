# Tilt

A social betting app — make bets with friends in circles, track standings on a leaderboard, and let AI suggest and resolve bets.

## Stack

| Layer | Tech |
|-------|------|
| API | Next.js 16 (App Router), deployed on Vercel |
| Mobile | Expo SDK 53 + Expo Router, NativeWind (dark mode) |
| Database | SQLite via `better-sqlite3` (raw SQL helpers) |
| Auth | JWT (90-day), Google OAuth via Expo AuthSession |
| AI | Anthropic Claude Sonnet 4.6 |

## Structure

```
tilt/
├── api/        # Next.js API (runs on Vercel)
└── mobile/     # Expo iOS app
```

## Quick Start

```bash
# 1. Install deps
npm install          # root (workspaces)
cd api && npm install
cd mobile && npm install

# 2. Set env vars
cp api/.env.example api/.env   # add ANTHROPIC_API_KEY

# 3. Start API
cd api && npm run dev          # http://localhost:3000

# 4. Start mobile
cd mobile && npx expo start --lan
# Scan QR with Expo Go app
```

## Environment Variables

**`api/.env`**
```
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_SECRET="your-secret-32-chars"
ANTHROPIC_API_KEY="sk-ant-..."
```

**`mobile/.env`**
```
EXPO_PUBLIC_API_URL=http://<your-local-ip>:3000
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/mobile-token` | Login / create user, get JWT |
| GET/POST | `/api/circles` | List / create circles |
| GET/PATCH/DELETE | `/api/circles/:id` | Circle detail |
| GET | `/api/circles/:id/bets` | Bets in circle |
| GET | `/api/circles/:id/leaderboard` | Member rankings |
| GET | `/api/circles/:id/activity` | Activity feed |
| GET/POST | `/api/circles/:id/invite` | Invite management |
| GET | `/api/circles/join/:code` | Join via invite link |
| POST | `/api/bets` | Create bet |
| GET | `/api/bets/:id` | Bet detail with sides & comments |
| POST | `/api/bets/:id/sides` | Join a bet (pick a side) |
| POST | `/api/bets/:id/resolve` | Resolve bet, distribute chips |
| GET/POST | `/api/bets/:id/comments` | Trash talk |
| POST | `/api/bets/:id/dispute` | Dispute resolution |
| GET/PATCH | `/api/users/me` | Profile |
| GET | `/api/users/:id/stats` | User stats |
| GET/PATCH | `/api/notifications` | Notifications |
| POST | `/api/ai/suggest-bet` | AI-generated bet ideas |
| POST | `/api/ai/polish-bet` | AI improves bet wording |
| POST | `/api/ai/resolve-bet` | AI attempts to resolve bet |

## Database

Schema lives in `api/prisma/schema.prisma` (reference only — not used via Prisma client).

Raw SQL helpers in `api/lib/db.ts`: `one()`, `all()`, `run()`, `transaction()`.

To reset the database:
```bash
cd api
rm prisma/dev.db
npx prisma migrate dev
```

## Deployment

**API → Vercel:**
```bash
cd api && vercel --prod
```
Set `NEXTAUTH_SECRET` and `ANTHROPIC_API_KEY` in Vercel project settings.

Note: SQLite doesn't persist on Vercel serverless. For production, migrate to Turso (libSQL) or PlanetScale.

**Mobile → EAS:**
```bash
cd mobile && eas build --platform ios
```
