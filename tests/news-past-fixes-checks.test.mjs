/* (news-past-fixes) What production showed after «This place's past» shipped, held as facts:
 *   ① the election prefilter is the cells each boundary file's polygons touch, and that is a SUPERSET of the geometry —
 *      every vertex and every point inside a district lies in a listed cell (a missed cell would drop a real district)
 *   ② a London event fetches only the files that can hold London — not France's, Russia's, the United States' or the
 *      2024 EU's (one box per file covered the whole Earth for a polity across the date line or with land overseas)
 *   ③ an election named by its caller is chosen BEFORE the layer switches on: the layer does not first choose the newest
 *      election anywhere (Japan) and fetch it, and the caller's election is the one the layer holds
 *   ④ the war and election headings, and Atlas's election tools, go through the layers' own rows (the box, the share link
 *      and the map agree); the button says «a party to», as the section does
 *   ⑤ a country-level event's wars are asked of the country's present LAND, not of today's code: Ukraine's Second World War
 *      is the USSR's record (gw 365, all of the land), marked as a predecessor state's on the card and for Atlas
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule } from '../scripts/lib/import-module.mjs';
import { WarGeom } from '../js/war-geom.js';
import { DEG, cellOf, coverOf, encodeCells, decodeCells } from '../js/election-cover.js';

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const index = JSON.parse(rd('data/elections/index.json'));

test('① the cover of a boundary file holds every vertex and every interior point of its districts', () => {
  assert.equal(index.cover.deg, DEG, 'the index states the cell size it was built at');
  const s = new Set([0, 1, 2, 7, 64799]);
  assert.deepEqual([...decodeCells(encodeCells(s))].sort((a, b) => a - b), [0, 1, 2, 7, 64799], 'the codec round-trips');
  /* the polities that broke one box per file, and two that never did */
  for (const g of ['ru-oik-2016.geo.json', 'us-house-c116.geo.json', 'fr-2010.geo.json', 'eu-ms-2024.geo.json', 'jp-hr2022.geo.json', 'uk-2024.geo.json']) {
    const cells = decodeCells(index.cover.files[g]), fc = JSON.parse(rd('data/elections/' + g));
    assert.deepEqual(cells, coverOf(fc, index.cover.deg), g + ': the index is the files\' own cover');
    for (const f of fc.features) {
      const gm = f.geometry, polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.coordinates;
      let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity;
      for (const p of polys) for (const r of p) for (const [x, y] of r) {
        assert.ok(cells.has(cellOf(x, y, DEG)), g + ': vertex ' + x + ',' + y);
        if (x < w) w = x; if (x > e) e = x; if (y < so) so = y; if (y > n) n = y;
      }
      /* interior points on a lattice off the cell grid (0.37°): each one inside the district is inside the cover */
      for (let x = w + 0.185; x < e; x += 0.37) for (let y = so + 0.185; y < n; y += 0.37) {
        if (WarGeom.pointInPolys([x, y], polys)) assert.ok(cells.has(cellOf(x, y, DEG)), g + ': interior ' + x.toFixed(3) + ',' + y.toFixed(3));
      }
    }
  }
});

/* the elections module, with every fetch it makes written down */
const fetched = [];
const anything = new Proxy(function () { }, { get: (_, k) => (k === 'then' ? undefined : anything), apply: () => anything });
const fakeEl = () => ({ style: {}, classList: { toggle() { }, add() { }, remove() { } }, appendChild(c) { return c; }, querySelector: () => null, addEventListener() { }, setAttribute() { }, remove() { } });
const document = { readyState: 'loading', baseURI: 'http://intmap.test/', head: fakeEl(), getElementById: () => null, createElement: () => fakeEl(), addEventListener() { }, querySelectorAll: () => [] };
const fetch = async (u) => { const p = new URL(String(u)).pathname.replace(/^\//, ''); fetched.push(p); try { const t = rd(p); return { ok: true, status: 200, json: async () => JSON.parse(t) }; } catch (_) { return { ok: false, status: 404, json: async () => null }; } };
const HOST = { lang: 'en', canDraw: () => false, escapeHtml: (s) => String(s), imToast() { } };
const win = { IntMapDevice: { COMPACT: '(max-width:700px)' }, addEventListener() { },
  _imPipGeo: (x, y, g) => (g.type === 'Polygon' ? WarGeom.pointInPolys([x, y], [g.coordinates]) : g.type === 'MultiPolygon' ? WarGeom.pointInPolys([x, y], g.coordinates) : false) };
const { elections } = await importModule('js/elections.js', { globals: { window: win, document, fetch, location: { href: 'http://intmap.test/' } }, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: anything } } });
elections(HOST);
const E = win.IntMapElections;
const geoFetched = () => fetched.filter((p) => /\.geo\.json$/.test(p)).map((p) => p.replace(/^.*\//, ''));

test('② a point in London fetches only the boundary files that can hold London', async () => {
  fetched.length = 0;
  const r = await E.atPoint(-0.1276, 51.5072, { district: true });
  assert.equal(r.status, 'ok');
  const uk = r.polities.find((p) => p.id === 'uk');
  assert.ok(uk && uk.bodies[0].district, 'the UK district under London');
  const got = geoFetched();
  for (const bad of [/^fr-/, /^ru-/, /^us-/, /^eu-ms-2024/, /^jp-/]) assert.ok(!got.some((g) => bad.test(g)), 'fetched ' + got.join(' '));
  assert.ok(got.every((g) => decodeCells(index.cover.files[g]).has(cellOf(-0.1276, 51.5072, DEG))), 'only files whose cover holds the point');
});

test('③ an election named by its caller is chosen before the switch — the newest election elsewhere is never fetched', async () => {
  const uk = index.elections.filter((e) => e.polity === 'uk').pop();
  const newest = index.elections.reduce((a, b) => (a && a.date > b.date ? a : b), null);
  assert.notEqual(newest.polity, 'uk', 'the case that broke: the newest election anywhere is another country\'s (' + newest.id + ')');
  fetched.length = 0;
  await E.open(uk.id);
  assert.equal(E.current(), uk.id, 'the layer holds the named election');
  assert.ok(!fetched.some((p) => p.endsWith('/' + newest.res) || (newest.geo && p.endsWith('/' + newest.geo))), 'the newest election elsewhere was not fetched: ' + fetched.join(' '));
  assert.equal(await E.open('no-such-election'), false, 'an election the layer does not carry is refused');
});

test('④ the headings and Atlas switch the layers through their own rows; the button\'s words match the section', () => {
  const ep = rd('js/event-past.js');
  assert.match(ep, /W\.show\(w\.id, /, 'the war heading goes through the war row (Atlas <war>.show)');
  assert.match(ep, /E\.open\(k\.slice\(5\)\)/, 'the election heading chooses its election first');
  assert.ok(!/W\.toggle\(|E\.toggle\(|E\.select\(/.test(ep), 'no direct switch of a layer behind its row');
  const cap = rd('js/atlas-cap-layers.js');
  assert.ok(!/E\.toggle\(true\)|E\.select\(/.test(cap), 'Atlas\'s election tools do not switch on first and select second');
  assert.match(cap, /E\.open\(pick\)/);
  /* the war row records its latest switch so a day is set only after it */
  assert.match(rd('js/war-fronts.js'), /function toggle\(id, want, opts\) \{ return \(switching\[id\] = toggleNow\(id, want, opts\)\); \}/);
  const ne = rd('js/news-events.js');
  assert.ok(!/wars that reached it|及んだ記録上の戦争/.test(ne), 'the button no longer says «reached»');
  assert.match(ne, /the recorded wars its state was a party to/);
});

/* ── ⑤ a country-level event is asked of its LAND (the user's decision, 2026-11-17: 「土地で問う」) ── */
import { createRequire } from 'node:module';
const CS = (() => { const prev = globalThis.window; globalThis.window = {}; try { createRequire(import.meta.url)('../data/cshapes.js'); return globalThis.window.__CSHAPES; } finally { globalThis.window = prev; } })();
const k0 = (f) => f[2] * 10000 + f[3] * 100 + f[4], k1 = (f) => f[5] * 10000 + f[6] * 100 + f[7];
const csPolys = (f) => f[8].map((p) => p.map((ri) => CS.rings[ri]));
const door = { data: CS, during: async (t0, t1) => CS.feats.map((f, i) => (k0(f) <= t1 && k1(f) >= t0 ? i : -1)).filter((i) => i >= 0),
  contains: async (x, y) => ({ rows: CS.feats.map((f, i) => (WarGeom.pointInPolys([x, y], csPolys(f)) ? [i, Object.assign(f.slice(), { 8: null })] : null)).filter(Boolean), dates: [], sheets: [] }) };
/* ONE window for both modules: the importer leaves its globals on globalThis, so a second window would replace the first */
const wwin = Object.assign(win, { IntMapHistBundles: { open: () => Promise.resolve(door) } });
const wglobals = { window: wwin, document, fetch, location: { href: 'http://intmap.test/' } };
const { warLayer } = await importModule('js/war-layer.js', { globals: wglobals, mocks: {
  'js/geo-engine.js': { IntMapGeoEngine: anything }, 'js/chronos.js': { IntMapTime: anything }, 'js/runtime.js': { everyTick: () => 0, stopTick: () => { } } } });
const WARS = warLayer(HOST);
const EP = await importModule('js/event-past.js', { globals: wglobals, mocks: { 'js/place-history.js': {
  placeHistory: async () => ({}), historyHtml: () => '', historyAction: () => null, forAtlas: () => ({}), ensureHistoryCss() { } } } });

test('⑤ Ukraine, asked of its land: the Second World War is the USSR\'s record, marked as a predecessor\'s; Japan has none', async () => {
  const ua = await WARS.atPoint(31.17, 48.38, { level: 'country' });
  assert.equal(ua.country.gw, 369, 'the country is today\'s Ukraine');
  const ww2 = ua.wars.find((w) => w.id === 'ww2');
  assert.ok(ww2.involved, 'asking only gw 369 (from 1991) dropped the war; asked of the land it is there');
  const ussr = ww2.periods.filter((p) => p.gw === 365);
  assert.ok(ussr.length && ussr.every((p) => p.predecessor), 'the USSR\'s periods are a predecessor\'s record');
  assert.ok(ussr.some((p) => p.faction === 'ALLIED' && p.from === '1941-06-22'), JSON.stringify(ussr));
  /* the share is the share ON THE PERIOD'S DAY: CShapes gives Lviv to Poland until 1945-05-07, so the USSR holds most of the
     land in 1939 and all of it from 1945-05-08 — and Poland's periods carry Poland's part */
  assert.ok(ussr[0].share >= 60 && ussr[0].share < 100, 'most, not all, in 1939: ' + JSON.stringify(ussr.map((p) => [p.from, p.share])));
  assert.equal(ussr.find((p) => p.from === '1945-05-08').share, 100, 'all of it after Lviv passes');
  const poland = ww2.periods.filter((p) => p.gw === 290);
  assert.ok(poland.length && poland.every((p) => p.predecessor && p.share > 0 && p.to <= '1945-05-08'), JSON.stringify(poland));
  assert.ok(ww2.periods.every((p) => p.gw !== 369), 'Ukraine itself is not given a side it did not have');
  assert.ok(ww2.events.length > 0, 'the dated events on the present land');
  const jp = await WARS.atPoint(139.69, 35.69, { level: 'country' });
  assert.ok(jp.wars.find((w) => w.id === 'ww2').periods.every((p) => p.gw === 740 && !p.predecessor), 'Japan is its own record');
  /* the card and Atlas say so */
  wwin.IntMapWarFronts = { label: () => '' };
  const rec = { place: { level: 'country', why: 'representative-point-of-country', kind: 'country', name: 'Ukraine', at: { lng: 31.17, lat: 48.38 } }, history: { status: 'not-asked', reason: 'representative-point-of-country' }, wars: ua, elections: { status: 'none' } };
  const html = EP.pastHtml(rec, 'jp');
  assert.match(html, /前身の国の記録/);
  assert.match(html, /今の国土の約 \d+%/);
  const A = EP.forAtlas(rec).wars.involved.find((w) => w.id === 'ww2');
  assert.ok(A.periods.some((p) => p.gw === 365 && p.predecessorRecord && p.shareOfPresentLandPct === 100));
});
