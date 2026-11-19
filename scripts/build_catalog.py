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


def matches_registered(root, catalog):
    """Runtime uploads can coexist without becoming part of the versioned seed."""
    actual = build(root)
    registered = {a["id"] for a in catalog["attachments"]}
    exam_ids = {e["id"] for e in catalog["exams"]}
    if exam_ids != {a["exam_id"] for a in catalog["attachments"]}:
        return False
    return catalog == {
        "schema_version": actual["schema_version"],
        "exams": [e for e in actual["exams"] if e["id"] in exam_ids],
        "attachments": [a for a in actual["attachments"] if a["id"] in registered],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="목록 차이만 검사; 파일 수정 없음")
    args = parser.parse_args()
    output = ROOT / "data/catalog.json"
    catalog = build(ROOT)
    if args.check:
        if not matches_registered(ROOT, read_json(output)):
            raise SystemExit("catalog is stale; review source changes before refreshing")
        print("catalog matches source files")
    else:
        output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"catalog: {len(catalog['exams'])} exams, {len(catalog['attachments'])} attachments")


if __name__ == "__main__":
    main()
