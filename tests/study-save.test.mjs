import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Window } from "happy-dom";

const html = await readFile("app/static/index.html", "utf8");
const bundle = await build({
  entryPoints: ["app/frontend/main.js"],
  bundle: true,
  write: false,
  format: "iife",
  plugins: [
    {
      name: "renderers",
      setup(b) {
        b.onResolve({ filter: /^(mermaid|pdfjs-dist)$/ }, (a) => ({
          path: a.path,
          namespace: "test",
        }));
        b.onLoad({ filter: /.*/, namespace: "test" }, (a) => ({
          contents:
            a.path === "mermaid"
              ? "export default {initialize(){}}"
              : "export const GlobalWorkerOptions={}; export function getDocument(){}",
        }));
      },
    },
  ],
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await tick();
  }
  assert.fail("Expected UI state was not reached");
}
async function fixture(t) {
  const w = new Window({
    url: "http://localhost:8000/?mode=exam&exam=exam-140&q=q1",
  });
  t.after(() => w.happyDOM.abort());
  w.document.write(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""));
  const $ = (id) => w.document.getElementById(id);
  const answers = new Map(
    ["q1", "q2"].map((id) => [
      id,
      { body: id + " 기존 답안", status: "draft", revision: 1 },
    ]),
  );
  const state = { gate: null, fail: false, requested: false };
  w.fetch = async (url, opts = {}) => {
    const path = String(url).replace("/api", "");
    let data;
    if (path === "/navigation")
      data = {
        domains: [],
        topics: [],
        exams: [
          { id: "exam-140", round: 140, count: 2 },
          { id: "exam-141", round: 141, count: 0 },
        ],
      };
    else if (path.startsWith("/questions?")) {
      if (path.includes("exam-141")) {
        state.requested = true;
        await state.gate;
        data = [];
      } else
        data = ["q1", "q2"].map((id, i) => ({
          id,
          round: 140,
          session: 1,
          number: i + 1,
          answer_status: "draft",
        }));
    } else if (path.endsWith("/writing-guide"))
      data = {
        notice: "안내",
        requirements: [],
        outline: [],
        keywords: [],
        checklist: [],
      };
    else if (path.endsWith("/learning"))
      data = { note: "", retry_requested: false, revision: 0 };
    else if (path.endsWith("/answer")) {
      if (state.fail)
        return {
          ok: false,
          status: 500,
          json: async () => ({ detail: "저장 실패" }),
        };
      const id = path.split("/")[2],
        v = JSON.parse(opts.body);
      data = { ...v, revision: v.revision + 1 };
      answers.set(id, data);
    } else if (/^\/questions\/q[12]$/.test(path)) {
      const id = path.split("/")[2];
      data = {
        id,
        round: 140,
        session: 1,
        number: id === "q1" ? 1 : 2,
        text: id,
        topics: [],
        sources: [],
        data: {},
        answer: structuredClone(answers.get(id)),
      };
      if (state.gate) {
        state.requested = true;
        await state.gate;
      }
    } else throw new Error("Unexpected request " + path);
    return { ok: true, json: async () => data };
  };
  w.eval(bundle.outputFiles[0].text);
  await until(() => $("answer").value === "q1 기존 답안");
  function edit() {
    $("answer").value = "응답 대기 중 추가 입력";
    $("answer").dispatchEvent(new w.Event("input"));
  }
  return { w, $, state, answers, edit };
}
for (const fail of [false, true])
  test(`문항 응답 대기 중 입력 ${fail ? "저장 실패 시 현재 답안 유지" : "저장 후 이동"}`, async (t) => {
    const f = await fixture(t);
    let release;
    f.state.gate = new Promise((r) => (release = r));
    f.state.fail = fail;
    f.$("next-question").click();
    await until(() => f.state.requested);
    f.edit();
    release();
    await until(() =>
      fail
        ? !f.$("save-error").hidden
        : f.$("question-meta").textContent.includes("2번"),
    );
    assert.equal(
      fail ? f.$("answer").value : f.answers.get("q1").body,
      "응답 대기 중 추가 입력",
    );
    if (fail) assert.match(f.$("question-meta").textContent, /1번/);
    else assert.equal(f.$("answer").value, "q2 기존 답안");
  });
test("빈 회차 응답 대기 중 입력도 저장한 뒤 편집기를 비운다", async (t) => {
  const f = await fixture(t);
  let release;
  f.state.gate = new Promise((r) => (release = r));
  [...f.$("navigation").querySelectorAll("button")]
    .find((b) => b.textContent.includes("141회"))
    .click();
  await until(() => f.state.requested);
  f.edit();
  release();
  await until(() => f.$("answer").disabled);
  assert.equal(f.answers.get("q1").body, "응답 대기 중 추가 입력");
});
test("같은 문항 재선택 응답도 대기 중 저장한 최신 답안을 유지한다", async (t) => {
  const f = await fixture(t);
  let release;
  f.state.gate = new Promise((r) => (release = r));
  f.$("question-list").querySelector("button").click();
  await until(() => f.state.requested);
  f.edit();
  release();
  await until(() => f.answers.get("q1").body === "응답 대기 중 추가 입력");
  await tick();
  assert.equal(f.$("answer").value, "응답 대기 중 추가 입력");
  assert.equal(f.$("save-state").textContent, "답안: 저장됨");
});
