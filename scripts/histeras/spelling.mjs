/* ============================================================================
 *  scripts/histeras/spelling.mjs — an upstream misspelling, corrected from the corpus   (hist-findings-sweep)
 * ----------------------------------------------------------------------------
 *  The era sheets (data/hist-eras.js, aourednik/historical-basemaps) carry the cartographer's own strings, and a
 *  few of them are slips of the keyboard: «Scottalnd» on the 1650 and 1700 sheets, «Scottland» on 1492 and 1500,
 *  «Boethuk» on 1000–1200, «Prot-Altaic pastoralists» on 1500–700 BC. The reader saw the slip as the polity's name
 *  (reported 2026-10-07 on the 1647 and 1650 maps), and the name table (data/histnames.json, keyed by the spelling)
 *  could not answer it in any language.
 *  ⇒ THE SAME RULE AS THE U+FFFD REPAIR IN scripts/build-hist-eras.mjs: a string is corrected only to a spelling
 *  the corpus ITSELF uses — the same cartographer writes «Scotland» on the 1279, 1300 and 1400 sheets. What is new
 *  is that a slip is not machine-detectable the way U+FFFD is (a one-letter difference is just as often a real
 *  distinction — «Malay»/«Malays», «Sinhalese kingdom»/«kingdoms», «Austronesian»/«Austronesians» were measured on
 *  the same ring), so the judgement is a reviewed ledger, scripts/histeras/spelling.json, and the gate holds each
 *  entry to the corpus: the corrected spelling must be one an uncorrected feature carries.
 *  ⚠ UPSTREAM'S WORD IS KEPT: the corrected feature carries it as `u` beside its other upstream attributes.
 * ==========================================================================*/
const FIELDS = ['s', 'p'];

/** apply the ledger to the sheets in place: a name (and a SUBJECTO / PARTOF) that is exactly a `from` becomes its `to`;
    the feature keeps `from` as `u`. Idempotent. → the number of features changed */
export function applySpelling(snaps, ledger) {
  const by = new Map((ledger.corrections || []).map((c) => [c.from, c.to]));
  let n = 0;
  for (const s of snaps) for (const f of s.feats) {
    const at = f[1] || (f[1] = {});
    const to = by.get(f[0].en);
    if (to) { at.u = f[0].en; f[0].en = to; n++; }
    for (const k of FIELDS) if (by.has(at[k])) at[k] = by.get(at[k]);
  }
  return n;
}

/** the gate: every entry applied, every corrected feature accounted for, every correction attested by the corpus */
export function spellingProblems(snaps, ledger) {
  const out = [], C = ledger.corrections || [];
  const froms = new Set(C.map((c) => c.from));
  const plain = new Set(), fixed = new Map();
  for (const s of snaps) for (const f of s.feats) {
    const at = f[1] || {};
    if (froms.has(f[0].en)) out.push(`sheet ${s.key} still names a feature «${f[0].en}», which scripts/histeras/spelling.json corrects — node scripts/build-hist-eras.mjs --spelling`);
    for (const k of FIELDS) if (froms.has(at[k])) out.push(`sheet ${s.key} still carries «${at[k]}» in ${k === 's' ? 'SUBJECTO' : 'PARTOF'}`);
    if (at.u == null) plain.add(f[0].en);
    else fixed.set(at.u + '→' + f[0].en, (fixed.get(at.u + '→' + f[0].en) || 0) + 1);
  }
  for (const k of fixed.keys()) { const [u, en] = k.split('→'); if (!C.some((c) => c.from === u && c.to === en)) out.push(`a feature carries upstream's «${u}» as «${en}», and no entry of scripts/histeras/spelling.json says so`); }
  for (const c of C) {
    if (!(c.from && c.to && c.from !== c.to)) out.push('a spelling correction must name `from` and a different `to`');
    if (!(typeof c.why === 'string' && c.why.length > 30)) out.push(`the correction «${c.from}» → «${c.to}» states no reason`);
    if (!plain.has(c.to)) out.push(`«${c.to}» is not a spelling the corpus itself uses on any uncorrected feature — a correction is to the cartographer's own spelling, not one IntMap writes`);
    if (!fixed.has(c.from + '→' + c.to)) out.push(`the correction «${c.from}» → «${c.to}» changes no feature — the upstream changed; remove it`);
  }
  return out;
}
