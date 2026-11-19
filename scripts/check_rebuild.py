"""Rebuild legacy derived data in a temporary copy; never modify the checkout."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from data_contract import ROOT, sha256


def inventory(directory):
    return {p.relative_to(directory).as_posix(): sha256(p)
            for p in directory.rglob("*") if p.is_file()}


def main():
    before = inventory(ROOT / "public/data")
    with tempfile.TemporaryDirectory(prefix="peim-rebuild-") as temp:
        root = Path(temp)
        for folder in ("public", "content"):
            # content/work/kwviz/out is a source, not a disposable build folder.
            shutil.copytree(ROOT / folder, root / folder)
        shutil.copytree(ROOT / "scripts", root / "scripts",
                        ignore=shutil.ignore_patterns("out", "__pycache__"))
        for tool in ("merge_topics.py", "build_content.py", "build_priority.py"):
            args = [sys.executable, str(root / "scripts" / tool)]
            if tool == "build_content.py":
                args.append("--strict")
            subprocess.run(args, cwd=root, check=True)
        after = inventory(root / "public/data")
        changed = sorted(k for k in before.keys() | after.keys() if before.get(k) != after.get(k))
        if changed:
            raise SystemExit("Rebuild differs: " + ", ".join(changed))
    if inventory(ROOT / "public/data") != before:
        raise SystemExit("Checkout data changed during rebuild check")
    print("PASS: rebuilt data matches every published file byte-for-byte")


if __name__ == "__main__":
    main()
