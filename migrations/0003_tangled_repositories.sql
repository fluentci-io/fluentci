CREATE TABLE tangled_repositories (
    uri TEXT PRIMARY KEY NOT NULL,
    account_did TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE INDEX tangled_repositories_account ON tangled_repositories(account_did, name);
CREATE TABLE tangled_sync (
    account_did TEXT PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
