/* ============================================================================
 *  IntMap · subcables — IS THIS THE SAME CABLE?
 * ----------------------------------------------------------------------------
 *  The brief's §6: a LineString from another dataset may not be attached to a
 *  cable because it happens to be nearby. Getting this wrong is worse than
 *  getting no surveyed route at all, because a wrong route LOOKS like the good
 *  outcome — so every match must clear a name test AND a place test, and
 *  anything that clears only one is refused and the leg is reconstructed
 *  instead.
 *
 *  ── THE NAME TEST ─────────────────────────────────────────────────────────
 *  Neither side writes the name the same way. TeleGeography writes
 *  "Japan-U.S. Cable Network (JUS)", NOAA writes "Japan U.S. Cable Network",
 *  Rijkswaterstaat writes "TAT14 Segment H", ACMA writes "Australian Japan
 *  Cable - Northern Branch" and hands the acronym separately as `ABBREV`. So
 *  each side is reduced to a set of KEYS — the full name, the name without its
 *  parenthetical, the parenthetical itself, and the name with the trailing
 *  segment/direction markers removed — and the best key-to-key agreement, at
 *  the strongest level that agrees, is the name score.
 *
 *  Spellings that no rule can reach ("SeaMeWe-3" ↔ "SEA-ME-WE 3") live in
 *  data/subcable-overrides.json, as data, with the rest of the corrections.
 *
 *  ── THE PLACE TEST ────────────────────────────────────────────────────────
 *  The candidate geometry must lie in the same place as the cable. The cable's
 *  own landing points are the primary answer to "where is it"; its schematic is
 *  the secondary one, used the way §8 permits — as a locator that says which
 *  ocean, never as a shape the result is fitted to.
 * ==========================================================================*/
import { haversine } from './geo.mjs';
import { refPosition } from './topology.mjs';

const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9', xi: '11', xii: '12' };
/* markers that mean "a piece of", not "a different cable" */
const SEGMENT_WORDS = /^(segment|seg|section|branch|trace|part|leg|phase|spur|s\d+)$/;
const DIRECTION_WORDS = /^(north|south|east|west|northern|southern|eastern|western|n|s|e|w|nw|ne|sw|se)$/;
const GENERIC_WORDS = /^(cable|cables|system|systems|network|kabel|submarine|subsea|the|of)$/;

/* the alias table's keys, longest first — cached against the table itself so the
   loaded JSON is never mutated to hold a build detail */
const ALIAS_ORDER = new WeakMap();

export function normalizeName(s, aliasMap) {
  let t = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  if (!aliasMap) return t;
  /* ⚠ AN ALIAS IS A WORD, NOT A WHOLE NAME. Keyed on the entire normalised
     string, the table could rewrite "tat14" and could not touch "tat14 segment
     k 1" — which is the form these datasets actually use. Applied as
     word-bounded substitutions, longest key first, one pass, it reaches both. */
  if (aliasMap[t]) return aliasMap[t];
  let keys = ALIAS_ORDER.get(aliasMap);
  if (!keys) ALIAS_ORDER.set(aliasMap, keys = Object.keys(aliasMap).sort((x, y) => y.length - x.length));
  for (const k of keys) {
    if (!k || t.indexOf(k) < 0) continue;
    t = (' ' + t + ' ').split(' ' + k + ' ').join(' ' + aliasMap[k] + ' ').trim().replace(/\s+/g, ' ');
  }
  return t;
}

function tokens(s) { return s ? s.split(' ').filter(Boolean).map(w => ROMAN[w] || w) : []; }

/* the four keys, strongest first */
export function nameKeys(raw, extra, aliasMap) {
  const src = String(raw || '');
  const parens = [...src.matchAll(/\(([^)]*)\)/g)].map(m => m[1]);
  const bare = src.replace(/\([^)]*\)/g, ' ');
  const full = tokens(normalizeName(src, aliasMap));
  const noParen = tokens(normalizeName(bare, aliasMap));
  const acronyms = parens.map(p => normalizeName(p, aliasMap)).filter(Boolean);
  if (extra) { const e = normalizeName(extra, aliasMap); if (e) acronyms.push(e); }
  /* ⚠ "Havfrue/AEC-2" IS TWO NAMES. TeleGeography joins a cable's alternative
     names with a slash — Havfrue/AEC-2, SEACOM/Tata TGN-Eurasia, Gondwana-2/
     Picot-2, FLAG North Asia Loop/Reach North Asia Loop — and a source that
     knows it by one of them matched none of it: measured, NOAA's 676 km
     "HAVFRUE Cable System" corridor found no candidate at all. Each side counts
     as a name in its own right. */
  if (bare.indexOf('/') >= 0) {
    for (const alt of bare.split('/')) {
      const a = normalizeName(alt, aliasMap);
      if (a && a.split(' ').filter(w => !GENERIC_WORDS.test(w)).length) acronyms.push(a.split(' ').filter(w => !GENERIC_WORDS.test(w)).join(' '));
    }
  }
  /* core: drop generic words, then drop a trailing run of segment/direction markers */
  let core = noParen.filter(w => !GENERIC_WORDS.test(w));
  while (core.length > 1) {
    const last = core[core.length - 1];
    if (SEGMENT_WORDS.test(last) || DIRECTION_WORDS.test(last) || /^[a-z]$/.test(last) || /^\d+(\.\d+)?$/.test(last)) core = core.slice(0, -1);
    else break;
  }
  core = core.filter(w => !SEGMENT_WORDS.test(w));
  return {
    full: full.join(' '),
    noParen: noParen.filter(w => !GENERIC_WORDS.test(w)).join(' '),
    core: core.join(' '),
    acronyms,
    coreTokens: core,
  };
}

/* 1.0 exact · 0.95 acronym · 0.85 core · 0.7 token-subset · 0 otherwise */
export function nameScore(a, b) {
  if (!a.full || !b.full) return 0;
  if (a.full === b.full) return 1;
  if (a.noParen && a.noParen === b.noParen) return 1;
  for (const x of a.acronyms) {
    if (!x || x.length < 2) continue;
    if (b.acronyms.includes(x)) return 0.95;
    if (b.core === x || b.noParen === x || b.full === x) return 0.95;
  }
  for (const y of b.acronyms) {
    if (!y || y.length < 2) continue;
    if (a.core === y || a.noParen === y || a.full === y) return 0.95;
  }
  if (a.core && a.core === b.core) return 0.85;
  const A = new Set(a.coreTokens), B = new Set(b.coreTokens);
  if (A.size >= 2 && B.size >= 2) {
    const small = A.size <= B.size ? A : B, big = A.size <= B.size ? B : A;
    let all = true; for (const w of small) if (!big.has(w)) { all = false; break; }
    if (all) return 0.7;
  }
  return 0;
}

/* ── the place test ────────────────────────────────────────────────────────
   `dist` is the closest approach of the candidate geometry to anything that
   locates the cable. Returns metres, and Infinity when the cable has nothing to
   locate it by. */
export function placeDistance(sampleCoords, cable) {
  let best = Infinity;
  for (const p of sampleCoords) {
    for (const lp of cable.landingCoords) { const d = haversine(p, lp); if (d < best) best = d; }
  }
  if (best < 60000) return best;                          /* already convincingly at a landing */
  for (const p of sampleCoords) {
    for (const ring of cable.rings) { const r = refPosition(ring, p); if (r.dist < best) best = r.dist; }
  }
  return best;
}

/* ── the whole test ────────────────────────────────────────────────────────── */
export const MATCH_RULES = {
  minNameScore: 0.7,
  /* how far a candidate may sit from the cable it claims to be, by name strength */
  placeGate: { 1: 400e3, 0.95: 400e3, 0.85: 250e3, 0.7: 120e3 },
  /* and how much better the winner must be than the runner-up when several
     cables answer to the same name (Americas-II West vs Americas-II East …) */
  ambiguityRatio: 0.6,
};

export function matchPiece(piece, cables, aliasMap) {
  const keys = nameKeys(piece.name, piece.abbrev, aliasMap);
  const scored = [];
  for (const c of cables) {
    const ns = nameScore(keys, c.keys);
    if (ns < MATCH_RULES.minNameScore) continue;
    const pd = placeDistance(piece.sample, c);
    const gate = MATCH_RULES.placeGate[ns] ?? MATCH_RULES.placeGate[0.7];
    if (!(pd <= gate)) { scored.push({ cable: c, ns, pd, rejected: 'place' }); continue; }
    scored.push({ cable: c, ns, pd });
  }
  const ok = scored.filter(s => !s.rejected);
  if (!ok.length) return { match: null, considered: scored };
  ok.sort((a, b) => (b.ns - a.ns) || (a.pd - b.pd));
  const win = ok[0];
  /* several cables of the same name and the same strength: the nearest wins,
     but only if it is clearly nearer — otherwise this is a guess, and §6 says
     reconstruct rather than guess */
  const rivals = ok.filter(s => s !== win && s.ns === win.ns);
  if (rivals.length) {
    const second = rivals[0].pd;
    if (!(win.pd < second * MATCH_RULES.ambiguityRatio || win.pd < 25000)) {
      return { match: null, considered: scored, ambiguous: true };
    }
  }
  const confidence = Math.min(1, win.ns * (win.pd < 25e3 ? 1 : win.pd < 100e3 ? 0.95 : 0.85));
  return { match: win.cable, nameScore: win.ns, placeDist: win.pd, confidence, considered: scored };
}
