"""Local study app. All writes require a same-origin, explicit application request."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import uuid
from urllib.parse import urlsplit

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader
from psycopg.types.json import Jsonb
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.db import connect, initialize
from scripts.data_contract import EXAM_DIRECTORY, EXAM_NAME, exam_filename
from scripts.parse_questions import parse_round

MAX_FILE = 32 * 1024 * 1024


class LocalWriteGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            headers = dict(scope["headers"])
            origin = headers.get(b"origin", b"").decode()
            host = headers.get(b"host", b"").decode()
            if headers.get(b"x-peim-request") != b"1" or (origin and urlsplit(origin).netloc != host):
                return await JSONResponse({"detail": "앱에서 요청해 주세요."}, status_code=403)(scope, receive, send)
            chunks, size = [], 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body = message.get("body", b"")
                size += len(body)
                if size > MAX_FILE + 1024 * 1024:
                    return await JSONResponse({"detail": "파일은 32 MB 이하로 첨부해 주세요."}, status_code=413)(scope, receive, send)
                chunks.append(body)
                if not message.get("more_body"):
                    break
            delivered = False

            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
                return await receive()
            return await self.app(scope, replay, send)
        return await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(title="PEIM", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(LocalWriteGuard)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' blob:; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def require_row(row, message="자료를 찾을 수 없습니다."):
    if row is None:
        raise HTTPException(404, message)
    return row


def exam_dir():
    return Path(os.environ.get("EXAM_DIR", EXAM_DIRECTORY)).resolve()


def attachment_path(row):
    name = row["path"].split("/")[-1]
    if not EXAM_NAME.fullmatch(name) or row["path"] != f"{EXAM_DIRECTORY}/{name}":
        raise HTTPException(409, "시험지 경로가 저장 규칙과 다릅니다.")
    path = (exam_dir() / name).resolve()
    if path.parent != exam_dir() or not path.is_file():
        raise HTTPException(404, "원본 파일이 없습니다. 시험지 폴더 연결을 확인해 주세요.")
    return path


@app.get("/api/health")
def health():
    with connect() as db:
        db.execute("SELECT 1")
    return {"status": "ok"}


@app.get("/api/navigation")
def navigation():
    with connect() as db:
        return {
            "domains": [r["data"] for r in db.execute("SELECT data FROM domains ORDER BY array_position(ARRAY['SE','DB','NW','SEC','CA','MGT','NEW','DS'],code)")],
            "topics": db.execute("SELECT t.id,t.title,t.domain,count(q.question_id) AS count FROM topics t LEFT JOIN question_topics q ON q.topic_id=t.id GROUP BY t.id ORDER BY t.title").fetchall(),
            "exams": db.execute("SELECT e.id,e.round,e.status,count(q.id) AS count FROM exams e LEFT JOIN questions q ON q.exam_id=e.id GROUP BY e.id ORDER BY e.round DESC").fetchall(),
        }


@app.get("/api/questions")
def questions(topic: str | None = None, exam: str | None = None, search: str = ""):
    with connect() as db:
        return db.execute("""SELECT q.id,q.session,q.number,q.text,e.round,
            coalesce(a.status,'empty') AS answer_status,
            coalesce(n.retry_requested,false) AS retry_requested,
            coalesce(q.data->>'verification_status','unverified') AS verification_status
            FROM questions q JOIN exams e ON e.id=q.exam_id
            LEFT JOIN user_answers a ON a.question_id=q.id AND a.profile_id='local'
            LEFT JOIN learning_notes n ON n.question_id=q.id AND n.profile_id='local'
            WHERE (%s::text IS NULL OR EXISTS(SELECT 1 FROM question_topics t WHERE t.question_id=q.id AND t.topic_id=%s))
            AND (%s::text IS NULL OR q.exam_id=%s) AND (%s='' OR q.text ILIKE %s)
            ORDER BY e.round DESC,q.session,q.number""",
            (topic, topic, exam, exam, search, "%" + search + "%")).fetchall()


@app.get("/api/retry-questions")
def retry_questions():
    with connect() as db:
        return db.execute("""SELECT q.id,q.text,q.session,q.number,e.round,n.note,n.updated_at,
            coalesce(a.status,'empty') AS answer_status,
            coalesce((SELECT string_agg(t.title, ', ' ORDER BY t.title)
                FROM question_topics x JOIN topics t ON t.id=x.topic_id WHERE x.question_id=q.id),'') AS topics
            FROM learning_notes n JOIN questions q ON q.id=n.question_id JOIN exams e ON e.id=q.exam_id
            LEFT JOIN user_answers a ON a.question_id=q.id AND a.profile_id=n.profile_id
            WHERE n.profile_id='local' AND n.retry_requested=true
            ORDER BY n.updated_at DESC,q.id""").fetchall()


@app.get("/api/questions/{qid}")
def question(qid: str):
    with connect() as db:
        q = require_row(db.execute("SELECT q.*,e.round FROM questions q JOIN exams e ON q.exam_id=e.id WHERE q.id=%s", (qid,)).fetchone())
        q["topics"] = db.execute("SELECT t.id,t.title FROM topics t JOIN question_topics x ON x.topic_id=t.id WHERE x.question_id=%s ORDER BY t.title", (qid,)).fetchall()
        q["sources"] = db.execute("SELECT a.id,a.format,s.data FROM attachments a JOIN question_sources s ON s.attachment_id=a.id WHERE s.question_id=%s ORDER BY a.format", (qid,)).fetchall()
        q["answer"] = db.execute("SELECT body,status,revision,updated_at FROM user_answers WHERE question_id=%s AND profile_id='local'", (qid,)).fetchone() or {"body": "", "status": "draft", "revision": 0, "updated_at": None}
        return q


class Answer(BaseModel):
    body: str = Field(max_length=200000)
    revision: int = Field(ge=0)
    status: str = Field(pattern="^(draft|completed)$")


class LearningNote(BaseModel):
    note: str = Field(max_length=30000)
    retry_requested: bool = Field(strict=True)
    revision: int = Field(ge=0, strict=True)


@app.get("/api/questions/{qid}/learning")
def learning_note(qid: str):
    with connect() as db:
        require_row(db.execute("SELECT id FROM questions WHERE id=%s", (qid,)).fetchone())
        return db.execute("SELECT note,retry_requested,revision,updated_at FROM learning_notes WHERE question_id=%s AND profile_id='local'", (qid,)).fetchone() or {
            "note": "", "retry_requested": False, "revision": 0, "updated_at": None}


@app.put("/api/questions/{qid}/learning")
def save_learning_note(qid: str, value: LearningNote):
    with connect() as db:
        require_row(db.execute("SELECT id FROM questions WHERE id=%s FOR UPDATE", (qid,)).fetchone())
        current = db.execute("SELECT revision FROM learning_notes WHERE question_id=%s AND profile_id='local'", (qid,)).fetchone()
        if (current["revision"] if current else 0) != value.revision:
            raise HTTPException(409, "다른 창에서 복습 정보가 변경되었습니다. 메모를 보관한 뒤 최신 내용을 불러와 비교해 주세요.")
        return db.execute("""INSERT INTO learning_notes(question_id,note,retry_requested,revision) VALUES (%s,%s,%s,1)
            ON CONFLICT(profile_id,question_id) DO UPDATE SET note=excluded.note,retry_requested=excluded.retry_requested,
            revision=learning_notes.revision+1,updated_at=now()
            RETURNING note,retry_requested,revision,updated_at""", (qid, value.note, value.retry_requested)).fetchone()


@app.put("/api/questions/{qid}/answer")
def save_answer(qid: str, value: Answer):
    with connect() as db:
        require_row(db.execute("SELECT id FROM questions WHERE id=%s FOR UPDATE", (qid,)).fetchone())
        current = db.execute("SELECT * FROM user_answers WHERE question_id=%s AND profile_id='local'", (qid,)).fetchone()
        if (current["revision"] if current else 0) != value.revision:
            raise HTTPException(409, "다른 창에서 답안이 변경되었습니다. 내 글을 복사한 뒤 최신 답안을 불러와 주세요.")
        row = db.execute("""INSERT INTO user_answers(question_id,body,status,revision) VALUES (%s,%s,%s,1)
            ON CONFLICT(profile_id,question_id) DO UPDATE SET body=excluded.body,status=excluded.status,
            revision=user_answers.revision+1,updated_at=now()
            RETURNING body,status,revision,updated_at""", (qid, value.body, value.status)).fetchone()
        db.execute("INSERT INTO answer_revisions VALUES ('local',%s,%s,%s,%s,now())", (qid, row["revision"], row["body"], row["status"]))
        return row


@app.get("/api/questions/{qid}/history")
def history(qid: str):
    with connect() as db:
        return db.execute("SELECT revision,body,status,saved_at FROM answer_revisions WHERE question_id=%s AND profile_id='local' ORDER BY revision DESC LIMIT 50", (qid,)).fetchall()


@app.get("/api/topics/{tid}/reference")
def reference(tid: str):
    with connect() as db:
        topic = require_row(db.execute("SELECT title FROM topics WHERE id=%s", (tid,)).fetchone())
        return {"title": topic["title"], "answers": db.execute("SELECT variant,body FROM reference_answers WHERE topic_id=%s ORDER BY variant DESC", (tid,)).fetchall()}


@app.get("/api/exams")
def exams():
    with connect() as db:
        return db.execute("""SELECT e.id,e.round,e.status,a.id AS attachment_id,a.format,a.data,a.extraction_status
            FROM exams e LEFT JOIN attachments a ON e.id=a.exam_id ORDER BY e.round DESC,a.format""").fetchall()


@app.get("/api/attachments/{aid}/file")
def original(aid: str):
    with connect() as db:
        row = require_row(db.execute("SELECT * FROM attachments WHERE id=%s", (aid,)).fetchone())
    path = attachment_path(row)
    return FileResponse(path, media_type="application/pdf" if row["format"] == "pdf" else "application/octet-stream",
                        filename=path.name, content_disposition_type="inline" if row["format"] == "pdf" else "attachment")


@app.post("/api/exams/upload")
def upload(round_number: int = Form(gt=0, le=2147483647), file: UploadFile = File()):
    folder = exam_dir()
    if not folder.is_dir():
        raise HTTPException(503, "시험지 폴더가 연결되지 않았습니다.")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(422, "PDF 파일을 선택해 주세요.")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".peim-upload-", suffix=".tmp", dir=folder, delete=False) as output:
            temporary = Path(output.name)
            size, digest = 0, hashlib.sha256()
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE:
                    raise HTTPException(413, "파일은 32 MB 이하로 첨부해 주세요.")
                digest.update(chunk)
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        try:
            if temporary.read_bytes()[:5] != b"%PDF-":
                raise ValueError("not PDF")
            reader = PdfReader(temporary, strict=True)
            if reader.is_encrypted:
                raise ValueError("encrypted")
            pages = len(reader.pages)
            if not 1 <= pages <= 500:
                raise ValueError("page count")
        except Exception as exc:
            raise HTTPException(422, "읽을 수 있는 PDF인지 확인해 주세요. 암호화 파일은 지원하지 않습니다.") from exc
        name = exam_filename(round_number)
        target = folder / name
        eid, aid = f"exam-{round_number}", f"exam-{round_number}-pdf"
        metadata = {"original_filename": Path(file.filename.replace("\\", "/")).name, "page_count": pages,
                    "verification_status": "unverified"}
        # Commit failure leaves a complete orphan file; a same-file retry repairs its DB record.
        # Never delete an existing original, even after an uncertain database commit.
        with connect() as db:
            db.execute("SELECT pg_advisory_xact_lock(70319,%s)", (round_number,))
            old = db.execute("SELECT sha256 FROM attachments WHERE id=%s", (aid,)).fetchone()
            if old and old["sha256"] != digest.hexdigest():
                raise HTTPException(409, "같은 회차에 다른 PDF가 등록되어 있습니다. 원본을 덮어쓰지 않았습니다.")
            duplicate = target.exists()
            if target.is_symlink():
                raise HTTPException(409, "기존 파일이 링크입니다. 원본 경로를 확인해 주세요.")
            if duplicate:
                if hashlib.sha256(target.read_bytes()).hexdigest() != digest.hexdigest():
                    raise HTTPException(409, "같은 이름의 다른 파일이 있습니다. 원본을 덮어쓰지 않았습니다.")
            else:
                try:
                    os.link(temporary, target)
                except FileExistsError as exc:
                    raise HTTPException(409, "동시에 파일이 등록되었습니다. 다시 확인해 주세요.") from exc
            db.execute("INSERT INTO exams VALUES (%s,%s,'draft',%s) ON CONFLICT DO NOTHING", (eid, round_number, Jsonb({"exam_date": None})))
            db.execute("""INSERT INTO attachments(id,exam_id,path,sha256,format,data) VALUES (%s,%s,%s,%s,'pdf',%s)
                ON CONFLICT(id) DO NOTHING""",
                (aid, eid, f"{EXAM_DIRECTORY}/{name}", digest.hexdigest(), Jsonb(metadata)))
            db.execute("UPDATE attachments SET data=jsonb_set(data,'{page_count}',to_jsonb(%s::integer)) WHERE id=%s", (pages, aid))
        return {"id": aid, "filename": name, "duplicate": duplicate, "page_count": pages}
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        file.file.close()


@app.post("/api/attachments/{aid}/extract")
def extract(aid: str):
    with connect() as db:
        row = require_row(db.execute("SELECT a.*,e.round FROM attachments a JOIN exams e ON e.id=a.exam_id WHERE a.id=%s", (aid,)).fetchone())
    if row["format"] != "pdf":
        raise HTTPException(422, "현재 문항 추출은 PDF만 지원합니다.")
    try:
        reader = PdfReader(attachment_path(row))
        pages = [{"page": i + 1, "text": page.extract_text() or ""} for i, page in enumerate(reader.pages)]
        candidates = parse_round("\n".join(p["text"] for p in pages), row["round"])
        result = {"pages": pages, "candidates": candidates,
                  "message": "추출 초안입니다. 원문과 대조한 뒤 등록해 주세요." if candidates else "문항을 자동으로 구분하지 못했습니다. 원문을 보고 직접 입력해 주세요."}
        state = "ready" if candidates else "manual_required"
    except HTTPException:
        raise
    except Exception:
        result, state = {"pages": [], "candidates": [], "message": "추출에 실패했습니다. 원본은 보존되어 있으며 직접 입력할 수 있습니다."}, "failed"
    with connect() as db:
        db.execute("UPDATE attachments SET extraction=%s,extraction_status=%s WHERE id=%s", (Jsonb(result), state, aid))
        if state != "failed":
            db.execute("UPDATE attachments SET data=data || %s WHERE id=%s", (Jsonb({"page_count": len(result["pages"])}), aid))
    return result


@app.get("/api/attachments/{aid}/extraction")
def extraction(aid: str):
    with connect() as db:
        row = require_row(db.execute("SELECT extraction FROM attachments WHERE id=%s", (aid,)).fetchone())
        return row["extraction"] or {"pages": [], "candidates": [], "message": "추출 전입니다. 직접 입력도 가능합니다."}


class NewTopic(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    domain: str


@app.post("/api/topics")
def new_topic(value: NewTopic):
    title = value.title.strip()
    if not title:
        raise HTTPException(422, "주제명을 입력해 주세요.")
    tid = "t-" + uuid.uuid4().hex
    with connect() as db:
        require_row(db.execute("SELECT code FROM domains WHERE code=%s FOR UPDATE", (value.domain,)).fetchone(), "분야를 선택해 주세요.")
        if db.execute("SELECT id FROM topics WHERE domain=%s AND lower(title)=lower(%s)", (value.domain, title)).fetchone():
            raise HTTPException(409, "같은 분야에 같은 이름의 주제가 있습니다. 기존 주제를 선택해 주세요.")
        db.execute("INSERT INTO topics VALUES (%s,%s,%s,%s)", (tid, value.domain, title, Jsonb({"title_en": "", "aliases": []})))
    return {"id": tid, "title": title, "domain": value.domain}


class NewQuestion(BaseModel):
    attachment_id: str
    session: int = Field(ge=1, le=4)
    number: int = Field(ge=1, le=999)
    text: str = Field(min_length=1, max_length=30000)
    topic_id: str
    page: int | None = Field(default=None, ge=1)
    reviewed: bool


@app.post("/api/exams/{round_number}/questions")
def register_question(round_number: int, value: NewQuestion):
    if not value.reviewed or not value.text.strip():
        raise HTTPException(422, "원문을 확인하고 확인 표시를 선택해 주세요.")
    eid = f"exam-{round_number}"
    qid = f"r{round_number}-s{value.session}-q{value.number:02d}"
    review = {"verification_status": "verified", "reviewer": "local", "reviewed_at": datetime.now(timezone.utc).isoformat()}
    with connect() as db:
        require_row(db.execute("SELECT id FROM exams WHERE id=%s FOR UPDATE", (eid,)).fetchone())
        attachment = require_row(db.execute("SELECT * FROM attachments WHERE id=%s AND exam_id=%s", (value.attachment_id, eid)).fetchone())
        page_count = attachment["data"].get("page_count")
        if value.page and (not page_count or value.page > page_count):
            raise HTTPException(422, "확인된 PDF 페이지 범위 안에서 입력해 주세요.")
        require_row(db.execute("SELECT id FROM topics WHERE id=%s", (value.topic_id,)).fetchone(), "주제를 선택해 주세요.")
        if db.execute("SELECT id FROM questions WHERE id=%s", (qid,)).fetchone():
            raise HTTPException(409, "이미 등록된 문항입니다. 기존 문제와 답안을 덮어쓰지 않았습니다.")
        db.execute("INSERT INTO questions VALUES (%s,%s,%s,%s,%s,%s)",
                   (qid, eid, value.session, value.number, value.text.strip(), Jsonb(review)))
        db.execute("INSERT INTO question_topics VALUES (%s,%s)", (qid, value.topic_id))
        db.execute("INSERT INTO question_sources VALUES (%s,%s,%s)",
                   (qid, value.attachment_id, Jsonb({**review, "page_start": value.page, "page_end": value.page, "association_basis": "manual_review",
                                                   "verification_status": "verified" if value.page else "unverified"})))
        db.execute("UPDATE exams SET status='published' WHERE id=%s AND status='draft'", (eid,))
    return {"id": qid}


class SourceReview(BaseModel):
    attachment_id: str
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)


class QuestionReview(BaseModel):
    model_config = {"extra": "forbid"}
    revision: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=30000)
    topic_ids: list[str] = Field(min_length=1, max_length=100)
    sources: list[SourceReview] = Field(max_length=100)
    verification_status: str = Field(pattern="^(unverified|verified|needs_review)$")
    confirmed: bool = False


def review_snapshot(db, q):
    return {"text": q["text"], "data": q["data"],
            "topics": db.execute("SELECT t.id,t.title FROM topics t JOIN question_topics x ON x.topic_id=t.id WHERE x.question_id=%s ORDER BY t.id", (q["id"],)).fetchall(),
            "sources": db.execute("SELECT attachment_id,data FROM question_sources WHERE question_id=%s ORDER BY attachment_id", (q["id"],)).fetchall()}


@app.put("/api/questions/{qid}/review")
def review_question(qid: str, value: QuestionReview):
    if not value.text.strip() or len(set(value.topic_ids)) != len(value.topic_ids):
        raise HTTPException(422, "문제 내용과 중복 없는 연결 주제를 입력해 주세요.")
    if value.verification_status == "verified" and not value.confirmed:
        raise HTTPException(422, "확인 완료로 저장하려면 원문 대조 확인을 선택해 주세요.")
    with connect() as db:
        q = require_row(db.execute("SELECT * FROM questions WHERE id=%s FOR UPDATE", (qid,)).fetchone())
        revision = q["data"].get("review_revision", 0)
        if value.revision != revision:
            raise HTTPException(409, "다른 창에서 문항을 수정했습니다. 입력 내용을 복사한 뒤 닫고 다시 열어 비교해 주세요.")
        before = review_snapshot(db, q)
        topics = db.execute("SELECT id FROM topics WHERE id=ANY(%s)", (value.topic_ids,)).fetchall()
        if len(topics) != len(value.topic_ids):
            raise HTTPException(422, "존재하는 주제를 선택해 주세요.")
        source_ids = [x.attachment_id for x in value.sources]
        if len(set(source_ids)) != len(source_ids) or set(source_ids) != {x["attachment_id"] for x in before["sources"]}:
            raise HTTPException(422, "기존 원본 연결을 모두 유지해야 합니다.")
        if value.verification_status == "verified" and not source_ids:
            raise HTTPException(422, "대조할 원본 연결이 없습니다.")
        checked = []
        for source in value.sources:
            if (source.page_start is None) != (source.page_end is None) or (source.page_start and source.page_start > source.page_end):
                raise HTTPException(422, "시작·끝 페이지를 함께 입력하고 순서를 확인해 주세요.")
            attachment = require_row(db.execute("SELECT * FROM attachments WHERE id=%s", (source.attachment_id,)).fetchone())
            if source.page_start is not None:
                if attachment["format"] != "pdf":
                    raise HTTPException(422, "페이지 연결은 PDF에서만 지원합니다.")
                path = attachment_path(attachment)
                if hashlib.sha256(path.read_bytes()).hexdigest() != attachment["sha256"]:
                    raise HTTPException(409, "원본 파일이 등록 당시와 다릅니다. 원본을 확인해 주세요.")
                try:
                    count = len(PdfReader(path).pages)
                except Exception as exc:
                    raise HTTPException(422, "PDF 페이지를 읽을 수 없습니다.") from exc
                if source.page_end > count:
                    raise HTTPException(422, f"PDF는 {count}페이지입니다. 페이지 범위를 확인해 주세요.")
            checked.append(source)
        metadata = {"verification_status": value.verification_status, "reviewer": "local",
                    "reviewed_at": datetime.now(timezone.utc).isoformat(), "review_revision": revision + 1}
        q = db.execute("UPDATE questions SET text=%s,data=data || %s WHERE id=%s RETURNING *",
                       (value.text.strip(), Jsonb(metadata), qid)).fetchone()
        db.execute("DELETE FROM question_topics WHERE question_id=%s", (qid,))
        for tid in value.topic_ids:
            db.execute("INSERT INTO question_topics VALUES (%s,%s)", (qid, tid))
        for source in checked:
            state = value.verification_status if source.page_start else "unverified"
            data = {**metadata, "verification_status": state, "page_start": source.page_start,
                    "page_end": source.page_end, "association_basis": "manual_review"}
            db.execute("UPDATE question_sources SET data=data || %s WHERE question_id=%s AND attachment_id=%s",
                       (Jsonb(data), qid, source.attachment_id))
        after = review_snapshot(db, q)
        db.execute("INSERT INTO question_revisions(question_id,revision,before_data,after_data) VALUES (%s,%s,%s,%s)",
                   (qid, revision + 1, Jsonb(before), Jsonb(after)))
    return {"id": qid, "revision": revision + 1}


@app.get("/api/questions/{qid}/reviews")
def question_reviews(qid: str):
    with connect() as db:
        require_row(db.execute("SELECT id FROM questions WHERE id=%s", (qid,)).fetchone())
        return db.execute("SELECT revision,before_data,after_data,reviewer,saved_at FROM question_revisions WHERE question_id=%s ORDER BY revision DESC LIMIT 50", (qid,)).fetchall()


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
