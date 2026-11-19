import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { setupStudyLayout } from "../app/frontend/study-layout.js";

test("study modes preserve the live editor, notes and selection; a new question resets the workspace", async () => {
  const window = new Window();
  globalThis.document = window.document;
  document.body.innerHTML = await readFile("app/static/index.html", "utf8");
  const layout = setupStudyLayout();
  layout.question("q1");
  const answer = document.getElementById("answer");
  answer.value = "기존 답안과 작성 중 내용";
  answer.setSelectionRange(3, 7);
  document.getElementById("learning-note").value = "보완 메모";
  for (const mode of ["compare", "review", "write"]) {
    document.querySelector(`[data-study-mode="${mode}"]`).click();
    assert.equal(document.querySelector(".writing").dataset.mode, mode);
    assert.equal(
      document.querySelectorAll('[data-study-mode][aria-pressed="true"]')
        .length,
      1,
    );
    assert.equal(document.getElementById("answer"), answer);
    assert.equal(answer.value, "기존 답안과 작성 중 내용");
    assert.equal(answer.selectionStart, 3);
    assert.equal(answer.selectionEnd, 7);
    assert.equal(document.getElementById("learning-note").value, "보완 메모");
  }
  document.getElementById("toggle-question").click();
  layout.mode("review");
  layout.question("q1");
  assert.equal(document.querySelector(".writing").dataset.mode, "review");
  layout.question("q2");
  assert.equal(document.querySelector(".writing").dataset.mode, "write");
  assert.equal(
    document.getElementById("toggle-question").getAttribute("aria-expanded"),
    "true",
  );
});
