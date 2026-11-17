// @ts-check
/* ============================================================================
 *  IntMap · js/geopolitics-core.js — THE RULES OF THE THREE GEOPOLITICS RECORDS, ONCE   (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  Sanctions (data/sanctions.json — scripts/build-sanctions.mjs), UN General Assembly votes (data/unga-votes/ —
 *  scripts/build-unga-votes.mjs) and border crossings (data/border-crossings.json — scripts/build-border-crossings.mjs).
 *  The map (js/layer-pkg-geopolitics.js), the routing panel (js/routing-ui.js) and Atlas (js/atlas-cap-data.js →
 *  js/geopolitics-atlas.js) all ask THIS module, so what the map draws and what Atlas answers are one reading.
 *
 *  ⚠ PURE: no DOM, no window — Node imports it as it is (tests/geopolitics-layers-checks.test.mjs).
 *  ⚠ NOTHING IS ESTIMATED. A party a list places nowhere is counted as unplaced, not spread; a member that did not vote is
 *  «absent», not «no»; a crossing whose schedule this reader cannot read is «not evaluated», not «closed».
 * ==========================================================================*/
import { arcLine } from './world-flows-core.js';
import { openAt } from './opening-hours.js';

/* ══ SANCTIONS ═══════════════════════════════════════════════════════════════════════════════════════════════════ */

/** the links an authority's list states, optionally for one country (ISO 3166-1 alpha-3) — largest first */
export function sanctionLinks(S, { authority = null, country = null } = {}) {
  const a = authority ? String(authority).toUpperCase() : null, c = country ? String(country).toUpperCase() : null;
  return (S.links || []).filter((l) => (!a || l.a === a) && (!c || l.c === c));
}

/** everything the record says about one country: who designates parties linked to it, how many, under what, with what */
export function sanctionsOn(S, country) {
  const c = String(country || '').toUpperCase();
  const links = sanctionLinks(S, { country: c });
  return {
    country: c, place: (S.places || {})[c] || null,
    by: links.map((l) => ({ authority: l.a, n: l.n, kinds: l.kinds, basis: l.basis, un: l.un, regimes: l.regimes, measures: l.measures, first: l.first, last: l.last })),
    total: links.reduce((s, l) => s + l.n, 0),
  };
}

/** the GeoJSON the map draws: one great-circle arc per link from the authority's seat to the country's label point, width ∝
    the number of parties (against the largest link shown), and one point per country reached */
export function sanctionFeatures(S, { authorities = null, country = null } = {}) {
  const want = authorities ? new Set(authorities.map((a) => String(a).toUpperCase())) : null;
  const seat = new Map((S.authorities || []).map((a) => [a.id, a.seat]));
  const links = sanctionLinks(S, { country }).filter((l) => !want || want.has(l.a));
  const max = links.reduce((m, l) => Math.max(m, l.n), 0);
  const out = [];
  const ends = new Map();
  for (const l of links) {
    const p = (S.places || {})[l.c], s = seat.get(l.a);
    if (!p || p.x == null || !s) continue;
    out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arcLine(s, [p.x, p.y]) },
      properties: { k: 'arc', a: l.a, c: l.c, n: l.n, w: max > 0 ? l.n / max : 0 } });
    const e = ends.get(l.c) || { n: 0, a: [] };
    e.n += l.n; e.a.push(l.a); ends.set(l.c, e);
  }
  for (const [c, e] of ends) {
    const p = S.places[c];
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.x, p.y] }, properties: { k: 'end', c, n: e.n, a: e.a.join(' ') } });
  }
  for (const a of S.authorities || []) if (!want || want.has(a.id)) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: a.seat }, properties: { k: 'seat', a: a.id } });
  return out;
}

/* ══ UN GENERAL ASSEMBLY VOTES ═══════════════════════════════════════════════════════════════════════════════════ */

export const VOTE_CODES = Object.freeze({ Y: 'yes', A: 'abstain', N: 'no', X: 'absent', '-': 'not a member' });
const ISSUE_BITS = ['me', 'nu', 'di', 'hr', 'co', 'ec'];
/** the flags of an index row → { important, amendment, paragraph, issues:['me',…] } */
export function voteFlags(f) {
  return { important: !!(f & 1), amendment: !!(f & 2), paragraph: !!(f & 4), issues: ISSUE_BITS.filter((_, i) => f & (8 << i)) };
}
/** the session file a vote lives in */
export const sessionFile = (s) => 'data/unga-votes/s' + String(s).padStart(2, '0') + '.json';
const rowOf = (r) => ({ id: r[0], d: r[1], sym: r[2], t: r[3], s: r[4], ...voteFlags(r[5]), ds: r[6] || '' });
/* the file writes a resolution's symbol in two notations — «R/68/262» in its older rows, «A/RES/77/321» in its newer ones — so a
   symbol is compared without either prefix (and without spaces); the notation the file uses is what is shown */
const symKey = (s) => String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/^(A\/RES\/|R\/)/, '');

/** the vote the record states last at or before an ISO day (null before the first) */
export function voteAtOrBefore(I, isoDay) {
  const v = I.votes || [];
  let lo = 0, hi = v.length - 1, hit = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (v[m][1] <= isoDay) { hit = m; lo = m + 1; } else hi = m - 1; }
  return hit < 0 ? null : rowOf(v[hit]);
}
/** a vote by its id (the dataset's rcid) or by its resolution symbol («A/RES/77/321», «R/1/66») */
export function findVote(I, key) {
  const k = String(key == null ? '' : key).trim();
  if (!k) return null;
  const byId = /^\d+$/.test(k) ? (I.votes || []).find((r) => r[0] === +k) : null;
  if (byId) return rowOf(byId);
  const sym = symKey(k);
  const r = sym ? (I.votes || []).find((x) => x[2] && symKey(x[2]) === sym) : null;
  return r ? rowOf(r) : null;
}
/** votes whose symbol, subject or description contains every word of the query (case-insensitive), optionally inside [from, to]
    ISO days, newest first. Words, not a spelling list: what the record writes is what is searched. */
export function searchVotes(I, query, { from = null, to = null, limit = 20, finalOnly = false } = {}) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = (I.votes || []).length - 1; i >= 0; i--) {
    const r = I.votes[i];
    if ((from && r[1] < from) || (to && r[1] > to)) continue;
    if (finalOnly && (r[5] & 6)) continue;
    const hay = (String(r[2]) + ' ' + String(r[3]) + ' ' + String(r[6] || '')).toLowerCase();
    if (words.every((w) => hay.includes(w))) { out.push(rowOf(r)); if (out.length >= limit) break; }
  }
  return out;
}
/** one vote: its words from the index, its votes from its session file → { …row, y, n, a, x, by:{ code: 'Y'|'A'|'N'|'X'|'-' } } */
export function decodeVote(I, sessionJson, id) {
  const v = (sessionJson.votes || []).find((x) => x.id === id);
  const r = (I.votes || []).find((x) => x[0] === id);
  if (!v || !r) return null;
  const by = {};
  (I.members || []).forEach((m, i) => { by[m.c] = v.v[i] || '-'; });
  return { ...rowOf(r), y: v.y, n: v.n, a: v.a, x: v.x, by };
}

/* ══ BORDER CROSSINGS ════════════════════════════════════════════════════════════════════════════════════════════ */

const R = 6371.0088;
/** great-circle distance in km */
export function km(a, b) {
  const t = Math.PI / 180, dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** the crossings nearest a point, nearest first — with their distance; no radius is imposed (a reader reads the km) */
export function nearestCrossings(B, lng, lat, n = 3) {
  const best = [];
  for (const c of B.crossings || []) {
    const d = km([lng, lat], [c.x, c.y]);
    if (best.length < n || d < best[best.length - 1].km) {
      best.push({ c, km: d }); best.sort((a, b) => a.km - b.km); if (best.length > n) best.pop();
    }
  }
  return best;
}
/** a crossing's state at an instant: what its schedule states in its own zone, or why none is given */
export function crossingState(c, ms) {
  if (!c || !c.oh) return { state: 'unstated' };
  return Object.assign({ tz: c.tz || null }, openAt(c.oh, ms, c.tz || 'UTC'));
}
/** who may cross, as OpenStreetMap's access:citizenship states it → { kind: 'all'|'international'|'local'|'interstate'|'codes'|null, codes:[…] } */
export function citizenship(c) {
  const v = c && c.cz;
  if (!v) return { kind: null, codes: [] };
  const parts = String(v).split(';').map((s) => s.trim()).filter(Boolean);
  const named = parts.filter((p) => !/^(all|international|local|interstate)$/i.test(p)).map((p) => p.toUpperCase());
  const word = parts.find((p) => /^(all|international|local|interstate)$/i.test(p));
  return { kind: named.length ? 'codes' : (word ? word.toLowerCase() : null), codes: named, words: parts };
}
/** the GeoJSON points of the crossings, each with its state at the instant (for the colour) */
export function crossingFeatures(B, ms) {
  return (B.crossings || []).map((c, i) => ({ type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [c.x, c.y] },
    properties: { i, name: c.n || c.en || '', st: crossingState(c, ms).state } }));
}
