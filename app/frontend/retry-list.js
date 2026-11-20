const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

export function setupRetryList({ api, openQuestion }) {
  let rows = [],
    loading = false,
    opening = false,
    hasLoaded = false;
  function render() {
    const query = $("retry-search").value.trim().toLowerCase();
    const visible = rows.filter((q) =>
      `${q.round} ${q.text} ${q.topics} ${q.note}`
        .toLowerCase()
        .includes(query),
    );
    $("retry-count").textContent = hasLoaded
      ? `${rows.length}문항 중 ${visible.length}문항 표시`
      : "";
    const list = $("retry-items");
    list.replaceChildren();
    if (hasLoaded && !visible.length)
      list.append(
        el(
          "p",
          rows.length
            ? "검색 조건에 맞는 문항이 없습니다."
            : "다시 풀기로 표시한 문항이 없습니다. 학습 화면의 보완 메모에서 표시하고 저장해 주세요.",
          "empty",
        ),
      );
    for (const q of visible) {
      const item = el("article", "", "retry-item");
      const header = el("div", "", "retry-item-head");
      const title = el("h2", `${q.round}회 / ${q.session}교시 / ${q.number}번`);
      const button = el("button", "이어서 풀기");
      button.disabled = loading || opening;
      button.setAttribute("aria-label", `${title.textContent} 이어서 풀기`);
      button.onclick = async () => {
        if (loading || opening) return;
        opening = true;
        render();
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
          render();
        }
      };
      header.append(title, button);
      item.append(
        header,
        el("p", q.topics || "연결 주제 없음", "quiet"),
        el("p", q.text, "retry-question"),
      );
      item.append(
        el(
          "p",
          `답안: ${{ empty: "미작성", draft: "작성 중", completed: "작성 완료" }[q.answer_status] || "미작성"}`,
          "quiet",
        ),
      );
      item.append(
        el("h3", "보완 메모"),
        el("p", q.note || "저장한 보완 메모가 없습니다.", "retry-note"),
      );
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
      $("retry-result").textContent =
        "최근 복습 저장 순서입니다. 문항을 열어도 다시 풀기 표시는 유지됩니다.";
    } catch (error) {
      $("retry-result").textContent =
        `불러오지 못했습니다. ${hasLoaded ? "이전 목록을 표시합니다. " : ""}새로고침으로 재시도하세요. ${error.message}`;
    } finally {
      loading = false;
      $("refresh-retry").disabled = false;
      render();
    }
  }
  $("retry-search").oninput = render;
  $("refresh-retry").onclick = load;
  return { load };
}
