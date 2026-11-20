import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { setupRetryList } from "../app/frontend/retry-list.js";
const html = await readFile("app/static/index.html", "utf8");
test("removing a retry condition preserves other filters and returns keyboard focus", async () => {
  const f = fixture();
  await f.library.load();
  f.$("retry-search").value = "보안";
  f.$("retry-search").oninput();
  f.$("retry-status").value = "draft";
  f.$("retry-status").onchange();
  f.$("retry-chips").querySelector("button").click();
  assert.equal(f.$("retry-search").value, "");
  assert.equal(f.$("retry-status").value, "draft");
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 1);
  assert.equal(document.activeElement, f.$("retry-chips").querySelector("button"));
  f.$("retry-chips").querySelector("button").click();
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 2);
  assert.equal(document.activeElement, f.$("retry-search"));
});
function fixture() {
  const window = new Window();
  globalThis.document = window.document;
  document.body.innerHTML = html;
  const $ = (id) => document.getElementById(id);
  const state = {
    rows: [
      {
        id: "a",
        round: 63,
        session: 1,
        number: 1,
        text: "정규화 문제",
        topics: "데이터베이스",
        note: "<script>보완 메모</script>",
        answer_status: "completed",
      },
      {
        id: "b",
        round: 129,
        session: 4,
        number: 2,
        text: "보안 문제",
        topics: "보안",
        note: "접근통제 보완",
        answer_status: "draft",
      },
    ],
    fail: false,
    failOpen: false,
    openResult: true,
  };
  const calls = [],
    opened = [];
  const library = setupRetryList({
    api: async (path) => {
      calls.push(path);
      if (state.fail) throw Error("연결 실패");
      return state.rows;
    },
    openQuestion: async (id) => {
      opened.push(id);
      if (state.failOpen) throw Error("문항 실패");
      return state.openResult;
    },
  });
  return { $, state, calls, opened, library };
}
test("global retry list renders literal notes and filters across question, topic, round and memo", async () => {
  const f = fixture();
  await f.library.load();
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 2);
  assert.equal(f.$("retry-items").querySelector("script"), null);
  assert.match(f.$("retry-items").textContent, /<script>보완 메모/);
  for (const query of ["129", "보안", "접근통제"]) {
    f.$("retry-search").value = query;
    f.$("retry-search").oninput();
    assert.equal(f.$("retry-items").querySelectorAll("article").length, 1);
  }
  await f.$("retry-items").querySelector("button").onclick();
  assert.deepEqual(f.opened, ["b"]);
  assert.deepEqual(f.calls, ["/retry-questions"]);
  assert.equal(f.state.rows.length, 2);
});
test("failed reload keeps the previous list and failed or blocked opening does not dismiss it", async () => {
  const f = fixture();
  await f.library.load();
  f.state.fail = true;
  await f.library.load();
  assert.match(f.$("retry-result").textContent, /이전 목록/);
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 2);
  f.state.failOpen = true;
  await f.$("retry-items").querySelector("button").onclick();
  assert.match(f.$("retry-result").textContent, /열지 못/);
  f.state.failOpen = false;
  f.state.openResult = false;
  await f.$("retry-items").querySelector("button").onclick();
  assert.match(f.$("retry-result").textContent, /저장 상태/);
  f.state.fail = false;
  f.state.rows = [];
  await f.library.load();
  assert.match(f.$("retry-items").textContent, /표시한 문항이 없습니다/);
});

test("retry filters combine without changing saved rows and reset restores the default order", async () => {
  const f = fixture(); await f.library.load();
  f.$("retry-sort").value = "round"; f.$("retry-sort").onchange();
  assert.match(f.$("retry-items").firstChild.textContent, /129회/);
  f.$("retry-topic").value = "보안"; f.$("retry-topic").oninput();
  f.$("retry-status").value = "completed"; f.$("retry-status").onchange();
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 0);
  f.$("retry-reset").onclick();
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 2);
  assert.match(f.$("retry-items").firstChild.textContent, /63회/);
  assert.equal(f.state.rows[0].note, "<script>보완 메모</script>");
  assert.equal(f.$("retry-items").querySelector("details").open, false);
  f.$("retry-round").value = "129"; f.$("retry-round").onchange();
  assert.equal(f.$("retry-items").querySelectorAll("article").length, 1);
});
