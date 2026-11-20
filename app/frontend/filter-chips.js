// Applied conditions stay visible even when mobile filter controls are collapsed.
export function renderFilterChips(container, fields, onRemove) {
  container.replaceChildren();
  for (const { control, label } of fields) {
    if (!control.value.trim()) continue;
    const value = control.tagName === "SELECT"
      ? control.selectedOptions[0]?.textContent || control.value
      : control.value.trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = `${label}: ${value} ×`;
    button.setAttribute("aria-label", `${label}: ${value} 조건 해제`);
    button.onclick = () => {
      control.value = "";
      onRemove();
      // The removed chip no longer exists; keep keyboard focus in the toolbar.
      const next = container.querySelector("button");
      (next || container.closest("section, main").querySelector('input[type="search"]')).focus();
    };
    container.append(button);
  }
}
