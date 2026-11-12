ALTER TABLE module_likes ADD COLUMN subject_uri TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE module_likes ADD COLUMN subject_cid TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- The pre-release deterministic-key format did not reference plugin records.
-- Keep its tombstones, but do not count records without a strong reference.
UPDATE module_likes SET active = 0 WHERE subject_uri = '';
--> statement-breakpoint
CREATE INDEX module_likes_subject_uri ON module_likes(subject_uri, active);
--> statement-breakpoint
-- Repair indexes skipped by the earlier migration's unsplit statements.
CREATE INDEX IF NOT EXISTS module_likes_subject ON module_likes(subject_author, name, active, actor);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS module_likes_actor ON module_likes(actor, active);
--> statement-breakpoint
-- Replay recently skipped strong-reference events after the decoder upgrade.
UPDATE checkpoints SET time_us = min(time_us, max(0, unixepoch() * 1000000 - 3600000000));
