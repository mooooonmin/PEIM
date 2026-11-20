import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import {
  setupStudyLayout,
  setupStudyNavigation,
} from "../app/frontend/study-layout.js";
const html = await readFile("app/static/index.html", "utf8");
test('next question preserves the chosen answer side while showing the new question', () => {
  const { $, layout, frame } = fixture();
  layout.question('q1'); frame();
  $('compare-mine').click(); frame();
  $('toggle-question').click();
  layout.question('q2'); frame();
  assert.equal(document.querySelector('.writing').dataset.compareSide, 'mine');
  assert.equal($('toggle-question').getAttribute('aria-expanded'), 'true');
});
function fixture() {
  const window = new Window();
  globalThis.document = window.document;
  document.body.innerHTML = html;
  let pending;
  window.requestAnimationFrame = (fn) => {
    pending = fn;
    return 1;
  };
  const $ = (id) => document.getElementById(id),
    layout = setupStudyLayout();
  return { $, layout, frame: () => pending() };
}
test("two fixed panes and collapsible navigation/memo preserve live editor and notes", () => {
  const { $, layout, frame } = fixture();
  layout.question("q1");
  frame();
  const answer = $("answer");
  answer.value = "기존 답안";
  answer.setSelectionRange(1, 3);
  $("learning-note").value = "미저장 메모";
  assert.equal(Boolean(answer.closest(".answer-pane")), true);
  assert.equal(Boolean($("question-text").closest(".study-reading")), true);
  assert.equal(Boolean($("learning-panel").closest(".study-reading")), true);
  assert.equal(Boolean($("learning-form").closest(".study-columns")), false);
  $("toggle-question-list").click();
  assert.equal($("question-drawer").hidden, false);
  $("toggle-question-list").click();
  assert.equal($("question-drawer").hidden, true);
  $("toggle-compare-note").click();
  frame();
  assert.equal($("learning-form").hidden, false);
  $("toggle-compare-note").click();
  frame();
  assert.equal($("learning-form").hidden, true);
  assert.equal(answer.value, "기존 답안");
  assert.equal(answer.selectionStart, 1);
  assert.equal($("learning-note").value, "미저장 메모");
  assert.equal(document.querySelectorAll("#answer").length, 1);
  assert.equal(document.querySelectorAll("#learning-form").length, 1);
});
test("mobile switches preserve scroll and question change resets positions and disclosures", () => {
  const { $, layout, frame } = fixture(),
    writing = document.querySelector(".writing");
  const answer = $("answer"),
    guide = $("writing-guide");
  answer.getClientRects = () =>
    writing.dataset.compareSide === "mine" ? [{}] : [];
  guide.getClientRects = () =>
    writing.dataset.compareSide === "reference" ? [{}] : [];
  layout.question("q1");
  frame();
  guide.scrollTop = 300;
  $("compare-mine").click();
  guide.scrollTop = 0;
  frame();
  assert.equal(guide.scrollTop, 300);
  answer.scrollTop = 150;
  $("compare-reference").click();
  answer.scrollTop = 0;
  frame();
  assert.equal(answer.scrollTop, 150);
  $("toggle-question").click();
  $("toggle-compare-note").click();
  layout.question("q2");
  frame();
  assert.equal(guide.scrollTop, 0);
  assert.equal(answer.scrollTop, 0);
  assert.equal($("learning-form").hidden, true);
  assert.equal($("toggle-question").getAttribute("aria-expanded"), "true");
});
test("previous/next use filtered order, respect boundaries and block rapid duplicate moves", async () => {
  const { $ } = fixture();
  const calls = [];
  let release;
  const nav = setupStudyNavigation({
    select: async (id) => {
      calls.push(id);
      await new Promise((r) => (release = r));
      nav.update(undefined, id);
    },
  });
  nav.update([{ id: "a" }, { id: "c" }], "a");
  assert.equal($("previous-question").disabled, true);
  const moving = $("next-question").onclick();
  await $("next-question").onclick();
  assert.deepEqual(calls, ["c"]);
  release();
  await moving;
  assert.equal($("next-question").disabled, true);
  assert.equal($("study-position").textContent, "2 / 2");
  nav.update([], "c");
  assert.equal($("previous-question").disabled, true);
  assert.equal($("next-question").disabled, true);
});
test("cancelled or failed navigation keeps the current position and enables retry", async () => {
  const { $ } = fixture();
  const nav = setupStudyNavigation({ select: async () => false });
  nav.update([{ id: "a" }, { id: "b" }], "a");
  await $("next-question").onclick();
  assert.equal($("study-position").textContent, "1 / 2");
  assert.equal($("next-question").disabled, false);
  const failing = setupStudyNavigation({
    select: async () => {
      throw Error("offline");
    },
  });
  failing.update([{ id: "a" }, { id: "b" }], "a");
  await assert.rejects($("next-question").onclick(), /offline/);
  assert.equal($("next-question").disabled, false);
});
