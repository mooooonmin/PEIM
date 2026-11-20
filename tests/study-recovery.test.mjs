import test from "node:test";
import assert from "node:assert/strict";
import { fixture, until, untilSlow } from "./helpers/study-fixture.mjs";
for (const fails of [false, true]) test(`이력 조회 중 입력은 복원 전에 저장하며 저장 실패=${fails}이면 복원하지 않는다`, async t => {
  const f = await fixture(t), writes = [];
  let release, requested = false;
  const gate = new Promise(r => release = r), fetch = f.w.fetch;
  f.w.fetch = async (url, options) => {
    if (String(url).endsWith('/history')) { requested = true; await gate; }
    if (String(url).endsWith('/answer')) writes.push(JSON.parse(options.body).body);
    return fetch(url, options);
  };
  const opening = f.$("history").onclick();
  await until(() => requested);
  f.edit(); f.state.fail = fails;
  release(); await opening;
  f.$("reading-body").querySelector("button").click();
  await until(() => fails ? !f.$("save-error").hidden : f.answers.get("q1").body === "q1 history");
  if (fails) {
    assert.equal(f.$("answer").value, "응답 대기 중 추가 입력");
    assert.equal(f.$("reading-dialog").open, true);
    assert.deepEqual(writes, ["응답 대기 중 추가 입력"]);
  } else {
    assert.deepEqual(writes, ["응답 대기 중 추가 입력", "q1 history"]);
    assert.equal(f.answers.get("q1").body, "q1 history");
  }
});
test("다른 탭의 미저장 답안은 먼저 끝난 저장 이후에도 복구할 수 있다", async t => {
  const f = await fixture(t);
  let release, pending = false;
  const fetch = f.w.fetch, gate = new Promise(r => release = r);
  f.w.fetch = async (url, options) => {
    if (String(url).endsWith('/answer')) { pending = true; await gate; }
    return fetch(url, options);
  };
  f.edit();
  const saving = f.$("retry").onclick();
  await until(() => pending);
  // An older still-open app tab can write the legacy key during this request.
  const other = {body:"다른 탭의 미저장 답안", status:"draft", revision:1};
  f.w.localStorage.setItem("peim:draft:q1", JSON.stringify(other));
  release(); await saving;
  await until(() => f.$("save-state").textContent === "답안: 저장됨");
  assert.equal(JSON.parse(f.w.localStorage.getItem("peim:draft:q1")).body, other.body);
});
test("시험지 검색과 모바일 영역 전환은 선택한 원본과 입력을 유지한다", async t => {
  const f = await fixture(t);
  await f.$("manage-tab").onclick(); await f.$("manage-upload").onclick();
  f.$("exam-search").value = "141"; f.$("exam-search").oninput();
  assert.equal(f.$("exam-list").querySelectorAll("button").length, 1);
  f.$("exam-list").querySelector("button").click();
  await until(() => !f.$("review-fields").disabled);
  assert.match(f.$("selected-exam-label").textContent, /141회/);
  assert.equal(f.$("exam-picker").open, false);
  f.$("new-question").value = "보존할 등록 초안";
  f.w.document.querySelector('[data-upload-pane="edit"]').onclick();
  f.w.document.querySelector('[data-upload-pane="source"]').onclick();
  assert.equal(f.$("new-question").value, "보존할 등록 초안");
});
test("화면 이동을 위한 저장 대기 중 클릭한 이력이 관리 화면에 열리지 않는다", async t => {
  const f = await fixture(t); const fetch = f.w.fetch;
  let release, pending = false;
  const gate = new Promise(r => release = r);
  f.w.fetch = async (url, options) => {
    if (String(url).endsWith('/answer')) { pending = true; await gate; }
    return fetch(url, options);
  };
  f.edit();
  const manage = f.$("manage-tab").onclick();
  await until(() => pending);
  const history = f.$("history").onclick();
  release(); await Promise.all([manage, history]);
  assert.equal(f.$("manage").hidden, false);
  assert.equal(f.$("reading-dialog").open, false);
});
test("PDF 조회 실패 후 이전 후보 없이 추출 재시도 경로를 제공한다", async t => {
  const f = await fixture(t);
  await f.$("manage-tab").onclick(); await f.$("manage-upload").onclick();
  const fetch = f.w.fetch;
  f.w.fetch = (url, options) => String(url).endsWith('/extraction')
    ? Promise.resolve(new f.w.Response(JSON.stringify({detail:'조회 실패'}), {status:503}))
    : fetch(url, options);
  f.$("exam-list").querySelector("button").click();
  await until(() => f.$("extraction-state").textContent.includes('다시 시도'));
  assert.equal(f.$("extract").disabled, false);
  assert.equal(f.$("review-fields").disabled, true);
  assert.equal(f.$("candidates").options.length, 0);
  f.w.fetch = fetch;
  f.$("exam-list").querySelector("button").click();
  await until(() => !f.$("review-fields").disabled);
});
test("다시 풀기 연결 목록 조회 실패에도 충돌 복구 화면을 표시한다", async t => {
  const f = await fixture(t, {storage:{"peim:draft:q2":{body:"local Q2",status:"draft",revision:0}}});
  await f.$("retry-tab").onclick();
  const fetch = f.w.fetch;
  f.w.fetch = (url, options) => String(url).includes('/questions?')
    ? Promise.resolve(new f.w.Response(JSON.stringify({detail:'목록 실패'}), {status:503}))
    : fetch(url, options);
  await f.$("retry-items").querySelector("button").onclick();
  assert.equal(f.$("study").hidden, false);
  assert.equal(f.$("save-error").hidden, false);
  assert.equal(f.$("answer").value, 'local Q2');
});

test("다시 풀기 문항 조회 중 관리 화면으로 이동하면 숨겨진 충돌을 적용하지 않는다", async t => {
  const f = await fixture(t, {storage:{"peim:draft:q2":{body:"local Q2",status:"draft",revision:0}}});
  await f.$("retry-tab").onclick();
  let release;
  f.state.gateId = 'q2'; f.state.gate = new Promise(r => release = r);
  const opening = f.$("retry-items").querySelector("button").onclick();
  await until(() => f.state.requested);
  await f.$("manage-tab").onclick();
  release(); await opening;
  await f.$("study-tab").onclick();
  assert.equal(f.$("study").hidden, false);
  assert.equal(f.$("save-error").hidden, true);
  assert.equal(f.$("answer").value, 'q1 기존 답안');
});

test("학습 화면을 나갔다 돌아와도 이전 이력 응답을 표시하지 않는다", async t => {
  const f = await fixture(t); let release;
  f.state.historyGate = new Promise(r => release = r);
  const history = f.$("history").onclick();
  await f.$("manage-tab").onclick();
  await f.$("study-tab").onclick();
  release(); await history;
  assert.equal(f.$("reading-dialog").open, false);
});
test("서버 재불러오기 실패 후 예약된 자동 저장을 유지한다", async t => {
  const f = await fixture(t);
  f.state.fail = true; f.edit();
  await untilSlow(() => !f.$("save-error").hidden);
  f.state.fail = false;
  const fetch = f.w.fetch;
  f.w.fetch = (url, options) => String(url).endsWith('/questions/q1')
    ? Promise.resolve(new f.w.Response(JSON.stringify({detail:'조회 실패'}), {status:503}))
    : fetch(url, options);
  f.$("answer").value = '예약된 최신 답안';
  f.$("answer").dispatchEvent(new f.w.Event('input'));
  await f.$("load-server").onclick();
  await untilSlow(() => f.answers.get('q1').body === '예약된 최신 답안');
});
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

test("이전 문항의 늦은 이력 응답은 새 문항 위에 열리지 않는다", async (t) => {
  const f = await fixture(t);
  let release;
  f.state.historyGate = new Promise((resolve) => { release = resolve; });
  const history = f.$("history").onclick();
  await f.$("next-question").onclick();
  assert.match(f.$("question-meta").textContent, /2번/);
  release();
  await history;
  assert.equal(f.$("reading-dialog").open, false);
  assert.equal(f.$("answer").value, "q2 기존 답안");
});
test("PDF 전환 중 이전 후보를 제거하고 새 시험지 후보만 등록한다", async (t) => {
  const f = await fixture(t);
  await f.$("manage-tab").onclick();
  await f.$("manage-upload").onclick();
  await f.$("exam-list").querySelector("button").click();
  await until(() => f.$("candidates").textContent.includes("Round 140 source"));
  let release;
  f.state.extractionGate = new Promise((r) => { release = r; });
  f.$("exam-list").querySelectorAll("button")[1].click();
  assert.match(f.$("review-title").textContent, /141회/);
  assert.doesNotMatch(f.$("candidates").textContent, /Round 140 source/);
  assert.equal(f.$("candidates").disabled, true);
  assert.equal(f.$("review-fields").disabled, true);
  f.$("candidates").value = "0";
  f.$("candidates").onchange();
  release();
  await until(() => f.$("candidates").textContent.includes("Round 141 source"));
  assert.equal(f.$("new-question").value, "");
  f.$("candidates").value = "0";
  f.$("candidates").onchange();
  f.$("reviewed").checked = true;
  f.$("topic-search").value = f.$("topic-options").options[0].value;
  await f.$("question-form").onsubmit({ target: f.$("question-form"), preventDefault() {} });
  assert.equal(f.state.registration.attachment_id, "a141");
  assert.equal(f.state.registration.text, "Round 141 source");
});

test("답안 저장 재시도 대기 중 새 입력은 서버 재불러오기가 덮지 않는다", async t => {
  const f = await fixture(t);
  f.state.fail = true; f.edit();
  await untilSlow(() => !f.$("save-error").hidden);
  f.state.fail = false;
  const fetch = f.w.fetch; let release, pending = false;
  const gate = new Promise(r => release = r);
  f.w.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/answer') && !pending) { pending = true; await gate; }
    return fetch(url, options);
  };
  f.$("retry").onclick();
  await until(() => pending);
  const reload = f.$("load-server").onclick();
  f.$("answer").value = '저장 대기 중 최신 입력';
  f.$("answer").dispatchEvent(new f.w.Event('input'));
  release(); await reload;
  await until(() => f.answers.get('q1').body === '저장 대기 중 최신 입력');
  assert.equal(f.$("answer").value, '저장 대기 중 최신 입력');
});
