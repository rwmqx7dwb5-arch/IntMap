/* (news-past-fixes) What production showed after «This place's past» shipped, held as facts:
 *   ① the election prefilter is the cells each boundary file's polygons touch, and that is a SUPERSET of the geometry —
 *      every vertex and every point inside a district lies in a listed cell (a missed cell would drop a real district)
 *   ② a London event fetches only the files that can hold London — not France's, Russia's, the United States' or the
 *      2024 EU's (one box per file covered the whole Earth for a polity across the date line or with land overseas)
 *   ③ an election named by its caller is chosen BEFORE the layer switches on: the layer does not first choose the newest
 *      election anywhere (Japan) and fetch it, and the caller's election is the one the layer holds
 *   ④ the war and election headings, and Atlas's election tools, go through the layers' own rows (the box, the share link
 *      and the map agree); the button says «a party to», as the section does
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
