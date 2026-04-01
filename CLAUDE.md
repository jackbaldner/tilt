# Tilt — Social Betting App

## Architecture
- **Monorepo**: `api/` (Next.js backend) + `mobile/` (Expo iOS app)
- **API**: Next.js 16.2.2 at `api/`, deployed to Vercel
- **Mobile**: Expo SDK 53, Expo Router, NativeWind (dark mode default)
- **Database**: SQLite via `better-sqlite3` (raw SQL, no ORM — Prisma 7 was abandoned due to adapter breaking changes)
- **Auth**: JWT (90-day tokens), `jsonwebtoken`, Google OAuth via Expo AuthSession
- **AI**: Anthropic claude-sonnet-4-6 for bet suggestions, polishing, and resolution

## Key Technical Decisions
- **No Prisma client**: All DB calls use `api/lib/db.ts` helpers (`one`, `all`, `run`, `transaction`)
- **`Transaction` table**: SQLite keyword — always backtick-quote: `` `Transaction` ``
- **Metro monorepo config**: `mobile/metro.config.js` sets `watchFolders` and `nodeModulesPaths` for npm workspaces
- **Bundle path**: Metro resolves as `/mobile/index.ts.bundle` (monorepo root context)

## Running Locally
```bash
# API (port 3000)
cd api && npm run dev

# Mobile (Expo Go)
cd mobile && npx expo start --lan
# Scan QR with Expo Go, or connect to exp://192.168.0.202:8081
```

## Environment Variables
```
api/.env:
  DATABASE_URL="file:./prisma/dev.db"
  NEXTAUTH_SECRET="tilt-super-secret-key-change-in-prod-32chars"
  ANTHROPIC_API_KEY="<your key>"

mobile/.env:
  EXPO_PUBLIC_API_URL=http://192.168.0.202:3000
```

## Database
- Path: `api/prisma/dev.db`
- Schema: `api/prisma/schema.prisma` (for reference only — not used by Prisma client)
- Create tables: `node -e "require('./lib/db').getDb()"` (auto-creates via Prisma migrate)
- Or run: `cd api && npx prisma migrate dev`

## API Routes
- `POST /api/auth/mobile-token` — create/login user, get JWT
- `GET/POST /api/circles` — list / create circles
- `GET/PATCH/DELETE /api/circles/[id]` — circle detail
- `GET /api/circles/[id]/bets` — bets in circle
- `GET /api/circles/[id]/leaderboard` — member rankings
- `GET /api/circles/[id]/activity` — activity feed
- `GET/POST /api/circles/[id]/invite` — invite management
- `GET/POST /api/circles/join/[code]` — join via invite
- `POST /api/bets` — create bet
- `GET /api/bets/[id]` — bet detail with sides/comments
- `POST /api/bets/[id]/sides` — join bet (pick side)
- `POST /api/bets/[id]/resolve` — resolve bet, distribute chips
- `GET/POST /api/bets/[id]/comments` — trash talk
- `POST /api/bets/[id]/dispute` — dispute resolution
- `GET/PATCH /api/users/me` — profile
- `GET /api/users/[id]/stats` — stats
- `GET/PATCH /api/notifications` — notifications
- `POST /api/ai/suggest-bet` — AI bet ideas
- `POST /api/ai/polish-bet` — AI improve bet text
- `POST /api/ai/resolve-bet` — AI attempt resolution

## Mobile Screens
- `app/(auth)/login.tsx` — login with email or demo account
- `app/(tabs)/index.tsx` — circles list
- `app/(tabs)/feed.tsx` — activity feed
- `app/(tabs)/notifications.tsx` — notifications
- `app/(tabs)/profile.tsx` — user profile + stats
- `app/circle/[id].tsx` — circle detail (bets/leaderboard/activity tabs)
- `app/bet/[id].tsx` — bet detail with join/resolve/trash talk
- `app/bet/create.tsx` — create bet with AI suggestions
- `app/join/[code].tsx` — join circle via invite link
