/* (hist-urban-population) data/hist-urban.json — Reba, Reitsma & Seto (2016), the geocoded city tables of
   Chandler and Modelski. What is held here is what the bundle CLAIMS: every figure is a cell of the source,
   nothing is interpolated, a figure stands only inside the window the record's own cadence gives it, the
   location-certainty rank survives, and identity is decided by point + name, never by a list of spellings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, columnYear, nearest, windows, SOURCE, TABLES, GOVERNANCE } from '../scripts/build-hist-urban.mjs';
import { stateAt, activeAt, historyOf, findCity, norm } from '../js/hist-urban.js';

const record = JSON.parse(readFileSync(new URL('../scripts/histurban/reba-record.json', import.meta.url), 'utf8'));
const data = JSON.parse(readFileSync(new URL('../data/hist-urban.json', import.meta.url), 'utf8'));
const byName = (n, country) => data.cities.filter(c => c.r.some(r => r.n === n && (!country || r.c === country)));

test('① the shipped bytes are re-derived from the licensed record (the gate check:histurban runs the same)', async () => {
  const { main } = await import('../scripts/build-hist-urban.mjs');
  await main(['--check']);   /* throws when the bundle and the record part company */
  assert.equal(JSON.stringify(record.source), JSON.stringify(SOURCE));
  assert.deepEqual(record.harvest.map(h => h.sha256), TABLES.map(t => t.sha256), 'the record names the pinned upstream bytes');
  assert.equal(GOVERNANCE['data/hist-urban.json'].licence, 'CC BY 4.0');
});

test('② every figure is a cell of the source, verbatim — none added, none dropped, none changed', () => {
  const cells = new Map();
  for (const t of record.tables) for (const [meta, cs] of t.rows) for (const [i, v] of cs)
    cells.set([t.key, meta[0].trim(), Number(meta[3]), Number(meta[4]), columnYear(t.header[i])].join('|'), Number(v.trim()));
  let n = 0;
  for (const c of data.cities) for (const [y, p, ri] of c.f) {
    const row = c.r[ri], key = [data.tables[row.t].key, row.n, row.lat, row.lon, y].join('|');
    assert.ok(cells.has(key), 'no source cell for ' + key);
    assert.equal(p, cells.get(key), key);
    n++;
  }
  assert.equal(n, cells.size, 'as many figures as non-empty cells');
  /* both books' figures for one city and year are kept side by side — Baghdad, AD 1000 */
  const bag = byName('Baghdad')[0];
  assert.deepEqual(bag.f.filter(f => f[0] === 1000).map(f => [f[1], data.tables[bag.r[f[2]].t].label]), [[125000, 'Chandler'], [1500000, 'Modelski']]);
});

test('③ BC columns are astronomical years (n BC = 1 − n), the clock’s axis', () => {
  assert.equal(columnYear('BC_500'), -499);
  assert.equal(columnYear('AD_1'), 1);
  const babylon = byName('Babylon').find(c => c.r.some(r => data.tables[r.t].key === 'modelskiAncient'));
  assert.ok(babylon.f.some(([y, p]) => y === -499 && p === 200000));
});

test('④ the window is the record’s own time to restatement around y — and nothing is interpolated', () => {
  /* recomputed by brute force, independently of the builder's loops */
  const gaps = [];
  for (const c of data.cities) { const ys = [...new Set(c.f.map(f => f[0]))].sort((a, b) => a - b); for (let i = 1; i < ys.length; i++) gaps.push([ys[i - 1], ys[i]]); }
  const med = xs => { xs.sort((a, b) => a - b); return xs[Math.floor((xs.length - 1) / 2)]; };
  for (const y of [-2999, -499, 1, 630, 1000, 1500, 1800, 1900, 1975, 2000]) {
    const S = med(gaps.filter(([a, b]) => a <= y && y <= b).map(([a, b]) => b - a));
    assert.equal(data.window[y], med(gaps.filter(([a]) => a <= y && a >= y - S).map(([a, b]) => b - a)), 'window at ' + y);
  }
  /* the case that refused the single-year rule: one traveller's AD 630 figures do not stand for centuries */
  const aksu = byName('Aksu')[0];
  assert.ok(stateAt(data, aksu, 630));
  assert.equal(stateAt(data, aksu, 1000), null);
  assert.deepEqual(windows(data.cities), data.window);
  for (const T of [-1999, -499, 1000, 1050, 1250, 1500, 1776, 1900, 1950, 2024]) {
    for (const { city, state } of activeAt(data, T)) {
      assert.ok(state.year <= T && T < state.year + data.window[state.year], city.n + ' at ' + T);
      const stated = city.f.filter(f => f[0] === state.year).map(f => f[1]);
      assert.deepEqual(state.figures.map(f => f.population), stated, 'only figures stated for ' + state.year);
      assert.ok(!city.f.some(f => f[0] > state.year && f[0] <= T), 'the most recent statement is used');
    }
  }
  /* a city the next table omits stops being shown: listed in AD 1000, not again before 1100 */
  const dropped = data.cities.find(c => c.f.some(f => f[0] === 1000) && !c.f.some(f => f[0] > 1000 && f[0] <= 1100));
  assert.ok(stateAt(data, dropped, 1000));
  assert.equal(stateAt(data, dropped, 1000 + data.window[1000]), null);
  /* the live clock: the record ends; nothing is carried into today */
  assert.equal(activeAt(data, data.span.to + 1).length, 0);
  assert.ok(activeAt(data, data.span.to).length > 0);
});

test('⑤ the geocoders’ certainty rank is kept per table row, as the source states it', () => {
  const q = new Map();
  for (const t of record.tables) for (const [meta] of t.rows) q.set(t.key + '|' + meta[0].trim() + '|' + Number(meta[3]), Number(meta[5]));
  for (const c of data.cities) for (const r of c.r) assert.equal(r.q, q.get(data.tables[r.t].key + '|' + r.n + '|' + r.lat), c.n);
  const vij = byName('Vijayanagar')[0];
  assert.equal(vij.r[0].q, 3);
  assert.equal(stateAt(data, vij, 1500).figures[0].certainty, 3);
});

test('⑥ identity is point + name: tables merge only when both agree; one table’s separate rows stay separate', () => {
  /* Modelski writes «Kanauji, Kanauj» in the City cell; Chandler «Kanauji» on the same point */
  assert.equal(data.cities.filter(c => c.r.some(r => norm(r.n).startsWith('kanauj'))).length, 1);
  /* Chandler lists two Gwaliors (one is Lashkar) — not merged */
  assert.equal(byName('Gwalior').length, 2);
  /* Springfield ×3 stay three cities */
  assert.equal(findCity(data, 'Springfield').length, 3);
  /* Modelski's Shangqi stands on exactly Chandler's Shanghai point: different names, so not merged,
     and each is told that the other shares its point */
  const shangqi = byName('Shangqi')[0], shanghai = byName('Shanghai')[0];
  assert.notEqual(shangqi.id, shanghai.id);
  assert.deepEqual(shangqi.same, [shanghai.id]);
  assert.deepEqual(shanghai.same, [shangqi.id]);
});

test('⑦ links to hist-places / hist-cities are mutual nearest neighbours that share a name', () => {
  const hp = JSON.parse(readFileSync(new URL('../data/hist-places.json', import.meta.url), 'utf8')).places;
  const pts = data.cities.map(c => ({ id: c.id, lat: c.lat, lon: c.lon }));
  const pl = hp.map(p => ({ id: p.id, lat: p.lat, lon: p.lon, p }));
  const brute = (set, p) => { let b = null, d = Infinity; for (const q of set) { const r = Math.PI / 180, h = Math.sin((q.lat - p.lat) * r / 2) ** 2 + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.sin((q.lon - p.lon) * r / 2) ** 2, k = 12742 * Math.asin(Math.min(1, Math.sqrt(h))); if (k < d) { d = k; b = q; } } return b; };
  /* the band index answers exactly what brute force answers */
  for (const c of pts.filter((_, i) => i % 37 === 0)) assert.equal(nearest(pl, c).id, brute(pl, c).id, c.id);
  const linked = data.cities.filter(c => c.pl);
  assert.ok(linked.length > 0);
  for (const c of linked) {
    const q = pl.find(x => x.id === c.pl);
    assert.equal(brute(pl, c).id, q.id, c.n + ' → nearest place');
    assert.equal(brute(pts, q).id, c.id, c.pl + ' → nearest city');
    const names = new Set([q.p.title, ...q.p.names.flatMap(n => [n.r, n.a])].filter(Boolean).flatMap(s => s.split(',')).map(norm));
    assert.ok(c.r.some(r => [...r.n.split(','), ...r.o].some(n => names.has(norm(n)))), c.n + ' shares a name with ' + c.pl);
  }
  assert.equal(byName('Babylon')[0].pl, 'pl-893951');
});

test('⑧ the record reaches the regions the Pleiades layer cannot: China, India, the Americas, Sub-Saharan Africa', () => {
  const at = (T, countries) => activeAt(data, T).filter(e => e.city.r.some(r => countries.includes(r.c)));
  assert.ok(at(1000, ['China']).length >= 10, 'China, AD 1000');
  assert.ok(at(1000, ['India']).length >= 5, 'India, AD 1000');
  assert.ok(at(1500, ['Mexico', 'Peru']).some(e => e.city.n === 'Mexico City'), 'Tenochtitlan, AD 1500');
  assert.ok(at(1400, ['Mali', 'Nigeria', 'Tanzania']).length >= 2, 'Sub-Saharan Africa, AD 1400');
  assert.ok(at(-1999, ['Iraq']).some(e => e.city.n === 'Ur'), 'Mesopotamia, 2000 BC');
});

test('⑨ the build refuses a record it cannot vouch for', () => {
  const clone = () => JSON.parse(JSON.stringify(record));
  const drift = clone(); drift.source.licence = 'CC BY-SA 4.0';
  assert.throws(() => compile(drift), /Source declaration drift/);
  const bad = clone(); bad.tables[0].rows[0][1][0][1] = '12,000';
  assert.throws(() => compile(bad), /Not a stated count/);
  const cert = clone(); cert.tables[0].rows[0][0][5] = '4';
  assert.throws(() => compile(cert), /Certainty/);
});

test('⑩ the population history of a city lists every dated figure with its book', () => {
  const mexico = byName('Mexico City')[0];
  const h = historyOf(data, mexico);
  assert.equal(h.length, mexico.f.length);
  assert.deepEqual(h[0], { year: 1500, population: 80000, table: 'chandler', label: 'Chandler', certainty: 1, window: data.window[1500] });
  assert.ok(h.every((x, i) => i === 0 || h[i - 1].year <= x.year));
});
