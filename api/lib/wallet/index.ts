export * from "./types";
export { ensureWalletSchema } from "./migrate";
export { getBalance } from "./getBalance";
export { grant, type GrantInput } from "./grant";
export {
  joinBet,
  joinBetInTx,
  type JoinBetInput,
  type JoinBetResult,
} from "./joinBet";
export {
  resolveBet,
  resolveBetInTx,
  type ResolveBetInput,
  type ResolveBetResult,
  type ResolveBetPayout,
} from "./resolveBet";
export {
  refundBet,
  refundBetInTx,
  type RefundBetInput,
  type RefundBetResult,
  type RefundBetRefund,
} from "./refundBet";
export { reverseBetResolution, type ReverseBetInput } from "./reverseBet";
export { reconcileWallet, reconcileAll, type ReconciliationReport, type WalletDrift } from "./reconcile";
export { lookupIdempotencyRequest, storeIdempotencyRequest, hashRequest, type ReplayedResponse } from "./idempotency";
// Re-export InteractiveTx type so routes can type-annotate helpers
// that accept an open transaction.
export type { InteractiveTx } from "../db";
