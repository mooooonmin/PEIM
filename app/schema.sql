CREATE TABLE IF NOT EXISTS schema_version (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS imports (version integer PRIMARY KEY, imported_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS domains (code text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY, round integer UNIQUE NOT NULL CHECK (round > 0),
  status text NOT NULL CHECK (status IN ('draft','published','imported_unverified')), data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id text PRIMARY KEY, exam_id text NOT NULL REFERENCES exams(id), path text UNIQUE NOT NULL,
  sha256 text NOT NULL, format text NOT NULL CHECK (format IN ('pdf','hwp')), data jsonb NOT NULL,
  extraction jsonb, extraction_status text NOT NULL DEFAULT 'not_started'
);
CREATE TABLE IF NOT EXISTS topics (
  id text PRIMARY KEY, domain text NOT NULL REFERENCES domains(code), title text NOT NULL, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY, exam_id text NOT NULL REFERENCES exams(id),
  session integer NOT NULL CHECK (session BETWEEN 1 AND 4), number integer NOT NULL CHECK (number > 0),
  text text NOT NULL CHECK (length(trim(text)) > 0), data jsonb NOT NULL,
  UNIQUE(exam_id,session,number)
);
CREATE TABLE IF NOT EXISTS question_topics (
  question_id text REFERENCES questions(id), topic_id text REFERENCES topics(id),
  PRIMARY KEY(question_id,topic_id)
);
CREATE TABLE IF NOT EXISTS question_sources (
  question_id text REFERENCES questions(id), attachment_id text REFERENCES attachments(id), data jsonb NOT NULL,
  PRIMARY KEY(question_id,attachment_id)
);
CREATE TABLE IF NOT EXISTS reference_answers (
  id text PRIMARY KEY, topic_id text NOT NULL REFERENCES topics(id), variant text NOT NULL,
  body text NOT NULL, data jsonb NOT NULL, UNIQUE(topic_id,variant)
);
CREATE TABLE IF NOT EXISTS keywords (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS topic_keywords (
  topic_id text REFERENCES topics(id), keyword_id text REFERENCES keywords(id), PRIMARY KEY(topic_id,keyword_id)
);
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS user_answers (
  question_id text REFERENCES questions(id), profile_id text NOT NULL DEFAULT 'local',
  body text NOT NULL, status text NOT NULL CHECK (status IN ('draft','completed')),
  revision integer NOT NULL CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id,question_id)
);
CREATE TABLE IF NOT EXISTS answer_revisions (
  profile_id text NOT NULL, question_id text NOT NULL, revision integer NOT NULL,
  body text NOT NULL, status text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(profile_id,question_id,revision),
  FOREIGN KEY(profile_id,question_id) REFERENCES user_answers(profile_id,question_id)
);
INSERT INTO schema_version VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS question_revisions (
  question_id text NOT NULL REFERENCES questions(id), revision integer NOT NULL,
  before_data jsonb NOT NULL, after_data jsonb NOT NULL,
  reviewer text NOT NULL DEFAULT 'local', saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(question_id,revision)
);
INSERT INTO schema_version VALUES (2) ON CONFLICT DO NOTHING;
