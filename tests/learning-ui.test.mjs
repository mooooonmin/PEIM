import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { setupLearning } from "../app/frontend/learning.js";

const html = await readFile("app/static/index.html", "utf8");
const q = (id = "q1") => ({
  id,
  round: 139,
  session: 1,
  number: 1,
  text: "문제 원문",
  answer: { body: "기존 답안 <script>그대로 표시</script>", revision: 3 },
  topics: [
    { id: "t1", title: "주제 하나" },
    { id: "t2", title: "주제 둘" },
  ],
});
function fixture() {
  const window = new Window({ url: "http://localhost:8000" });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.confirm = () => true;
  document.body.innerHTML = html;
  const $ = (id) => document.getElementById(id);
  const state = {
    failSave: false,
    failLoad: false,
    gate: null,
    pendingReference: null,
  };
  const notes = new Map(),
    calls = [],
    updates = [];
  const api = async (path, options) => {
    calls.push({ path, options });
    if (path.includes("/topics/")) {
      if (state.pendingReference && path.includes("t1"))
        return state.pendingReference;
      return {
        answers: [
          { variant: "short", body: path },
          { variant: "long", body: "서술형 참고 자료" },
        ],
      };
    }
    const id = path.split("/")[2];
    if (options) {
      if (state.gate) await state.gate;
      if (state.failSave) throw new Error("충돌 409");
      const value = JSON.parse(options.body);
      const result = { ...value, revision: value.revision + 1 };
      notes.set(id, result);
      return result;
    }
    if (state.failLoad) throw new Error("연결 실패");
    return notes.get(id) || { note: "", retry_requested: false, revision: 0 };
  };
  const open = setupLearning({
    api,
    renderMarkdown: async (body, target) => {
      target.textContent = body;
    },
    cancelRender() {},
    saved: (id, value) => updates.push({ id, value }),
  });
  const edit = (value) => {
    $("learning-note").value = value;
    $("learning-note").oninput();
  };
  const save = () => $("learning-form").onsubmit({ preventDefault() {} });
  return { $, state, notes, calls, updates, open, edit, save };
}
test("inline learning panel shares the main workspace and saves only learning metadata", async () => {
  const f = fixture(),
    question = q();
  await f.open(question);
  assert.equal(f.$("learning-panel").closest("main").id, "study");
  assert.equal(f.$("learning-panel").closest("dialog"), null);
  assert.equal(
    f.$("answer").closest(".study-columns"),
    f.$("learning-panel").closest(".study-columns"),
  );
  f.edit("보완할 정의");
  f.$("learning-retry").checked = true;
  f.$("learning-retry").onchange();
  await f.save();
  assert.deepEqual(f.updates[0], {
    id: "q1",
    value: { note: "보완할 정의", retry_requested: true, revision: 1 },
  });
  assert.equal(question.answer.revision, 3);
  assert.deepEqual(
    f.calls.filter((c) => c.options).map((c) => c.path),
    ["/questions/q1/learning"],
  );
  assert.equal(f.$("save-learning").disabled, true);
  await f.open(null);
  await f.open(q());
  assert.equal(f.$("learning-note").value, "보완할 정의");
  f.$("learning-retry").checked = false;
  f.$("learning-retry").onchange();
  await f.save();
  assert.equal(f.notes.get("q1").retry_requested, false);
});
test("conflict retains the draft and revision; reopening another question cannot mix notes", async () => {
  const f = fixture();
  await f.open(q());
  f.edit("내 메모");
  f.state.failSave = true;
  await f.save();
  assert.match(f.$("learning-result").textContent, /409/);
  assert.equal(f.$("learning-note").value, "내 메모");
  assert.equal(f.open.canLeave(), true);
  await f.open(null);
  await f.open(q("q2"));
  assert.equal(f.$("learning-note").value, "");
  await f.open(null);
  await f.open(q());
  assert.equal(f.$("learning-note").value, "내 메모");
  assert.match(f.$("learning-result").textContent, /復|복구/);
});
test("server reload is deliberate and preserves draft on a failed request", async () => {
  const f = fixture();
  await f.open(q());
  f.edit("로컬 메모");
  f.state.failLoad = true;
  await f.$("reload-learning").onclick();
  assert.equal(f.$("learning-note").value, "로컬 메모");
  assert.equal(f.$("save-learning").disabled, true);
  f.state.failLoad = false;
  f.notes.set("q1", {
    note: "최신 서버 메모",
    retry_requested: true,
    revision: 4,
  });
  await f.$("reload-learning").onclick();
  assert.equal(f.$("learning-note").value, "최신 서버 메모");
  assert.equal(localStorage.getItem("peim:learning:q1"), null);
});
test("pending save freezes fields and blocks duplicate writes and question changes", async () => {
  const f = fixture();
  await f.open(q());
  f.edit("저장 중 메모");
  let release;
  f.state.gate = new Promise((resolve) => {
    release = resolve;
  });
  const saving = f.save();
  assert.equal(f.$("learning-note").disabled, true);
  await f.save();
  await f.open(null);
  assert.equal(f.$("learning-panel").hidden, false);
  assert.equal(f.open.canLeave(), false);
  assert.equal(await f.open(q("q2")), false);
  assert.equal(f.calls.filter((c) => c.options).length, 1);
  release();
  await saving;
  assert.equal(f.$("learning-note").disabled, false);
});
test("slow old reference response cannot replace a newly selected topic", async () => {
  const f = fixture();
  let resolveOld;
  f.state.pendingReference = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const opening = f.open(q());
  f.$("learning-topic").value = "t2";
  await f.$("learning-topic").onchange();
  resolveOld({ answers: [{ variant: "short", body: "오래된 응답" }] });
  await opening;
  assert.match(f.$("learning-reference").textContent, /t2/);
  f.$("learning-variant").value = "long";
  await f.$("learning-variant").onchange();
  assert.equal(f.$("learning-reference").textContent, "서술형 참고 자료");
});
test("no topic or answer still permits notes; initial read failure prevents blind overwrite", async () => {
  const f = fixture();
  f.state.failLoad = true;
  await f.open({ ...q(), topics: [], answer: { body: "" } });
  assert.equal(f.$("learning-panel").hidden, false);
  assert.match(f.$("learning-reference").textContent, /연결된 주제/);
  assert.equal(f.$("learning-topic").disabled, true);
  assert.equal(f.$("save-learning").disabled, true);
  f.state.failLoad = false;
  await f.$("reload-learning").onclick();
  f.edit("메모만 작성");
  await f.save();
  assert.equal(f.notes.get("q1").note, "메모만 작성");
});

test("switching questions keeps unsaved drafts isolated from saved notes", async () => {
  const f = fixture();
  await f.open(q());
  f.edit("첫 문항의 미저장 메모");
  await f.open(q("q2"));
  assert.equal(f.$("learning-note").value, "");
  f.edit("둘째 문항 메모");
  await f.save();
  await f.open(q());
  assert.equal(f.$("learning-note").value, "첫 문항의 미저장 메모");
  assert.equal(f.notes.get("q2").note, "둘째 문항 메모");
  assert.equal(f.notes.has("q1"), false);
});

test("essay questions prefer long references and review status survives failure until saved", async () => {
  const f = fixture();
  await f.open({ ...q(), session: 4 });
  assert.equal(f.$("learning-variant").value, "long");
  f.edit("빠뜨린 개념");
  assert.match(f.$("review-state").textContent, /미저장/);
  f.state.failSave = true;
  await f.save();
  assert.match(f.$("review-state").textContent, /미저장/);
  f.state.failSave = false;
  await f.save();
  assert.match(f.$("review-state").textContent, /저장됨/);
});
