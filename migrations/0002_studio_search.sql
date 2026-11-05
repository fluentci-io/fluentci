-- External-content indexes retain the authoritative text in the existing tables.
CREATE VIEW project_search_content AS
SELECT rowid AS document_id,
       coalesce(json_extract(data, '$.displayName'), name) AS title,
       name || ' ' || path || ' ' || coalesce(json_extract(data, '$.description'), '') || ' ' || coalesce(json_extract(data, '$.tags'), '') AS body
FROM projects;

CREATE VIRTUAL TABLE project_search USING fts5(
    title, body, content='project_search_content', content_rowid='document_id',
    tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);

CREATE VIEW run_search_content AS
SELECT rowid AS document_id,
       coalesce(json_extract(data, '$.title'), id) AS title,
       id || ' ' || status || ' ' || coalesce(json_extract(data, '$.branch'), '') || ' ' || coalesce(json_extract(data, '$.commit'), '') || ' ' || coalesce(json_extract(data, '$.message'), '') AS body
FROM runs;

CREATE VIRTUAL TABLE run_search USING fts5(
    title, body, content='run_search_content', content_rowid='document_id',
    tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);

CREATE VIRTUAL TABLE log_search USING fts5(
    message, content='logs', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);

CREATE TRIGGER projects_search_insert AFTER INSERT ON projects BEGIN
    INSERT INTO project_search(rowid, title, body)
    SELECT document_id, title, body FROM project_search_content WHERE document_id = new.rowid;
END;
CREATE TRIGGER projects_search_delete AFTER DELETE ON projects BEGIN
    INSERT INTO project_search(project_search, rowid, title, body)
    VALUES('delete', old.rowid, coalesce(json_extract(old.data, '$.displayName'), old.name),
           old.name || ' ' || old.path || ' ' || coalesce(json_extract(old.data, '$.description'), '') || ' ' || coalesce(json_extract(old.data, '$.tags'), ''));
END;
CREATE TRIGGER projects_search_update AFTER UPDATE ON projects BEGIN
    INSERT INTO project_search(project_search, rowid, title, body)
    VALUES('delete', old.rowid, coalesce(json_extract(old.data, '$.displayName'), old.name),
           old.name || ' ' || old.path || ' ' || coalesce(json_extract(old.data, '$.description'), '') || ' ' || coalesce(json_extract(old.data, '$.tags'), ''));
    INSERT INTO project_search(rowid, title, body)
    SELECT document_id, title, body FROM project_search_content WHERE document_id = new.rowid;
END;

CREATE TRIGGER runs_search_insert AFTER INSERT ON runs BEGIN
    INSERT INTO run_search(rowid, title, body)
    SELECT document_id, title, body FROM run_search_content WHERE document_id = new.rowid;
END;
CREATE TRIGGER runs_search_delete AFTER DELETE ON runs BEGIN
    INSERT INTO run_search(run_search, rowid, title, body)
    VALUES('delete', old.rowid, coalesce(json_extract(old.data, '$.title'), old.id),
           old.id || ' ' || old.status || ' ' || coalesce(json_extract(old.data, '$.branch'), '') || ' ' || coalesce(json_extract(old.data, '$.commit'), '') || ' ' || coalesce(json_extract(old.data, '$.message'), ''));
END;
CREATE TRIGGER runs_search_update AFTER UPDATE ON runs
WHEN old.data IS NOT new.data OR old.status IS NOT new.status BEGIN
    INSERT INTO run_search(run_search, rowid, title, body)
    VALUES('delete', old.rowid, coalesce(json_extract(old.data, '$.title'), old.id),
           old.id || ' ' || old.status || ' ' || coalesce(json_extract(old.data, '$.branch'), '') || ' ' || coalesce(json_extract(old.data, '$.commit'), '') || ' ' || coalesce(json_extract(old.data, '$.message'), ''));
    INSERT INTO run_search(rowid, title, body)
    SELECT document_id, title, body FROM run_search_content WHERE document_id = new.rowid;
END;

CREATE TRIGGER logs_search_insert AFTER INSERT ON logs BEGIN
    INSERT INTO log_search(rowid, message) VALUES(new.rowid, new.message);
END;
CREATE TRIGGER logs_search_delete AFTER DELETE ON logs BEGIN
    INSERT INTO log_search(log_search, rowid, message) VALUES('delete', old.rowid, old.message);
END;
CREATE TRIGGER logs_search_update AFTER UPDATE ON logs BEGIN
    INSERT INTO log_search(log_search, rowid, message) VALUES('delete', old.rowid, old.message);
    INSERT INTO log_search(rowid, message) VALUES(new.rowid, new.message);
END;

-- Triggers only cover future writes. Backfill all existing local history once.
INSERT INTO project_search(project_search) VALUES('rebuild');
INSERT INTO run_search(run_search) VALUES('rebuild');
INSERT INTO log_search(log_search) VALUES('rebuild');
