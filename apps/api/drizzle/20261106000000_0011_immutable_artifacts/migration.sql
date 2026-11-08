CREATE TRIGGER plugin_artifact_immutable
BEFORE UPDATE OF url, sha256, version ON plugin_records
WHEN (OLD.url IS NOT NULL AND NEW.url IS NOT OLD.url)
  OR (OLD.sha256 IS NOT NULL AND NEW.sha256 IS NOT OLD.sha256)
  OR (OLD.version IS NOT NULL AND NEW.version IS NOT OLD.version)
BEGIN
  SELECT RAISE(ABORT, 'Published module URL, SHA-256 and version are immutable');
END;
