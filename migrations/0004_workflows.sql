ALTER TABLE runs ADD COLUMN workflow_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX runs_workflow_date ON runs(project_id, workflow_id, date, id);
CREATE TABLE run_definitions (
    run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    data TEXT NOT NULL CHECK(json_valid(data))
);
