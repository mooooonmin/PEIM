import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { Window } from "happy-dom";
const bundle = await build({entryPoints:["app/frontend/upload-preview.js"], bundle:true, write:false, format:"esm",
  plugins:[{name:"pdf",setup(b){b.onResolve({filter:/^pdfjs-dist$/},()=>({path:"pdf",namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const GlobalWorkerOptions={}; export function getDocument(){}"}));}}]});
const {setupUploadPreview} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const html = await readFile("app/static/index.html","utf8");
function fixture() {
  const w = new Window(); globalThis.document = w.document; w.document.body.innerHTML = html;
  w.HTMLCanvasElement.prototype.getContext = function(){ return {canvas:this}; };
  const $ = id => document.getElementById(id);
  const pending = new Map();
  const preview = setupUploadPreview({loadDocument: ({url}) => {
    let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;});
    pending.set(url,{resolve,reject}); return {promise,destroy:async()=>{}};
  }});
  function pdf(tag, fail = false) {
    return {numPages:2, getPage:async page=>({getViewport:()=>({width:100,height:200}),
      render:({canvasContext})=>{canvasContext.canvas.dataset.source=`${tag}:${page}`;
        return {promise:fail?Promise.reject(Error('render')):Promise.resolve(),cancel(){}};}})};
  }
  return {$,preview,pending,pdf};
}
test("PDF switching ignores delayed previous documents and resets page and zoom", async()=>{
  const f=fixture();
  const a=f.preview.open({format:"pdf",attachment_id:"a"});
  const b=f.preview.open({format:"pdf",attachment_id:"b"});
  f.pending.get('/api/attachments/b/file').resolve(f.pdf('b')); await b;
  await f.$('upload-pdf-next').onclick();
  assert.equal(f.preview.page(),2);
  f.$('upload-pdf-zoom').onclick();
  f.pending.get('/api/attachments/a/file').resolve(f.pdf('a')); await a;
  assert.equal(f.$('upload-pdf-canvas').firstChild.dataset.source,'b:2');
  assert.equal(f.$('upload-pdf-next').disabled,true);
  await f.preview.open({format:'hwp',attachment_id:'c'});
  assert.equal(f.preview.page(),null);
  assert.equal(f.$('upload-pdf-canvas').children.length,0);
  assert.equal(f.$('use-upload-page').disabled,true);
  assert.equal(f.$('upload-pdf-canvas').dataset.zoom,'false');
});
test("failed PDF requests and rendering show a recovery path without an attachable page",async()=>{
  const f=fixture(); const a=f.preview.open({format:'pdf',attachment_id:'a'});
  f.pending.get('/api/attachments/a/file').reject(Error('network')); await a;
  assert.match(f.$('upload-pdf-status').textContent,/원본 열기/);
  assert.equal(f.preview.page(),null);
  const b=f.preview.open({format:'pdf',attachment_id:'b'});
  f.pending.get('/api/attachments/b/file').resolve(f.pdf('b',true)); await b;
  assert.match(f.$('upload-pdf-status').textContent,/표시하지 못/);
  assert.equal(f.$('use-upload-page').disabled,true);
});
