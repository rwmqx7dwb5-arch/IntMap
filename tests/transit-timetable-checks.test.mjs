/* ============================================================================
 *  The publishers' own timetables: registry licence rule, the compiled bundle, and the planner's answers.
 *  (js/transit-feeds.js · scripts/build-transit-timetables.mjs · js/transit-raptor.js · js/transit-planner.js)
 *
 *  ⚠ The engine is tested on a HAND-MADE network whose right answers are known, not only on the
 *  committed Luxembourg bundle: a plan that merely «returns something» over real data proves nothing.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FEEDS, TRANSITOUS_FALLBACK, TRANSITOUS_TERMS, licenceAllowsCommercial, feedsNear, attributionFor, COMMERCIAL_OK } from '../js/transit-feeds.js';
import { loadNetwork, plan, reach, coverage, planBasis, circleRing, bandCircles } from '../js/transit-raptor.js';
import { zonedMs, motisMode } from '../js/transit-planner.js';

/* rows: [mask, arr0, dep0-arr0, arr1-dep0, dep1-arr1, …] in minutes — the bundle's encoding */
const row = (mask, times) => { const out = [mask.toString(16), times[0]]; for (let i = 1; i < times.length; i++) out.push(times[i] - times[i - 1]); return out; };
const stop = (name, lng, lat) => [name, Math.round(lat * 1e5), Math.round(lng * 1e5), -1];
const H = 60;
/* A —line1→ B …short walk… C —line2→ D, and a direct line3 A→D that runs on window day 1 only */
function tiny() {
  const stops = [stop('A', 10.00, 50), stop('B', 10.10, 50), stop('C', 10.1015, 50), stop('D', 10.30, 50), stop('E', 10.00, 50.2)];
  return {
    v: 1, id: 'tiny', window: { start: '2026-11-23', days: 3 }, realtime: null, tz: 'UTC', agencies: ['x'], routes: [['1', '', 2, 0, ''], ['2', '', 3, 0, ''], ['3', '', 3, 0, '']], stops,
    patterns: [
      { r: 0, s: [0, 1], t: [row(7, [8 * H, 8 * H, 8 * H + 10, 8 * H + 10]), row(7, [9 * H, 9 * H, 9 * H + 10, 9 * H + 10])] },
      { r: 1, s: [2, 3], t: [row(7, [8 * H + 25, 8 * H + 25, 8 * H + 45, 8 * H + 45]), row(7, [9 * H + 25, 9 * H + 25, 9 * H + 45, 9 * H + 45])] },
      { r: 2, s: [0, 3], t: [row(2, [8 * H, 8 * H, 9 * H, 9 * H])] },
    ],
  };
}
const A = { lng: 10.00, lat: 50 }, D = { lng: 10.30, lat: 50 };

test('transit-feeds: every shipped feed licence permits commercial use, and says where it was read', () => {
  assert.ok(FEEDS.length >= 1);
  for (const f of FEEDS) {
    assert.ok(licenceAllowsCommercial(f.licence.spdx), f.id + ' ' + f.licence.spdx);
    assert.ok(f.verified && f.verified.page && /^\d{4}-\d\d-\d\d$/.test(f.verified.on), f.id + ': licence page read, with the day');
    assert.ok(f.credit.publisher && f.credit.licence && f.credit.via, f.id + ': a credit (publisher, licence, via)');
    assert.ok(Array.isArray(f.bbox) && f.bbox.length === 4 && f.tz, f.id);
    assert.equal('realtime' in f, true, f.id + ' states realtime (null is a statement)');
  }
  for (const nc of ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'CC-BY-NC-ND-4.0', '', undefined]) assert.equal(licenceAllowsCommercial(nc), false);
  assert.ok(COMMERCIAL_OK.every((x) => !/NC/.test(x)));
});

test('Transitous stays off: its own policy forbids commercial use', () => {
  assert.equal(TRANSITOUS_FALLBACK, false);
  assert.equal(TRANSITOUS_TERMS.commercialUse, false);
  assert.match(TRANSITOUS_TERMS.clause, /commercial use is not allowed/);
});

test('every built bundle states its provenance and agrees with the registry', () => {
  const boxes = Object.fromEntries(FEEDS.map((f) => [f.id, f.bbox]));
  for (const f of FEEDS) {
    const b = JSON.parse(fs.readFileSync('data/transit-' + f.id + '.json', 'utf8'));
    assert.equal(b.licenceSpdx, f.licence.spdx);
    assert.deepEqual(b.bbox, f.bbox, f.id + ' registry bbox is the bundle bbox');
    assert.equal(b.tz, f.tz);
    assert.equal(b.realtime, f.realtime);
    assert.ok(b.upstreams && b.upstreams[0].licence && b.upstreams[0].paidBy);
    assert.equal(b.timeResolution, 'minute');
    /* not a size floor: Monaco's whole network is 97 stops. A bundle is non-empty and holds what its own build counted */
    assert.ok(b.patterns.length > 0 && b.stops.length > 0, f.id);
    assert.equal(b.patterns.length, b.stats.patterns, f.id);
    assert.equal(b.patterns.reduce((n, p) => n + p.t.length, 0), b.stats.timetableRows, f.id);
  }
  assert.deepEqual(feedsNear(6.13, 49.6, boxes), ['lu']);
  assert.deepEqual(feedsNear(139.7, 35.7, boxes), []);
  assert.deepEqual(attributionFor(['lu']).map((x) => x.id), ['lu']);
});

test('engine: earliest arrival with a transfer on foot, and a missed connection waits for the next vehicle', () => {
  const net = loadNetwork(tiny());
  const r = plan(net, { from: A, to: D, date: '2026-11-23', depart: 7 * 3600 + 50 * 60 });
  assert.equal(r.ok, true);
  const best = r.journeys[r.journeys.length - 1];
  assert.equal(best.transfers, 1);
  const rides = best.legs.filter((l) => l.type === 'ride');
  assert.deepEqual(rides.map((l) => l.route), [0, 1]);
  assert.equal(rides[1].arrive, 8 * 3600 + 45 * 60, 'line 2 reaches D at 8:45');
  assert.ok(best.legs.some((l) => l.type === 'transfer' && l.estimated === true), 'the walk between stops is labelled an estimate');
  /* leaving at 8:01 misses the 8:00 train: the 9:00 one is taken */
  const late = plan(net, { from: A, to: D, date: '2026-11-23', depart: 8 * 3600 + 60 });
  const lb = late.journeys[late.journeys.length - 1];
  assert.equal(lb.legs.filter((l) => l.type === 'ride')[0].depart, 9 * 3600);
});

test('engine: a trip that runs on one day of the window is used on that day and not on the others', () => {
  const net = loadNetwork(tiny());
  const day1 = plan(net, { from: A, to: D, date: '2026-11-24', depart: 7 * 3600 + 30 * 60 });
  assert.ok(day1.journeys.some((j) => j.legs.some((l) => l.route === 2)), 'the direct line-3 trip runs on window day 1');
  const day0 = plan(net, { from: A, to: D, date: '2026-11-23', depart: 7 * 3600 + 30 * 60 });
  assert.ok(!day0.journeys.some((j) => j.legs.some((l) => l.route === 2)), 'and not on day 0');
});

test('engine: a date outside the window is refused, never answered from a nearby day', () => {
  const net = loadNetwork(tiny());
  for (const d of ['2026-11-22', '2026-11-26', '2027-11-23']) {
    const r = plan(net, { from: A, to: D, date: d, depart: 8 * 3600 });
    assert.equal(r.ok, false); assert.equal(r.reason, 'date-outside-window'); assert.deepEqual(r.window, { start: '2026-11-23', end: '2026-11-25' });
  }
  assert.equal(coverage(net, '2026-11-25').covered, true);
  assert.equal(reach(net, { origin: A, date: '2026-11-26', depart: 0, budgetMin: 30 }).reason, 'date-outside-window');
});

test('engine: a night trip that runs past midnight is found by a late departure', () => {
  const b = tiny();
  b.patterns.push({ r: 0, s: [0, 1], t: [row(1, [23 * H + 50, 23 * H + 50, 24 * H + 20, 24 * H + 20])] });   /* day 0 only: A 23:50 → B 24:20 */
  const net = loadNetwork(b);
  const late = plan(net, { from: A, to: { lng: 10.10, lat: 50 }, date: '2026-11-23', depart: 23 * 3600 + 40 * 60 });
  assert.equal(late.ok, true);
  const arr = late.journeys[late.journeys.length - 1].legs.filter((l) => l.type === 'ride').pop().arrive;
  assert.equal(arr, 24 * 3600 + 20 * 60);
});

test('the result says scheduled, never live, and carries no real-time claim', () => {
  const net = loadNetwork(tiny());
  const r = plan(net, { from: A, to: D, date: '2026-11-23', depart: 7 * 3600 });
  assert.equal(r.basis, 'scheduled'); assert.equal(r.realtime, false);
  assert.deepEqual(planBasis(net), { basis: 'scheduled', realtime: false, realtimeSource: null });
  const rt = tiny(); rt.realtime = { url: 'https://example.invalid/rt' };
  assert.equal(planBasis(loadNetwork(rt)).basis, 'scheduled+realtime');
});

test('reach: monotone in the budget, and the walking radius shrinks as the budget is used up', () => {
  const net = loadNetwork(tiny());
  const r30 = reach(net, { origin: A, date: '2026-11-23', depart: 8 * 3600, budgetMin: 30 });
  const r60 = reach(net, { origin: A, date: '2026-11-23', depart: 8 * 3600, budgetMin: 60 });
  const ids = (r) => new Set(r.stops.map((s) => s.stop));
  for (const s of ids(r30)) assert.ok(ids(r60).has(s), 'a stop reachable in 30 min is reachable in 60');
  assert.ok(!ids(r30).has(3) && ids(r60).has(3), 'D is 45 min away');
  const b = r60.stops.find((s) => s.stop === 1); assert.ok(b.min > 9 && b.min < 11, 'B at about 10 min'); assert.ok(b.radiusM > 0);
  assert.equal(r60.basis, 'scheduled');
  const ring = circleRing(10, 50, 1000, 12); assert.equal(ring.length, 13); assert.deepEqual(ring[0], ring[12]);
  r60.mode = 'walk'; assert.ok(bandCircles(r60, 60).length >= 1);
});

test('walking vs cycling access: a bicycle reaches a stop a walker cannot', () => {
  const net = loadNetwork(tiny());
  const far = { lng: 10.0, lat: 49.98 };            /* about 2.2 km from A: beyond the 1.2 km walking access, within the 4 km cycling access */
  assert.equal(plan(net, { from: far, to: D, date: '2026-11-23', depart: 7 * 3600, mode: 'walk' }).ok, false);
  assert.equal(plan(net, { from: far, to: D, date: '2026-11-23', depart: 7 * 3600, mode: 'bike' }).ok, true);
});

test('local wall clock in the feed zone to an instant, across a daylight-saving change', () => {
  assert.equal(new Date(zonedMs('2026-01-15', 8 * 3600, 'Europe/Berlin')).toISOString(), '2026-01-15T07:00:00.000Z');
  assert.equal(new Date(zonedMs('2026-07-15', 8 * 3600, 'Europe/Berlin')).toISOString(), '2026-07-15T06:00:00.000Z');
  assert.equal(new Date(zonedMs('2026-11-23', 25 * 3600, 'Asia/Tokyo')).toISOString(), '2026-11-23T16:00:00.000Z', 'a 25:00 service time is 01:00 the next day');
});

test('GTFS route types map to the mode names the route cards colour by', () => {
  assert.equal(motisMode(2), 'RAIL'); assert.equal(motisMode(1), 'SUBWAY'); assert.equal(motisMode(3), 'BUS'); assert.equal(motisMode(0), 'TRAM');
  assert.equal(motisMode(101), 'HIGHSPEED_RAIL'); assert.equal(motisMode(401), 'SUBWAY'); assert.equal(motisMode(714), 'BUS'); assert.equal(motisMode(1000), 'FERRY');
});

test('Luxembourg: a real plan and a real, cross-border reach over the committed bundle', () => {
  const b = JSON.parse(fs.readFileSync('data/transit-lu.json', 'utf8'));
  const net = loadNetwork(b);
  const date = b.window.start;                       /* the window is part of the bundle, not of the clock */
  const gare = { lng: 6.1342, lat: 49.6004 }, esch = { lng: 5.9814, lat: 49.5006 };
  const p = plan(net, { from: gare, to: esch, date, depart: 8 * 3600 });
  assert.equal(p.ok, true);
  const j = p.journeys[p.journeys.length - 1];
  assert.ok(j.durationS > 15 * 60 && j.durationS < 90 * 60, 'Luxembourg to Esch-sur-Alzette takes 15 to 90 minutes, got ' + Math.round(j.durationS / 60));
  assert.ok(j.legs.some((l) => l.type === 'ride'));
  const r = reach(net, { origin: gare, date, depart: 8 * 3600, budgetMin: 60 });
  assert.ok(r.stops.length > 300);
  /* the feed carries lines into France, Belgium and Germany: a stop reached within the hour lies outside the Grand Duchy's box */
  assert.ok(r.stops.some((s) => s.lat < 49.45 || s.lng < 5.74 || s.lng > 6.53 || s.lat > 50.19), 'the reach runs over a border');
});
