CREATE TABLE cache_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  label TEXT NOT NULL,
  digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);
CREATE INDEX cache_credentials_owner ON cache_credentials(owner, created_at);
