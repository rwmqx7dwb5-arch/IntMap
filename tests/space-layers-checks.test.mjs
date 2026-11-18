/* ============================================================================
 *  space-layers — the rocket-launch layer (dl-launches) and the fireball layer (dl-fireballs)
 * ----------------------------------------------------------------------------
 *  WHAT IS HELD HERE, and by what:
 *   ① both declarations pass scripts/lib/layer-descriptor.mjs (`descriptorProblems`, and `setProblems` against every
 *     other declaration of js/layers/) and each names a package file that exports the factory its `pkg` names;
 *   ② the fetch relay admits the two URLs the page and the widgets send to NASA/JPL (the one `fireball.api` the layer
 *     reads, and real-shaped `cad.api` / `fireball.api` queries) and refuses another path, another host and a key or
 *     value neither API has — `fetchRelayRule` is EVALUATED, the rule list is never read as text;
 *   ③ the pure halves of the two packages — LL2's launches → pads → GeoJSON, CNEOS's table → events → GeoJSON, and what
 *     the clock's instant keeps — are evaluated on JSON copied in the shape the upstreams send (2026-11-17), including
 *     the 2013 Chelyabinsk event, which has to come out as the largest.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (rel) => pathToFileURL(join(ROOT, rel)).href;
globalThis.window = globalThis.window || {};

const { load } = await import(url('scripts/layer-descriptors.mjs'));
const { descriptorProblems, setProblems, packageFile, packageExport } = await import(url('scripts/lib/layer-descriptor.mjs'));
const policy = await import(url('supabase/functions/_shared/fetch-relay-policy.js'));
const launches = await import(url('js/layer-pkg-launches.js'));
const fireballs = await import(url('js/layer-pkg-fireballs.js'));

const MINE = ['dl-launches', 'dl-fireballs'];

/* ── ① the declarations ─────────────────────────────────────────────────────────────────────── */
test('space-layers ① both layers are declared, on the orbit shelf, and pass the descriptor rules', async () => {
  const { shelves, list } = await load();
  const keys = new Set(shelves.map((s) => s.key));
  for (const id of MINE) {
    const hit = list.find((x) => x.d && x.d.id === id);
    assert.ok(hit, id + ' has a declaration in js/layers/');
    assert.equal(hit.d.shelf, 'lyrGrpOrbit', id + ' is filed with the satellites');
    assert.deepEqual(descriptorProblems(hit.d, hit.file, keys), [], id);
  }
  const clash = setProblems(list.map((x) => x.d).filter((d) => d && typeof d === 'object')).filter((p) => MINE.some((id) => p.includes(id)));
  assert.deepEqual(clash, [], 'neither layer shares an id, a key or a place on the shelf with another');
});

test('space-layers ① each declaration names a package file that exports the factory the name derives', async () => {
  const { list } = await load();
  for (const id of MINE) {
    const d = list.find((x) => x.d && x.d.id === id).d;
    assert.ok(d.pkg, id + ' is implemented by a package');
    const file = 'js/' + packageFile(d.pkg);
    assert.ok(existsSync(join(ROOT, file)), file + ' exists');
    const mod = await import(url(file));
    assert.equal(typeof mod[packageExport(d.pkg)], 'function', file + ' exports ' + packageExport(d.pkg));
  }
});

/* ── ② the relay ─────────────────────────────────────────────────────────────────────────────── */
const RULE = 'jpl-ssd-api';
const admits = (u) => { const r = policy.fetchRelayRule(u); return !!r && r.id === RULE; };

test('space-layers ② the relay admits the fireball URL the page sends, and the rule\'s own probe', () => {
  const sent = readFileSync(join(ROOT, 'js/layer-pkg-fireballs.js'), 'utf8').match(/const FIREBALL_URL = '([^']+)'/);
  assert.ok(sent, 'the layer names its URL in one constant');
  assert.ok(admits(sent[1]), sent[1]);
  const rule = policy.FETCH_RELAY_RULES.find((r) => r.id === RULE);
  assert.ok(rule, 'the rule exists');
  assert.equal(policy.fetchRelayRule(rule.probe), rule, 'the probe is a URL its own rule admits');
  assert.ok(rule.hosts.length === 1 && rule.hosts[0] === 'ssd-api.jpl.nasa.gov');
});

test('space-layers ② the relay admits real fireball and close-approach queries, with every documented argument', () => {
  for (const u of [
    'https://ssd-api.jpl.nasa.gov/fireball.api',
    'https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true&sort=-date',
    'https://ssd-api.jpl.nasa.gov/fireball.api?date-min=2013-02-01&date-max=2013-03-01&energy-min=1&req-loc=true&req-alt=true&req-vel=true&limit=50&sort=-impact-e',
    'https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=%2B60&sort=date',
    'https://ssd-api.jpl.nasa.gov/cad.api?dist-max=10LD&date-min=2026-01-01&date-max=2026-12-31&h-max=22&diameter=true&body=Earth&limit=100&sort=dist',
    'https://ssd-api.jpl.nasa.gov/cad.api?fullname=433%20Eros%20(A898%20PA)&date-min=1900-01-01&date-max=2100-01-01',
  ]) assert.ok(admits(u), u);
});

test('space-layers ② the relay refuses another path, host, scheme, key or value', () => {
  for (const u of [
    'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=Ceres',                       /* another API of the same host */
    'https://ssd-api.jpl.nasa.gov/fireball.api/extra',
    'https://ssd-api.jpl.nasa.gov/fireball.apix',
    'https://ssd-api.jpl.nasa.gov/fireball.api?x=1',                           /* a key neither API has */
    'https://ssd-api.jpl.nasa.gov/fireball.api?constructor=1',
    'https://ssd-api.jpl.nasa.gov/fireball.api?limit=abc',
    'https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=maybe',
    'https://ssd-api.jpl.nasa.gov/fireball.api?limit=1&limit=2',               /* a repeated key */
    'https://ssd-api.jpl.nasa.gov/cad.api?date-max=%2B60%3Bdrop',
    'https://ssd-api.jpl.nasa.gov/cad.api?body=Earth%20Mars',
    'http://ssd-api.jpl.nasa.gov/fireball.api',
    'https://ssd-api.jpl.nasa.gov:8443/fireball.api',
    'https://user:pw@ssd-api.jpl.nasa.gov/fireball.api',
    'https://ssd-api.jpl.nasa.gov/fireball.api#frag',
    'https://ssd-api.jpl.nasa.gov.evil.example/fireball.api',
    'https://sbdb.jpl.nasa.gov/fireball.api',
  ]) assert.ok(!admits(u), u);
});

/* ── ③ the launches, from a real LL2 answer's shape (mode=normal, 2026-11-17; trimmed to the fields read) ───── */
const NOW = Date.parse('2026-11-17T12:00:00Z');
const launch = (o) => ({
  id: o.id, name: o.name, net: o.net, net_precision: o.precision || null,
  status: o.status || { id: 3, name: 'Launch Successful', abbrev: 'Success' },
  launch_service_provider: { id: 1, name: o.provider || 'SpaceX' },
  rocket: { id: 1, configuration: { id: 1, name: 'Falcon 9', full_name: 'Falcon 9 Block 5' } },
  mission: { id: 1, name: o.mission || 'Starlink', orbit: { id: 8, name: 'Low Earth Orbit', abbrev: 'LEO' }, vid_urls: o.vids || [] },
  pad: { id: o.pad, name: o.padName, latitude: o.lat, longitude: o.lon, location: { id: 1, name: o.place } },
  webcast_live: !!o.live,
});
const SLC40 = { pad: 80, padName: 'Space Launch Complex 40', lat: '28.56194122', lon: '-80.57735736', place: 'Cape Canaveral SFS, FL, USA' };
const TAIYUAN = { pad: 22, padName: 'Launch Complex 9', lat: 38.863128, lon: 111.589567, place: 'Taiyuan Satellite Launch Center, China' };
const RESULTS = [
  launch({ id: 'a', name: 'Falcon 9 | Starlink 12-1', net: '2026-11-12T03:00:00Z', ...SLC40 }),                                  /* 5 d before: past */
  launch({ id: 'b', name: 'Falcon 9 | Starlink 12-2', net: '2026-11-20T03:00:00Z', status: { id: 1, name: 'Go for Launch', abbrev: 'Go' }, ...SLC40 }),
  launch({ id: 'c', name: 'Falcon 9 | Starlink 12-3', net: '2026-12-10T03:00:00Z', status: { id: 2, name: 'To Be Determined', abbrev: 'TBD' }, ...SLC40 }),
  launch({ id: 'd', name: 'Long March 6A | Test', net: '2026-11-18T22:50:00Z', status: { id: 1, name: 'Go for Launch', abbrev: 'Go' }, provider: 'CASC', vids: [{ url: 'https://example.org/stream' }, { url: 'http://insecure.example/x' }], ...TAIYUAN }),
  launch({ id: 'old', name: 'Falcon 9 | Too old', net: '2026-11-05T00:00:00Z', ...SLC40 }),                                     /* 12 d before: outside */
  launch({ id: 'far', name: 'Falcon 9 | Too far', net: '2026-12-25T00:00:00Z', ...SLC40 }),                                    /* 38 d after: outside */
  launch({ id: 'nopad', name: 'No position', net: '2026-11-19T00:00:00Z', pad: 1, padName: 'x', lat: null, lon: null, place: '' }),
  { id: 'nonet', name: 'No NET', net: null, pad: SLC40 },
];

test('space-layers ③ launches: the window is [instant − 7 d, instant + 30 d], grouped by pad, upcoming first', () => {
  const pads = launches.launchesToPads(RESULTS, NOW);
  assert.deepEqual(pads.map((p) => p.id).sort(), ['22', '80']);
  const cape = pads.find((p) => p.id === '80');
  assert.deepEqual(cape.launches.map((l) => l.id), ['b', 'c', 'a'], 'the schedule in order, then the past');
  assert.equal(cape.up, 2); assert.equal(cape.past, 1);
  assert.equal(cape.name, 'Space Launch Complex 40');
  assert.ok(Math.abs(cape.lat - 28.56194122) < 1e-9 && Math.abs(cape.lon + 80.57735736) < 1e-9, 'string coordinates are read as numbers');
  const l = pads.find((p) => p.id === '22').launches[0];
  assert.equal(l.provider, 'CASC'); assert.equal(l.rocket, 'Falcon 9 Block 5'); assert.equal(l.orbit, 'Low Earth Orbit');
  assert.deepEqual(l.vids, ['https://example.org/stream'], 'only https links are kept');
});

test('space-layers ③ launches: moving the clock moves the window, and a launch is «scheduled» only after the instant', () => {
  const earlier = Date.parse('2026-11-10T00:00:00Z');   /* window 11-03 … 12-10: the 11-12 and 11-20 Starlinks are ahead, the 11-05 one 5 d back, the 12-10 03:00 one just outside */
  const cape = launches.launchesToPads(RESULTS, earlier).find((p) => p.id === '80');
  assert.deepEqual(cape.launches.map((l) => l.id), ['a', 'b', 'old']);
  assert.equal(cape.up, 2); assert.equal(cape.past, 1);
  assert.deepEqual(launches.launchesToPads(RESULTS, Date.parse('1999-01-01T00:00:00Z')), [], 'LL2 states nothing in this window of the answer');
});

test('space-layers ③ launches: GeoJSON has the pad, a name for the shared reader and a badge only for several', () => {
  const fc = launches.padsToGeoJSON(launches.launchesToPads(RESULTS, NOW));
  assert.equal(fc.type, 'FeatureCollection');
  const cape = fc.features.find((f) => f.properties.id === '80'), tai = fc.features.find((f) => f.properties.id === '22');
  assert.deepEqual(cape.geometry.coordinates, [-80.57735736, 28.56194122], '[lon, lat]');
  assert.equal(cape.properties.name, 'Space Launch Complex 40');
  assert.equal(cape.properties.lbl, '3'); assert.equal(cape.properties.up, 2);
  assert.equal(tai.properties.lbl, '', 'a pad with one launch carries no number');
});

test('space-layers ③ launches: the request is one window of one UTC day, and a throttle says how long to wait', () => {
  const key = launches.dayKeyOf(NOW);
  assert.equal(key, Math.floor(NOW / 86400000));
  const u = new URL(launches.launchesUrl(key));
  assert.equal(u.origin + u.pathname, 'https://ll.thespacedevs.com/2.3.0/launches/');
  assert.equal(u.searchParams.get('mode'), 'normal');
  assert.equal(u.searchParams.get('net__gte'), '2026-11-10T00:00:00Z');
  assert.equal(u.searchParams.get('net__lte'), '2026-12-18T00:00:00Z');
  assert.equal(launches.throttleSeconds('{"detail":"Request was throttled. Expected available in 1789 seconds."}'), 1789);
  assert.equal(launches.throttleSeconds('{"detail":"Not found."}'), null);
});

/* ── ③ the fireballs, from the CNEOS answer's shape (fields + string cells, 2026-11-17; real rows) ───────────── */
const CNEOS = {
  signature: { source: 'NASA/JPL Fireball Data API', version: '1.2' }, count: '5',
  fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'],
  data: [
    ['2026-10-04 03:14:45', '5.4', '0.18', '41.8', 'S', '173.1', 'W', '26.9', '13.8'],
    ['2026-09-15 11:26:13', '2.2', '0.079', '37.6', 'S', '161.6', 'W', '37.0', null],
    ['2018-12-18 23:48:18', '3130', '49', '56.9', 'N', '172.4', 'E', '26.0', '13.6'],
    ['2013-02-15 03:20:26', '37500', '441', '54.8', 'N', '61.1', 'E', '23.3', '18.6'],
    ['1988-04-15 03:03:10', '758', '14', '4.1', 'S', '124.3', 'E', null, null],
  ],
};

test('space-layers ③ fireballs: the table is read by its declared columns, signs from the hemispheres, empty cells stay empty', () => {
  const ev = fireballs.parseFireballs(CNEOS);
  assert.equal(ev.length, 5);
  assert.deepEqual(ev.map((e) => e.ts), [...ev.map((e) => e.ts)].sort((a, b) => b - a), 'newest first');
  assert.equal(ev[0].lat, -41.8); assert.equal(ev[0].lon, -173.1, 'S and W are negative');
  const chel = ev.find((e) => e.ts === Date.UTC(2013, 1, 15, 3, 20, 26));
  assert.deepEqual([chel.lat, chel.lon, chel.impact, chel.energy, chel.alt, chel.vel], [54.8, 61.1, 441, 37500, 23.3, 18.6]);
  const last = ev[ev.length - 1];
  assert.equal(last.alt, null); assert.equal(last.vel, null, 'a field the record leaves empty is null, never 0');
  /* the same table with its columns in another order reads the same: no position is assumed */
  const shuffled = { fields: ['lon', 'lon-dir', 'date', 'lat', 'lat-dir', 'impact-e'], data: [['61.1', 'E', '2013-02-15 03:20:26', '54.8', 'N', '441']] };
  const s = fireballs.parseFireballs(shuffled)[0];
  assert.deepEqual([s.lat, s.lon, s.impact], [54.8, 61.1, 441]);
  assert.deepEqual(fireballs.parseFireballs({ fields: ['date'], data: [['2013-02-15 03:20:26']] }), [], 'no position columns: nothing is invented');
  assert.deepEqual(fireballs.parseFireballs(null), []);
});

test('space-layers ③ fireballs: only events up to the instant are drawn, and the span trims the far side', () => {
  const ev = fireballs.parseFireballs(CNEOS);
  const at = (iso, span) => fireballs.fireballsToFeatures(ev, Date.parse(iso), span === undefined ? null : span);
  assert.equal(at('2026-11-17T00:00:00Z').features.length, 5, 'the whole record at the present');
  assert.equal(at('2026-11-17T00:00:00Z', fireballs.SPANS['1y']).features.length, 2, 'the past year');
  assert.equal(at('2026-11-17T00:00:00Z', fireballs.SPANS['30d']).features.length, 0, 'the past 30 days of the present: the newest event is 44 days old');
  assert.equal(at('2026-10-20T00:00:00Z', fireballs.SPANS['30d']).features.length, 1, 'the past 30 days of 2026-10-20: the 10-04 event, not the 09-15 one');
  assert.equal(at('2013-02-15T03:20:25Z').features.length, 1, 'one second before Chelyabinsk only 1988 has happened');
  assert.equal(at('2013-02-15T03:20:26Z').features.length, 2, 'at the instant itself it has');
  assert.equal(at('1988-04-15T03:03:09Z').features.length, 0, 'before the record: nothing');
  assert.equal(fireballs.SPANS.all, null);
});

test('space-layers ③ fireballs: Chelyabinsk (2013, 441 kt) is the largest the record states', () => {
  const fc = fireballs.fireballsToFeatures(fireballs.parseFireballs(CNEOS), Date.parse('2026-11-17T00:00:00Z'), null);
  const top = fc.features.slice().sort((a, b) => b.properties.e - a.properties.e)[0];
  assert.equal(top.properties.e, 441);
  assert.equal(top.properties.name, '2013-02-15');
  assert.deepEqual(top.geometry.coordinates, [61.1, 54.8], '[lon, lat]');
  assert.ok(top.properties.yr > 2013 && top.properties.yr < 2013.2, 'the colour year is the decimal year of the event');
  assert.ok(fc.features.every((f) => typeof f.properties.name === 'string' && f.properties.name), 'every feature has the name the shared place reader needs');
});
