/* ============================================================================
 *  More publishers' timetables (js/transit-feeds.js FEED_ROWS · scripts/build-transit-timetables.mjs):
 *  every shipped feed is commercial-use, verified at its publisher, re-read at build time, served by
 *  exactly one bundle per point, and the compiled bundle states the stops it actually carries.
 *
 *  ⚠ The build itself fetches, so it is not run here. What is run is the compiler on a hand-made GTFS
 *  archive whose right answer is known (one trip_id per date, the shape most French feeds publish),
 *  twice, to show the output is a function of the input — and that folding those per-date trips into
 *  one row drops no day and no time.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { FEEDS, FEED_ROWS, licenceAllowsCommercial, feedsNear } from '../js/transit-feeds.js';
import { compileGtfs, pickArchive, GOVERNANCE } from '../scripts/build-transit-timetables.mjs';
import { loadNetwork, plan, reach } from '../js/transit-raptor.js';

const bundle = (id) => JSON.parse(fs.readFileSync('data/transit-' + id + '.json', 'utf8'));
const KINDS = ['udata', 'gtfs-data.jp', 'page'];

test('every feed: a commercial-use licence, read at the publisher on a stated day, with a resolver that re-reads it', () => {
  assert.equal(FEEDS.length, FEED_ROWS.length);
  assert.equal(new Set(FEEDS.map((f) => f.id)).size, FEEDS.length, 'ids are unique (each names one data/transit-<id>.json)');
  for (const f of FEEDS) {
    assert.ok(licenceAllowsCommercial(f.licence.spdx), f.id + ': ' + f.licence.spdx);
    assert.ok(/^https:\/\//.test(f.verified.page) && /^\d{4}-\d\d-\d\d$/.test(f.verified.on), f.id + ': the page read and the day');
    assert.ok(KINDS.includes(f.resolve.kind), f.id + ': resolve.kind ' + f.resolve.kind);
    assert.ok(f.resolve.kind === 'page' ? f.resolve.states && f.resolve.url : f.resolve.api && f.resolve.licence, f.id + ': what the build re-reads');
    assert.ok(f.published && f.credit.publisher && f.credit.licence && f.credit.via, f.id);
    assert.ok(/^[A-Z]{2}$/.test(f.country) && Array.isArray(f.crossBorder) && !f.crossBorder.includes(f.country), f.id);
    assert.equal(f.realtime, null, f.id + ': no live source is read, so none is claimed');
    /* the governance record is derived from the row, not written beside it */
    const g = GOVERNANCE['data/transit-' + f.id + '.json'];
    assert.ok(g, f.id + ': a GOVERNANCE record');
    assert.equal(g.upstreams[0].licence, f.licence.spdx);
    assert.equal(g.paidBy, 'Timetables — ' + f.credit.publisher + ', ' + f.credit.licence + ', ' + f.credit.via);
  }
  assert.deepEqual(Object.keys(GOVERNANCE).sort(), FEEDS.map((f) => 'data/transit-' + f.id + '.json').sort(), 'no record without a feed');
});

test('every bundle: its bbox is the box of the stops it carries, and the registry states the same box', () => {
  for (const f of FEEDS) {
    const b = bundle(f.id);
    let w = 180, s = 90, e = -180, n = -90;
    for (const x of b.stops) { const lat = x[1] / 1e5, lon = x[2] / 1e5; if (lat === 0 && lon === 0) continue; w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
    assert.deepEqual([w, s, e, n].map((v) => Math.round(v * 1e4) / 1e4), b.bbox, f.id + ': bundle bbox = its stops');
    assert.deepEqual(f.bbox, b.bbox, f.id + ': registry bbox = bundle bbox');
    assert.equal(b.licenceSpdx, f.licence.spdx); assert.equal(b.country, f.country); assert.equal(b.tz, f.tz);
    assert.equal(b.offeredUnder, f.licence.spdx === 'ODbL-1.0' ? 'ODbL-1.0' : undefined, f.id + ': share-alike is stated where the licence asks it');
    assert.equal(b.patterns.length, b.stats.patterns, f.id + ': the build counted what it wrote');
    const ns = b.stops.length;
    assert.ok(ns > 0 && b.patterns.every((p) => p.s.every((i) => i >= 0 && i < ns)), f.id + ': every pattern stop exists');
    assert.ok(b.window.days >= 1 && b.window.days <= 14, f.id);
  }
});

test('a stop of any bundle is handed to that bundle first (the planner plans over the first match), and no two boxes overlap', () => {
  const boxes = Object.fromEntries(FEEDS.map((f) => [f.id, f.bbox]));
  for (const f of FEEDS) {
    for (const x of bundle(f.id).stops) {
      const near = feedsNear(x[2] / 1e5, x[1] / 1e5, boxes);
      assert.equal(near[0], f.id, f.id + ': ' + x[0] + ' is handed to ' + near.join(','));
    }
  }
  /* two boxes that overlap would make «nearest» a tie, decided by registry order — a feed added later would lose its own stops */
  const over = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  FEEDS.forEach((a, i) => FEEDS.slice(i + 1).forEach((b) => assert.ok(!over(a.bbox, b.bbox), a.id + ' and ' + b.id + ' overlap')));
  /* the order is by distance, not by the registry: Monaco's own stop before the Nice feed listed above it */
  const mc = bundle('mc').stops[0];
  assert.equal(feedsNear(mc[2] / 1e5, mc[1] / 1e5, boxes, 10)[0], 'mc');
});

test('pickArchive: the archive the publisher names now, and a refusal when the stated licence changed or vanished', () => {
  const byKind = (k) => FEEDS.find((f) => f.resolve.kind === k);
  const ud = FEEDS.find((f) => f.resolve.kind === 'udata' && f.resolve.resource);
  const res = [{ id: 'other', url: 'https://x.invalid/other.zip', format: 'zip' }, { id: ud.resolve.resource, url: 'https://x.invalid/gtfs.zip', format: 'gtfs' }];
  assert.equal(pickArchive(ud, { license: ud.resolve.licence, resources: res }), 'https://x.invalid/gtfs.zip');
  assert.throws(() => pickArchive(ud, { license: 'notspecified', resources: res }), /now states licence/);
  assert.throws(() => pickArchive(ud, { resources: res }), /now states licence/);
  assert.throws(() => pickArchive(ud, { license: ud.resolve.licence, resources: res.slice(0, 1) }), /no longer lists resource/);
  const lu = FEEDS.find((f) => f.resolve.kind === 'udata' && !f.resolve.resource);
  assert.equal(pickArchive(lu, { license: lu.resolve.licence, resources: [{ url: 'https://x.invalid/a.zip', format: 'zip', last_modified: '2026-11-01' }, { url: 'https://x.invalid/b.zip', format: 'zip', last_modified: '2026-11-20' }] }), 'https://x.invalid/b.zip', 'the newest archive');
  const jp = byKind('gtfs-data.jp');
  const body = { feed_license: jp.resolve.licence, is_discontinued: false, gtfs_files: [{ rid: 'next', gtfs_url: 'https://x.invalid/next.zip' }, { rid: 'current', gtfs_url: 'https://x.invalid/cur.zip' }] };
  assert.equal(pickArchive(jp, { body }), 'https://x.invalid/cur.zip');
  assert.throws(() => pickArchive(jp, { body: { ...body, feed_license: 'CC BY-NC 4.0' } }), /now states licence/);
  assert.throws(() => pickArchive(jp, { body: { ...body, is_discontinued: true } }), /discontinued/);
  const pg = byKind('page');
  assert.equal(pickArchive(pg, '<dt>Category</dt><dd>' + pg.resolve.states + '</dd>'), pg.resolve.url);
  assert.equal(pickArchive(pg, '<p>' + pg.resolve.states.split(' ').join('</p> <p>') + '</p>'), pg.resolve.url, 'markup between the words does not hide them');
  assert.throws(() => pickArchive(pg, '<p>License: proprietary</p>'), /no longer states/);
  assert.throws(() => pickArchive({ id: 'x', resolve: { kind: 'ftp' } }, {}), /not one the builder knows/);
});

/* ── a GTFS archive written here (stored entries — what scripts/lib/zip-lines.mjs reads) ───────────── */
function storedZip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8'), nm = Buffer.from(name, 'utf8'), crc = zlib.crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
/* A ──bus──> B. Three trip_ids (d0, d1, d2) run the SAME 08:00 departure on three different dates — a
   publisher that numbers trips per date; one more (late) runs 09:30 on the first two dates. */
function perDateFeed() {
  const st = (trip, dep, arr) => [trip + ',' + dep + ',' + dep + ',A,1', trip + ',' + arr + ',' + arr + ',B,2'];
  return {
    'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nx,X bus,https://x.invalid,Europe/Paris\n',
    'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nr,x,1,,3\n',
    'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Alpha,48.0,7.0\nB,Beta,48.0,7.1\n',
    'calendar_dates.txt': 'service_id,date,exception_type\ns0,20261123,1\ns1,20261124,1\ns2,20261125,1\nsL,20261123,1\nsL,20261124,1\n',
    'trips.txt': 'route_id,service_id,trip_id,trip_headsign\nr,s0,d0,Beta\nr,s1,d1,Beta\nr,s2,d2,Beta\nr,sL,late,Beta\n',
    'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' + [...st('d0', '08:00:00', '08:20:00'), ...st('d1', '08:00:00', '08:20:00'), ...st('d2', '08:00:00', '08:20:00'), ...st('late', '09:30:00', '09:50:00')].join('\n') + '\n',
  };
}

test('compile: per-date trips with the same times become one row whose mask is the union — reproducible, and no day or time is lost', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-transit-feeds-more-'));
  try {
    const zip = path.join(dir, 'gtfs.zip'); fs.writeFileSync(zip, storedZip(perDateFeed()));
    const a = await compileGtfs(zip, '2026-11-23');
    const b = await compileGtfs(zip, '2026-11-23');
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'the same archive and day compile to the same bundle');
    assert.equal(a.stats.tripsKept, 4); assert.equal(a.stats.timetableRows, 2);
    assert.deepEqual(a.patterns.map((p) => p.t), [[['7', 480, 0, 20, 0], ['3', 570, 0, 20, 0]]], 'days 0,1,2 at 08:00 in one row; days 0,1 at 09:30 in another');
    const net = loadNetwork({ v: 1, id: 't', window: { start: a.windowStart, days: a.days }, realtime: null, tz: a.tz, agencies: a.agencies, routes: a.routes, stops: a.stops, patterns: a.patterns });
    const A = { lng: 7.0, lat: 48.0 }, B = { lng: 7.1, lat: 48.0 };
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25']) {
      const r = plan(net, { from: A, to: B, date, depart: 7 * 3600 + 50 * 60 });
      assert.equal(r.ok, true, date);
      assert.equal(r.journeys[r.journeys.length - 1].legs.find((l) => l.type === 'ride').depart, 8 * 3600, date + ': the 08:00 runs');
    }
    const after = (date) => plan(net, { from: A, to: B, date, depart: 8 * 3600 + 60 });
    assert.equal(after('2026-11-24').journeys.pop().legs.find((l) => l.type === 'ride').depart, 9 * 3600 + 30 * 60, 'the 09:30 runs on day 1');
    assert.equal(after('2026-11-25').ok, false, 'and not on day 2');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a real plan with a transfer, and a real reach, over a newly shipped feed (Strasbourg CTS, into Kehl)', () => {
  const b = bundle('fr-strasbourg'); const net = loadNetwork(b);
  const date = b.window.start;
  const named = (re) => { const i = b.stops.findIndex((s) => re.test(s[0])); assert.ok(i >= 0, String(re)); return { lng: b.stops[i][2] / 1e5, lat: b.stops[i][1] / 1e5 }; };
  const gare = named(/^Gare Centrale$/), kehl = named(/^Kehl Rathaus$/), robertsau = named(/^Robertsau L'Escale$/);
  const p = plan(net, { from: gare, to: kehl, date, depart: 9 * 3600 });
  assert.equal(p.ok, true);
  const j = p.journeys[p.journeys.length - 1];
  assert.ok(j.durationS > 10 * 60 && j.durationS < 60 * 60, 'Strasbourg station to Kehl town hall: ' + Math.round(j.durationS / 60) + ' min');
  const q = plan(net, { from: kehl, to: robertsau, date, depart: 9 * 3600 });
  assert.equal(q.ok, true);
  assert.ok(q.journeys.some((x) => x.transfers >= 1), 'Kehl to the Robertsau needs a change');
  /* tram D crosses the Rhine at about 7.80° E (Kehl Bahnhof 7.807): the reach runs into Germany within the budget the plan above needs */
  const r = reach(net, { origin: gare, date, depart: 9 * 3600, budgetMin: Math.ceil(j.durationS / 60) + 15 });
  assert.ok(r.stops.some((s) => s.lng > 7.80 && /^Kehl /.test(s.name)), 'the reach from the station runs across the Rhine into Kehl');
});
