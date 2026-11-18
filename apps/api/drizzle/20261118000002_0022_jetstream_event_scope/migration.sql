ALTER TABLE jetstream_events ADD COLUMN did TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE jetstream_events ADD COLUMN collection TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE jetstream_events ADD COLUMN event_time INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX jetstream_events_actor ON jetstream_events(did);
