import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from backup import checked_archive


class BackupTests(unittest.TestCase):
    def archive(self, files, alter=False):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "backup.zip"
        manifest = {"version": 1, "files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in files.items():
                archive.writestr(name, data + (b"changed" if alter else b""))
            archive.writestr("manifest.json", json.dumps(manifest))
        return path

    def test_round_trip_hashes(self):
        files = {"database.sql": b"SELECT 1;", "exams/test.pdf": b"fixture"}
        self.assertEqual(checked_archive(self.archive(files)), files)

    def test_tampering_is_rejected(self):
        with self.assertRaises(ValueError):
            checked_archive(self.archive({"database.sql": b"SELECT 1;"}, alter=True))

    def test_path_traversal_is_rejected(self):
        for name in ("exams/../outside", "exams/..", "exams/C:outside", "exams/a\\outside"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                checked_archive(self.archive({"database.sql": b"SQL", name: b"bad"}))

    def test_missing_database_is_rejected(self):
        with self.assertRaises(ValueError):
            checked_archive(self.archive({"exams/test.pdf": b"fixture"}))
