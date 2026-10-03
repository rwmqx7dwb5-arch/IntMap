/* map-layer-system — the country indicators as one layer, and the rows that paint one series.
 *
 * MEASURED (2026-10-03): three pairs of Layers-panel rows painted the same World Bank series under two names —
 * life expectancy SP.DYN.LE00.IN (`beta-dl-lifeexp` + `bx-wblife`), unemployment SL.UEM.TOTL.ZS
 * (`beta-dl-unemp` + `bx-wbunemp`), internet users IT.NET.USER.ZS (`beta-dl-internet` + `bx-wbnet`) — and the
 * halves disagreed about time: the js/wb-layers.js row painted the clock's year, the js/layer-packs.js row its own,
 * and js/layer-time-decl.js called one of them a 2022 snapshot. Nothing in the tree said they were pairs.
 * The record is dev-notes/2026-10-03-map-layer-system.md.
 *
 *   ① THE CLAIM — every declaration's `measures` is a series the code that paints the row fetches, and every
 *     series the code paints is claimed (scripts/lib/indicator-series.mjs, run by scripts/layer-descriptors.mjs)
 *   ② THE REPORT — the rows that share a series are DISCOVERED from the declarations (no list here); every pair
 *     makes one statement about time, and it is the clock-following one
 *   ③ A NEW DUPLICATE CANNOT ARRIVE UNSEEN — a second table row painting a series, undeclared, is a problem
 *   ④ THE BROWSER — one entry per series, the other row named; country-table rows offered by their own row;
 *     search by English, Japanese and code; choosing paints one at a time; the facts are read off the series
 *   ⑤ THE DOORS — the row, its share state, its Atlas capability and its time declaration exist
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSeries, seriesProblems, sameSeries, rowFor } from '../scripts/lib/indicator-series.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import '../js/safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper the browser writes through */
import { LAYERS, layerDeclaration } from '../js/layer-manifest.js';
import { TIME } from '../js/layer-time-decl.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const jsFiles = () => fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => [f, codeOnly(read('js/' + f))]);
const decls = () => LAYERS.map((l) => layerDeclaration(l.id)).filter(Boolean);

test('① every `measures` claim is what the code paints, and every painted series is claimed', () => {
  const found = discoverSeries(jsFiles());
  assert.ok(found.size >= 60, 'the World Bank family and the country-table rows are discovered (' + found.size + ')');
  assert.deepEqual(seriesProblems(decls(), found), []);
  /* the IMERG raster and the World Bank precipitation row share the short word `precip` and are two layers */
  const pr = found.get('precip');
  assert.equal(rowFor(decls(), 'precip', pr).id, 'beta-dl-precip');
  assert.equal((layerDeclaration('dl-precip') || {}).measures, undefined);
});

test('② the rows that share a series are discovered, and each pair makes one clock-following statement about time', () => {
  const groups = sameSeries(decls());
  /* the report — what the gate found today (printed, not pinned: a new pair is reported, not a failure) */
  console.log('same series: ' + groups.map((g) => g.series + ' = ' + g.ids.join(' + ')).join(' · '));
  const byS = new Map(groups.map((g) => [g.series, g.ids]));
  for (const [s, ids] of [['worldbank:SP.DYN.LE00.IN', ['beta-dl-lifeexp', 'bx-wblife']], ['worldbank:SL.UEM.TOTL.ZS', ['beta-dl-unemp', 'bx-wbunemp']], ['worldbank:IT.NET.USER.ZS', ['beta-dl-internet', 'bx-wbnet']]]) {
    assert.deepEqual(byS.get(s), ids, s + ' is measured by both rows');
  }
  /* «precip / wbagri» was a suspected pair: they are two series (AG.LND.PRCP.MM, AG.LND.AGRI.ZS) */
  assert.ok(!groups.some((g) => g.ids.includes('beta-dl-precip') && g.ids.includes('bx-wbagri')));
  for (const g of groups) {
    const kinds = new Set(g.ids.map((id) => TIME[id] && TIME[id].kind));
    assert.deepEqual([...kinds], ['series'], g.series + ': every row painting it is a series on the clock (' + g.ids.join(', ') + ')');
    for (const id of g.ids) assert.match(String(TIME[id].follows || ''), /^js\/[a-z-]+\.js \w+/, id + ' says what makes it follow the clock');
  }
});

test('② the js/layer-packs.js World Bank rows paint the clock\'s year and report the years they hold', () => {
  const src = codeOnly(read('js/layer-packs.js'));
  assert.match(src, /function wbClockYear\(S\)/);
  assert.match(src, /const cy=wbClockYear\(S\);\s*const year=\(cy!=null\)\?cy:/);
  assert.match(src, /LT\.range\('beta-dl-'\+key,/);
  assert.match(src, /IntMapTime\.on\(\(\)=>\{ Object\.keys\(WB\)\.forEach\(k=>\{ if\(state\[k\]\) wbToggle\(k,true\);/);
  /* a year picked in the legend is the map's year — it moves the one clock */
  assert.match(src, /IntMapTime\.setYear\(\+v,\{source:'ui'\}\)/);
  /* the stated 2022 is gone from the note: the legend names the year it paints */
  assert.doesNotMatch(read('js/layer-packs.js'), /Life expectancy at birth \(World Bank, 2022\)/);
});

test('③ a second row painting a series, undeclared, is a problem — the gate finds it, no list does', () => {
  const files = [['probe.js', "const W={zz:{ind:'SP.DYN.LE00.IN'}}; fetch('https://api.worldbank.org/x'); el.id='beta-dl-'+k;"]];
  const ds = [{ id: 'beta-dl-zz' }];
  const p = seriesProblems(ds, discoverSeries(files));
  assert.equal(p.length, 1);
  assert.match(p[0], /beta-dl-zz\.js: the code paints `worldbank:SP\.DYN\.LE00\.IN`/);
  /* …and once declared, it is reported as the same series as the row already measuring it */
  ds[0].measures = ['worldbank:SP.DYN.LE00.IN'];
  assert.deepEqual(seriesProblems(ds, discoverSeries(files)), []);
  assert.deepEqual(sameSeries(ds.concat([{ id: 'bx-wblife', measures: ['worldbank:SP.DYN.LE00.IN'] }])), [{ series: 'worldbank:SP.DYN.LE00.IN', ids: ['beta-dl-zz', 'bx-wblife'] }]);
  /* a claim the code does not make */
  assert.match(seriesProblems([{ id: 'beta-dl-zz', measures: ['worldbank:NOPE'] }], discoverSeries(files)).join('\n'), /measures `worldbank:NOPE` — the code that paints this row does not/);
});

/* the browser, evaluated with the host js/wb-layers.js hands it — entries read from the real WB table */
async function browser() {
  const { makeIndicatorBrowser } = await import('../js/indicator-browser.js');
  const src = read('js/wb-layers.js');
  const entries = [];
  for (const m of codeOnly(src).matchAll(/\{id:'(wb[a-z0-9]+)', code:('[^']+'|\[[^\]]+\]), n:LA\(('[^']*'),('[^']*')/g)) {
    const codes = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    entries.push({ id: m[1], row: 'bx-' + m[1], base: m[1], mode: null, code: codes.length > 1 ? codes : codes[0], key: codes.join('+'), n: [m[3].slice(1, -1), m[4].slice(1, -1)], unit: '%', ramp: [0, '#000', 1, '#fff'] });
  }
  const boxes = new Map();
  const box = (id) => { if (!boxes.has(id)) boxes.set(id, { id, checked: false, matches: () => true, dispatchEvent() { calls.push([id, this.checked]); return true; }, closest: () => null }); return boxes.get(id); };
  const calls = [], painted = [];
  globalThis.document = { getElementById: (id) => box(id) };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  let cur = null;
  const S = { years: ['2020', '2021', '2022'], best: '2022', by: { 2022: { JPN: 84.8, CHE: 83.6, NGA: 53.6, TCD: 52.5, USA: 77.4, AB: 1 } } };
  const b = makeIndicatorBrowser({
    lang: () => 'en', entries: () => entries, paint: (id) => { cur = id; painted.push(id); return true; }, clear: () => { cur = null; }, current: () => cur,
    series: async () => S, seriesOf: () => S, yearOf: () => '2022', name: (n) => n[0], countryName: (iso) => ({ JPN: 'Japan', CHE: 'Switzerland', NGA: 'Nigeria', TCD: 'Chad', USA: 'United States' })[iso] || iso,
    wanted: () => null, legend: () => null, hideLegend() {}, escape: (s) => s,
  });
  return { b, entries, calls, painted, boxes };
}

test('④ one entry per series; the other row named; the country table offered by its own rows', async () => {
  const { b, entries } = await browser();
  assert.ok(entries.length >= 55, 'the WB table read (' + entries.length + ')');
  const cat = b.catalogue();
  const life = cat.filter((e) => e.series === 'worldbank:SP.DYN.LE00.IN');
  assert.equal(life.length, 1, 'life expectancy is offered once');
  assert.deepEqual(life[0].also, ['beta-dl-lifeexp']);
  assert.equal(life[0].kind, 'series');
  /* the rows this reader does not paint — each once, by its row: the country table, and the two World Bank rows
     no js/wb-layers.js entry measures (corruption on source 3, long-run precipitation) */
  const rows = cat.filter((e) => e.kind === 'row').map((e) => e.row).sort();
  for (const id of ['dl-gdppc', 'dl-hdi', 'dl-pop', 'dl-dem', 'dl-tfr', 'dl-milSpend', 'beta-dl-cpi', 'beta-dl-precip']) assert.ok(rows.includes(id), id + ' is offered');
  assert.ok(!rows.includes('beta-dl-lifeexp') && !rows.includes('beta-dl-unemp') && !rows.includes('beta-dl-internet'), 'a series painted here is not offered twice');
  /* every entry has a subject — the shelf its own row stands on */
  assert.deepEqual(cat.filter((e) => !e.subject).map((e) => e.id), []);
});

test('④ search by the reader\'s words, by Japanese, and by code', async () => {
  const { b } = await browser();
  assert.equal(b.search('life expectancy')[0].id, 'wblife');
  assert.equal(b.search('平均寿命')[0].id, 'wblife');
  assert.equal(b.search('SL.UEM.TOTL.ZS')[0].id, 'wbunemp');
  assert.ok(b.search('unemployment').some((h) => h.id === 'wbunemp'));
  assert.deepEqual(b.search('zzzz-nothing'), []);
});

test('④ choosing paints one at a time; a country-table row is switched on and released', async () => {
  const { b, painted, boxes } = await browser();
  b.select('wbunemp');
  assert.deepEqual(painted, ['wbunemp']);
  assert.equal(boxes.get('bx-wbind').checked, true, 'choosing from outside switches the browser row on');
  b.select('row:dl-gdppc');
  assert.equal(boxes.get('dl-gdppc').checked, true);
  assert.equal(b.current().row, 'dl-gdppc');
  b.select('wblife');
  assert.equal(boxes.get('dl-gdppc').checked, false, 'the row it switched on is switched off again');
  assert.equal(b.current().id, 'wblife');
  /* a row id names its indicator too — 'beta-dl-lifeexp' is the same series as wblife */
  assert.equal(b.select('bx-wbnet').id, 'wbnet');
  b.closed();
});

test('④ the facts are read off the series: the year, how many reported, the top and the bottom', async () => {
  const { b } = await browser();
  const f = await b.facts('wblife', 2);
  assert.equal(f.year, '2022');
  assert.equal(f.reporting, 5, 'a code that is not a country (two letters) is not counted');
  assert.deepEqual(f.top.map((x) => x.name), ['Japan', 'Switzerland']);
  assert.deepEqual(f.bottom.map((x) => x.name), ['Chad', 'Nigeria']);
  assert.deepEqual(f.also.map((x) => x.id), ['beta-dl-lifeexp']);
});

test('⑤ the row, its share state, its Atlas door and its time declaration', () => {
  const d = layerDeclaration('bx-wbind');
  assert.ok(d && d.state === 'wbind' && d.atlas.includes('layers.indicator'));
  assert.equal(TIME['bx-wbind'] && TIME['bx-wbind'].kind, 'series');
  const wb = codeOnly(read('js/wb-layers.js'));
  assert.match(wb, /IntMapShareState\.register\('wbind',/);
  assert.match(wb, /\{id:'wbind',n:IND_NAME,on:indOn,off:indOff\}/);
  assert.match(wb, /import\('\.\/indicator-browser\.js'\)/);
  /* the browser paints through the same painter as the rows — the IMF gap-fill follows the series, not the row id */
  assert.equal((wb.match(/\(L\.base\|\|L\.id\)==='wbdebt'/g) || []).length, 2);
  const cap = read('js/atlas-cap-layers.js');
  assert.match(cap, /row: \['layers\.indicator',\s+'indicator'/);
  assert.ok(read('js/atlas-capabilities.js').includes('["layers.indicator","indicator"'), 'the registry carries the row');
  /* the alias reaches both rows of a pair */
  assert.match(read('js/atlas-console.js'), /function _sameSeriesRows\(id\)/);
});

/* the layer-state audit waits on a row's request only if the row hands it over. The rows of js/wb-layers.js are wired in
   ONE place (`buildRows`), so the request is handed over there — every row at once, not the indicator row alone — and
   the painter settles even when the country shapes fail to load (a promise that never settles would hold the row
   «in flight» forever, and the audit would never look at it again). */
test('⑤ every World Bank row hands its paint to the layer-state audit, from the one place the rows are wired', () => {
  const wb = codeOnly(read('js/wb-layers.js'));
  const build = wb.slice(wb.indexOf('function buildRows('), wb.indexOf('function buildRows(') + 1500);
  assert.match(build, /req=L\.on\(\)/);
  assert.match(build, /layerInflight\.track\(cb\.id,req\)/);
  assert.match(wb, /const ALL=WB\.map\(L=>\(\{[^}]*on:\(\)=>choroOn\(L\)/);
  assert.match(wb, /function choroOn\(L\)\{[^\n]*return done; \}|\}\)\.then\(fin,fin\); \}\); return done; \}/);
  assert.match(wb, /loadCountryData\(\)\.then\(\(\)=>cb\(window\.countryGeo\),\(\)=>cb\(null\)\)/);
  assert.match(wb, /function indOn\(\)\{ return indBrowser\(\)/);
});

/* ══ THE YEAR BOOK (js/year-book.js) — read over the REAL records, with the border record's own rule ═════════════
   The page asks js/time-borders.js `collectionAt`; here the same question is put to data/cshapes.js directly, with
   the rule csFC uses (start ≤ t ≤ end — CShapes' end is INCLUSIVE) and the change days csBounds takes (each start,
   and the day after each end). One geometry object per record, as `_csGeomOf` memoizes. */
function cshapesBorders() {
  const s = read('data/cshapes.js'), cs = JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
  const k = (y, m, d) => y * 10000 + m * 100 + d;
  const geom = new Map();
  const g = (i) => { if (!geom.has(i)) { const ps = cs.feats[i][8].map((p) => p.map((ri) => cs.rings[ri])); geom.set(i, ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps }); } return geom.get(i); };
  const bounds = new Set();
  for (const f of cs.feats) { bounds.add(k(f[2], f[3], f[4])); const e = new Date(f[5], f[6] - 1, f[7] + 1); bounds.add(k(e.getFullYear(), e.getMonth() + 1, e.getDate())); }
  return {
    async collectionAt(when) {
      const t = k(when.getFullYear(), when.getMonth() + 1, when.getDate());
      if (when.getFullYear() > 2019) return { modern: true };
      const feats = [];
      cs.feats.forEach((f, i) => { if (k(f[2], f[3], f[4]) <= t && t <= k(f[5], f[6], f[7])) feats.push({ type: 'Feature', geometry: g(i), properties: { NAME: f[0] } }); });
      return { key: 'cs', tier: 'cshapes', fc: { type: 'FeatureCollection', features: feats } };
    },
    async changeDates() { return [...bounds].sort((a, b) => a - b).map((x) => new Date(Math.floor(x / 10000), Math.floor(x / 100) % 100 - 1, x % 100)); },
    recordOf: () => ({ tier: 'cshapes', src: cs.src }),
  };
}
const maddisonReader = () => {
  const data = JSON.parse(read('data/maddison.json'));
  const rec = (c, y) => (data[c] && data[c][String(y)]) || null;
  let lo = Infinity; for (const c of Object.keys(data)) for (const y of Object.keys(data[c])) lo = Math.min(lo, +y);
  return { load: async () => data, minYear: lo, maxYear: 2018, popN: (c, y) => { const r = rec(c, y); return r && r[1] != null ? r[1] * 1000 : null; }, gdppc: (c, y) => { const r = rec(c, y); return r && r[0] != null ? r[0] : null; } };
};
const yearDeps = () => ({ borders: cshapesBorders(), maddison: maddisonReader(), wars: async () => JSON.parse(read('data/wars.json')), lang: () => 'en', countryName: (c) => c });

test('⑥ the area of a drawn shape is computed on the sphere (a 1°×1° cell at the equator: R²·Δλ·sin 1° = 12,391 km² on R = 6,378,137 m)', async () => {
  const { areaKm2 } = await import('../js/year-book.js');
  const a = areaKm2({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
  const exact = 6378137 ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180) / 1e6;
  assert.ok(Math.abs(a - exact) < 1, 'got ' + a + ', the sphere says ' + exact);
  /* a hole subtracts */
  assert.ok(areaKm2({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]], [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]]] }) < 3 * 12400);
});

test('⑥ 1920 read off CShapes: the change days inside the year, and who appears and goes on each', async () => {
  const { readYear } = await import('../js/year-book.js');
  const r = await readYear(new Date(1920, 5, 15, 12), yearDeps(), { maxDays: 40 });
  assert.equal(r.borders.tier, 'cshapes');
  assert.match(r.borders.record.src, /^CShapes 2\.0/);
  assert.ok(r.borders.count > 50, r.borders.count + ' polities');
  assert.ok(r.borders.largest[0].km2 > r.borders.largest[1].km2, 'largest first');
  const days = r.changes.days;
  assert.ok(days.length >= 5, '1920 holds several change days (' + days.length + ')');
  for (const d of days) { assert.match(d.date, /^1920-\d\d-\d\d$/); assert.ok(d.appeared.length + d.ended.length + d.reshaped.length > 0, d.date + ' changes something'); }
  console.log('1920: ' + days.map((d) => d.date + (d.appeared.length ? ' +' + d.appeared.join('/') : '') + (d.ended.length ? ' -' + d.ended.join('/') : '')).join(' | '));
  /* the war record is not in force in 1920 (WW1 ends 1918-11-11) — nothing is invented for it */
  assert.deepEqual(r.conflicts.wars, []);
  /* Maddison states 1920 for many codes; the total is a sum over those, not a world figure */
  assert.ok(r.economy.popStated > 20);
});

test('⑥ 1914: the First World War is in the record, with its dated events of that year', async () => {
  const { readYear } = await import('../js/year-book.js');
  const r = await readYear(new Date(1914, 5, 15, 12), yearDeps());
  assert.deepEqual(r.conflicts.wars.map((w) => w.id), ['ww1']);
  assert.ok(r.conflicts.events.some((e) => e.date === '1914-06-28'), 'Sarajevo, 28 June 1914');
  assert.ok(r.conflicts.events.every((e) => e.date.startsWith('1914') || (e.to && e.to >= '1914')), 'only events of 1914');
});

test('⑥ outside the records the page says so instead of answering: today\'s borders, Maddison\'s range, the era sheets', async () => {
  const { readYear } = await import('../js/year-book.js');
  const now = await readYear(new Date(2024, 5, 15), yearDeps());
  assert.equal(now.borders.modern, true);
  assert.equal(now.changes, null, 'no change days are claimed for the modern map');
  const deep = await readYear(new Date(1600, 5, 15), yearDeps());
  assert.equal(deep.economy.countries, 0, 'Maddison figures shipped begin at ' + deep.economy.floor);
  /* an era sheet states no day — the reader is told, not handed an invented one */
  const sheetTB = { collectionAt: async () => ({ tier: 'snapshot', fc: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { NAME: 'Roman Empire' } }] } }), changeDates: async () => [new Date(400, 0, 1)], recordOf: () => ({ src: 'historical-basemaps' }) };
  const r = await readYear(new Date(400, 5, 15), Object.assign(yearDeps(), { borders: sheetTB }));
  assert.equal(r.changes.kind, 'sheets');
  assert.deepEqual(r.changes.days, []);
});

test('⑥ the doors: the Chronos panel button, the Atlas capability, the record citing itself', () => {
  assert.match(codeOnly(read('js/news-timeline.js')), /import\('\.\/year-book\.js'\)\.then\(m=>m\.openFromPage\(/);
  assert.match(read('js/atlas-cap-time.js'), /row: \['time\.yearbook',\s+'yearbook'/);
  assert.ok(read('js/atlas-capabilities.js').includes('["time.yearbook","yearbook"'));
  assert.match(codeOnly(read('js/time-borders.js')), /recordOf:\(tier\)=>/);
});

test('⑦ Atlas\'s answers are built beside the readers, from the same facts', async () => {
  const { readYear, atlasHtml } = await import('../js/year-book.js');
  const note = (s) => s;
  const r = await readYear(new Date(1920, 5, 15, 12), yearDeps(), { maxDays: 40 });
  const h = atlasHtml(r, new Date(1920, 5, 15), false, 'en', note);
  assert.match(h, /The world in 1920/);
  assert.match(h, /CShapes 2\.0/);
  assert.match(h, /1920-02-02[^|]*−Khiva/);
  const { b } = await browser();
  const f = await b.facts('wblife', 2);
  const a = b.atlasHtml(f, note);
  assert.match(a, /Year on the map: 2022 · 5 countries reporting/);
  assert.match(a, /Highest: Japan .*Switzerland/);
});
