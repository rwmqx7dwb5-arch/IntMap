/* ============================================================================
 *  IntMap · js/world-flows-core.js — WHO A COUNTRY IS CONNECTED TO: the facts, and nothing else   (wave4-mobility)
 * ----------------------------------------------------------------------------
 *  Three flows, each read from the record that states it, for one country, one direction and one instant:
 *
 *    migration  PEOPLE — UN DESA International Migrant Stock 2024 (data/world-flows.json): how many people
 *               born in one country live in another, at mid-year 1990 … 2024. `out` = born here, living abroad;
 *               `in` = living here, born abroad. A STOCK at that date, not a number of moves.
 *    cables     DATA — the submarine cable record IntMap already draws (data/subcables-meta.json): how many cable
 *               systems land in both countries and are in service by the year (their ready-for-service year). A count
 *               of systems, not of capacity; a cable retired before today is not in the record at all.
 *    flights    FLIGHTS — OpenFlights' route table (data/mobility.json `pairs`): how many distinct airline routes flew
 *               between the two countries in June 2014. Route existence, not seats or passengers; frozen in 2014.
 *  GOODS are not read here: the Trade flows layer (js/world-packs.js, CEPII BACI through the OEC) already answers «who does
 *  this country trade with», with its own arcs, sections and clock, and the card opens it on the country (js/world-flows.js)
 *  instead of drawing trade a second way.
 *
 *  The instant is the master clock's (js/chronos.js): a flow is read at the latest year its record states AT OR BEFORE
 *  the clock — and when the clock is before the record begins, there is no answer and the reason says so (never the
 *  record's first year presented as the clock's).
 *  ⚠ PURE: no DOM, no map, no fetch. js/world-flows.js reads the bundles and hands them in; Node evaluates every function
 *  here (tests/wave4-mobility-checks.test.mjs) against the committed files.
 *  ⚠ NOTHING IS ESTIMATED. A pair a record does not list is absent, not zero; a value the record marks as missing is
 *  `null` and is said to be missing. A place Natural Earth cannot anchor stays in every total and in the list, and is
 *  counted as «not on the map».
 * ==========================================================================*/

import greatCircle from '@turf/great-circle';

/** the flows whose two directions are different numbers — a cable system is shared by every country it lands in, so it has none */
export const DIRECTED = { migration: true, cables: false, flights: true };

/* ══ PLACES ═════════════════════════════════════════════════════════════════════════════════════════════════ */
/** the lookup over the index's place rows: by ISO alpha-3, by ISO alpha-2 and by the upstream number the build kept */
export function placeIndex(index) {
  const rows = (index && index.places) || [];
  const byCode = new Map(), byA2 = new Map();
  rows.forEach((p, i) => { byCode.set(p.c, i); if (p.a2 && !byA2.has(p.a2)) byA2.set(p.a2, i); });
  return { rows, byCode, byA2 };
}
const norm = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\s.'’-]+/g, ' ').trim();
/** the place a reader or Atlas named — an ISO code (alpha-3 or alpha-2), or the name the sheet writes in English or Japanese */
export function findPlace(P, q) {
  if (q == null) return -1;
  const s = String(q).trim();
  if (!s) return -1;
  const up = s.toUpperCase();
  if (P.byCode.has(up)) return P.byCode.get(up);
  if (/^[A-Z]{2}$/.test(up) && P.byA2.has(up)) return P.byA2.get(up);
  const k = norm(s);
  const exact = P.rows.findIndex((p) => norm(p.en) === k || (p.ja && norm(p.ja) === k));
  if (exact >= 0) return exact;
  return -1;
}
/** candidates for a search field: names that begin with the text, then names that contain it */
export function searchPlaces(P, q, limit) {
  const k = norm(q);
  if (!k) return [];
  const score = (p) => {
    const ns = [norm(p.en), norm(p.ja)];
    if (ns.includes(k) || norm(p.c) === k) return 0;
    if (ns.some((x) => x && x.startsWith(k))) return 1;
    if (ns.some((x) => x && x.includes(k))) return 2;
    return -1;
  };
  return P.rows.map((p, i) => ({ i, s: score(p) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s || norm(P.rows[a.i].en).localeCompare(norm(P.rows[b.i].en))).slice(0, limit || 12).map((x) => x.i);
}
/** the name of a place in the reader's language (Natural Earth's NAME_JA where it has one, else the upstream's English) */
export const placeName = (p, lang) => (p ? (lang === 'jp' && p.ja ? p.ja : p.en) : '');
export const onMap = (p) => !!(p && p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y));

/* ══ THE INSTANT ═══════════════════════════════════════════════════════════════════════════════════════════ */
/**
 * yearFor(years, clockYear) — the year of a record to read at the clock's year: the latest stated year at or before it.
 *   clockYear null (the clock is live) → the latest year the record states.
 *   → { year, exact } or { year: null, reason: 'before-record', first } when the clock is before the record begins.
 */
export function yearFor(years, clockYear) {
  const ys = (years || []).slice().sort((a, b) => a - b);
  if (!ys.length) return { year: null, reason: 'no-years' };
  if (clockYear == null) return { year: ys[ys.length - 1], exact: true, live: true };
  let hit = null;
  for (const y of ys) if (y <= clockYear) hit = y;
  if (hit == null) return { year: null, reason: 'before-record', first: ys[0] };
  return { year: hit, exact: hit === clockYear };
}

/* ══ THE FOUR READINGS — each returns the partners of place `i` as [{ p, v }] (p = place index), largest first ══ */
/** migration: rows [dest, origin, v1990, …, v2024]; `out` = born in i (origin), `in` = living in i (destination) */
export function migrationPartners(mig, i, dir, year) {
  const k = (mig.years || []).indexOf(year);
  if (k < 0) return [];
  const out = [];
  for (const r of mig.rows || []) {
    const v = r[2 + k];
    if (v == null || !(v > 0)) continue;
    if (dir === 'in' ? r[0] === i : r[1] === i) out.push({ p: dir === 'in' ? r[1] : r[0], v });
  }
  return out.sort((a, b) => b.v - a.v);
}
/**
 * basisOf(mig, i) — what UN DESA's estimate for destination `i` stands on: its type-of-data codes (B foreign-born, C foreign
 * citizens, R refugees reported by UNHCR / UNRWA added, I no data — imputed) and the note it points at, as DESA wrote it.
 * → { type: [codes], imputed: bool, note: number|null, noteText: string|null } or null where DESA states neither.
 */
export function basisOf(mig, i) {
  const b = mig && mig.basis && mig.basis[i];
  if (!b) return null;
  const type = Array.isArray(b.type) ? b.type : [];
  return { type, imputed: type.includes('I'), note: b.note == null ? null : b.note, noteText: b.note != null && mig.notes ? mig.notes[b.note] || null : null };
}
/**
 * cables: data/subcables-meta.json `cables` → for place i, the other places that share a cable system in service by `year`
 * (its ready-for-service year at or before; `year` null = today, where a listed cable that is not planned counts even
 * without a stated year). → { partners: [{ p, v, names }], systems, undated, unresolved }
 */
export function cablePartners(meta, P, i, year) {
  const me = P.rows[i];
  const res = { partners: [], systems: 0, undated: 0, unresolved: [] };
  if (!me || !me.a2) return res;
  const by = new Map();
  for (const id of Object.keys((meta && meta.cables) || {})) {
    const c = meta.cables[id];
    const cc = c.countryCodes || [];
    if (!cc.includes(me.a2)) continue;
    /* ONE rule for a past year and for today: a system the record calls planned is not in service, whatever its year (22 planned
       systems carry a ready-for-service year; counting them by year alone made the count for a year disagree with today's) */
    const live = !c.isPlanned && (c.rfsYear != null ? (year == null || c.rfsYear <= year) : year == null);
    if (!live) continue;
    if (c.rfsYear == null) res.undated++;
    res.systems++;
    for (const a2 of new Set(cc)) {
      if (a2 === me.a2) continue;
      const j = P.byA2.get(a2);
      if (j == null) { if (!res.unresolved.includes(a2)) res.unresolved.push(a2); continue; }
      const e = by.get(j) || { p: j, v: 0, names: [] };
      e.v++; e.names.push(c.name);
      by.set(j, e);
    }
  }
  res.partners = [...by.values()].sort((a, b) => b.v - a.v || a.p - b.p);
  return res;
}
/** flights: data/mobility.json `pairs[A][B]` = distinct airline routes from A to B (June 2014); `in` reads the column */
export function flightPartners(mob, P, i, dir) {
  const me = P.rows[i]; if (!me) return [];
  const pairs = (mob && mob.pairs) || {};
  const out = [];
  if (dir === 'in') {
    for (const a of Object.keys(pairs)) { const v = pairs[a][me.c]; if (v > 0 && a !== me.c && P.byCode.has(a)) out.push({ p: P.byCode.get(a), v }); }
  } else {
    const row = pairs[me.c] || {};
    for (const b of Object.keys(row)) { const v = row[b]; if (v > 0 && b !== me.c && P.byCode.has(b)) out.push({ p: P.byCode.get(b), v }); }
  }
  return out.sort((a, b) => b.v - a.v);
}

/* ══ THE READING — what the sheet shows and Atlas is told ═════════════════════════════════════════════════ */
/**
 * summarise(P, i, kind, dir, year, partners, opts) — totals and shares for one reading.
 *   opts.total: the total the record states for the place (DESA's all-origins / all-destinations) — when given,
 *   shares are of it, and «elsewhere» is what the listed partners do not account for.
 *   opts.base: a total that is not a sum of the partners (a cable system reaches several countries at once — the share of a
 *   partner is of the place's systems, and the shares add up to more than one).
 *   → { place, kind, dir, year, total, listed, partners: [{ p, code, v, share, onMap }], offMap, count }
 */
export function summarise(P, i, kind, dir, year, partners, opts) {
  const o = opts || {};
  const listed = partners.reduce((s, x) => s + x.v, 0);
  const total = o.base != null ? o.base : (o.total != null && o.total >= listed ? o.total : listed);
  const rows = partners.map((x) => ({ p: x.p, code: P.rows[x.p] ? P.rows[x.p].c : null, v: x.v, share: total > 0 ? x.v / total : null, onMap: onMap(P.rows[x.p]), names: x.names }));
  const offMap = rows.filter((r) => !r.onMap).reduce((s, r) => s + r.v, 0);
  return { place: P.rows[i] ? P.rows[i].c : null, kind, dir, year, total, listed, partners: rows, offMap, count: rows.length };
}
/** a time series of a place's stated totals (index.migration.totalIn / totalOut) */
export function totalsSeries(index, kind, i, dir) {
  if (kind === 'migration') {
    const m = index.migration || {}, t = (dir === 'in' ? m.totalIn : m.totalOut) || {};
    return (m.years || []).map((y, k) => ({ y, v: t[i] ? t[i][k] : null }));
  }
  return [];
}
/** the stated total at one year, or null where the record states none */
export function totalAt(index, kind, i, dir, year) {
  const s = totalsSeries(index, kind, i, dir).find((x) => x.y === year);
  return s && s.v != null ? s.v : null;
}

/* ══ THE MAP — arcs from the place to its partners along the great circle ═════════════════════════════════════ */
/**
 * arcLine([lng, lat], [lng, lat]) — the great circle between two points, as the app's own turf computes it
 * (@turf/great-circle, the module src/vendor.js publishes as window.turf.greatCircle), with the longitudes UNWRAPPED — each
 * within 180° of the previous — so a line across the antimeridian is one continuous line the renderer draws once, instead of
 * a stroke across the whole world (turf returns 179.8 → -164.2 for Tokyo → San Francisco, measured 2026-10-13).
 */
export function arcLine(a, b) {
  const g = greatCircle(a, b, { npoints: 64 }).geometry;
  const pts = g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates;
  const out = [];
  let prev = null;
  for (const p of pts) {
    let lng = p[0];
    if (prev != null) { while (lng - prev > 180) lng -= 360; while (lng - prev < -180) lng += 360; }
    prev = lng;
    out.push([+lng.toFixed(4), +(+p[1]).toFixed(4)]);
  }
  return out;
}
/**
 * arcFeatures(P, reading, n) — the GeoJSON the map draws: one arc per partner that has an anchor (the `n` largest; all when
 * n is absent), oriented FROM the source of the flow TO its destination (exports and «born here» go out of the place,
 * imports and «living here» come in), with its rank and share; and one point per place.
 */
export function arcFeatures(P, reading, n) {
  const me = P.rows[P.byCode.get(reading.place)];
  const out = [];
  if (!onMap(me)) return out;
  const from = [me.x, me.y];
  /* the rank is the partner's place in the LIST (an unanchored partner keeps its number, so the circles match the rows) */
  const rows = reading.partners.slice(0, n == null ? undefined : n).map((r, k) => Object.assign({ rank: k + 1 }, r)).filter((r) => r.onMap);
  /* widths against the largest partner of the list, as the list bars are */
  const max = reading.partners.length ? reading.partners[0].v : 0;
  rows.forEach((r) => {
    const q = P.rows[r.p], to = [q.x, q.y];
    const inward = reading.dir === 'in';
    const line = arcLine(inward ? to : from, inward ? from : to);
    out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { k: 'arc', code: q.c, rank: r.rank, v: r.v, w: max > 0 ? r.v / max : 0, link: reading.dir === 'link' ? 1 : 0 } });
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: to }, properties: { k: 'end', code: q.c, rank: r.rank, w: max > 0 ? r.v / max : 0 } });
  });
  out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: from }, properties: { k: 'home', code: me.c } });
  return out;
}
