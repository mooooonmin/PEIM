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

test("mobile comparison restores independent reading positions and shares the review form", async () => {
  const window = new Window();
  globalThis.document = window.document;
  document.body.innerHTML = await readFile("app/static/index.html", "utf8");
  let pending;
  window.requestAnimationFrame = (fn) => { pending = fn; return 1; };
  const writing = document.querySelector('.writing');
  const answer = document.getElementById('answer');
  const reference = document.getElementById('learning-reference');
  const note = document.getElementById('learning-note');
  answer.getClientRects = () => writing.dataset.compareSide === 'mine' ? [{}] : [];
  reference.getClientRects = () => writing.dataset.compareSide === 'reference' ? [{}] : [];
  const layout = setupStudyLayout();
  layout.question('q1'); pending(); layout.mode('compare'); pending();
  reference.scrollTop = 350;
  document.getElementById('compare-mine').click();
  reference.scrollTop = 0; pending();
  assert.equal(reference.scrollTop, 350);
  answer.scrollTop = 220;
  document.getElementById('compare-reference').click();
  answer.scrollTop = 0; pending();
  assert.equal(answer.scrollTop, 220);
  assert.equal(reference.scrollTop, 350);
  document.getElementById('toggle-compare-note').click(); pending();
  assert.equal(writing.dataset.compareNotes, 'true');
  note.value = '비교하며 보완한 내용';
  layout.mode('review'); pending();
  assert.equal(document.getElementById('learning-note'), note);
  assert.equal(note.value, '비교하며 보완한 내용');
  assert.equal(document.querySelectorAll('#learning-form').length, 1);
  layout.question('q2'); pending();
  assert.equal(reference.scrollTop, 0);
  assert.equal(answer.scrollTop, 0);
  assert.equal(writing.dataset.compareSide, 'reference');
  assert.equal(writing.dataset.compareNotes, 'false');
});
