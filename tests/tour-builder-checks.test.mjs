/* ============================================================================
 *  tour-builder — a teacher's own classroom tour, kept in its address   (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code (not by reading it):
 *    ① the tour codec (js/tours.js) round-trips a tour — Japanese text included — in both written forms,
 *      and every step's fragment comes back WRITTEN BY THE MAP'S CODEC (a fragment naming no map → no link);
 *    ② `?tour=custom&t=…&step=n` is read back by the same reader the declared tours use;
 *    ③ the builder (js/tour-builder.js) records the map through MapState.hash() — the share link's encoder —
 *      and its add / edit / move / replace / remove do what they say; the draft survives a reload;
 *    ④ the share link it hands out decodes to the draft, and opens on step 1's map;
 *    ⑤ the address budget is the measured server limit: «near» is said before «over», and a tour the
 *      hosted site would refuse is not handed out as a link;
 *    ⑥ Atlas reaches it: `panel.tourBuilder` is a registry row and the planner's catalogue describes it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
if (!globalThis.window) globalThis.window = globalThis;

const tours = await import('../js/tours.js');
const { MapState } = await import('../js/map-state.js');
const canon = (h) => (MapState.carries(h) ? MapState.encode(MapState.decode(h)) : '');

/* a map the builder can read: the view owner and the share link's restore, as js/map-ui.js registers them */
let view = { lng: 139.7, lat: 35.68, zoom: 5, bearing: 0, pitch: 0, proj: 'flat' };
MapState.own('view', { read: () => view });
const restored = [];
window.IntMapBookmark = { restore: (o) => { restored.push(o); }, link: () => MapState.link() };

const B = await import('../js/tour-builder.js');

test('① the codec round-trips a tour, in both forms, and rewrites every fragment through the map codec', async () => {
  const tour = { title: '明治の日本 — my lesson', steps: [
    { hash: '#v=136.5000,36.0000,5.00,0,0,f&tt=1868-11-01', title: '1868年', say: '令制国の地図です。', ask: 'どこ？' },
    { hash: '#v=-19.0000,64.8000,4.20,0,0,f&l=eco-dl-plates,beta-dl-volc2', title: 'Iceland', say: 'Ridge & rift <b>', ask: '' },
    { hash: '#nothing-here', title: 'broken', say: '', ask: '' },
  ] };
  const z = await tours.encodeCustomTour(tour);
  assert.equal(z[0], 'z', 'compressed where CompressionStream exists');
  assert.match(z, /^[A-Za-z0-9_-]+$/, 'base64url — safe in a query without escaping');
  const back = await tours.decodeCustomTour(z, canon);
  assert.equal(back.title, tour.title);
  assert.deepEqual(back.steps.map((s) => [s.title, s.say, s.ask]), tour.steps.map((s) => [s.title, s.say, s.ask]));
  assert.equal(back.steps[0].hash, tour.steps[0].hash);
  assert.equal(back.steps[1].hash, tour.steps[1].hash);
  assert.equal(back.steps[2].hash, null, 'a fragment that names no map is a step with no link, not an address');
  /* the uncompressed form is read too */
  const json = JSON.stringify({ v: 1, n: 'T', s: [['v=1.0000,2.0000,3.00,0,0,f', 'a', 'b', 'c']] });
  const j = 'j' + Buffer.from(json, 'utf8').toString('base64url');
  const bj = await tours.decodeCustomTour(j, canon);
  assert.equal(bj.steps[0].hash, '#v=1.0000,2.0000,3.00,0,0,f');
  /* garbage is not a tour */
  for (const bad of ['', 'z', 'zzzz', 'q' + j.slice(1), 'j' + Buffer.from('{"v":2,"s":[]}').toString('base64url')]) assert.equal(await tours.decodeCustomTour(bad, canon), null, bad);
});

test('② ?tour=custom&t=…&step=n is read back by the tours reader', async () => {
  const t = await tours.encodeCustomTour({ title: 'x', steps: [{ hash: '#v=1.0000,2.0000,3.00,0,0,f' }] });
  const q = tours.tourQuery(tours.CUSTOM_TOUR_ID, 3, t);
  assert.deepEqual(tours.tourFromSearch(q), { id: 'custom', step: 3, t });
  assert.deepEqual(tours.tourFromSearch('?tour=ww1-europe&step=2'), { id: 'ww1-europe', step: 2 }, 'a declared tour carries no t');
  assert.equal(tours.tourQuery('ww1-europe', 2), '?tour=ww1-europe&step=2', 'the declared form is unchanged');
});

test('③ the builder records the map through the codec, and edits do what they say', async () => {
  B.clearDraft();
  view = { lng: 10, lat: 50, zoom: 4, bearing: 0, pitch: 0, proj: 'flat' };
  let r = await B.addCurrent({ title: 'one', say: 'first', tourTitle: 'Lesson' });
  assert.equal(r.ok, true); assert.equal(r.hash, MapState.hash(), 'the step is the share link\'s own fragment');
  view = { lng: 20, lat: 40, zoom: 6, bearing: 0, pitch: 0, proj: 'globe' };
  r = await B.addCurrent({ title: 'two' });
  view = { lng: 30, lat: 30, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' };
  r = await B.addCurrent({ title: 'zero', after: 0 });
  assert.equal(r.ok, false, 'after: 0 is not a step (steps count from 1)');
  r = await B.addCurrent({ title: 'three' });
  assert.deepEqual(B.getDraft().steps.map((s) => s.title), ['one', 'two', 'three']);
  assert.equal(B.moveStep(3, 1).ok, true);
  assert.deepEqual(B.getDraft().steps.map((s) => s.title), ['three', 'one', 'two']);
  assert.equal(B.editStep(2, { ask: 'why?' }).ok, true);
  assert.equal(B.getDraft().steps[1].say, 'first', 'edit sets only the fields given');
  view = { lng: 40, lat: 10, zoom: 2, bearing: 0, pitch: 0, proj: 'flat' };
  const before = B.getDraft().steps[2].hash;
  assert.equal((await B.replaceStep(3)).ok, true);
  assert.notEqual(B.getDraft().steps[2].hash, before);
  assert.equal(B.getDraft().steps[2].title, 'two', 'replace keeps the words');
  assert.equal(B.removeStep(9).ok, false);
  assert.equal(B.showStep(1).ok, true); assert.deepEqual(restored.at(-1), { shared: true }, 'shown through the share link\'s restore');
  /* the draft survives a reload (a fresh instance reads localStorage) */
  const B2 = await import('../js/tour-builder.js?reload');
  assert.deepEqual(B2.getDraft().steps.map((s) => [s.title, s.hash]), B.getDraft().steps.map((s) => [s.title, s.hash]));
  assert.equal(B2.getDraft().title, 'Lesson');
});

test('④ the share link decodes to the draft and opens on step 1', async () => {
  const r = await B.shareLink();
  assert.equal(r.ok, true);
  const u = new URL(r.url, 'https://example.org/IntMap/index.html');
  const q = tours.tourFromSearch(u.search);
  assert.equal(q.id, 'custom'); assert.equal(q.step, 1);
  const back = await tours.decodeCustomTour(q.t, canon);
  const d = B.getDraft();
  assert.equal(back.title, d.title);
  assert.deepEqual(back.steps.map((s) => [s.title, s.say, s.ask, s.hash]), d.steps.map((s) => [s.title, s.say, s.ask, s.hash]));
  assert.equal(u.hash, d.steps[0].hash, 'the fragment is step 1\'s map, so the boot restore opens it');
});

test('⑤ the budget is the measured limit: near before over, and an over-long tour gets no link', async () => {
  assert.equal(tours.TOUR_REQUEST_LIMIT, 8192, 'measured against the hosted site — see js/tours.js before changing it');
  B.clearDraft();
  let seed = 1; const noise = (n) => { let s = ''; for (let i = 0; i < n; i++) { seed = (seed * 48271) % 2147483647; s += String.fromCharCode(0x3041 + (seed % 80)); } return s; };   /* text that does not compress away */
  const levels = [];
  for (let i = 0; i < 60; i++) {
    view = { lng: i, lat: i / 2, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' };
    const r = await B.addCurrent({ title: 'step ' + i, say: noise(120) });
    levels.push(r.budget.level);
    if (r.budget.level === 'over') break;
  }
  const firstNear = levels.indexOf('near'), firstOver = levels.indexOf('over');
  assert.ok(firstOver > 0, 'the tour eventually exceeds the limit: ' + levels.join(','));
  assert.ok(firstNear >= 0 && firstNear < firstOver, '«near» is said before «over»: ' + levels.join(','));
  const r = await B.shareLink();
  assert.equal(r.ok, false); assert.equal(r.reason, 'too-long');
  assert.equal(B.removeStep(B.getDraft().steps.length).ok, true);
  assert.equal((await B.shareLink()).ok, true, 'one step fewer fits again');
  B.clearDraft();
  assert.equal(localStorage.getItem('intmap_tour_draft'), null, 'clearing forgets the draft');
});

test('⑥ Atlas reaches the builder: a registry row, and the catalogue describes it', async () => {
  const caps = readFileSync(path.join(ROOT, 'js/atlas-capabilities.js'), 'utf8');
  assert.ok(caps.includes('["panel.tourBuilder","tourBuilder"'), 'panel.tourBuilder is a registry row');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const text = makeAtlasCatalogText({ lang: 'en' }, {}).text(['panel.tourBuilder']);
  assert.match(text, /"type":"tourBuilder"/);
  assert.match(text, /addStep/); assert.match(text, /link/);
});
