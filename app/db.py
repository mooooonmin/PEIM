"""Transactional schema bootstrap and one-time, non-destructive seed import."""
import json
import os
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def connect():
    return psycopg.connect(row_factory=dict_row)


def initialize():
    with connect() as db:
        db.execute("SELECT pg_advisory_xact_lock(70319001)")
        db.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
        if db.execute("SELECT 1 FROM imports WHERE version=1").fetchone():
            return
        seed = json.loads(Path(os.environ.get("SEED_PATH", "scripts/out/dataset-v1.json")).read_text(encoding="utf-8"))
        if seed["schema_version"] != 1:
            raise ValueError("Unsupported seed version")
        for d in seed["domains"]:
            db.execute("INSERT INTO domains VALUES (%s,%s) ON CONFLICT DO NOTHING", (d["code"], Jsonb(d)))
        for e in seed["exams"]:
            db.execute("INSERT INTO exams VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", (e["id"], e["round"], e["status"], Jsonb(e)))
        for a in seed["attachments"]:
            db.execute("INSERT INTO attachments(id,exam_id,path,sha256,format,data) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                       (a["id"], a["exam_id"], a["path"], a["sha256"], a["format"], Jsonb(a)))
        for t in seed["topics"]:
            db.execute("INSERT INTO topics VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", (t["id"], t["domain"], t["title"], Jsonb(t)))
        for q in seed["questions"]:
            db.execute("INSERT INTO questions VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                       (q["id"], q["exam_id"], q["session"], q["number"], q["text"], Jsonb(q)))
        for x in seed["question_topics"]:
            db.execute("INSERT INTO question_topics VALUES (%s,%s) ON CONFLICT DO NOTHING", (x["question_id"], x["topic_id"]))
        for x in seed["question_sources"]:
            db.execute("INSERT INTO question_sources VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (x["question_id"], x["attachment_id"], Jsonb(x)))
        for x in seed["reference_answers"]:
            db.execute("INSERT INTO reference_answers VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                       (x["id"], x["topic_id"], x["variant"], x["body"], Jsonb(x)))
        with db.cursor() as cur:
            cur.executemany("INSERT INTO keywords VALUES (%s,%s) ON CONFLICT DO NOTHING", [(k["id"], Jsonb(k)) for k in seed["keywords"]])
            cur.executemany("INSERT INTO topic_keywords VALUES (%s,%s) ON CONFLICT DO NOTHING", [(k["topic_id"], k["keyword_id"]) for k in seed["topic_keywords"]])
        db.execute("INSERT INTO settings VALUES ('priority',%s) ON CONFLICT DO NOTHING", (Jsonb(seed["priority"]),))
        db.execute("INSERT INTO imports VALUES (1,now())")
