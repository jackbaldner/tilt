import { run, all } from "./db";

let initialized = false;

export async function ensureFriendshipTable() {
  if (initialized) return;
  initialized = true;
  await run(`
    CREATE TABLE IF NOT EXISTS Friendship (
      id TEXT PRIMARY KEY,
      requesterId TEXT NOT NULL,
      addresseeId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(requesterId, addresseeId)
    )
  `);
  // Add password_hash column to User if it doesn't exist yet
  try {
    await run("ALTER TABLE User ADD COLUMN password_hash TEXT");
  } catch {
    // Column already exists — ignore
  }
  // Add username column to User if it doesn't exist yet
  try {
    await run("ALTER TABLE User ADD COLUMN username TEXT");
  } catch {
    // Column already exists — ignore
  }
  // Add password reset token columns
  try {
    await run("ALTER TABLE User ADD COLUMN reset_token TEXT");
  } catch {}
  try {
    await run("ALTER TABLE User ADD COLUMN reset_token_expires TEXT");
  } catch {}

  // Make Bet.circleId nullable so bets can exist without a circle
  try {
    const tableInfo = await all<any>("PRAGMA table_info(Bet)");
    const circleIdCol = tableInfo.find((c: any) => c.name === "circleId");
    if (circleIdCol && circleIdCol.notnull === 1) {
      await run("PRAGMA foreign_keys = OFF");
      await run('DROP TABLE IF EXISTS "_Bet_migration"');
      await run(`CREATE TABLE "_Bet_migration" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "circleId" TEXT,
        "proposerId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "type" TEXT NOT NULL,
        "stake" INTEGER NOT NULL,
        "options" TEXT NOT NULL,
        "resolveAt" DATETIME,
        "resolvedAt" DATETIME,
        "resolvedOption" TEXT,
        "resolution" TEXT NOT NULL DEFAULT 'pending',
        "resolutionNote" TEXT,
        "aiResolvable" BOOLEAN NOT NULL DEFAULT false,
        "aiResolutionUrl" TEXT,
        "totalPot" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )`);
      await run(`INSERT INTO "_Bet_migration" SELECT * FROM "Bet"`);
      await run(`DROP TABLE "Bet"`);
      await run(`ALTER TABLE "_Bet_migration" RENAME TO "Bet"`);
      await run("PRAGMA foreign_keys = ON");
    }
  } catch {
    // Migration not needed or DB doesn't support PRAGMA (e.g. Turso)
  }
}
