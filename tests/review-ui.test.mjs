import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Window } from "happy-dom";
import { setupManagement } from "../app/frontend/manage.js";

// Run the production handlers against a DOM and a deterministic API. PDF raster
// output is checked separately in a browser, not simulated by this test.
const bundle = await build({
  entryPoints: ["app/frontend/review.js"],
  bundle: true,
  write: false,
  format: "esm",
  plugins: [
    {
      name: "pdf-fixture",
      setup(b) {
        b.onResolve({ filter: /^pdfjs-dist$/ }, () => ({
          path: "pdf",
          namespace: "fixture",
        }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const GlobalWorkerOptions = {}; export const getDocument = () => globalThis.pdfFixture();",
        }));
      },
    },
  ],
});
const { setupQuestionReview } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const html = await readFile("app/static/index.html", "utf8");
function question(id) {
  return {
    id,
    text: `문제 ${id}`,
    round: 139,
    session: 1,
    number: Number(id.slice(1)),
    topics: [{ id: "topic", title: "주제" }],
    sources: [],
    data: { verification_status: "unverified", review_revision: 0 },
  };
}
function fixture() {
  const window = new Window();
  window.document.body.innerHTML = html;
  globalThis.document = window.document;
  globalThis.window = window;
  globalThis.location = window.location;
  globalThis.history = window.history;
  globalThis.Option = window.Option;
  globalThis.confirm = () => true;
  const calls = [],
    records = new Map(["q1", "q2", "q3"].map((id) => [id, question(id)]));
  const $ = (id) => document.getElementById(id);
  const state = {
    failSave: false,
    failLoad: false,
    failRefresh: false,
    gate: null,
  };
  const api = async (path, options) => {
    calls.push({ path, options });
    if (path === "/navigation")
      return { topics: [{ id: "topic", title: "주제" }] };
    if (path.endsWith("/reviews")) return [];
    const id = path.split("/")[2];
    if (options) {
      if (state.gate) await state.gate;
      if (state.failSave) throw new Error("다른 창에서 수정됨 (409)");
      const payload = JSON.parse(options.body);
      records.get(id).text = payload.text;
      records.get(id).data.verification_status = payload.verification_status;
      return { revision: ++records.get(id).data.review_revision };
    }
    if (state.failLoad) throw new Error("연결 실패");
    return structuredClone(records.get(id));
  };
  const open = setupQuestionReview({
    api,
    refreshed: async () => {
      if (state.failRefresh) throw new Error("갱신 실패");
    },
  });
  function edit(text) {
    $("edit-question-text").value = text;
    $("edit-question-text").dispatchEvent(
      new window.Event("input", { bubbles: true }),
    );
  }
  const save = (next = true) =>
    $("edit-question-form").onsubmit({
      preventDefault() {},
      submitter: $(next ? "save-review-next" : "save-question-review"),
    });
  return { window, $, state, calls, records, open, edit, save };
}

test("filtered order is snapshotted; boundaries and position follow the full queue", async () => {
  const f = fixture(),
    ids = ["q3", "q1", "q2"];
  await f.open("q3", ids);
  ids.splice(0);
  assert.equal(f.$("review-previous").disabled, true);
  assert.match(f.$("review-position").textContent, /1 \/ 3/);
  await f.$("review-next").onclick();
  assert.equal(f.$("edit-question-text").value, "문제 q1");
  await f.$("review-next").onclick();
  assert.equal(f.$("review-next").disabled, true);
  assert.equal(f.$("save-review-next").disabled, true);
  await f.$("review-previous").onclick();
  assert.match(f.$("review-position").textContent, /2 \/ 3/);
});

test("cancelled discard and failed navigation preserve unsaved text", async () => {
  const f = fixture();
  await f.open("q1", ["q1", "q2"]);
  f.edit("내 수정");
  globalThis.confirm = () => false;
  await f.$("review-next").onclick();
  assert.equal(f.$("edit-question-text").value, "내 수정");
  assert.match(f.$("review-position").textContent, /1 \/ 2/);
  globalThis.confirm = () => true;
  f.state.failLoad = true;
  await f.$("review-next").onclick();
  assert.equal(f.$("edit-question-text").value, "내 수정");
  assert.match(f.$("edit-question-result").textContent, /이동 실패/);
  assert.equal(f.$("edit-question-text").disabled, false);
});

test("save failure stays put; success advances even after verification changes", async () => {
  const f = fixture();
  await f.open("q1", ["q1", "q2", "q3"]);
  f.edit("수정한 원문");
  f.$("edit-verification").value = "verified";
  f.state.failSave = true;
  await f.save();
  assert.equal(f.$("edit-question-text").value, "수정한 원문");
  assert.match(f.$("review-position").textContent, /1 \/ 3/);
  assert.match(f.$("edit-question-result").textContent, /409/);
  f.state.failSave = false;
  await f.save();
  assert.equal(f.records.get("q1").text, "수정한 원문");
  assert.equal(f.$("edit-question-text").value, "문제 q2");
  assert.match(f.$("review-position").textContent, /2 \/ 3/);
  assert.equal(f.$("edit-confirmed").checked, false);
});

test("in-flight save blocks duplicate submissions, navigation, close and input", async () => {
  const f = fixture();
  await f.open("q1", ["q1", "q2"]);
  let release;
  f.state.gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = f.save();
  assert.equal(f.$("review-next").disabled, true);
  assert.equal(f.$("edit-question-text").disabled, true);
  await f.save();
  await f.$("review-next").onclick();
  f.$("close-question-review").onclick();
  assert.equal(f.$("question-review-dialog").open, true);
  assert.equal(f.calls.filter((c) => c.options).length, 1);
  release();
  await pending;
  assert.equal(f.$("edit-question-text").disabled, false);
  assert.match(f.$("review-position").textContent, /2 \/ 2/);
});

test("saved data remains distinguishable from failed refresh or next fetch", async () => {
  const f = fixture();
  await f.open("q1", ["q1", "q2"]);
  f.state.failRefresh = true;
  await f.save();
  assert.match(
    f.$("edit-question-result").textContent,
    /저장했습니다.*갱신에 실패/,
  );
  assert.match(f.$("review-position").textContent, /1 \/ 2/);
  f.state.failRefresh = false;
  f.state.failLoad = true;
  await f.save();
  assert.match(
    f.$("edit-question-result").textContent,
    /저장은 완료.*다음 문항/,
  );
  assert.match(f.$("review-position").textContent, /1 \/ 2/);
});

test("zoom bounds, fit reset and per-question reset do not dirty the form", async () => {
  const f = fixture();
  await f.open("q1", ["q1", "q2"]);
  for (let i = 0; i < 10; i++) f.$("pdf-zoom-in").onclick();
  assert.equal(f.$("review-pdf-canvas").style.width, "250%");
  assert.equal(f.$("pdf-zoom-in").disabled, true);
  f.$("pdf-fit").onclick();
  assert.equal(f.$("review-pdf-canvas").style.width, "100%");
  for (let i = 0; i < 10; i++) f.$("pdf-zoom-out").onclick();
  assert.equal(f.$("review-pdf-canvas").style.width, "50%");
  assert.equal(f.$("pdf-zoom-out").disabled, true);
  globalThis.confirm = () => {
    throw new Error("Zoom must not prompt for unsaved changes");
  };
  await f.$("review-next").onclick();
  assert.equal(f.$("review-pdf-canvas").style.width, "100%");
});

test("single-question save stays open and updates the displayed status", async () => {
  const f = fixture();
  await f.open("q1");
  f.$("edit-verification").value = "needs_review";
  await f.save(false);
  assert.equal(f.$("question-review-dialog").open, true);
  assert.match(f.$("review-position").textContent, /1 \/ 1.*재검토 필요/);
  assert.equal(f.$("save-review-next").disabled, true);
});

test("management passes every filtered ID across pagination in displayed order", async () => {
  const f = fixture();
  const questions = Array.from({ length: 55 }, (_, i) => ({
    id: `q${i + 1}`,
    round: 139,
    session: 1,
    number: i + 1,
    text: "검색 일치",
    verification_status: "unverified",
  }));
  questions.push({
    id: "excluded",
    round: 138,
    session: 1,
    number: 1,
    text: "검색 일치",
    verification_status: "verified",
  });
  let opened;
  const management = setupManagement({
    api: async (path) =>
      path === "/questions"
        ? questions
        : {
            exams: [
              { id: "exam-139", round: 139 },
              { id: "exam-138", round: 138 },
            ],
          },
    openReview: (id, ids) => {
      opened = { id, ids };
    },
    loadUploads: async () => {},
  });
  await management.load();
  f.$("managed-status").value = "unverified";
  f.$("managed-status").dispatchEvent(new f.window.Event("change"));
  const rows = f.$("managed-list").querySelectorAll("tbody tr");
  assert.equal(rows.length, 50);
  rows[49].querySelector("button").onclick();
  assert.equal(opened.id, "q50");
  assert.deepEqual(
    opened.ids,
    questions.slice(0, 55).map((q) => q.id),
  );
  f.$("managed-search").value = "없는 문항";
  f.$("managed-search").dispatchEvent(new f.window.Event("input"));
  assert.equal(f.$("managed-list").querySelectorAll("button").length, 0);
});

test("management refresh failure propagates to the save-and-next caller only when requested", async () => {
  const f = fixture();
  const management = setupManagement({
    api: async () => {
      throw new Error("목록 연결 실패");
    },
    openReview() {},
    loadUploads() {},
  });
  await management.refreshQuestions();
  assert.match(f.$("managed-count").textContent, /목록 연결 실패/);
  await assert.rejects(
    management.refreshQuestions({ throwOnError: true }),
    /목록 연결 실패/,
  );
});
