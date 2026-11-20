import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
import subprocess

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from backup import checked_archive, main


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

    def test_restore_resets_public_schema_in_the_restore_transaction(self):
        sql = b'SELECT 1;'
        archive = self.archive({'database.sql': sql})
        with tempfile.TemporaryDirectory() as folder:
            calls = []
            def docker(args, **kwargs):
                calls.append((args, kwargs))
                output = json.dumps({'services': {'web': {'volumes': [
                    {'target': '/exams', 'type': 'bind', 'source': folder}]}}}).encode() if 'config' in args else b''
                return subprocess.CompletedProcess(args, 0, stdout=output)
            with patch('backup.subprocess.run', side_effect=docker), patch.object(sys, 'argv', [
                'backup.py', 'restore', str(archive), '--confirm-replace-database']):
                main()
            command, options = next((args, kw) for args, kw in calls if 'psql' in args)
            self.assertIn('--single-transaction', command)
            self.assertIn('ON_ERROR_STOP=1', command)
            self.assertTrue(options['input'].startswith(b'DROP SCHEMA public CASCADE;'))
            self.assertTrue(options['input'].endswith(sql))
