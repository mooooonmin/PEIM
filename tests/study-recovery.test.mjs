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

test("메모 초기 조회 실패의 재시도는 임시 메모를 복구한다", async (t) => {
  const f = await fixture(t, {failLearning:true, storage:{"peim:learning:q1":{note:"preserve me", retry_requested:true, revision:0}}});
  await until(() => f.$("learning-result").textContent.includes("불러오지 못했습니다"));
  assert.equal(f.$("learning-note").value, "");
  f.state.failLearning = false;
  await f.$("reload-learning").onclick();
  assert.equal(JSON.parse(f.w.localStorage.getItem("peim:learning:q1")).note, "preserve me");
  assert.equal(f.$("learning-note").value, "preserve me");
  assert.equal(f.confirmCount(), 0);
});

test("다시 풀기에서 충돌 문항의 학습 복구 화면을 표시한다", async (t) => {
  const f = await fixture(t, {storage:{"peim:draft:q2":{body:"local Q2", status:"draft", revision:0}}});
  await f.$("retry-tab").onclick();
  assert.equal(f.$("retry-library").hidden, false);
  await f.$("retry-items").querySelector("button").onclick();
  assert.equal(f.$("study").hidden, false);
  assert.equal(f.$("save-error").hidden, false);
  assert.equal(f.$("answer").value, "local Q2");
  assert.match(f.$("save-state").textContent, /충돌/);
  await f.$("study-tab").onclick();
  await f.$("manage-tab").onclick();
  assert.equal(f.$("study").hidden, false);
  assert.equal(f.$("manage").hidden, true);
});

test("현재 문항 검수 후 예시와 연결 주제를 새로 불러온다", async (t) => {
  const f = await fixture(t);
  await until(() => f.$("writing-example").textContent.includes("Superseded example"));
  await f.$("manage-tab").onclick();
  assert.ok(f.$("managed-list").querySelector("button"), f.$("managed-count").textContent + " - " + f.$("managed-list").textContent);
  await f.$("managed-list").querySelector("button").onclick();
  f.$("edit-question-text").value = "수정된 문제";
  await f.$("edit-question-form").onsubmit({ preventDefault() {} });
  f.$("close-question-review").onclick();
  await f.$("study-tab").onclick();
  assert.equal(f.$("question-text").textContent, "수정된 문제");
  assert.equal(f.$("question-title").textContent, "After");
  assert.equal(f.$("learning-topic").value, "after");
  assert.doesNotMatch(f.$("writing-example").textContent, /Superseded example/);
  assert.equal(f.state.guideCalls, 2);
});

