import { all, one } from "../db";

export interface WalletDrift {
  walletId: string;
  ownerType: string;
  ownerId: string;
  currency: string;
  cachedBalance: number;
  ledgerBalance: number;
  drift: number;
}

export interface ReconciliationReport {
  ok: boolean;
  invariantHolds: boolean;
  walletCount: number;
  drifted: WalletDrift[];
  totalBalanceSum: number;
}

export async function reconcileWallet(walletId: string): Promise<WalletDrift | null> {
  const wallet = await one<{
    id: string;
    owner_type: string;
    owner_id: string;
    currency: string;
    balance: number;
  }>("SELECT * FROM Wallet WHERE id = ?", [walletId]);
  if (!wallet) return null;

  const credits = await one<{ s: number | null }>(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM LedgerEntry WHERE to_wallet_id = ?",
    [walletId]
  );
  const debits = await one<{ s: number | null }>(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM LedgerEntry WHERE from_wallet_id = ?",
    [walletId]
  );
  const ledgerBalance = (credits?.s ?? 0) - (debits?.s ?? 0);
  const drift = wallet.balance - ledgerBalance;

  if (drift === 0) return null;
  return {
    walletId: wallet.id,
    ownerType: wallet.owner_type,
    ownerId: wallet.owner_id,
    currency: wallet.currency,
    cachedBalance: wallet.balance,
    ledgerBalance,
    drift,
  };
}

export async function reconcileAll(): Promise<ReconciliationReport> {
  const wallets = await all<{ id: string }>("SELECT id FROM Wallet");
  const drifted: WalletDrift[] = [];
  for (const w of wallets) {
    const d = await reconcileWallet(w.id);
    if (d) drifted.push(d);
  }

  const totalRow = await one<{ s: number | null }>("SELECT COALESCE(SUM(balance), 0) AS s FROM Wallet");
  const totalBalanceSum = totalRow?.s ?? 0;

  return {
    ok: drifted.length === 0 && totalBalanceSum === 0,
    invariantHolds: totalBalanceSum === 0,
    walletCount: wallets.length,
    drifted,
    totalBalanceSum,
  };
}
