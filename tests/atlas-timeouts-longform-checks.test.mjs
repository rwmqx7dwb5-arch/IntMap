/* Atlas · long-form writing (research.longform) and the documented loop clocks.
   Audit 2026-11-21 §9.6 (a long report or long code is limited by one task's output ceiling) and §10.3 (the document
   quoted 45 s / 180 s while js/atlas-agent.js holds 240 s / 600 s). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { planOutline, outlineKey, runLongform, assemble, storageStore } from '../js/atlas-longform.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const memStore = () => { const m = new Map(); return { m, read: (k) => m.get(k) || null, write: (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); } }; };
const outline = { title: 'Report', brief: 'b', sections: [{ title: 'One', goal: 'g1' }, { title: 'Two', goal: 'g2' }, { title: 'Three', goal: 'g3' }] };

test('an outline with no sections, or a section with nothing to write, is refused; ids are made unique', () => {
  assert.equal(planOutline({ sections: [] }).ok, false);
  assert.equal(planOutline({ sections: [{ title: '', goal: '' }] }).ok, false);
  const p = planOutline({ sections: [{ id: 'a', title: 'x', goal: 'y' }, { id: 'a', title: 'z', goal: 'w' }, 'plain'] });
  assert.equal(p.ok, true);
  assert.equal(new Set(p.sections.map((s) => s.id)).size, 3);
});

test('the same outline has the same key, a different one a different key', () => {
  const a = planOutline(outline), b = planOutline(JSON.parse(JSON.stringify(outline)));
  assert.equal(outlineKey(a), outlineKey(b));
  b.sections[1].goal = 'changed';
  assert.notEqual(outlineKey(a), outlineKey(b));
});

test('every section is its own request, saved as written, and the joined document has all of them', async () => {
  const plan = planOutline(outline), store = memStore(), prompts = [];
  const ask = async (prompt, system, _i, o) => { prompts.push({ prompt, task: o.task }); return { text: 'body of #' + prompts.length, meta: { costUsd: 0.01 } }; };
  const r = await runLongform({ plan, ask, store });
  assert.equal(r.state, 'done'); assert.equal(r.wrote, 3); assert.equal(r.remaining, 0);
  assert.ok(prompts.every((p) => p.task === 'atlas_section'));
  assert.match(prompts[1].prompt, /THE END OF THE PREVIOUS SECTION[\s\S]*body of #1/, 'the next section sees the end of the one before');
  assert.match(prompts[1].prompt, />> 2\. Two/, 'and its place in the outline');
  const doc = assemble(plan, r.chapters);
  assert.match(doc, /^# Report/); assert.ok(doc.indexOf('body of #1') < doc.indexOf('body of #2') && doc.indexOf('body of #2') < doc.indexOf('body of #3'));
  assert.equal(Math.round(r.costUsd * 100), 3);
});

test('asking again with the same outline writes nothing again — it says the chapters are kept', async () => {
  const plan = planOutline(outline), store = memStore();
  let n = 0; const ask = async () => ({ text: 'x' + (++n), meta: {} });
  await runLongform({ plan, ask, store });
  const again = await runLongform({ plan, ask, store });
  assert.equal(n, 3, 'no request the second time');
  assert.equal(again.resumed, 3); assert.equal(again.wrote, 0); assert.equal(again.state, 'done');
  assert.ok(again.chapters.every((c) => c.resumed));
});

test('a chapter the model cut off is continued from where it stopped, so one chapter is not one output', async () => {
  const plan = planOutline({ sections: [{ title: 'Only', goal: 'g' }] });
  const replies = [{ text: 'part A ', meta: { incompleteReason: 'max_output_tokens' } }, { text: 'part B ', meta: { incompleteReason: 'max_output_tokens' } }, { text: 'part C', meta: {} }];
  const prompts = []; const ask = async (p) => { prompts.push(p); return replies.shift(); };
  const r = await runLongform({ plan, ask, store: memStore() });
  assert.equal(r.chapters[0].text, 'part A part B part C'); assert.equal(r.chapters[0].state, 'done'); assert.equal(r.chapters[0].continues, 2);
  assert.match(prompts[1], /CONTINUE from exactly where it stops/); assert.match(prompts[1], /part A/);
});

test('the time budget stops a call between chapters, reports what is left, and the next call resumes', async () => {
  const plan = planOutline(outline), store = memStore();
  let clock = 0, n = 0;
  const ask = async () => { clock += 100; return { text: 'c' + (++n), meta: {} }; };
  const first = await runLongform({ plan, ask, store, now: () => clock, budgetMs: 150 });
  assert.equal(first.state, 'partial'); assert.equal(first.wrote, 2); assert.equal(first.remaining, 1);
  assert.equal(first.chapters[2].state, 'pending');
  const second = await runLongform({ plan, ask, store, now: () => clock, budgetMs: 150 });
  assert.equal(second.state, 'done'); assert.equal(second.resumed, 2); assert.equal(second.wrote, 1); assert.equal(n, 3);
});

test('a chapter still cut when the budget ran out is kept cut and CONTINUED by the next call, not rewritten', async () => {
  const plan = planOutline({ sections: [{ title: 'Only', goal: 'g' }] }), store = memStore();
  let clock = 0; const prompts = [];
  const ask = async (p) => { prompts.push(p); clock += 200; return prompts.length === 1 ? { text: 'first half ', meta: { incompleteReason: 'max_output_tokens' } } : { text: 'second half', meta: {} }; };
  const a = await runLongform({ plan, ask, store, now: () => clock, budgetMs: 150 });
  assert.equal(a.chapters[0].state, 'cut');
  const b = await runLongform({ plan, ask, store, now: () => clock + 1000, budgetMs: 150 });
  assert.equal(b.chapters[0].text, 'first half second half'); assert.equal(b.chapters[0].state, 'done');
  assert.match(prompts[1], /first half/);
});

test('a failure with nothing written is a failure, with some chapters written it is partial, and what exists is kept', async () => {
  const plan = planOutline(outline), store = memStore(); let n = 0;
  const ask = async () => { if (++n === 2) { const e = new Error('x'); e.code = 'provider_unavailable'; throw e; } return { text: 'ok' + n, meta: {} }; };
  const r = await runLongform({ plan, ask, store });
  assert.equal(r.state, 'partial'); assert.equal(r.code, 'provider_unavailable'); assert.equal(r.chapters[0].state, 'done'); assert.equal(r.chapters[1].state, 'failed'); assert.equal(r.chapters[2].state, 'pending');
  const bad = await runLongform({ plan, ask: async () => { throw new Error('boom'); }, store: memStore() });
  assert.equal(bad.state, 'failed');
});

test('storageStore survives a storage that throws', () => {
  const s = storageStore({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
  assert.equal(s.read('k'), null); assert.doesNotThrow(() => s.write('k', { a: 1 }));
});

test('the section task exists, is registered, and stays under the one absolute ceiling', () => {
  assert.match(read('supabase/functions/ai-proxy/tasks/all.ts'), /atlas_section/);
  const t = read('supabase/functions/ai-proxy/tasks/atlas_section.ts');
  const max = Number(t.match(/maxOutput:\s*(\d+)/)[1]);
  const hard = Number(read('supabase/functions/ai-proxy/tasks/spec.ts').match(/HARD_MAX_OUTPUT\s*=\s*(\d+)/)[1]);
  assert.ok(max <= hard && max >= 4000, 'a chapter has room, and the ceiling was not raised for it');
  assert.doesNotMatch(t, /json:\s*true/, 'a chapter is prose or code, not JSON');
});

test('the documents quote the loop clocks the code holds (check:docs rule atlas-clocks)', () => {
  const out = execFileSync(process.execPath, ['scripts/doc-facts.mjs', '--rule=atlas-clocks'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(out, /atlas-clocks: \d+ quoted clock value/);
});
