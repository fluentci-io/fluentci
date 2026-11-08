ALTER TABLE plugin_records ADD COLUMN topics TEXT;
--> statement-breakpoint
ALTER TABLE plugin_records ADD COLUMN os TEXT;
--> statement-breakpoint
ALTER TABLE plugin_records ADD COLUMN arch TEXT;
--> statement-breakpoint
ALTER TABLE plugin_records ADD COLUMN readme_url TEXT;
--> statement-breakpoint
ALTER TABLE plugin_records ADD COLUMN downloads INTEGER NOT NULL DEFAULT 0 CHECK (downloads >= 0);
