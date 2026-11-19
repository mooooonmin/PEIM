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
    const query = $("managed-search").value.trim().toLowerCase();
    const exam = $("managed-exam").value,
      status = $("managed-status").value;
    const filtered = questions.filter(
      (q) =>
        (!exam || `exam-${q.round}` === exam) &&
        (!status || q.verification_status === status) &&
        (!query || q.text.toLowerCase().includes(query)),
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
    $("managed-list").replaceChildren();
    const table = node("table"),
      head = node("thead"),
      header = node("tr"),
      body = node("tbody");
    table.className = "managed-table";
    const caption = node("caption", "기출문항 검수 목록");
    caption.className = "sr-only";
    for (const label of ["회차", "교시", "번호", "문제", "상태", "작업"]) {
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
          "조건에 맞는 문항이 없습니다. 검색어나 필터를 바꾸거나 PDF·새 문항 등록에서 추가해 주세요.",
        ),
      );
    for (const q of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
      const row = node("tr");
      row.className = "managed-question";
      const values = [
        `${q.round}회`,
        `${q.session}교시`,
        `${q.number}번`,
        q.text,
        statuses[q.verification_status] || "미확인",
      ];
      values.forEach((value, index) => {
        const cell = node("td");
        cell.dataset.label = ["회차", "교시", "번호", "문제", "상태"][index];
        const content = node("span", value);
        if (index === 3) content.className = "question-preview";
        cell.append(content);
        row.append(cell);
      });
      const button = node("button", "검수·수정");
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${q.round}회 ${q.session}교시 ${q.number}번 검수·수정`,
      );
      button.onclick = () => openReview(q.id);
      const action = node("td");
      action.append(button);
      row.append(action);
      body.append(row);
    }
  }
  async function refreshQuestions() {
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
      $("managed-exam").replaceChildren(new Option("전체 회차", ""));
      for (const exam of nav.exams)
        $("managed-exam").append(new Option(`${exam.round}회`, exam.id));
      if (nav.exams.some((e) => e.id === selected))
        $("managed-exam").value = selected;
      render();
    } catch (error) {
      if (seq === sequence)
        $("managed-count").textContent =
          `불러오지 못했습니다. 새로고침으로 다시 시도하세요. ${error.message}`;
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
  $("managed-refresh").onclick = refreshQuestions;
  for (const id of ["managed-search", "managed-exam", "managed-status"])
    $(id).addEventListener(id === "managed-search" ? "input" : "change", () => {
      page = 0;
      render();
    });
  $("managed-previous").onclick = () => {
    page--;
    render();
    $("managed-count").scrollIntoView({ block: "start" });
  };
  $("managed-next").onclick = () => {
    page++;
    render();
    $("managed-count").scrollIntoView({ block: "start" });
  };
  return { load: () => selectSection(section), refreshQuestions };
}
