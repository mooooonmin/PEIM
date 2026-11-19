"""Real PostgreSQL integration tests; only the isolated test database is permitted."""
import os
import unittest

if os.environ.get("PGDATABASE") != "peim_test":
    raise unittest.SkipTest("Run app integration tests with docker compose --profile test run --rm test")

import io
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from app.db import connect, initialize
from app.main import app, MAX_FILE

HEADERS = {"X-PEIM-Request": "1"}


def pdf(width=100):
    stream = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=100)
    writer.write(stream)
    return stream.getvalue()


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        os.environ["EXAM_DIR"] = cls.folder.name
        with connect() as db:
            db.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()
        cls.qid = "r63-s1-q01"

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        cls.folder.cleanup()

    def setUp(self):
        with connect() as db:
            db.execute("DELETE FROM answer_revisions")
            db.execute("DELETE FROM user_answers")

    def upload(self, number, content=None, filename="scan.pdf"):
        return self.client.post("/api/exams/upload", headers=HEADERS, data={"round_number": number},
                                files={"file": (filename, pdf() if content is None else content, "application/pdf")})

    def test_seed_and_navigation(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        navigation = self.client.get("/api/navigation").json()
        self.assertGreaterEqual(len(navigation["topics"]), 1238)
        self.assertEqual(sum(q["round"] <= 139 for q in self.client.get("/api/questions").json()), 1829)
        self.assertTrue(self.client.get(f"/api/questions/{self.qid}").json()["topics"])

    def test_save_history_conflict_and_reimport(self):
        route = f"/api/questions/{self.qid}/answer"
        payload = {"body": "내 답안", "revision": 0, "status": "draft"}
        first = self.client.put(route, headers=HEADERS, json=payload)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["revision"], 1)
        self.assertEqual(self.client.put(route, headers=HEADERS, json=payload).status_code, 409)
        initialize()
        self.assertEqual(self.client.get(f"/api/questions/{self.qid}").json()["answer"]["body"], "내 답안")
        second = self.client.put(route, headers=HEADERS, json={**payload, "revision": 1, "body": "수정", "status": "completed"})
        self.assertEqual(second.json()["revision"], 2)
        history = self.client.get(f"/api/questions/{self.qid}/history").json()
        self.assertEqual([h["body"] for h in history], ["수정", "내 답안"])
        restored = self.client.put(route, headers=HEADERS, json={**payload, "revision": 2})
        self.assertEqual(restored.json()["revision"], 3)

    def test_concurrent_answer_writes_do_not_overwrite(self):
        def write(body):
            return self.client.put(f"/api/questions/{self.qid}/answer", headers=HEADERS,
                                   json={"body": body, "revision": 0, "status": "draft"}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(write, ["첫 창", "다른 창"]))
        self.assertEqual(statuses, [200, 409])

    def test_local_write_guard(self):
        route = f"/api/questions/{self.qid}/answer"
        payload = {"body": "no", "revision": 0, "status": "draft"}
        self.assertEqual(self.client.put(route, json=payload).status_code, 403)
        self.assertEqual(self.client.put(route, headers={**HEADERS, "Origin": "https://outside.example"}, json=payload).status_code, 403)
        self.assertEqual(self.client.get("/api/health", headers={"Host": "outside.example"}).status_code, 400)

    def test_upload_filename_duplicate_and_collision(self):
        data = pdf()
        first = self.upload(140, data, "../any-name.pdf")
        self.assertEqual(first.status_code, 200, first.text)
        path = Path(self.folder.name) / "제140회_정보관리기술사.pdf"
        self.assertEqual(path.read_bytes(), data)
        self.assertTrue(self.upload(140, data).json()["duplicate"])
        self.assertEqual(self.upload(140, pdf(200)).status_code, 409)
        self.assertEqual(path.read_bytes(), data)
        self.assertEqual(self.client.get("/api/attachments/exam-140-pdf/file").content, data)
        self.assertFalse(list(Path(self.folder.name).glob(".peim-upload-*")))

    def test_upload_repairs_complete_orphan_without_replacing_it(self):
        data = pdf()
        path = Path(self.folder.name) / "제141회_정보관리기술사.pdf"
        path.write_bytes(data)
        self.assertTrue(self.upload(141, data).json()["duplicate"])
        self.assertEqual(self.client.get("/api/attachments/exam-141-pdf/file").content, data)

    def test_concurrent_uploads_preserve_one_complete_original(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda content: self.upload(144, content), [pdf(), pdf(250)]))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 409])
        stored = (Path(self.folder.name) / "제144회_정보관리기술사.pdf").read_bytes()
        self.assertIn(stored, [pdf(), pdf(250)])

    def test_invalid_upload_does_not_create_original(self):
        self.assertEqual(self.upload(142, b"not a pdf").status_code, 422)
        self.assertEqual(self.upload(142, pdf(), "x.txt").status_code, 422)
        self.assertEqual(self.upload(0).status_code, 422)
        self.assertFalse((Path(self.folder.name) / "제142회_정보관리기술사.pdf").exists())

    def test_size_limit(self):
        self.assertEqual(self.upload(142, b"x" * (MAX_FILE + 1)).status_code, 413)

    def test_extract_manual_review_and_publish(self):
        self.assertEqual(self.upload(143).status_code, 200)
        aid = "exam-143-pdf"
        extraction = self.client.post(f"/api/attachments/{aid}/extract", headers=HEADERS)
        self.assertEqual(extraction.status_code, 200)
        self.assertEqual(extraction.json()["candidates"], [])
        topic = self.client.post("/api/topics", headers=HEADERS, json={"title": "새 학습 주제", "domain": "DB"}).json()
        self.assertEqual(self.client.post("/api/topics", headers=HEADERS, json={"title": "새 학습 주제", "domain": "DB"}).status_code, 409)
        payload = {"attachment_id": aid, "session": 1, "number": 1, "text": "직접 확인한 문제", "topic_id": topic["id"], "page": 1, "reviewed": False}
        route = "/api/exams/143/questions"
        self.assertEqual(self.client.post(route, headers=HEADERS, json=payload).status_code, 422)
        self.assertEqual(self.client.post(route, headers=HEADERS, json={**payload, "reviewed": True, "page": 2}).status_code, 422)
        result = self.client.post(route, headers=HEADERS, json={**payload, "reviewed": True})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.client.post(route, headers=HEADERS, json={**payload, "reviewed": True}).status_code, 409)
        question = self.client.get("/api/questions/r143-s1-q01").json()
        self.assertEqual(question["sources"][0]["data"]["page_start"], 1)
        self.assertEqual(question["text"], payload["text"])

    def test_reference_is_topic_material(self):
        topic = self.client.get(f"/api/questions/{self.qid}").json()["topics"][0]["id"]
        reference = self.client.get(f"/api/topics/{topic}/reference").json()
        self.assertEqual({a["variant"] for a in reference["answers"]}, {"short", "long"})


if __name__ == "__main__":
    unittest.main()
