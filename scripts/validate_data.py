"""Read-only validation of preserved content and application data references."""
import argparse
import re
from pathlib import Path
from data_contract import ROOT, read_json, preservation_hash, load_shards
from build_catalog import build


def validate(root: Path) -> list[str]:
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    def index(rows, field, label):
        result = {}
        for row in rows:
            key = row[field]
            require(key not in result, f"{label}: duplicate {key}")
            result[key] = row
        return result

    data = root / "public/data"
    questions = index(read_json(data / "questions.json"), "id", "question")
    topics = index(read_json(data / "topics.json"), "id", "topic")
    domains = index(read_json(data / "domains.json"), "code", "domain")
    keywords = index(read_json(data / "keywords.json"), "id", "keyword")
    answers = load_shards(data / "answers")
    bodies = load_shards(data / "kw")
    diagrams = load_shards(data / "kwviz")
    catalog = read_json(root / "data/catalog.json")
    require(catalog == build(root), "catalog: source paths/hashes/rounds differ")
    exams = index(catalog["exams"], "id", "exam")
    for qid, q in questions.items():
        require(type(q["round"]) is int and q["round"] > 0, f"{qid}: invalid round")
        require(type(q["session"]) is int and 1 <= q["session"] <= 4, f"{qid}: invalid session")
        require(type(q["number"]) is int and q["number"] > 0, f"{qid}: invalid number")
        require(qid == f"r{q['round']}-s{q['session']}-q{q['number']:02d}", f"{qid}: identifier mismatch")
        require(f"exam-{q['round']}" in exams, f"{qid}: no source exam")
        require(isinstance(q["text"], str) and bool(q["text"].strip()), f"{qid}: empty text")
    linked = set()
    for tid, t in topics.items():
        require(t["domain"] in domains, f"{tid}: unknown domain")
        require(bool(t["title"].strip()), f"{tid}: empty title")
        for qid in t["question_ids"]:
            require(qid in questions, f"{tid}: unknown question {qid}")
            linked.add(qid)
        require(len(t["question_ids"]) == len(set(t["question_ids"])), f"{tid}: duplicate question relation")
        for kid in t.get("keywords", []):
            require(kid in keywords, f"{tid}: unknown keyword {kid}")
        require(tid in answers, f"{tid}: missing reference answer")
        require(t.get("has_answer") == bool(answers.get(tid)), f"{tid}: has_answer mismatch")
    require(linked == set(questions), "questions: some imported questions have no topic")
    require(set(answers) <= set(topics), "answers: unknown topic")
    for tid, answer in answers.items():
        require(set(answer) == {"short", "long"}, f"{tid}: expected short/long reference answers")
        for kind, body in answer.items():
            require(isinstance(body, str) and bool(body.strip()), f"{tid}/{kind}: empty answer")
            for kid in re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", body):
                require(kid in keywords, f"{tid}/{kind}: broken wiki link {kid}")
    require(set(bodies) == set(keywords), "keyword bodies: index/shards differ")
    require(set(diagrams) <= set(keywords), "diagrams: unknown keyword")
    for kid, body in bodies.items():
        for target in body.get("related", []):
            require(target in keywords, f"{kid}: unknown related keyword {target}")
    for path in sorted((data / "answers").glob("*.json")):
        for tid in read_json(path):
            require(tid in topics and topics[tid]["domain"] == path.stem, f"{tid}: wrong answer shard")
    priority = read_json(data / "priority.json")
    require(priority["last_round"] == max(q["round"] for q in questions.values()), "priority: stale last_round")
    require(priority["rounds"] == len({q["round"] for q in questions.values()}), "priority: stale rounds")
    require(priority["questions"] == len(questions), "priority: stale question count")
    tier_ids = [tid for ids in priority["tiers"].values() for tid in ids]
    require(len(tier_ids) == len(set(tier_ids)), "priority: duplicate topic")
    require(set(tier_ids) <= set(topics), "priority: unknown topic")
    stable = read_json(root / "data/stable_ids.json")
    require(set(stable["topic_ids"]) <= set(topics), "stable IDs: existing topic removed")
    require(set(stable["question_ids"]) <= set(questions), "stable IDs: existing question removed")
    for entry in read_json(root / "data/preservation.json")["files"]:
        path = root / entry["path"]
        require(path.is_file(), f"preservation: missing {entry['path']}")
        if path.is_file():
            require(preservation_hash(path, entry["hash_mode"]) == entry["sha256"], f"preservation: hash changed {entry['path']}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        errors = validate(args.root)
    except (ValueError, KeyError, TypeError, OSError) as exc:
        raise SystemExit(f"Invalid dataset: {exc}") from exc
    if errors:
        for error in errors:
            print(error)
        raise SystemExit(f"FAIL: {len(errors)} findings")
    print("PASS: IDs, relations, source catalog, answer coverage, shards and preservation")


if __name__ == "__main__":
    main()
