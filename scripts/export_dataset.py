"""Export a deterministic, normalized v1 seed for the future local web/DB app."""
import argparse
import json
from pathlib import Path
from data_contract import ROOT, load_shards, read_json
from validate_data import validate


def export(root: Path) -> dict:
    errors = validate(root)
    if errors:
        raise ValueError("Invalid input: " + "; ".join(errors[:10]))
    data = root / "public/data"
    catalog = read_json(root / "data/catalog.json")
    topics = read_json(data / "topics.json")
    questions = read_json(data / "questions.json")
    answers = load_shards(data / "answers")
    bodies = load_shards(data / "kw")
    diagrams = load_shards(data / "kwviz")
    source_by_exam = {}
    for attachment in catalog["attachments"]:
        source_by_exam.setdefault(attachment["exam_id"], []).append(attachment["id"])
    result = {
        "schema_version": 1,
        "exams": catalog["exams"], "attachments": catalog["attachments"],
        "domains": read_json(data / "domains.json"),
        "questions": [{**q, "exam_id": f"exam-{q['round']}",
                       "verification_status": "unverified"} for q in questions],
        "question_sources": [
            {"question_id": q["id"], "attachment_id": aid,
             "page_start": None, "page_end": None,
             "association_basis": "round_filename", "verification_status": "unverified"}
            for q in questions for aid in source_by_exam[f"exam-{q['round']}"]
        ],
        "topics": [{key: t[key] for key in ("id", "title", "title_en", "domain", "aliases")} for t in topics],
        "question_topics": [{"question_id": qid, "topic_id": t["id"],
                             "verification_status": "unverified"}
                            for t in topics for qid in t["question_ids"]],
        "reference_answers": [
            {"id": f"{t['id']}:{variant}", "topic_id": t["id"], "variant": variant,
             "body": body, "revision": 1, "verification_status": "unverified",
             "source_path": f"public/data/answers/{t['domain']}.json",
             "source_pointer": f"/{t['id']}/{variant}", "citations": []}
            for t in topics for variant, body in sorted(answers[t["id"]].items())
        ],
        "keywords": [{**k, **bodies[k["id"]], "visual": diagrams.get(k["id"]),
                      "verification_status": "unverified"}
                     for k in read_json(data / "keywords.json")],
        "topic_keywords": [{"topic_id": t["id"], "keyword_id": kid}
                           for t in topics for kid in t["keywords"]],
        "priority": read_json(data / "priority.json"),
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "scripts/out/dataset-v1.json")
    args = parser.parse_args()
    output = args.output.resolve()
    # Export is disposable, never an in-place update of original data.
    if not output.is_relative_to((ROOT / "scripts/out").resolve()):
        raise SystemExit("Export target must be inside scripts/out")
    result = export(ROOT)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(f"Exported schema v1: {len(result['questions'])} questions, {len(result['topics'])} topics")


if __name__ == "__main__":
    main()
