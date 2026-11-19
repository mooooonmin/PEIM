const $ = (id) => document.getElementById(id);

export function setupLearning({ api, renderMarkdown, cancelRender, saved }) {
  const panel = $("learning-panel");
  let question,
    revision = 0,
    dirty = false,
    busy = false,
    loaded = false;
  let generation = 0,
    referenceSequence = 0,
    answers = [];
  const draftKey = () => `peim:learning:${question.id}`;
  const payload = () => ({
    note: $("learning-note").value,
    retry_requested: $("learning-retry").checked,
    revision,
  });
  function message(value) {
    $("learning-result").textContent = value;
  }
  function controls() {
    $("learning-note").disabled = busy || !loaded;
    $("learning-retry").disabled = busy || !loaded;
    $("save-learning").disabled = busy || !loaded || !dirty;
    $("reload-learning").disabled = busy;
    $("review-state").textContent = !question
      ? "복습: 문항 선택 전"
      : busy
        ? "복습: 저장 중"
        : dirty
          ? "복습: 미저장"
          : !loaded
            ? "복습: 불러오기 확인 필요"
            : revision
              ? "복습: 저장됨"
              : "복습: 기록 없음";
  }
  function stash() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify(payload()));
      return true;
    } catch {
      message(
        "브라우저 임시 보관에 실패했습니다. 복습 저장 또는 메모 내려받기를 이용해 주세요.",
      );
      return false;
    }
  }
  function edited() {
    dirty = true;
    if (stash()) message("저장하지 않은 복습 내용이 있습니다.");
    controls();
  }
  $("learning-note").oninput = edited;
  $("learning-retry").onchange = edited;
  async function showReference() {
    const answer = answers.find(
      (item) => item.variant === $("learning-variant").value,
    );
    if (!answer) {
      $("learning-reference").textContent = "등록된 주제 참고 답안이 없습니다.";
      return;
    }
    try {
      await renderMarkdown(answer.body, $("learning-reference"));
    } catch {
      $("learning-reference").textContent =
        "참고 자료를 표시하지 못했습니다. 주제 다시 불러오기를 눌러 주세요.";
    }
  }
  async function loadReference() {
    const seq = ++referenceSequence;
    cancelRender();
    answers = [];
    $("learning-variant").replaceChildren();
    $("learning-variant").disabled = true;
    const tid = $("learning-topic").value;
    if (!tid) {
      $("learning-reference").textContent =
        "연결된 주제가 없습니다. 보완 메모는 작성할 수 있습니다.";
      return;
    }
    $("learning-reference").textContent = "참고 답안을 불러오는 중입니다.";
    try {
      const data = await api(`/topics/${encodeURIComponent(tid)}/reference`);
      if (seq !== referenceSequence || panel.hidden) return;
      answers = data.answers;
      for (const answer of answers) {
        const option = document.createElement("option");
        option.value = answer.variant;
        option.textContent = answer.variant === "short" ? "1교시형" : "서술형";
        $("learning-variant").append(option);
      }
      const preferred = question.session === 1 ? "short" : "long";
      if (answers.some((item) => item.variant === preferred))
        $("learning-variant").value = preferred;
      $("learning-variant").disabled = !answers.length;
      await showReference();
    } catch (error) {
      if (seq === referenceSequence && !panel.hidden)
        $("learning-reference").textContent =
          `참고 답안을 불러오지 못했습니다. ${error.message}`;
    }
  }
  $("learning-topic").onchange = loadReference;
  $("learning-variant").onchange = showReference;
  $("reload-reference").onclick = loadReference;
  async function loadNote(restoreDraft) {
    const seq = ++generation;
    loaded = false;
    controls();
    message("복습 정보를 불러오는 중입니다.");
    try {
      const data = await api(
        `/questions/${encodeURIComponent(question.id)}/learning`,
      );
      if (seq !== generation || panel.hidden) return;
      revision = data.revision;
      $("learning-note").value = data.note;
      $("learning-retry").checked = data.retry_requested;
      dirty = false;
      message(
        data.revision
          ? "저장된 복습 정보입니다."
          : "보완할 내용을 적고 다시 풀 문항을 표시해 보세요.",
      );
      if (restoreDraft) {
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey()) || "null");
          if (
            draft &&
            typeof draft.note === "string" &&
            typeof draft.retry_requested === "boolean" &&
            Number.isInteger(draft.revision) &&
            draft.revision >= 0 &&
            (draft.note !== data.note ||
              draft.retry_requested !== data.retry_requested)
          ) {
            $("learning-note").value = draft.note;
            $("learning-retry").checked = draft.retry_requested;
            revision = draft.revision;
            dirty = true;
            message(
              revision === data.revision
                ? "임시 보관한 메모를 복구했습니다. 복습 저장을 눌러 주세요."
                : "임시 메모와 서버 버전이 다릅니다. 메모를 내려받고 서버 내용을 다시 불러와 비교해 주세요.",
            );
          } else if (
            draft &&
            draft.note === data.note &&
            draft.retry_requested === data.retry_requested
          ) {
            localStorage.removeItem(draftKey());
          }
        } catch {
          /* Storage access is optional; server data stays available. */
        }
      }
      loaded = true;
      return true;
    } catch (error) {
      if (seq === generation && !panel.hidden)
        message(
          `복습 정보를 불러오지 못했습니다. 서버 내용 다시 불러오기로 재시도하세요. ${error.message}`,
        );
    } finally {
      if (seq === generation) controls();
    }
  }
  $("reload-learning").onclick = async () => {
    if (busy) return;
    if (
      dirty &&
      !confirm(
        "현재 메모를 서버 내용으로 바꿀까요? 필요한 메모는 먼저 내려받아 주세요.",
      )
    )
      return;
    const key = draftKey();
    const restored = await loadNote(false);
    if (restored) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  };
  $("download-learning").onclick = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          $("learning-note").value +
            `\n\n다시 풀기: ${$("learning-retry").checked ? "예" : "아니오"}`,
        ],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${question.id}-보완메모.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("learning-form").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !loaded || !dirty) return;
    const value = payload();
    busy = true;
    controls();
    message("복습 정보를 저장하는 중입니다.");
    try {
      const result = await api(
        `/questions/${encodeURIComponent(question.id)}/learning`,
        { method: "PUT", body: JSON.stringify(value) },
      );
      revision = result.revision;
      dirty = false;
      try {
        localStorage.removeItem(draftKey());
      } catch {}
      message("복습 정보를 저장했습니다. 내 답안과 저장 이력은 유지됩니다.");
      saved(question.id, result);
    } catch (error) {
      message(`저장하지 못했습니다. 입력 내용은 유지됩니다. ${error.message}`);
    } finally {
      busy = false;
      controls();
    }
  };
  window.addEventListener("beforeunload", (event) => {
    if (!panel.hidden && (dirty || busy)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const open = async (q) => {
    if (!open.canLeave()) return false;
    if (question?.id === q?.id && !panel.hidden) return true;
    generation++;
    referenceSequence++;
    cancelRender();
    panel.hidden = !q;
    if (!q) {
      question = null;
      dirty = false;
      controls();
      return true;
    }
    question = q;
    dirty = false;
    loaded = false;
    revision = 0;
    $("learning-note").value = "";
    $("learning-retry").checked = false;
    $("learning-topic").replaceChildren();
    for (const topic of q.topics) {
      const option = document.createElement("option");
      option.value = topic.id;
      option.textContent = topic.title;
      $("learning-topic").append(option);
    }
    $("learning-topic").disabled = !q.topics.length;
    await Promise.all([loadNote(true), loadReference()]);
    return true;
  };
  open.canLeave = () => {
    if (busy) {
      message("복습 저장이 끝난 뒤 이동해 주세요.");
      return false;
    }
    if (dirty && !stash()) return false;
    return true;
  };
  return open;
}
