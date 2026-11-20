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
  const positions = { guide: 0, detail: 0, example: 0 };
  const pane = value => $(value === 'guide' ? 'writing-guide' : value === 'example' ? 'writing-example' : 'learning-reference');
  let selected = 'guide';
  function select(value) {
    const old = pane(selected);
    positions[selected] = old.scrollTop;
    selected = value;
    $('writing-example').hidden = value !== 'example';
    $('material-example').setAttribute('aria-pressed', String(value === 'example'));
    $('writing-guide').hidden = value !== 'guide';
    $('topic-detail-controls').hidden = value !== 'detail';
    $('learning-reference').hidden = value !== 'detail';
    $('material-guide').setAttribute('aria-pressed', String(value === 'guide'));
    $('material-detail').setAttribute('aria-pressed', String(value === 'detail'));
    const target = pane(value);
    target.scrollTop = positions[value];
  }
  $('material-guide').onclick = () => select('guide');
  $('material-example').onclick = () => select('example');
  $('material-detail').onclick = () => select('detail');
  async function load() {
    const seq = ++sequence;
    const target = $('writing-guide');
    $('writing-example').replaceChildren(node('p', '작성 예시를 불러오는 중입니다.'));
    target.replaceChildren(node('p', '문항별 작성 가이드를 불러오는 중입니다.'));
    if (!question) return;
    try {
      const data = await api(`/questions/${encodeURIComponent(question.id)}/writing-guide`);
      if (seq !== sequence) return;
      const fragment = document.createDocumentFragment();
      const notice = node('p', data.kind === 'example' ? '문항별 작성 예시 · 비공식' : '자동 작성 틀 · 비공식');
      notice.className = 'quiet';
      notice.title = data.notice;
      fragment.append(notice);
      function list(title, items, ordered = false) {
        fragment.append(node('h3', title));
        const ul = document.createElement(ordered ? 'ol' : 'ul');
        for (const item of items) ul.append(node('li', item));
        fragment.append(ul);
      }
      list('문제 요구사항', data.requirements);
      list('작성 목차', data.outline.map(item => `${item.title} — ${item.hint}`), true);
      list(data.kind === 'example' ? '필수 키워드' : '출제어·연결 주제 (검토할 후보)', data.keywords);
      const example = document.createElement('section');
      if (data.example) {
        example.append(node('p', data.provenance));
        const body = document.createElement('div');
        const renderer = new Renderer();
        renderer.html = ({ text }) => node('span', text).innerHTML;
        body.innerHTML = DOMPurify.sanitize(marked.parse(data.example, { renderer }));
        example.append(body);
      } else example.append(node('p', '등록된 작성 예시가 없습니다. 작성 가이드 탭과 주제 상세 해설을 활용하세요.'));
      $('writing-example').replaceChildren(example);
      fragment.append(node('h3', '자가 점검 (저장 안 됨)'));
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
      $('writing-example').textContent = '작성 예시를 불러오지 못했습니다. 작성 가이드에서 다시 불러와 주세요.';
      target.replaceChildren(node('p', `가이드를 불러오지 못했습니다. ${error.message}`), retry);
    }
  }
  return { select, async open(q) {
    question = q;
    positions.guide = positions.detail = positions.example = 0;
    $('writing-guide').scrollTop = $('learning-reference').scrollTop = $('writing-example').scrollTop = 0;
    select('guide');
    await load();
  }};
}
