"""Explicitly refresh source metadata without rewriting study content."""
import argparse
import json
from data_contract import ROOT, read_json, source_inventory


def build(root):
    sources = source_inventory(root)
    rounds = sorted({int(s["exam_id"].split("-")[1]) for s in sources})
    return {
        "schema_version": 1,
        "exams": [{"id": f"exam-{n}", "round": n, "exam_date": None,
                   "status": "imported_unverified"} for n in rounds],
        "attachments": sources,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="목록 차이만 검사; 파일 수정 없음")
    args = parser.parse_args()
    output = ROOT / "data/catalog.json"
    catalog = build(ROOT)
    if args.check:
        if read_json(output) != catalog:
            raise SystemExit("catalog is stale; review source changes before refreshing")
        print("catalog matches source files")
    else:
        output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"catalog: {len(catalog['exams'])} exams, {len(catalog['attachments'])} attachments")


if __name__ == "__main__":
    main()
