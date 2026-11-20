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
from backup import checked_archive, main, restore_original


class BackupTests(unittest.TestCase):
    def test_publish_never_replaces_an_existing_original(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'test.pdf'
            target.write_bytes(b'existing original')
            with self.assertRaises(FileExistsError):
                restore_original(target, b'backup original')
            self.assertEqual(target.read_bytes(), b'existing original')
            self.assertEqual(list(Path(folder).iterdir()), [target])

    def test_interrupted_file_restore_can_retry_without_partial_original(self):
        archive = self.archive({'database.sql': b'SELECT 1;', 'exams/test.pdf': b'complete original'})
        with tempfile.TemporaryDirectory() as folder:
            calls = []
            def docker(args, **kwargs):
                calls.append(args)
                output = json.dumps({'services': {'web': {'volumes': [
                    {'target': '/exams', 'type': 'bind', 'source': folder}]}}}).encode() if 'config' in args else b''
                return subprocess.CompletedProcess(args, 0, stdout=output)
            class InterruptedWriter:
                def __init__(self, stream): self.stream = stream
                def __getattr__(self, name): return getattr(self.stream, name)
                def __enter__(self): return self
                def __exit__(self, *args): return self.stream.__exit__(*args)
                def write(self, data):
                    self.stream.write(data[:3])
                    self.stream.flush()
                    raise OSError('simulated interrupted write')
            original_open, original_temp = Path.open, tempfile.NamedTemporaryFile
            def open_file(path, mode='r', *args, **kwargs):
                stream = original_open(path, mode, *args, **kwargs)
                return InterruptedWriter(stream) if mode == 'xb' else stream
            def temporary(*args, **kwargs):
                return InterruptedWriter(original_temp(*args, **kwargs))
            with patch('backup.subprocess.run', side_effect=docker), patch.object(sys, 'argv', [
                'backup.py', 'restore', str(archive), '--confirm-replace-database']):
                with patch.object(Path, 'open', open_file), patch('tempfile.NamedTemporaryFile', temporary):
                    with self.assertRaisesRegex(OSError, 'interrupted write'):
                        main()
                self.assertFalse((Path(folder) / 'test.pdf').exists())
                self.assertFalse(any('psql' in args for args in calls))
                self.assertEqual(list(Path(folder).iterdir()), [])
                main()
                self.assertEqual((Path(folder) / 'test.pdf').read_bytes(), b'complete original')
                self.assertTrue(any('psql' in args for args in calls))

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

    def test_restore_rejects_upload_completed_while_stopping_web(self):
        archive = self.archive({'database.sql': b'SELECT 1;', 'exams/test.pdf': b'archived'})
        with tempfile.TemporaryDirectory() as folder:
            called_sql = []
            def docker(args, **kwargs):
                output = b''
                if 'config' in args:
                    output = json.dumps({'services': {'web': {'volumes': [
                        {'target': '/exams', 'type': 'bind', 'source': folder}]}}}).encode()
                elif 'stop' in args:
                    (Path(folder) / 'test.pdf').write_bytes(b'completed upload')
                elif 'psql' in args:
                    called_sql.append(args)
                return subprocess.CompletedProcess(args, 0, stdout=output)
            with patch('backup.subprocess.run', side_effect=docker), patch.object(sys, 'argv', [
                'backup.py', 'restore', str(archive), '--confirm-replace-database']):
                with self.assertRaisesRegex(ValueError, 'Original conflicts'):
                    main()
            self.assertEqual(called_sql, [])
            self.assertEqual((Path(folder) / 'test.pdf').read_bytes(), b'completed upload')
