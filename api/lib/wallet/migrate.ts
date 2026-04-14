import { run } from "../db";
import * as fs from "fs";
import * as path from "path";

export async function ensureWalletSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  // Split on `;` followed by whitespace/newline, run each statement individually
  const statements = ddl
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await run(stmt);
  }

  // Seed system wallets (idempotent via INSERT OR IGNORE)
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_mint_chips', 'system', 'SYSTEM_MINT', 'CHIPS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_house_chips', 'system', 'SYSTEM_HOUSE', 'CHIPS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_mint_coins', 'system', 'SYSTEM_MINT', 'COINS', 0)`
  );
  await run(
    `INSERT OR IGNORE INTO Wallet (id, owner_type, owner_id, currency, balance)
     VALUES ('sys_house_coins', 'system', 'SYSTEM_HOUSE', 'COINS', 0)`
  );
}
