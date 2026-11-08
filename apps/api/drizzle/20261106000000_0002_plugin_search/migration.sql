CREATE VIRTUAL TABLE plugin_search USING fts5(
  uri UNINDEXED, name, description,
  content='plugin_records', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);
--> statement-breakpoint
CREATE TRIGGER plugin_search_insert AFTER INSERT ON plugin_records BEGIN
  INSERT INTO plugin_search(rowid, uri, name, description)
  VALUES (new.rowid, new.uri, new.name, new.description);
END;
--> statement-breakpoint
CREATE TRIGGER plugin_search_delete AFTER DELETE ON plugin_records BEGIN
  INSERT INTO plugin_search(plugin_search, rowid, uri, name, description)
  VALUES ('delete', old.rowid, old.uri, old.name, old.description);
END;
--> statement-breakpoint
CREATE TRIGGER plugin_search_update AFTER UPDATE ON plugin_records BEGIN
  INSERT INTO plugin_search(plugin_search, rowid, uri, name, description)
  VALUES ('delete', old.rowid, old.uri, old.name, old.description);
  INSERT INTO plugin_search(rowid, uri, name, description)
  VALUES (new.rowid, new.uri, new.name, new.description);
END;
--> statement-breakpoint
INSERT INTO plugin_search(plugin_search) VALUES ('rebuild');
