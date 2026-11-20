/* ============================================================================
 *  temporal-claims — two layers at one instant: does the PAIR say one thing about one instant?
 * ----------------------------------------------------------------------------
 *  js/layer-time.js `align`. A year match is not enough: a series on today's borders and a polity as of 1914 share a
 *  country code and not a territory; a series past its last year shows another date; a yearly series beside a daily one
 *  speaks only to the year. ⚠ Expected values are derived from the dates written in THIS file, not from the rule's helpers.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align, validate, explainAlign, ALIGN_STATUSES } from '../js/layer-time.js';
import { TIME } from '../js/layer-time-decl.js';

const at = (iso) => ({ when: Date.parse(iso), live: false, now: Date.parse('2026-11-20T00:00:00Z') });
const NOW = { when: Date.parse('2026-11-20T00:00:00Z'), live: true, now: Date.parse('2026-11-20T00:00:00Z') };

test('a series on today’s borders against a border as of 1914 is a basis mismatch, whatever the year says', () => {
  const r = align(TIME['dl-pop'], TIME['cb-countries'], at('1914-07-01T00:00:00Z'));
  assert.equal(r.status, 'basis-mismatch');
  assert.ok(r.reasons.includes('basis-fixed-year'));
});
test('a pair that is not simultaneous is skewed and says by how much', () => {
  /* Maddison ends 2018: asked for 2020, it shows 2018 (carried); the WB series is stated in 2020 */
  const r = align(TIME['dl-pop'], { kind: 'series', from: 1990, to: 2025, grain: 'P1Y', follows: 'x', by: 'x', says: ['a', 'b'] }, at('2020-06-15T00:00:00Z'));
  assert.equal(r.status, 'skewed');
  assert.ok(r.reasons.includes('a-carried'));
  assert.ok(r.a.shownAt < Date.parse('2019-01-01T00:00:00Z'));
});
test('a side that states nothing for the date makes the pair not comparable', () => {
  const r = align(TIME['dl-pop'], TIME['dl-sanctions'], at('1914-07-01T00:00:00Z'));
  assert.equal(r.status, 'unjoinable');
  assert.ok(r.reasons.includes('b-unstated'));
});
test('a yearly series beside a border that states no resolution: coarsened to the year, not aligned', () => {
  const border = { kind: 'record', self: 'x', geoBasis: { borders: 'present' }, by: 'x', says: ['a', 'b'] };
  const r = align(TIME['bx-wbpopgrow'], border, at('2000-06-15T00:00:00Z'), { to: 2023 });
  assert.equal(r.status, 'coarsened');
  assert.deepEqual(r.reasons, ['grain-unstated']);
  assert.equal(r.grainMs, 365.2425 * 86400000);   /* P1Y, the only grain either side states */
});
test('an instant beside a daily edition speaks to the day; a yearly series beside an edition that never said how its units were drawn is unverified', () => {
  const day = { kind: 'snapshot', asOf: 'fetch', period: 'P1D', by: 'x', says: ['a', 'b'] };
  const r = align(day, { kind: 'live', says: ['a', 'b'] }, NOW);
  assert.equal(r.status, 'coarsened');
  assert.equal(r.grainMs, 86400000);
  const yr = align(TIME['bx-wbpopgrow'], day, NOW, { to: 2026 });
  assert.equal(yr.status, 'basis-unverified');
});
test('silence about basis is not agreement', () => {
  const silent = { kind: 'record', self: 'x', says: ['a', 'b'] };
  const r = align(TIME['cb-borders'], silent, at('1900-01-01T00:00:00Z'));
  assert.equal(r.status, 'basis-unverified');
  assert.ok(r.reasons.includes('basis-silent'));
});
test('two as-of-date sides align', () => {
  const r = align(TIME['cb-borders'], TIME['cb-countries'], at('1900-01-01T00:00:00Z'));
  assert.equal(r.status, 'aligned');
});
test('both sides today’s borders on the live clock align', () => {
  const r = align(TIME['bx-wbpopgrow'], TIME['bx-wbaging'], NOW);
  assert.ok(r.status !== 'basis-mismatch');
});
test('every status the rule returns is in the closed vocabulary; every message is en + jp', () => {
  const ids = Object.keys(TIME);
  for (const a of ids.slice(0, 60)) for (const b of ids.slice(60, 80)) {
    const r = align(TIME[a], TIME[b], at('1914-07-01T00:00:00Z'));
    assert.ok(ALIGN_STATUSES.includes(r.status), a + '/' + b + ' → ' + r.status);
    const m = explainAlign(r, 'A', 'B', at('1914-07-01T00:00:00Z'));
    assert.ok(m.en && m.jp);
  }
});
test('validate refuses a grain or geoBasis nobody authored', () => {
  const base = { kind: 'live', says: ['a', 'b'] };
  assert.ok(validate('x', { ...base, grain: 'often' }).some((s) => /grain/.test(s)));
  assert.ok(validate('x', { ...base, geoBasis: { borders: 'fixed' } }).some((s) => /geoBasis/.test(s)));
  assert.ok(validate('x', { ...base, geoBasis: { borders: 'present' } }).some((s) => /author/.test(s)));
  assert.deepEqual(validate('x', { ...base, geoBasis: { borders: 'present' }, by: 'x' }), []);
});
test('every declared geoBasis and grain in the table passes the rule', () => {
  for (const [id, d] of Object.entries(TIME)) if (d.geoBasis || d.grain) assert.deepEqual(validate(id, d), [], id);
});
