/* ============================================================================
 *  then-now-card — 「あの頃といま」: what Node can answer (the page half is tests/then-now-card.spec.js)
 * ----------------------------------------------------------------------------
 *    ① the link: the swipe is `cmp=s` / `cmp=s<percent>`, beside X-ray and side by side, and every older link reads
 *      as it did;
 *    ② the two-instant card's layout, in each postcard shape: the panes' instants (with the THEN pane's layer under
 *      it), the headline and the band are inside the frame and do not overlap;
 *    ③ the place's name: «name, country» from the reverse-geocode record, nothing when the record names nothing;
 *    ④ Atlas: `thenNow` is registered and described in en and jp, forwards what it was asked to the window's own door,
 *      says the state it set out to reach (the swipe, the window's instant) and refuses a year before the clock's floor;
 *      the timeView observer reads the window's mode, so a swipe asked for is a swipe observed.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const S = await import('../js/map-state.js');
const M = await import('../js/map-recorder.js');

/* ══ ① the link ═══════════════════════════════════════════════════════════════════════════════════ */
test('① the swipe travels in the link, with where its divider stands; older links read as before', () => {
  const v = '#v=13.4000,52.5000,4.00,0,0,f';
  const swipe = S.decode(v + '&cmp=s&ct=1914');
  assert.deepEqual(swipe.compare, { xray: false, at: '1914', swipe: 50 });
  assert.equal(S.encode(swipe), v + '&cmp=s&ct=1914', 'the middle is written as the bare `s`');
  const at30 = S.decode(v + '&cmp=s30&ct=1600');
  assert.equal(at30.compare.swipe, 30);
  assert.equal(S.encode(at30), v + '&cmp=s30&ct=1600');
  assert.equal(S.decode(v + '&cmp=s0').compare.swipe, 0, 'the left edge is a place the divider can stand');
  assert.equal(S.decode(v + '&cmp=s100').compare.swipe, 100);
  assert.equal(S.decode(v + '&cmp=s250').compare.swipe, 100, 'a hand-written position past the edge stands at the edge');
  /* the older spellings are untouched, byte for byte */
  for (const h of [v + '&cmp=1', v + '&cmp=x&ct=1914', v + '&cmp=1&ct=now', v]) assert.equal(S.encode(S.decode(h)), h, h);
  assert.deepEqual(S.decode(v + '&cmp=x').compare, { xray: true, at: '' }, 'an X-ray link decodes to the shape it always had');
  assert.deepEqual(S.decode(v + '&cmp=1').compare, { xray: false, at: '' });
  /* the swipe wins over the X-ray flag if a state ever carries both */
  assert.match(S.encode({ view: S.decode(v).view, compare: { xray: true, at: '', swipe: 62 } }), /&cmp=s62$/);
  const row = S.SCHEMA.find((f) => f.key === 'compare');
  assert.match(row.doc, /swipe/);
  assert.deepEqual(row.params, ['cmp', 'ct'], 'no new parameter: the swipe is a value of `cmp`');
});

/* ══ ② the layout ════════════════════════════════════════════════════════════════════════════════ */
const measure = (s, font) => String(s).length * 0.6 * +/(\d+(?:\.\d+)?)px/.exec(font)[1];
const inside = (b, W, H) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const brand = { name: 'IntMap', link: 'example.org/IntMap', full: 'https://example.org/IntMap/#v=13.4,52.5,4,0,0,f&cmp=s&ct=1914' };
const credits = ['© OpenFreeMap © OpenMapTiles © OSM', 'CShapes 2.0 (Schvitz et al. 2022, CC BY-NC-SA 4.0)', '© CARTO © OpenStreetMap contributors'];

test('② the two-instant card in every postcard shape: instants, the THEN layer, the headline and the band fit and do not collide', () => {
  for (const [k, sz] of Object.entries(M.POSTCARD_SIZES)) {
    const L = M.layoutFrame({ w: sz.w, h: sz.h, panes: [{ label: '1914', sub: 'Historical borders' }, { label: 'Today' }], credits, brand,
      headline: { title: 'Europe, 1914 and today', place: 'Berlin, Deutschland' } }, measure);
    assert.equal(L.panes.length, 2, k);
    assert.ok(L.divider > 0, k + ': the divider is drawn');
    const [a, b] = L.panes;
    assert.ok(a.label.sub && a.label.sub.text === 'Historical borders', k + ': the THEN pane says what it draws');
    assert.equal(b.label.sub, null, k + ': the NOW pane has no second line');
    assert.ok(L.headline, k + ': the headline card is laid out');
    const boxes = { then: a.label.box, now: b.label.box, headline: L.headline.box, band: L.band };
    for (const [n, bx] of Object.entries(boxes)) assert.ok(inside(bx, sz.w, sz.h), k + ': ' + n + ' leaves the frame ' + JSON.stringify(bx));
    assert.ok(!overlap(L.headline.box, L.band), k + ': the headline sits on the band');
    assert.ok(!overlap(L.headline.box, a.label.box) && !overlap(L.headline.box, b.label.box), k + ': the headline covers an instant');
    assert.ok(!overlap(a.label.box, b.label.box), k + ': the two instants collide');
    /* each instant's box holds its own text and its second line */
    const lb = a.label.box, sub = a.label.sub;
    assert.ok(sub.y + sub.h <= lb.y + lb.h + 0.5 && sub.x + sub.w <= lb.x + lb.w + 0.5, k + ': the layer line leaves its box');
    assert.ok(a.label.box.x + a.label.box.w <= a.rect.x + a.rect.w + 0.5 || L.tall, k + ': the THEN instant crosses into NOW');
    /* the headline is centred on the frame, its lines too */
    assert.ok(Math.abs(L.headline.box.x + L.headline.box.w / 2 - sz.w / 2) <= 1, k + ': the headline is not centred');
    assert.deepEqual(L.headline.lines.map((l) => l.kind), ['title', 'place'], k);
  }
});

test('② with no title and no place there is no headline; a single pane ignores a headline and keeps its caption rules', () => {
  const sz = M.POSTCARD_SIZES.card;
  const none = M.layoutFrame({ w: sz.w, h: sz.h, panes: [{ label: '1914' }, { label: 'Today' }], credits, brand, headline: { title: '', place: '' } }, measure);
  assert.equal(none.headline, null);
  const placeOnly = M.layoutFrame({ w: sz.w, h: sz.h, panes: [{ label: '1914' }, { label: 'Today' }], credits, brand, headline: { title: '', place: 'Sarajevo, Bosna i Hercegovina' } }, measure);
  assert.deepEqual(placeOnly.headline.lines.map((l) => l.kind), ['place']);
  const one = M.layoutFrame({ w: sz.w, h: sz.h, panes: [{ label: '1914' }], credits, brand, headline: { title: 'x', place: 'y' } }, measure);
  assert.equal(one.headline, null, 'the headline belongs to the two-pane card');
});

/* ══ ③ the place ═════════════════════════════════════════════════════════════════════════════════ */
test('③ the place is «name, country» from the record, the country alone when that is the name, and nothing it was not told', () => {
  const rec = (name, chain) => ({ status: 'ok', name, chain: chain.map((n, i) => ({ key: 'k' + i, name: n })) });
  assert.equal(M.placeText(rec('Bayern', ['Bayern', 'Deutschland'])), 'Bayern, Deutschland');
  assert.equal(M.placeText(rec('France', ['France'])), 'France');
  assert.equal(M.placeText(rec(null, ['Île-de-France', 'France'])), 'Île-de-France, France', 'no name: the chain\'s first unit');
  assert.equal(M.placeText({ status: 'none', reason: 'no-named-area' }), '', 'the open sea is named nothing');
  assert.equal(M.placeText({ status: 'unavailable', reason: 'timeout' }), '');
  assert.equal(M.placeText(null), '');
});

/* ══ ④ Atlas ══════════════════════════════════════════════════════════════════════════════════════ */
const TIME = (await import('../js/atlas-cap-time.js')).default;
const THEN_NOW = TIME.find((e) => e.row[0] === 'time.thenNow');
const COMPARE = TIME.find((e) => e.row[0] === 'time.compare');
function kernel() {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null),
    note: (h) => '<note>' + h + '</note>', warn: (h) => '<warn>' + h + '</warn>', esc, L: (en) => en };
}

test('④ thenNow is registered beside timeCompare, watched by the same observer, and described in en and jp', () => {
  assert.ok(THEN_NOW, 'time.thenNow is an entry of js/atlas-cap-time.js');
  assert.equal(THEN_NOW.row[1], 'thenNow');
  assert.equal(THEN_NOW.row[4], 'timeView', 'its result is checked against what the window reports');
  for (const k of String(COMPARE.row[5]).split(',')) assert.ok(String(THEN_NOW.row[5]).split(',').includes(k), 'it is serialised with timeCompare (' + k + ')');
  assert.deepEqual(Object.keys(THEN_NOW.schema().properties).sort(), ['layer', 'now', 'split', 'then']);
  const doc = THEN_NOW.doc.map((d) => d.text).join(' ');
  assert.match(doc, /あの頃といま/); assert.match(doc, /then and now/i); assert.match(doc, /1914年と今を比べて/);
  assert.match(doc, /"postcard"/, 'the catalogue says how the card is made');
  assert.ok(src('js/atlas-capabilities.js').includes('["time.thenNow","thenNow"'), 'the generated registry row is written (node scripts/atlas-caps.mjs --write)');
  /* the postcard's own description says what it makes while the swipe is on */
  const PANEL = TIME.length && src('js/atlas-cap-panel.js');
  assert.match(PANEL, /THEN-AND-NOW CARD/);
});

test('④ Atlas thenNow asks the window\'s own door, and states the swipe it set out to reach', async () => {
  const asked = [];
  const st = { open: true, follow: false, live: false, iso: '1914-06-15', label: '1914', main: { live: true, iso: null, label: 'Today' },
    mode: 'swipe', split: 0.5, layer: 'histb', layerName: 'Historical borders', held: false, verdict: { status: 'drawn', reason: 'x', why: null }, note: null };
  const saved = globalThis.window.IntMapCompare;
  globalThis.window.IntMapCompare = { thenNow: (o) => { asked.push(o); return { state: st, needsThen: false }; }, judged: async () => st };
  try {
    const r = await THEN_NOW.run({ type: 'thenNow', then: 1914, now: 'now', split: 0.4 }, {}, kernel());
    assert.equal(r.ok, true, r.html);
    assert.deepEqual(asked.pop(), { then: '1914', now: 'now', split: 0.4, layer: undefined });
    assert.deepEqual(r.want, { compare: { open: true, mode: 'swipe', follow: false, live: false, iso: '1914-06-15' } });
    for (const s of ['1914', 'Today', 'Historical borders']) assert.ok(r.html.includes(s), 'the result says ' + s + ': ' + r.html);
    /* no earlier time anywhere: the result says the window is waiting, and no year was chosen */
    globalThis.window.IntMapCompare.thenNow = (o) => { asked.push(o); return { state: st, needsThen: true }; };
    const w = await THEN_NOW.run({ type: 'thenNow' }, {}, kernel());
    assert.equal(w.needsThen, true);
    assert.deepEqual(asked.pop(), { then: undefined, now: undefined, split: undefined, layer: undefined });
    assert.match(w.html, /waiting/);
    /* a year before the clock reaches is refused before anything moves */
    const before = asked.length;
    const f = await THEN_NOW.run({ type: 'thenNow', then: '-99999' }, {}, kernel());
    assert.equal(f.ok, false);
    assert.equal(asked.length, before, 'the window was asked anyway');
    /* no window: said, not thrown */
    globalThis.window.IntMapCompare = undefined;
    assert.equal((await THEN_NOW.run({ type: 'thenNow', then: '1914' }, {}, kernel())).ok, false);
  } finally { globalThis.window.IntMapCompare = saved; }
});

test('④ the timeView observer reports the window\'s mode,so the swipe is what the verdict compares', async () => {
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  let st = { open: true, follow: false, live: false, iso: '1914-06-15', mode: 'swipe' };
  const saved = globalThis.window.IntMapCompare;
  globalThis.window.IntMapCompare = { timeState: () => st };
  try {
    const cap = makeAtlasCapabilities({ lang: 'en' }).resolve('time.thenNow');
    assert.ok(cap, 'time.thenNow resolves in the registry');
    assert.equal(cap.observerKind, 'timeView');
    const want = { compare: { open: true, mode: 'swipe', follow: false, live: false, iso: '1914-06-15' } };
    const before = { compare: { open: true, follow: false, live: false, iso: '1914-06-15', mode: 'sync' }, lapse: null };
    const after = await cap.observe();
    assert.equal(after.compare.mode, 'swipe', 'the observer did not read the mode');
    assert.equal(cap.verify({}, {}, before, after, { ok: true, want }).status, 'completed');
    st = Object.assign({}, st, { mode: 'sync' });
    assert.equal(cap.verify({}, {}, before, await cap.observe(), { ok: true, want }).code, 'no_change', 'a window that did not swipe was called done');
  } finally { globalThis.window.IntMapCompare = saved; }
});
