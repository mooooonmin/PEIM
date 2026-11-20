import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createDraftStore } from "../app/frontend/draft-store.js";

for (const kind of ["answer", "note"]) test(`${kind}: independent tab snapshots survive competing saves and reload`, () => {
  const storage = new Window().localStorage;
  const a = createDraftStore(storage), b = createDraftStore(storage);
  const key = "peim:" + kind + ":q1";
  const first = kind === "answer" ? {body:"A",status:"draft",revision:1} : {note:"A",retry_requested:true,revision:1};
  const second = kind === "answer" ? {...first,body:"B"} : {...first,note:"B"};
  a.write(key, first); b.write(key, second);
  a.clear(key, first);
  assert.deepEqual(createDraftStore(storage).read(key), second);
  assert.equal(b.records(key).length, 1);
  // A fresh page may write a third version; both distinct drafts remain available.
  const c = createDraftStore(storage), third = {...first,revision:2};
  c.write(key, third);
  assert.deepEqual(b.read(key), second);
  assert.equal(c.records(key).length, 2);
  c.clear(key, third);
  assert.deepEqual(b.read(key), second);
});

test("legacy draft is preserved before a new tab writes and edited snapshots stay bounded", () => {
  const storage = new Window().localStorage, key = "peim:draft:q1";
  storage.setItem(key, JSON.stringify({body:"legacy"}));
  const store = createDraftStore(storage);
  for (let i=0;i<50;i++) store.write(key, {body:"new " + i});
  assert.deepEqual(store.records(key).map(r=>r.value.body).sort(), ["legacy","new 49"]);
  assert.equal(storage.length, 3); // two snapshots and a compatibility mirror
});

test("explicit reload archives only this tab and keeps another identical unsaved draft", () => {
  const storage = new Window().localStorage, key = "peim:learning:q1";
  const a = createDraftStore(storage), b = createDraftStore(storage);
  const value = {note:"same unsaved text",retry_requested:true,revision:0};
  a.write(key,value); b.write(key,value);
  a.archive(key,value);
  assert.deepEqual(b.read(key),value);
  assert.equal(b.records(key).filter(r=>!r.archived).length,1);
  assert.equal(b.records(key).filter(r=>r.archived).length,1);
});
