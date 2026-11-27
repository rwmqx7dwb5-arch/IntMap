/* (atlas-completion-verdict) WHETHER A TURN SUCCEEDED, AS THE TURN'S OWN OBSERVERS SAY IT — and what the reader is shown while they decide.
 *
 *  Reported (2026-11-27): A) 「このターンで完了していないもの:」 over a turn that succeeded; B) a successful answer withdrawn, answered again and
 *  withdrawn again, over and over; C) an answer that begins «I could not …», is withdrawn, and the turn goes back to investigating, again and again.
 *  MEASURED here before the fix, driving the REAL runTurn with a scripted model and verifier:
 *    · the independent reader (js/atlas-goal-verify.js) was handed the request and the answer with every «s» replaced by a space
 *      («Show where salinity rises» → «Show where  alinity ri e»): `/s+/g` for `/\s+/g` (one-pass-or-a-reason §2 ①, an observer that lied);
 *    · a reader that could not SEE whether the map held what was asked said «not met», and the loop could not tell the two apart (§5);
 *    · a reader that reworded one need each round bounced the same finished turn 20 times in 40 model calls (§2 ③: «put this finding to Atlas»
 *      was not idempotent — findings were matched by their spelling);
 *    · a reply that would end the turn streamed into the answer's place before the gates decided it, and vanished when they handed it back.
 *  Every check below evaluates the code; none reads its source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { makeGoalVerify, recordOf } from '../js/atlas-goal-verify.js';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { makeAtlasLive } from '../js/atlas-live.js';
import { lostEscapes, lostEscapeProblems } from '../scripts/regex-escapes.mjs';

const AGENT = makeAtlasAgent();
const TOOLS = { draw: { name: 'draw', description: 'draws', parameters: { type: 'object', properties: { x: { type: 'string' } } } } };
const USER = [{ role: 'user', content: 'Map all the prefectures of Japan' }];
const WORDINGS = ['all prefectures', 'every prefecture', 'each of the prefectures', 'the prefectures'];

/* a model that draws (a different argument each time, so nothing is «already done»), then says it drew — and an abort after 40 calls, so a loop shows as a count instead of a hang */
async function drive(verifyAnswer) {
  let mc = 0, vc = 0;
  const ac = new AbortController();
  const model = async () => { mc++; if (mc >= 40) ac.abort(); return mc % 2 === 1 ? { text: '', toolCalls: [{ id: 'c' + mc, name: 'draw', arguments: { x: 'p' + mc } }], answerMode: 'map' } : { text: '地図に描きました。', toolCalls: [], answerMode: 'map' }; };
  const verify = async (ctx) => { vc++; return verifyAnswer(vc, ctx); };
  const out = await AGENT.runTurn({ model, tools: TOOLS, execute: async () => ({ ok: true, producedModes: ['map'] }), messages: USER, verify, signal: ac.signal });
  return { out, mc, vc, bounces: out.trace.steps.filter((s) => s.bounced === 'goal_unmet').length };
}

test('① the independent reader receives English as it was written (the lost backslash)', async () => {
  let seen = '';
  const v = makeGoalVerify({ ask: async (p) => { seen = p; return { data: { unmet: [] } }; } });
  await v({ request: 'Show where   salinity\n rises in the Baltic Sea', text: 'Salinity rises toward the Danish straits.', results: [] });
  assert.match(seen, /Show where salinity rises in the Baltic Sea/, 'the request reached the reader intact, its whitespace folded');
  assert.match(seen, /Salinity rises toward the Danish straits\./);
  assert.doesNotMatch(seen, /alinity ri e/);
});

test('① no regex literal in the repository has lost its backslash, and the rule catches the shape', () => {
  assert.deepEqual(lostEscapes('a.replace(/s+/g, " ")').map((h) => h.pattern), ['/s+/g']);
  assert.deepEqual(lostEscapes('/^d{4}$/.test(y); x.split(/s*(beta)s*$/)').map((h) => h.pattern), ['/^d{4}$/', '/s*(beta)s*$/']);
  assert.deepEqual(lostEscapes('a.replace(/\\s+/g, " "); /(s|ed)$/; /[\'’]s?$/; /S/; /\\bfoo/'), [], 'escaped classes, plural endings and single letters are not flagged');
  const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean).map((rel) => ({ rel, ext: extname(rel) }));
  assert.deepEqual(lostEscapeProblems(files, (f) => { try { return readFileSync(f.rel, 'utf8'); } catch { return ''; } }), []);
});

test('② «could not see» is not «not met»: an unconfirmed reading bounces nothing and lists nothing (A)', async () => {
  const r = await drive(() => ({ unmet: [], unconfirmed: [{ need: 'all prefectures', why: 'the record does not list what the map holds' }] }));
  assert.equal(r.bounces, 0);
  assert.equal(r.out.completion, 'complete');
  assert.deepEqual(r.out.unmet, []);
  assert.equal(r.out.trace.goalUnconfirmed.length, 1, 'kept for the evaluation');
  /* …and the reader's own answer is split by what it says it saw, an answer that says nothing staying a finding as before */
  const v = makeGoalVerify({ ask: async () => ({ data: { unmet: [{ need: 'a', why: 'x', seen: 'unconfirmed' }, { need: 'b', why: 'y', seen: 'missing', prev: 'g1' }, { need: 'c' }] } }) });
  const got = await v({ request: 'q', text: 't', results: [] });
  assert.deepEqual(got.unconfirmed.map((u) => u.need), ['a']);
  assert.deepEqual(got.unmet.map((u) => [u.need, u.prev || '']), [['b', 'g1'], ['c', '']]);
});

test('③ the same finding is put to Atlas once, whatever words the reader uses for it (B: was 20 withdrawals in 40 calls)', async () => {
  const r = await drive((vc, ctx) => ({ unmet: [{ need: WORDINGS[vc % 4], why: 'Okinawa is not placed', prev: ctx.previous && ctx.previous.unmet[0] ? ctx.previous.unmet[0].id : undefined }] }));
  assert.equal(r.bounces, 1, 'handed back once');
  assert.equal(r.vc, 2, 'read again once, after the work Atlas did');
  assert.ok(r.mc <= 4, 'model calls ' + r.mc);
  /* the reading taken AFTER the work found it again, so the turn says so — honestly partial, not complete over it, and not bounced */
  assert.equal(r.out.completion, 'partial');
  assert.equal(r.out.unmet.length, 1);
  assert.equal(r.out.trace.goalRepeated, 1);
  /* the same words with no id are the same finding too */
  const s = await drive(() => ({ unmet: [{ need: 'All  Prefectures', why: 'x' }] }));
  assert.equal(s.bounces, 1);
});

test('③ a finding the work closed leaves the turn complete; a new finding after the work is put to Atlas', async () => {
  const closed = await drive((vc) => (vc === 1 ? { unmet: [{ need: 'Okinawa', why: 'could not place: Okinawa', seen: 'missing' }] } : { unmet: [] }));
  assert.equal(closed.bounces, 1);
  assert.equal(closed.out.completion, 'complete');
  assert.deepEqual(closed.out.unmet, []);
  const fresh = await drive((vc) => (vc === 1 ? { unmet: [{ need: 'Okinawa' }] } : vc === 2 ? { unmet: [{ need: 'the legend', prev: '' }] } : { unmet: [] }));
  assert.equal(fresh.bounces, 2, 'a need no reading named before is a new finding');
  assert.equal(fresh.out.completion, 'complete');
});

test('④ the record the reader judges holds what each operation reported, so it can confirm instead of guess', () => {
  const rows = recordOf([{ capability: 'map.compose', ok: true, status: 'completed', producedModes: ['map'], objectIds: ['a', 'b', 'c'], unresolved: ['Okinawa'], summary: 'Placed 46 of 47 prefectures' },
    { capability: 'web.search', ok: false, error: 'timeout', message: 'the search did not finish' }]);
  assert.match(rows[0], /objects placed: 3/);
  assert.match(rows[0], /could not place: Okinawa/);
  assert.match(rows[0], /reported: Placed 46 of 47 prefectures/);
  assert.match(rows[1], /FAILED \(timeout\)/);
  assert.doesNotMatch(rows[1], /reported:/, 'a failure is said as FAILED, not as what it reported');
});

/* ── C: what the reader sees while the turn can still hand the reply back ── */
function fakeProgress() {
  const rows = [];
  return {
    rows,
    say(b, text) { const rec = { text: String(text || '') }; rows.push(rec); return rec; },
    sayText(rec, text) { rec.text = String(text || ''); },
    unsay(b, rec) { const i = rows.indexOf(rec); if (i >= 0) rows.splice(i, 1); },
    detail() {}, outcome() {},
  };
}
function bubble() { return { querySelector: () => null, insertAdjacentHTML() { this.inserted = true; } }; }
const finalChunk = (text) => JSON.stringify({ turn: 'final', answer_mode: 'text', tool_calls: [], final_text: text });

test('⑤ a reply that would end the turn streams into the trace as a candidate, never into the answer place (C)', () => {
  const PROG = fakeProgress();
  const LIVE = makeAtlasLive({}, { progress: PROG });
  const ai = bubble();
  LIVE.begin(ai);
  /* step 0: a final that the gates hand back — «could not» */
  LIVE.hooks(ai).onEvent('text', { d: finalChunk('地図を描くことができませんでした。') });
  assert.equal(ai.__atlDraft || '', '', 'nothing in the answer place');
  assert.equal(ai.inserted, undefined);
  assert.deepEqual(PROG.rows.map((r) => r.text), ['地図を描くことができませんでした。']);
  /* step 1 starts (the loop handed it back): what was written stays, as a note */
  const h1 = LIVE.hooks(ai);
  h1.onEvent('call', { name: 'draw' });
  LIVE.stepDone(ai, { calls: ['draw'] });
  /* step 2: the final the turn accepts */
  LIVE.hooks(ai).onEvent('text', { d: finalChunk('47都道府県を地図に描きました。') });
  assert.equal(ai.__atlDraft || '', '');
  assert.deepEqual(PROG.rows.map((r) => r.text), ['地図を描くことができませんでした。', '47都道府県を地図に描きました。']);
  LIVE.end(ai, 'answered');
  assert.deepEqual(PROG.rows.map((r) => r.text), ['地図を描くことができませんでした。'], 'the accepted candidate becomes the answer — its trace row goes, the handed-back one stays');
  assert.deepEqual(LIVE.said(ai), ['地図を描くことができませんでした。'], 'and it is not kept among the notes either (no word twice)');
});

test('⑤ a stopped turn keeps its candidate readable, marked unfinished; a reply that then calls makes it a note', () => {
  const PROG = fakeProgress();
  const LIVE = makeAtlasLive({}, { progress: PROG });
  const ai = bubble();
  LIVE.begin(ai);
  LIVE.hooks(ai).onEvent('text', { d: finalChunk('途中まで') });
  LIVE.end(ai, 'cancelled');
  assert.equal(ai.__atlDraft, '途中まで', 'what the reader stopped stays readable');
  assert.equal(ai.__atlDraftStopped, true, 'marked unfinished, never an answer');
  assert.deepEqual(PROG.rows.map((r) => r.text), [], 'and is not said twice');
  const P2 = fakeProgress(); const L2 = makeAtlasLive({}, { progress: P2 }); const b2 = bubble();
  L2.begin(b2);
  const h = L2.hooks(b2);
  h.onEvent('text', { d: JSON.stringify({ turn: 'final', final_text: '調べます' }) });
  h.onEvent('call', { name: 'draw' });
  L2.stepDone(b2, { calls: ['draw'] });
  L2.end(b2, 'answered');
  assert.deepEqual(P2.rows.map((r) => r.text), ['調べます'], 'a sentence whose reply made a call is a note on the way, not a candidate');
});
