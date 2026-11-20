import test from "node:test";
import assert from "node:assert/strict";
import { fixture, until, untilSlow } from "./helpers/study-fixture.mjs";
test("늦은 서버 답안 응답은 다른 문항의 입력과 임시 보관을 유지한다", async (t) => {
  const f = await fixture(t);
  let release;
  f.state.fail = true;
  f.edit();
  await untilSlow(() => !f.$("save-error").hidden);
  f.state.gate = new Promise((resolve) => { release = resolve; });
  f.state.gateId = "q1";
  const serverLoad = f.$("load-server").onclick();
  await until(() => f.state.requested);
  f.state.fail = false;
  await f.$("next-question").onclick();
  assert.match(f.$("question-meta").textContent, /2번/);
  f.$("answer").value = "new Q2 unsaved draft";
  f.$("answer").dispatchEvent(new f.w.Event("input"));
  release();
  await serverLoad;
  assert.match(f.$("question-meta").textContent, /2번/);
  assert.match(f.w.location.search, /q=q2/);
  assert.equal(JSON.parse(f.w.localStorage.getItem("peim:draft:q2")).body, "new Q2 unsaved draft");
  assert.equal(f.w.localStorage.getItem("peim:draft:q2:before-reload"), null);
  assert.equal(f.$("answer").value, "new Q2 unsaved draft");
  assert.equal(f.answers.get("q2").body, "q2 기존 답안");
});

