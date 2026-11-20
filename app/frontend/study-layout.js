const $ = (id) => document.getElementById(id);

export function setupStudyLayout() {
  const writing = document.querySelector(".writing");
  const buttons = [...document.querySelectorAll("[data-study-mode]")];
  let currentId, compareSide = "reference", notesOpen = false, restoreSequence = 0;
  const positions = { answer: 0, "learning-reference": 0, "writing-guide": 0 };
  function remember() {
    for (const id of Object.keys(positions)) {
      const node = $(id);
      if (node.getClientRects().length) positions[id] = node.scrollTop;
    }
  }
  function restore() {
    const seq = ++restoreSequence;
    document.defaultView.requestAnimationFrame(() => {
      if (seq !== restoreSequence) return;
      for (const id of Object.keys(positions)) $(id).scrollTop = positions[id];
    });
  }
  function compareState() {
    writing.dataset.compareSide = compareSide;
    writing.dataset.compareNotes = String(notesOpen);
    $("compare-mine").setAttribute("aria-pressed", String(compareSide === "mine"));
    $("compare-reference").setAttribute("aria-pressed", String(compareSide === "reference"));
    $("toggle-compare-note").setAttribute("aria-expanded", String(notesOpen));
    $("toggle-compare-note").textContent = notesOpen ? "보완 메모 접기" : "보완 메모 펼치기";
  }
  for (const [id, side] of [["compare-mine", "mine"], ["compare-reference", "reference"]])
    $(id).onclick = () => {
      remember();
      compareSide = side;
      compareState();
      restore();
    };
  $("toggle-compare-note").onclick = () => {
    remember();
    notesOpen = !notesOpen;
    compareState();
    restore();
  };
  compareState();
  for (const id of ["learning-topic", "learning-variant", "reload-reference"])
    $(id).addEventListener(id === "reload-reference" ? "click" : "change", () => {
      positions["learning-reference"] = 0;
      $("learning-reference").scrollTop = 0;
    });
  function mode(value) {
    if (!["write", "compare", "review"].includes(value)) return;
    remember();
    writing.dataset.mode = value;
    restore();
    document.body.dataset.studyMode = value;
    for (const button of buttons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.studyMode === value),
      );
  }
  for (const button of buttons)
    button.onclick = () => mode(button.dataset.studyMode);
  $("toggle-question").onclick = () => {
    const collapsed = writing.classList.toggle("question-collapsed");
    $("toggle-question").setAttribute("aria-expanded", String(!collapsed));
    $("toggle-question").textContent = collapsed ? "문제 펼치기" : "문제 접기";
  };
  mode("write");
  return {
    mode,
    question(id) {
      for (const button of buttons) button.disabled = !id;
      if (id === currentId) return;
      currentId = id;
      mode("write");
      positions.answer = positions["learning-reference"] = positions["writing-guide"] = 0;
      compareSide = "reference";
      notesOpen = false;
      compareState();
      restore();
      writing.classList.remove("question-collapsed");
      $("toggle-question").setAttribute("aria-expanded", "true");
      $("toggle-question").textContent = "문제 접기";
    },
  };
}
