/* ============================================================================
 *  IntMap · atlas-before-login — the Atlas row for a past clock and for a reader with no account
 * ----------------------------------------------------------------------------
 *  Three things measured on production 2026-10-03, signed out:
 *    ① a chip tapped without an account answered 「Please log in to use AI features.」 and opened the
 *      login sheet — nothing on the row had said an account was needed;
 *    ② with Chronos on 1914 the row offered 「Slovakia does not set its own interest rates — it uses
 *      the euro…」 — today's statistics over a map drawing Austria-Hungary;
 *    ③ on the phone, the unselected Atlas segment wore the ring that reads as 「selected」.
 *
 *  ⚠ EVERY CHECK BELOW DRIVES THE SHIPPED MODULE (js/atlas-examples.js over js/atlas-view-subject.js)
 *  with a fake clock, a fake era record and a fake DOM — the property is what the row DOES for a set of
 *  facts, which no spelling in the source can show (tests/atlas-examples-checks.test.mjs #R337 / #R392).
 *  The one source-level check (③) reads the stylesheet, because a cascade is the thing being asserted.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { histScale } from './helpers/hist-scale.mjs';
import { makeAtlasExamples } from '../js/atlas-examples.js';
import { planOf, DEFAULT_PLAN } from '../supabase/functions/_shared/plans.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const HS = histScale();

/* ── the locale rows, read out of the shipped tables (a value, not a spelling: the row is what the reader sees) ── */
function localeRows(lang) {
  const src = read('js/locales/ui.' + lang + '.js');
  const out = {};
  for (const m of src.matchAll(/^\s+(atlas(?:GateNote|Pv\w+)):("(?:[^"\\]|\\.)*"),$/gm)) out[m[1]] = JSON.parse(m[2]);
  return out;
}
const EN = localeRows('en'), JP = localeRows('jp');

/* ── a fake DOM: just what the row and the card touch ── */
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.className = ''; this._t = ''; this.parent = null; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } }
  set innerHTML(v) { this.children = []; this._t = ''; }
  set textContent(v) { this.children = []; this._t = String(v); }
  get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  matches(sel) {
    const m = /^(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(sel); if (!m) throw new Error('fake DOM: ' + sel);
    if (m[1] && !String(this.className).split(/\s+/).includes(m[1])) return false;
    if (m[2] && !(m[2] in this.attrs)) return false;
    return true;
  }
  querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() {} scrollIntoView() {}
}

/* ── two era polygons and one modern country under them ── */
const sq = (props, w, s, e, n) => ({ type: 'Feature', properties: props,
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
/* `_locName` is written by js/time-borders.js's label pass in the READER'S language, and only when it is not
   English (`_eraLocName` answers null for en) — so the fixture carries it for jp only, as the page would */
const eraFC = (lang) => ({ type: 'FeatureCollection', features: [
  sq(Object.assign({ NAME: 'Austria-Hungary', _same: 0 }, lang === 'jp' ? { _locName: 'オーストリア＝ハンガリー' } : {}), 0, 0, 10, 20),
  sq({ NAME: 'German Empire', _same: 0 }, 10, 0, 20, 20)
] });
const MODERN = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'SVK',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] } }] };
/* the fixture is built so the PRESENT-DAY row really would say the reported sentence: a euro country */
const STATS = { SVK: { code: 'SVK', nameEn: 'Slovakia', sov: true, bboxAll: [0, 0, 20, 20], latlng: [10, 10],
  pop: 5.4e6, area: 49035, density: 111, gdp: 130, gdppc: 24000, lifeExp: 77, internet: 89, hdi: 0.85,
  dem: 7, milSpend: 2, capital: 'Bratislava', subregion: 'Eastern Europe', currency: 'EUR', languages: 'Slovak' } };

/* the shipped row, under a clock and an era record of the check's choosing */
function row(o) {
  const box = o.box || [4, 4, 14, 14];
  const calls = { pick: [], stage: [], login: [] };
  const pd = globalThis.document, pw = globalThis.window;
  globalThis.document = { getElementById: () => null, addEventListener: () => {},
    createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t) };
  globalThis.window = { IntMapHistScale: HS };   /* IntMapLang is imported from js/lang-registry.js — a stub here would be bypassed */
  const ew = new El('div'); ew.className = 'atl-ex';
  const panel = new El('div'); panel.appendChild(ew);
  const HOST = { lang: o.lang || 'en', user: o.user || null, t: (k) => (o.lang === 'jp' ? JP : EN)[k],
    openAuthModal: (m) => calls.login.push(m), aiLoginMsg: () => 'Please log in to use AI features.' };
  const when = o.year != null ? new Date(o.year, 6, 1) : null;
  const TB = o.era === false ? null : {
    modernAt: (w, live) => !!live || (w instanceof Date ? w.getFullYear() : w) >= 2020,
    active: () => o.drawn !== false, currentFC: () => (o.drawn === false ? null : eraFC(o.lang)),
    coverage: () => ({ active: o.drawn !== false, era: !!o.snapshot }),
    changeAt: () => Promise.resolve(new Date(1914, 7, 3))
  };
  const api = makeAtlasExamples(HOST, {
    L: (en, ja) => (HOST.lang === 'jp' && ja ? ja : en),
    GE: () => ({
      camera: { getCenter: () => ({ lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 }), getZoom: () => o.zoom || 5,
        getBounds: () => ({ getWest: () => box[0], getSouth: () => box[1], getEast: () => box[2], getNorth: () => box[3] }) },
      layers: { hasSource: () => false }, coords: { querySourceFeatures: () => [] } }),
    codeAtPoint: () => 'SVK', countryStats: STATS, cName: (st) => st.nameEn, seas: [],
    loadCountryData: () => Promise.resolve(), geo: () => MODERN,
    panelEl: () => panel, pick: (t) => calls.pick.push(t), stage: (t) => calls.stage.push(t),
    clock: { state: () => ({ when: when, year: o.year == null ? new Date().getFullYear() : o.year, isLive: o.year == null }) },
    eraBorders: () => TB
  });
  const restore = () => { globalThis.document = pd; globalThis.window = pw; };
  return { api, ew, calls, HOST, restore };
}
const run = (o, fn) => { const r = row(o); try { return fn(r); } finally { r.restore(); } };

/* ══ ② the clock in the past ═══════════════════════════════════════════════════════════════════ */
test('② the reported sentence: today the row may offer the euro; under a 1914 clock it may not', () => {
  const today = run({}, (r) => r.api.examples());
  assert.ok(today.some((q) => /Slovakia/.test(q)), 'the fixture really does produce present-day chips about the modern country');
  const y1914 = run({ year: 1914 }, (r) => r.api.examples());
  assert.equal(y1914.length, 4, 'the row still stands at four');
  for (const q of y1914) {
    assert.ok(!/euro|Slovakia/.test(q), 'a 1914 map is not asked about today’s state or its currency: ' + q);
    assert.ok(/1914|Austria-Hungary|German Empire|1914/.test(q), 'every chip is about the era the map draws: ' + q);
  }
});

test('② the era questions are measured on the drawn collection — the border, the centre, the renamed', () => {
  const qs = run({ year: 1914 }, (r) => r.api.examples());
  assert.ok(qs.some((q) => /border between Austria-Hungary and German Empire/.test(q)),
    'two polities in the view → the border between them, the larger share first');
  assert.ok(qs.some((q) => /draws this place as Austria-Hungary/.test(q)), 'the polity under the centre is named');
  /* one polity filling the view: no border question, because the collection does not draw one */
  const one = run({ year: 1914, box: [1, 1, 5, 5] }, (r) => r.api.examples());
  assert.ok(!one.some((q) => /border between/.test(q)), 'a view inside one polity is not asked about a border');
});

test('② whether the map is today’s is the record’s answer — the same clock with modernAt true is today', () => {
  const yrs = [2023];   /* past the record (modernAt says modern) yet not live */
  for (const y of yrs) {
    const qs = run({ year: y }, (r) => r.api.examples());
    assert.ok(qs.some((q) => /Slovakia/.test(q)), y + ': the map draws today, so the statistics row stays');
  }
  /* no record on the page → the module keeps its present-day behaviour rather than guessing an era */
  const none = run({ year: 1914, era: false }, (r) => r.api.examples());
  assert.ok(none.some((q) => /Slovakia/.test(q)), 'without IntMapTimeBorders nothing claims an era');
});

test('② before the era collection arrives, only the clock-only tail is offered (nothing about polities)', () => {
  const qs = run({ year: 1914, drawn: false }, (r) => r.api.examples());
  assert.equal(qs.length, 4);
  for (const q of qs) {
    assert.match(q, /1914/, 'each tail is about the year: ' + q);
    assert.ok(!/Austria|German|Slovakia|border between/.test(q), 'and names nothing the map has not drawn: ' + q);
  }
});

test('② a year before the common era reads as an era, in both languages', () => {
  const en = run({ year: -500, snapshot: true }, (r) => r.api.examples());
  assert.ok(en.every((q) => !/-500/.test(q)), 'no negative year reaches the reader');
  assert.ok(en.some((q) => q.includes(HS.yearText(-500, 'en'))), 'the year is the Chronos formatter’s');
  const jp = run({ year: 1914, lang: 'jp' }, (r) => r.api.examples());
  assert.ok(jp.some((q) => q.startsWith('1914年、')), 'jp: 「1914年、…」');
  assert.ok(jp.some((q) => /オーストリア＝ハンガリー/.test(q)), 'jp: the label layer’s localized era name');
});

test('② the day the drawn borders took this shape — only for a day-exact record, and it redraws when it lands', async () => {
  const r = row({ year: 1914 });
  try {
    r.api.examples();                       /* asks changeAt */
    await new Promise((res) => setTimeout(res, 0));
    const qs = r.api.examples();
    const since = HS.dateText(1914, 8, 3, 'en');
    assert.ok(qs.some((q) => q.includes('took this shape on ' + since)), 'the change date is the record’s, formatted by Chronos: ' + qs.join(' / '));
  } finally { r.restore(); }
  const snap = row({ year: -500, snapshot: true });
  try {
    snap.api.examples(); await new Promise((res) => setTimeout(res, 0));
    assert.ok(!snap.api.examples().some((q) => /took this shape/.test(q)), 'a snapshot sheet’s date is not an event');
  } finally { snap.restore(); }
});

test('② a click in the past keeps the reserved 「here」 slot, in the era’s words', () => {
  const qs = run({ year: 1914 }, (r) => r.api.pointExamples(7, 7, 6, 3));
  assert.equal(qs.length, 3);
  assert.equal(qs[2], 'What was happening around here in 1914?');
  assert.ok(!qs.some((q) => /recently/.test(q)), '「recently」 is a question about today');
});

/* ══ ① the reader with no account ══════════════════════════════════════════════════════════════ */
test('① signed out: the row says an account is needed and the allowance, from the plan table', () => {
  const n = String(planOf(DEFAULT_PLAN).aiTurnsPerDay);
  run({}, (r) => {
    r.api.renderExamples(true);
    const note = r.ew.querySelector('.atl-gate');
    assert.ok(note, 'the note is on the row before any tap');
    assert.equal(note.textContent, EN.atlasGateNote.replace('{n}', n));
    assert.equal(r.ew.children[0], note, 'and it comes before the chips');
  });
  for (const t of [EN, JP]) {
    for (const k of ['atlasGateNote', 'atlasPvQuota']) {
      assert.ok(t[k].includes('{n}'), k + ' takes the number from the plan table');
      assert.ok(!t[k].replace('{n}', '').includes(n), k + ' does not copy the plan’s number');
    }
  }
  run({ user: { id: 'u' } }, (r) => { r.api.renderExamples(true); assert.equal(r.ew.querySelector('.atl-gate'), null, 'signed in, no note'); });
});

test('① signed out, a tap shows the card — nothing is sent and the login sheet does not open', () => {
  run({}, (r) => {
    r.api.renderExamples(true);
    const chip = r.ew.querySelector('.atl-chip');
    chip.onclick();
    assert.deepEqual(r.calls.pick, [], 'the question is not sent');
    assert.deepEqual(r.calls.login, [], 'the login sheet is not the first thing shown');
    const card = r.ew.querySelector('.atl-pv');
    assert.ok(card, 'the card is shown');
    assert.equal(card.querySelector('.atl-pv-q').textContent, chip.textContent, 'it carries the question tapped');
    assert.equal(chip.getAttribute('aria-expanded'), 'true');
    const steps = card.querySelector('.atl-pv-steps').children.map((c) => c.textContent);
    assert.deepEqual(steps, [EN.atlasPvStep1, EN.atlasPvStep2, EN.atlasPvStep3]);
    assert.ok(card.textContent.includes(EN.atlasPvFigure), 'the figure says it is an illustration');
    /* a second chip replaces the card rather than stacking one */
    r.ew.querySelectorAll('.atl-chip')[1].onclick();
    assert.equal(r.ew.querySelectorAll('.atl-pv').length, 1);
    assert.equal(r.ew.querySelectorAll('.atl-chip[aria-expanded]').length, 1);
    /* the card's own button: the question goes to the composer, then the login sheet */
    const q = r.ew.querySelector('.atl-pv-q').textContent;
    r.ew.querySelector('.atl-pv-login').onclick();
    assert.deepEqual(r.calls.stage, [q], 'the question waits in the composer');
    assert.deepEqual(r.calls.pick, [], '…unsent');
    assert.equal(r.calls.login.length, 1, 'and the login sheet opens from the card');
    r.ew.querySelector('.atl-pv-close').onclick();
    assert.equal(r.ew.querySelector('.atl-pv'), null, '「Not now」 closes the card');
  });
  run({ user: { id: 'u' } }, (r) => {
    r.api.renderExamples(true);
    const chip = r.ew.querySelector('.atl-chip'); chip.onclick();
    assert.deepEqual(r.calls.pick, [chip.textContent], 'signed in, a tap asks as it always has');
    assert.equal(r.ew.querySelector('.atl-pv'), null);
  });
});

test('① the card claims no answer: no recorded production answer exists to replay', () => {
  /* if a recorded cassette ever appears, the card can replay it — until then it must not pretend */
  const ex = codeOnly(read('js/atlas-examples.js'));
  assert.ok(!/cassette/i.test(ex.slice(ex.indexOf('function _preview('), ex.indexOf('function _preview(') + 2500)),
    'the card reads no cassette');
  assert.match(read('scripts/atlas-eval/scripted-cassettes.mjs'), /kind:\s*'scripted'|kind: "scripted"|'scripted'/,
    'the only cassettes are scripted ones');
});

/* ══ ③ the phone's Atlas segment ═══════════════════════════════════════════════════════════════ */
test('③ on the phone the unselected Atlas segment drops the ring that reads as selected', () => {
  const css = codeOnly(read('css/intmap.css'));
  const sel = css.indexOf('.mode-btn.mode-atlas.active{ background:var(--atlas-grad) !important;');
  const open = css.lastIndexOf('@media(max-width:768px){', sel);
  assert.ok(sel > 0 && open > css.indexOf('.mode-btn.mode-atlas:not(.active)::before{ content:'),
    'the phone block comes after the desktop ring, so it can override it');
  const block = css.slice(open, open + 40000);
  assert.match(block, /\.mode-btn\.mode-atlas:not\(\.active\)::before\{\s*display:none;\s*\}/, 'the ring is removed on the phone');
  assert.match(block, /\.mode-btn\.mode-atlas:not\(\.active\)\{\s*background:transparent !important;\s*\}/, 'and the segment is bare like its neighbours');
  assert.match(block, /\.mode-btn\.mode-atlas\.active\{\s*background:var\(--atlas-grad\) !important;/, 'the selected look is the fill, unchanged');
});
