import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
const window = new Window({url:'http://localhost:8000'});
globalThis.window=window; globalThis.document=window.document;
const {setupWritingGuide}=await import('../app/frontend/writing-guide.js');
const html=await readFile('app/static/index.html','utf8');
const data=(name)=>({kind:'example',notice:'학습용 예시',requirements:[name],outline:[{title:name,hint:'정의'}],keywords:['핵심'],checklist:['확인'],example:'## 예시\n<script>alert(1)</script>본문',provenance:'전문가 검수 전'});
function fixture(api){ document.body.innerHTML=html; return setupWritingGuide({api}); }
const $=(id)=>document.getElementById(id);
test('guide separates details, sanitizes examples and preserves editor/note/checks when switching',async()=>{
 const calls=[]; const guide=fixture(async(path)=>{calls.push(path);return data('<b>요구사항</b>')});
 $('answer').value='작성 중'; $('learning-note').value='메모';
 await guide.open({id:'q1'}); assert.ok($('writing-guide').textContent.includes('<b>요구사항</b>'));
 assert.equal(Boolean($('writing-guide').querySelector('script')),false);
 assert.equal(Boolean($('writing-guide').querySelector('b')),false);
 const check=$('writing-guide').querySelector('input');check.checked=true;
 $('writing-guide').scrollTop=180; guide.select('detail'); assert.equal($('writing-guide').hidden,true);assert.equal($('learning-reference').hidden,false);
 $('learning-reference').scrollTop=90;guide.select('guide');
 assert.equal($('writing-guide').scrollTop,180);assert.equal(check.checked,true);
 assert.equal($('answer').value,'작성 중');assert.equal($('learning-note').value,'메모');
 assert.deepEqual(calls,['/questions/q1/writing-guide']);
 await guide.open({id:'q2'}); assert.equal($('writing-guide').querySelector('input').checked,false);
});
test('late guide responses cannot replace a different question or a cleared workspace',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);
 const guide=fixture(async(path)=>path.includes('q1')?pending:data('새 문항'));
 const first=guide.open({id:'q1'});await guide.open({id:'q2'}); resolve(data('옛 문항'));await first;
 assert.ok($('writing-guide').textContent.includes('새 문항'));assert.ok(!$('writing-guide').textContent.includes('옛 문항'));
 await guide.open(null);assert.ok(!$('writing-guide').textContent.includes('새 문항'));
});
test('missing examples and network failure are explicit and retryable',async()=>{
 let fail=true;
 const guide=fixture(async()=>{if(fail)throw Error('offline');return {...data('가. 정의'),kind:'scaffold',example:null}});
 await guide.open({id:'q'});assert.match($('writing-guide').textContent,/offline/);
 fail=false;await $('writing-guide').querySelector('button').onclick();
 assert.match($('writing-guide').textContent,/등록된 작성 예시가 없습니다/);
 assert.match($('writing-guide').textContent,/검토할 후보/);
});



