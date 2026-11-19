"""Regression tests for identities, source conventions and failed validation."""
import copy
from contextlib import contextmanager
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from data_contract import EXAM_DIRECTORY, exam_filename, existing_topic_id, read_json, preservation_hash
from build_catalog import build
from export_dataset import export
from validate_data import validate


class DataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        for folder in ("public/data", "content", "data", EXAM_DIRECTORY):
            shutil.copytree(ROOT / folder, cls.root / folder)
        shutil.copytree(ROOT / "scripts", cls.root / "scripts",
                        ignore=shutil.ignore_patterns("out", "__pycache__"))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @contextmanager
    def edit(self, name):
        path = self.root / name
        original = path.read_bytes()
        rows = json.loads(original)
        try:
            yield rows
            path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        except BaseException:
            path.write_bytes(original)
            raise
        self.addCleanup(path.write_bytes, original)

    def test_current_data(self):
        self.assertEqual(validate(self.root), [])

    def test_text_preservation_hash_is_checkout_independent(self):
        path = self.root / "line-endings.txt"
        path.write_bytes(b"first\nsecond\n")
        expected = preservation_hash(path, "lf-text")
        path.write_bytes(b"first\r\nsecond\r\n")
        self.assertEqual(preservation_hash(path, "lf-text"), expected)
        self.assertNotEqual(preservation_hash(path, "binary"), expected)

    def test_filename_future_round_and_invalid_input(self):
        self.assertEqual(exam_filename(140), "제140회_정보관리기술사.pdf")
        self.assertEqual(exam_filename(1000), "제1000회_정보관리기술사.pdf")
        for value in (0, -1, True, "../140", 1.5):
            with self.assertRaises(ValueError):
                exam_filename(value)
        with self.assertRaises(ValueError):
            exam_filename(140, "../pdf")

    def test_catalog_accepts_new_round_without_requiring_questions(self):
        path = self.root / EXAM_DIRECTORY / exam_filename(140)
        path.write_bytes(b"%PDF-test-fixture-not-a-real-exam")
        self.addCleanup(path.unlink)
        catalog = build(self.root)
        self.assertIn("exam-140", {r["id"] for r in catalog["exams"]})
        attachment = next(a for a in catalog["attachments"] if a["exam_id"] == "exam-140")
        self.assertEqual(attachment["verification_status"], "unverified")
        self.assertIsNone(attachment["page_count"])

    def test_catalog_rejects_inconsistent_filename(self):
        path = self.root / EXAM_DIRECTORY / "140.pdf"
        path.write_bytes(b"fixture")
        self.addCleanup(path.unlink)
        with self.assertRaises(ValueError):
            build(self.root)

    def test_duplicate_question_is_rejected(self):
        with self.edit("public/data/questions.json") as rows:
            rows.append(copy.deepcopy(rows[0]))
        self.assertTrue(any("question: duplicate" in e for e in validate(self.root)))

    def test_broken_question_relation_is_rejected(self):
        with self.edit("public/data/topics.json") as rows:
            rows[0]["question_ids"].append("missing")
        self.assertTrue(any("unknown question missing" in e for e in validate(self.root)))

    def test_missing_reference_answer_is_rejected(self):
        with self.edit("public/data/answers/SEC.json") as rows:
            rows.pop(next(iter(rows)))
        self.assertTrue(any("missing reference answer" in e for e in validate(self.root)))

    def test_modified_original_is_rejected(self):
        path = next((self.root / EXAM_DIRECTORY).glob("*.pdf"))
        original = path.read_bytes()
        self.addCleanup(path.write_bytes, original)
        path.write_bytes(original + b"changed")
        findings = validate(self.root)
        self.assertTrue(any("catalog:" in e for e in findings))
        self.assertTrue(any("preservation: hash changed" in e for e in findings))

    def test_title_change_preserves_identity_and_merge_is_explicit(self):
        topics = [{"id": "t-original", "title": "Renamed", "question_ids": ["q1"]}]
        self.assertEqual(existing_topic_id(["q1", "q-new"], topics), "t-original")
        self.assertIsNone(existing_topic_id(["q2"], topics))
        topics.append({"id": "t-other", "question_ids": ["q2"]})
        with self.assertRaises(ValueError):
            existing_topic_id(["q1", "q2"], topics)

    def test_duplicate_json_key_is_rejected(self):
        path = self.root / "duplicate.json"
        path.write_text('{"id":1,"id":2}', encoding="utf-8")
        self.addCleanup(path.unlink)
        with self.assertRaises(ValueError):
            read_json(path)

    def test_strict_build_failure_does_not_write_outputs(self):
        from check_rebuild import inventory
        before = inventory(self.root / "public/data")
        aliases = self.root / "content/work/keyword_aliases.json"
        alias_before = aliases.read_bytes()
        with self.edit("content/answers/CA.json") as rows:
            rows[0]["answers"]["short"] += "\n[[missing-keyword-test]]"
        result = subprocess.run([sys.executable, str(self.root / "scripts/build_content.py"), "--strict"],
                                capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"missing-keyword-test", result.stdout)
        self.assertEqual(inventory(self.root / "public/data"), before)
        self.assertEqual(aliases.read_bytes(), alias_before)

    def test_orphan_tool_uses_relocated_sources(self):
        result = subprocess.run([sys.executable, str(self.root / "scripts/find_orphans.py")],
                                capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        self.assertTrue((self.root / "scripts/out/orphans").is_dir())
        self.assertFalse((self.root / "scripts/contentwork").exists())

    def test_export_reproducible_and_unverified(self):
        a = export(self.root)
        self.assertEqual(a, export(self.root))
        self.assertNotIn("user_answers", a)  # Import must never reset personal writing.
        self.assertEqual(len(a["reference_answers"]), len(a["topics"]) * 2)
        sources = {s["id"] for s in a["attachments"]}
        for row in a["question_sources"]:
            self.assertIn(row["attachment_id"], sources)
            self.assertIsNone(row["page_start"])
            self.assertEqual(row["verification_status"], "unverified")
        self.assertEqual(validate(self.root), [])


if __name__ == "__main__":
    unittest.main()
