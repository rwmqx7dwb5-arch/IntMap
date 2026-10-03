/* ============================================================================
 *  atlas-os — THE INVESTIGATION NOTEBOOK: an Atlas answer that is kept, replayed, compared and handed on
 * ----------------------------------------------------------------------------
 *  js/atlas-notebook-store.js (the data), js/atlas-notebook.js (the page), js/atlas-cap-notebook.js
 *  (what Atlas can do with it), js/atlas-state.js (onTurnEnd / captureSections / restoreSections) and
 *  js/atlas-query.js (the answered query, announced as data). The account copy is
 *  supabase/migrations/20261003090000_atlas_notebook.sql, proved by supabase/tests/18_atlas_notebook_test.sql.
 *
 *  Every check here runs the shipped code: the real registry decides what a replay may re-run, the real
 *  state ledger restores and reads back, and the real query engine answers the same question at two
 *  moments so the comparison is made between two real results.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import {
  entryFromTurn, cleanArgs, normalize, diffResults, search, toMarkdown, toFile, fromFile, makeNotebookStore,
  memoryBackend, mergeCloud, rowFromEntry, entryFromRow, replayable, newId,
} from '../js/atlas-notebook-store.js';
import { notebookStore, restoreView, captureView, wantedSections } from '../js/atlas-notebook.js';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { makeAtlasState } from '../js/atlas-state.js';
import notebookCaps from '../js/atlas-cap-notebook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CAPS = makeAtlasCapabilities({}, { publish: false });
const resolve = (id) => CAPS.resolve(id);
const runOf = (id) => notebookCaps.find((e) => e.row[0] === id).run;
const K0 = () => ({ R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), L: (en) => en,
  esc: (s) => globalThis.IntMapSafe.html(s), note: (s) => '<div class="n">' + s + '</div>', warn: (s) => '<div class="w">' + s + '</div>' });

/* ── ① what a replay may run is the registry's statement, not a list ─────────────────────────────── */
test('atlas-os ①: a replay re-runs exactly the reversible map changes the registry declares', () => {
  assert.equal(replayable('data.query', 'completed', resolve), true, 'a query draws on the map and is session-reversible');
  assert.equal(replayable('view.flyTo', 'partial', resolve), true);
  assert.equal(replayable('dialog.answer', 'completed', resolve), false, 'prose is kept as text, not re-run');
  assert.equal(replayable('settings.theme', 'completed', resolve), false, 'a persistent setting is never re-applied by a replay');
  assert.equal(replayable('data.query', 'failed', resolve), false, 'what failed is not replayed');
  assert.equal(replayable('notebook.open', 'completed', resolve), false, 'a replay cannot open another replay');
  /* the rule is derived: every replayable row is a session row, and every session row with a dispatch is replayable */
  let session = 0, other = 0;
  CAPS.list().map((id) => CAPS.resolve(id)).forEach((c) => {
    if (c.withdrawn || /^notebook\./.test(c.id)) return;
    const want = c.risk === 'reversible-session' && !!c.legacy;
    if (want) session++; else other++;
    assert.equal(replayable(c.id, 'completed', resolve), want, c.id);
  });
  assert.ok(session > 50 && other > 20, 'both kinds exist in the table, so the loop above asserted something (' + session + ' / ' + other + ')');
});

/* ── ② one finished turn → one entry ───────────────────────────────────────────────────────────── */
const TURN = {
  turnId: 7, at: 1_000, question: '人口100万人以上で過去30日にM5以上の地震があった都市', reply: '3 都市が該当します。',
  status: 'answered',
  operations: [
    { capabilityId: 'data.query', status: 'completed', args: { type: 'query', from: 'cities', where: [{ col: 'pop', op: '>=', value: 1e6 }], __externalContent: true, __exec: { x: 1 } } },
    { capabilityId: 'dialog.answer', status: 'completed', args: { type: 'answer', text: '…' } },
  ],
};
test('atlas-os ②: a turn is filed with its exact calls, its view, its rows and only its own query answers', () => {
  const results = [{ at: 900, key: 'old', rows: [] }, { at: 1_500, key: 'mine', table: 'cities', matched: 1, rows: [{ id: 'g:1', name: 'A', v: {} }], columns: [] }];
  const e = entryFromTurn(TURN, { view: { camera: { lng: 1, lat: 2, zoom: 3 }, layersOn: ['cb-quakes'] }, results, resolve, now: 2_000,
    sources: [{ url: 'https://example.org/a', title: 'A' }, { url: 'javascript:alert(1)', title: 'x' }] });
  assert.match(e.id, /^nb-/);
  assert.equal(e.question, TURN.question);
  assert.equal(e.answer, TURN.reply);
  assert.deepEqual(e.steps.map((s) => [s.cap, s.replay]), [['data.query', true], ['dialog.answer', false]]);
  assert.equal(e.steps[0].args.__externalContent, undefined, 'the executor\'s stamps are not part of what was asked');
  assert.deepEqual(e.results.map((r) => r.key), ['mine'], 'an answer from before the turn began is not this turn\'s');
  assert.deepEqual(e.sources.map((s) => s.url), ['https://example.org/a'], 'only a web address is kept as a source');
  assert.deepEqual(cleanArgs({ a: 1, __b: 2, c: { __d: 3, e: 4 } }), { a: 1, c: { e: 4 } });
});

test('atlas-os ③: an entry that enters from a file or the account is normalised, never trusted', () => {
  assert.equal(normalize({ id: 'nb-xyz-1', question: '' }), null, 'no question, no entry');
  assert.equal(normalize({ id: '../etc', question: 'q' }), null, 'an id that is not a notebook id is refused');
  const n = normalize({ id: 'nb-xyz-1234', question: 'q', steps: 'nope', results: [{ rows: [{ id: 5, lat: 'x', v: 3 }] }], view: [1, 2] });
  assert.deepEqual(n.steps, []);
  assert.equal(n.view, null);
  assert.deepEqual(n.results[0].rows[0], { id: '5', name: '', iso2: '', lat: null, lng: null, v: {} });
});

/* ── ④ the same question at two moments, compared by code ─────────────────────────────────────── */
test('atlas-os ④: rows are compared by identity — added, gone, changed with the difference, renamed is changed', () => {
  const cols = [{ id: 'pop', label: 'Population', unit: '' }, { id: 'tempC', label: 'Temp', unit: '°C' }];
  const then = { at: 1, table: 'cities', matched: 3, columns: cols, rows: [
    { id: 'g:1', name: 'Alpha', v: { pop: 100, tempC: 20 } }, { id: 'g:2', name: 'Beta', v: { pop: 200, tempC: 21 } }, { id: 'g:3', name: 'Gamma', v: { pop: 300, tempC: 22 } }] };
  const now = { at: 2, table: 'cities', matched: 3, columns: cols, rows: [
    { id: 'g:1', name: 'Alpha', v: { pop: 100, tempC: 25.5 } }, { id: 'g:3', name: 'Gamma City', v: { pop: 300, tempC: 22 } }, { id: 'g:4', name: 'Delta', v: { pop: 400, tempC: 30 } }] };
  const d = diffResults(then, now);
  assert.deepEqual(d.added.map((r) => r.id), ['g:4']);
  assert.deepEqual(d.removed.map((r) => r.id), ['g:2']);
  assert.deepEqual(d.changed.map((c) => c.id).sort(), ['g:1', 'g:3']);
  const a = d.changed.find((c) => c.id === 'g:1').diffs[0];
  assert.deepEqual([a.col, a.then, a.now, a.delta], ['tempC', 20, 25.5, 5.5]);
  assert.equal(d.changed.find((c) => c.id === 'g:3').diffs[0].col, 'name', 'a renamed row is the same row, changed');
  assert.equal(d.cutThen, false);
  assert.equal(diffResults(Object.assign({}, then, { matched: 50 }), now).cutThen, true, 'a cut table says a «gone» row may only have moved below the limit');
  assert.deepEqual(diffResults(then, then).changed, [], 'the same rows are no change');
});

/* the shipped engine, answering the same earthquake question at two moments */
function useWindow(t, win) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window'), prev = globalThis.window;
  const hadD = Object.prototype.hasOwnProperty.call(globalThis, 'document'), prevD = globalThis.document;
  globalThis.window = win; globalThis.document = { baseURI: 'http://localhost/' };
  t.after(() => { if (had) globalThis.window = prev; else delete globalThis.window; if (hadD) globalThis.document = prevD; else delete globalThis.document; });
}
const Q = (id, place, mag, iso) => ({ id, properties: { place, mag, time: Date.parse(iso), url: '' }, geometry: { coordinates: [10, 50, 10] } });
test('atlas-os ⑤: the real query engine announces what it answered, and two real answers compare row by row', async (t) => {
  const heard = [];
  useWindow(t, { IntMapOS: { emit: (ev) => heard.push(ev) } });
  const { atlasQuery } = await importModule('js/atlas-query.js');
  let feed = [Q('a', 'Peru', 6.7, '2026-09-12T02:00:00Z'), Q('b', 'Japan', 5.8, '2026-09-10T04:00:00Z')];
  const API = atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn, fetchJSON: async () => ({ features: feed }) });
  const spec = { type: 'query', from: 'earthquakes', where: [{ col: 'mag', op: '>=', value: 5 }], __turn: 3 };
  const r1 = await API.answer(spec, { pin: false });
  assert.equal(r1.ok, true);
  assert.equal(heard.length, 1, 'one answered query, one announcement');
  const then = heard[0].result;
  assert.equal(heard[0].kernel, 'query'); assert.equal(heard[0].phase, 'answered');
  assert.deepEqual(then.rows.map((r) => r.id).sort(), ['a', 'b']);
  assert.equal(then.spec.__turn, undefined, 'the stored spec is what was asked, without stamps');
  assert.ok(then.columns.some((c) => c.id === 'mag'), 'the printed columns are kept with their labels');
  feed = [Q('a', 'Peru', 6.9, '2026-09-12T02:00:00Z'), Q('c', 'Chile', 5.2, '2026-09-20T04:00:00Z')];
  const now = API.compact(await API.run(then.spec));
  const d = diffResults(then, now);
  assert.deepEqual(d.added.map((r) => r.id), ['c']);
  assert.deepEqual(d.removed.map((r) => r.id), ['b']);
  assert.deepEqual(d.changed.map((c) => [c.id, c.diffs.find((x) => x.col === 'mag').now]), [['a', 6.9]]);
});

/* ── ⑥ search, files, markdown ─────────────────────────────────────────────────────────────────── */
const E = (id, at, q, extra) => normalize(Object.assign({ id, at, updatedAt: at, question: q, answer: 'answer to ' + q }, extra || {}));
test('atlas-os ⑥: search finds by every term, newest first, pinned on top; a file round-trips and a stranger is refused', () => {
  const list = [E('nb-aaaa-1', 1, 'Taiwan strait shipping'), E('nb-aaaa-2', 3, '台湾 地震'), E('nb-aaaa-3', 2, 'Taiwan GDP', { pinned: true })];
  assert.deepEqual(search(list, '').map((e) => e.id), ['nb-aaaa-3', 'nb-aaaa-2', 'nb-aaaa-1']);
  assert.deepEqual(search(list, 'taiwan strait').map((e) => e.id), ['nb-aaaa-1']);
  assert.deepEqual(search(list, '台湾').map((e) => e.id), ['nb-aaaa-2']);
  const f = JSON.parse(JSON.stringify(toFile(list)));
  const back = fromFile(f);
  assert.equal(back.entries.length, 3); assert.equal(back.rejected, 0);
  assert.throws(() => fromFile({ format: 'something-else' }), /not-a-notebook/);
  assert.throws(() => fromFile({ format: f.format, v: 99, entries: [] }), /newer-version/);
  f.entries.push({ id: 'bad', question: 'x' });
  assert.equal(fromFile(f).rejected, 1, 'an unreadable entry is counted, not imported');
  const md = toMarkdown([E('nb-aaaa-9', Date.UTC(2026, 9, 3), 'Q?', { results: [{ table: 'cities', tableLabel: 'Cities', matched: 2, columns: [{ id: 'pop', label: 'Population' }], rows: [{ id: '1', name: 'A|B', v: { pop: 5 } }] }],
    sources: [{ url: 'https://example.org', title: 'Ex' }], view: { camera: { lat: 35, lng: 139, zoom: 5 }, time: { live: true }, layersOn: ['cb-quakes'] } })], 'en');
  assert.match(md, /## Q\?/); assert.match(md, /\| A\\\|B \| 5 \|/); assert.match(md, /\[Ex\]\(https:\/\/example\.org\)/); assert.match(md, /cb-quakes/);
});

/* ── ⑦ the device store and the account merge ─────────────────────────────────────────────────── */
test('atlas-os ⑦: the store keeps, updates, deletes and tells its listeners', async () => {
  const S = makeNotebookStore(memoryBackend());
  let told = 0; S.on(() => told++);
  const e = await S.put(E('nb-bbbb-1', 5, 'q1'));
  await S.put(E('nb-bbbb-2', 6, 'q2'));
  assert.equal(await S.count(), 2);
  await S.update(e.id, { note: 'checked' });
  assert.equal((await S.get(e.id)).note, 'checked');
  assert.ok((await S.get(e.id)).updatedAt > 5, 'an edit moves updatedAt');
  await S.remove('nb-bbbb-2');
  assert.deepEqual((await S.list()).map((x) => x.id), ['nb-bbbb-1']);
  assert.equal(told, 4);
  await assert.rejects(() => S.put({ id: 'x' }), /invalid-entry/);
});
test('atlas-os ⑧: the account merge — later edit wins, a synced entry missing remotely was deleted elsewhere, a new one goes up', () => {
  const L = [E('nb-cccc-1', 1, 'a', { updatedAt: 10, syncedAt: 5 }), E('nb-cccc-2', 1, 'b', { updatedAt: 1, syncedAt: 5 }), E('nb-cccc-3', 1, 'c', { updatedAt: 1 }), E('nb-cccc-4', 1, 'd', { updatedAt: 3, syncedAt: 5 })];
  const R = [E('nb-cccc-1', 1, 'a', { updatedAt: 8 }), E('nb-cccc-4', 1, 'd', { updatedAt: 9 }), E('nb-cccc-5', 1, 'e', { updatedAt: 2 })];
  const m = mergeCloud(L, R);
  assert.deepEqual(m.toRemote.map((e) => e.id).sort(), ['nb-cccc-1', 'nb-cccc-3']);
  assert.deepEqual(m.toLocal.map((e) => e.id).sort(), ['nb-cccc-4', 'nb-cccc-5']);
  assert.deepEqual(m.deleteLocal, ['nb-cccc-2']);
  const e = E('nb-cccc-9', Date.UTC(2026, 0, 2), 'q', { note: 'n', steps: [{ cap: 'view.flyTo', args: { type: 'flyTo', place: 'Tokyo' }, replay: true }] });
  const row = rowFromEntry(e, 'u1');
  assert.equal(row.user_id, 'u1'); assert.equal(row.payload.syncedAt, undefined); assert.equal(row.payload.question, undefined);
  const back = entryFromRow(JSON.parse(JSON.stringify(row)));
  assert.deepEqual([back.id, back.question, back.note, back.steps[0].args.place, back.at], [e.id, 'q', 'n', 'Tokyo', e.at]);
});

/* ── ⑨ the state ledger: the turn is told, the view is put back and read back ──────────────────── */
function fakeState() {
  const S = makeAtlasState({});
  const live = { camera: { lng: 0, lat: 0, zoom: 1 }, time: { live: true, t: null }, layers: { 'cb-a': { on: false, op: '1' }, 'cb-b': { on: true, op: '0.5' } } };
  const stuck = { refuse: false };
  S.registerRestorer('camera', { capture: () => Object.assign({}, live.camera), restore: (w) => { if (!stuck.refuse) live.camera = Object.assign({}, w); } });
  S.registerRestorer('time', { capture: () => Object.assign({}, live.time), restore: (w) => { live.time = Object.assign({}, w); } });
  S.registerRestorer('layers', { capture: () => JSON.parse(JSON.stringify(live.layers)), restore: (w, now) => { Object.keys(w).forEach((id) => { if (now[id]) live.layers[id] = Object.assign({}, w[id]); }); } });
  return { S, live, stuck };
}
test('atlas-os ⑨: endTurn tells its listeners; a stored view is restored in full and READ BACK', async () => {
  const { S, live, stuck } = fakeState();
  const got = []; const off = S.onTurnEnd((t) => got.push([t.turnId, t.reply, (t.cites || []).length]));
  S.beginTurn(1, 'q'); S.endTurn(1, { reply: 'r', status: 'answered', cites: [{ url: 'https://x' }] });
  off(); S.beginTurn(2, 'q2'); S.endTurn(2, { reply: 'r2' });
  assert.deepEqual(got, [[1, 'r', 1]], 'told once, and not after unsubscribing');
  const v = { camera: { lng: 139, lat: 35, zoom: 6 }, time: { live: false, t: 86400000 }, layersOn: ['cb-a', 'cb-gone'], layerOpacity: { 'cb-a': '0.7' } };
  const { want, missing } = wantedSections(v, S);
  assert.deepEqual(want.layers, { 'cb-a': { on: true, op: '0.7' }, 'cb-b': { on: false, op: '0.5' } }, 'a layer turned on since is turned off again');
  assert.deepEqual(missing, ['cb-gone'], 'a layer this build lacks is named, not guessed at');
  const r = await restoreView(v, S);
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(live.camera, v.camera); assert.equal(live.time.t, 86400000);
  assert.deepEqual(captureView(S).layersOn, ['cb-a']);
  live.camera = { lng: 0, lat: 0, zoom: 1 }; stuck.refuse = true;
  const r2 = await restoreView(v, S);
  assert.deepEqual(r2.unresolved, ['camera'], 'a section that did not come back is named by the read-back');
  const r3 = await restoreView(v, S, ['time']);
  assert.deepEqual(r3.asked, ['time'], '`only` restores only what it names');
});

/* ── ⑩ the three capabilities, run through their own entries ──────────────────────────────────── */
test('atlas-os ⑩: notebook.list / notebook.open / notebook.compare run against the real notebook', async (t) => {
  const store = notebookStore();
  await store.clear();
  const { S, live, stuck } = fakeState();
  const K = Object.assign(K0(), { ASTATE: S });
  const empty = await runOf('notebook.list')({ type: 'notebook' }, {}, K);
  assert.equal(empty.ok, true); assert.match(empty.html, /empty/);
  const then = { at: 10, key: 'k', spec: { from: 'earthquakes', where: [{ col: 'mag', op: '>=', value: 5 }] }, table: 'earthquakes', tableLabel: 'Earthquakes', matched: 1,
    columns: [{ id: 'mag', label: 'Magnitude', unit: '' }], rows: [{ id: 'a', name: 'Peru', iso2: '', lat: 50, lng: 10, v: { mag: 6.7 } }] };
  const e = await store.put(normalize({ id: newId(20), at: 20, updatedAt: 20, question: 'M5+ earthquakes this month', answer: 'One, in Peru.',
    view: { camera: { lng: -75, lat: -12, zoom: 4 }, time: { live: true, t: null }, layersOn: ['cb-b'] },
    steps: [{ cap: 'data.query', args: { type: 'query', from: 'earthquakes' }, status: 'completed', replay: true }], results: [then] }));
  const listed = await runOf('notebook.list')({ type: 'notebook', query: 'earthquakes' }, {}, K);
  assert.ok(listed.html.includes(e.id), 'the id Atlas passes on is in what it reads');
  stuck.refuse = false;
  const opened = await runOf('notebook.open')({ type: 'notebookOpen', query: 'Peru' }, {}, K);
  assert.equal(opened.ok, true, opened.html);
  assert.deepEqual(live.camera, { lng: -75, lat: -12, zoom: 4 });
  assert.match(opened.html, /\{&quot;type&quot;:&quot;query&quot;/, 'the exact call that drew it is handed to Atlas');
  assert.equal(opened.meta.notebook.calls, 1);
  const missing = await runOf('notebook.open')({ type: 'notebookOpen', id: 'nb-none-0000' }, {}, K);
  assert.equal(missing.ok, false);
  /* compare: the real engine, bound through the same binding data.query uses */
  const { atlasQuery } = await importModule('js/atlas-query.js');
  useWindow(t, { IntMapOS: { emit: () => { } }, IntMapLazy: { need: async () => true } });
  globalThis.window.IntMapQuery = atlasQuery({ lang: 'en', addPin: () => null });
  const KC = Object.assign(K, { ensureData: async () => true, _mirrorLang: () => 'en', countryStats: {}, nm: (s) => s.nameEn,
    _fetchJSON: async () => ({ features: [Q('a', 'Peru', 6.7, '2026-09-12T02:00:00Z'), Q('z', 'Fiji', 5.5, '2026-09-21T00:00:00Z')] }) });
  const cmp = await runOf('notebook.compare')({ type: 'notebookCompare', id: e.id }, {}, KC);
  assert.equal(cmp.ok, true, cmp.html);
  assert.equal(cmp.meta.notebook.changes, 1, 'Fiji newly matches; Peru is unchanged');
  assert.match(cmp.html, /Fiji/);
  assert.ok(cmp.meta.notebook.filed, 'the comparison is filed beside the original');
  const chain = (await store.list()).filter((x) => (x.followOf || x.id) === e.id);
  assert.equal(chain.length, 2, 'the same question now has a history of two');
  const none = await store.put(normalize({ id: newId(30), at: 30, updatedAt: 30, question: 'Why is the Sahel dry?', answer: 'Because…' }));
  const prose = await runOf('notebook.compare')({ type: 'notebookCompare', id: none.id }, {}, KC);
  assert.equal(prose.ok, true); assert.match(prose.html, /no query rows/);
  await store.clear();
});

/* ── ⑪ the wiring the browser depends on, read where it cannot be run ──────────────────────────── */
test('atlas-os ⑪: the console mounts the notebook, hands it the citations, and the catalogue and schema carry it', () => {
  const con = read('js/atlas-console.js');
  assert.match(con, /NOTEBOOK\.mount\(panel,\{ ASTATE,/, 'the panel mounts the notebook');
  assert.match(con, /ASTATE\.endTurn\(turn,\{[^}]*cites:/, 'the turn ends with its citations, so the notebook keeps its sources');
  assert.match(read('js/atlas-catalog-text.js'), /\{ name: 'notebook', head: /);
  assert.match(read('js/atlas-styles.js'), /\+NOTEBOOK_CSS/);
  ['notebook.list', 'notebook.open', 'notebook.compare'].forEach((id) => {
    const c = CAPS.resolve(id);
    assert.ok(c && c.legacy, id + ' is registered with a dispatch spelling');
  });
  assert.equal(CAPS.resolve('notebookCompare').id, 'notebook.compare');
  assert.match(read('supabase/migrations/20261003090000_atlas_notebook.sql'), /with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.ok(!/`/.test(read('js/atlas-notebook.js').split('export const NOTEBOOK_CSS')[1]), 'no back-tick in the notebook stylesheet (CONSTITUTION §2)');
});

/* ── ⑫ system.diagnose sees Atlas itself: the registry, the AI relay, the buttons ─────────────── */
import { registryConsistency, missingUiEntries, probeAiProxy } from '../js/atlas-selfcheck.js';
import { capabilityEntries } from '../js/atlas-caps.js';
import { CAPABILITY_MODULES } from '../js/atlas-caps-modules.js';
test('atlas-os ⑫: the registry the page boots with agrees with the modules — and a stale one is named', () => {
  const entries = capabilityEntries(CAPABILITY_MODULES);
  const ok = registryConsistency(entries, CAPS);
  assert.deepEqual([ok.implementedUnregistered, ok.registeredWithoutEntry, ok.spellingDrift], [[], [], []], 'the tree as it stands is consistent');
  /* a registry generated BEFORE the notebook was added: the three entries run, and nothing can find them */
  const stale = { list: () => CAPS.list().filter((id) => !/^notebook\./.test(id)), resolve: (id) => (/^notebook\./.test(id) ? null : CAPS.resolve(id)) };
  assert.deepEqual(registryConsistency(entries, stale).implementedUnregistered.sort(), ['notebook.compare', 'notebook.list', 'notebook.open']);
  const ghost = { list: () => CAPS.list().concat(['ghost.cap']), resolve: (id) => (id === 'ghost.cap' ? { id: 'ghost.cap', legacy: 'ghost' } : CAPS.resolve(id)) };
  assert.deepEqual(registryConsistency(entries, ghost).registeredWithoutEntry, ['ghost.cap']);
});
test('atlas-os ⑬: a command whose declared button is gone is named; the AI relay is reachable, failing or unobservable — three answers', async () => {
  const os = { list: () => ['a', 'b', 'c'], meta: (id) => ({ a: { btn: 'btn-a', label: 'A' }, b: { btn: 'btn-b' }, c: {} })[id] };
  const doc = { getElementById: (id) => (id === 'btn-a' ? {} : null) };
  assert.deepEqual(missingUiEntries(os, doc), { declared: 2, missing: [{ cmd: 'b', btn: 'btn-b', label: '' }] });
  const res = (status, body) => async () => ({ status, json: async () => body });
  assert.equal((await probeAiProxy(res(401, { error: 'auth' }), 'https://x.supabase.co', 'k')).state, 'reachable', 'ai-proxy refusing an anonymous request IS ai-proxy answering');
  assert.equal((await probeAiProxy(res(503, { error: 'x' }), 'https://x.supabase.co', 'k')).state, 'error');
  assert.equal((await probeAiProxy(async () => { throw new TypeError('Failed to fetch'); }, 'https://x.supabase.co', 'k')).state, 'unobservable', 'a fetch that throws is not «down»');
  assert.equal((await probeAiProxy(res(401, { error: 'auth' }), '', 'k')).state, 'unobservable');
  /* the probe asks what the function refuses BEFORE it reads a body or the quota */
  const src = read('supabase/functions/ai-proxy/index.ts');
  const serve = src.indexOf('Deno.serve('), auth = src.indexOf('json({ error: "auth"', serve), quota = src.indexOf('consume', serve);
  assert.ok(serve > 0 && auth > serve && (quota < 0 || auth < quota), 'ai-proxy still answers 401 {error:"auth"} before anything is consumed');
});
