"""Consistent local DB + original-file backup; restore never overwrites a different original."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def restore_original(target, content):
    """Publish complete bytes exclusively; a failed write never claims the final name."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".peim-upload-restore-", dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if digest(temporary.read_bytes()) != digest(content):
            raise ValueError(f"Restored file hash mismatch: {target.name}")
        # Same-directory hard link is atomic and cannot replace an existing file.
        os.link(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def checked_archive(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("version") != 1 or set(names) != set(manifest["files"]) | {"manifest.json"}:
            raise ValueError("Invalid archive manifest")
        files = {}
        for name, expected in manifest["files"].items():
            parts = name.split("/")
            if name != "database.sql" and (len(parts) != 2 or parts[0] != "exams" or parts[1] in ("", ".", "..") or "\\" in parts[1] or ":" in parts[1]):
                raise ValueError(f"Invalid backup path: {name}")
            data = archive.read(name)
            if digest(data) != expected:
                raise ValueError(f"Backup hash mismatch: {name}")
            files[name] = data
        if "database.sql" not in files:
            raise ValueError("Missing database dump")
        return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["create", "verify", "restore"])
    parser.add_argument("archive", type=Path)
    parser.add_argument("--project", default="peim")
    parser.add_argument("--confirm-replace-database", action="store_true")
    args = parser.parse_args()
    if args.action == "verify":
        files = checked_archive(args.archive)
        print(f"Verified backup hashes: {len(files)} entries")
        return
    if args.action == "restore" and not args.confirm_replace_database:
        parser.error("Restoring replaces database contents; pass --confirm-replace-database explicitly")
    base = ["docker", "compose", "-p", args.project]

    def run(*command, **kwargs):
        return subprocess.run(base + list(command), cwd=ROOT, check=True, **kwargs)

    config = json.loads(run("config", "--format", "json", capture_output=True).stdout)
    mount = next(v for v in config["services"]["web"]["volumes"] if v["target"] == "/exams")
    folder = Path(mount["source"])
    if mount["type"] != "bind" or not folder.is_dir():
        raise ValueError("Existing exam bind folder is required")
    files = checked_archive(args.archive) if args.action == "restore" else None
    if args.action == "create" and args.archive.exists():
        raise ValueError("Backup archive already exists")
    was_running = bool(run("ps", "--status", "running", "--quiet", "web", capture_output=True).stdout.strip())
    run("stop", "web")
    success = False
    try:
        if args.action == "create":
            sql = run("exec", "-T", "db", "pg_dump", "-U", "peim", "-d", "peim", "--clean", "--if-exists", "--no-owner", capture_output=True).stdout
            files = {"database.sql": sql}
            for path in sorted(folder.iterdir()):
                if path.is_symlink():
                    raise ValueError("Symlinks are not supported in original storage")
                if path.is_file() and not path.name.startswith(".peim-upload-"):
                    files["exams/" + path.name] = path.read_bytes()
            manifest = {"version": 1, "files": {name: digest(content) for name, content in files.items()}}
            args.archive.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(args.archive, "x", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, content in files.items():
                    archive.writestr(name, content)
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
            checked_archive(args.archive)
        else:
            # Quiesce uploads before checking every original, then write absent files only.
            for name, content in files.items():
                if name == "database.sql":
                    continue
                target = folder / name.split("/")[1]
                if target.is_symlink() or (target.exists() and digest(target.read_bytes()) != digest(content)):
                    raise ValueError(f"Original conflicts with backup; no overwrite: {target.name}")
            for name, content in files.items():
                if name == "database.sql":
                    continue
                target = folder / name.split("/")[1]
                if not target.exists():
                    restore_original(target, content)
            # Replace the app schema and restore together; any SQL failure rolls both back.
            sql = b"DROP SCHEMA public CASCADE;\nCREATE SCHEMA public;\n" + files["database.sql"]
            run("exec", "-T", "db", "psql", "-U", "peim", "-d", "peim", "-v", "ON_ERROR_STOP=1", "--single-transaction", input=sql, stdout=subprocess.DEVNULL)
        success = True
        print(f"{args.action} completed: {args.archive}")
    finally:
        # A failed restore keeps the writer stopped for inspection.
        if was_running and (success or args.action == "create"):
            run("start", "web")


if __name__ == "__main__":
    main()
