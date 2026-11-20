// Snapshot keys are immutable: deleting an acknowledged snapshot cannot delete
// a newer write from another tab. The legacy key remains a compatibility mirror.
export function createDraftStore(storage) {
  const get = () => storage || localStorage;
  const own = new Map();
  const encode = value => JSON.stringify(value);
  function records(key) {
    const result = [];
    for (let i = 0; i < get().length; i++) {
      const name = get().key(i);
      if (!name?.startsWith(key + ":snapshot:")) continue;
      try {
        const record = JSON.parse(get().getItem(name));
        if (record && typeof record.value === "object") result.push({ ...record, key: name });
      } catch { /* Leave unreadable drafts untouched. */ }
    }
    const raw = get().getItem(key);
    if (raw && !result.some(r => encode(r.value) === raw)) {
      try { result.push({ key, value: JSON.parse(raw), at: 0 }); } catch {}
    }
    return result.sort((a, b) => b.at - a.at);
  }
  function snapshot(key, value, archived = false) {
    const name = key + ":snapshot:" + crypto.randomUUID();
    get().setItem(name, encode({ value, at: Date.now(), archived }));
    return name;
  }
  return {
    records,
    read(key) {
      const items = records(key).filter(r => !r.archived);
      const mirror = get().getItem(key);
      return (items.find(r => r.key === own.get(key)) || items.find(r => encode(r.value) === mirror) || items[0])?.value || null;
    },
    write(key, value) {
      // Preserve a legacy-only draft before updating the compatibility mirror.
      const legacy = records(key).find(r => r.key === key);
      if (legacy) snapshot(key, legacy.value);
      const previous = own.get(key);
      own.set(key, snapshot(key, value));
      if (previous) get().removeItem(previous);
      get().setItem(key, encode(value));
    },
    clear(key, value) {
      for (const record of records(key)) {
        if (record.key !== key && encode(record.value) === encode(value))
          get().removeItem(record.key);
      }
      if (get().getItem(key) === encode(value)) get().removeItem(key);
    },
    archive(key, value) {
      // Explicit reload is not a server acknowledgement of this draft.
      // Keep a downloadable copy and never discard another tab's snapshot.
      snapshot(key, value, true);
      const previous = own.get(key);
      if (previous) get().removeItem(previous);
      own.delete(key);
      if (get().getItem(key) === encode(value)) get().removeItem(key);
    },
  };
}

export function renderDraftCopies(container, store, key) {
  try {
    const records = key ? store.records(key) : [];
    container.hidden = !records.length;
    container.querySelector("summary").textContent = `보관된 임시 글 ${records.length}개`;
    const list = container.querySelector("div");
    list.replaceChildren();
    for (const record of records) {
      const value = record.value;
      const text = typeof value.body === "string" ? value.body :
        `${value.note || ""}\n\n다시 풀기: ${value.retry_requested ? "예" : "아니오"}`;
      const detail = document.createElement("details"), title = document.createElement("summary");
      title.textContent = (record.at ? new Date(record.at).toLocaleString("ko-KR") : "기존 임시 글") + " · " + text.slice(0,40);
      const body = document.createElement("pre"); body.textContent = text;
      const download = document.createElement("button");
      download.type = "button"; download.textContent = "이 임시 글 내려받기";
      download.onclick = () => {
        const url = URL.createObjectURL(new Blob([text], {type:"text/plain;charset=utf-8"}));
        const a = document.createElement("a"); a.href = url; a.download = "PEIM-임시글.txt"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      detail.append(title, body, download); list.append(detail);
    }
  } catch { /* Recovery controls must not interrupt editing if storage is blocked. */ }
}
