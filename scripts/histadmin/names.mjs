/* ============================================================================
 *  IntMap · may this Wikidata item name THIS province, and in which script?   (#R695)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT THIS FIXES. Measured on the committed bundles 2026-09-11: data/hist-admin2.js holds
 *  22,708 units and 20,357 of them carry no `name:<lang>` at all — 0.5 % have a Japanese name, 6.5 %
 *  an English one. The map was not blank (20,355 of them carry the bare local `name`), it was
 *  UNREADABLE: a Japanese reader travelling to 1900 got 東京府's neighbours in Polish, Arabic and
 *  Thai. Upstream is not silent about them either — 17,120 of those 20,357 carry a `wikidata` tag,
 *  which is OpenHistoricalMap's own statement of WHICH item this unit is, and Wikidata labels that
 *  item in every language IntMap has.
 *
 *  ⚠ AND THE TAG ALONE IS NOT ENOUGH, WHICH IS WHY THIS FILE EXISTS. 3,841 of the 6,778 items are
 *  claimed by more than one unit (19,917 units in all). Most of that is honest — «Provinz
 *  Brandenburg» is ten records because its borders moved ten times, and all ten ARE Q700264. But
 *  599 of those groups state DIFFERENT names under one item, and there the tag is being borrowed:
 *  Q724 is Maine, and the units claiming it include «Devonshire County» and «Massachusetts Claim».
 *  Distributing Wikidata's «Maine» to those would be inventing a name for a unit nobody named —
 *  #R515's mistake with a different upstream. So a shared item may only speak for its units when
 *  they all say the same thing, and where they do not, NOBODY gets the label.
 *
 *  Everything here is pure — rows in, verdict out; no network, no filesystem, no globals — so
 *  tests/r695-histadmin-names-checks.test.mjs evaluates it rather than reading it (#R505).
 * ==========================================================================*/

export const REFUSE = {
  BORROWED: 'shared-by-units-with-different-names',  /* two units, one item, two names */
  ANONYMOUS: 'shared-by-unnamed-units',              /* nothing in the record to agree ON */
  BRACKETED: 'disambiguation-label',                 /* «Montana (新澤西州)» — plainLabel says no */
};

/**
 * Which items may speak for the units that claim them.
 * @param rows [{qid, name}] one entry per SHIPPED unit that carries a wikidata tag
 * @returns Map qid → {count, ok:boolean, why:string|null}
 */
export function itemVerdicts(rows) {
  const groups = new Map();
  for (const r of rows) {
    const q = String(r.qid || '');
    if (!/^Q\d+$/.test(q)) continue;
    let g = groups.get(q);
    if (!g) groups.set(q, (g = { count: 0, names: new Set() }));
    g.count++;
    const n = String(r.name || '').trim();
    if (n) g.names.add(n);
  }
  const out = new Map();
  for (const [q, g] of groups) {
    if (g.count === 1) { out.set(q, { count: 1, ok: true, why: null }); continue; }
    if (g.names.size === 0) { out.set(q, { count: g.count, ok: false, why: REFUSE.ANONYMOUS }); continue; }
    out.set(q, g.names.size === 1
      ? { count: g.count, ok: true, why: null }
      : { count: g.count, ok: false, why: REFUSE.BORROWED });
  }
  return out;
}

/**
 * Which name columns a unit may GAIN, and from where.
 * ⚠ IT ONLY EVER FILLS AN EMPTY COLUMN. What upstream wrote about a unit is what upstream wrote:
 * OpenHistoricalMap's own `name:de` is a mapper's statement about that unit at that date, and
 * Wikidata's label is a statement about an item across all of time. Where both exist the record's
 * own wins, and nothing here can remove a name (AGENTS.md §3-1).
 *
 * @param names   the unit's existing names, keyed by OSM suffix (mutated: filled in place)
 * @param labels  {osmSuffix: label} resolved from the item, already narrowed to the shipped set
 * @param plain   scripts/histeras/match.mjs `plainLabel` — injected, never re-implemented here
 * @returns the suffixes that were filled
 */
export function fillNames(names, labels, plain) {
  const added = [];
  for (const tag of Object.keys(labels)) {
    const v = String(labels[tag] || '').trim();
    if (!v) continue;
    if (names[tag]) continue;                 /* upstream already said it — see above */
    if (!plain(v)) continue;                  /* a disambiguated label is not a map label */
    names[tag] = v;
    added.push(tag);
  }
  return added;
}

/* ══ `name:zh` — WHICH CHINESE, ASKED RATHER THAN ASSUMED ════════════════════════════════════════
   Upstream writes `name:zh` on 1,651 first-tier relations and 156 second-tier ones, and the build
   was dropping every one of them because the bundle keys Chinese by SCRIPT (`zh-Hant` / `zh-Hans`,
   which is how js/lang-registry.js tags IntMap's two Chinese rows) and `zh` is neither. Filing them
   under `zh-Hant` because the app resolves a bare `zh` that way would be a guess about 1,651
   strings, and #R686 wrote down what the guess costs: every Chinese reader served the other script
   with nothing anywhere to say so.
   ⚠ SO THE STRING IS ASKED, AND THE ANSWER IS NOT THE ONE THE GUESS WOULD HAVE GIVEN. Simplifying
   a string that changes under it is EVIDENCE that it held a Traditional-only character. Measured
   over upstream's 1,807 `name:zh` values on 2026-09-11: 718 are Traditional (施泰爾馬克州, 廣州府),
   691 are Simplified (缅因州, 钟路区) and 398 are written identically in both scripts (俄亥俄州).
   Filing all of them under `zh-Hant` would have handed 691 names to the wrong reader.
   ⚠ THE TWO DIRECTIONS ARE NOT SYMMETRIC, AND THE ORDER IS THE REASON. Simplified→Traditional also
   normalises VARIANT PREFERENCES — opencc turns 台灣省 into 臺灣省 — so a string that changes under
   it has not necessarily got a Simplified character in it. Asked second, after the Traditional test
   has already claimed everything with Traditional evidence, what it means is «nothing here is
   Traditional-only», and a Simplified reader can read every such string. A name neither pass
   touches is the same in both scripts — 四川省 is 四川省 — so it goes to BOTH columns rather than
   being withheld from one.
   The converters are injected so this file stays pure; the build passes opencc-js, the same
   dependency scripts/zh-hans.mjs already generates the Simplified UI with. */
export function chineseTags(value, toSimp, toTrad) {
  const s = String(value || '').trim();
  if (!s) return [];
  if (toSimp(s) !== s) return ['zh-Hant'];
  if (toTrad(s) !== s) return ['zh-Hans'];
  return ['zh-Hant', 'zh-Hans'];
}

/**
 * The share of units with no name in a shipped language — the number the gate ratchets on.
 * @param feats  the bundle's feature rows
 * @param tags   the shipped OSM suffixes
 * @returns {tag: {missing, total, pct}}
 */
export function missingByTag(feats, tags) {
  const out = {};
  for (const tag of tags) {
    let missing = 0;
    for (const f of feats) if (!((f[9] || {})[tag])) missing++;
    out[tag] = { missing, total: feats.length, pct: feats.length ? (100 * missing) / feats.length : 0 };
  }
  return out;
}
