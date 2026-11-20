import { renderFilterChips } from "./filter-chips.js";
const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

export function setupRetryList({ api, openQuestion, openStudy = () => {} }) {
  const desktop = document.defaultView.matchMedia("(min-width: 701px)");
  const filters = document.querySelector("#retry-tools .collection-filters");
  filters.open = desktop.matches;
  desktop.addEventListener("change", () => {
    if (desktop.matches) filters.open = true;
  });
  let rows = [],
    loading = false,
    opening = false,
    hasLoaded = false;
  function render() {
    renderFilterChips($("retry-chips"), [
      { control: $("retry-search"), label: "검색" },
      { control: $("retry-topic"), label: "주제" },
      { control: $("retry-round"), label: "회차" },
      { control: $("retry-status"), label: "답안 상태" },
    ], render);
    $("retry-reset").hidden = !$("retry-chips").childElementCount && $("retry-sort").value === "recent";
    const query = $("retry-search").value.trim().toLowerCase();
    const round = $("retry-round").value, status = $("retry-status").value;
    const topic = $("retry-topic").value.trim().toLowerCase();
    const visible = rows.filter((q) =>
      (!round || String(q.round) === round) && (!status || q.answer_status === status) &&
      (!topic || (q.topics || "").toLowerCase().includes(topic)) &&
      `${q.round} ${q.text} ${q.topics} ${q.note}`
        .toLowerCase()
        .includes(query),
    );
    if ($("retry-sort").value === "oldest") visible.reverse();
    if ($("retry-sort").value === "round") visible.sort((a, b) => b.round - a.round || a.session - b.session || a.number - b.number);
    $("retry-tools").hidden = hasLoaded && !rows.length;
    $("retry-count").textContent = hasLoaded
      ? `${rows.length}문항 중 ${visible.length}문항 표시`
      : "";
    const list = $("retry-items");
    list.replaceChildren();
    if (hasLoaded && !visible.length) {
      const empty = el("div", "", "collection-empty");
      empty.append(el("h2", rows.length ? "조건에 맞는 문항이 없습니다" : "다시 풀기로 표시한 문항이 없습니다"),
        el("p", rows.length ? "검색어나 필터를 바꿔 보세요." : "학습 화면의 보완 메모에서 다시 풀기를 표시하고 저장하세요."));
      const action = el("button", rows.length ? "필터 초기화" : "학습하러 가기", "primary");
      action.onclick = rows.length ? reset : openStudy;
      empty.append(action); list.append(empty);
    }
    for (const q of visible) {
      const item = el("article", "", "retry-item");
      const header = el("div", "", "retry-item-head");
      const meta = `${q.round}회 / ${q.session}교시 / ${q.number}번`;
      const title = el("h2", q.text, "retry-title");
      const button = el("button", "이어서 풀기 →", "continue-button");
      button.disabled = loading || opening;
      button.setAttribute("aria-label", `${meta} 이어서 풀기`);
      button.onclick = async () => {
        if (loading || opening) return;
        opening = true;
        list.querySelectorAll('.continue-button').forEach(b => { b.disabled = true; });
        $("retry-result").textContent = "문항을 여는 중입니다.";
        try {
          const opened = await openQuestion(q.id);
          $("retry-result").textContent = opened
            ? ""
            : "현재 답안의 저장 상태를 확인한 뒤 다시 선택해 주세요.";
        } catch (error) {
          $("retry-result").textContent =
            `문항을 열지 못했습니다. ${error.message}`;
        } finally {
          opening = false;
          list.querySelectorAll('.continue-button').forEach(b => { b.disabled = loading; });
          if (!$("retry-library").hidden && button.isConnected) button.focus({preventScroll:true});
        }
      };
      const identity = el("div", "", "retry-identity");
      identity.append(el("p", meta, "retry-meta"), title,
        el("p", q.topics || "연결 주제 없음", "quiet"));
      header.append(identity, button);
      item.append(header, el("span", ({empty:"미작성", draft:"작성 중", completed:"작성 완료"}[q.answer_status] || "미작성"), "status-badge" + (q.answer_status === 'completed' ? ' status-verified' : '')));
      if (q.text.length > 120) {
        const full = el("details", "", "retry-full");
        full.append(el("summary", "문제 전체 보기"), el("p", q.text, "retry-question")); item.append(full);
      }
      if (q.note) {
        const memo = el("details", "", "retry-memo");
        const summary = el("summary", "보완 메모");
        summary.append(el("span", q.note, "memo-preview"));
        memo.append(summary, el("p", q.note, "retry-note")); item.append(memo);
      } else item.append(el("p", "저장한 보완 메모가 없습니다.", "quiet"));
      if (q.updated_at) {
        const date = new Date(q.updated_at);
        if (!Number.isNaN(date.getTime())) item.append(el("p", `복습 저장 ${date.toLocaleString("ko-KR")}`, "quiet"));
      }
      list.append(item);
    }
  }
  async function load() {
    if (loading) return;
    loading = true;
    $("refresh-retry").disabled = true;
    $("retry-result").textContent =
      "저장된 다시 풀기 문항을 불러오는 중입니다.";
    render();
    try {
      rows = await api("/retry-questions");
      hasLoaded = true;
      const selectedRound = $("retry-round").value;
      $("retry-round").replaceChildren();
      for (const value of ["", ...new Set(rows.map(q => q.round).sort((a,b) => b-a))]) {
        const option = el("option", value === "" ? "전체 회차" : `${value}회`);
        option.value = String(value); $("retry-round").append(option);
      }
      $("retry-round").value = [...$("retry-round").options].some(o => o.value === selectedRound) ? selectedRound : "";
      $("retry-result").textContent =
        "";
    } catch (error) {
      $("retry-result").textContent =
        `불러오지 못했습니다. ${hasLoaded ? "이전 목록을 표시합니다. " : ""}새로고침으로 재시도하세요. ${error.message}`;
    } finally {
      loading = false;
      $("refresh-retry").disabled = false;
      render();
    }
  }
  function reset() {
    for (const id of ["retry-search", "retry-topic", "retry-round", "retry-status"]) $(id).value = "";
    $("retry-sort").value = "recent"; render(); $("retry-search").focus();
  }
  $("retry-reset").onclick = reset;
  for (const id of ["retry-topic", "retry-round", "retry-status", "retry-sort"])
    $(id)[id === "retry-topic" ? "oninput" : "onchange"] = render;
  $("retry-search").oninput = render;
  $("refresh-retry").onclick = load;
  return { load };
}
