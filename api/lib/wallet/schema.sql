CREATE TABLE IF NOT EXISTS Wallet (
  id            TEXT PRIMARY KEY,
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('user', 'bet_escrow', 'system')),
  owner_id      TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  balance       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_type, owner_id, currency)
);
CREATE INDEX IF NOT EXISTS idx_wallet_owner ON Wallet (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS LedgerEntry (
  id                 TEXT PRIMARY KEY,
  from_wallet_id     TEXT NOT NULL REFERENCES Wallet(id),
  to_wallet_id       TEXT NOT NULL REFERENCES Wallet(id),
  amount             INTEGER NOT NULL CHECK (amount > 0),
  currency           TEXT NOT NULL CHECK (currency IN ('CHIPS', 'COINS')),
  entry_type         TEXT NOT NULL CHECK (entry_type IN ('grant', 'join', 'resolve', 'refund', 'reverse')),
  ref_type           TEXT,
  ref_id             TEXT,
  reverses_entry_id  TEXT REFERENCES LedgerEntry(id),
  idempotency_key    TEXT UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_from ON LedgerEntry (from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_to ON LedgerEntry (to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON LedgerEntry (ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON LedgerEntry (entry_type);

CREATE TABLE IF NOT EXISTS IdempotencyRequest (
  key            TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  request_hash   TEXT NOT NULL,
  response_json  TEXT NOT NULL,
  status_code    INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON IdempotencyRequest (created_at);
