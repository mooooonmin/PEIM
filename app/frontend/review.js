import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
GlobalWorkerOptions.workerSrc = "/assets/pdf-worker.js";
const $ = (id) => document.getElementById(id);
const states = {
  unverified: "미확인",
  verified: "확인 완료",
  needs_review: "재검토 필요",
};
function node(tag, text) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
}
export function setupQuestionReview({ api, refreshed }) {
  let question,
    topics = [],
    selected = new Set(),
    changed = false,
    busy = false,
    opening = false;
  let queue = [];
  const dialog = $("question-review-dialog");
  function navigationState() {
    const index = queue.indexOf(question?.id);
    const locked = busy || opening;
    $("review-previous").disabled = locked || index <= 0;
    $("review-next").disabled =
      locked || index < 0 || index >= queue.length - 1;
    $("save-review-next").disabled = $("review-next").disabled;
    $("save-question-review").disabled = locked;
    $("close-question-review").disabled = locked;
    $("review-position").textContent =
      index < 0
        ? "문항을 불러오는 중입니다."
        : `선택 목록 ${index + 1} / ${queue.length}문항 — ${states[question.data.verification_status] || "미확인"}`;
  }
  function freezeFields() {
    const controls = [
      ...dialog.querySelectorAll("input,textarea,select"),
    ].filter((el) => !el.disabled);
    controls.forEach((el) => (el.disabled = true));
    return () => controls.forEach((el) => (el.disabled = false));
  }
  function selectPane(name) {
    dialog.dataset.pane = name;
    dialog.querySelectorAll("[data-review-tab]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.reviewTab === name),
      );
    });
    if (name === "history") $("review-history-pane").open = true;
  }
  dialog.querySelectorAll("[data-review-tab]").forEach((button) => {
    button.onclick = () => selectPane(button.dataset.reviewTab);
  });
  // Reveal invalid fields before native form validation attempts to focus them.
  $("edit-question-form").addEventListener(
    "invalid",
    () => selectPane("edit"),
    true,
  );
  function topicList() {
    const query = $("edit-topic-filter").value.trim().toLowerCase();
    $("edit-topics").replaceChildren();
    for (const t of topics
      .filter(
        (t) => selected.has(t.id) || t.title.toLowerCase().includes(query),
      )
      .sort(
        (a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)),
      )) {
      const label = node("label"),
        input = node("input");
      input.type = "checkbox";
      input.checked = selected.has(t.id);
      input.onchange = () => {
        input.checked ? selected.add(t.id) : selected.delete(t.id);
        changed = true;
        topicList();
      };
      label.append(input, node("span", t.title));
      $("edit-topics").append(label);
    }
    $("edit-topic-count").textContent = `${selected.size}개 주제 선택`;
  }
  let pdfTask = null,
    pdfDocument = null,
    pdfRender = null,
    previewSequence = 0,
    pdfPage = 1,
    zoom = 100;
  function setZoom(value) {
    zoom = Math.max(50, Math.min(250, value));
    $("review-pdf-canvas").style.width = `${zoom}%`;
    $("pdf-zoom-state").textContent = zoom === 100 ? "너비 맞춤" : `${zoom}%`;
    $("pdf-zoom-out").disabled = zoom === 50;
    $("pdf-zoom-in").disabled = zoom === 250;
  }
  $("pdf-zoom-out").onclick = () => setZoom(zoom - 25);
  $("pdf-zoom-in").onclick = () => setZoom(zoom + 25);
  $("pdf-fit").onclick = () => setZoom(100);
  function clearPreview() {
    previewSequence++;
    if (pdfRender) pdfRender.cancel();
    pdfRender = null;
    if (pdfTask) void pdfTask.destroy();
    pdfTask = null;
    pdfDocument = null;
    $("review-pdf").hidden = true;
  }
  async function renderPage(sequence) {
    if (pdfRender) {
      const pending = pdfRender;
      pending.cancel();
      try {
        await pending.promise;
      } catch {}
    }
    if (sequence !== previewSequence || !pdfDocument) return;
    const page = await pdfDocument.getPage(pdfPage);
    if (sequence !== previewSequence) return;
    const canvas = $("review-pdf-canvas"),
      view = page.getViewport({ scale: 2 });
    canvas.width = view.width;
    canvas.height = view.height;
    pdfRender = page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: view,
    });
    await pdfRender.promise;
    if (sequence !== previewSequence) return;
    $("pdf-page-state").textContent =
      `${pdfPage} / ${pdfDocument.numPages}페이지`;
    $("pdf-previous").disabled = pdfPage <= 1;
    $("pdf-next").disabled = pdfPage >= pdfDocument.numPages;
  }
  async function preview() {
    clearPreview();
    const sequence = previewSequence;
    const s = question.sources.find(
      (s) => s.id === $("review-source-select").value,
    );
    $("review-source-link").hidden = !s;
    if (!s) {
      $("review-preview-note").textContent =
        "연결된 원본이 없습니다. 확인 완료로 저장할 수 없습니다.";
      return;
    }
    const fields = [...$("edit-source-pages").children].find(
      (e) => e.dataset.id === s.id,
    );
    const page = Number(fields.querySelector("input").value) || 1;
    const url = `/api/attachments/${encodeURIComponent(s.id)}/file`;
    $("review-source-link").href = url + "#page=" + page;
    if (s.format !== "pdf") {
      $("review-preview-note").textContent =
        "HWP는 내려받아 대조해 주세요. 페이지 연결은 PDF만 지원합니다.";
      return;
    }
    $("review-preview-note").textContent = "PDF를 불러오는 중입니다.";
    try {
      pdfTask = getDocument({
        url,
        cMapUrl: "/assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/assets/standard_fonts/",
        useWasm: false,
        isEvalSupported: false,
      });
      const loaded = await pdfTask.promise;
      if (sequence !== previewSequence) return;
      pdfDocument = loaded;
      pdfPage = Math.max(1, Math.min(page, loaded.numPages));
      $("review-pdf").hidden = false;
      await renderPage(sequence);
      if (sequence === previewSequence)
        $("review-preview-note").textContent =
          "원본 PDF입니다. 페이지 이동은 입력한 출처 페이지를 바꾸지 않습니다.";
    } catch (error) {
      if (
        sequence === previewSequence &&
        error.name !== "RenderingCancelledException"
      ) {
        $("review-preview-note").textContent =
          "PDF를 표시하지 못했습니다. 원본을 별도 창으로 열어 확인해 주세요.";
        $("review-pdf").hidden = true;
      }
    }
  }
  for (const [id, step] of [
    ["pdf-previous", -1],
    ["pdf-next", 1],
  ])
    $(id).onclick = async () => {
      if (!pdfDocument) return;
      $("pdf-previous").disabled = true;
      $("pdf-next").disabled = true;
      pdfPage = Math.max(1, Math.min(pdfPage + step, pdfDocument.numPages));
      try {
        await renderPage(previewSequence);
      } catch (error) {
        if (error.name !== "RenderingCancelledException")
          $("review-preview-note").textContent =
            "페이지 표시 실패. 원본을 별도 창으로 확인해 주세요.";
      }
    };
  async function history() {
    const id = question.id;
    const list = await api(`/questions/${encodeURIComponent(id)}/reviews`);
    if (!dialog.open || question.id !== id) return;
    $("question-review-history").replaceChildren();
    if (!list.length)
      $("question-review-history").textContent = "아직 수정 이력이 없습니다.";
    function describe(snapshot) {
      return `${snapshot.text}\n\n주제: ${snapshot.topics.map((t) => t.title).join(", ")}\n상태: ${states[snapshot.data.verification_status] || "미확인"}\n원본: ${snapshot.sources.map((s) => s.attachment_id + " " + (s.data.page_start ? s.data.page_start + "~" + s.data.page_end + "페이지" : "페이지 미확인")).join(", ")}`;
    }
    for (const item of list) {
      const d = node("details");
      d.append(
        node(
          "summary",
          `${item.revision}차 수정 · ${new Date(item.saved_at).toLocaleString("ko-KR")} · ${item.reviewer}`,
        ),
        node("h3", "변경 전"),
        node("pre", describe(item.before_data)),
        node("h3", "변경 후"),
        node("pre", describe(item.after_data)),
      );
      $("question-review-history").append(d);
    }
  }
  function fill() {
    $("edit-question-text").value = question.text;
    selected = new Set(question.topics.map((t) => t.id));
    $("edit-topic-filter").value = "";
    topicList();
    $("review-identity").textContent =
      `${question.round}회 / ${question.session}교시 / ${question.number}번 · 문항 ID와 내 답안은 유지됩니다.`;
    $("edit-verification").value = states[question.data.verification_status]
      ? question.data.verification_status
      : "unverified";
    $("edit-confirmed").checked = false;
    $("review-source-select").replaceChildren();
    $("edit-source-pages").replaceChildren();
    for (const s of question.sources) {
      const o = node("option", s.format.toUpperCase() + " · " + s.id);
      o.value = s.id;
      $("review-source-select").append(o);
      const row = node("div");
      row.dataset.id = s.id;
      row.append(node("p", s.format.toUpperCase() + " · " + s.id));
      for (const [key, label] of [
        ["page_start", "시작 페이지"],
        ["page_end", "끝 페이지"],
      ]) {
        const l = node("label", label),
          input = node("input");
        input.type = "number";
        input.min = "1";
        input.value = s.data[key] ?? "";
        input.disabled = s.format !== "pdf";
        input.dataset.key = key;
        input.onchange = preview;
        l.append(input);
        row.append(l);
      }
      $("edit-source-pages").append(row);
    }
    preview();
    changed = false;
  }
  async function loadQuestion(id) {
    opening = true;
    navigationState();
    const restore = freezeFields();
    try {
      const [nextQuestion, navigation] = await Promise.all([
        api(`/questions/${encodeURIComponent(id)}`),
        api("/navigation"),
      ]);
      question = nextQuestion;
      topics = navigation.topics;
      restore();
      setZoom(100);
      fill();
      selectPane("edit");
      $("review-history-pane").open = false;
      $("edit-question-result").textContent = "";
      $("edit-question-form").scrollTop = 0;
      $("review-source-pane").scrollTop = 0;
      $("question-review-history").textContent = "이력을 불러오는 중입니다.";
      if (!dialog.open) dialog.showModal();
      try {
        await history();
      } catch {
        $("question-review-history").textContent =
          "이력을 불러오지 못했습니다. 문항을 다시 열어 확인해 주세요.";
      }
      return true;
    } catch (e) {
      if (dialog.open)
        $("edit-question-result").textContent =
          `문항 이동 실패: ${e.message} 현재 입력은 유지됩니다.`;
      else {
        $("global-error").hidden = false;
        $("global-error").textContent = e.message;
      }
      return false;
    } finally {
      restore();
      opening = false;
      navigationState();
    }
  }
  const open = async (id, ids = [id]) => {
    if (opening || dialog.open) return;
    queue = [...new Set(ids)];
    if (!queue.includes(id)) queue = [id];
    await loadQuestion(id);
  };
  async function move(step) {
    if (busy || opening) return;
    const id = queue[queue.indexOf(question.id) + step];
    if (!id) return;
    if (
      changed &&
      !confirm("저장하지 않은 수정 내용을 버리고 다른 문항으로 이동할까요?")
    )
      return;
    await loadQuestion(id);
  }
  $("review-previous").onclick = () => move(-1);
  $("review-next").onclick = () => move(1);
  $("edit-topic-filter").oninput = topicList;
  $("review-source-select").onchange = preview;
  $("edit-question-form").oninput = (e) => {
    if (e.target.id !== "edit-topic-filter") {
      changed = true;
      if (e.target.id !== "edit-confirmed") $("edit-confirmed").checked = false;
    }
  };
  function close() {
    if (busy || opening) return;
    if (changed && !confirm("저장하지 않은 문항 수정 내용을 버리고 닫을까요?"))
      return;
    dialog.close();
    clearPreview();
  }
  $("close-question-review").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dialog.open && (changed || busy)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  $("edit-question-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy || opening) return;
    const nextId =
      e.submitter?.id === "save-review-next"
        ? queue[queue.indexOf(question.id) + 1]
        : null;
    let advance = false;
    const payload = {
      revision: question.data.review_revision || 0,
      text: $("edit-question-text").value,
      topic_ids: [...selected],
      verification_status: $("edit-verification").value,
      confirmed: $("edit-confirmed").checked,
      sources: [...$("edit-source-pages").children].map((row) => ({
        attachment_id: row.dataset.id,
        ...Object.fromEntries(
          [...row.querySelectorAll("input")].map((i) => [
            i.dataset.key,
            i.value ? Number(i.value) : null,
          ]),
        ),
      })),
    };
    busy = true;
    navigationState();
    // Freeze fields so a successful response cannot replace input typed while saving.
    const restore = freezeFields();
    $("edit-question-result").textContent = "저장 중…";
    try {
      const result = await api(
        `/questions/${encodeURIComponent(question.id)}/review`,
        { method: "PUT", body: JSON.stringify(payload) },
      );
      question.data.review_revision = result.revision;
      question.data.verification_status = payload.verification_status;
      changed = false;
      $("edit-question-result").textContent =
        "저장했습니다. 문항 ID와 내 답안은 유지됩니다.";
      try {
        await refreshed(question.id);
        await history();
        advance = Boolean(nextId);
      } catch {
        $("edit-question-result").textContent =
          "저장했습니다. 화면 갱신에 실패했으므로 닫고 다시 열어 확인해 주세요.";
      }
    } catch (error) {
      $("edit-question-result").textContent = error.message;
    } finally {
      busy = false;
      restore();
      navigationState();
    }
    if (advance) {
      const moved = await loadQuestion(nextId);
      if (moved)
        $("edit-question-result").textContent =
          "이전 문항을 저장하고 다음 문항으로 이동했습니다.";
      else
        $("edit-question-result").textContent =
          "저장은 완료했지만 다음 문항을 불러오지 못했습니다. 다음 문항 버튼으로 다시 시도하세요.";
    }
  };
  return open;
}
