CREATE TABLE plugin_download_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  uri TEXT NOT NULL REFERENCES plugin_records(uri) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX plugin_download_events_date ON plugin_download_events(date);
