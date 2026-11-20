/* ============================================================================
 *  IntMap · js/transit-raptor.js — TIMETABLE-BASED TRIP PLANNING AND REACHABILITY (RAPTOR)
 * ----------------------------------------------------------------------------
 *  Plans over the bundles scripts/build-transit-timetables.mjs writes (data/transit-<id>.json): the
 *  PUBLISHER'S timetable, exact for every date in the bundle's window. Pure — no DOM, no network —
 *  so tests/transit-timetable-checks.test.mjs runs the same code the browser does.
 *
 *  Algorithm: round-based earliest-arrival search (Delling, Pajor, Werneck, «Round-Based Public
 *  Transit Routing», 2012). Round k = the best arrival using at most k vehicle rides, so the answer
 *  is naturally the set of Pareto-best journeys by (arrival, rides) — the transfers a rider feels.
 *
 *  ══ WHAT IS EXACT AND WHAT IS ESTIMATED — every result says which ══════════════════════════════
 *   exact      the vehicle legs: stops, trips, times (to the minute the bundle stores).
 *   estimated  every on-foot / on-bike piece: first and last mile and the transfers between stops.
 *              Straight-line distance × a detour factor ÷ a speed, NOT a street route (that needs a
 *              street graph; Valhalla can refine one leg and the UI offers it). The estimate is
 *              labelled `estimated: true` on the leg and `walkModel` on the result.
 *   scheduled  `basis: 'scheduled'` on every plan. No bundle carries real-time data today, so no plan
 *              claims delays, cancellations or live departures (see planBasis()).
 *
 *  ⚠ A DATE OUTSIDE THE BUNDLE'S WINDOW IS REFUSED (`coverage()`), never answered from the nearest
 *  weekday: a Christmas Day or a strike the timetable states differently would be a wrong answer
 *  presented as a plan.
 * ==========================================================================*/

const DAY = 86400;
const WALK = Object.freeze({ speedMps: 1.25, detour: 1.3, maxAccessM: 1200, maxTransferM: 300, minTransferS: 60 });
const BIKE = Object.freeze({ speedMps: 4.2, detour: 1.25, maxAccessM: 4000, maxTransferM: 300, minTransferS: 120 });
export const MODELS = Object.freeze({ walk: WALK, bike: BIKE });
const INF = 1e12;

function hav(lng1, lat1, lng2, lat2) {
  const R = 6371008.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
export const distanceM = hav;

/** the bundle → an indexed network. Decoding is eager (a few ms per 100 k stop times). */
export function loadNetwork(b) {
  if (!b || b.v !== 1 || !Array.isArray(b.stops) || !Array.isArray(b.patterns)) throw new Error('not a transit bundle');
  const n = b.stops.length;
  const lng = new Float64Array(n), lat = new Float64Array(n), group = new Int32Array(n);
  b.stops.forEach((s, i) => { lat[i] = s[1] / 1e5; lng[i] = s[2] / 1e5; group[i] = s[3]; });
  const pats = b.patterns.map((p, pi) => {
    const len = p.s.length, nt = p.t.length;
    const arr = new Int32Array(nt * len), dep = new Int32Array(nt * len), mask = new Int32Array(nt);
    for (let t = 0; t < nt; t++) {
      const row = p.t[t]; mask[t] = parseInt(row[0], 16);
      let v = 0;
      for (let k = 0; k < 2 * len; k++) {
        v = k === 0 ? row[1] : v + row[1 + k];
        (k & 1 ? dep : arr)[t * len + (k >> 1)] = v * 60;
      }
    }
    return { id: pi, r: p.r, s: Int32Array.from(p.s), f: p.f ? Int32Array.from(p.f) : null, h: p.h || '', len, nt, arr, dep, mask };
  });
  const at = Array.from({ length: n }, () => []);   /* stop → [pattern, position] pairs */
  pats.forEach((p) => { for (let i = 0; i < p.len; i++) at[p.s[i]].push(p.id, i); });
  /* a coarse grid for «stops near a point» (cell ≈ 0.01° ≈ 1.1 km) */
  const CELL = 0.01, grid = new Map();
  for (let i = 0; i < n; i++) { if (lat[i] === 0 && lng[i] === 0) continue; const k = Math.floor(lng[i] / CELL) + ',' + Math.floor(lat[i] / CELL); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
  const net = { b, n, lng, lat, group, pats, at, grid, CELL, active: new Map(), foot: new Map() };
  return net;
}

/** the stops within `maxM` straight-line metres of a point, nearest first */
function stopsNear(net, x, y, maxM) {
  const out = [], cl = Math.max(0.2, Math.cos(y * Math.PI / 180));
  const dx = Math.ceil(maxM / (111320 * cl) / net.CELL), dy = Math.ceil(maxM / 111320 / net.CELL);
  const cx = Math.floor(x / net.CELL), cy = Math.floor(y / net.CELL);
  for (let i = -dx; i <= dx; i++) for (let j = -dy; j <= dy; j++) {
    const a = net.grid.get((cx + i) + ',' + (cy + j)); if (!a) continue;
    for (const s of a) { const d = hav(x, y, net.lng[s], net.lat[s]); if (d <= maxM) out.push({ stop: s, m: d }); }
  }
  return out.sort((p, q) => p.m - q.m);
}

/** is `date` (YYYY-MM-DD) inside the bundle's window? → { covered, index, start, end } */
export function coverage(net, date) {
  const w = net.b.window, s = Date.parse(w.start + 'T00:00:00Z'), d = Date.parse(date + 'T00:00:00Z');
  const end = new Date(s + (w.days - 1) * 864e5).toISOString().slice(0, 10);
  const index = Math.round((d - s) / 864e5);
  return { covered: Number.isFinite(index) && index >= 0 && index < w.days, index, start: w.start, end };
}

/** what a plan over this bundle may claim about live data — the single place that says «scheduled» */
export function planBasis(net) {
  const rt = net.b.realtime || null;
  return rt ? { basis: 'scheduled+realtime', realtime: true, realtimeSource: rt }
    : { basis: 'scheduled', realtime: false, realtimeSource: null };
}

/* trips of a pattern running on window day `di`, each with the offset that puts its times on that
   day's clock: day di as-is; day di-1 shifted −24 h (a night trip still running after midnight);
   day di+1 shifted +24 h (so a late departure sees the first trains of tomorrow). Sorted by the
   departure at the first stop. Cached per day. */
function activeTrips(net, di) {
  let c = net.active.get(di); if (c) return c;
  c = net.pats.map((p) => {
    const l = [];
    for (let t = 0; t < p.nt; t++) {
      const m = p.mask[t];
      if ((m >> di) & 1) l.push([t, 0]);
      if (di > 0 && ((m >> (di - 1)) & 1) && p.arr[t * p.len + p.len - 1] >= DAY) l.push([t, -DAY]);
      if (di + 1 < net.b.window.days && ((m >> (di + 1)) & 1)) l.push([t, DAY]);
    }
    l.sort((a, b) => (p.dep[a[0] * p.len] + a[1]) - (p.dep[b[0] * p.len] + b[1]));
    return l;
  });
  net.active.set(di, c); return c;
}

function footLinks(net, s, model) {
  const key = s + (model === BIKE ? 'b' : 'w'); let c = net.foot.get(key); if (c) return c;
  c = [];
  for (const o of stopsNear(net, net.lng[s], net.lat[s], model.maxTransferM)) {
    if (o.stop === s) continue;
    c.push([o.stop, Math.max(model.minTransferS, Math.round(o.m * model.detour / model.speedMps))]);
  }
  /* the stops of one station are one place: a parent-station group transfers at the minimum time */
  if (net.group[s] >= 0) for (let o = 0; o < net.n; o++) { /* bounded below by the proximity set above for real feeds; the group scan is only run for tiny feeds */ if (net.n > 20000) break; if (o !== s && net.group[o] === net.group[s] && !c.some((x) => x[0] === o)) c.push([o, model.minTransferS]); }
  net.foot.set(key, c); return c;
}

/* ── the search ──────────────────────────────────────────────────────────────────────────────── */
function search(net, di, access, departS, opt) {
  const K = opt.maxRides || 6, model = opt.model || WALK, cutoff = opt.cutoff == null ? INF : opt.cutoff;
  const act = activeTrips(net, di), n = net.n;
  const best = new Float64Array(n).fill(INF);
  const rounds = [];                               /* rounds[k] = { arr: Float64Array, how: [] } */
  let r0 = new Float64Array(n).fill(INF); const how0 = new Array(n).fill(null);
  let marked = new Set();
  for (const a of access) { const t = departS + a.sec; if (t < r0[a.stop] && t <= cutoff) { r0[a.stop] = t; best[a.stop] = t; how0[a.stop] = { kind: 'access', m: a.m, sec: a.sec }; marked.add(a.stop); } }
  rounds.push({ arr: r0, how: how0 });
  let target = opt.targetBest || null;
  for (let k = 1; k <= K && marked.size; k++) {
    const prev = rounds[k - 1].arr, arr = new Float64Array(n).fill(INF), how = new Array(n).fill(null);
    const Q = new Map();
    for (const s of marked) { const pr = net.at[s]; for (let q = 0; q < pr.length; q += 2) { const p = pr[q], pos = pr[q + 1]; const e = Q.get(p); if (e === undefined || pos < e) Q.set(p, pos); } }
    const newMarked = new Set();
    for (const [pid, pos] of Q) {
      const p = net.pats[pid], list = act[pid]; if (!list.length) continue;
      let cur = -1, off = 0, boardAt = -1;
      for (let i = pos; i < p.len; i++) {
        const s = p.s[i];
        if (cur >= 0 && !(p.f && (p.f[i] & 2))) {
          const t = p.arr[cur * p.len + i] + off;
          if (t < best[s] && t < (target ? target() : INF) && t <= cutoff) { arr[s] = t; best[s] = t; how[s] = { kind: 'ride', pat: pid, trip: cur, off, from: boardAt, to: i, fromStop: p.s[boardAt] }; newMarked.add(s); }
        }
        const ready = prev[s];
        if (ready < INF && !(p.f && (p.f[i] & 1)) && (cur < 0 || ready <= p.dep[cur * p.len + i] + off)) {
          /* earliest trip leaving this stop at or after `ready` (first stop in a ride never needs a slack: the transfer time is already in `ready`) */
          let lo = 0, hi = list.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (p.dep[list[mid][0] * p.len + i] + list[mid][1] < ready) lo = mid + 1; else hi = mid; }
          let j = lo; while (j > 0 && p.dep[list[j - 1][0] * p.len + i] + list[j - 1][1] >= ready) j--;
          if (j < list.length) { const [tr, o] = list[j]; if (cur < 0 || p.dep[tr * p.len + i] + o < p.dep[cur * p.len + i] + off) { cur = tr; off = o; boardAt = i; } }
        }
      }
    }
    /* foot transfers from everything improved this round */
    for (const s of [...newMarked]) {
      for (const [o, sec] of footLinks(net, s, model)) {
        const t = arr[s] + sec;
        if (t < best[o] && t <= cutoff && t < (target ? target() : INF)) { arr[o] = t; best[o] = t; how[o] = { kind: 'foot', fromStop: s, sec }; newMarked.add(o); }
      }
    }
    rounds.push({ arr, how }); marked = newMarked;
    if (opt.onRound) opt.onRound(k, arr);
  }
  return rounds;
}

function accessList(net, p, model, maxM) {
  return stopsNear(net, p.lng, p.lat, Math.min(maxM || model.maxAccessM, model.maxAccessM)).map((o) => ({ stop: o.stop, m: o.m, sec: Math.round(o.m * model.detour / model.speedMps) }));
}

function legsOf(net, rounds, k, stop, access) {
  const legs = []; let s = stop, kk = k;
  for (let guard = 0; guard < 200; guard++) {
    const h = rounds[kk].how[s]; if (!h) break;
    if (h.kind === 'access') break;
    if (h.kind === 'foot') { legs.unshift({ type: 'transfer', fromStop: h.fromStop, toStop: s, sec: h.sec, estimated: true }); s = h.fromStop; continue; }
    const p = net.pats[h.pat];
    legs.unshift({ type: 'ride', pattern: h.pat, route: p.r, headsign: p.h, fromStop: h.fromStop, toStop: s, depart: p.dep[h.trip * p.len + h.from] + h.off, arrive: p.arr[h.trip * p.len + h.to] + h.off,
      stops: Array.from(p.s.subarray(h.from, h.to + 1)), times: Array.from({ length: h.to - h.from + 1 }, (_, q) => p.arr[h.trip * p.len + h.from + q] + h.off) });
    s = h.fromStop; kk--;
    if (kk < 0) break;
  }
  return { legs, firstStop: s };
}

/** the Pareto-best journeys between two points: [{ arrive, rides, transfers, legs[] }] */
export function plan(net, q) {
  const model = MODELS[q.mode || 'walk'] || WALK;
  const cov = coverage(net, q.date);
  if (!cov.covered) return { ok: false, reason: 'date-outside-window', window: { start: cov.start, end: cov.end }, ...planBasis(net) };
  const departS = q.depart | 0;
  const acc = accessList(net, q.from, model, q.maxWalkM), egr = accessList(net, q.to, model, q.maxWalkM);
  if (!acc.length || !egr.length) return { ok: false, reason: acc.length ? 'no-stop-near-destination' : 'no-stop-near-origin', ...planBasis(net) };
  const egrSec = new Map(egr.map((e) => [e.stop, e])); let bestDest = INF;
  const rounds = search(net, cov.index, acc, departS, { model, maxRides: q.maxRides || 6, cutoff: departS + (q.maxDurationS || 8 * 3600),
    targetBest: () => bestDest, onRound: (k, arr) => { for (const [s, e] of egrSec) if (arr[s] < INF) bestDest = Math.min(bestDest, arr[s] + e.sec); } });
  const journeys = []; let bestSoFar = INF;
  for (let k = 1; k < rounds.length; k++) {
    let bs = -1, bt = INF;
    for (const [s, e] of egrSec) { const t = rounds[k].arr[s]; if (t < INF && rounds[k].how[s] && t + e.sec < bt) { bt = t + e.sec; bs = s; } }
    if (bs < 0 || bt >= bestSoFar) continue;
    bestSoFar = bt;
    const { legs, firstStop } = legsOf(net, rounds, k, bs);
    const a = rounds[0].how[firstStop]; const e = egrSec.get(bs);
    if (!a) continue;
    const rideLegs = legs.filter((l) => l.type === 'ride');
    journeys.push({ rides: rideLegs.length, transfers: Math.max(0, rideLegs.length - 1), depart: departS, arrive: bt,
      durationS: bt - departS,
      legs: [{ type: 'access', toStop: firstStop, m: Math.round(a.m), sec: a.sec, estimated: true, mode: q.mode || 'walk' }, ...legs, { type: 'egress', fromStop: bs, m: Math.round(e.m), sec: e.sec, estimated: true, mode: q.mode || 'walk' }] });
  }
  /* the on-foot-only option, when the two points are close */
  const direct = hav(q.from.lng, q.from.lat, q.to.lng, q.to.lat);
  const directS = Math.round(direct * model.detour / model.speedMps);
  const out = { ok: journeys.length > 0, ...planBasis(net), walkModel: { speedMps: model.speedMps, detour: model.detour, kind: 'straight-line estimate' }, date: q.date, journeys, direct: { m: Math.round(direct), sec: directS, mode: q.mode || 'walk', estimated: true } };
  if (!journeys.length) out.reason = 'no-journey';
  return out;
}

/** every stop reachable within a budget, with the minutes it took and the radius still walkable from it */
export function reach(net, q) {
  const model = MODELS[q.mode || 'walk'] || WALK;
  const cov = coverage(net, q.date);
  if (!cov.covered) return { ok: false, reason: 'date-outside-window', window: { start: cov.start, end: cov.end }, ...planBasis(net) };
  const departS = q.depart | 0, budget = Math.max(60, (q.budgetMin || 30) * 60);
  const acc = accessList(net, q.origin, model, q.maxWalkM);
  const rounds = search(net, cov.index, acc, departS, { model, maxRides: q.maxRides || 6, cutoff: departS + budget });
  const bestT = new Float64Array(net.n).fill(INF), rideK = new Int32Array(net.n).fill(-1);
  rounds.forEach((r, k) => { for (let s = 0; s < net.n; s++) if (r.arr[s] < bestT[s]) { bestT[s] = r.arr[s]; rideK[s] = k; } });
  const maxWalk = Math.min(q.maxWalkM || model.maxAccessM, model.maxAccessM);
  const stops = [];
  for (let s = 0; s < net.n; s++) {
    if (bestT[s] >= INF) continue;
    const t = bestT[s] - departS, left = budget - t;
    const radius = Math.min(maxWalk, Math.max(0, left) * model.speedMps / model.detour);
    stops.push({ stop: s, name: net.b.stops[s][0], lng: net.lng[s], lat: net.lat[s], min: t / 60, rides: Math.max(0, rideK[s]), radiusM: Math.round(radius) });
  }
  const own = Math.min(maxWalk, budget * model.speedMps / model.detour);
  return { ok: stops.length > 0, ...planBasis(net), walkModel: { speedMps: model.speedMps, detour: model.detour, kind: 'straight-line estimate' }, date: q.date, budgetMin: budget / 60, origin: { lng: q.origin.lng, lat: q.origin.lat, walkRadiusM: Math.round(own) }, stops, reason: stops.length ? undefined : 'no-stop-near-origin' };
}

/** a regular polygon ring around a point (metres), closed */
export function circleRing(lng, lat, r, n) {
  const N = n || 20, cl = Math.cos(lat * Math.PI / 180) || 1e-6, ring = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * 2 * Math.PI; ring.push([+(lng + Math.cos(a) * r / (111320 * cl)).toFixed(6), +(lat + Math.sin(a) * r / 110574).toFixed(6)]); }
  ring.push(ring[0]); return ring;
}

/** nested reach bands: for each minute budget B ≤ the search budget, the circles that union into «reachable within B» */
export function bandCircles(res, bandMin, thin) {
  const model = MODELS[res.mode] || WALK;
  const cut = thin || 120, cells = new Map(); const out = [];
  const add = (lng, lat, r) => { if (r < 30) return; const k = Math.round(lng / (cut / 111320 / Math.max(0.2, Math.cos(lat * Math.PI / 180)))) + ',' + Math.round(lat / (cut / 110574)); const e = cells.get(k); if (!e || e.r < r) cells.set(k, { lng, lat, r }); };
  add(res.origin.lng, res.origin.lat, Math.min(res.origin.walkRadiusM, bandMin * 60 * model.speedMps / model.detour));
  const maxWalk = res.stops.length ? Math.max(...res.stops.map((s) => s.radiusM)) : 0;
  for (const s of res.stops) { const left = bandMin - s.min; if (left <= 0) continue; add(s.lng, s.lat, Math.min(Math.max(maxWalk, 0) || 1e9, left * 60 * model.speedMps / model.detour)); }
  cells.forEach((v) => out.push(v)); return out;
}
