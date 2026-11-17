CREATE TABLE cache_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX cache_tokens_owner ON cache_tokens (owner, id);
