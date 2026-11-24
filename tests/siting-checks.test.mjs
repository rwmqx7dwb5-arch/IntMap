/* data/siting-jp.json and js/siting.js — the bundle is internally consistent, ties to the company footprint, and the engine ranks the way it says. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare, resolveAreas, rankMetric, sectorMatches, dimensionsOf } from '../js/siting.js';
import { prefecturesOf } from '../scripts/build-siting-jp.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../data/siting-jp.json', import.meta.url), 'utf8'));
const fp = JSON.parse(fs.readFileSync(new URL('../data/companies/footprint.json', import.meta.url), 'utf8'));
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

test('every prefecture is present once and every metric names a source and a vintage', () => {
  assert.equal(data.areas.length, 47);
  assert.equal(new Set(data.areas.map((a) => a.id)).size, 47);
  for (const [id, m] of Object.entries(data.metrics)) {
    assert.ok(data.sources[m.source], id + ' names an unknown source');
    assert.ok(m.vintage && m.unit && ['lower', 'higher'].includes(m.better) && m.label.en && m.label.jp, id + ' is under-described');
  }
  for (const a of data.areas) for (const k of Object.keys(a.m)) assert.ok(data.metrics[k], a.id + ' carries undeclared metric ' + k);
});

test('industrial land figures are re-derived from the parcels shipped beside them', () => {
  const by = {};
  for (const r of data.sites.rows) (by['JP-' + r[0]] = by['JP-' + r[0]] || []).push(r[4]);
  for (const a of data.areas) {
    const p = by[a.id] || [];
    assert.equal(a.m.land_ind_n, p.length, a.id);
    assert.equal(a.m.land_ind_median, p.length ? Math.round(median(p)) : null, a.id);
    if (p.length) { assert.equal(a.m.land_ind_min, Math.min(...p)); assert.equal(a.m.land_ind_max, Math.max(...p)); }
  }
});

test('electricity: prefectures of one price area share one price; Okinawa has none rather than an invented one', () => {
  const seen = {};
  for (const a of data.areas) {
    if (!a.powerArea) { assert.equal(a.m.power_spot_avg, null, a.id); continue; }
    (seen[a.powerArea] = seen[a.powerArea] || new Set()).add(a.m.power_spot_avg);
    assert.ok(a.m.power_spot_avg > 0 && a.m.power_spot_avg < 100, a.id);
  }
  for (const [area, s] of Object.entries(seen)) assert.equal(s.size, 1, area);
  assert.equal(data.areas.find((a) => a.id === 'JP-47').m.power_spot_avg, null);
});

test('company anchors are exactly the footprint\'s Japanese sites, placed by polygon', () => {
  const rows = fp.f.filter((r) => r[4] === 'JPN');
  const pref = prefecturesOf(rows.map((r) => [r[2], r[3]]));
  const expect = rows.filter((_, i) => pref[i].iso).length;
  assert.equal(data.anchors.length, expect);
  assert.equal(data.coverage.anchorsJapan, rows.length);
  assert.ok(expect / rows.length > 0.99, 'almost every Japanese site falls inside a prefecture');
});

test('gaps are declared, never silently filled: water has no metric and a stated reason', () => {
  assert.ok(!dimensionsOf(data).water);
  assert.ok(data.gaps.some((g) => g.dimension === 'water' && g.reason.length > 40));
});

test('rank 1 is the better end; ties share a rank; names resolve in three spellings', () => {
  const r = rankMetric(data, 'power_spot_avg');
  const cheapest = Math.min(...data.areas.filter((a) => a.m.power_spot_avg != null).map((a) => a.m.power_spot_avg));
  for (const a of data.areas) if (a.m.power_spot_avg === cheapest) assert.equal(r.rank[a.id], 1);
  const w = rankMetric(data, 'labor_working_age');
  assert.equal(w.rank['JP-13'], 1, 'Tokyo has the most working-age people');
  for (const n of ['Kumamoto', '熊本', '熊本県', 'JP-43']) assert.equal(resolveAreas(data, [n]).areas[0].id, 'JP-43', n);
  assert.equal(resolveAreas(data, ['Kochi']).areas[0].id, 'JP-39');
  assert.deepEqual(resolveAreas(data, ['Atlantis']).missing, ['Atlantis']);
});

test('compare: named areas, sector filter, rankBy and failure codes', () => {
  const c = compare(data, { areas: ['Kumamoto', 'Miyagi'], dimensions: ['power', 'land'] });
  assert.equal(c.rows.length, 2);
  assert.ok(c.metricIds.every((id) => ['power', 'land'].includes(data.metrics[id].dimension)));
  assert.ok(c.gaps.length > 0, 'an answer always carries what was not measured');
  const s = compare(data, { sector: 'semiconductor', top: 5 });
  assert.ok(s.rows.length > 0 && s.rows.every((x) => x.anchors.length > 0 && x.anchors.every((a) => sectorMatches(a.sector, 'semi'))));
  const k = compare(data, { rankBy: 'land_ind_median', top: 3 });
  assert.deepEqual(k.rows.map((x) => x.values.land_ind_median.rank), [1, 2, 3]);
  assert.equal(compare(data, { areas: ['Atlantis'] }).code, 'NO_AREA');
  assert.equal(compare(data, { rankBy: 'nonsense' }).code, 'BAD_METRIC');
  assert.equal(compare(null).code, 'NO_DATA');
  assert.ok(compare(data, { sector: 'bakery' }).noSectorMatch);
});

test('the statute excerpts the rules quote still contain the figures they report', () => {
  const o = data.rules.find((r) => r.id === 'notify-size'), w = data.rules.find((r) => r.id === 'wait-90');
  assert.match(o.text, /九千平方メートル/); assert.match(o.text, /三千平方メートル/); assert.match(w.text, /九十日/);
});
