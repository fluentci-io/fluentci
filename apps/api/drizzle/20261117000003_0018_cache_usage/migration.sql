CREATE TABLE cache_usage_owners (owner TEXT PRIMARY KEY NOT NULL);
--> statement-breakpoint
CREATE TABLE cache_usage (
  owner TEXT NOT NULL,
  date TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  key_count INTEGER NOT NULL CHECK (key_count >= 0),
  observed_at TEXT NOT NULL,
  PRIMARY KEY (owner, date)
);
