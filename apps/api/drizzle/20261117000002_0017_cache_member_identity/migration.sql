-- Keep a single grant per owner/actor when upgrading a database created by
-- a driver that prepared only the first statement of migration 0015.
DELETE FROM cache_members WHERE rowid NOT IN (
  SELECT MAX(rowid) FROM cache_members GROUP BY owner, actor
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cache_members_owner_actor ON cache_members(owner, actor);
