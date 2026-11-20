import { setIconLabel } from "./icons.js";
const $ = (id) => document.getElementById(id);

export function setupStudyLayout() {
  const writing = document.querySelector(".writing");
  let currentId,
    side = "reference",
    notesOpen = false,
    frame = 0;
  const positions = {
    answer: 0,
    "learning-reference": 0,
    "writing-guide": 0,
    "writing-example": 0,
    "question-text": 0,
  };
  function remember() {
    for (const id of Object.keys(positions)) {
      const el = $(id);
      if (el.getClientRects().length) positions[id] = el.scrollTop;
    }
  }
  function restore() {
    const seq = ++frame;
    document.defaultView.requestAnimationFrame(() => {
      if (seq === frame)
        for (const id of Object.keys(positions))
          $(id).scrollTop = positions[id];
    });
  }
  function showSide(value) {
    remember();
    side = value;
    writing.dataset.compareSide = side;
    $("compare-mine").setAttribute("aria-pressed", String(side === "mine"));
    $("compare-reference").setAttribute(
      "aria-pressed",
      String(side === "reference"),
    );
    restore();
  }
  function notes(open) {
    remember();
    notesOpen = open;
    $("learning-form").hidden = !open;
    $("toggle-compare-note").setAttribute("aria-expanded", String(open));
    setIconLabel($("toggle-compare-note"), open ? "보완 메모 접기" : "보완 메모 펼치기");
    restore();
  }
  function drawer(open) {
    $("question-drawer").hidden = !open;
    $("toggle-question-list").setAttribute("aria-expanded", String(open));
  }
  $("toggle-question-list").onclick = () => drawer($("question-drawer").hidden);
  $("toggle-compare-note").onclick = () => notes(!notesOpen);
  $("compare-mine").onclick = () => showSide("mine");
  $("compare-reference").onclick = () => showSide("reference");
  $("toggle-question").onclick = () => {
    const collapsed = writing.classList.toggle("question-collapsed");
    $("toggle-question").setAttribute("aria-expanded", String(!collapsed));
    setIconLabel($("toggle-question"), collapsed ? "문제 펼치기" : "문제 접기", collapsed ? "expand" : "collapse");
  };
  for (const id of ["learning-topic", "learning-variant", "reload-reference"])
    $(id).addEventListener(
      id === "reload-reference" ? "click" : "change",
      () => {
        positions["learning-reference"] = 0;
        $("learning-reference").scrollTop = 0;
      },
    );
  showSide("reference");
  notes(false);
  return {
    drawer,
    question(id) {
      if (id === currentId) return;
      currentId = id;
      for (const key of Object.keys(positions)) {
        positions[key] = 0;
        $(key).scrollTop = 0;
      }
      showSide("reference");
      notes(false);
      writing.classList.remove("question-collapsed");
      $("toggle-question").setAttribute("aria-expanded", "true");
      setIconLabel($("toggle-question"), "문제 접기", "collapse");
    },
  };
}

export function setupStudyNavigation({ select }) {
  let rows = [],
    currentId,
    busy = false;
  function update(nextRows = rows, id = currentId) {
    rows = nextRows;
    currentId = id;
    const index = rows.findIndex((q) => q.id === currentId);
    $("previous-question").disabled = busy || index <= 0;
    $("next-question").disabled = busy || index < 0 || index >= rows.length - 1;
    $("study-position").textContent =
      index < 0 ? "" : `${index + 1} / ${rows.length}`;
  }
  for (const [id, step] of [
    ["previous-question", -1],
    ["next-question", 1],
  ])
    $(id).onclick = async () => {
      if (busy) return;
      const index = rows.findIndex((q) => q.id === currentId),
        target = rows[index + step];
      if (index < 0 || !target) return;
      busy = true;
      update();
      try {
        await select(target.id);
      } finally {
        busy = false;
        update();
      }
    };
  return { update };
}
