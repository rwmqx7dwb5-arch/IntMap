/* ============================================================================
 *  hist-urban-population — ATLAS ANSWERS FROM THE HISTORICAL URBAN-POPULATION RECORD
 * ----------------------------------------------------------------------------
 *  Runs time.cityPopulation (js/atlas-cap-time.js) against the REAL data/hist-urban.json, through the entry's own
 *  `run`, so what is checked is the answer Atlas receives (`exec.cityPopulation`):
 *    ① a year lists its cities, and where Chandler and Modelski state the same year BOTH figures come back
 *    ② a BC year is converted to the astronomical axis (500 BC = -499)
 *    ③ a homonym is not collapsed (Springfield = 3 cities, each with country and coordinates)
 *    ④ a year outside the span, and a city the record does not hold, are stated as facts (ok), not failures
 *    ⑤ the caveats and the source travel with every answer
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.document = { baseURI: pathToFileURL(ROOT + path.sep).href };
globalThis.fetch = async (u) => { const body = fs.readFileSync(fileURLToPath(u), 'utf8'); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => JSON.parse(body), text: async () => body }; };

const TIME = (await import('../js/atlas-cap-time.js')).default;
const entry = TIME.find((e) => e.row[0] === 'time.cityPopulation');
const K = { R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), L: (en) => en, warn: (s) => s, esc: (s) => String(s), note: (s) => s };
const ask = async (a) => { const r = await entry.run(a, {}, K); assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300)); return r.exec.cityPopulation; };

test('the entry exists with the dispatch spelling and its aliases', () => {
  assert.ok(entry);
  assert.equal(entry.row[1], 'cityPopulation');
  assert.match(entry.row[2], /largestCities/);
});

test('AD 1000: Baghdad carries BOTH books\' figures, neither chosen', async () => {
  const r = await ask({ year: 1000, limit: 400 });
  assert.equal(r.kind, 'year');
  assert.ok(r.count >= r.returned && r.returned > 0);
  const b = r.cities.find((c) => c.name === 'Baghdad');
  assert.ok(b, 'Baghdad is listed');
  assert.equal(b.country, 'Iraq');
  const by = Object.fromEntries(b.figures.map((f) => [f.book, f.population]));
  assert.equal(by.Chandler, 125000);
  assert.equal(by.Modelski, 1500000);
  assert.ok(b.figures.every((f) => f.statedYear === 1000));
});

test('500 BC is astronomical -499 and lists Babylon (Modelski, 200000)', async () => {
  const r = await ask({ year: 500, era: 'BC', limit: 400 });
  assert.equal(r.year.year, -499);
  const b = r.cities.find((c) => c.name === 'Babylon');
  assert.ok(b, 'Babylon is listed');
  assert.ok(b.figures.some((f) => f.book === 'Modelski' && f.population === 200000));
});

test('the default limit is 10 and the count is the record\'s own', async () => {
  const r = await ask({ year: 1500 });
  assert.equal(r.cities.length, 10);
  assert.ok(r.count > 10);
});

test('Springfield: three distinct cities, each with country and coordinates', async () => {
  const r = await ask({ city: 'Springfield' });
  assert.equal(r.found, 3);
  assert.equal(new Set(r.cities.map((c) => c.lon + ',' + c.lat)).size, 3);
  assert.ok(r.cities.every((c) => c.country && Number.isFinite(c.lat) && c.history.length));
});

test('a city at a year it is not listed in states that, with the nearest stated years', async () => {
  const r = await ask({ city: 'Baghdad', year: 1500 });
  const c = r.cities[0];
  assert.equal(c.atYear.listed, false);
  assert.ok(c.atYear.statement);
  assert.equal(c.atYear.nearestEarlierStatedYear, 1401);
  assert.equal(c.atYear.nearestLaterStatedYear, 1638);
});

test('outside the span and unknown cities are facts, not failures', async () => {
  const r = await ask({ year: 3000 });
  assert.equal(r.inSpan, false); assert.equal(r.count, 0); assert.deepEqual(r.cities, []);
  const c = await ask({ city: 'Zzzzzz Nowhere' });
  assert.equal(c.found, 0);
});

test('caveats and source travel with the answer; no year and no city describes the record', async () => {
  const r = await ask({});
  assert.equal(r.kind, 'record');
  for (const k of ['notListedIsNotAbsent', 'nothingInterpolated', 'bothBooks', 'certainty', 'thresholds']) assert.ok(r.caveats[k], k);
  assert.equal(r.caveats.thresholds.length, 3);
  assert.equal(r.source.licence, 'CC BY 4.0');
  assert.match(r.source.url, /^https:\/\/doi\.org\//);
});
