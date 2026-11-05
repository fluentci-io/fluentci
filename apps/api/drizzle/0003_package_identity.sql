-- A publisher may release multiple versions; each version has one record.
-- Author is the canonical DID so handle changes do not change package identity.
CREATE UNIQUE INDEX plugin_author_name_version ON plugin_records(author, name, version);
