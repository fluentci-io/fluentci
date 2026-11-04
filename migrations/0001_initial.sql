CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX projects_path ON projects(path);
CREATE INDEX projects_date ON projects(created_at, id);
CREATE TABLE actions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)),
    UNIQUE(project_id, position)
);
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE INDEX runs_project_date ON runs(project_id, date, id);
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE logs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    message TEXT NOT NULL
);
CREATE INDEX logs_job_date ON logs(job_id, created_at, id);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
