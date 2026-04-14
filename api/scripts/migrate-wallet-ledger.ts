/* eslint-disable no-console */
import { run, all } from "../lib/db";
import { ensureWalletSchema } from "../lib/wallet/migrate";
import { grant, reconcileAll } from "../lib/wallet";

async function main() {
  console.log("→ Ensuring wallet schema...");
  await ensureWalletSchema();

  console.log("→ Wiping in-progress bet state...");
  // Delete BetSide rows for any bet that's not in a terminal state
  const openBets = await all<{ id: string }>(
    "SELECT id FROM Bet WHERE resolution = 'pending'"
  );
  for (const b of openBets) {
    await run("DELETE FROM BetSide WHERE betId = ?", [b.id]);
    await run("DELETE FROM Bet WHERE id = ?", [b.id]);
  }
  console.log(`  Removed ${openBets.length} open bets.`);

  console.log("→ Re-granting all existing users 1000 chips...");
  const users = await all<{ id: string }>("SELECT id FROM User");
  for (const u of users) {
    await grant({
      userId: u.id,
      currency: "CHIPS",
      amount: 1000,
      reason: "migration_initial_grant",
    });
  }
  console.log(`  Granted to ${users.length} users.`);

  console.log("→ Dropping legacy columns and tables...");
  // SQLite 3.35+ supports DROP COLUMN
  try {
    await run("ALTER TABLE User DROP COLUMN chips");
    console.log("  Dropped User.chips");
  } catch (e) {
    console.warn("  Could not drop User.chips (may already be gone):", String(e));
  }
  try {
    await run("ALTER TABLE CircleMember DROP COLUMN chips");
    console.log("  Dropped CircleMember.chips");
  } catch (e) {
    console.warn("  Could not drop CircleMember.chips:", String(e));
  }
  try {
    await run("DROP TABLE IF EXISTS `Transaction`");
    console.log("  Dropped Transaction table");
  } catch (e) {
    console.warn("  Could not drop Transaction:", String(e));
  }

  console.log("→ Running reconciliation...");
  const report = await reconcileAll();
  if (!report.ok) {
    console.error("✗ Reconciliation FAILED:", report);
    process.exit(1);
  }
  console.log(`✓ Migration complete. ${report.walletCount} wallets, invariant holds.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
