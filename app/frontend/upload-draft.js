// Registration drafts belong to this browser tab, independently of study answers.
export function setupUploadDraft() {
  const $ = id => document.getElementById(id);
  const ids = ['session', 'number', 'new-question', 'page', 'topic-search', 'new-topic-title', 'new-domain'];
  const memory = new Map();
  let key = '', baseline = '', candidate = '';
  const value = () => Object.fromEntries(ids.map(id => [id, $(id).value]));
  const dirty = () => !!key && JSON.stringify(value()) !== baseline;
  function stash() {
    if (!dirty()) return;
    const data = value(); memory.set(key, data);
    try { sessionStorage.setItem(key, JSON.stringify(data)); }
    catch { $('question-result').textContent = '임시 보관 실패 · 화면을 닫기 전 내용을 복사하세요.'; }
  }
  function changed(event) {
    if (event.target.id === 'reviewed') return;
    $('reviewed').checked = false;
    stash();
  }
  $('question-form').addEventListener('input', changed);
  $('question-form').addEventListener('change', changed);
  window.addEventListener('beforeunload', event => {
    if (!dirty()) return;
    stash(); event.preventDefault(); event.returnValue = '';
  });
  return {
    value,
    stash,
    allowReplace() { stash(); return !dirty() || window.confirm('작성 중인 등록 내용을 바꾸시겠습니까? 시험지별 마지막 초안은 이 탭에 임시 보관됩니다.'); },
    open(attachment) {
      key = 'peim:registration:' + attachment;
      baseline = JSON.stringify(value()); candidate = '';
      let data = memory.get(key);
      try { data ||= JSON.parse(sessionStorage.getItem(key) || 'null'); } catch {}
      if (data && typeof data === 'object') {
        for (const id of ids) if (typeof data[id] === 'string') $(id).value = data[id];
        $('reviewed').checked = false;
        $('question-result').textContent = '등록 초안 복구됨 · 원본 대조 필요';
      }
    },
    candidate() { return candidate; },
    acceptCandidate() { candidate = $('candidates').value; stash(); },
    saved(submitted) {
      baseline = JSON.stringify(submitted);
      if (dirty()) { stash(); return; }
      memory.delete(key);
      try { sessionStorage.removeItem(key); } catch {}
    },
  };
}
