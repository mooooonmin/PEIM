import { setIconLabel } from "./icons.js";
import { renderFilterChips } from "./filter-chips.js";
const $ = (id) => document.getElementById(id);
const statuses = {
  unverified: "미확인",
  verified: "확인 완료",
  needs_review: "재검토 필요",
};
function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}
export function setupManagement({ api, openReview, loadUploads }) {
  const initial = new URLSearchParams(location.search);
  $("managed-search").value = initial.get("manageSearch") || "";
  $("managed-status").value = initial.get("manageStatus") || "";
  let initialExam = initial.get("manageExam") || "";
  let questions = [],
    page = Math.max(
      0,
      Math.min(1000000, Math.floor(Number(initial.get("managePage")) || 1) - 1),
    ),
    sequence = 0;
  let section =
    new URLSearchParams(location.search).get("section") === "upload"
      ? "upload"
      : "questions";
  const pageSize = 50;
  function render() {
    renderFilterChips($("managed-chips"), [
      { control: $("managed-search"), label: "검색" },
      { control: $("managed-exam"), label: "회차" },
      { control: $("managed-status"), label: "확인 상태" },
    ], () => { page = 0; render(); });
    $("managed-reset").hidden = !$("managed-chips").childElementCount;
    const query = $("managed-search").value.trim().toLowerCase();
    const exam = $("managed-exam").value,
      status = $("managed-status").value;
    const filtered = questions.filter(
      (q) =>
        (!exam || `exam-${q.round}` === exam) &&
        (!status || q.verification_status === status) &&
        (!query || `${q.text} ${q.topics || ""}`.toLowerCase().includes(query)),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pages - 1);
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({
      manageSearch: $("managed-search").value.trim(),
      manageExam: exam,
      manageStatus: status,
      managePage: page ? String(page + 1) : "",
    })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, "", url);
    $("managed-count").textContent =
      `${filtered.length.toLocaleString()}개 문항`;
    $("managed-page").textContent = `${page + 1} / ${pages}`;
    $("managed-previous").disabled = page === 0;
    $("managed-next").disabled = page >= pages - 1;
    $("managed-previous-top").disabled = page === 0;
    $("managed-next-top").disabled = page >= pages - 1;
    $("managed-page-top").textContent = `${page + 1} / ${pages}`;
    $("managed-range").textContent = filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)}번째 표시` : "";
    $("managed-list").replaceChildren();
    const table = node("table"),
      head = node("thead"),
      header = node("tr"),
      body = node("tbody");
    table.className = "managed-table";
    const caption = node("caption", "기출문항 검수 목록");
    caption.className = "sr-only";
    for (const label of ["문항", "문제·연결 주제", "원문 확인", "작업"]) {
      const cell = node("th", label);
      cell.scope = "col";
      header.append(cell);
    }
    head.append(header);
    table.append(caption, head, body);
    if (filtered.length) $("managed-list").append(table);
    if (!filtered.length)
      $("managed-list").append(
        node(
          "p",
          "조건에 맞는 문항이 없습니다. 조건 지우기로 전체 목록을 보거나 시험지·문항 등록에서 추가해 주세요.",
        ),
      );
    for (const q of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
      const row = node("tr");
      row.className = "managed-question";
      const identity = node("td");
      identity.className = "managed-identity";
      identity.append(node("strong", `${q.round}회`), node("span", `${q.session}교시 / ${q.number}번`));
      const content = node("td"); content.className = "managed-content";
      const title = node("button", q.text);
      title.type = "button"; title.className = "question-title-button";
      title.setAttribute("aria-label", `${q.round}회 ${q.session}교시 ${q.number}번 문제 상세: ${q.text}`);
      title.onclick = () => openReview(q.id, filtered.map(item => item.id));
      const topics = node("p", q.topics || "연결 주제 없음"); topics.className = "quiet";
      content.append(title, topics);
      const status = node("td"); status.className = "managed-status";
      const badge = node("span", statuses[q.verification_status] || "미확인");
      badge.className = `status-badge status-${Object.hasOwn(statuses, q.verification_status) ? q.verification_status : "unverified"}`;
      status.append(badge); row.append(identity, content, status);
      const button = node("button", "수정 →");
      button.type = "button";
      button.className = "utility-button";
      button.setAttribute(
        "aria-label",
        `${q.round}회 ${q.session}교시 ${q.number}번 검수·수정`,
      );
      setIconLabel(button, button.getAttribute("aria-label"), "edit");
      button.onclick = () =>
        openReview(
          q.id,
          filtered.map((item) => item.id),
        );
      const action = node("td");
      action.append(button);
      row.append(action);
      body.append(row);
    }
  }
  async function refreshQuestions({ throwOnError = false } = {}) {
    const seq = ++sequence;
    $("managed-count").textContent = "문항을 불러오는 중입니다.";
    try {
      const [data, nav] = await Promise.all([
        api("/questions"),
        api("/navigation"),
      ]);
      if (seq !== sequence) return;
      questions = data;
      const selected = initialExam || $("managed-exam").value;
      initialExam = "";
      const all = node("option", "전체 회차");
      all.value = "";
      $("managed-exam").replaceChildren(all);
      for (const exam of nav.exams) {
        const option = node("option", `${exam.round}회`);
        option.value = exam.id;
        $("managed-exam").append(option);
      }
      if (nav.exams.some((e) => e.id === selected))
        $("managed-exam").value = selected;
      render();
    } catch (error) {
      if (seq === sequence)
        $("managed-count").textContent =
          `불러오지 못했습니다. 새로고침으로 다시 시도하세요. ${error.message}`;
      if (throwOnError) throw error;
    }
  }
  async function selectSection(value) {
    section = value;
    $("managed-questions").hidden = value !== "questions";
    $("managed-upload").hidden = value !== "upload";
    $("manage-existing").setAttribute(
      "aria-pressed",
      String(value === "questions"),
    );
    $("manage-upload").setAttribute("aria-pressed", String(value === "upload"));
    const url = new URL(location.href);
    url.searchParams.set("view", "manage");
    url.searchParams.set("section", value);
    history.replaceState(null, "", url);
    if (value === "questions") await refreshQuestions();
    else {
      try {
        await loadUploads();
      } catch (error) {
        $("exam-list").textContent = error.message;
      }
    }
  }
  $("manage-existing").onclick = () => selectSection("questions");
  $("manage-upload").onclick = () => selectSection("upload");
  $("manage-add-pdf").onclick = async () => {
    await selectSection("upload");
    $("add-pdf").open = true;
    $("round").focus();
  };
  $("managed-filter-toggle").onclick = () => {
    const expanded = $("managed-filter-toggle").getAttribute("aria-expanded") !== "true";
    $("managed-filter-toggle").setAttribute("aria-expanded", String(expanded));
    setIconLabel($("managed-filter-toggle"), expanded ? "필터 접기" : "필터 보기");
    $("managed-filter-controls").dataset.expanded = String(expanded);
  };
  $("managed-refresh").onclick = refreshQuestions;
  $("managed-reset").onclick = () => {
    for (const id of ["managed-search", "managed-exam", "managed-status"]) $(id).value = "";
    page = 0; render(); $("managed-search").focus();
  };
  for (const id of ["managed-search", "managed-exam", "managed-status"])
    $(id).addEventListener(id === "managed-search" ? "input" : "change", () => {
      page = 0;
      render();
    });
  $("managed-previous-top").onclick = $("managed-previous").onclick = () => {
    page--;
    render();
    $("managed-count").scrollIntoView({ block: "start" });
  };
  $("managed-next-top").onclick = $("managed-next").onclick = () => {
    page++;
    render();
    $("managed-count").scrollIntoView({ block: "start" });
  };
  return { load: () => selectSection(section), refreshQuestions };
}
