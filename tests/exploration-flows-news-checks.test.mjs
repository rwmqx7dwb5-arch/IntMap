/* ============================================================================
 *  IntMap · the news event detail is not a dead end  (exploration-flows)
 * ----------------------------------------------------------------------------
 *  Measured on this tree before the change: the event detail (js/news-events.js `openDetail`) had no ★ (only the list
 *  card called `toggleStar`), no way to send the event (the share link's schema had no field for it, so a link sent
 *  from an open detail opened the place with nothing saying what had happened there), a place chip that did nothing,
 *  a fly-to at zoom 4 for every event however precise its point, and no way back to now after「この土地の過去」
 *  moved the clock.
 *
 *  These checks EVALUATE: the codec round-trips the `ev` field; the zoom is read from the vocabulary the server
 *  writes (NEWS_GEO_KINDS, discovered — a new kind fails here); and the real factory is run against a small fake
 *  reading surface, so the ★, share, back-to-now, the share field's read/apply and the fly-to's zoom are asserted
 *  as what the detail DOES, not as how it is spelt.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';
import { SCHEMA, encode, decode, canonical, MapState } from '../js/map-state.js';
import { IntMapTime } from '../js/chronos.js';
import { NEWS_GEO_KINDS } from '../supabase/functions/_shared/news-geo-prompt.js';
import { DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';
import '../js/safe-html.js';


/* ══ ① the share link carries the event ═══════════════════════════════════════════════════════════ */
test('① the `ev` field round-trips, is appended last, and an old link is byte-identical', () => {
  const base = '#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato&tt=1990-06-15';
  const h = base + '&ev=elz3k9a0b1c2d3e4f5';
  const st = decode(h);
  assert.equal(st.event, 'elz3k9a0b1c2d3e4f5');
  assert.equal(encode(st), h, 'encode(decode(link)) is the link');
  assert.equal(decode(base).event, null, 'no ev is «no event open»');
  assert.equal(encode(decode(base)), base, 'a link written before the field encodes to the same bytes');
  assert.equal(decode('#v=1,2,3,0,0,f&ev=%3Cscript%3E').event, null, 'a value that is not an id is not an event');
  assert.equal(canonical('v=1,2,3,0,0,f&ev=e1&zz=1'), '#v=1.0000,2.0000,3.00,0,0,f&ev=e1');
  /* every other field before it in the bar: the encoder writes `ev` after the last one */
  const all = encode({ view: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, ds: 'abc', mymap: { a: 1 }, event: 'e9' });
  assert.ok(all.endsWith('&ds=abc&ev=e9'), all);
});

test('① the field is declared once: owned by the events module, fetched lazily, restored only on a full open', async () => {
  const f = SCHEMA.find((x) => x.key === 'event');
  assert.ok(f, 'SCHEMA has an `event` field');
  assert.deepEqual(f.params, ['ev']);
  assert.equal(f.owner, 'js/news-events.js');
  assert.equal(f.restore, 'full');
  const { LAZY_REGISTRY } = await import('../js/lazy-modules.js');
  const row = LAZY_REGISTRY[f.lazy];
  assert.ok(row, 'the lazy key names a registry entry');
  assert.equal(row.publishes, 'IntMapNewsEvents', 'the entry it names is the events module (whose factory registers the owner — ③ evaluates it)');
});

/* ══ ② the fly-to's zoom comes from the precision the record states ═══════════════════════════════ */
test('② every place kind the server writes has a zoom; an unstated kind keeps the country view', async () => {
  const { EVENT_ZOOM, EVENT_ZOOM_UNSTATED, eventZoom } = await import('../js/news-events.js');
  for (const k of NEWS_GEO_KINDS) assert.ok(Object.prototype.hasOwnProperty.call(EVENT_ZOOM, k), 'NEWS_GEO_KINDS has «' + k + '», which EVENT_ZOOM does not decide');
  for (const k of Object.keys(EVENT_ZOOM)) assert.ok(NEWS_GEO_KINDS.includes(k), '«' + k + '» is not a kind the server writes');
  assert.equal(eventZoom(''), EVENT_ZOOM_UNSTATED);
  assert.equal(eventZoom(undefined), EVENT_ZOOM_UNSTATED);
  assert.equal(eventZoom('no-such-kind'), EVENT_ZOOM_UNSTATED);
  /* a representative point (country / admin1 / org — the grouper's own list) is never brought closer than a named place */
  const named = NEWS_GEO_KINDS.filter((k) => !DEFAULTS.representativeKinds.includes(k));
  for (const r of DEFAULTS.representativeKinds) for (const n of named) assert.ok(eventZoom(r) < eventZoom(n), r + ' vs ' + n);
  assert.ok(eventZoom('country') < eventZoom('admin1'), 'a first-level unit is closer than a country');
});

/* ══ ③ the detail itself — the real factory on a fake reading surface ═════════════════════════════ */
function fakeSurface() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const cls = new Set();
      const attrs = {};
      els.set(id, {
        id, hidden: false, disabled: false, onclick: null, textContent: '',
        classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
        setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
        querySelector: (sel) => (sel === '.ev-now-t' ? el(id + ' .ev-now-t') : null),
        _cls: cls, _attrs: attrs,
      });
    }
    return els.get(id);
  };
  const pane = { style: { display: 'flex' }, scrollTop: 0, _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v); els.clear();
      for (const m of this._html.matchAll(/<(\w+)([^>]*)\sid="([^"]+)"([^>]*)>/g)) {
        const e = el(m[3]); const a = m[2] + ' ' + m[4];
        const c = /class="([^"]*)"/.exec(a); if (c) c[1].split(/\s+/).forEach((x) => x && e._cls.add(x));
        const p = /aria-pressed="([^"]*)"/.exec(a); if (p) e._attrs['aria-pressed'] = p[1];
        if (/\shidden(\s|$)/.test(' ' + a + ' ')) e.hidden = true;
      }
    },
    querySelector: (sel) => (sel === '.ev-detail' && /class="ev-detail"/.test(pane._html) ? {} : null) };
  const document = {
    getElementById: (id) => (id === 'news-reader-pane' ? pane : (new RegExp('id="' + id + '"').test(pane._html) ? el(id) : null)),
    querySelector: () => null, createElement: () => ({ style: {}, appendChild() { } }), head: { appendChild() { } },
  };
  return { pane, document, el };
}

async function factory() {
  const S = fakeSurface();
  const flights = [];
  const shareOpened = [];
  const store = {};
  const win = globalThis;
  const M = await importModule('js/news-events.js', {
    globals: {
      window: win, document: S.document,
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      MutationObserver: undefined,
    },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: { camera: { flyTo: (o) => flights.push(o) }, layers: { hasSource: () => false } } } },
  });
  win.IntMapShare = { open: () => { shareOpened.push(true); } };
  const toasts = [];
  const HOST = {
    lang: 'en', mode: 'news', user: null, DB: null, globalData: [],
    enterReaderPane: () => S.pane,
    readerBar: (o) => '<div class="nrp-bar"><button class="nrp-back" id="' + o.backId + '">' + o.back + '</button>' + (o.extra || '') + '</div>',
    closeReaderPane: () => { S.pane.innerHTML = ''; S.pane.style.display = 'none'; },
    imToast: (t) => toasts.push(t), setMode() { },
    applyPinMode: (a) => { a.loc = a.subjectLoc; a.name = a.subjectName; a.mapped = !!a.subjectLoc; },
  };
  const API = M.newsEvents(HOST);
  return { S, API, HOST, flights, shareOpened, toasts };
}

const ITEM = (over) => {
  const ev = Object.assign({
    publicId: 'etest1', id: null, title: 'Quake hits Town', titleShown: 'Quake hits Town', place: 'Town', category: 'disasters',
    members: [{ id: 'm1', title: 'Quake hits Town', description: '', url: 'https://example.invalid/1', sourceId: 's', sourceName: 'Outlet', family: 'Outlet', publishedAt: '2026-11-17T00:00:00Z' }],
    firstAt: '2026-11-17T00:00:00Z', lastAt: '2026-11-17T00:00:00Z', articleCount: 1, sourceCount: 1, brief: null, synthesis: null,
  }, over || {});
  return { _event: ev, analysis: { loc: [10, 20], subjectLoc: [10, 20], placeKind: 'city' } };
};

test('③ the detail has a ★ that calls the same toggleStar and shows isSaved; share opens the one dialog', async () => {
  const { S, API, shareOpened } = await factory();
  const item = ITEM();
  API.openDetail(item);
  const star = S.document.getElementById('ev-star');
  assert.ok(star, 'the detail has a ★');
  assert.equal(star.getAttribute('aria-pressed'), 'false');
  await star.onclick();
  assert.equal(API.isSaved('etest1'), true, 'pressing the detail ★ saved the event (the same store the list card reads)');
  assert.equal(star.getAttribute('aria-pressed'), 'true');
  assert.equal(star.classList.contains('on'), true);
  await star.onclick();
  assert.equal(API.isSaved('etest1'), false, 'and pressing it again unsaved it');
  /* reopened while saved, the ★ starts pressed */
  await API.toggleStar(item);
  API.openDetail(item);
  assert.equal(S.document.getElementById('ev-star').getAttribute('aria-pressed'), 'true');
  S.document.getElementById('ev-share').onclick();
  assert.equal(shareOpened.length, 1, 'share opened IntMapShare');
});

test('③ the share field reads the detail that is ON SCREEN, and a link that names an event opens it without flying', async () => {
  const { API, HOST, flights, toasts } = await factory();
  API.openDetail(ITEM());
  assert.equal(MapState.read('event'), 'etest1', 'while the detail is shown the field is its public id');
  assert.match(encode({ view: { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, event: MapState.read('event') }), /&ev=etest1$/);
  HOST.closeReaderPane();
  assert.equal(MapState.read('event'), null, 'closed by any route, the field is empty');
  /* restore: the loaded list is empty, so the owner asks the store for the one row — here it has none */
  const before = flights.length;
  const r = MapState.restore('#v=1,2,3,0,0,f&ev=enothere', { full: true });
  assert.ok(r);
  await new Promise((res) => setTimeout(res, 450));
  assert.equal(flights.length, before, 'a restore does not fly the camera away from the link\'s own view');
  assert.deepEqual(toasts, ['This event could not be loaded'], 'the owner received the link\'s event and said it could not be found — not silence');
});

test('③ the fly-to zoom follows the event point\'s stated kind', async () => {
  const { API, flights } = await factory();
  const { eventZoom } = await import('../js/news-events.js');
  for (const kind of ['city', 'admin1', 'country', '']) {
    const it = ITEM(); it.analysis.placeKind = kind;
    API.openDetail(it);
    assert.equal(flights.at(-1).zoom, eventZoom(kind), 'kind «' + kind + '»');
  }
});

test('③ the place is a button when the event has a point; «Back to now» shows only while the clock is not live', async () => {
  const { S, API } = await factory();
  IntMapTime.setNow();
  API.openDetail(ITEM());
  assert.ok(S.document.getElementById('ev-place'), 'the place chip is a button');
  const now = S.document.getElementById('ev-now');
  assert.equal(now.hidden, true, 'live: no «Back to now»');
  IntMapTime.setYear(1900);
  assert.equal(now.hidden, false, 'the clock moved to the past while the detail is open: the control appears');
  assert.match(now.querySelector('.ev-now-t').textContent, /1900/, 'it says which instant the map is at');
  S.document.getElementById('ev-now-go').onclick();
  assert.equal(IntMapTime.isLive(), true, 'the control returned the clock to now');
  assert.equal(now.hidden, true, 'and hid itself');
  /* no point → a plain chip */
  const it = ITEM(); it.analysis.loc = null;
  API.openDetail(it);
  assert.equal(S.document.getElementById('ev-place'), null, 'an event with no point has no door to a place card');
});

/* (exploration-flows) measured on production 2026-11-18: an event whose one new sentence was already under «What happened»
   printed «What the latest report added» with nothing under it but «From BBC's report…». The section is decided by what is
   left to say. */
test('«What the latest report added» is drawn only when a sentence or a figure is left after «What happened»', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/news-events.js', import.meta.url), 'utf8');
  assert.match(src, /const learnedNew = brief\.latest \? \(brief\.latest\.learned \|\| \[\]\)\.filter\(\(n\) => !shownGist\.has/);
  assert.match(src, /if \(brief\.latest && \(learnedNew\.length \|\| \(brief\.latest\.figures \|\| \[\]\)\.length\)\) \{/);
});
