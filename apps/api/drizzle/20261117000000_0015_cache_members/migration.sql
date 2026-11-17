CREATE TABLE cache_members (
  owner TEXT NOT NULL,
  actor TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX cache_members_owner_actor ON cache_members(owner, actor);
