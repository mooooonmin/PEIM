import DOMPurify from 'dompurify';
import { marked, Renderer } from 'marked';
const $ = (id) => document.getElementById(id);
const node = (tag, text) => {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
};
export function setupWritingGuide({ api }) {
  let question, sequence = 0;
  const positions = { guide: 0, detail: 0 };
  let selected = 'guide';
  function select(value) {
    const old = selected === 'guide' ? $('writing-guide') : $('learning-reference');
    positions[selected] = old.scrollTop;
    selected = value;
    $('writing-guide').hidden = value !== 'guide';
    $('topic-detail-controls').hidden = value !== 'detail';
    $('learning-reference').hidden = value !== 'detail';
    $('material-guide').setAttribute('aria-pressed', String(value === 'guide'));
    $('material-detail').setAttribute('aria-pressed', String(value === 'detail'));
    const target = value === 'guide' ? $('writing-guide') : $('learning-reference');
    target.scrollTop = positions[value];
  }
  $('material-guide').onclick = () => select('guide');
  $('material-detail').onclick = () => select('detail');
  async function load() {
    const seq = ++sequence;
    const target = $('writing-guide');
    target.replaceChildren(node('p', '문항별 작성 가이드를 불러오는 중입니다.'));
    if (!question) return;
    try {
      const data = await api(`/questions/${encodeURIComponent(question.id)}/writing-guide`);
      if (seq !== sequence) return;
      const fragment = document.createDocumentFragment();
      fragment.append(node('p', data.notice));
      function list(title, items, ordered = false) {
        fragment.append(node('h3', title));
        const ul = document.createElement(ordered ? 'ol' : 'ul');
        for (const item of items) ul.append(node('li', item));
        fragment.append(ul);
      }
      list('문제 요구사항', data.requirements);
      list('작성 목차', data.outline.map(item => `${item.title} — ${item.hint}`), true);
      list(data.kind === 'example' ? '필수 키워드' : '출제어·연결 주제 (검토할 후보)', data.keywords);
      const example = document.createElement('details');
      example.append(node('summary', '문항별 작성 예시'));
      if (data.example) {
        example.append(node('p', data.provenance));
        const body = document.createElement('div');
        const renderer = new Renderer();
        renderer.html = ({ text }) => node('span', text).innerHTML;
        body.innerHTML = DOMPurify.sanitize(marked.parse(data.example, { renderer }));
        example.append(body);
      } else example.append(node('p', '등록된 작성 예시가 없습니다. 위 작성 틀과 주제 상세 해설을 활용하세요.'));
      fragment.append(example, node('h3', '자가 점검'), node('p', '체크는 현재 문항을 보는 동안만 유지됩니다. 남길 내용은 보완 메모에 기록하세요.'));
      for (const item of data.checklist) {
        const label = document.createElement('label');
        label.className = 'guide-check';
        const check = document.createElement('input');
        check.type = 'checkbox';
        label.append(check, document.createTextNode(item));
        fragment.append(label);
      }
      target.replaceChildren(fragment);
    } catch (error) {
      if (seq !== sequence) return;
      const retry = node('button', '작성 가이드 다시 불러오기');
      retry.onclick = load;
      target.replaceChildren(node('p', `가이드를 불러오지 못했습니다. ${error.message}`), retry);
    }
  }
  return { select, async open(q) {
    question = q;
    positions.guide = positions.detail = 0;
    $('writing-guide').scrollTop = $('learning-reference').scrollTop = 0;
    select('guide');
    await load();
  }};
}
