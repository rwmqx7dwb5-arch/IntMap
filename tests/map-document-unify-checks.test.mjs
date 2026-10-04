/* ============================================================================
 *  map-document-unify — four ways of keeping a map, one map document   (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code (and, where the claim is about who writes what, by reading it):
 *    ① ONE PACKING (js/link-codec.js): a written tour's `t` is byte-for-byte what the old copy in js/tours.js
 *      wrote (a fixture written by it, as text), the briefing's `b` round-trips through it, and both readers stop
 *      at their inflate ceilings — neither file packs on its own any more;
 *    ② ONE LINK ASSEMBLY (MapState.pageLink) and ONE FRAGMENT RULE (MapState.canonical): the places that wrote
 *      `location.origin + location.pathname` or `encode(decode(…))` by hand call them, and they say what they did;
 *    ③ THE DOCUMENT (js/map-doc.js): each of the four forms ⇄ a document without loss — a saved row, a tour
 *      draft, a my map (its drawing in the fragment's `mm=`), a notebook entry and a briefing (their view through
 *      the one translation, stateOfNotebookView, which the briefing link's camera also takes);
 *    ④ SAVING AND SHARING: a one-map document goes through the four-argument save_view exactly as a map did; a
 *      tour through the six-argument one with its kind and steps; a published row with steps is a tour the
 *      classroom player plays (its `t` decodes to the same steps); Atlas keeps and opens them;
 *    ⑤ THE MIGRATION AND THE PAGE AGREE on the fences, and the public read carries only what was filed;
 *    ⑥ EVERY OLD ADDRESS STILL OPENS: `?collection=`, `?tour=…&t=`, `mm=`, `b=`, `?story=`, and a map link's bytes.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (p) => codeOnly(read(p), { lang: 'js' });

const LC = await import('../js/link-codec.js');
const tours = await import('../js/tours.js');
const { MapState, encode, decode, canonical, pageLink } = await import('../js/map-state.js');
const MD = await import('../js/map-doc.js');
const MMD = await import('../js/my-map-doc.js');
const BC = await import('../js/atlas-briefing-codec.js');

/* ══ ① ONE PACKING ═══════════════════════════════════════════════════════════════════════════════ */
/* WRITTEN BY THE OLD CODE (js/tours.js before map-document-unify, its own b64url + Response(Blob.stream()) pipe), on
   node 24, 2026-10-04 — kept as text so the new packing is held to the bytes a link already sent carries. */
const OLD_TOUR = { title: '明治の日本 · Meiji', steps: [
  { hash: '#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', title: '1868', say: '令制国で区切っています。', ask: 'どの国？' },
  { hash: '#v=22.0000,48.5000,3.30,0,0,f&l=dl-ww1&tt=1918-11-11', title: 'Europe 1918', say: 'Armistice day — "quotes" & <tags>', ask: '' },
  { hash: '', title: 'no map', say: '', ask: 'why?' }] };
const OLD_T = 'zNc29SsNQHAXwV7mcodM_4d7GhhiM4uDoE7QZgo0aaZvapA1FhF4R7CBOgkoFB78QpIODgrUOPorXZPUV5EblDIdzlt8eBnAFoQMXxflJ8TRTclqc3RaXj-zjha2H0U4EQgK3XsfAE5Zt1jjnZNkm110zOSedzUqaesKxHUMIgwsQ9ADha3aTj5_zyVzJ-_z4NR8fKXmt5J2Sh0q-K3mhRgcgKPmg5DSfzL_fruCTxqrVX2PB-TNN699qec2WkWWiRBdFiQqNrvV7cTdk-gNhtdeOkjTaCFkzGLLP0SlrYLcfp2HSAKuwpTTYSpZBKEEQOjFrB119ELLt4Qp8f_8H';

test('① a written tour\'s `t` is the bytes the old packing wrote, and both readers keep their ceilings', async () => {
  assert.equal(await tours.encodeCustomTour(OLD_TOUR), OLD_T, 'the export name and the output bytes of the tour codec are unchanged');
  const back = await tours.decodeCustomTour(OLD_T, MapState.canonical);
  assert.deepEqual(back.steps.map((s) => s.hash), [OLD_TOUR.steps[0].hash, OLD_TOUR.steps[1].hash, null], 'the old link reads back step for step');
  /* the uncompressed form is the JSON itself, in base64url */
  const json = JSON.stringify({ v: 1, n: OLD_TOUR.title, s: OLD_TOUR.steps.map((s) => [s.hash.replace(/^#/, ''), s.title, s.say, s.ask]) });
  assert.equal(LC.toBase64url(new TextEncoder().encode(json)), Buffer.from(json).toString('base64url'), 'base64url is RFC 4648 §5 without padding');
  assert.deepEqual(Array.from(LC.fromBase64url(LC.toBase64url(new Uint8Array([0, 255, 62, 63])))), [0, 255, 62, 63]);
  /* a bomb: a few kilobytes that inflate past each reader's ceiling are refused by name, never truncated */
  const bomb = 'z' + LC.toBase64url(await LC.deflateRaw(new Uint8Array(tours.TOUR_INFLATED_MAX + 1)));
  assert.ok(bomb.length < 8192, 'the bomb fits in a link (' + bomb.length + ' characters)');
  assert.equal(await tours.decodeCustomTour(bomb, MapState.canonical), null, 'a tour that inflates past TOUR_INFLATED_MAX is not read');
  await assert.rejects(LC.inflateRaw(await LC.deflateRaw(new Uint8Array(1025)), 1024), /too-large/);
  const bBomb = 'z' + LC.toBase64url(await LC.deflateRaw(new Uint8Array(BC.MAX_INFLATED + 1)));
  await assert.rejects(BC.unpackBriefing(bBomb), /too-large/, 'the briefing reader keeps its own ceiling');
  /* neither codec packs on its own: the one packing is imported, and no second btoa / CompressionStream is written */
  for (const f of ['js/tours.js', 'js/atlas-briefing-codec.js']) {
    const c = code(f);
    assert.match(c, /from '\.\/link-codec\.js'/, f + ' imports the one packing');
    assert.doesNotMatch(c, /\bbtoa\(|\batob\(|new (De)?CompressionStream\(/, f + ' has no packing of its own');
  }
  const owners = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).filter((f) => /new (De)?CompressionStream\(['"]deflate-raw/.test(code('js/' + f)));
  assert.deepEqual(owners, ['link-codec.js'], 'deflate-raw is written in one file');
});

/* ══ ② ONE LINK ASSEMBLY, ONE FRAGMENT RULE ════════════════════════════════════════════════════════ */
test('② a link is assembled by MapState.pageLink, and a fragment from outside is rewritten by MapState.canonical', () => {
  const loc = { origin: 'https://example.test', pathname: '/IntMap/', search: '?tour=x&step=2' };
  assert.equal(pageLink(null, '#v=1', loc), 'https://example.test/IntMap/?tour=x&step=2#v=1', 'null keeps the page\'s query (the share link)');
  assert.equal(pageLink('', 'v=1', loc), 'https://example.test/IntMap/#v=1', '\'\' drops it; a fragment without # gets one');
  assert.equal(pageLink('?collection=abc', '', loc), 'https://example.test/IntMap/?collection=abc', 'a page query with no fragment');
  assert.equal(pageLink('story=a', '', { origin: 'o', pathname: '' }), 'o/?story=a');
  assert.equal(canonical('v=10,50,4,0,0,f&evil=<x>&tt=1914-07-28'), '#v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28', 'what the codec does not write is dropped');
  assert.equal(canonical('#l=dl-ww1'), '', 'a fragment that names no view is not a map');
  assert.equal(MapState.canonical, canonical); assert.equal(MapState.pageLink, pageLink);
  /* the places that assembled the link by hand now ask the one assembly */
  const linkers = { 'js/map-state.js': 'link()', 'js/my-map.js': 'a my map\'s link', 'js/atlas-briefing.js': 'the briefing\'s page', 'js/tour-builder.js': 'a written tour\'s link',
    'js/shared-collection.js': 'a published collection', 'js/news-story.js': 'a news story', 'js/embed-mode.js': 'an embed\'s «Open in IntMap»' };
  for (const [f, what] of Object.entries(linkers)) {
    const c = code(f);
    assert.doesNotMatch(c.replace(/export function pageLink[\s\S]*?\n}\n/, ''), /location\.origin\s*\+\s*location\.pathname/, f + ' (' + what + ') does not assemble a link by hand');
    if (f !== 'js/map-state.js') assert.match(c, /\bpageLink\(/, f + ' (' + what + ') calls the one assembly');
  }
  for (const f of ['js/tour-player.js', 'js/my-places.js']) assert.match(code(f), /MapState\.canonical\b/, f + ' rewrites a fragment from outside with the one rule');
  const handwritten = readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'map-state.js').filter((f) => /encode\(\s*(MapState\.)?decode\(/.test(code('js/' + f)));
  assert.deepEqual(handwritten, [], 'encode(decode(…)) is written once, in js/map-state.js canonical');
});

/* ══ ③ THE DOCUMENT ⇄ EACH FORM ═══════════════════════════════════════════════════════════════════ */
const strip = (d) => ({ kind: d.kind, title: d.title, note: d.note, steps: d.steps });

test('③ each of the four forms becomes a document and comes back without loss', async () => {
  /* a saved row of one map: the row it always was */
  const row = { id: 'v1', name: 'Europe 1914', note: 'for Thursday', collection: 'Class', state: 'v=10.0000,50.0000,4.00,0,0,f&tt=1914-07-28', kind: 'view', steps: null };
  const d1 = MD.fromSavedView(row);
  assert.deepEqual(MD.toSavedView(d1), { name: 'Europe 1914', note: 'for Thursday', state: row.state, kind: 'view', steps: null }, 'one map with no words: steps null, as every row before documents');
  assert.equal(MD.fromSavedView({ name: 'Old', state: row.state }).kind, 'view', 'a row from before documents (no kind, no steps) is a map');

  /* a tour draft → document → the row → document → the builder's tour */
  const draft = { title: 'Meiji', steps: [{ title: '1868', say: 'provinces', ask: 'which?', hash: '#v=136.5,36,5,0,0,f&tt=1868-11-01' }, { title: 'later', say: '', ask: '', hash: null }, { title: '1900', say: 's', ask: '', hash: '#v=136.5,36,5,0,0,f&tt=1900-01-01' }] };
  const t = MD.fromTourDraft(draft);
  assert.equal(t.kind, 'tour'); assert.equal(t.steps.length, 3); assert.ok(MD.isTour(t));
  const saved = MD.toSavedView(t);
  assert.equal(saved.state, 'v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', 'the row\'s map is the first step\'s map, as the codec writes it');
  assert.equal(saved.steps.length, 3);
  const t2 = MD.fromSavedView(Object.assign({ id: 'x', collection: '' }, saved));
  assert.deepEqual(strip(t2), strip(t), 'a tour survives the account');
  assert.deepEqual(MD.toTourInput(t2), { title: 'Meiji', steps: [
    { title: '1868', say: 'provinces', ask: 'which?', hash: '#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01' }, { title: 'later', say: '', ask: '', hash: null },
    { title: '1900', say: 's', ask: '', hash: '#v=136.5000,36.0000,5.00,0,0,f&tt=1900-01-01' }] }, 'and comes back as the tour the builder and player read');
  assert.deepEqual(strip(MD.fromCustomTour(await tours.decodeCustomTour(await tours.encodeCustomTour(MD.toTourInput(t2)), MapState.canonical))), strip(t2), '…and through a `t`');
  /* the two links a document has: its map's, and its tour's — the same addresses the share link and the tour builder write */
  assert.equal(MD.toLink(t2, 'https://example.test/IntMap/'), 'https://example.test/IntMap/#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01');
  const tl = await MD.toTourLink(t2, 'https://example.test/IntMap/', tours.encodeCustomTour, tours.customTourLink);
  assert.equal(tl, tours.customTourLink('https://example.test/IntMap/', await tours.encodeCustomTour(MD.toTourInput(t2)), '#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01'));
  const q = tours.tourFromSearch(tl.slice(tl.indexOf('?'), tl.indexOf('#')));
  assert.equal(q.id, 'custom'); assert.deepEqual(strip(MD.fromCustomTour(await tours.decodeCustomTour(q.t, MapState.canonical))), strip(t2), 'the tour link opens the same tour');

  /* a my map: its drawing rides in the fragment's mm= over the map it is shown on */
  const mm = MMD.newDoc('Field trip');
  mm.features.push(MMD.makeFeature({ kind: 'pin', name: 'Meet', note: 'gate', color: 0, coords: [[135.758751, 34.985585]] }).feature);
  mm.features.push(MMD.makeFeature({ kind: 'line', name: 'Walk', note: '', color: 2, coords: [[135.7, 34.9], [135.8, 35.0]] }).feature);
  const here = decode('#v=135.7500,34.9800,12.00,0,0,f&l=dl-ww1&tt=2026-10-04');
  const m = MD.fromMyMap(mm, here);
  assert.equal(m.kind, 'map'); assert.equal(m.title, 'Field trip');
  const st = decode('#' + m.steps[0].state);
  assert.deepEqual(st.layers, ['dl-ww1'], 'over the map as it is shown');
  const back = MMD.fromLinkValue(st.mymap);
  assert.equal(back.dropped, 0);
  assert.deepEqual(back.doc.features.map((f) => [f.kind, f.name, f.note, f.color, f.coords]), mm.features.map((f) => [f.kind, f.name, f.note, f.color, f.coords]), 'the drawing comes back whole');
  assert.equal(MD.toSavedView(m).steps, null, 'a my map is one map: saved through the four-argument door');
  assert.equal(MD.fromSavedView({ name: 'r', state: m.steps[0].state, kind: 'view' }).kind, 'view', 'the kind the row says is the kind it is');
  assert.equal(MD.kindOf([{ state: m.steps[0].state }]), 'map', 'a document nobody named, whose map carries a drawing, is a my map');

  /* a notebook entry: its view through the one translation; a base toggle is not a field of the link */
  const kinds = { 'dl-ww1': 'layer', 'dl-nightside': 'display' };
  const classify = (id) => kinds[id] || null;
  const view = { camera: { lng: 22, lat: 48.5, zoom: 3.3, bearing: 10, pitch: 0, base: 'satellite', projection: 'flat' }, time: { live: false, t: Date.UTC(1918, 10, 11, 12) }, layersOn: ['dl-ww1', 'dl-nightside', 'base-borders'] };
  const e = { id: 'nb-abc-123456', question: 'What happened in Europe?', answer: '**Armistice.**', title: 'Europe 1918', note: 'mine', view, at: 1 };
  const nb = MD.fromNotebookEntry(e, { classify });
  assert.equal(nb.kind, 'brief'); assert.equal(nb.steps[0].say, '**Armistice.**'); assert.equal(nb.steps[0].title, e.question);
  assert.equal(nb.steps[0].state, 'v=22.0000,48.5000,3.30,10,0,f&l=dl-ww1&d=dl-nightside&tt=1918-11-11&sat=1', 'camera, layers, display items and the day — a base toggle is left out');
  assert.equal(MD.stateOfNotebookView({ camera: { lng: 1, lat: 2, zoom: 3, projection: '3d-terrain' } }).terrain, true);
  assert.equal(MD.stateOfNotebookView({ time: {} }), null, 'no camera, no map');
  assert.equal(MD.stateOfNotebookView({ camera: view.camera, time: { live: false, t: Date.UTC(-200, 0, 1) } }, { time: true }).time.at, '-000200-01-01', 'a year before 1 in the expanded form the address bar writes');
  /* the day is the rule's owner's (js/hist-scale.js ymd, which js/chronos.js reads): map-doc states it again for node, and the two are run side by side */
  if (!globalThis.window) globalThis.window = globalThis;
  await import('../js/hist-scale.js');
  for (const y of [-200, 1, 1918, 9999, 10000]) {
    const t = Date.UTC(y, 6, 4); const d = new Date(t); d.setUTCFullYear(y);
    assert.equal(MD.stateOfNotebookView({ camera: view.camera, time: { live: false, t: d.getTime() } }, { time: true }).time.at, globalThis.IntMapHistScale.ymd(d), 'year ' + y + ': the same day as js/hist-scale.js ymd');
  }
  const nbRow = MD.toSavedView(nb);
  assert.ok(nbRow.steps && nbRow.steps.length === 1, 'an answer keeps its words: a one-step document with steps');
  assert.deepEqual(strip(MD.fromSavedView(Object.assign({ id: 'y' }, nbRow))), strip(nb));

  /* a briefing: a step per section; its link's camera is the same translation */
  const b = { title: 'Two answers', at: 5, sections: [{ question: 'Q1', answer: 'A1', view }, { question: 'Q2', answer: 'A2', view: { camera: { lng: 1, lat: 2, zoom: 3 } } }] };
  const bd = MD.fromBriefing(b, { classify });
  assert.equal(bd.steps.length, 2); assert.ok(MD.isTour(bd), 'a briefing of two answers plays as a tour');
  assert.equal(bd.steps[1].state, 'v=1.0000,2.0000,3.00,0,0,g');
  assert.equal(BC.briefingLink('p', b, 'zX', null), 'p#v=22.0000,48.5000,3.30,10,0,f&sat=1&b=zX', 'the briefing link still carries only the camera (the briefing restores the rest)');
  assert.match(code('js/atlas-briefing-codec.js'), /stateOfNotebookView/, 'through the one translation');
});

/* ══ ④ SAVING, SHARING, PLAYING ══════════════════════════════════════════════════════════════════ */
function rpcDB() {
  const calls = [];
  return { calls, rpc(fn, args) { calls.push({ fn, args }); return Promise.resolve({ data: [{ view_id: 'v' + calls.length, created: true, view_count: calls.length }], error: null }); } };
}

test('④ a document is saved through the same door, a one-map one exactly as before; a shared tour plays', async () => {
  const M = await import('../js/my-places.js');
  const DB = rpcDB();
  await M.saveView(DB, { name: 'A map', state: '#v=1,2,3,0,0,f' });
  assert.deepEqual(Object.keys(DB.calls[0].args).sort(), ['p_collection', 'p_name', 'p_note', 'p_state'], 'a map: the four arguments, as before');
  const tour = MD.fromTourDraft({ title: 'Lesson', steps: [{ hash: '#v=1,2,3,0,0,f', title: 'a' }, { hash: '#v=4,5,6,0,0,f', title: 'b' }] });
  const r = await M.saveView(DB, { doc: tour, collection: 'Class' });
  assert.equal(r.ok, true); assert.equal(r.name, 'Lesson', 'named by its title');
  const a = DB.calls[1].args;
  assert.equal(a.p_kind, 'tour'); assert.equal(a.p_state, 'v=1.0000,2.0000,3.00,0,0,f');
  assert.deepEqual(a.p_steps.map((s) => s.state), ['v=1.0000,2.0000,3.00,0,0,f', 'v=4.0000,5.0000,6.00,0,0,f'], 'a tour: its kind and its steps');
  const mm = MD.fromSavedView({ name: 'mm', state: 'v=1.0000,2.0000,3.00,0,0,f&mm=eyJ2IjoxfQ' });
  await M.saveView(DB, { doc: mm });
  assert.equal(DB.calls[2].args.p_kind, undefined, 'a my map is one map: the database names its kind from its fragment');
  assert.equal((await M.saveView(DB, { doc: MD.fromTourDraft({ title: 'x', steps: [{ hash: null, title: 'no map' }] }) })).error, 'no_map', 'a document with no map is not saved');
  for (const e of ['too_many_steps', 'too_large']) assert.notEqual(M.placeFailureText(e, 'en'), M.placeFailureText(e, 'jp'), e + ' is said in both languages');
  assert.match(M.placeFailureText('too_many_steps', 'en'), new RegExp(String(MD.STEPS_MAX)), 'the fence the reader is told is the page\'s one copy');
  for (const k of MD.KINDS) assert.notEqual(M.kindLabel(k, 'en'), M.kindLabel(k, 'jp'));

  /* a published row with steps (shared_collection's shape) is a tour, and the `t` the player is handed decodes to its steps */
  const pub = { name: 'Lesson', note: '', collection: 'Class', state: a.p_state, kind: 'tour', steps: a.p_steps };
  const d = MD.fromSavedView(pub);
  assert.ok(MD.isTour(d));
  const played = await tours.decodeCustomTour(await tours.encodeCustomTour(MD.toTourInput(d)), MapState.canonical);
  assert.deepEqual(played.steps.map((s) => s.hash), ['#v=1.0000,2.0000,3.00,0,0,f', '#v=4.0000,5.0000,6.00,0,0,f'], 'the classroom player plays the same maps');
  /* the doors that open a published or saved document are the one door */
  assert.match(code('js/shared-collection.js'), /openDoc\(d\)/, 'a published document opens through openDoc (a tour plays)');
  assert.match(code('js/my-places.js'), /startTour\(T\.CUSTOM_TOUR_ID/, 'a document plays as `?tour=custom` — the player a written tour plays in');
  assert.match(code('js/my-places.js'), /export async function deviceDocs\(\)/, 'the Library lists what this device holds');
  for (const f of ['js/my-map.js', 'js/tour-builder.js', 'js/atlas-notebook.js', 'js/atlas-briefing.js']) assert.match(read(f), /Save to account|Save as a map/, f + ' keeps its own entrance and can write to the same Library');

  /* Atlas: saveMap keeps any kind, openSavedMap plays a tour */
  const PLACES = (await import('../js/atlas-cap-places.js')).default;
  const save = PLACES.find((c) => c.row[0] === 'places.saveView'), open = PLACES.find((c) => c.row[0] === 'places.openView');
  assert.deepEqual(save.schema().properties.what.enum, ['map', 'myMap', 'tour', 'atlasTour', 'answer']);
  assert.ok(open.schema().properties.asMap && open.schema().properties.step);
  assert.match(save.doc[0].text, /"what"/); assert.match(open.doc[0].text, /PLAYED/);
});

/* ══ ⑤ THE MIGRATION AND THE PAGE AGREE ══════════════════════════════════════════════════════════ */
test('⑤ the fences are one number each, and the public read carries only what was filed', () => {
  const MIG = read('supabase/migrations/20261004120000_map_documents.sql');
  const SQL = codeOnly(MIG, { lang: 'sql' });
  assert.equal(Number(/function public\.saved_view_steps_limit\(\)[\s\S]*?select (\d+)/.exec(SQL)[1]), MD.STEPS_MAX, 'js/map-doc.js STEPS_MAX is the database\'s fence');
  const MiB = Number(/octet_length\(steps::text\)\s*<=\s*(\d+)/.exec(SQL)[1]);
  assert.equal(tours.TOUR_INFLATED_MAX, 2 * MiB, 'a tour inflates to at most twice the largest steps the account keeps (js/tours.js states why)');
  /* the six-argument door has no defaults (a four-argument call stays unambiguous) and decides the account itself */
  const six = /create or replace function public\.save_view\(([^)]*)\)/g; const sigs = [...SQL.matchAll(six)].map((m) => m[1]);
  const s6 = sigs.find((x) => /p_steps/.test(x));
  assert.ok(s6 && !/default/.test(s6), 'p_kind and p_steps have no defaults');
  assert.ok(sigs.some((x) => /p_collection text default null\s*$/.test(x.trim())), 'the four-argument door keeps its defaults');
  assert.doesNotMatch(SQL, /\buuid\b[^;]*\bp_/i, 'no door takes an account');
  assert.match(SQL, /revoke execute on function public\.save_view\(text, text, text, text, text, jsonb\) from public, anon/);
  /* the public read: built from named keys, kind and steps added, nothing whole-row */
  const body = SQL.slice(SQL.indexOf('function public.shared_collection('), SQL.indexOf('comment on function public.shared_collection'));
  assert.match(body, /'kind', v\.kind, 'steps', v\.steps/);
  assert.doesNotMatch(body, /to_jsonb\(\s*[a-z]\s*\)|doc_md5|user_id'/, 'no whole row, no identity hash, no account in the public read');
  assert.match(MIG, /comment on function public\.shared_collection\(text\) is[\s\S]*?ANON MAY CALL: \S/, 'and it still says why anon may call it');
  assert.match(SQL, /on conflict \(user_id, doc_md5\) do nothing/, 'a copy is the same document once');
  for (const k of ['kind', 'steps']) assert.doesNotMatch(SQL, new RegExp('grant update \\([^)]*\\b' + k + '\\b'), k + ' is not updatable in place');
  assert.doesNotMatch(SQL, /\bdrop\s+column\b|\bdelete\s+from\b|\btruncate\b/i, 'non-destructive');
});

/* ══ ⑥ EVERY OLD ADDRESS STILL OPENS ════════════════════════════════════════════════════════════ */
test('⑥ ?collection=, ?tour=…&t=, mm=, b=, ?story= and a map link read back as they did', async () => {
  const S = await import('../js/shared-collection.js');
  const tok = '0123456789abcdef0123456789abcdef';
  assert.equal(S.tokenFromSearch('?collection=' + tok), tok);
  assert.equal(S.shareUrl(tok, { origin: 'https://example.test', pathname: '/IntMap/' }), 'https://example.test/IntMap/?collection=' + tok);
  assert.deepEqual(tours.tourFromSearch('?tour=custom&t=' + OLD_T + '&step=2'), { id: 'custom', step: 2, t: OLD_T });
  assert.deepEqual(tours.tourFromSearch('?tour=meiji-japan&step=3'), { id: 'meiji-japan', step: 3 });
  const core = await import('../js/news-story-core.js');
  assert.ok(core.storyFromSearch(core.storyQuery(['afd', 'victory'])), '?story= reads back');
  const link = '#v=10.0000,50.0000,4.00,0,0,f&l=dl-ww1&d=dl-nightside&tt=1914-07-28&cmp=x&ct=1900-01-01&sat=1&t3=1&title=Europe&note=hi&b=zAbC&mm=eyJ2IjoxfQ';
  assert.equal(encode(decode(link)), link, 'a link with every field means the same map, byte for byte');
  assert.equal(decode(link).brief, 'zAbC'); assert.deepEqual(decode(link).mymap, { v: 1 });
  assert.equal(canonical(link), link);
});
