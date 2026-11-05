CREATE TABLE plugin_records (
  uri TEXT PRIMARY KEY NOT NULL, cid TEXT, author TEXT NOT NULL,
  name TEXT, description TEXT, version TEXT, published_at TEXT,
  license TEXT, url TEXT, sha256 TEXT, size INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0, event_time INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX plugin_name_author ON plugin_records(name, author);
--> statement-breakpoint
CREATE INDEX plugin_page ON plugin_records(published_at, uri);
--> statement-breakpoint
CREATE TABLE checkpoints (source TEXT PRIMARY KEY NOT NULL, time_us INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE accounts (did TEXT PRIMARY KEY NOT NULL, active INTEGER NOT NULL, event_time INTEGER NOT NULL);
