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
            db.execute("DELETE FROM learning_notes")
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

    def test_learning_preserves_answers_history_and_survives_upgrade(self):
        answer_route = f"/api/questions/{self.qid}/answer"
        self.client.put(answer_route, headers=HEADERS, json={"body": "기존 답안", "status": "completed", "revision": 0})
        before = self.client.get(f"/api/questions/{self.qid}").json()["answer"]
        history = self.client.get(f"/api/questions/{self.qid}/history").json()
        with connect() as db:
            db.execute("DROP TABLE learning_notes")
            db.execute("DELETE FROM schema_version WHERE version=3")
        initialize()
        route = f"/api/questions/{self.qid}/learning"
        self.assertEqual(self.client.get(route).json()["revision"], 0)
        first = self.client.put(route, headers=HEADERS, json={"note": "정의와 도식 보완", "retry_requested": True, "revision": 0})
        self.assertEqual(first.status_code, 200, first.text)
        initialize()
        self.assertEqual(self.client.get(route).json(), first.json())
        self.assertEqual(self.client.get(f"/api/questions/{self.qid}").json()["answer"], before)
        self.assertEqual(self.client.get(f"/api/questions/{self.qid}/history").json(), history)
        marked = next(q for q in self.client.get("/api/questions").json() if q["id"] == self.qid)
        self.assertTrue(marked["retry_requested"])
        second = self.client.put(route, headers=HEADERS, json={"note": "복습 완료", "retry_requested": False, "revision": 1})
        self.assertEqual(second.json()["revision"], 2)
        self.assertFalse(next(q for q in self.client.get("/api/questions").json() if q["id"] == self.qid)["retry_requested"])
        self.assertEqual(self.client.get(f"/api/questions/{self.qid}/history").json(), history)

    def test_learning_conflicts_validation_and_local_guard(self):
        route = f"/api/questions/{self.qid}/learning"
        payload = {"note": "메모", "retry_requested": True, "revision": 0}
        self.assertEqual(self.client.put(route, json=payload).status_code, 403)
        self.assertEqual(self.client.put(route, headers={**HEADERS, "Origin": "https://outside.example"}, json=payload).status_code, 403)
        self.assertEqual(self.client.get("/api/questions/missing/learning").status_code, 404)
        self.assertEqual(self.client.put("/api/questions/missing/learning", headers=HEADERS, json=payload).status_code, 404)
        for invalid in [{**payload, "note": "x" * 30001}, {**payload, "retry_requested": "true"}, {**payload, "revision": -1}]:
            self.assertEqual(self.client.put(route, headers=HEADERS, json=invalid).status_code, 422)
        def write(note):
            return self.client.put(route, headers=HEADERS, json={**payload, "note": note}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(write, ["첫 창", "다른 창"])), [200, 409])
        before = self.client.get(route).json()
        self.assertEqual(self.client.put(route, headers=HEADERS, json=payload).status_code, 409)
        self.assertEqual(self.client.get(route).json(), before)
        other = self.client.get("/api/questions/r63-s1-q02/learning").json()
        self.assertEqual(other["note"], "")
        self.assertFalse(other["retry_requested"])
        self.assertEqual(self.client.get(f"/api/questions/{self.qid}/history").json(), [])

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


    def review_fixture(self, number):
        self.assertEqual(self.upload(number).status_code, 200)
        topic = self.client.get(f"/api/questions/{self.qid}").json()["topics"][0]["id"]
        payload = {"attachment_id": f"exam-{number}-pdf", "session": 1, "number": 1,
                   "text": "수정 전 문항", "topic_id": topic, "page": 1, "reviewed": True}
        qid = self.client.post(f"/api/exams/{number}/questions", headers=HEADERS, json=payload).json()["id"]
        review = {"revision": 0, "text": "수정한 문항", "topic_ids": [topic],
                  "verification_status": "verified", "confirmed": True,
                  "sources": [{"attachment_id": payload["attachment_id"], "page_start": 1, "page_end": 1}]}
        return qid, review

    def test_review_preserves_identity_answers_history_and_restart(self):
        qid, value = self.review_fixture(150)
        answer = self.client.put(f"/api/questions/{qid}/answer", headers=HEADERS,
                                json={"body": "보존할 내 답안", "revision": 0, "status": "completed"}).json()
        original = (Path(self.folder.name) / "제150회_정보관리기술사.pdf").read_bytes()
        topic = self.client.post("/api/topics", headers=HEADERS, json={"title": "검수 연결 주제", "domain": "DB"}).json()
        value["topic_ids"].append(topic["id"])
        result = self.client.put(f"/api/questions/{qid}/review", headers=HEADERS, json=value)
        self.assertEqual(result.status_code, 200, result.text)
        initialize()
        q = self.client.get(f"/api/questions/{qid}").json()
        self.assertEqual((q["id"], q["round"], q["session"], q["number"]), (qid, 150, 1, 1))
        self.assertEqual(q["answer"], answer)
        self.assertEqual(q["text"], value["text"])
        listing = self.client.get("/api/questions", params={"exam": "exam-150"}).json()
        self.assertEqual(listing[0]["verification_status"], "verified")
        self.assertEqual({t["id"] for t in q["topics"]}, set(value["topic_ids"]))
        history = self.client.get(f"/api/questions/{qid}/reviews").json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["before_data"]["text"], "수정 전 문항")
        self.assertEqual(history[0]["after_data"]["text"], value["text"])
        self.assertEqual(len(self.client.get(f"/api/questions/{qid}/history").json()), 1)
        self.assertEqual((Path(self.folder.name) / "제150회_정보관리기술사.pdf").read_bytes(), original)
        value.update(revision=1, verification_status="needs_review", confirmed=False)
        self.assertEqual(self.client.put(f"/api/questions/{qid}/review", headers=HEADERS, json=value).status_code, 200)
        value.update(revision=2, verification_status="unverified")
        self.assertEqual(self.client.put(f"/api/questions/{qid}/review", headers=HEADERS, json=value).status_code, 200)
        self.assertEqual(self.client.get(f"/api/questions/{qid}").json()["answer"], answer)

    def test_review_rejects_invalid_input_atomically(self):
        qid, value = self.review_fixture(151)
        route = f"/api/questions/{qid}/review"
        before = self.client.get(f"/api/questions/{qid}").json()
        bad_values = [{"text": "   "}, {"topic_ids": []}, {"topic_ids": ["missing"]},
                      {"topic_ids": value["topic_ids"] * 2}, {"confirmed": False},
                      {"verification_status": "wrong"}, {"session": 2}, {"sources": []}]
        for pages in [(2,2), (1,None), (None,1), (2,1), (0,1)]:
            bad_values.append({"sources": [{"attachment_id": "exam-151-pdf", "page_start": pages[0], "page_end": pages[1]}]})
        for change in bad_values:
            with self.subTest(change=change):
                self.assertEqual(self.client.put(route, headers=HEADERS, json={**value, **change}).status_code, 422)
        self.assertEqual(self.client.get(f"/api/questions/{qid}").json(), before)
        self.assertEqual(self.client.get(f"/api/questions/{qid}/reviews").json(), [])

    def test_review_concurrent_edits_conflict(self):
        qid, value = self.review_fixture(152)
        def write(text):
            return self.client.put(f"/api/questions/{qid}/review", headers=HEADERS, json={**value, "text": text}).status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(write, ["수정 A", "수정 B"])), [200,409])
        self.assertEqual(len(self.client.get(f"/api/questions/{qid}/reviews").json()), 1)

    def test_review_unknown_pdf_page_count_and_source_change(self):
        qid, value = self.review_fixture(153)
        with connect() as db:
            db.execute("UPDATE attachments SET data=data - 'page_count' WHERE id='exam-153-pdf'")
        route = f"/api/questions/{qid}/review"
        self.assertEqual(self.client.put(route, headers=HEADERS, json=value).status_code, 200)
        (Path(self.folder.name) / "제153회_정보관리기술사.pdf").write_bytes(pdf(300))
        self.assertEqual(self.client.put(route, headers=HEADERS, json={**value, "revision": 1}).status_code, 409)

    def test_review_existing_import_without_page_preserves_source_links(self):
        q = self.client.get(f"/api/questions/{self.qid}").json()
        value = {"revision": q["data"].get("review_revision", 0), "text": q["text"],
                 "topic_ids": [t["id"] for t in q["topics"]], "verification_status": "needs_review",
                 "sources": [{"attachment_id": a["id"], "page_start": None, "page_end": None} for a in q["sources"]]}
        result = self.client.put(f"/api/questions/{self.qid}/review", headers=HEADERS, json=value)
        self.assertEqual(result.status_code, 200, result.text)
        updated = self.client.get(f"/api/questions/{self.qid}").json()
        self.assertEqual({s["id"] for s in updated["sources"]}, {s["id"] for s in q["sources"]})
        self.assertTrue(all(s["data"]["verification_status"] == "unverified" for s in updated["sources"]))

    def test_review_schema_upgrade_preserves_existing_data(self):
        qid, value = self.review_fixture(154)
        self.client.put(f"/api/questions/{qid}/answer", headers=HEADERS, json={"body": "이행 보존", "revision": 0, "status": "draft"})
        with connect() as db:
            # Recreate the additive migration on this disposable database only.
            db.execute("DROP TABLE question_revisions")
            db.execute("DELETE FROM schema_version WHERE version=2")
        initialize()
        self.assertEqual(self.client.get(f"/api/questions/{qid}").json()["answer"]["body"], "이행 보존")
        self.assertEqual(self.client.put(f"/api/questions/{qid}/review", headers=HEADERS, json=value).status_code, 200)


if __name__ == "__main__":
    unittest.main()
