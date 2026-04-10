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
}
