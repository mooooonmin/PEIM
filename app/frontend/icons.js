const paths = {
  previous: 'm14 6-6 6 6 6', next: 'm10 6 6 6-6 6', close: 'm6 6 12 12M18 6 6 18',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  file: 'M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h8',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
  focus: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  note: 'M5 3h14v14l-4 4H5ZM14 21v-5h5M8 8h8M8 12h6',
  collapse: 'm6 15 6-6 6 6', expand: 'm6 9 6 6 6-6',
  fit: 'M4 4v16M20 4v16M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4',
  zoom: 'M16 16l5 5M10 6v8M6 10h8M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  filter: 'M4 6h16M7 12h10M10 18h4', edit: 'm15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z',
};

export function setIconLabel(button, label, icon = button.dataset.icon) {
  if (!icon) { button.textContent = label; return; }
  button.dataset.icon = icon;
  button.classList.add('icon-control');
  button.setAttribute('aria-label', label);
  button.title = label;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[icon]);
  svg.append(path);
  button.replaceChildren(svg);
}

export function setupIcons() {
  document.querySelectorAll('[data-icon]').forEach(button =>
    setIconLabel(button, button.getAttribute('aria-label') || button.textContent.trim().replace(/\s+/g, ' ')));
}
