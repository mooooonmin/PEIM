import { setupIcons, setIconLabel } from "./icons.js";
import { setupUploadDraft } from "./upload-draft.js";
import { readStudySession, rememberStudySession } from "./study-session.js";
import { createDraftStore, renderDraftCopies } from "./draft-store.js";
import { setupUploadPreview } from "./upload-preview.js";
import { setupRetryList } from "./retry-list.js";
import { setupStudyLayout, setupStudyNavigation } from "./study-layout.js";
import { setupManagement } from "./manage.js";
import { setupQuestionReview } from "./review.js";
import { setupLearning } from "./learning.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import mermaid from "mermaid";

const $ = (id) => document.getElementById(id);
setupIcons();
let nav,
  mode = "topic",
  selectedTopic = "",
  selectedExam = "",
  resultQuery = "",
  current = null,
  pendingStudyQuestion = null,
  rows = [];
let retryQueue = false;
let timer,
  saving = null,
  dirty = false,
  loadSequence = 0,
  chosenExam = null,
  extraction = null;
let currentView =
  new URLSearchParams(location.search).get("view") === "manage"
    ? "manage"
    : new URLSearchParams(location.search).get("view") === "retry"
      ? "retry"
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
  if ($(id).dataset.icon) { setIconLabel($(id), value); return; }
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
const answerDrafts = createDraftStore();
function showAnswerDrafts() { renderDraftCopies($("answer-drafts"), answerDrafts, current ? draftKey(current.id) : null); }
window.addEventListener("storage", showAnswerDrafts);
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
    answerDrafts.write(draftKey(current.id), snapshot());
    showAnswerDrafts();
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
      const wasCompleted = q.answer.status === 'completed';
      q.answer = result;
      const exam = nav.exams.find(e => e.round === q.round);
      if (exam) exam.completed = Math.max(0, (Number(exam.completed) || 0) + Number(result.status === 'completed') - Number(wasCompleted));
      dirty =
        $("answer").value !== value.body ||
        ($("completed").checked ? "completed" : "draft") !== value.status;
      if (dirty) cacheDraft();
      else {
        try {
          answerDrafts.clear(draftKey(q.id), value);
          showAnswerDrafts();
        } catch {}
      }
      text("save-state", dirty ? "저장 대기" : "저장됨");
      $("save-error").hidden = true;
      const row = rows.find((r) => r.id === q.id);
      if (row) row.answer_status = result.status;
      renderQuestionList();
      renderNavigation();
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
  const q = current, sequence = ++loadSequence, view = currentView;
  const value = snapshot();
  const unchanged = () => current === q && sequence === loadSequence && currentView === view &&
    JSON.stringify(snapshot()) === JSON.stringify(value);
  if (saving) await saving;
  if (saving || !unchanged()) return;
  const updated = await api(`/questions/${encodeURIComponent(q.id)}`);
  if (saving || !unchanged()) return;
  try {
    localStorage.setItem(
      draftKey(q.id) + ":before-reload",
      JSON.stringify(value),
    );
    answerDrafts.archive(draftKey(q.id), value);
    showAnswerDrafts();
  } catch {}
  dirty = false;
  conflict = false;
  current = updated;
  displayQuestion();
});

function renderNavigation() {
  $("navigation").replaceChildren();
  const query = ''; // Keep navigation available while searching questions.
  if (mode === "exam") {
    for (const exam of nav.exams.filter(
      (e) => !query || String(e.round).includes(query),
    )) {
      const b = button(
        `${exam.round}회`,
        safe(() => chooseFilter("", exam.id)),
        "topic-button" + (exam.id === selectedExam ? " active" : ""),
      );
      b.append(element("span", `완료 ${exam.completed || 0}/${exam.count}`, "count"));
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
  params.delete("queue");
  if (retryQueue) params.set('queue', 'retry');
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
  if (currentView === "retry") params.set("view", "retry");
  if (selectedTopic) params.set("topic", selectedTopic);
  if (selectedExam) params.set("exam", selectedExam);
  if (current || pendingStudyQuestion) params.set("q", current?.id || pendingStudyQuestion);
  history.replaceState(null, "", "?" + params);
  if (currentView === 'study' && current) rememberStudySession(params, retryQueue ? rows.map(q => q.id) : []);
}
async function chooseFilter(topic, exam) {
  clearTimeout(searchTimer);
  if (!openLearning.canLeave() || !(await save())) return;
  const sequence = ++loadSequence, search = searchSequence;
  const nextRows = await api(
    "/questions?" + new URLSearchParams(topic ? { topic } : { exam }),
  );
  if (search !== searchSequence || sequence !== loadSequence || !openLearning.canLeave()) return;
  if (!(await save()) || search !== searchSequence || sequence !== loadSequence || !openLearning.canLeave())
    return;
  selectedTopic = topic;
  selectedExam = exam;
  retryQueue = false;
  $("back-to-retries").hidden = true;
  resultQuery = "";
  $("search").value = "";
  rows = nextRows;
  pendingStudyQuestion = null;
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
    retryQueue ? "다시 풀기" : resultQuery ? "검색 결과" : selectedTopic ? "연결 기출" : "기출문항",
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
  studyNavigation.update(visibleRows, current?.id, retryQueue ? '다시 풀기' : resultQuery ? '검색' : '');
  text('study-progress', `완료 ${visibleRows.filter(q => q.answer_status === 'completed').length} / ${visibleRows.length}`);
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
      safe(async () => {
        if (await selectQuestion(q.id)) {
          studyLayout.drawer(false);
          $("toggle-question-list").focus();
        }
      }),
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
  const originView = currentView, originSequence = loadSequence;
  if (!openLearning.canLeave() || !(await save())) return;
  if (currentView !== originView || originSequence !== loadSequence) return;
  const sequence = ++loadSequence;
  const q = await api(`/questions/${encodeURIComponent(qid)}`);
  if (sequence !== loadSequence || !openLearning.canLeave()) return;
  // The editor remains usable while the next question is loading.
  if (!(await save()) || sequence !== loadSequence || !openLearning.canLeave())
    return;
  if (current?.id === q.id && current.answer.revision > q.answer.revision)
    q.answer = current.answer;
  current = q;
  pendingStudyQuestion = null;
  conflict = false;
  dirty = false;
  displayQuestion();
  try {
    const draft = answerDrafts.read(draftKey(q.id));
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
  showAnswerDrafts();
  renderQuestionList();
  updateURL();
  return true;
}
function displayQuestion() {
  studyLayout.question(current?.id);
  void openLearning(current);
  for (const id of ["answer", "completed", "history", "original"])
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
}
let readingGeneration = 0;
function openReading(title) {
  readingGeneration++;
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
const studyNavigation = setupStudyNavigation({ select: safe(selectQuestion) });
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
  const q = current, view = currentView, sequence = loadSequence;
  if (!q || !openLearning.canLeave() || !(await save())) return;
  if (current !== q || currentView !== view || sequence !== loadSequence) return;
  const qid = q.id,
    list = await api(`/questions/${encodeURIComponent(qid)}/history`);
  if (current !== q || currentView !== view || sequence !== loadSequence) return;
  openReading("답안 저장 이력");
  const reading = readingGeneration;
  let restoring = false;
  const canRestore = () => current === q && currentView === view && sequence === loadSequence &&
    reading === readingGeneration && $("reading-dialog").open;
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
          if (restoring || !canRestore()) return;
          // The editor remains usable while the history request is in flight.
          // Preserve those newer edits before replacing them with an old version.
          restoring = true;
          const saved = await save();
          if (!canRestore()) return;
          if (!saved) {
            $("reading-dialog").close();
            $("save-error").scrollIntoView({ block: "nearest" });
            return;
          }
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
let searchTimer, searchSequence = 0;
$("search").oninput = () => {
  renderNavigation();
  clearTimeout(searchTimer);
  const sequence = loadSequence, search = ++searchSequence;
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
                : selectedExam ? { exam: selectedExam } : {},
          ),
      );
      if (search !== searchSequence || sequence !== loadSequence || !openLearning.canLeave()) return;
      rows = found;
      retryQueue = false;
      $("back-to-retries").hidden = true;
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

async function showView(manage, { answerAlreadySelected = false } = {}) {
  // Retry navigation already saved the outgoing answer; expose incoming conflicts.
  if (!answerAlreadySelected && (!openLearning.canLeave() || !(await save()))) return;
  if (currentView !== (manage ? "manage" : "study")) loadSequence++;
  currentView = manage ? "manage" : "study";
  $("retry-library").hidden = true;
  $("retry-tab").setAttribute("aria-current", "false");
  $("study").hidden = manage;
  $("manage").hidden = !manage;
  const skip = document.querySelector(".skip");
  skip.href = manage ? "#manage" : "#study";
  $("study-tab").setAttribute("aria-current", manage ? "false" : "page");
  $("manage-tab").setAttribute("aria-current", manage ? "page" : "false");
  if (!manage && pendingStudyQuestion) await selectQuestion(pendingStudyQuestion);
  updateURL();
  if (manage) await management.load();
  return true;
}
const retryLibrary = setupRetryList({
  api,
  openStudy: safe(() => showView(false)),
  openQuestion: async (qid, queue) => {
    if (!(await selectQuestion(qid))) return false;
    if (currentView !== "retry") return false;
    retryQueue = true;
    selectedTopic = '';
    selectedExam = '';
    resultQuery = "";
    $("search").value = "";
    rows = queue.map(q => ({...q, retry_requested:true}));
    $("retry-only").checked = false;
    renderNavigation();
    renderQuestionList();
    if (!(await showView(false, { answerAlreadySelected: true }))) return false;
    $("back-to-retries").hidden = false;
    $("study").focus({ preventScroll: true });
    document.querySelector(".writing").scrollIntoView({ block: "start" });
    return true;
  },
});
async function showRetryLibrary() {
  if (!openLearning.canLeave() || !(await save())) return;
  if (currentView !== "retry") loadSequence++;
  currentView = "retry";
  $("study").hidden = true;
  $("manage").hidden = true;
  $("retry-library").hidden = false;
  $("study-tab").setAttribute("aria-current", "false");
  $("manage-tab").setAttribute("aria-current", "false");
  $("retry-tab").setAttribute("aria-current", "page");
  document.querySelector(".skip").href = "#retry-library";
  updateURL();
  $("retry-library").focus({ preventScroll: true });
  await retryLibrary.load();
}
$("retry-tab").onclick = safe(showRetryLibrary);
$("back-to-retries").onclick = safe(showRetryLibrary);
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
let examRows = [], examListSequence = 0;
const uploadPreview = setupUploadPreview();
const uploadDraft = setupUploadDraft();
let registrationBusy = false;
function uploadPane(name) {
  $("upload-workspace").dataset.pane = name;
  document.querySelectorAll("[data-upload-pane]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.uploadPane === name)));
}
document.querySelectorAll("[data-upload-pane]").forEach(b => { b.onclick = () => uploadPane(b.dataset.uploadPane); });
$("question-form").addEventListener("invalid", () => uploadPane("edit"), true);
$("upload-form").addEventListener("invalid", () => { $("add-pdf").open = true; }, true);
$("use-upload-page").onclick = () => {
  if (registrationBusy) return;
  const page = uploadPreview.page();
  if (!page) return;
  $("page").value = String(page); $("reviewed").checked = false;
  uploadDraft.stash();
  uploadPane("edit"); $("page").focus();
};
function renderExams() {
  const query = $("exam-search").value.trim().toLowerCase();
  const attached = examRows.filter(e => e.attachment_id);
  const visible = attached.filter(e => `${e.round} ${e.format}`.toLowerCase().includes(query));
  text("exam-count", `${attached.length}개 시험지 중 ${visible.length}개 표시`);
  $("exam-list").replaceChildren();
  for (const e of visible) {
    const active = chosenExam?.attachment_id === e.attachment_id;
    const b = button(`${e.round}회 ${e.format.toUpperCase()}`, safe(() => chooseExam(e)), "exam-item" + (active ? " active" : ""));
    b.setAttribute("aria-pressed", String(active));
    b.append(element("span", e.status === "draft" ? "등록 대기" : "학습 자료", "quiet"));
    $("exam-list").append(b);
  }
  if (!visible.length) text("exam-list", attached.length ? "검색 결과가 없습니다. 회차나 파일 형식을 바꿔 주세요." : "등록된 시험지가 없습니다. 새 PDF 추가로 시작하세요.");
}
$("exam-search").oninput = renderExams;
async function loadExams() {
  const sequence = ++examListSequence;
  const list = await api("/exams");
  if (sequence !== examListSequence) return;
  examRows = list; renderExams();
}
async function chooseExam(e) {
  if (registrationBusy || !uploadDraft.allowReplace()) return;
  const sequence = ++reviewSequence;
  chosenExam = e;
  $("upload-workspace").hidden = false;
  $("exam-picker").open = false;
  text("selected-exam-label", `${e.round}회 ${e.format.toUpperCase()} 선택됨`);
  renderExams(); uploadPane("source");
  $("upload-workspace").focus({ preventScroll: true });
  void uploadPreview.open(e);
  text("review-title", `${e.round}회 문항 확인`);
  $("review-original").disabled = false;
  extraction = null;
  $("extract").disabled = true;
  $("review-fields").disabled = true;
  $("candidates").replaceChildren();
  $("candidates").disabled = true;
  text("raw-text", "");
  text("extraction-state", "선택한 시험지의 추출 정보를 불러오는 중입니다.");
  $("question-form").hidden = e.format !== "pdf";
  $("question-form").reset();
  text("question-result", "");
  uploadDraft.open(e.attachment_id);
  $("upload-workspace").scrollIntoView({ block: "start" });
  let result;
  try {
    result = await api(`/attachments/${encodeURIComponent(e.attachment_id)}/extraction`);
  } catch (error) {
    if (sequence !== reviewSequence) return;
    text("extraction-state", "추출 정보를 불러오지 못했습니다. PDF 텍스트 추출 버튼으로 다시 시도하거나 시험지를 다시 선택해 주세요.");
    $("extract").disabled = e.format !== "pdf";
    throw error;
  }
  if (sequence !== reviewSequence) return;
  extraction = result;
  displayExtraction();
  $("extract").disabled = e.format !== "pdf";
  $("review-fields").disabled = e.format !== "pdf";
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
  if (!extraction || registrationBusy) return;
  if (!uploadDraft.allowReplace()) {
    $("candidates").value = uploadDraft.candidate();
    return;
  }
  const q = extraction.candidates[Number($("candidates").value)];
  if ($("candidates").value === "" || !q) return;
  $("session").value = String(q.session);
  $("number").value = String(q.number);
  $("new-question").value = q.text;
  $("page").value = "";
  $("reviewed").checked = false;
  uploadDraft.acceptCandidate();
};
$("review-original").onclick = () =>
  window.open(
    `/api/attachments/${encodeURIComponent(chosenExam.attachment_id)}/file`,
    "_blank",
    "noopener",
  );
$("extract").onclick = safe(async () => {
  if (registrationBusy) return;
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
      $("review-fields").disabled = registrationBusy;
      $("candidates").disabled = registrationBusy;
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
    $("add-pdf").open = false;
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
  $("reviewed").checked = false;
  uploadDraft.stash();
});
$("question-form").onsubmit = async (e) => {
  e.preventDefault();
  if (registrationBusy) return;
  const submit = e.target.querySelector("button[type=submit]");
  submit.disabled = true;
  const option = [...$("topic-options").options].find(
    (o) => o.value === $("topic-search").value,
  );
  const submitted = uploadDraft.value();
  try {
    if (!extraction || $("review-fields").disabled)
      throw new Error("선택한 시험지의 추출 정보를 불러온 뒤 등록해 주세요.");
    if (!option)
      throw new Error(
        "목록에서 연결할 주제를 선택하거나 새 주제를 만들어 주세요.",
      );
    registrationBusy = true;
    $("review-fields").disabled = true;
    $("candidates").disabled = true;
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
    uploadDraft.saved(submitted);
    nav = await api("/navigation");
    renderNavigation();
    await loadExams();
  } catch (error) {
    text("question-result", error.message);
  } finally {
    registrationBusy = false;
    if (extraction) {
      $("review-fields").disabled = false;
      $("candidates").disabled = false;
    }
    submit.disabled = false;
  }
};

async function start() {
  nav = await api("/navigation");
  populateTopics();
  const stored = readStudySession();
  const restored = !location.search && stored;
  const params = new URLSearchParams(restored ? stored.query : location.search);
  retryQueue = params.get('queue') === 'retry';
  mode = params.get("mode") === "exam" ? "exam" : "topic";
  selectedTopic = params.get("topic") || "";
  selectedExam = params.get("exam") || "";
  if (restored) {
    if (!nav.topics.some(t => t.id === selectedTopic)) selectedTopic = '';
    if (!nav.exams.some(e => e.id === selectedExam)) selectedExam = '';
  }
  resultQuery = params.get("search") || "";
  $("search").value = resultQuery;
  $("by-topic").setAttribute("aria-pressed", String(mode === "topic"));
  $("by-exam").setAttribute("aria-pressed", String(mode === "exam"));
  if (!selectedTopic && !selectedExam && !retryQueue)
    selectedTopic =
      nav.topics.find((t) => t.title.startsWith("정규화"))?.id ||
      nav.topics[0]?.id ||
      "";
  renderNavigation();
  if (retryQueue) {
    const previous = new URLSearchParams(stored?.query || '');
    const sameContext = ['mode','topic','exam','search','q','queue'].every(key => previous.get(key) === params.get(key));
    const ids = sameContext ? stored.retryIds : [];
    if (ids.length) {
      const available = new Map((await api('/questions')).map(q => [q.id,q]));
      rows = ids.map(id => available.get(id)).filter(Boolean);
    } else rows = await api('/retry-questions');
    $('back-to-retries').hidden = false;
  } else rows = await api(
    "/questions?" +
      new URLSearchParams(
        resultQuery
          ? { search: resultQuery }
          : selectedTopic
            ? { topic: selectedTopic }
            : selectedExam ? { exam: selectedExam } : {},
      ),
  );
  let qid = params.get("q") || rows[0]?.id;
  if ((restored || retryQueue) && !rows.some(q => q.id === qid)) qid = rows[0]?.id;
  if (currentView === "study") {
    if (qid) await selectQuestion(qid);
  } else {
    // A hidden study draft must not block the requested startup page.
    pendingStudyQuestion = qid || null;
    displayQuestion();
  }
  renderQuestionList();
  if (currentView === "manage") await showView(true);
  else if (currentView === "retry") await showRetryLibrary();
}
start().catch(report);

const openQuestionReview = setupQuestionReview({
  api,
  refreshed: async (qid) => {
    nav = await api("/navigation");
    populateTopics();
    renderNavigation();
    const queueIds = retryQueue ? rows.map(q => q.id) : null;
    rows = await api(
      "/questions?" +
        new URLSearchParams(
          resultQuery
            ? { search: resultQuery }
            : selectedTopic
              ? { topic: selectedTopic }
              : selectedExam ? { exam: selectedExam } : {},
        ),
    );
    if (queueIds) {
      const available = new Map(rows.map(q => [q.id, q]));
      rows = queueIds.map(id => available.get(id)).filter(Boolean);
    }
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
