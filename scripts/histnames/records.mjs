/* ============================================================================
 *  IntMap · THE THREE RECORDS THAT DRAW A BORDER, IN ONE SHAPE            (#R695)
 * ----------------------------------------------------------------------------
 *  ⚠ WHETHER A HISTORICAL NAME REACHED A READER IN THEIR LANGUAGE WAS DECIDED BY WHICH RECORD
 *  HAPPENED TO ANSWER THAT YEAR — not by anything about the name. Measured on main, 2026-09-11:
 *
 *      record                        band          de     fr     jp     ko     zh
 *      data/cshapes.js       (710)   1886–2019   32.0%  18.6%  38.0%  18.6%  18.6%
 *      data/hist-borders.js (1411)   1689–1885   57.5%  71.0%  65.7%  87.1%  64.4%
 *      data/hist-eras.js  (10,212)   ≤ 1688      20.5%  18.2%  31.4%  22.8%  24.8%
 *
 *  The middle row is high because OpenHistoricalMap writes `name:xx` itself; the bottom row got
 *  #R686's Wikidata lane; the TOP row — the band a reader visits most — had nothing but
 *  js/time-borders.js's hand-written tables, so 1950 was in English for four languages out of
 *  nine. Three records, three different lucks, one kind of question.
 *
 *  ⇒ THE RULE GOES ON THE NAME, NOT ON THE RECORD (#R429's shape). This file is what makes that
 *  possible: every record is read into ONE census row shape, so #R686's measure — agree with
 *  where the map draws the shape and when it draws it, or be refused (#R515) — is asked once and
 *  answers for all three.
 *
 *  ⚠ AND ONE OF THE THREE DOES NOT NEED THE MEASURE AT ALL. data/hist-borders.js states the
 *  polity's Wikidata QID on 1,305 of its 1,411 features, because OpenHistoricalMap tags it. An
 *  identifier is not a spelling: there is nothing for a ranker to get wrong and no agreement to
 *  test. That lane is separate below (`byQid`) and is the reason this round can raise the middle
 *  row without touching the 13 MB bundle.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ringBox } from '../histeras/census.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `window.__X` out of a bundle in data/, evaluated (never parsed — #R505). */
export function bundle(file, global, root = ROOT) {
  const w = {};
  new Function('window', readFileSync(join(root, 'data', file), 'utf8'))(w);
  const d = w[global];
  if (!d) throw new Error('data/' + file + ' published no ' + global);
  return d;
}

/* ── the box a feature occupies, over pooled rings ──────────────────────────
   One box per DRAWN FEATURE, the union of its rings — the same unit #R686 chose and for the same
   reason: an archipelago drawn as 400 rings is one thing with one name. */
function featBox(d, polys) {
  let box = null;
  for (const poly of polys) for (const ri of poly) {
    const ring = d.rings[ri]; if (!ring || !ring.length) continue;
    const b = ringBox(ring);
    box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
  }
  return box;
}

function push(rows, name, y0, y1, box, qid) {
  if (!name) return;
  let r = rows.get(name);
  if (!r) { r = { name, n: 0, y0: Infinity, y1: -Infinity, boxes: [], qids: new Set() }; rows.set(name, r); }
  r.n++;
  if (y0 < r.y0) r.y0 = y0;
  if (y1 > r.y1) r.y1 = y1;
  if (box) r.boxes.push(box);
  if (qid) r.qids.add(qid);
}

const done = (rows) => [...rows.values()].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));

/* ── data/cshapes.js — 1886-2019, day-exact, 710 features over 252 names ────
   ⚠ THE GLOSS IN BRACKETS IS NOT PART OF THE NAME. js/time-borders.js `_csName` strips a trailing
   "(…)" before it labels anything ("Madagascar (Malagasy)"), so the census has to ask about the
   string the reader actually sees; asking about the unstripped one would look up a spelling that
   is never drawn. The rule is READ from the module rather than restated — see `csName` below. */
export const csName = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '');

export function censusCShapes(root = ROOT) {
  const d = bundle('cshapes.js', '__CSHAPES', root);
  const rows = new Map();
  for (const f of d.feats) push(rows, csName(f[0]), f[2], f[5], featBox(d, f[8]), null);
  return { rows: done(rows), years: changeYears(d, 2, 5), record: 'cshapes' };
}

/* ── data/hist-borders.js — 1689-1885, day-exact, 1,411 features ────────────
   Its names are already an object (`{en, jp, …}` as OpenHistoricalMap wrote them) and its QID is
   f[1]. Both lanes read the same rows: the measure asks about `en`, the identifier lane about the
   QID, and the build prefers the identifier wherever there is one. */
export function censusHistBorders(root = ROOT) {
  const d = bundle('hist-borders.js', '__HISTB', root);
  const rows = new Map();
  for (const f of d.feats) push(rows, f[0] && f[0].en, f[2], f[5], featBox(d, f[8]), f[1] || null);
  return { rows: done(rows), years: changeYears(d, 2, 5), record: 'histBorders', bundleRef: d };
}

/** Every year at which a day-exact record changes — its own resolution, for `timeSlack`. */
function changeYears(d, i0, i1) {
  const s = new Set();
  for (const f of d.feats) { s.add(f[i0]); s.add(f[i1]); }
  return [...s].sort((a, b) => a - b);
}

/**
 * Which languages a hist-borders feature is already missing, and the QID that could answer.
 * ⚠ THE UNIT IS THE FEATURE, NOT THE NAME. Two features can share a QID and disagree about which
 * languages the upstream wrote for them, so the question «what is still missing» is only true of
 * a feature. The answer is keyed by QID because that is what Wikidata is asked.
 */
export function histBordersQidGaps(langs, root = ROOT) {
  const d = bundle('hist-borders.js', '__HISTB', root);
  const want = langs.filter((l) => l !== 'en');
  const need = new Map();                       /* qid → Set(lang) */
  for (const f of d.feats) {
    if (!f[1]) continue;
    for (const l of want) {
      if (f[0][l]) continue;
      if (!need.has(f[1])) need.set(f[1], new Set());
      need.get(f[1]).add(l);
    }
  }
  return need;
}
