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
export async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await tick();
  }
  assert.fail("Expected UI state was not reached");
}
export async function fixture(t, initial = {}) {
  const w = new Window({
    url: initial.url || "http://localhost:8000/?mode=exam&exam=exam-140&q=q1",
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
  const state = { gate: null, fail: false, requested: false, ...initial };
  let confirmCount = 0;
  w.Option = function(text, value) { const option = w.document.createElement("option"); option.textContent = text; option.value = value; return option; };
  w.confirm = () => { confirmCount++; return true; };
  for (const [key,value] of Object.entries(initial.storage || {}))
    w.localStorage.setItem(key, JSON.stringify(value));
  const ok = (data) => ({ok:true, json:async () => data});
  w.fetch = async (url, opts = {}) => {
    const path = String(url).replace("/api", "");
    let data;
    if (path === "/exams") return ok([140,141].map(round => ({attachment_id:"a" + round, round, format:"pdf", status:"draft"})));
    if (path.endsWith("/extraction")) {
      if (path.includes("a141") && state.extractionGate) await state.extractionGate;
      return ok({ candidates: [{text: path.includes("a141") ? "Round 141 source" : "Round 140 source", session:1, number:1}], pages:[], message:"추출 완료" });
    }
    if (path === "/exams/141/questions") { state.registration = JSON.parse(opts.body); return ok({id:"new-q141"}); }
    if (path === "/retry-questions") return ok([{id:"q2", round:140, session:1, number:2, text:"q2", note:"리뷰", answer_status:"draft"}]);
    if (path.endsWith("/history")) { if (state.historyGate) await state.historyGate; return ok([{body:"q1 history", status:"draft", saved_at:"2026-11-20"}]); }
    if (path.startsWith("/topics/")) return ok({answers:[{variant:"short", body:path}]});
    if (path.endsWith("/review")) { state.reviewed = true; return ok({revision:1}); }
    if (path.endsWith("/reviews")) return ok([]);
    if (path === "/navigation")
      data = {
        domains: [],
        topics: [{id:"before", title:"Before", domain:"D"}, {id:"after", title:"After", domain:"D"}],
        exams: [
          { id: "exam-140", round: 140, count: 2 },
          { id: "exam-141", round: 141, count: 0 },
        ],
      };
    else if (path === "/questions" || path.startsWith("/questions?")) {
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
    } else if (path.endsWith("/writing-guide")) {
      state.guideCalls = (state.guideCalls || 0) + 1;
      data = {
        notice: "안내",
        example: state.reviewed ? null : "Superseded example",
        requirements: [],
        outline: [],
        keywords: [],
        checklist: [],
      };
    } else if (path.endsWith("/learning")) {
      if (state.failLearning) return {ok:false,status:503,json:async () => ({detail:"읽기 실패"})};
      data = { note: "", retry_requested: false, revision: 0 };
    }
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
        text: state.reviewed ? "수정된 문제" : id,
        topics: state.reviewed ? [{id:"after",title:"After"}] : [{id:"before",title:"Before"}],
        sources: [],
        data: {},
        answer: structuredClone(answers.get(id)),
      };
      if (state.gate && (!state.gateId || state.gateId === id)) {
        state.requested = true;
        await state.gate;
      }
    } else throw new Error("Unexpected request " + path);
    return { ok: true, json: async () => data };
  };
  w.eval(bundle.outputFiles[0].text);
  await until(() => initial.readyView ? !$(initial.readyView).hidden : $("answer").value === "q1 기존 답안");
  function edit() {
    $("answer").value = "응답 대기 중 추가 입력";
    $("answer").dispatchEvent(new w.Event("input"));
  }
  return { w, $, state, answers, edit, confirmCount: () => confirmCount };
}


export async function untilSlow(check) { for(let i=0;i<100;i++){if(check())return; await new Promise(r=>setTimeout(r,20));} assert.fail("Expected state not reached"); }
