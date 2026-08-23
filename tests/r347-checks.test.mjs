/* ============================================================================
 *  IntMap · #R347 — navigation and the provider registry, verified without a browser
 * ----------------------------------------------------------------------------
 *  §51/§52 name the acceptance tests. The ones that need a page (the panel, the sheet, the map
 *  layers, the real geolocation prompt) are in tests/r347-navigation.spec.js; everything below is a
 *  pure function of its arguments, which is the property the whole navigation core was written to
 *  have — «does it reroute when I turn off the route?» must be answerable without driving a car.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs (#R283/#R313/#R317) — line endings belong to the
 *  checkout, and a regular expression with a literal \n in it is GREEN FOREVER on CI and RED FOREVER
 *  on this Windows working copy. Three rounds have paid for that lesson; this file does not.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
/* an «X is gone» check must read the code, not the note that says X is gone (#R291's header) */
const bare = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:'"\\`])\/\/.*$/, '$1')).join('\n');

const IDX = { en: 0, jp: 1, de: 2, ru: 3, es: 4 };
function makeWindow() {
  const w = {};
  w.IntMapLang = {
    t(lang, ...a) { const i = IDX[lang]; return (i != null && a[i] != null && a[i] !== '') ? a[i] : a[0]; },
    pick(get) { const f = function () { const i = IDX[(() => { try { return get(); } catch { return 'en'; } })()]; const v = (i != null && i > 0) ? arguments[i] : null; return (v != null && v !== '') ? v : arguments[0]; }; f.arr = (a) => (Array.isArray(a) ? f.apply(null, a) : String(a ?? '')); return f; },
    locale(l, d) { return ({ en: 'en-GB', jp: 'ja-JP', de: 'de-DE', ru: 'ru-RU', es: 'es-ES' })[l] || d || 'en'; },
    normalise(c) { const s = String(c || '').toLowerCase(); return s === 'ja' ? 'jp' : s; },
  };
  return w;
}
function load(w, ...files) {
  for (const f of files) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'Intl', 'Date', 'Math', 'console', 'navigator', src)(w, Intl, Date, Math, console, { onLine: true });
  }
  return w;
}
const navKit = () => load(makeWindow(), 'js/navigation-match.js', 'js/navigation-guidance.js', 'js/navigation-store.js');
const provKit = () => load(makeWindow(), 'js/routing-providers.js', 'js/routing-errors.js');

/* ══ A ROUTE WITH KNOWN GEOMETRY ══════════════════════════════════════════════════════════════════
   Built rather than captured, so every expected number below is arithmetic rather than a recording.
   An L: 2 km due east from (139.70, 35.60), then 2 km due north. At this latitude one degree of
   longitude is ~90.6 km and one of latitude ~111.3 km, so the leg lengths are chosen in degrees and
   the test asserts on what `build()` measures rather than on a figure typed in by hand. */
function ell() {
  const lat0 = 35.60, lng0 = 139.70;
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push([lng0 + (0.0220 * i) / 20, lat0]);           /* east */
  for (let i = 1; i <= 20; i++) pts.push([lng0 + 0.0220, lat0 + (0.0180 * i) / 20]);  /* north */
  return pts;
}
/** a route that comes back on itself 40 m to the north — the case a search window gets wrong */
function hairpin() {
  const lat0 = 35.60, lng0 = 139.70, out = [];
  for (let i = 0; i <= 40; i++) out.push([lng0 + (0.0300 * i) / 40, lat0]);
  for (let i = 1; i <= 40; i++) out.push([lng0 + 0.0300 - (0.0300 * i) / 40, lat0 + 0.00036]);
  return out;
}
/** a nav route with N equal steps over `coords`, each with its own duration */
function routeOf(w, coords, durations) {
  const steps = [];
  const n = durations.length;
  for (let i = 0; i < n; i++) {
    const at = coords[Math.round((i * (coords.length - 1)) / n)];
    steps.push({ distance: 0, duration: durations[i], name: 'Road ' + i, maneuver: { type: i === 0 ? 'depart' : 'turn', modifier: 'right', location: at } });
  }
  return w.IntMapNavGuide.buildRoute({ coords, steps, duration: durations.reduce((a, b) => a + b, 0) }, {});
}

/* ══ ① MAP MATCHING PROJECTS ONTO SEGMENTS, NOT VERTICES (§9) ═════════════════════════════════ */
test('R347 ① a point beside a long segment matches the segment, not the nearest vertex', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  /* one 2 km segment with vertices only at its ends — nearest-vertex would be ~1 km wrong */
  const idx = M.build([[139.70, 35.60], [139.72, 35.60]]);
  const mid = M.project(idx, 139.71, 35.6001, { accuracy: 5 });
  assert.ok(mid.crossTrackDistance < 15, `on-line point should be metres off, got ${mid.crossTrackDistance}`);
  const toA = M.haversine(139.71, 35.6001, 139.70, 35.60);
  assert.ok(toA > 800, 'the sample really is far from both vertices (else the test proves nothing)');
  assert.ok(Math.abs(mid.alongRouteDistance - idx.total / 2) < 30,
    'the along-route distance is the projection, not the distance to a vertex');
});

test('R347 ② confidence is a likelihood in units of the fix’s own accuracy, not a fixed radius', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  const idx = M.build(ell());
  /* the SAME 40 m offset, believed by a vague fix and disbelieved by a sharp one */
  const off = M.project(idx, 139.7080, 35.60036, { accuracy: 100 });
  const sharp = M.project(idx, 139.7080, 35.60036, { accuracy: 3 });
  assert.ok(Math.abs(off.crossTrackDistance - sharp.crossTrackDistance) < 0.01, 'same geometry both times');
  assert.ok(off.confidence > 0.8, `a ±100 m fix 40 m off the line is believable, got ${off.confidence}`);
  assert.ok(sharp.confidence < 0.01, `a ±3 m fix 40 m off the line is not, got ${sharp.confidence}`);
});

test('R347 ③ the search window is not allowed to hold the car on the wrong carriageway', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  const idx = M.build(hairpin());
  const half = idx.total / 2;
  /* a point on the RETURN leg, hinted at the same longitude on the OUTBOUND leg. The two are 40 m
     apart, so the window's answer is outside the corridor and the grid must overrule it. */
  const p = M.project(idx, 139.7150, 35.60036, { hint: half * 0.5, accuracy: 5, reachM: 200 });
  assert.equal(p.windowed, false, 'the window answered and was rejected — the grid decided');
  assert.ok(p.alongRouteDistance > half, `must land on the return leg, got ${p.alongRouteDistance} of ${idx.total}`);
  /* …and the ordinary case still uses the window (this is what keeps the tick O(1)) */
  const near = M.project(idx, 139.7150 - 0.0002, 35.60, { hint: M.project(idx, 139.7148, 35.60, { accuracy: 5 }).alongRouteDistance, accuracy: 5, reachM: 200 });
  assert.equal(near.windowed, true, 'a normal step forward is answered by the window');
});

/* ══ ④ THE GPS GATE (§8, §52) ════════════════════════════════════════════════════════════════ */
test('R347 ④ a stale fix is refused, and refusing it does not change the carried state', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  const a = M.accept(null, { lng: 139.70, lat: 35.60, accuracy: 5, timestamp: 1_000_000 }, { now: 1_000_000 });
  assert.equal(a.accepted, true);
  const stale = M.accept(a.state, { lng: 139.71, lat: 35.60, accuracy: 5, timestamp: 1_000_000 }, { now: 1_100_000 });
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'stale');
  assert.equal(stale.state.lng, 139.70, 'the last good fix is still the carried one');
});

test('R347 ⑤ a teleport is refused twice and then believed — a filter with no way out strands you', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  let st = M.accept(null, { lng: 139.70, lat: 35.60, accuracy: 5, speed: 0, timestamp: 0 }, { now: 0 }).state;
  const far = (ts) => ({ lng: 139.90, lat: 35.60, accuracy: 5, speed: 0, timestamp: ts });   /* ~18 km */
  const r1 = M.accept(st, far(1000), { now: 1000, mode: 'driving' });
  assert.equal(r1.accepted, false); assert.equal(r1.reason, 'jump'); st = r1.state;
  const r2 = M.accept(st, far(2000), { now: 2000, mode: 'driving' });
  assert.equal(r2.accepted, false); st = r2.state;
  const r3 = M.accept(st, far(3000), { now: 3000, mode: 'driving' });
  assert.equal(r3.accepted, true, 'the third agreeing fix is evidence, not noise');
  assert.equal(r3.fix.teleported, true, 'and it is flagged, so progress is not carried across it');
});

test('R347 ⑥ heading is smoothed circularly — 359° and 1° average to 0°, never to 180°', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  /* moving fast enough that the heading is believed at all */
  let st = M.accept(null, { lng: 139.70, lat: 35.60, accuracy: 5, speed: 20, heading: 359, timestamp: 0 }, { now: 0 }).state;
  const r = M.accept(st, { lng: 139.70, lat: 35.6002, accuracy: 5, speed: 20, heading: 1, timestamp: 1000 }, { now: 1000 });
  assert.equal(r.accepted, true);
  const h = r.fix.heading;
  assert.ok(h > 355 || h < 5, `expected a heading near north, got ${h}`);
  assert.ok(Math.abs(M.angleDiff(180, h)) > 170, 'and emphatically not south');
});

test('R347 ⑦ a stationary receiver does not repoint the puck', () => {
  const w = navKit(); const M = w.IntMapNavMatch;
  let st = M.accept(null, { lng: 139.70, lat: 35.60, accuracy: 5, speed: 12, heading: 90, timestamp: 0 }, { now: 0 }).state;
  st = M.accept(st, { lng: 139.7001, lat: 35.60, accuracy: 5, speed: 12, heading: 90, timestamp: 1000 }, { now: 1000 }).state;
  const parked = M.accept(st, { lng: 139.7001, lat: 35.60, accuracy: 5, speed: 0, heading: 270, timestamp: 2000 }, { now: 2000 });
  assert.equal(parked.accepted, true);
  assert.ok(Math.abs(M.angleDiff(90, parked.fix.heading)) < 20,
    `a 270° reading at a standstill must not turn the puck around, got ${parked.fix.heading}`);
});

/* ══ ⑧ THE STATE MACHINE IS A TABLE, AND THE TABLE IS THE TRUTH (§7) ═════════════════════════ */
test('R347 ⑧ every state is reachable, every illegal move throws, and the table is enumerable', () => {
  const w = navKit(); const S = w.IntMapNavStore;
  const states = S.STATES;
  assert.equal(states.length, 10, '§7 names ten states');
  for (const s of states) assert.ok(S.TRANSITIONS[s], `${s} has a row`);
  for (const [from, tos] of Object.entries(S.TRANSITIONS)) {
    for (const to of tos) assert.ok(states.includes(to), `${from} → ${to} names a real state`);
  }
  /* reachability: every state but idle is the target of some row */
  for (const s of states) {
    if (s === 'idle') continue;
    assert.ok(Object.values(S.TRANSITIONS).some((r) => r.includes(s)), `${s} is reachable`);
  }
  assert.equal(S.can('arrived', 'enroute'), false, 'arriving again after arrival is a leg change, not a jump');
  assert.equal(S.can('idle', 'enroute'), false, 'you cannot navigate before you have a location');
  S.to('acquiring_location');
  assert.throws(() => S.to('arrived'), /illegal transition/, 'the machine refuses, it does not shrug');
  assert.equal(S.to('acquiring_location'), false, 'a move to the state already held is a no-op, not an error');
});

test('R347 ⑨ the reroute generation drops a reply that a newer reroute has superseded', () => {
  const w = navKit(); const S = w.IntMapNavStore;
  S.reset();
  const a = S.beginReroute();
  const b = S.beginReroute();
  assert.notEqual(a, b);
  assert.equal(S.acceptReroute(a), false, 'the older reply is not allowed to draw');
  assert.equal(S.acceptReroute(b), true);
});

/* ══ ⑩ PROGRESS COMES FROM THE ROUTER'S OWN STEP DURATIONS (§10) ═════════════════════════════ */
test('R347 ⑩ remaining time is the tail of the step list, not distance × average speed', () => {
  const w = navKit(); const G = w.IntMapNavGuide, M = w.IntMapNavMatch;
  /* two halves of EQUAL length and very unequal duration: a motorway then a city street */
  const coords = ell();
  const r = routeOf(w, coords, [60, 600]);
  assert.equal(r.steps.length, 2);
  const half = r.distance / 2;
  const at = M.pointAt(r.idx, half * 0.5);            /* a quarter of the way: inside the fast step */
  const m = M.project(r.idx, at[0], at[1], { accuracy: 5 });
  const p = G.progress(r, m, {});
  const proportional = (1 - p.routeProgress) * (60 + 600);
  /* a quarter of the way along a route whose SECOND half is ten times slower, the time remaining is
     LARGER than the distance ratio — 30 s of the fast step plus the whole 600 s slow one. A
     distance-proportional estimate would promise 495 s and be 135 s optimistic. */
  assert.ok(p.remainingDuration > proportional * 1.15,
    `time-remaining must come from the step durations, not the distance ratio ` +
    `(${p.remainingDuration.toFixed(0)} s vs the proportional ${proportional.toFixed(0)} s)`);
  assert.ok(p.remainingDuration > 600, 'the whole slow step is still ahead');
  assert.ok(p.remainingDuration < 660, 'and part of the fast one is already behind');
});

test('R347 ⑪ lanes are shown only near the maneuver, and only when the provider gave them', () => {
  const w = navKit(); const G = w.IntMapNavGuide;
  const withLanes = G.lanesOf({ intersections: [{ lanes: [{ valid: true, indications: ['straight'] }, { valid: false, indications: ['right'] }] }] });
  assert.equal(withLanes.length, 2);
  assert.deepEqual(withLanes[0].indications, ['straight']);
  assert.equal(G.lanesOf({ intersections: [{}] }), null, 'no lanes in the reply means no lane display');
  assert.equal(G.lanesOf({}), null);
  assert.equal(G.lanesOf(null), null);
});

/* ══ ⑫ OFF-ROUTE (§14, §52) ══════════════════════════════════════════════════════════════════ */
test('R347 ⑫ one bad fix does not reroute, a sustained departure does, and standing still never does', () => {
  const w = navKit(); const G = w.IntMapNavGuide;
  const far = { crossTrackDistance: 300, confidence: 0.0000001 };
  const moving = { speed: 14, accuracy: 5 };

  const one = G.offRouteVote(far, moving, { streak: 0, since: 0 }, { mode: 'driving', now: 0 });
  assert.equal(one.off, false, 'the first bad fix is a candidate, not a verdict');
  assert.equal(one.candidate, true);

  let carry = one;
  let v = null;
  for (let t = 1000; t <= 8000; t += 1000) {
    v = G.offRouteVote(far, moving, carry, { mode: 'driving', now: t });
    carry = v;
  }
  assert.equal(v.off, true, 'held for eight seconds and four fixes, it is a departure');

  const parked = G.offRouteVote(far, { speed: 0.2, accuracy: 5 }, carry, { mode: 'driving', now: 9000 });
  assert.equal(parked.off, false, 'a parked receiver wanders — it has not left the route');
  assert.equal(parked.reason, 'stationary');
});

test('R347 ⑬ a 100 m-accuracy fix 60 m off the line is not a departure, a 4 m one is', () => {
  const w = navKit(); const G = w.IntMapNavGuide, M = w.IntMapNavMatch;
  const idx = M.build(ell());
  const on = M.pointAt(idx, idx.total * 0.25);
  const shift = 60 / (Math.cos(35.6 * Math.PI / 180) * 111320);   /* 60 m east, in degrees */
  const vague = M.project(idx, on[0], on[1] + 60 / 111320, { accuracy: 100 });
  const sharp = M.project(idx, on[0], on[1] + 60 / 111320, { accuracy: 4 });
  const opts = { mode: 'driving', now: 0 };
  const moving = { speed: 14, accuracy: 100 };
  assert.equal(G.offRouteVote(vague, moving, { streak: 5, since: -60000 }, opts).off, false,
    'the fix cannot tell us apart from the road — that is not evidence of leaving it');
  assert.equal(G.offRouteVote(sharp, { speed: 14, accuracy: 4 }, { streak: 5, since: -60000 }, opts).off, true,
    'a sharp fix 60 m off a road IS evidence');
  assert.ok(shift > 0);
});

/* ══ ⑭ ARRIVAL (§17) ═════════════════════════════════════════════════════════════════════════ */
test('R347 ⑭ arrival needs the end of the route, the destination, a low speed AND persistence', () => {
  const w = navKit(); const G = w.IntMapNavGuide;
  const route = { distance: 10000 };
  const dest = { lng: 139.70, lat: 35.60 };
  const near = { remainingDistance: 10, routeProgress: 0.999 };
  const atDest = { lng: 139.70, lat: 35.60, speed: 0.5, accuracy: 5 };

  const fast = G.arrivalVote(route, near, { ...atDest, speed: 25 }, dest, { hold: 0 }, { mode: 'driving' });
  assert.equal(fast.arrived, false, 'passing the pin at 90 km/h is not arriving');

  let hold = { hold: 0 }, out = null;
  for (let i = 0; i < 2; i++) { out = G.arrivalVote(route, near, atDest, dest, hold, { mode: 'driving' }); hold = out; }
  assert.equal(out.arrived, true, 'stopped at the destination for two fixes is arriving');

  const midRoute = G.arrivalVote(route, { remainingDistance: 5000, routeProgress: 0.5 }, atDest, dest, { hold: 0 }, { mode: 'driving' });
  assert.equal(midRoute.arrived, false, 'being near the destination halfway round a loop is not arriving');
  assert.equal(midRoute.arriving, false);
});

/* ══ ⑮ VOICE CUES (§13, §52) ═════════════════════════════════════════════════════════════════ */
test('R347 ⑮ each cue fires once per step, and its distance scales with speed', () => {
  const w = navKit(); const G = w.IntMapNavGuide;
  const step = { along: 0, end: 3000 };
  const spoken = new Set();
  const has = (k) => spoken.has(k);

  const city = G.dueCue(0, step, 700, 8, has);       /* 8 m/s → the 700 m floor governs */
  assert.equal(city.tier, 'far');
  assert.ok(Math.abs(city.at - 700) < 1, `floor applies at low speed, got ${city.at}`);
  spoken.add(city.key);
  /* ⚠ THE NEXT TIER IS NOT DUE THE INSTANT THE LAST ONE FIRED. Ten metres later nothing is said —
     «soon» waits until 200 m. A cue-per-tick design would announce four times in four seconds. */
  assert.equal(G.dueCue(0, step, 690, 8, has), null, 'the same tier does not fire twice, and the next is not due');
  assert.equal(G.dueCue(0, step, 200, 8, has).tier, 'soon', 'and «soon» arrives at its own distance');

  const fast = G.dueCue(1, step, 1500, 30, () => false);   /* 30 m/s → 55 s lead = 1650 m */
  assert.equal(fast.tier, 'far');
  assert.ok(fast.at > 1600, `at motorway speed the far cue moves out, got ${fast.at}`);

  /* ══ A SHORT STEP GETS SHORT-STEP CUES ═══════════════════════════════════════════════════════
     A 120 m step never announces «in 700 metres» and never announces «in 200 metres» — both would
     land before the previous maneuver was passed. The tiers whose own scale exceeds the step are
     skipped entirely, so the first thing said is «near», at 80 m, and the last is «now», at 24 m. */
  const shortStep = { along: 0, end: 120 };
  const shortSpoken = new Set();
  const shortHas = (k) => shortSpoken.has(k);
  assert.equal(G.dueCue(2, shortStep, 100, 8, shortHas), null, 'nothing is due 100 m out on a 120 m step');
  const first = G.dueCue(2, shortStep, 80, 8, shortHas);
  assert.equal(first.tier, 'near', 'the far and soon tiers are skipped, not compressed');
  shortSpoken.add(first.key);
  const last = G.dueCue(2, shortStep, 20, 8, shortHas);
  assert.equal(last.tier, 'now', 'and the final call still arrives');
  assert.ok(last.at <= shortStep.end, 'a cue can never trigger before its own step began');
});

/* ══ ⑯ THE PROVIDER REGISTRY (§3) ════════════════════════════════════════════════════════════ */
test('R347 ⑯ every provider answers every capability question — silence is not «no»', () => {
  const w = provKit(); const P = w.IntMapRouteProviders;
  const vocab = P.VOCAB_KEYS;
  assert.ok(vocab.length >= 38, `§3 lists a long vocabulary, got ${vocab.length}`);
  for (const p of P.list()) {
    for (const k of vocab) {
      assert.ok(Object.prototype.hasOwnProperty.call(p.caps, k), `${p.id} does not answer «${k}»`);
      const t = P.VOCAB[k];
      assert.equal(typeof p.caps[k], t === 'n' ? 'number' : 'boolean', `${p.id}.${k} has the wrong kind`);
    }
    /* ⚠ EVERY KEY IS A FACT, NOT A FUNCTION. #R323 shipped a table where a function-valued key made
       `can()` permanently true; the type assertion above is what stops that recurring here. */
    assert.ok(['measured', 'documented'].includes(p.evidence), `${p.id} must say how we know`);
  }
});

test('R347 ⑰ a keyed provider is never offered until a probe says its key is configured', () => {
  const w = provKit(); const P = w.IntMapRouteProviders;
  const keyed = P.list().filter((p) => p.keyed);
  assert.ok(keyed.length >= 1, 'the traffic provider is behind a key');
  for (const p of keyed) {
    assert.equal(P.availability(p.id), null, 'unknown until asked');
    assert.equal(P.available(p.id), false, 'unknown is NOT available');
  }
  assert.equal(P.supports('driving', 'traffic'), false, 'so nothing offers traffic yet');
  /* …and the moment the relay answers yes, it is offered — the same table, no second switch */
  P.setAvailable('mapbox', true);
  assert.equal(P.supports('driving', 'traffic'), true);
  assert.equal(P.forRequest({ mode: 'driving' }).provider.id, 'mapbox');
  P.setAvailable('mapbox', false);
  assert.equal(P.supports('driving', 'traffic'), false);
  assert.equal(P.forRequest({ mode: 'driving' }).provider.id, 'osrm', 'and it falls back cleanly');
});

test('R347 ⑱ the fallback chain says what each step down costs (§43)', () => {
  const w = provKit(); const P = w.IntMapRouteProviders;
  P.setAvailable('mapbox', true);
  const r = P.forRequest({ mode: 'driving' });
  assert.ok(r.chain.length >= 2, 'an outage must not take routing off the air');
  const lost = r.degrades[r.chain[1].id];
  assert.ok(lost.includes('traffic'), `dropping to ${r.chain[1].id} loses traffic and must say so`);
  P.setAvailable('mapbox', null);
});

test('R347 ⑲ a provider whose terms forbid it is not allowed to feed the AI or be cached', () => {
  const w = provKit(); const P = w.IntMapRouteProviders;
  const mb = P.byId('mapbox');
  assert.equal(P.allowsAI('mapbox'), false, 'Mapbox Product Terms §1.5(ii)');
  assert.equal(P.noStore('mapbox'), true, 'Mapbox Product Terms §2.10.1');
  assert.equal(P.allowsAI('osrm'), true, 'the open routers carry no such term');
  assert.equal(P.noStore('osrm'), false);
  assert.ok(mb.logoRequired, 'Mapbox Product Terms §1.4.1');
  /* ⚠ AND THE CODE MUST HONOUR IT, NOT MERELY DECLARE IT. */
  const traffic = bare('js/routing-traffic.js');
  assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(traffic),
    'a provider marked noStore may not be persisted anywhere');
});

test('R347 ⑳ FOSSGIS’s attribution requirement is carried by the table that names its servers', () => {
  const w = provKit(); const P = w.IntMapRouteProviders;
  /* the servers this app really calls */
  const fossgis = P.list().filter((p) => JSON.stringify(p.host || {}).includes('openstreetmap.de'));
  assert.ok(fossgis.length >= 1, 'walking, cycling and every avoid request go to FOSSGIS');
  for (const p of fossgis) {
    assert.equal(P.needsFixMap(p.id), true, `${p.id} must carry the fixthemap link FOSSGIS requires`);
    assert.ok(P.terms(p.id).url, `${p.id} must carry a licence link`);
  }
});

/* ══ ㉑ THE ERROR TAXONOMY (§44) ══════════════════════════════════════════════════════════════ */
test('R347 ㉑ every code the spec names exists, and each carries a decision rather than a sentence', () => {
  const w = provKit(); const E = w.IntMapRouteErrors;
  const required = ['NO_ROUTE', 'NO_LOCATION', 'LOCATION_DENIED', 'LOCATION_UNAVAILABLE', 'PROVIDER_TIMEOUT',
    'PROVIDER_RATE_LIMIT', 'PROVIDER_UNAVAILABLE', 'OUT_OF_COVERAGE', 'INVALID_REQUEST',
    'TRAFFIC_UNAVAILABLE', 'TRANSIT_UNAVAILABLE', 'OFFLINE', 'REROUTE_FAILED'];
  for (const c of required) assert.ok(E.is(c), `§44 names ${c}`);
  /* the three properties the orchestrator branches on */
  assert.equal(E.canRetry('NO_ROUTE'), false, 'asking again for a route that does not exist is pointless');
  assert.equal(E.canFallback('NO_ROUTE'), true, 'but another router may know one');
  assert.equal(E.canFallback('LOCATION_DENIED'), false, 'no provider can grant a permission');
  assert.equal(E.isUserFixable('LOCATION_DENIED'), true);
  /* geolocation errors arrive as numeric codes, not strings */
  assert.equal(E.classify({ code: 1, message: 'User denied Geolocation' }), 'LOCATION_DENIED');
  assert.equal(E.classify({ code: 2 }), 'LOCATION_UNAVAILABLE');
  assert.equal(E.classify({ name: 'AbortError' }), 'CANCELLED');
  assert.equal(E.fromHTTP(429), 'PROVIDER_RATE_LIMIT');
  assert.equal(E.fromHTTP(503), 'PROVIDER_UNAVAILABLE');
  /* the legacy spellings the router already produced are still classified */
  assert.equal(E.classify('no_transit'), 'TRANSIT_UNAVAILABLE');
  assert.equal(E.classify('provider_unavailable'), 'PROVIDER_UNAVAILABLE');
  assert.ok(E.message('NO_ROUTE').length > 5, 'and each has a sentence for the reader');
});

/* ══ ㉒ TWO LISTS THAT MUST AGREE — the defect this round found (§0) ══════════════════════════ */
test('R347 ㉒ every capability’s lazyModules names a module IntMapLazy actually has', () => {
  const caps = read('js/atlas-capabilities.js');
  const lazy = read('js/lazy-modules.js');
  /* the module ids IntMapLazy knows are the keys of PUBLISHES — read from the source, since this
     check exists precisely because a name can be written that nothing answers to. */
  /* ⚠ COMMENTS FIRST. The block carries paragraphs of prose containing colons, and a name-scan over
     the raw text picks words out of them (it found «reason» on the first run). This is the same trap
     this file's own header warns about, met from the other side. */
  const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:'"\\`])\/\/.*$/, '$1')).join('\n');
  const pubBlock = noComments(lazy.slice(lazy.indexOf('const PUBLISHES'), lazy.indexOf('function record(')));
  /* …and several names share a line, so the scan must be over the whole block, not per line */
  const known = new Set([...pubBlock.matchAll(/([A-Za-z0-9_]+)\s*:\s*'/g)].map((m) => m[1]));
  assert.ok(known.size >= 20, `expected the lazy registry, found ${known.size}: ${[...known].join(',')}`);
  assert.ok(known.has('routeUi') && known.has('navigation'), 'the routing and navigation modules are in it');

  /* every capability row's last column is its lazy module (or '') */
  const rows = [...caps.matchAll(/^\s*\['[a-zA-Z0-9_.]+',[^\n]*?'([a-zA-Z0-9_]*)'\],\s*$/gm)];
  assert.ok(rows.length > 100, `expected the capability table, matched ${rows.length} rows`);
  const bad = rows.map((m) => m[1]).filter((n) => n && !known.has(n));
  assert.deepEqual(bad, [],
    `these capabilities name a lazy module that does not exist — IntMapLazy.need() would record a ` +
    `failure and the capability would never load: ${bad.join(', ')}`);
});

/* ══ ㉓ NAVIGATION USES THE WALL CLOCK, NOT CHRONOS (§33) ═════════════════════════════════════ */
test('R347 ㉓ nothing in navigation reads the history clock', () => {
  const files = ['js/navigation.js', 'js/navigation-store.js', 'js/navigation-match.js',
    'js/navigation-guidance.js', 'js/navigation-camera.js', 'js/navigation-voice.js', 'js/navigation-sim.js'];
  for (const f of files) {
    const src = bare(f);
    assert.ok(!/IntMapTime/.test(src),
      `${f} names IntMapTime — a reader who set the map to 1950 is still driving home today (§33)`);
  }
  /* …and the file that DOES own the distinction says both halves out loud */
  const clock = read('js/routing-time.js');
  assert.ok(/planningNow/.test(clock) && /navNow/.test(clock), 'both clocks are named');
  const w = load(makeWindow(), 'js/routing-time.js');
  assert.equal(typeof w.IntMapRouteClock.navNow(), 'number');
  assert.equal(w.IntMapRouteClock.isHistorical(), false, 'with no Chronos present, the wall clock stands');
});

/* ══ ㉔ THE MAP IS REACHED THROUGH THE ENGINE, ON BOTH RENDERERS (§48) ════════════════════════ */
test('R347 ㉔ no navigation file touches a raw renderer handle', () => {
  const files = ['js/navigation.js', 'js/navigation-camera.js', 'js/navigation-ui.js', 'js/navigation-sim.js'];
  for (const f of files) {
    const src = bare(f);
    assert.ok(!/\bnew\s+maplibregl\b|\bmaplibregl\./.test(src), `${f} names MapLibre directly`);
    assert.ok(!/\bCesium\./.test(src), `${f} names Cesium directly`);
    assert.ok(!/GE\(\)\.raw\(\)/.test(src), `${f} reaches past the engine facade`);
  }
});

/* ══ ㉕ A POSITION LEAVES THE DEVICE ONLY TO ASK FOR A ROUTE (§39) ════════════════════════════ */
test('R347 ㉕ the tick computes locally — no fetch on the GPS path', () => {
  const src = bare('js/navigation.js');
  const tick = src.slice(src.indexOf('function onFix('), src.indexOf('function nameOf('));
  assert.ok(tick.length > 500, 'found the tick');
  assert.ok(!/\bfetch\s*\(/.test(tick), 'the per-fix path must not call the network');
  assert.ok(!/XMLHttpRequest|sendBeacon/.test(tick));
  /* the ONE place a position is sent is the reroute, and it is counted rather than described */
  assert.ok(/_sentPositions\+\+/.test(src), 'departures are counted so a test can assert the number');
  const sends = (src.match(/_sentPositions\+\+/g) || []).length;
  assert.ok(sends <= 2, `a position may leave only to ask for a route, found ${sends} sites`);
});

/* ══ ㉖ THE RELAY OBEYS THE PROVIDER'S OWN TERMS ══════════════════════════════════════════════ */
test('R347 ㉖ the routing relay never caches, and never lets a caller inject a token', () => {
  const relay = read('supabase/functions/routing-relay/index.ts');
  /* ⚠ READ THE CODE, NOT THE NOTE THAT EXPLAINS THE CODE. The first run of this check failed on the
     relay's own header, which says «every other relay answers with s-maxage… this one must not» —
     the sentence asserting the property tripped the check for the property. */
  const bareRelay = relay.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/(^|[^:'"\\`])\/\/.*$/, '$1')).join('\n');
  assert.ok(/no-store/.test(bareRelay), 'Mapbox §2.10.1 forbids caching Navigation API results');
  assert.ok(!/s-maxage/.test(bareRelay), 'every other relay in this repo sets s-maxage; this one must not');
  assert.ok(/MAPBOX_TOKEN/.test(bareRelay), 'the key is read from the environment');
  assert.ok(/Deno\.env\.get/.test(bareRelay), 'and only from there');
  assert.ok(!/searchParams\.get\(\s*['"]access_token['"]\s*\)/.test(bareRelay) || /delete/.test(bareRelay),
    'a caller-supplied access_token must be dropped, never forwarded');
  /* config.toml must declare it, or `supabase functions deploy` and doc-facts both go wrong */
  const cfg = read('supabase/config.toml');
  assert.ok(/\[functions\.routing-relay\]/.test(cfg), 'the function is declared');
});

/* ══ ㉗ THE ADAPTER IS REACHABLE — the failure this check exists for was REAL ═════════════════ */
test('R347 ㉗ the traffic probe is actually called, and the table decides who answers', () => {
  /* ⚠ WRITTEN BECAUSE IT WAS NOT. js/routing-traffic.js defined `probe()`, js/routing-providers.js
     defined `available()`, the relay was deployed-ready and the capability table was complete — and
     `probe()` had NO CALLER anywhere in js/. `available('mapbox')` would have stayed `null` for ever,
     so the traffic provider could never activate even with the key set: a whole subsystem that
     parses, tests green, and can never run (this project's most expensive recurring defect). */
  const src = bare('js/routing.js');
  assert.match(src, /IntMapRouteTraffic/, 'js/routing.js must reach the traffic adapter');
  assert.match(src, /\.probe\s*\(/, 'and it must actually call probe()');
  assert.match(src, /forRequest\s*\(/, 'provider selection goes through the capability table');

  /* the probe must NOT be at import time — §45: a session that never routes pays nothing */
  const iife = src.slice(0, src.indexOf('async function route('));
  assert.ok(!/\.probe\s*\(/.test(iife) || /_probed/.test(iife),
    'the probe belongs on the first route request, not on module load');

  /* …and a lost capability must reach the reader, not just the object (§43) */
  assert.match(src, /trafficDropped/, 'a dropped traffic provider is recorded on the reply');
  const cards = read('js/routing-cards.js');
  assert.match(cards, /trafficDropped:\s*L\(/, 'and it has a sentence, in the same place every other note does');
});

/* ══ ㉘ NOT IN THE BOOT BUNDLE — read from the import graph, not from a second browser boot ═════ */
test('R347 ㋕ nothing eager imports the navigation subsystem or the traffic adapter', () => {
  /* ⚠ THIS MOVED HERE FROM tests/r347-navigation.spec.js ①, WHICH PAID FOR A WHOLE EXTRA PAGE BOOT
     to learn it. The fact is a property of the import graph, so a browser cannot know it better than
     the source does — and tests/durations.json prices the suite at exactly its ceiling, which means
     a round that adds browser time has to take browser time out. This is the take-out.

     ⚠⚠ AND IT COMPARES SUBSTRINGS, NOT REGULAR EXPRESSIONS, BECAUSE THE FIRST VERSION WAS VACUOUS.
     It built its pattern inside a TEMPLATE LITERAL, where a backslash-s is a STRING escape and not a
     regex one — JavaScript resolved it to a plain `s`, so the pattern that reached RegExp began
     `imports+` and could never match a real import line. `!test(entry)` was therefore true whatever
     src/main.js contained: a green check that had never checked anything, which is this project's
     most expensive recurring defect. CodeQL's «useless regular-expression character escape» found
     it; nothing in the suite would have. An import specifier is an exact string, so comparing it as
     one removes the whole class of error — and the assertion below proves a red is still reachable. */
  const entry = bare('src/main.js');
  const NAV = ['navigation', 'navigation-store', 'navigation-match', 'navigation-guidance',
    'navigation-camera', 'navigation-voice', 'navigation-sim', 'navigation-ui', 'routing-traffic'];
  for (const f of NAV) {
    assert.ok(!entry.includes(`'../js/${f}.js'`),
      `src/main.js statically imports js/${f}.js — it would be in the boot bundle`);
  }
  /* ⚠ THE LOOP ABOVE IS NOT VACUOUS — the same comparison finds a module that really IS eager.
     Without this line it would pass just as happily against an empty file, which is exactly how the
     version it replaced passed. */
  assert.ok(entry.includes(`'../js/routing.js'`),
    'the same comparison finds an eager import when there is one — so a red is reachable');

  /* the ONE file that may reach them does so dynamically, through the loader */
  const lazy = bare('js/lazy-modules.js');
  assert.ok(lazy.includes("import('./navigation.js')"), 'the loader fetches navigation dynamically');
  assert.ok(lazy.includes("import('./routing-traffic.js')"), 'and the traffic adapter too');

  /* js/navigation.js is the only static importer of the other seven — that is what makes one chunk */
  const nav = bare('js/navigation.js');
  for (const f of NAV.filter((n) => n !== 'navigation' && n !== 'routing-traffic')) {
    assert.ok(nav.includes(`import './${f}.js';`), `js/navigation.js pulls ${f} into its chunk`);
  }
});
