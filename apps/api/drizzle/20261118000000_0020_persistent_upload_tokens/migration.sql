CREATE TABLE cache_tokens_new (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);
--> statement-breakpoint
INSERT INTO cache_tokens_new SELECT id, owner, actor, created_at, expires_at, active FROM cache_tokens;
--> statement-breakpoint
DROP TABLE cache_tokens;
--> statement-breakpoint
ALTER TABLE cache_tokens_new RENAME TO cache_tokens;
--> statement-breakpoint
CREATE INDEX cache_tokens_owner ON cache_tokens (owner, id);
