CREATE TABLE IF NOT EXISTS cache_keys (
    account TEXT NOT NULL,
    key TEXT NOT NULL,
    protocol TEXT NOT NULL,
    size INTEGER NOT NULL,
    last_modified TEXT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account, key)
);
CREATE INDEX IF NOT EXISTS cache_keys_size ON cache_keys(account, size, key);
CREATE INDEX IF NOT EXISTS cache_keys_updated ON cache_keys(account, last_modified, key);
CREATE INDEX IF NOT EXISTS cache_keys_protocol ON cache_keys(account, protocol, key);
CREATE VIRTUAL TABLE IF NOT EXISTS cache_keys_fts USING fts5(key, content='cache_keys', content_rowid='rowid', tokenize='trigram');
CREATE TRIGGER IF NOT EXISTS cache_keys_insert AFTER INSERT ON cache_keys BEGIN
    INSERT INTO cache_keys_fts(rowid, key) VALUES (new.rowid, new.key);
END;
CREATE TRIGGER IF NOT EXISTS cache_keys_delete AFTER DELETE ON cache_keys BEGIN
    INSERT INTO cache_keys_fts(cache_keys_fts, rowid, key) VALUES ('delete', old.rowid, old.key);
END;
CREATE TRIGGER IF NOT EXISTS cache_keys_update AFTER UPDATE OF key ON cache_keys BEGIN
    INSERT INTO cache_keys_fts(cache_keys_fts, rowid, key) VALUES ('delete', old.rowid, old.key);
    INSERT INTO cache_keys_fts(rowid, key) VALUES (new.rowid, new.key);
END;
CREATE TABLE IF NOT EXISTS cache_index_state (id INTEGER PRIMARY KEY CHECK(id=1), ready INTEGER NOT NULL);
