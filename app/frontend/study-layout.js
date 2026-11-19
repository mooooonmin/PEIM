const $ = (id) => document.getElementById(id);

export function setupStudyLayout() {
  const writing = document.querySelector(".writing");
  const buttons = [...document.querySelectorAll("[data-study-mode]")];
  let currentId;
  function mode(value) {
    if (!["write", "compare", "review"].includes(value)) return;
    writing.dataset.mode = value;
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
      writing.classList.remove("question-collapsed");
      $("toggle-question").setAttribute("aria-expanded", "true");
      $("toggle-question").textContent = "문제 접기";
    },
  };
}
