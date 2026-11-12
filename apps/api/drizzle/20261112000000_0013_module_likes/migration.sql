CREATE TABLE module_likes (
  uri TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  subject_author TEXT NOT NULL,
  name TEXT,
  active INTEGER NOT NULL,
  event_time INTEGER NOT NULL
);
CREATE INDEX module_likes_subject ON module_likes(subject_author, name, active, actor);
CREATE INDEX module_likes_actor ON module_likes(actor, active);
