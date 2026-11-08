CREATE TABLE plugin_download_days (
  uri TEXT NOT NULL REFERENCES plugin_records(uri) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  downloads INTEGER NOT NULL DEFAULT 0 CHECK (downloads >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX plugin_download_days_uri_date ON plugin_download_days(uri, date);
