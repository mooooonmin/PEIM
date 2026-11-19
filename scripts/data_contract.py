"""Shared paths and identifiers; importing this module never writes files."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
EXAM_DIRECTORY = "정보관리기술사_기출문제"
EXAM_NAME = re.compile(r"제([1-9][0-9]*)회_정보관리기술사\.(pdf|hwp)$")


def exam_filename(round_number: int, extension: str = "pdf") -> str:
    if type(round_number) is not int or round_number <= 0:
        raise ValueError("회차는 양의 정수여야 합니다.")
    if extension not in ("pdf", "hwp"):
        raise ValueError("지원하지 않는 원본 형식입니다.")
    return f"제{round_number}회_정보관리기술사.{extension}"


def read_json(path: Path):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"중복 JSON 키: {path}: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_pairs)


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def preservation_hash(path: Path, mode: str) -> str:
    if mode == "binary":
        return sha256(path)
    if mode == "lf-text":
        return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    raise ValueError(f"Unknown preservation hash mode: {mode}")


def load_shards(directory: Path) -> dict:
    result = {}
    for path in sorted(directory.glob("*.json")):
        rows = read_json(path)
        overlap = result.keys() & rows.keys()
        if overlap:
            raise ValueError(f"분할 파일 간 중복: {path}: {sorted(overlap)}")
        result.update(rows)
    return result


def source_inventory(root: Path) -> list[dict]:
    """Match filenames only: this does not certify the document's contents."""
    result = []
    for path in sorted((root / EXAM_DIRECTORY).iterdir()):
        if path.suffix.lower() not in (".pdf", ".hwp"):
            continue
        match = EXAM_NAME.fullmatch(path.name)
        if not match:
            raise ValueError(f"시험지 파일명 규칙 위반: {path.name}")
        number, extension = int(match[1]), match[2]
        result.append({
            "id": f"exam-{number}-{extension}", "exam_id": f"exam-{number}",
            "path": path.relative_to(root).as_posix(),
            "format": extension, "sha256": sha256(path),
            "original_filename": None, "page_count": None,
            "verification_status": "unverified",
        })
    return result


def existing_topic_id(question_ids, topics):
    """Keep an established identity; merging identities needs explicit migration."""
    matches = {t["id"] for t in topics if set(question_ids) & set(t["question_ids"])}
    if len(matches) > 1:
        raise ValueError(f"기존 주제 병합은 ID 이전 계획이 필요합니다: {sorted(matches)}")
    return next(iter(matches), None)
