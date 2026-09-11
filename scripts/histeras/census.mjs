/* ============================================================================
 *  IntMap · the era-name census — what data/hist-eras.js actually asks to be named  (#R686)
 * ----------------------------------------------------------------------------
 *  data/hist-eras.js ships 53 world snapshots (17 of them BC) with 10,212 NAMED features, and
 *  every one of those names is a single `{en:…}` — the upstream cartographer's English string.
 *  Nothing before 1850 was ever localized, so a Japanese reader standing in 323 BC read
 *  "Empire of Alexander".
 *
 *  ⚠ THE TRANSLATION UNIT IS THE NAME, NOT THE FEATURE. Measured on the shipped bundle:
 *  10,212 named features carry only 3,028 DISTINCT strings — "Australian aboriginal
 *  hunter-gatherers" is drawn in 36 snapshots, "France" in 24. So the census is keyed by the
 *  string, and everything downstream (the queries, the scoring, the shipped table) is per-string.
 *  That is also why the shipped table is small: 3,028 rows, not 10,212.
 *
 *  A census row carries the three things a match can be TESTED against — the string, WHERE the
 *  map draws it, and WHEN. Two of those are the reason this file exists: #R515 accepted a
 *  geocoder's first hit on the strength of the spelling alone and put a port in the wrong
 *  country, and a Wikidata label search does exactly what that geocoder did unless the answer is
 *  made to agree with the map's own geometry and clock.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeBorders } from './time-borders.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `window.__HISTERAS` from data/hist-eras.js, evaluated (never parsed). */
export function eraBundle(root = ROOT) {
  const src = readFileSync(join(root, 'data', 'hist-eras.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  if (!w.__HISTERAS || !Array.isArray(w.__HISTERAS.snaps)) {
    throw new Error('data/hist-eras.js published no __HISTERAS.snaps');
  }
  return w.__HISTERAS;
}

/* ── the box a feature occupies ──────────────────────────────────────────────
   ⚠ A BOUNDING BOX IS NOT A CENTROID, AND FOR THESE FEATURES THE DIFFERENCE DECIDES MATCHES.
   Measured on the bundle: 28 of the 3,028 names have occurrences whose bbox centres are more
   than 25° apart, and the widest of them ("Fiji", 173°) is not ambiguous at all — it straddles
   the antimeridian, so the mean of its longitudes lands in Africa. Scoring against the CENTRE of
   such a shape would reject the right answer and could accept a wrong one, so a candidate
   coordinate is measured against the BOXES, and longitudes are compared the short way round. */
export function ringBox(ring) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const p of ring) {
    if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1];
  }
  return [w, s, e, n];
}

/** Degrees of longitude between two meridians, the short way round (never more than 180). */
export function lonGap(a, b) {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Angular distance in degrees from (lon,lat) to the box, 0 when inside. */
export function boxDistance(box, lon, lat) {
  const [w, s, e, n] = box;
  const dLat = lat < s ? s - lat : lat > n ? lat - n : 0;
  /* inside the span only when the point is on the arc from w eastwards to e */
  const span = ((e - w) % 360 + 360) % 360;
  const off = ((lon - w) % 360 + 360) % 360;
  const dLon = off <= span ? 0 : Math.min(lonGap(lon, w), lonGap(lon, e));
  /* a degree of longitude shrinks towards the poles, so the east-west gap is measured at the
     latitude where the two actually stand off each other — the point's own, or the box edge it
     is beyond. Clamped at 85° so a polar feature cannot make every longitude look adjacent. */
  const refLat = lat < s ? s : lat > n ? n : lat;
  const scale = Math.cos(Math.min(Math.abs(refLat), 85) * Math.PI / 180);
  return Math.hypot(dLon * scale, dLat);
}

/** Smallest boxDistance over a row's boxes. */
export function rowDistance(row, lon, lat) {
  let best = Infinity;
  for (const b of row.boxes) { const d = boxDistance(b, lon, lat); if (d < best) best = d; }
  return best;
}

/* ── the census ─────────────────────────────────────────────────────────────
   ⚠ ONE BOX PER DRAWN FEATURE — the union of that feature's rings, not one box per ring. The
   unit is the thing the map labels: an archipelago drawn as 400 rings is one feature with one
   name, and keeping 400 boxes for it would make its islands outvote every other occurrence in
   the scorer without naming a single new place. */
export function census(bundle = eraBundle()) {
  const rows = new Map();
  for (const snap of bundle.snaps) {
    for (const f of (snap.feats || [])) {
      const en = f[0] && f[0].en; if (!en) continue;
      let row = rows.get(en);
      if (!row) { row = { name: en, n: 0, snaps: [], y0: Infinity, y1: -Infinity, boxes: [] }; rows.set(en, row); }
      row.n++;
      row.y0 = Math.min(row.y0, snap.y); row.y1 = Math.max(row.y1, snap.y);
      if (!row.snaps.includes(snap.key)) row.snaps.push(snap.key);
      let box = null;
      for (const poly of f[2]) for (const ri of poly) {
        const ring = bundle.rings[ri]; if (!ring || !ring.length) continue;
        const b = ringBox(ring);
        box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
      }
      if (box) row.boxes.push(box);
    }
  }
  return [...rows.values()].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
}

/* ── the second question a glossed name asks ────────────────────────────────
   ⚠⚠⚠ «Ceylon (Dutch)» IS TWO QUESTIONS, AND ONLY ONE OF THEM WAS EVER ASKED. The era
   cartographer writes a polity and its possessor in one string — 314 of the 3,028 spellings, 372
   drawn features — and every lane downstream is keyed by the whole string, so Wikidata was asked
   about «Ceylon (Dutch)», found nothing under that spelling, and the base went unasked.
   ⚠ THE ORIGINAL ROW IS NOT REPLACED. It is sometimes the one that matches («Mandatory Palestine
   (UK)» is a thing Wikidata knows by a name of its own), so the base is an ADDITIONAL question and
   never a substitution — and a base the record already draws on its own is already in `census()`,
   so only the ones it does not are returned here.
   ⚠ AND THE RULE FOR WHERE THE NAME STOPS IS NOT WRITTEN HERE. js/time-borders.js owns it
   (`window.IntMapEraName`), because that file is what decides what the READER is shown: it
   localizes the two halves separately and puts the bracket back, so a census that simply stripped
   the bracket would ask about a spelling nobody is ever shown. The module is EVALUATED for it
   (#R505) rather than read, and nothing about the rule is restated in this file.
   ⚠ THE BOXES AND THE YEARS ARE THE GLOSSED FEATURE'S. That is the whole safeguard: the base
   answer still has to agree with WHERE the map drew the shape and WHEN (#R515), and the only
   places the map ever draws «Ceylon» are the places it drew «Ceylon (Dutch)». */
let _eraName = null;
export function eraNameRule() {
  if (_eraName) return _eraName;
  const R = timeBorders().window.IntMapEraName;
  if (!R || typeof R.split !== 'function' || typeof R.join !== 'function' || typeof R.compose !== 'function') {
    throw new Error('js/time-borders.js publishes no IntMapEraName — the `Base (Gloss)` rule is unreadable, and a build that restated it would be one judgement in two files (#R536)');
  }
  return (_eraName = R);
}

/** The base names a `Base (Gloss)` era name asks about and the record never draws on its own. */
export function eraBaseCensus(rows = census()) {
  const R = eraNameRule();
  const drawn = new Set(rows.map((r) => r.name));
  const out = new Map();
  for (const row of rows) {
    const p = R.split(row.name);
    if (!p || drawn.has(p.base)) continue;
    let b = out.get(p.base);
    if (!b) { b = { name: p.base, n: 0, snaps: [], y0: Infinity, y1: -Infinity, boxes: [], glossed: [] }; out.set(p.base, b); }
    b.n += row.n;
    b.y0 = Math.min(b.y0, row.y0); b.y1 = Math.max(b.y1, row.y1);
    for (const k of row.snaps) if (!b.snaps.includes(k)) b.snaps.push(k);
    for (const box of row.boxes) b.boxes.push(box);
    if (!b.glossed.includes(row.name)) b.glossed.push(row.name);
  }
  return [...out.values()].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
}
