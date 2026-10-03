/* ============================================================================
 *  atlas-briefing — an Atlas investigation as a link   (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code (not by reading it):
 *    ① a briefing round-trips through its link value: questions, answers (Japanese included), views,
 *      query rows and sources come back; a step a rebuild will not run keeps what Atlas did but not its
 *      arguments; the sender's notes go along only when they say so;
 *    ② the link is somebody else's data: every section passes the NOTEBOOK'S normalize — a javascript:
 *      source, a field of the wrong type, a section with no question are dropped, never carried;
 *    ③ a value that inflates past MAX_INFLATED is refused by name and is never read to the end; a damaged,
 *      foreign or future value is refused by name;
 *    ④ the link is a MAP link written by the map's codec: `v` is the first answer's camera, `b` is the packed
 *      briefing, decode(link) gives both back, and a link without `b` is byte-identical to before;
 *    ⑤ the store's `brief` field is owned by js/briefing-link.js, read back from it, and closing clears it;
 *    ⑥ the evidence drawn on the map is the RECORDED rows with positions, and its credit is encoded text;
 *    ⑦ Atlas reaches it: briefing.share / briefing.open are registry rows, both marked as carrying outside
 *      content, and the planner's catalogue describes them.
 *    ⑧ the notebook's claim: a turn Atlas asked to make a briefing of (thisTurn) is built even when the reader keeps
 *      nothing — handed over, not stored — and every claimant hears how its turn ended (filed / not kept / not finished).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!globalThis.window) globalThis.window = globalThis;
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const C = await import('../js/atlas-briefing-codec.js');
const { MapState, decode, encode } = await import('../js/map-state.js');

const entry = (over) => Object.assign({
  v: 1, id: 'nb-mfx1-a1b2c3d4e5f6', at: Date.UTC(2026, 9, 3, 9, 30), updatedAt: Date.UTC(2026, 9, 3, 9, 30),
  title: '台湾周辺の M5 以上の地震', question: '台湾周辺で今週起きた M5 以上の地震は？', answer: '**3 件**ありました。最大は花蓮沖の M6.1 です。',
  lang: 'jp', status: 'answered',
  view: { camera: { lng: 121.5, lat: 23.8, zoom: 6.2, bearing: 10, pitch: 30, base: 'satellite', projection: 'flat' }, time: { live: true, t: null }, layersOn: ['dl-quakes'], layerOpacity: {} },
  steps: [
    { cap: 'data.query', args: { type: 'query', table: 'quakes', where: 'mag>=5' }, status: 'completed', code: '', replay: true },
    { cap: 'research.brief', args: { type: 'brief', place: 'Taiwan', secret: 'x' }, status: 'completed', code: '', replay: false },
  ],
  results: [{ at: Date.UTC(2026, 9, 3, 9, 29), key: 'k', spec: { table: 'quakes' }, table: 'quakes', tableLabel: 'Earthquakes', matched: 3, offered: 3,
    columns: [{ id: 'mag', label: 'Magnitude', unit: '' }],
    rows: [{ id: 'us7000a', name: '花蓮沖', iso2: 'TW', lat: 23.9, lng: 121.8, v: { mag: 6.1 } }, { id: 'us7000b', name: 'no position', iso2: '', lat: null, lng: null, v: { mag: 5.2 } }],
    unapplied: [], sources: [{ what: 'USGS', src: 'https://earthquake.usgs.gov/' }] }],
  sources: [{ url: 'https://www.cwa.gov.tw/', title: 'CWA' }],
  note: 'private thought', followOf: null, pinned: true, syncedAt: 123,
}, over || {});

test('① a briefing round-trips through its link value; non-replayable steps lose their arguments; notes only on request', async () => {
  const e2 = entry({ id: 'nb-mfx2-ffffffffffff', question: 'And Japan?', answer: 'None.', results: [], steps: [], view: null });
  const b = C.buildBriefing([entry(), e2], { title: '', lang: 'jp', now: 1000 });
  assert.equal(b.f, C.BRIEFING_FORMAT); assert.equal(b.sections.length, 2);
  assert.equal(b.title, '台湾周辺で今週起きた M5 以上の地震は？', 'the title defaults to the first question');
  assert.deepEqual(b.sections[0].steps[1], { cap: 'research.brief', status: 'completed' }, 'a step a rebuild does not run keeps no arguments');
  assert.equal(b.sections[0].steps[0].args.where, 'mag>=5');
  assert.equal(b.sections[0].note, '', 'notes stay on the device unless the sender includes them');
  assert.ok(!('pinned' in b.sections[0]) && !('syncedAt' in b.sections[0]), 'the sender\'s device bookkeeping does not travel');
  const packed = await C.packBriefing(b);
  assert.match(packed, /^z[A-Za-z0-9_-]+$/, 'base64url, prefixed with its packing');
  const back = await C.unpackBriefing(packed);
  assert.equal(back.sections.length, 2);
  assert.equal(back.sections[0].answer, entry().answer);
  assert.equal(back.sections[0].results[0].rows[0].name, '花蓮沖');
  assert.deepEqual(back.sections[0].view.camera, entry().view.camera);
  assert.equal(back.rejected, 0);
  const withNotes = await C.unpackBriefing(await C.packBriefing(C.buildBriefing([entry()], { withNotes: true })));
  assert.equal(withNotes.sections[0].note, 'private thought');
});

test('② every section passes the notebook\'s own normalize: hostile fields are dropped, not carried', async () => {
  const bad = { f: C.BRIEFING_FORMAT, v: 1, title: 'x‮y', at: 1, sections: [
    Object.assign(entry(), { sources: [{ url: 'javascript:alert(1)', title: 'x' }, { url: 'https://ok.example/', title: 'ok' }], answer: { not: 'a string' }, steps: 'nope' }),
    { id: 'nb-mfx3-000000000000', question: '' },
    { id: 'not-a-notebook-id', question: 'q' },
  ] };
  const r = C.readBriefing(bad);
  assert.equal(r.sections.length, 1); assert.equal(r.rejected, 2);
  assert.deepEqual(r.sections[0].sources, [{ url: 'https://ok.example/', title: 'ok' }]);
  assert.equal(typeof r.sections[0].answer, 'string');
  assert.deepEqual(r.sections[0].steps, []);
  assert.ok(!/‮/.test(r.title), 'bidirectional overrides in the title become spaces (the caption rule)');
  assert.throws(() => C.readBriefing({ f: C.BRIEFING_FORMAT, v: 1, sections: [{ question: '' }] }), /empty-briefing/);
  assert.throws(() => C.readBriefing({ f: 'other' }), /not-a-briefing/);
  assert.throws(() => C.readBriefing({ f: C.BRIEFING_FORMAT, v: 99, sections: [] }), /newer-version/);
});

test('③ a value that inflates past the ceiling is refused by name; damaged and foreign values are refused by name', async () => {
  const huge = { f: C.BRIEFING_FORMAT, v: 1, sections: [Object.assign(entry(), { answer: 'a'.repeat(C.MAX_INFLATED + 1024) })] };
  const packed = await C.packBriefing(huge);
  assert.ok(packed.length < 200000, 'a repetitive megabyte compresses to a short link — exactly why the decoder must bound what it reads');
  await assert.rejects(C.unpackBriefing(packed), /too-large/);
  await assert.rejects(C.unpackBriefing('zAAAA'), /corrupt/);
  await assert.rejects(C.unpackBriefing('q' + 'A'.repeat(20)), /unknown-packing/);
  await assert.rejects(C.unpackBriefing('z<script>'), /not-a-briefing/);
  const notJson = 'z' + Buffer.from(await new Response(new Blob(['not json']).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()).toString('base64url');
  await assert.rejects(C.unpackBriefing(notJson), /corrupt/);
});

test('④ the link is a map link written by the map codec: v = the first answer\'s camera, b = the briefing', async () => {
  const b = C.buildBriefing([entry({ view: null }), entry({ id: 'nb-mfx4-111111111111' })], {});
  const packed = await C.packBriefing(b);
  const link = C.briefingLink('https://example.org/IntMap/index.html', b, packed, null);
  const hash = link.slice(link.indexOf('#'));
  const st = decode(hash);
  assert.equal(st.brief, packed);
  assert.deepEqual(st.view, { lng: 121.5, lat: 23.8, zoom: 6.2, bearing: 10, pitch: 30, proj: 'flat' }, 'the first section that kept a camera');
  assert.equal(st.base, 'sat');
  assert.equal(encode(st), hash, 'the codec writes the same link back');
  assert.ok(hash.endsWith('&b=' + packed), 'b is the last parameter');
  const noCam = C.buildBriefing([entry({ view: null })], {});
  assert.equal(C.briefingLink('p', noCam, 'zX', null), '', 'no camera anywhere and no map of our own: no link, rather than an invented place');
  const here = { view: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, proj: 'globe' }, base: 'map', terrain: false };
  assert.equal(C.briefingLink('p', noCam, 'zX', here), 'p#v=1.0000,2.0000,3.00,0,0,g&b=zX');
  assert.equal(decode('#v=1,2,3&b=<x>').brief, '', 'a b that is not base64url is «no briefing»');
  assert.equal(encode({ view: here.view, brief: 'a&b=c' }), '#v=1.0000,2.0000,3.00,0,0,g', 'the writer refuses a value that would end the parameter');
  assert.equal(encode(decode('#v=1.0000,2.0000,3.00,0,0,g&title=t')), '#v=1.0000,2.0000,3.00,0,0,g&title=t', 'a link without b is byte-identical');
});

test('⑤ the store\'s brief field: owned by js/briefing-link.js, read back from it, cleared on close', async () => {
  const f = MapState.SCHEMA.find((x) => x.key === 'brief');
  assert.ok(f, 'the schema declares the field');
  assert.deepEqual(f.params, ['b']); assert.equal(f.owner, 'js/briefing-link.js'); assert.equal(f.restore, 'full');
  const { BriefingLink } = await import('../js/briefing-link.js');
  assert.equal(MapState.owns('brief'), true);
  const seen = []; const off = MapState.on((e) => { if (e.key === 'brief') seen.push(e.cause); });
  BriefingLink.set('zABC');
  assert.equal(MapState.read('brief'), 'zABC');
  BriefingLink.set('bad value!'); assert.equal(MapState.read('brief'), '', 'a value that is not base64url is «none»');
  BriefingLink.set('zDEF'); BriefingLink.clear();
  assert.equal(MapState.read('brief'), '');
  assert.deepEqual(seen, ['reader', 'reader', 'reader', 'reader']);
  off();
});

test('⑥ the evidence on the map is the recorded rows with positions, and its credit is encoded text', async () => {
  window.IntMapSafe = window.IntMapSafe || { html: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  const B = await import('../js/atlas-briefing.js');
  const s = C.sectionFromEntry(entry({ results: [Object.assign({}, entry().results[0], { sources: [{ what: '<img src=x onerror=alert(1)>', src: '' }] })] }), false);
  const fc = B.evidencePoints(s);
  assert.equal(fc.features.length, 1, 'only rows that carry a position');
  assert.deepEqual(fc.features[0].geometry.coordinates, [121.8, 23.9]);
  assert.equal(fc.features[0].properties.name, '花蓮沖');
  const credit = B.evidenceCredit(s, 'en');
  assert.ok(!/<img/.test(credit) && /&lt;img/.test(credit), 'a source name from the link reaches the credit line as text');
  assert.match(credit, /2026-10-03/, 'the credit says when the rows were found');
});

test('⑦ Atlas reaches it: two registry rows, both carrying outside content, described in the catalogue', () => {
  const caps = read('js/atlas-capabilities.js');
  const row = (id) => { const m = new RegExp('\\["' + id.replace('.', '\\.') + '",[^\\n]*\\]').exec(caps); return m ? JSON.parse(m[0]) : null; };
  const share = row('briefing.share'), open = row('briefing.open');
  assert.ok(share && open, 'both rows are in the generated registry (node scripts/atlas-caps.mjs --write)');
  assert.equal(share[1], 'briefingShare'); assert.equal(open[1], 'briefingOpen');
  assert.equal(share[11], 'external'); assert.equal(open[11], 'external', 'a briefing is text somebody else\'s Atlas wrote (#R801 column 11)');
  assert.equal(open[7], 'session', 'opening puts a view back — reversible in the session');
  const src = read('js/atlas-cap-briefing.js');
  assert.match(src, /"thisTurn"\?:bool/, 'the catalogue tells the planner it can make THIS answer the briefing');
  assert.match(read('js/atlas-console.js'), /openBriefing:\(p\)=>/, 'the kernel exposes the door js/briefing-link.js calls');
});

test('⑧ a turn a briefing waits for is built even when the reader keeps nothing, and every claimant hears how it ended', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
  const el = () => ({ style: {}, dataset: {}, className: '', innerHTML: '', setAttribute() { }, addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], appendChild() { } });
  globalThis.document = globalThis.document || { createElement: el, getElementById: () => null };
  window.IntMapSafe = window.IntMapSafe || { html: (s) => String(s), url: (s) => String(s) };
  const { makeAtlasNotebook, notebookStore } = await import('../js/atlas-notebook.js');
  const NB = makeAtlasNotebook();
  const panel = Object.assign(el(), { insertBefore() { }, firstChild: null });
  NB.mount(panel, { ASTATE: { onTurnEnd() { }, captureSections: () => ({ camera: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, base: 'map', projection: 'globe' }, time: { live: true, t: null }, layers: {} }) },
    lang: () => 'en', host: () => ({}), waitIdle: async () => true, resolve: () => null, runDirect() { }, ask() { } });
  const heard = []; NB.onFiled((e, t, why) => heard.push([t.turnId, why, e ? e.question : null]));
  localStorage.setItem('intmap_atlas_notebook', JSON.stringify({ keep: false, sync: false }));
  const turn = (id, o) => Object.assign({ turnId: id, at: Date.now() - 10, question: 'Q' + id, reply: 'A' + id, status: 'done', operations: [] }, o || {});
  assert.equal(await NB.fileTurn(turn(1)), null, 'an unclaimed turn is not built while keeping is off');
  NB.claim(2); const e2 = await NB.fileTurn(turn(2));
  assert.ok(e2 && e2.question === 'Q2', 'a claimed turn is built into an entry');
  assert.equal((await notebookStore().list('')).length, 0, '…and handed over, not stored');
  NB.claim(3); await NB.fileTurn(turn(3, { status: 'cancelled' }));
  assert.deepEqual(heard, [[2, 'not-kept', 'Q2'], [3, 'not-finished', null]]);
  localStorage.setItem('intmap_atlas_notebook', JSON.stringify({ keep: true, sync: false }));
  await NB.fileTurn(turn(4));
  assert.deepEqual(heard[2], [4, 'filed', 'Q4'], 'a kept turn is filed and its listeners are told so');
  assert.equal((await notebookStore().list('')).length, 1);
});
