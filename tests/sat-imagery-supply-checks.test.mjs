/* ============================================================================
 *  IntMap · sat-imagery-supply — every imagery supplier is declared once, with its terms, and the picker answers by date
 * ----------------------------------------------------------------------------
 *  ① every source declares coverage, zoom, time, capture and a licence that names a URL and the day it was read
 *  ② no source is licence-restricted (IntMap is for-profit — EOX Sentinel-2 cloudless was removed for that), and a row's
 *     licence is re-read within a year
 *  ③ every tile host a source uses is on the outbound-host ledger (what Privacy §4 discloses)
 *  ④ the time logic: a Chronos time picks the supplier/date that actually has it; a time nobody covers answers null
 *  ⑤ SAT_PROVIDERS is built from the registry — no second list of suppliers in tables.js
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const R = await import(new URL('js/imagery-registry.js', root).href).catch(() => null);
const SRC = readFileSync(new URL('js/imagery-registry.js', root), 'utf8');

/* esri-imagery.js is imported by the registry; load the registry through a data: URL only if the direct import cannot resolve './esri-imagery.js' */
const reg = R;
const TODAY = '2026-11-20';

test('① every source is fully declared', () => {
  assert.ok(reg, 'the registry loads');
  const ids = new Set();
  for (const s of reg.SOURCES) {
    assert.ok(!ids.has(s.id), 'duplicate id ' + s.id); ids.add(s.id);
    assert.ok(Array.isArray(s.name) && s.name.length >= 2 && s.name.every(Boolean), s.id + ': name en+jp');
    assert.ok(s.coverage.length && s.coverage.every((b) => b.length === 4 && b[0] < b[2] && b[1] < b[3]), s.id + ': coverage boxes');
    assert.ok(s.zoom[0] >= 0 && s.zoom[1] >= s.zoom[0], s.id + ': zoom');
    assert.ok(['latest', 'day', 'year', 'epoch'].includes(s.time.mode), s.id + ': time mode');
    assert.ok(['service-query', 'layer-date', 'declared'].includes(s.capture.kind), s.id + ': capture kind');
    assert.equal(typeof s.tiles, 'function', s.id + ': tiles()');
    const urls = s.tiles(s.time.mode === 'year' ? s.time.years[0] : '2024-06-15');
    assert.ok(Array.isArray(urls) && urls.every((u) => /^https:\/\//.test(u)), s.id + ': https tile urls');
    assert.ok(s.attribution || s.attributionFn, s.id + ': a credit');
    assert.ok(s.license && /^https:\/\//.test(s.license.url) && /^\d{4}-\d{2}-\d{2}$/.test(s.license.checked) && s.license.name, s.id + ': licence with url and the day it was read');
    if (s.capture.kind === 'declared') assert.ok(s.capture.range && s.capture.text, s.id + ': a declared source says what range and why no date');
    if (s.time.mode === 'epoch') assert.ok(s.time.from <= s.time.to, s.id + ': epoch');
  }
});

test('② no restricted licence; every licence read within a year', () => {
  for (const s of reg.SOURCES) {
    assert.notEqual(s.license.commercial, 'restricted', s.id + ' is licence-restricted (IntMap is for-profit)');
    assert.ok(['allowed', 'unconfirmed'].includes(s.license.commercial), s.id + ': commercial must be allowed|unconfirmed');
    const age = (Date.parse(TODAY) - Date.parse(s.license.checked)) / 864e5;
    /* the clock is the real one, so this fails a year after a licence was last read — that is its purpose */
    const real = (Date.now() - Date.parse(s.license.checked)) / 864e5;
    assert.ok(real < 400, s.id + ': licence last read ' + s.license.checked + ' — read the primary page again (age ' + Math.round(real) + ' d, as of check ' + Math.round(age) + ')');
  }
  assert.ok(!reg.SOURCES.some((s) => /eox/i.test(s.id + JSON.stringify(s.tiles('2024-01-01')))), 'EOX s2cloudless must stay out');
  assert.ok(reg.SOURCES.filter((s) => s.license.commercial === 'unconfirmed').map((s) => s.id).join() === 'esri', 'only the keyless Esri endpoint is unconfirmed (the user kept it on 2026-11-20)');
});

test('③ every tile host is on the outbound-host ledger', () => {
  const ledger = JSON.parse(readFileSync(new URL('scripts/outbound-hosts.json', root), 'utf8')).hosts.map((h) => h.host);
  for (const s of reg.SOURCES) {
    if (s.id === 'esri') continue;   /* esri-imagery.js owns its hosts (tests/esri-imagery-checks.test.mjs) */
    for (const u of s.tiles(s.time.mode === 'year' ? s.time.years[0] : '2024-06-15')) assert.ok(ledger.includes(new URL(u.replace(/[{}]/g, '')).host), s.id + ': ' + u + ' is not on scripts/outbound-hosts.json');
  }
});

test('④ Chronos: the picture of a time', () => {
  const at = (s, iso) => reg.pickForTime(reg.sourceById(s), iso, TODAY);
  assert.deepEqual(at('gibs-viirs', '2020-03-01'), { day: '2020-03-01', exact: true });
  assert.equal(at('gibs-viirs', '2010-03-01'), null, 'VIIRS SNPP has nothing before 2015-11-24');
  assert.equal(at('gsi-1974', '1976-05-05').exact, true);
  assert.equal(at('gsi-1974', '1980-05-05'), null);
  assert.deepEqual(at('pdok-year', '2018-06-01'), { year: 2018, exact: true });
  assert.deepEqual(at('pdok-year', '2014-06-01'), { year: 2016, exact: false }, 'two years either way answers the nearest, flagged inexact');
  assert.equal(at('pdok-year', '2005-06-01'), null);
  assert.deepEqual(at('gibs-weld', '1999-06-01'), { year: 1999, exact: true });
  assert.equal(at('esri', '1980-01-01'), null, '«latest» is the present year only');
  assert.deepEqual(at('esri', '2026-03-01'), { exact: true });
  /* where each picture is */
  const tokyo = { lng: 139.76, lat: 35.68, zoom: 15 };
  assert.equal(reg.rankAt({ ...tokyo, time: '1980-06-01', today: TODAY })[0].id, 'gsi-1979');
  assert.equal(reg.rankAt({ ...tokyo, time: '1947-06-01', today: TODAY })[0].id, 'gsi-1945');
  assert.ok(!reg.rankAt({ ...tokyo, time: '1980-06-01', today: TODAY }).some((r) => r.id.startsWith('pdok')), 'a Dutch source never ranks in Tokyo');
  const ams = { lng: 4.9, lat: 52.37, zoom: 17, today: TODAY };
  assert.equal(reg.rankAt({ ...ams, time: '2019-06-01' })[0].id, 'pdok-year');
  assert.ok(reg.rankAt({ ...ams, time: '2019-06-01' }).every((r) => r.id !== 'gsi-photo'));
  assert.ok(reg.rankAt({ lng: -73.9, lat: 40.7, zoom: 12, today: TODAY, time: null }).some((r) => r.id === 'usgs-imagery'), 'USGS is offered in the United States');
  /* the plan for «match the clock» */
  assert.deepEqual(reg.planClockMatch({ providerId: 'esri', ...tokyo, iso: '1980-06-01', today: TODAY }), { providerId: 'gsi-1979', pick: { exact: true, epoch: true }, switched: true });
  assert.equal(reg.planClockMatch({ providerId: 'esri', ...tokyo, iso: '1850-01-01', today: TODAY }), null);
  assert.equal(reg.planClockMatch({ providerId: 'gibs-viirs', ...tokyo, iso: '2022-02-02', today: TODAY }).switched, false);
});

test('capture line: measured, chosen and declared never read alike', () => {
  const esri = reg.sourceById('esri'), gsi = reg.sourceById('gsi-photo'), p = reg.sourceById('pdok-year');
  assert.match(reg.captureLine(esri, { kind: 'measured', date: '20260116', resolutionM: 0.34, product: 'Vivid Advanced' }, 'en'), /Captured 2026-01-16 · Vivid Advanced · about 34 cm per pixel/);
  assert.match(reg.captureLine(gsi, { kind: 'declared', range: gsi.capture.range, resolutionM: 0.2 }, 'jp'), /撮影時期 2007年〜/);
  assert.match(reg.captureLine(p, { kind: 'chosen', date: '2022', resolutionM: 0.08 }, 'en'), /Year 2022/);
  assert.doesNotMatch(reg.captureLine(gsi, { kind: 'declared', range: gsi.capture.range }, 'en'), /Captured/, 'a declared range is not shown as a capture date');
});

test('⑤ tables.js builds SAT_PROVIDERS from the registry', () => {
  const t = readFileSync(new URL('js/tables.js', root), 'utf8');
  assert.match(t, /imageryProviders\(\)/);
  assert.doesNotMatch(t, /s2cloudless|tiles\.maps\.eox\.at|gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/(MODIS|VIIRS)/, 'no second list of the free suppliers');
  assert.doesNotMatch(SRC, /^\s*import .*tables/m);
});
