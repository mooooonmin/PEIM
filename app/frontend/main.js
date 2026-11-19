import { setupStudyLayout } from "./study-layout.js";
import { setupManagement } from "./manage.js";
import { setupQuestionReview } from "./review.js";
import { setupLearning } from "./learning.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import mermaid from "mermaid";

const $ = (id) => document.getElementById(id);
let nav,
  mode = "topic",
  selectedTopic = "",
  selectedExam = "",
  resultQuery = "",
  current = null,
  rows = [];
let timer,
  saving = null,
  dirty = false,
  loadSequence = 0,
  chosenExam = null,
  extraction = null;
let currentView =
  new URLSearchParams(location.search).get("view") === "manage"
    ? "manage"
    : "study";
let conflict = false,
  renderSequence = 0,
  reviewSequence = 0;
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
});

async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "X-PEIM-Request": "1",
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      typeof error.detail === "string"
        ? error.detail
        : "요청을 처리하지 못했습니다. 입력과 서버 연결을 확인해 주세요.";
    const failure = new Error(message);
    failure.status = response.status;
    throw failure;
  }
  return response.json();
}
function text(id, value) {
  $(id).textContent = id === "save-state" ? `답안: ${value}` : value;
}
function element(tag, value, className) {
  const e = document.createElement(tag);
  if (value !== undefined) e.textContent = value;
  if (className) e.className = className;
  return e;
}
function button(value, action, className) {
  const e = element("button", value, className);
  e.type = "button";
  e.addEventListener("click", action);
  return e;
}
function report(error) {
  $("global-error").hidden = false;
  text(
    "global-error",
    error.message || "서버에 연결하지 못했습니다. 새로고침해 주세요.",
  );
}
function safe(action) {
  return (...args) => Promise.resolve(action(...args)).catch(report);
}
function draftKey(qid) {
  return "peim:draft:" + qid;
}
function snapshot() {
  return {
    body: $("answer").value,
    status: $("completed").checked ? "completed" : "draft",
    revision: current.answer.revision,
  };
}
function cacheDraft() {
  if (!current) return;
  try {
    localStorage.setItem(draftKey(current.id), JSON.stringify(snapshot()));
  } catch {
    text("save-state", "브라우저 임시 보관 불가");
  }
}
function edited() {
  if (!current) return;
  dirty = true;
  cacheDraft();
  text("character-count", `${$("answer").value.length.toLocaleString()}자`);
  text("save-state", conflict ? "충돌 확인 필요" : "저장 대기");
  clearTimeout(timer);
  if (!conflict) timer = setTimeout(() => void save(), 650);
}
async function save() {
  clearTimeout(timer);
  if (saving) {
    await saving;
    if (dirty && !conflict) return save();
    return !dirty;
  }
  if (!current || !dirty) return true;
  if (conflict) return false;
  const q = current,
    value = snapshot();
  text("save-state", "저장 중…");
  saving = (async () => {
    try {
      const result = await api(
        `/questions/${encodeURIComponent(q.id)}/answer`,
        { method: "PUT", body: JSON.stringify(value) },
      );
      q.answer = result;
      dirty =
        $("answer").value !== value.body ||
        ($("completed").checked ? "completed" : "draft") !== value.status;
      if (dirty) cacheDraft();
      else {
        try {
          localStorage.removeItem(draftKey(q.id));
        } catch {}
      }
      text("save-state", dirty ? "저장 대기" : "저장됨");
      $("save-error").hidden = true;
      const row = rows.find((r) => r.id === q.id);
      if (row) row.answer_status = result.status;
      renderQuestionList();
      return true;
    } catch (error) {
      conflict = error.status === 409;
      cacheDraft();
      text("save-state", "저장하지 못함");
      $("save-error").hidden = false;
      text(
        "save-error-text",
        error.message ||
          "서버에 연결하지 못했습니다. 작성 내용은 이 창에 유지됩니다.",
      );
      return false;
    } finally {
      saving = null;
    }
  })();
  const ok = await saving;
  if (ok && dirty) return save();
  return ok;
}
window.addEventListener("beforeunload", (e) => {
  if (dirty || saving) {
    cacheDraft();
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && dirty) {
    cacheDraft();
    void save();
  }
});
$("answer").addEventListener("input", edited);
$("completed").addEventListener("change", edited);
$("retry").onclick = () => {
  if (conflict)
    text(
      "save-error-text",
      "서버와 충돌한 답안입니다. 내 글을 내려받은 뒤 서버 답안을 불러와 비교해 주세요.",
    );
  else void save();
};
$("download-draft").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([$("answer").value], { type: "text/plain;charset=utf-8" }),
  );
  const a = element("a");
  a.href = url;
  a.download = `${current.id}-내답안.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("load-server").onclick = safe(async () => {
  if (
    !confirm(
      "이 창의 글을 서버 답안으로 바꿉니다. 필요한 글은 먼저 내려받아 주세요.",
    )
  )
    return;
  const updated = await api(`/questions/${encodeURIComponent(current.id)}`);
  try {
    localStorage.setItem(
      draftKey(current.id) + ":before-reload",
      JSON.stringify(snapshot()),
    );
    localStorage.removeItem(draftKey(current.id));
  } catch {}
  dirty = false;
  conflict = false;
  current = updated;
  displayQuestion();
});

function renderNavigation() {
  $("navigation").replaceChildren();
  const query = $("search").value.trim().toLowerCase();
  if (mode === "exam") {
    for (const exam of nav.exams.filter(
      (e) => !query || String(e.round).includes(query),
    )) {
      const b = button(
        `${exam.round}회`,
        safe(() => chooseFilter("", exam.id)),
        "topic-button" + (exam.id === selectedExam ? " active" : ""),
      );
      b.append(element("span", `${exam.count}문항`, "count"));
      $("navigation").append(b);
    }
  } else {
    for (const domain of nav.domains) {
      const topics = nav.topics.filter(
        (t) =>
          t.domain === domain.code &&
          (!query || t.title.toLowerCase().includes(query)),
      );
      if (!topics.length) continue;
      const details = element("details");
      details.open =
        Boolean(query) || topics.some((t) => t.id === selectedTopic);
      details.append(element("summary", domain.name));
      for (const topic of topics) {
        const b = button(
          topic.title,
          safe(() => chooseFilter(topic.id, "")),
          "topic-button" + (topic.id === selectedTopic ? " active" : ""),
        );
        b.append(element("span", String(topic.count), "count"));
        details.append(b);
      }
      $("navigation").append(details);
    }
  }
  if (!$("navigation").childElementCount)
    $("navigation").append(element("p", "일치하는 항목이 없습니다.", "empty"));
  $("navigation")
    .querySelector(".active")
    ?.scrollIntoView({ block: "nearest" });
}
function updateURL() {
  const params = new URLSearchParams(location.search);
  params.delete("view");
  params.delete("topic");
  params.delete("exam");
  params.delete("q");
  params.delete("search");
  if (resultQuery) params.set("search", resultQuery);
  params.set("mode", mode);
  if (currentView === "manage") {
    params.set("view", "manage");
    params.set(
      "section",
      new URLSearchParams(location.search).get("section") === "upload"
        ? "upload"
        : "questions",
    );
  }
  if (selectedTopic) params.set("topic", selectedTopic);
  if (selectedExam) params.set("exam", selectedExam);
  if (current) params.set("q", current.id);
  history.replaceState(null, "", "?" + params);
}
async function chooseFilter(topic, exam) {
  clearTimeout(searchTimer);
  if (!openLearning.canLeave() || !(await save())) return;
  const sequence = ++loadSequence;
  const nextRows = await api(
    "/questions?" + new URLSearchParams(topic ? { topic } : { exam }),
  );
  if (sequence !== loadSequence || !openLearning.canLeave()) return;
  selectedTopic = topic;
  selectedExam = exam;
  resultQuery = "";
  $("search").value = "";
  rows = nextRows;
  renderNavigation();
  renderQuestionList();
  if (rows.length) await selectQuestion(rows[0].id);
  else {
    current = null;
    displayQuestion();
    updateURL();
  }
}
function renderQuestionList() {
  $("question-list").replaceChildren();
  text(
    "related-title",
    resultQuery ? "검색 결과" : selectedTopic ? "연결 기출" : "기출문항",
  );
  $("related").setAttribute(
    "aria-label",
    resultQuery ? "검색 결과" : "기출문항",
  );
  text(
    "search-context",
    resultQuery ? `“${resultQuery}” 전체 문항 검색 / ${rows.length}개` : "",
  );
  $("search-context").hidden = !resultQuery;
  $("clear-search").hidden = !$("search").value;
  const visibleRows = $("retry-only").checked
    ? rows.filter((q) => q.retry_requested)
    : rows;
  if (!visibleRows.length) {
    $("question-list").append(
      element(
        "p",
        $("retry-only").checked
          ? "이 목록에 다시 풀기로 표시한 문항이 없습니다."
          : resultQuery
            ? "검색 결과가 없습니다. 검색어를 바꾸거나 검색을 해제해 주세요."
            : "등록된 문항이 없습니다.",
        "empty",
      ),
    );
    return;
  }
  const table = element("table"),
    head = element("thead"),
    hr = element("tr");
  for (const value of ["회차", "교시", "문항", "작성"])
    hr.append(element("th", value));
  head.append(hr);
  table.append(head);
  const body = element("tbody");
  for (const q of visibleRows) {
    const tr = element("tr");
    if (current?.id === q.id) {
      tr.className = "active";
      tr.setAttribute("aria-current", "true");
    }
    const cell = element("td");
    const b = button(
      `${q.round}회`,
      safe(() => selectQuestion(q.id)),
    );
    b.setAttribute(
      "aria-label",
      `${q.round}회 ${q.session}교시 ${q.number}번 선택`,
    );
    cell.append(b);
    tr.append(cell);
    tr.append(
      element("td", `${q.session}교시`),
      element("td", `${q.number}번`),
      element(
        "td",
        ({ empty: "미작성", draft: "작성 중", completed: "완료" }[
          q.answer_status
        ] || "미작성") + (q.retry_requested ? " / 다시 풀기" : ""),
        "state-label",
      ),
    );
    body.append(tr);
  }
  table.append(body);
  $("question-list").append(table);
}
async function selectQuestion(qid) {
  if (!openLearning.canLeave() || !(await save())) return;
  const sequence = ++loadSequence;
  const q = await api(`/questions/${encodeURIComponent(qid)}`);
  if (sequence !== loadSequence || !openLearning.canLeave()) return;
  current = q;
  conflict = false;
  dirty = false;
  displayQuestion();
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(q.id)) || "null");
    if (
      draft &&
      typeof draft.body === "string" &&
      (draft.body !== q.answer.body || draft.status !== q.answer.status)
    ) {
      $("answer").value = draft.body;
      $("completed").checked = draft.status === "completed";
      dirty = true;
      conflict = draft.revision !== q.answer.revision;
      if (conflict) {
        current.answer.revision = draft.revision;
        $("save-error").hidden = false;
        text(
          "save-error-text",
          "브라우저에 남은 글과 서버 답안이 다릅니다. 내 글을 내려받고 서버 답안과 비교해 주세요.",
        );
        text("save-state", "복구한 글 · 충돌 확인 필요");
      } else {
        text("save-state", "임시 보관 글 복구됨");
        timer = setTimeout(() => void save(), 650);
      }
      text("character-count", `${$("answer").value.length.toLocaleString()}자`);
    }
  } catch {}
  renderQuestionList();
  updateURL();
}
function displayQuestion() {
  studyLayout.question(current?.id);
  void openLearning(current);
  for (const id of [
    "answer",
    "completed",
    "history",
    "original",
    "reference",
    "compare",
  ])
    $(id).disabled = !current;
  $("save-error").hidden = true;
  if (!current) {
    text("question-meta", "");
    text("question-title", "");
    text(
      "question-text",
      "등록된 문항이 없습니다. 문제 관리에서 문항을 추가해 주세요.",
    );
    text("verification", "");
    $("answer").value = "";
    $("completed").checked = false;
    text("save-state", "문항 선택 전");
    text("character-count", "0자");
    return;
  }
  text(
    "question-meta",
    `${current.round}회 / ${current.session}교시 / ${current.number}번`,
  );
  text("question-title", current.topics.map((t) => t.title).join(", "));
  text("question-text", current.text);
  text(
    "verification",
    {
      verified: "사용자가 원문과 대조한 문항입니다.",
      needs_review: "재검토가 필요한 문항입니다.",
      unverified: "원문 대조 상태는 미확인입니다.",
    }[current.data.verification_status] || "원문 대조 상태는 미확인입니다.",
  );
  $("answer").value = current.answer.body;
  $("completed").checked = current.answer.status === "completed";
  text("save-state", current.answer.revision ? "저장됨" : "아직 작성하지 않음");
  text("character-count", `${current.answer.body.length.toLocaleString()}자`);
  $("original").disabled = !current.sources.length;
  $("reference").disabled = !current.topics.length;
}
function openReading(title) {
  text("reading-title", title);
  $("reading-controls").replaceChildren();
  $("reading-body").replaceChildren();
  if (!$("reading-dialog").open) $("reading-dialog").showModal();
}
$("close-reading").onclick = () => {
  renderSequence++;
  $("reading-dialog").close();
};
async function renderMarkdown(body, target = $("reading-body")) {
  const sequence = ++renderSequence;
  body = body.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, id, label) => label || id,
  );
  target.innerHTML = DOMPurify.sanitize(marked.parse(body));
  for (const code of target.querySelectorAll("code.language-mermaid")) {
    try {
      const { svg } = await mermaid.render(
        `diagram-${sequence}-${crypto.randomUUID().replaceAll("-", "")}`,
        code.textContent,
      );
      if (sequence !== renderSequence) return;
      const figure = element("figure");
      figure.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      code.parentElement.replaceWith(figure);
    } catch {
      /* Keep the original diagram source readable if rendering fails. */
    }
  }
}
const openLearning = setupLearning({
  api,
  renderMarkdown,
  cancelRender: () => {
    renderSequence++;
  },
  saved: (qid, value) => {
    const row = rows.find((q) => q.id === qid);
    if (row) row.retry_requested = value.retry_requested;
    renderQuestionList();
  },
});
const studyLayout = setupStudyLayout();
$("reference").onclick = () => studyLayout.mode("compare");
$("retry-only").onchange = renderQuestionList;
$("original").onclick = () => {
  if (current.sources.length === 1) {
    const s = current.sources[0];
    window.open(
      `/api/attachments/${encodeURIComponent(s.id)}/file${s.data.page_start ? "#page=" + s.data.page_start : ""}`,
      "_blank",
      "noopener",
    );
  } else {
    openReading("원본 시험지");
    for (const s of current.sources) {
      const a = element("a", `${s.format.toUpperCase()} 원본 열기`);
      a.href = `/api/attachments/${encodeURIComponent(s.id)}/file`;
      a.target = "_blank";
      a.rel = "noopener";
      $("reading-body").append(a, element("br"));
    }
  }
};
$("history").onclick = safe(async () => {
  if (!openLearning.canLeave() || !(await save())) return;
  const qid = current.id,
    list = await api(`/questions/${encodeURIComponent(qid)}/history`);
  openReading("답안 저장 이력");
  if (!list.length) text("reading-body", "아직 저장된 답안이 없습니다.");
  for (const item of list) {
    const box = element("details");
    box.append(
      element(
        "summary",
        `${new Date(item.saved_at).toLocaleString("ko-KR")} / ${item.status === "completed" ? "완료" : "작성 중"}`,
      ),
    );
    box.append(element("pre", item.body));
    box.append(
      button(
        "이 내용으로 복원",
        safe(async () => {
          if (current.id !== qid) return;
          $("answer").value = item.body;
          $("completed").checked = item.status === "completed";
          edited();
          $("reading-dialog").close();
          await save();
        }),
      ),
    );
    $("reading-body").append(box);
  }
});
$("focus").onclick = () => {
  const on = document.body.classList.toggle("focus-mode");
  $("focus").setAttribute("aria-pressed", String(on));
  text("focus", on ? "집중 모드 종료" : "집중 모드");
};
$("toggle-related").onclick = () => {
  const hidden = document.body.classList.toggle("related-collapsed");
  $("toggle-related").setAttribute("aria-expanded", String(!hidden));
  text("toggle-related", hidden ? "펼치기" : "접기");
};
for (const [id, value] of [
  ["by-topic", "topic"],
  ["by-exam", "exam"],
])
  $(id).onclick = () => {
    mode = value;
    $("by-topic").setAttribute("aria-pressed", String(mode === "topic"));
    $("by-exam").setAttribute("aria-pressed", String(mode === "exam"));
    renderNavigation();
    updateURL();
  };
let searchTimer;
$("search").oninput = () => {
  renderNavigation();
  clearTimeout(searchTimer);
  const sequence = ++loadSequence;
  $("clear-search").hidden = !$("search").value;
  searchTimer = setTimeout(
    safe(async () => {
      if (!openLearning.canLeave() || !(await save())) return;
      const query = $("search").value.trim();
      const found = await api(
        "/questions?" +
          new URLSearchParams(
            query
              ? { search: query }
              : selectedTopic
                ? { topic: selectedTopic }
                : { exam: selectedExam },
          ),
      );
      if (sequence !== loadSequence || !openLearning.canLeave()) return;
      rows = found;
      resultQuery = query;
      renderQuestionList();
      updateURL();
    }),
    300,
  );
};
$("clear-search").onclick = () => {
  $("search").value = "";
  $("search").oninput();
  $("search").focus();
};

async function showView(manage) {
  if (!openLearning.canLeave() || !(await save())) return;
  currentView = manage ? "manage" : "study";
  $("study").hidden = manage;
  $("manage").hidden = !manage;
  const skip = document.querySelector(".skip");
  skip.href = manage ? "#manage" : "#study";
  $("study-tab").setAttribute("aria-current", manage ? "false" : "page");
  $("manage-tab").setAttribute("aria-current", manage ? "page" : "false");
  updateURL();
  if (manage) await management.load();
}
$("study-tab").onclick = safe(() => showView(false));
$("manage-tab").onclick = safe(() => showView(true));
function populateTopics() {
  $("topic-options").replaceChildren();
  $("new-domain").replaceChildren();
  for (const d of nav.domains) {
    const o = element("option", d.name);
    o.value = d.code;
    $("new-domain").append(o);
  }
  for (const t of nav.topics) {
    const o = element("option");
    o.value = `${t.title} (${nav.domains.find((d) => d.code === t.domain)?.name || t.domain})`;
    o.dataset.id = t.id;
    $("topic-options").append(o);
  }
}
async function loadExams() {
  const list = await api("/exams");
  $("exam-list").replaceChildren();
  for (const e of list) {
    if (!e.attachment_id) continue;
    const b = button(
      `${e.round}회 ${e.format.toUpperCase()}`,
      safe(() => chooseExam(e)),
      "exam-item" +
        (chosenExam?.attachment_id === e.attachment_id ? " active" : ""),
    );
    b.append(
      element(
        "span",
        e.status === "draft" ? "등록 대기" : "학습 자료",
        "quiet",
      ),
    );
    $("exam-list").append(b);
  }
  if (!list.length) text("exam-list", "등록된 시험지가 없습니다.");
}
async function chooseExam(e) {
  const sequence = ++reviewSequence;
  chosenExam = e;
  text("review-title", `${e.round}회 문항 확인`);
  $("review-original").disabled = false;
  $("extract").disabled = e.format !== "pdf";
  $("review-fields").disabled = e.format !== "pdf";
  $("question-form").hidden = e.format !== "pdf";
  $("question-form").reset();
  text("question-result", "");
  const result = await api(
    `/attachments/${encodeURIComponent(e.attachment_id)}/extraction`,
  );
  if (sequence !== reviewSequence) return;
  extraction = result;
  displayExtraction();
  await loadExams();
}
function displayExtraction() {
  text("extraction-state", extraction.message);
  $("candidates").replaceChildren(element("option", "직접 입력"));
  $("candidates").firstChild.value = "";
  $("candidates").disabled = false;
  extraction.candidates.forEach((q, i) => {
    const o = element(
      "option",
      `${q.session}교시 ${q.number}번 — ${q.text.slice(0, 55)}`,
    );
    o.value = String(i);
    $("candidates").append(o);
  });
  text(
    "raw-text",
    extraction.pages.map((p) => `[${p.page}페이지]\n${p.text}`).join("\n\n") ||
      "추출한 텍스트가 없습니다. 원본을 보고 직접 입력해 주세요.",
  );
}
$("candidates").onchange = () => {
  const q = extraction.candidates[Number($("candidates").value)];
  if ($("candidates").value === "" || !q) return;
  $("session").value = String(q.session);
  $("number").value = String(q.number);
  $("new-question").value = q.text;
  $("page").value = "";
  $("reviewed").checked = false;
};
$("review-original").onclick = () =>
  window.open(
    `/api/attachments/${encodeURIComponent(chosenExam.attachment_id)}/file`,
    "_blank",
    "noopener",
  );
$("extract").onclick = safe(async () => {
  const sequence = ++reviewSequence,
    aid = chosenExam.attachment_id;
  $("extract").disabled = true;
  text(
    "extraction-state",
    "문항을 추출하는 중입니다. 원본은 그대로 보존됩니다.",
  );
  try {
    const result = await api(
      `/attachments/${encodeURIComponent(aid)}/extract`,
      { method: "POST" },
    );
    if (sequence === reviewSequence) {
      extraction = result;
      displayExtraction();
    }
  } finally {
    if (sequence === reviewSequence) $("extract").disabled = false;
  }
});
$("upload-form").onsubmit = async (e) => {
  e.preventDefault();
  const submit = e.target.querySelector("button[type=submit]");
  submit.disabled = true;
  text("upload-result", "원본을 등록하는 중입니다.");
  try {
    const result = await api("/exams/upload", {
      method: "POST",
      body: new FormData(e.target),
    });
    text(
      "upload-result",
      result.duplicate
        ? `같은 파일이 이미 있습니다: ${result.filename}`
        : `등록했습니다: ${result.filename}`,
    );
    nav = await api("/navigation");
    populateTopics();
    renderNavigation();
    await loadExams();
    const list = await api("/exams");
    await chooseExam(list.find((x) => x.attachment_id === result.id));
  } catch (error) {
    text("upload-result", error.message);
  } finally {
    submit.disabled = false;
  }
};
$("create-topic").onclick = safe(async () => {
  const t = await api("/topics", {
    method: "POST",
    body: JSON.stringify({
      title: $("new-topic-title").value,
      domain: $("new-domain").value,
    }),
  });
  nav = await api("/navigation");
  populateTopics();
  renderNavigation();
  const option = [...$("topic-options").options].find(
    (o) => o.dataset.id === t.id,
  );
  $("topic-search").value = option.value;
  $("new-topic-title").value = "";
});
$("question-form").onsubmit = async (e) => {
  e.preventDefault();
  const submit = e.target.querySelector("button[type=submit]");
  submit.disabled = true;
  const option = [...$("topic-options").options].find(
    (o) => o.value === $("topic-search").value,
  );
  try {
    if (!option)
      throw new Error(
        "목록에서 연결할 주제를 선택하거나 새 주제를 만들어 주세요.",
      );
    const result = await api(`/exams/${chosenExam.round}/questions`, {
      method: "POST",
      body: JSON.stringify({
        attachment_id: chosenExam.attachment_id,
        session: Number($("session").value),
        number: Number($("number").value),
        text: $("new-question").value,
        page: $("page").value ? Number($("page").value) : null,
        topic_id: option.dataset.id,
        reviewed: $("reviewed").checked,
      }),
    });
    text(
      "question-result",
      "문항을 등록했습니다. 학습 화면에서 답안을 작성할 수 있습니다.",
    );
    $("reviewed").checked = false;
    nav = await api("/navigation");
    renderNavigation();
    await loadExams();
  } catch (error) {
    text("question-result", error.message);
  } finally {
    submit.disabled = false;
  }
};

async function start() {
  nav = await api("/navigation");
  populateTopics();
  const params = new URLSearchParams(location.search);
  mode = params.get("mode") === "exam" ? "exam" : "topic";
  selectedTopic = params.get("topic") || "";
  selectedExam = params.get("exam") || "";
  resultQuery = params.get("search") || "";
  $("search").value = resultQuery;
  $("by-topic").setAttribute("aria-pressed", String(mode === "topic"));
  $("by-exam").setAttribute("aria-pressed", String(mode === "exam"));
  if (!selectedTopic && !selectedExam)
    selectedTopic =
      nav.topics.find((t) => t.title.startsWith("정규화"))?.id ||
      nav.topics[0]?.id ||
      "";
  renderNavigation();
  rows = await api(
    "/questions?" +
      new URLSearchParams(
        resultQuery
          ? { search: resultQuery }
          : selectedTopic
            ? { topic: selectedTopic }
            : { exam: selectedExam },
      ),
  );
  const qid = params.get("q") || rows[0]?.id;
  if (qid) await selectQuestion(qid);
  renderQuestionList();
  if (currentView === "manage") await showView(true);
}
start().catch(report);

const openQuestionReview = setupQuestionReview({
  api,
  refreshed: async (qid) => {
    nav = await api("/navigation");
    populateTopics();
    renderNavigation();
    rows = await api(
      "/questions?" +
        new URLSearchParams(
          resultQuery
            ? { search: resultQuery }
            : selectedTopic
              ? { topic: selectedTopic }
              : { exam: selectedExam },
        ),
    );
    if (current?.id === qid) await selectQuestion(qid);
    else renderQuestionList();
    await management.refreshQuestions({ throwOnError: true });
  },
});
const management = setupManagement({
  api,
  openReview: openQuestionReview,
  loadUploads: loadExams,
});
