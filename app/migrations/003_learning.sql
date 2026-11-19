-- Additive migration: rollback the application without dropping personal notes.
CREATE TABLE IF NOT EXISTS learning_notes (
  profile_id text NOT NULL DEFAULT 'local',
  question_id text NOT NULL REFERENCES questions(id),
  note text NOT NULL CHECK (length(note) <= 30000),
  retry_requested boolean NOT NULL DEFAULT false,
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id, question_id)
);
INSERT INTO schema_version VALUES (3) ON CONFLICT DO NOTHING;
