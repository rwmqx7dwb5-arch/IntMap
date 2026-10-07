/* ============================================================================
 *  border-provenance · «where this line comes from» — the pieces, evaluated
 * ----------------------------------------------------------------------------
 *  ① the row fingerprint is the page's and the build's ONE function, and every index row keys the
 *    shipped row at its position (scripts/build-border-provenance.mjs `check`) — and a rebuilt bundle
 *    is refused, not borrowed from
 *  ② the side sampler names both shapes of a shared edge, and only the covering one at rDeg 0
 *  ③ the build's date classification says who set each drawn edge, on the cases it meets
 *  ④ every record a reader can name has words on the card (no `default` fall-through for a real record)
 *  ⑤ the real records, at named dates and places (the historical check in the development record):
 *    1914 Ruse (Bulgaria / Rumania, CShapes), 1914 Dobrich in Romania, 1900 Tokyo-fu / Kanagawa (the
 *    reconstruction, with its dossier key), and an OHM row the index cannot name is left unnamed
 *  ⑥ the one line listener yields to an exclusive owner, a tool and a map-level claim, and claims a bare line press
 * ========================================================================== */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { rowKey, shapesAt, decimalsOf, PROVENANCE_INDEX } from '../js/border-provenance.js';
import { check, ohmEdge, sayingTags } from '../scripts/build-border-provenance.mjs';
import { parseDate } from '../scripts/build-hist-borders.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const ev = (p) => { const w = {}; new Function('window', read(p))(w); return Object.values(w)[0]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;

test('① the fingerprint is stable, reads both name shapes, and every index row keys its shipped row', () => {
  assert.equal(rowKey([{ en: 'Japan' }, 740, 1886, 1, 1, 2019, 12, 31]), rowKey(['Japan', 4, 1886, 1, 1, 2019, 12, 31]));
  assert.notEqual(rowKey([{ en: 'Japan' }, 740, 1886, 1, 1, 2019, 12, 31]), rowKey([{ en: 'Japan' }, 740, 1886, 1, 2, 2019, 12, 31]));
  assert.match(rowKey([{ en: 'x' }, 0, 1, 1, 1, 2, 1, 1]), /^[0-9a-f]{8}$/);
  assert.deepEqual(check(), [], 'scripts/build-border-provenance.mjs --check');
});

test('① a bundle rebuilt after the index is refused row by row, never answered with the old row', () => {
  const file = 'data/hist-borders-late.js';
  const real = read(file);
  const w = {}; new Function('window', real)(w); const d = w.__HISTBLATE;
  d.feats[0] = d.feats[0].slice(); d.feats[0][4] = d.feats[0][4] === 1 ? 2 : 1;   /* one row's start day moves */
  const mutated = 'window.__HISTBLATE=' + JSON.stringify(d) + ';\n';
  const bad = check((p) => (p === file ? mutated : read(p)));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /1 row\(s\) of data\/hist-borders-late\.js no longer match their fingerprint/);
});

test('② the sampler names both shapes of a shared edge, and only the covering shape at radius 0', () => {
  const sq = (x0, x1, name) => ({ type: 'Feature', properties: { NAME: name }, geometry: { type: 'Polygon', coordinates: [[[x0, 0], [x1, 0], [x1, 1], [x0, 1], [x0, 0]]] } });
  const holed = { type: 'Feature', properties: { NAME: 'ring' }, geometry: { type: 'Polygon', coordinates: [[[5, 0], [8, 0], [8, 3], [5, 3], [5, 0]], [[6, 1], [7, 1], [7, 2], [6, 2], [6, 1]]] } };
  const fs = [sq(0, 1, 'A'), sq(1, 2, 'B'), sq(3, 4, 'far'), holed];
  assert.deepEqual(shapesAt(fs, { lng: 1, lat: 0.5 }, 0.05).map((f) => f.properties.NAME).sort(), ['A', 'B']);
  assert.deepEqual(shapesAt(fs, { lng: 0.9, lat: 0.5 }, 0).map((f) => f.properties.NAME), ['A']);
  assert.deepEqual(shapesAt(fs, { lng: 6.5, lat: 1.5 }, 0).map((f) => f.properties.NAME), [], 'a hole is not the shape');
  assert.deepEqual(decimalsOf([[[[1.25, 2.5], [3, 4.125]]]]), { decimals: 3, vertices: 2 });
});

test('③ who set an OHM edge: the tag, a year of it, nobody, or the build', () => {
  assert.equal(ohmEdge('1871-08-29', [1871, 8, 29], false, parseDate), 'upstream');
  assert.equal(ohmEdge('1871', [1871, 1, 1], false, parseDate), 'partial');
  assert.equal(ohmEdge('1871', [1872, 1, 1], true, parseDate), 'partial', 'a year-only end is drawn to the end of that year');
  assert.equal(ohmEdge(null, [-99999, 1, 1], false, parseDate), 'unstated');
  assert.equal(ohmEdge(null, [3000, 1, 1], true, parseDate), 'unstated');
  assert.equal(ohmEdge('1900-01-01', [1899, 6, 1], true, parseDate), 'derived', 'a clamped end is not the tag');
  assert.equal(ohmEdge(undefined, [1886, 1, 1], false, parseDate), 'derived', 'a drawn edge with no tag behind it was set by the build');
  assert.equal(ohmEdge('around 1600', [1600, 1, 1], false, parseDate), 'unparsed');
  assert.deepEqual(sayingTags({ name: 'x', source: 'a', 'fixme:s': 'b', 'start_event:wikidata': 'Q1', wikidata: 'Q2' }), { 'fixme:s': 'b', source: 'a', 'start_event:wikidata': 'Q1' });
  assert.equal(sayingTags({ name: 'x' }), null);
});

test('④ every record a reader can name has words on the card', () => {
  const card = read('js/border-provenance-card.js');
  const named = new Set();
  for (const f of ['js/time-borders.js', 'js/time-admin1.js']) for (const m of read(f).matchAll(/\brec:\s*(?:rec\?)?'([a-z-]+)'(?::'([a-z-]+)')?/g)) { named.add(m[1]); if (m[2]) named.add(m[2]); }
  for (const m of read('js/time-admin1.js').matchAll(/side\.rec = '([a-z-]+)'/g)) named.add(m[1]);
  assert.ok(named.size >= 8, 'the readers name their records: ' + [...named].join(','));
  for (const r of named) assert.match(card, new RegExp("case '" + r + "':"), 'the card has words for «' + r + '»');
});

/* ── ⑤ the real records ─────────────────────────────────────────────────────────────────────── */
const geom = (d, f) => { const polys = f[8].map((p) => p.map((ri) => d.rings[ri])); return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }; };
const drawn = (d, t, incl) => d.feats.map((f, i) => ({ f, i })).filter(({ f }) => ymd(f[2], f[3], f[4]) <= t && (incl ? t <= ymd(f[5], f[6], f[7]) : t < ymd(f[5], f[6], f[7])))
  .map(({ f, i }) => ({ type: 'Feature', geometry: geom(d, f), properties: { NAME: (f[0] && f[0].en) || f[0], i } }));

test('⑤ 1914: the Danube at Ruse separates CShapes Bulgaria and Rumania, both from the Treaty of Bucharest; Dobrich is Romanian', () => {
  const cs = ev('data/cshapes.js'), t = ymd(1914, 6, 15), fs = drawn(cs, t, true);
  const at = shapesAt(fs, { lng: 25.97, lat: 43.875 }, 0.06).map((x) => cs.feats[x.properties.i]);
  assert.deepEqual(at.map((f) => f[0]).sort(), ['Bulgaria', 'Rumania']);
  for (const f of at) assert.deepEqual(f.slice(2, 5), [1913, 8, 10], f[0] + ' begins on the day the treaty was signed');
  assert.deepEqual(shapesAt(fs, { lng: 27.83, lat: 43.57 }, 0).map((x) => cs.feats[x.properties.i][0]), ['Rumania'], 'Southern Dobruja was Romanian 1913–1940');
});

test('⑤ 1900: the Tama between Tokyo-fu and Kanagawa is the reconstruction, keyed to its dossier', () => {
  const recon = ev('data/hist-admin-recon.js'), t = ymd(1900, 7, 1), fs = drawn(recon, t, false);
  const sides = shapesAt(fs, { lng: 139.67, lat: 35.565 }, 0.04).map((x) => x.properties.i);
  assert.deepEqual(sides.map((i) => recon.feats[i][0]).sort(), ['Kanagawa Prefecture', 'Tokyo Prefecture']);
  const gx = JSON.parse(read(PROVENANCE_INDEX.gaps)).sets['data/hist-admin-recon.js'];
  for (const i of sides) {
    const r = gx.rows[i];
    assert.equal(r[0], rowKey(recon.feats[i]));
    assert.ok(gx.sources[r[1]] && /scripts\/histrecon\/.+\.json$/.test(gx.sources[r[1]].url), 'the dossier is named by the record: ' + r[1]);
  }
  /* Hachiōji came to Tokyo with the Santama transfer of 1893 */
  assert.deepEqual(shapesAt(fs, { lng: 139.32, lat: 35.66 }, 0).map((x) => recon.feats[x.properties.i][0]), ['Tokyo Prefecture']);
});

test('⑤ an OHM row the index cannot name stays unnamed — no relation id is borrowed from a neighbour', () => {
  const ix = JSON.parse(read(PROVENANCE_INDEX.ohm));
  const rows = ix.sets['data/hist-borders.js'];
  const unnamed = rows.filter((r) => r[1] == null);
  for (const r of unnamed) assert.equal(r.length, 2, 'an unmatched row carries its key and nothing else');
  const named = rows.filter((r) => r[1] != null);
  assert.ok(named.length > rows.length * 0.9, 'most rows are named (' + named.length + ' of ' + rows.length + ')');
  for (const r of named) for (const id of [].concat(r[1])) assert.ok(Number.isInteger(id) && id > 0);
  assert.ok(['upstream', 'partial', 'unstated', 'derived', 'unparsed'].includes(named[0][3]));
});

/* ── ⑥ the one line listener, evaluated against a stub engine ────────────────────────────────────
   The same arbitration the browser runs (the browser half was exercised by hand and is recorded in
   dev-notes/2026-10-07-border-provenance.md §5: a 1914 Danube press opened the card with both CShapes
   rows; a press beside «Giurgiu» opened the city instead). A line is the LAST owner of a tap: an
   exclusive owner under the padded point wins, a claim made by a map-level listener wins, a tool wins. */
test('⑥ a line press is claimed only when nothing else owns the tap', async () => {
  const { registerReader, wireLineClick, lineNear } = await import('../js/border-provenance.js');
  let listener = null, claimed = null;
  const hits = { line: true, owner: false };
  const engine = {
    hasRenderer: () => true,
    events: {
      on: (ev, fn) => { if (ev === 'click') listener = fn; },
      clickClaimed: (e) => claimed === e, claimClick: (e) => { claimed = e; },
      clickLayers: () => ['place-label', 'stub-line'],
    },
    layers: { get: () => ({}), getLayout: () => 'visible' },
    coords: { queryRenderedFeatures: (box, o) => (o.layers.includes('stub-line') ? (hits.line ? [{ layer: { id: 'stub-line' } }] : []) : (hits.owner ? [{ layer: { id: 'place-label' } }] : [])) },
  };
  const GE = () => engine, HOST = { lang: 'en', toolMode: null, imToast: () => {} };
  registerReader({ id: 'stub', family: 'country', layers: () => ['stub-line'], sidesAt: () => [] });
  assert.equal(lineNear(GE, { x: 10, y: 10 }, HOST).length, 1);
  wireLineClick(GE, HOST); wireLineClick(GE, HOST);
  assert.equal(typeof listener, 'function');
  const press = () => ({ point: { x: 10, y: 10 }, lngLat: { lng: 0, lat: 0 }, originalEvent: {} });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /* an exclusive owner under the point (a place label) keeps the tap */
  hits.owner = true; let e = press(); listener(e); await settle(); assert.notEqual(claimed, e);
  /* a tool owns the gesture */
  hits.owner = false; HOST.toolMode = 'measure'; e = press(); listener(e); await settle(); assert.notEqual(claimed, e); HOST.toolMode = null;
  /* a map-level owner claimed the DOM event first */
  e = press(); claimed = e; const before = claimed; listener(e); await settle(); assert.equal(claimed, before);
  /* no line under the point: nothing */
  hits.line = false; e = press(); listener(e); await settle(); assert.notEqual(claimed, e); hits.line = true;
  /* only the line: the press is claimed one microtask later */
  e = press(); listener(e); assert.notEqual(claimed, e, 'not claimed synchronously — map-level owners are heard first'); await settle(); assert.equal(claimed, e);
});
