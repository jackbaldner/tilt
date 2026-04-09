import { run } from "./db";

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
}
