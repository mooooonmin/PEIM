const key = 'peim:study-session';
const fields = ['mode', 'topic', 'exam', 'search', 'q', 'queue'];
export function readStudySession() {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (typeof value?.query !== 'string' || value.query.length > 8192) return null;
    return {query:value.query, retryIds:Array.isArray(value.retryIds) ? value.retryIds.filter(id => typeof id === 'string').slice(0,10000) : []};
  } catch { return null; }
}
export function rememberStudySession(params, retryIds = []) {
  const query = new URLSearchParams();
  for (const name of fields) if (params.has(name)) query.set(name, params.get(name));
  try { localStorage.setItem(key, JSON.stringify({query:query.toString(), retryIds})); } catch { /* Study remains usable without browser storage. */ }
}
