/* ============================================================================
 *  #R341 — the aviation wire codec and data model
 * ----------------------------------------------------------------------------
 *  These run against the MIRRORED copies in supabase/functions/_shared/, not against js/. The
 *  mirror check in static-checks proves the two files are the same text; this file proves the text
 *  the SERVER runs is a working codec. Testing js/ instead would leave the one copy that actually
 *  encodes production bytes untested.
 *
 *  What a failure here means, in order of severity:
 *    · a round-trip failure = every aircraft in the world lands somewhere plausible and wrong
 *    · a normalisation failure = the filter disagrees with the colour, or "unknown" reads as "0"
 *    · a geometry failure = a viewport near the antimeridian or a pole asks for the wrong sky
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ⚠ #R317: read through eol.mjs's readLF so a CRLF working copy cannot make a source-text check
   permanently red on Windows and permanently green on CI. */
const { readLF } = await import('../scripts/eol.mjs');

await import('../supabase/functions/_shared/aviation-codec.js');
await import('../supabase/functions/_shared/aviation-model.js');
const C = globalThis.IntMapAviationCodec;
const M = globalThis.IntMapAviationModel;

/* ── ① the codec round-trips, and quantisation stays inside its stated bounds ── */
test('① codec: round-trip preserves identity, position, altitude and flags', () => {
  const now = 1787000000000;
  const src = [
    { hex: '4ca7b5', lon: 139.7671, lat: 35.6812, altFt: 37000, track: 271.34, gsKt: 451.6, vrFpm: -1024, ageSec: 2.3, category: 3 },
    { hex: '3c6444', lon: -179.99991, lat: -74.5, altFt: 100, track: 359.99, gsKt: 0, vrFpm: 0, ageSec: 0, onGround: true, military: true, category: 7 },
    { hex: '~a1b2c3', lon: 0, lat: 0, altFt: -1000, track: 0.005, gsKt: 6000, vrFpm: 30000, ageSec: 1.05, emergency: true, spi: true, category: 14 },
  ];
  const buf = C.encode({ seq: 42, serverTimeMs: now, aircraft: src });
  const d = C.decode(buf);

  assert.equal(d.seq, 42);
  assert.equal(d.count, 3);
  assert.equal(d.delta, false);
  assert.equal(d.serverTimeMs, now);
  assert.equal(buf.length, C.HEADER_BYTES + 3 * C.REC_BYTES, 'no identity section was supplied');

  for (let i = 0; i < src.length; i++) {
    assert.equal(C.numToHex(d.icao[i]), src[i].hex, 'hex ' + i);
    /* 1e-7 deg quantisation = 1.1 cm; the float32 the decoder stores it in is the wider bound. */
    assert.ok(Math.abs(d.lon[i] - src[i].lon) < 1e-4, 'lon ' + i + ' got ' + d.lon[i]);
    assert.ok(Math.abs(d.lat[i] - src[i].lat) < 1e-4, 'lat ' + i);
    assert.ok(Math.abs(d.alt[i] - src[i].altFt) <= 25, 'alt ' + i + ' got ' + d.alt[i]);
    assert.ok(Math.abs(d.track[i] - src[i].track) <= 0.01, 'track ' + i);
  }
  assert.ok(!!(d.flags[1] & C.AC_ON_GROUND), 'on-ground survives');
  assert.ok(!!(d.flags[1] & C.AC_MILITARY), 'military survives');
  assert.ok(!!(d.flags[2] & C.AC_EMERGENCY), 'emergency survives');
  assert.ok(!!(d.flags[2] & C.AC_SPI), 'spi survives');
  assert.equal(d.cat[2], 14, 'category survives');
});

/* ── ② "no altitude" and "zero altitude" are different bytes ───────────────────
   This is the distinction §22 exists for. The layer this replaces turned a missing altitude into
   0 ft, which is indistinguishable from an aircraft reporting sea level — and in 3-D put it on
   the ground. */
test('② codec: a missing measurement is not a zero measurement', () => {
  const buf = C.encode({
    seq: 1, serverTimeMs: 0,
    aircraft: [
      { hex: 'aaaaaa', lon: 1, lat: 1, altFt: 0 },        // reported: sea level
      { hex: 'bbbbbb', lon: 1, lat: 1 },                   // not reported at all
      { hex: 'cccccc' },                                   // no position either
    ],
  });
  const d = C.decode(buf);
  assert.ok(!!(d.flags[0] & C.AC_ALT_VALID), 'a reported 0 ft is valid');
  assert.equal(d.alt[0], 0);
  assert.ok(!(d.flags[1] & C.AC_ALT_VALID), 'an absent altitude is not valid');
  assert.ok(Number.isNaN(d.alt[1]), 'and decodes to NaN, not 0');
  assert.ok(!!(d.flags[0] & C.AC_POS_VALID), 'a real position is valid');
  assert.ok(!(d.flags[2] & C.AC_POS_VALID), 'an absent position is not valid');
  assert.ok(Number.isNaN(d.mx[2]) && Number.isNaN(d.my[2]), 'and yields no mercator coordinate');
});

/* ── ③ the decoder refuses what it cannot read, rather than guessing ─────────── */
test('③ codec: bad magic, unknown version and truncation all throw', () => {
  const good = C.encode({ seq: 1, serverTimeMs: 0, aircraft: [{ hex: 'aaaaaa', lon: 0, lat: 0 }] });

  assert.throws(() => C.decode(new Uint8Array(8)), /short header/, 'a short buffer');

  const badMagic = good.slice();
  new DataView(badMagic.buffer).setUint32(0, 0x11223344, true);
  assert.throws(() => C.decode(badMagic), /bad magic/, 'wrong magic');

  const badVer = good.slice();
  new DataView(badVer.buffer).setUint16(4, 99, true);
  assert.throws(() => C.decode(badVer), /unsupported version/, 'a version we do not know');

  assert.throws(() => C.decode(good.slice(0, good.length - 4)), /truncated/, 'a clipped body');
});

/* ── ④ the identity section survives, including a UTF-8 operator name ────────── */
test('④ codec: identity lines round-trip and stay column-aligned', () => {
  const buf = C.encode({
    seq: 1, serverTimeMs: 0, aircraft: [],
    identity: [
      { hex: '4ca7b5', callsign: 'ANA216', type: 'B788', registration: 'JA820A', operator: 'All Nippon Airways' },
      /* a tab and a newline inside a field would shift every following column */
      { hex: 'bbbbbb', callsign: 'BAD\tCS', type: 'A\n20N', registration: '', operator: 'Ünïcödé Air' },
    ],
  });
  const d = C.decode(buf);
  assert.equal(d.identity.length, 2);
  assert.deepEqual(d.identity[0], { hex: '4ca7b5', callsign: 'ANA216', type: 'B788', registration: 'JA820A', operator: 'All Nippon Airways' });
  assert.equal(d.identity[1].callsign, 'BAD CS', 'the tab was neutralised, not dropped');
  assert.equal(d.identity[1].type, 'A 20N', 'the newline was neutralised');
  assert.equal(d.identity[1].operator, 'Ünïcödé Air', 'non-ASCII survives');
});

/* ── ⑤ removals and the delta flag ─────────────────────────────────────────── */
test('⑤ codec: a delta carries its base sequence and its removals', () => {
  const buf = C.encode({
    seq: 11, baseSeq: 10, delta: true, serverTimeMs: 5,
    aircraft: [{ hex: '111111', lon: 2, lat: 3 }],
    remove: ['222222', '333333'],
  });
  const d = C.decode(buf);
  assert.equal(d.delta, true);
  assert.equal(d.seq, 11);
  assert.equal(d.baseSeq, 10);
  assert.equal(d.remove.length, 2);
  assert.equal(C.numToHex(d.remove[0]), '222222');
  assert.equal(C.numToHex(d.remove[1]), '333333');
});

/* ── ⑥ hex ⇄ number is exactly reversible, TIS-B targets included ────────────── */
test('⑥ codec: ICAO hex normalisation is lossless both ways', () => {
  for (const h of ['000000', '4ca7b5', 'ffffff', 'a00001', '~abc123', '~000000', '~ffffff']) {
    assert.equal(C.numToHex(C.hexToNum(h)), h, h);
  }
  /* A real ICAO address is 24 bits, so it can never collide with the flag the '~' form sets. */
  assert.ok(C.hexToNum('ffffff') < 0x1000000);
  assert.ok(C.hexToNum('~000000') >= 0x80000000);
});

/* ── ⑦ adsb.lol normalisation, on a record shaped exactly like the live feed ─── */
test('⑦ model: adsb.lol — "ground" is not a number, seen_pos is the age that matters', () => {
  const now = 1787000000000;
  const air = M.normalizeAdsbLol({
    hex: '40812D', flight: 'EZY64DM ', r: 'G-UZMK', t: 'A21N',
    alt_baro: 23150, alt_geom: 23925, gs: 377.0, track: 70.80, true_heading: 71.17,
    baro_rate: -2304, squawk: '5172', emergency: 'none', category: 'A3',
    dbFlags: 0, seen_pos: 1.5, seen: 0.2,
    lat: 51.2, lon: -0.4,
  }, now, 'adsblol');

  assert.equal(air.hex, '40812d', 'hex is lower-cased');
  assert.equal(air.callsign, 'EZY64DM', 'the callsign is trimmed');
  assert.equal(air.registration, 'G-UZMK');
  assert.equal(air.type, 'A21N');
  assert.equal(air.altFt, 23150, 'barometric wins over geometric');
  assert.equal(air.geometric, false);
  assert.equal(air.track, 70.80, 'track wins over true_heading');
  assert.equal(air.onGround, false);
  assert.equal(air.military, false);
  assert.equal(air.emergency, false, '"none" is not an emergency');
  assert.equal(air.category, 3, 'A3 → 3');
  assert.equal(air.seenAt, now - 1500, 'seen_pos, not seen, sets the observation time');

  const ground = M.normalizeAdsbLol({ hex: 'abc123', alt_baro: 'ground', lat: 1, lon: 2, seen_pos: 0 }, now, 'adsblol');
  assert.equal(ground.onGround, true, '"ground" is a string and means on the surface');
  assert.equal(ground.altFt, 0);

  const geomOnly = M.normalizeAdsbLol({ hex: 'abc124', alt_geom: 5000, lat: 1, lon: 2 }, now, 'adsblol');
  assert.equal(geomOnly.altFt, 5000);
  assert.equal(geomOnly.geometric, true, 'and it is flagged as geometric, not barometric');

  const noAlt = M.normalizeAdsbLol({ hex: 'abc125', lat: 1, lon: 2 }, now, 'adsblol');
  assert.equal(noAlt.altFt, null, 'silence is null, never 0');

  const mil = M.normalizeAdsbLol({ hex: 'abc126', dbFlags: 1, lat: 1, lon: 2 }, now, 'adsblol');
  assert.equal(mil.military, true, 'dbFlags bit 0 is the only military signal (#R19)');
  const notMil = M.normalizeAdsbLol({ hex: 'abc127', dbFlags: 2, flight: 'RCH123', lat: 1, lon: 2 }, now, 'adsblol');
  assert.equal(notMil.military, false, 'a military-looking callsign is NOT a military flag');
});

/* ── ⑧ OpenSky normalisation converts units once, at the boundary ───────────── */
test('⑧ model: OpenSky — SI in, aviation units out, and no invented military flag', () => {
  const now = 1787000000000;
  /* Field order from openskynetwork.github.io/opensky-api/rest.html */
  const v = ['a09281', 'N136LM  ', 'United States', 1787446845, 1787446845,
    -83.8448, 35.7629, 2286, false, 46.71, 196.64, 2.28, null, 2400.3, '7700', true, 0, 4];
  const s = M.normalizeOpenSky(v, now);

  assert.equal(s.hex, 'a09281');
  assert.equal(s.callsign, 'N136LM');
  assert.ok(Math.abs(s.altFt - 2286 / 0.3048) < 0.5, 'metres → feet');
  assert.ok(Math.abs(s.gsKt - 46.71 * 1.943844) < 0.01, 'm/s → knots');
  assert.ok(Math.abs(s.vrFpm - 2.28 * 196.850394) < 0.01, 'm/s → feet per minute');
  assert.equal(s.onGround, false);
  assert.equal(s.spi, true);
  assert.equal(s.squawk, '7700');
  assert.equal(s.emergency, true, '7700 is an emergency squawk');
  assert.equal(s.seenAt, 1787446845 * 1000, 'time_position, not our clock');
  assert.equal(s.military, false, 'OpenSky does not report it…');
  assert.equal(M.providerReports('opensky', 'military'), false, '…and providerReports says so');
  assert.equal(M.providerReports('adsblol', 'military'), true);
  assert.equal(M.providerReports('opensky', 'registration'), false);

  /* No provider reports a schedule, so no provider may imply one. */
  for (const p of Object.keys(M.PROVIDER_FIELDS)) {
    assert.equal(M.providerReports(p, 'schedule'), false, p + ' must not claim schedule data');
    assert.equal(M.providerReports(p, 'route'), false, p + ' must not claim route data');
  }
});

/* ── ⑨ emitter categories ───────────────────────────────────────────────────── */
test('⑨ model: A0–D7 map to the standard numbering, junk maps to "no information"', () => {
  assert.equal(M.categoryNum('A0'), 0);
  assert.equal(M.categoryNum('A3'), 3);
  assert.equal(M.categoryNum('A7'), 7);
  assert.equal(M.categoryNum('B1'), 9);
  assert.equal(M.categoryNum('C1'), 17);
  assert.equal(M.categoryNum('D7'), 31);
  for (const junk of ['', 'X', 'Z9', 'A9', 'A-1', null, undefined, 5]) {
    assert.equal(M.categoryNum(junk), 0, JSON.stringify(junk));
  }
  assert.ok(M.isRotorcraft(M.categoryNum('A7')));
  assert.ok(M.isGlider(M.categoryNum('B1')));
  assert.ok(M.isUAV(M.categoryNum('B6')));
  assert.ok(M.isSurfaceVehicle(M.categoryNum('C1')), 'an airport service vehicle is not an aircraft');
  assert.ok(M.isSurfaceVehicle(M.categoryNum('C2')));
  assert.ok(M.isObstacle(M.categoryNum('C3')));
  assert.equal(M.CATEGORY_NAMES.length, 32, 'the table covers A0–D7 with no holes');
});

/* ── ⑩ freshness is three bands, not a boolean ─────────────────────────────── */
test('⑩ model: freshness distinguishes live, lagging, stale and unknown', () => {
  assert.equal(M.freshness(0), 'live');
  assert.equal(M.freshness(M.FRESH_LIVE_S), 'live');
  assert.equal(M.freshness(M.FRESH_LIVE_S + 0.1), 'lagging');
  assert.equal(M.freshness(M.FRESH_LAGGING_S), 'lagging');
  assert.equal(M.freshness(M.FRESH_LAGGING_S + 0.1), 'stale');
  assert.equal(M.freshness(NaN), 'unknown');
  assert.equal(M.freshness(-1), 'unknown');
});

/* ── ⑪ the tile lattice ─────────────────────────────────────────────────────── */
test('⑪ model: the world lattice covers the globe and stays inside its latitude limit', () => {
  const L = M.buildLattice(250, 75);
  assert.ok(L.length > 800 && L.length < 1200, 'about a thousand 250 nm tiles: got ' + L.length);
  for (const t of L) {
    assert.ok(t.lat >= -75.001 && t.lat <= 75.001, 'lat in range: ' + t.lat);
    assert.ok(t.lon >= -180.001 && t.lon < 180.001, 'lon in range: ' + t.lon);
  }
  /* Every latitude band is represented — a lattice that skipped one would leave a blank stripe. */
  const bands = new Set(L.map((t) => Math.round(t.lat / 15)));
  assert.ok(bands.size >= 9, 'the lattice spans the latitude range: ' + bands.size + ' bands');
});

/* ── ⑫ the antimeridian and the poles ───────────────────────────────────────
   A view straddling ±180 is where a bbox-to-tiles routine either returns nothing or asks for a
   full circumnavigation. Both have shipped in this codebase in other layers. */
test('⑫ model: a viewport across the antimeridian asks for tiles on BOTH sides', () => {
  const tiles = M.tilesForBbox(170, -10, -170, 10, 250, 8, 75);
  assert.ok(tiles.length > 0, 'it asks for something');
  assert.ok(tiles.length <= 8, 'and respects the cap');
  const east = tiles.filter((t) => t.lon > 150).length;
  const west = tiles.filter((t) => t.lon < -150).length;
  assert.ok(east > 0 && west > 0, 'tiles on both sides of ±180: east=' + east + ' west=' + west);
  for (const t of tiles) {
    assert.ok(t.lon >= -180 && t.lon <= 180, 'longitudes stay wrapped: ' + t.lon);
  }
});

test('⑬ model: a polar viewport is clamped, deduplicated and still bounded', () => {
  const tiles = M.tilesForBbox(-180, 80, 180, 90, 250, 6, 75);
  assert.ok(tiles.length <= 6, 'cap respected: ' + tiles.length);
  for (const t of tiles) assert.ok(t.lat <= 75.001, 'clamped to the latitude limit: ' + t.lat);
  const keys = new Set(tiles.map((t) => t.lat + '/' + t.lon));
  assert.equal(keys.size, tiles.length, 'no duplicate tile centres near the pole');
});

test('⑭ model: an inverted bbox is normalised rather than returning nothing', () => {
  const normal = M.tilesForBbox(0, 40, 10, 50, 250, 4, 75);
  const flipped = M.tilesForBbox(0, 50, 10, 40, 250, 4, 75);   // south and north swapped
  assert.ok(normal.length > 0);
  assert.deepEqual(flipped, normal, 'south > north is corrected, not rejected');
});

/* ── ⑮ the Edge Function's own bounds are what the measurements say ──────────
   #R341 measured api.adsb.lol at ~4 requests per burst regardless of the gap. A later round that
   quietly raises the concurrency or the tile count is the exact change that gets the address
   blocked, so the numbers are pinned here with the reason attached. */
test('⑮ aviation-feed: reads tiles serially, within the measured burst budget', () => {
  const src = readLF(join(ROOT, 'supabase', 'functions', 'aviation-feed', 'index.ts'));

  const view = src.match(/const VIEW_MAX_TILES = (\d+);/);
  assert.ok(view, 'VIEW_MAX_TILES is declared');
  assert.ok(Number(view[1]) <= 4, 'a viewport read stays inside the measured burst budget of 4');

  const slice = src.match(/const WORLD_SLICE_TILES = (\d+);/);
  assert.ok(slice && Number(slice[1]) <= 4, 'so does a world slice');

  const gap = src.match(/const TILE_GAP_MS = (\d+);/);
  assert.ok(gap && Number(gap[1]) >= 1000, 'tiles are spaced by at least a second');

  assert.ok(!/Promise\.all\(\s*tiles/.test(src), 'tiles are never read in parallel');
  assert.ok(/async function readSerial/.test(src), 'the serial reader exists');
  assert.ok(/RATE_LIMITED/.test(src), 'a 429 is distinguished from an empty answer');
  assert.ok(/backoffUntil/.test(src), 'and it backs the whole function off');

  /* The documented radius is a promise to the provider, not a tuning knob. */
  const radius = src.match(/const RADIUS_NM = (\d+);/);
  assert.ok(radius && Number(radius[1]) <= 250, 'the documented 250 nm maximum is respected');

  /* The User-Agent is load-bearing: a generic one is refused outright. */
  assert.ok(/github\.com\/rwmqx7dwb5-arch\/IntMap/.test(src), 'the User-Agent carries contact info');
});

/* ── ⑮b THE INVENTED AIRCRAFT ARE UNREACHABLE ON THE SHIPPING PATH ────────────
   §25.1 forbids a synthetic fallback in production, and the layer this round replaces had one that
   was not merely present but ACTIVE: measured in production, `genSyntheticPlanes()` was drawing 270
   aircraft whose ICAO addresses were not hexadecimal (0 of 38 valid), under a source line naming a
   provider that had refused every request.
   The function is KEPT — the v1 path is intact for the rollback window §28 Phase G requires — so
   "we deleted it" is not the claim. The claim is that nothing on the default path can reach it, and
   that is a property of the call graph rather than of anyone's intention:

       genSyntheticPlanes()  ←  _sweep()  ←  fetchPlanes()  ←  { startTraffic's v1 branch,
                                                                _planesMove, schedulePlanePoll }

   and every one of those three is armed only inside the branch that runs when AVIATION_V2 is false.
   ⚠ A source check is the right shape here precisely because a browser check cannot be: proving
   "no synthetic aircraft appeared" by watching a running map means waiting for a sweep to fail,
   which is the one thing the new path never does. */
test('⑮b genSyntheticPlanes is unreachable when the new path is the default', () => {
  const raw = readLF(join(ROOT, 'js', 'data-layers.js'));
  /* ⚠ STRIP THE COMMENTS FIRST. This round's own note in js/data-layers.js explains what
     genSyntheticPlanes() used to do, so counting call sites over the raw text finds three: one
     call and two sentences about it. That is the ninth time in this repository a check has matched
     its own prose (scripts/atlas-capability-audit.mjs solved it the same way, with codeOnly()).
     A check that counts its own explanation is measuring the wrong document. */
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  /* one definition, and exactly one CALL. `function genSyntheticPlanes(){` matches `name()` as
     well, so the declaration is subtracted by name — not by knowing the total happens to be two,
     which would stop being right the moment a second call appeared. */
  const defs = (src.match(/function genSyntheticPlanes\(\)/g) || []).length;
  const uses = (src.match(/genSyntheticPlanes\(\)/g) || []).length;
  assert.equal(defs, 1, 'one definition, got ' + defs);
  assert.equal(uses - defs, 1, 'exactly one call site in code, got ' + (uses - defs));

  /* the default is the new path — the old provider answers 403 to everything */
  const flag = /const AVIATION_V2=\(function\(\)\{[\s\S]*?\n      return (true|false);\n    \}\)\(\);/.exec(src);
  assert.ok(flag, 'AVIATION_V2 resolves to a literal default');
  assert.equal(flag[1], 'true', 'the new path is the default');

  /* startTraffic's v2 branch must start no sweep of any kind */
  const st = /function startTraffic\(id\)\{([\s\S]*?)\n    function stopTraffic/.exec(src);
  assert.ok(st, 'startTraffic is found');
  const v2 = /if\(id==='planes'&&AVIATION_V2\)\{([\s\S]*?)\} else if\(id==='planes'\)\{/.exec(st[1]);
  assert.ok(v2, 'startTraffic has an AVIATION_V2 branch ahead of the original one');
  assert.doesNotMatch(v2[1], /fetchPlanes\(/, 'the new path never starts a sweep');
  assert.doesNotMatch(v2[1], /planesTimer=/, 'and never arms the poll timer');
  assert.doesNotMatch(v2[1], /_planesMove/, 'and never registers the viewport-follow sweep');

  /* …and the zoom prompt production showed at z1 WHILE drawing 270 aircraft is suppressed */
  assert.match(src, /if\(AVIATION_V2\)\{ el\.style\.display='none'; return; \}/,
    'the zoom hint is off on the path that has no zoom gate');
});

/* ── ⑯ no provider key may ever reach the browser ──────────────────────────── */
test('⑯ aviation-feed: credentials are read from the environment and never returned', () => {
  const src = readLF(join(ROOT, 'supabase', 'functions', 'aviation-feed', 'index.ts'));
  for (const secret of ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET']) {
    const uses = src.split(secret).length - 1;
    assert.ok(uses > 0, secret + ' is read');
    /* It may appear only inside Deno.env.get(...) — never in a response body or a header. */
    const re = new RegExp('env\\("' + secret + '"\\)', 'g');
    assert.equal((src.match(re) || []).length, uses, secret + ' is only ever read via env()');
  }
  assert.ok(!/JSON\.stringify\([^)]*CLIENT_SECRET/.test(src), 'no secret is serialised into a response');
  /* OpenSky may not be used at all without the operator asserting the written agreement exists. */
  assert.ok(/OPENSKY_AGREEMENT/.test(src), 'the written-agreement gate exists');
  assert.ok(/function openskyAllowed[\s\S]{0,240}OPENSKY_AGREEMENT/.test(src),
    'and openskyAllowed() is what checks it');
});

/* ── ⑰ the mirrors are the same text as their sources ──────────────────────── */
test('⑰ the _shared mirrors are in sync with js/', async () => {
  const { inSync, outOfSync, MIRRORS } = await import('../scripts/sync-aviation.mjs');
  assert.equal(MIRRORS.length, 2, 'codec and model are both mirrored');
  assert.ok(inSync(), 'out of sync: ' + outOfSync().join(', ') + ' — run: node scripts/sync-aviation.mjs');
});
