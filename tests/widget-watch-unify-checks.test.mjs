/* ============================================================================
 *  widget-watch-unify — the widget board reads Watched places, and Country watch asks the record
 * ----------------------------------------------------------------------------
 *  The board still carried the withdrawn Area Monitors (docs/architecture/18-area-monitors.md §18.2):
 *  a card reading window.IntMapMonitors, an «Open monitors» button that ran an unregistered command and
 *  toasted «Monitors are in the sidebar», and a saved-place alerts card that judged «in force here» by a
 *  padded box while Watched places judged it by the warning's area. And Country watch chose its headlines
 *  with String(p.mapped).toUpperCase().indexOf(cc) — `mapped` is 'true' / 'none', so TR and RU listed
 *  every placed headline in the world and the other countries none. Everything below is EVALUATED:
 *    ① the watched-places card renders the watcher's last run, through js/place-watch.js digestData;
 *       a board saved with «intmap.monitors» resolves to it; nothing on the board reads IntMapMonitors;
 *    ② the broken toast path is gone and the button opens Account ▸ Watched places;
 *    ③ the saved-place alerts card and the watch give the same answer for the same place;
 *    ④ Country watch: the headlines are those whose pin lies in the country's outline (real Natural
 *       Earth 10 m, js/news-intel-core.js makeCountryIndex), the warnings those issued for its alpha-3,
 *       and the country a reader picks is the one the config keeps.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule, langRegistry } from './helpers/import-module.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import * as C from '../supabase/functions/_shared/place-watch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── a recording board: el() builds a plain tree, the render helpers keep what they were given ── */
function flat(node, out) {
  out = out || [];
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => flat(n, out)); return out; }
  out.push(node);
  if (node.k) flat(node.k, out);
  return out;
}
const titles = (node) => flat(node).filter((n) => n.list).flatMap((n) => n.list.map((r) => r.title));
const actionsOf = (node) => flat(node).filter((n) => n.actions).flatMap((n) => n.actions.filter(Boolean));

function board(opts) {
  const defs = [];
  const emitted = [];
  let onWatch = null;
  const host = Object.assign({ lang: 'en', user: null, newsFeatures: [], countryStats: {} }, opts.host || {});
  const WC = {
    el: (t, p, k) => ({ t, p, k: k == null ? [] : k }),
    L: (en) => en,
    define: (d) => defs.push(d),
    host: () => host,
    countryName: (cc, fb) => fb || cc,
    compact: String, ago: () => 'just now', num: String,
    notice: (o) => ({ notice: o }),
    emit: (ev) => { emitted.push(ev); if (ev === 'watch' && onWatch) onWatch(); },
    invalidateContext: () => {}, flyTo: () => {}, fitBounds: () => {},
    watchModule: opts.watchModule || (() => null),
  };
  const R = {
    value: (o) => ({ value: o }), chips: (a) => ({ chips: a }), actions: (a) => ({ actions: a }), facts: (a) => ({ facts: a }),
    list: (a) => ({ list: a }), source: (o) => ({ source: o }), severityWord: String,
    alertRow: (o) => ({ title: o.place, kind: o.kind, row: o }),
  };
  const win = Object.assign({ IntMapWidgetCore: WC, IntMapWidgetRender: R }, opts.window || {});
  if (opts.trap) Object.defineProperty(win, opts.trap.name, { get: opts.trap.get, configurable: true });
  win.window = win;
  return { defs, emitted, host, WC, win, def: (id) => defs.find((d) => d.id === id), watchArrived: () => new Promise((res) => { onWatch = res; }) };
}
async function loadBoard(opts) {
  const b = board(opts || {});
  langRegistry();
  await importModule('js/widget-defs-data.js', { globals: { window: b.win } });
  await importModule('js/widget-defs-map.js', { globals: { window: b.win } });
  return b;
}

/* ── a stand-in account and feeds for the REAL watcher (js/place-watch.js checkNow) ────────────── */
const HOME = { id: 'pA', name: 'Home', lng: 139.69, lat: 35.69 };
function account() {
  const watches = [{ place_id: 'pA', radius_km: 300, quake_min_mag: 4.5, alert_min_level: null, volcano_min_rank: null, news_min_sources: null,
    enabled: true, seen_at: '2026-10-03T00:00:00Z', seen_keys: ['quake:us1'] }];
  const DB = { from: () => {
    const chain = { select() { return chain; }, update() { return chain; }, eq() { return chain; },
      then(res) { res({ data: watches.map((w) => Object.assign({}, w, { saved_places: HOME })), error: null }); } };
    return chain;
  } };
  return { DB, watches };
}
const quakeFeed = (rows) => ({ type: 'FeatureCollection', features: rows.map(([id, mag, lng, lat, t]) => ({ id, properties: { mag, place: 'near ' + id, time: t, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id }, geometry: { coordinates: [lng, lat, 10] } })) });

/* ═══ ① ═══════════════════════════════════════════════════════════════════════════════════════════ */
test('① the watched-places card is the watcher\'s digest, and a board saved with «intmap.monitors» gets it', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const PW = await import('../js/place-watch.js');
  const { DB } = account();
  const HOST = { lang: 'en', user: { id: 'u1' }, DB, imToast: () => {} };
  const readers = PW.makeReaders({ window: {}, json: async () => quakeFeed([['us1', 5.1, 140.5, 36.0, 1000], ['us9', 5.8, 139.9, 35.4, 9000]]) });
  const c = await PW.checkNow(HOST, { readers });
  assert.equal(c.ok, true);

  let monitorsRead = 0;
  const b = await loadBoard({ host: HOST, watchModule: () => PW,
    trap: { name: 'IntMapMonitors', get() { monitorsRead++; return { _list: async () => [], list: () => [] }; } } });
  const def = b.def('intmap.watched-places');
  assert.ok(def, 'the card is registered under its own name');
  assert.deepEqual(def.legacyIds, ['intmap.monitors'], 'a board that saved the monitors card resolves to this one');
  assert.equal(b.defs.filter((d) => d.id === 'intmap.monitors' || (d.legacyIds || []).includes('intmap.monitors')).length, 1, 'and nothing else claims the old id');

  const api = { calls: [], openWatchedPlaces() { this.calls.push('open'); }, empty: (t) => ({ empty: t }) };
  const m = def.renderers.m({ lang: 'en' }, {}, {}, api);
  const d = PW.digestData(PW.lastRun());
  assert.deepEqual(d.places[0].fresh.map((i) => i.key), ['quake:us9'], 'the watcher found one new record');
  assert.deepEqual(titles(m), d.places[0].fresh.map((it) => PW.itemLine(it, 'en')), 'the card lists exactly the digest\'s new records, in its words');
  assert.equal(flat(m).find((n) => n.value).value.value, PW.freshCount(), 'and counts what the watcher counts');
  const open = actionsOf(m);
  assert.equal(open.length, 1);
  open[0].run();
  assert.deepEqual(api.calls, ['open'], 'its button opens Account ▸ Watched places');

  /* signed out: said, with the door (the sheet shows the sign-in) — not a count of nothing */
  b.host.user = null;
  const out = def.renderers.m({ lang: 'en' }, {}, {}, api);
  assert.match(flat(out).find((n) => n.notice).notice.text, /Sign in/);

  for (const id of ['intmap.place-alerts', 'intmap.country-watch']) {
    const dd = b.def(id);
    try { dd.renderers.l({ lang: 'en', places: [], location: {}, selection: {}, chronos: null }, dd.defaultConfig({ selection: {} }), {}, api); } catch (_) { /* rendering without a map is not the point */ }
  }
  assert.equal(monitorsRead, 0, 'no card on the board reads the withdrawn window.IntMapMonitors');
  for (const f of ['js/widget-core.js', 'js/widget-defs-map.js', 'js/widget-smart.js', 'js/widget-layout.js']) {
    assert.ok(!/IntMapMonitors|setMonitors|ctx\.monitors/.test(codeOnly(read(f))), f + ' has no code path to the withdrawn monitors');
  }
});

/* ═══ ② ═══════════════════════════════════════════════════════════════════════════════════════════ */
test('② the «Monitors are in the sidebar» door is gone; the button opens the watched-places sheet', () => {
  const js = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  for (const f of js) {
    const src = codeOnly(read('js/' + f));
    assert.ok(!/Monitors are in the sidebar|監視はサイドバーにあります/.test(src), 'js/' + f + ' still says the monitors are in the sidebar');
    assert.ok(!/runCommand\(\s*['"]tab\.monitors['"]\s*\)/.test(src), 'js/' + f + ' runs the unregistered tab.monitors');
    assert.ok(!/\bopenMonitors\b/.test(src), 'js/' + f + ' still names openMonitors');
  }
  const lay = codeOnly(read('js/widget-layout.js'));
  const body = lay.slice(lay.indexOf('openWatchedPlaces:'), lay.indexOf('openWatchedPlaces:') + 400);
  assert.match(body, /import\('\.\/place-watch\.js'\)/, 'the door loads the watched-places module on demand');
  assert.match(body, /openWatchDigest\(/, '…and opens the sheet Account ▸ Watched places opens');
});

/* ═══ ③ ═══════════════════════════════════════════════════════════════════════════════════════════ */
test('③ the saved-place alerts card and the watch give the same answer for the same place', async () => {
  const PW = await import('../js/place-watch.js');
  const recs = [
    { iso: 'JPN', feed: 'jma', unit: '東京都23区', name: '東京都', norm: 3, hz: '大雨', bbox: [139.5, 35.5, 139.95, 35.85] },
    /* the whole prefecture's box contains Home, but its AREA (the islands) does not: the layer's point test says so */
    { iso: 'JPN', feed: 'jma', unit: '伊豆諸島', name: '東京都', norm: 3, hz: '波浪', bbox: [138.9, 24.0, 142.3, 35.9] },
    /* 0.2° south of Home: inside the old card's padded box (40 km ≈ 0.36°), outside everything else */
    { iso: 'JPN', feed: 'jma', unit: '神奈川県東部', name: '神奈川県', norm: 2, hz: '雷', bbox: [139.4, 35.2, 139.8, 35.49] },
  ];
  const alertsQuery = (o) => {
    const pt = o.lng != null ? [+o.lng, +o.lat] : null, pad = o.padDeg == null ? 0 : +o.padDeg;
    const alerts = recs.filter((r) => !pt || !(pt[0] < r.bbox[0] - pad || pt[0] > r.bbox[2] + pad || pt[1] < r.bbox[1] - pad || pt[1] > r.bbox[3] + pad))
      .map((r) => ({ iso: r.iso, feed: r.feed, unit: r.unit, place: r.name, level: r.norm, kind: r.hz, at: 5, bbox: r.bbox }));
    return { on: true, at: 5, alerts: o.limit ? alerts.slice(0, o.limit) : alerts, total: alerts.length };
  };
  const world = { IntMapWorld: { alertsQuery }, __wpAlerts: { at: () => [{ feed: 'jma', unit: '東京都23区' }] } };
  /* the card runs in this window — and so does the watch's reader it asks (makeReaders() reads `window`) */
  globalThis.window = Object.assign(globalThis.window || {}, world);
  Object.assign(globalThis, world);
  const b = await loadBoard({ watchModule: () => PW, window: world });
  const def = b.def('intmap.place-alerts');
  assert.ok(!('radiusKm' in def.configSchema), 'no radius: a warning is in force where its area contains the place');
  const ctx = { places: [{ name: 'Home', lng: HOME.lng, lat: HOME.lat }], location: { state: 'prompt' }, selection: {} };
  const node = def.renderers.l(ctx, def.defaultConfig(), {}, { empty: (t) => ({ empty: t }), setLayer() {}, openWatchedPlaces() {} });
  const cardKinds = flat(node).filter((n) => n.list).flatMap((n) => n.list.map((r) => r.kind));
  assert.deepEqual(cardKinds, ['大雨'], 'the card shows only the warning whose area contains the place (東京都23区)');

  /* the watch, for the same place, through the runner the watcher uses */
  const w = { place_id: 'pA', radius_km: 300, quake_min_mag: null, alert_min_level: 1, volcano_min_rank: null, news_min_sources: null, enabled: true, seen_at: 'x', seen_keys: [], saved_places: HOME };
  const run = await PW.runWatches({}, [w], PW.makeReaders({ window: world }));
  assert.deepEqual(run.results[0].ev.items.map((it) => it.key.split('|')[1]), ['東京都23区'], 'the watch names the same unit');
  assert.deepEqual(run.results[0].ev.items.map((it) => it.key.split('|')[3]), cardKinds, '…and the same warnings for the same place');
  /* the old rule, for the record: the padded box would have shown all three */
  assert.equal(alertsQuery({ lng: HOME.lng, lat: HOME.lat, padDeg: 40 / 111 }).alerts.length, 3);
});

/* ═══ ④ ═══════════════════════════════════════════════════════════════════════════════════════════ */
test('④ Country watch: headlines by the pin\'s point in the country, warnings by its alpha-3, the picked country kept', async () => {
  /* the shipped Natural Earth 10 m file, decoded by the module that ships it (js/ne-countries.js) */
  const NE = await import('../js/ne-countries.js');
  const outline = NE.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, NE.neCountriesPath('10m')))).toString('utf8')));
  const feat = (title, lng, lat, mapped, oc) => {
    const f = { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { mapped, title, publisher: 'wire', link: 'https://news.example/' + encodeURIComponent(title) } };
    if (oc) f.__oc = oc;
    return f;
  };
  const host = {
    newsFeatures: [
      feat('Tokyo quake felt', 139.69, 35.69, 'true'),
      /* a stacked pin fanned out to sea — its own anchor (Osaka) is what counts */
      feat('Osaka port closes', 134.9, 34.2, 'true', [135.50, 34.69]),
      feat('Ankara budget vote', 32.85, 39.93, 'true'),
      feat('Paris strike', 2.35, 48.85, 'true'),
      /* a pseudo-point (js/app-body.js applyPinMode): drawn somewhere, placed nowhere */
      feat('Location unknown story', 33.0, 39.0, 'none'),
    ],
    countryStats: {
      JPN: { code: 'JPN', a2: 'JP', nameEn: 'Japan' }, TUR: { code: 'TUR', a2: 'TR', nameEn: 'Turkey' }, RUS: { code: 'RUS', a2: 'RU', nameEn: 'Russia' },
      NOR: { code: 'NOR', a2: 'NO', nameEn: 'Norway' }, NER: { code: 'NER', a2: 'NE', nameEn: 'Niger' }, FRA: { code: 'FRA', a2: 'FR', nameEn: 'France' },
    },
  };
  const isoAsked = [];
  let outlineReads = 0;
  const alertsQuery = (o) => { isoAsked.push(o.iso); return { on: true, at: 1, alerts: o.iso === 'JPN' ? [{ iso: 'JPN', feed: 'jma', unit: 'u', place: '東京都', level: 2, kind: '大雨', at: 1, bbox: null }] : [] }; };
  const b = await loadBoard({ host, window: { IntMapWorld: { alertsQuery }, IntMapNewsIntel: { outlines: async () => { outlineReads++; return outline; } } } });
  const def = b.def('intmap.country-watch');
  const ctx = { selection: { country: null }, chronos: null };
  const api = { empty: (t) => ({ empty: t }), flyCountry() {}, openConfig() {} };
  const headlines = (cc) => titles(def.renderers.l(ctx, { cc, follow: true }, {}, api)).filter((t) => t !== '東京都');

  /* a gallery preview (js/widget-gallery.js previewContext) fetches nothing */
  def.renderers.m(Object.assign({ preview: true }, ctx), { cc: 'JP', follow: true }, {}, api);
  assert.equal(outlineReads, 0, 'the preview did not load the outlines');
  /* the outlines arrive once; until then the count is «…», never 0 */
  const arrived = b.watchArrived();
  const first = def.renderers.m(ctx, { cc: 'JP', follow: true }, {}, api);
  assert.equal(flat(first).find((n) => n.chips).chips.find((c) => c.icon === 'news').value, '…', 'a count not yet computed is not «0»');
  await arrived;
  assert.equal(outlineReads, 1, 'the outlines are read once for every country');

  assert.deepEqual(headlines('JP'), ['Tokyo quake felt', 'Osaka port closes'], 'Japan: the headlines whose pins lie in Japan');
  assert.deepEqual(headlines('TR'), ['Ankara budget vote'], 'Turkey: not every placed headline in the world (TR ⊂ «TRUE»), and not the pseudo-point');
  assert.deepEqual(headlines('RU'), [], 'Russia (RU ⊂ «TRUE»): nothing that is not in Russia');
  assert.deepEqual(headlines('NO'), [], 'Norway (NO ⊂ «NONE»): no unplaced headline');
  assert.deepEqual(headlines('NE'), [], 'Niger (NE ⊂ «NONE»): no unplaced headline');
  assert.deepEqual(headlines('FR'), ['Paris strike'], 'France, which the spelling never reached, gets its own');

  isoAsked.length = 0;
  const jp = def.renderers.l(ctx, { cc: 'JP', follow: true }, {}, api);
  assert.deepEqual(isoAsked, ['JPN'], 'the warnings are asked for by the alpha-3 the warning records carry');
  assert.ok(titles(jp).includes('東京都'), '…and Japan\'s warning is listed');
  assert.equal(flat(jp).find((n) => n.value).value.value, 'Japan', 'the country row is found from the alpha-2 the config holds');

  /* the picker offers what the config keeps: every option survives js/widget-store.js validateConfig */
  b.WC.context = () => ({});
  const ls = { getItem: () => null, setItem() {} };
  await importModule('js/widget-store.js', { globals: { window: b.win, localStorage: ls } });
  const opts = def.configSchema.cc.options();
  assert.ok(opts.length === 6 && opts.every((o) => /^[A-Z]{2}$/.test(o.value)), 'the options are alpha-2');
  for (const o of opts) assert.equal(b.win.IntMapWidgetStore.validateConfig(def, { cc: o.value, follow: false }).cc, o.value, o.value + ' is kept as chosen');
  /* the defect, for the record: an alpha-3 (what the pickers offered) is not a value the field keeps */
  assert.equal(b.win.IntMapWidgetStore.validateConfig(def, { cc: 'JPN', follow: false }).cc, 'US');
  for (const id of ['world.country', 'world.holiday']) {
    const o2 = b.def(id).configSchema.cc.options();
    assert.ok(o2.length === 6 && o2.every((o) => /^[A-Z]{2}$/.test(o.value)), id + ' offers alpha-2 too (the holiday API is asked by alpha-2)');
  }
});

/* ═══ the rule the watch and the card now share is one function, not two ════════════════════════ */
test('the warnings test is asked of Watched places, not re-implemented on the board', () => {
  const src = codeOnly(read('js/widget-defs-map.js'));
  assert.match(src, /makeReaders\(\)\.warning\(\)/, 'the card asks the watch\'s warnings reader');
  assert.ok(!/padDeg/.test(src), 'and no padded box of its own');
  assert.equal(typeof C.warningItems, 'function');
});
