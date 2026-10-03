/* ============================================================================
 *  IntMap · scripts/lib/indicator-series.mjs — WHICH UPSTREAM SERIES EACH LAYER PAINTS, read from the tree
 * ----------------------------------------------------------------------------
 *  (map-layer-system) MEASURED 2026-10-03: four pairs of rows on the Layers panel painted the same World
 *  Bank indicator — 平均寿命 `lifeexp` (js/layer-packs.js) and 平均寿命（世界銀行） `wblife` (js/wb-layers.js)
 *  both fetch SP.DYN.LE00.IN; `unemp`/`wbunemp` both SL.UEM.TOTL.ZS; `internet`/`wbnet` both
 *  IT.NET.USER.ZS — and NOTHING in the tree said so. The two halves of each pair had drifted apart: one
 *  followed the clock, the other painted the series' own default year whatever the clock said, and the
 *  time table declared one of them a 2022 snapshot (it was not one any more). Nobody could have found the
 *  pairs from the declarations, because the declarations did not say what a row measures.
 *
 *  A declaration now says it: `measures: ['<publisher>:<series>']` (scripts/lib/layer-descriptor.mjs).
 *  This module is the READER THAT CAN REFUSE THAT CLAIM — it finds, in the code, what each row actually
 *  paints — and the one place «same series» is decided:
 *
 *    discoverSeries(files)   row key → the series literals the implementing module fetches for it
 *    seriesProblems(decls, found)   a claim the code does not make, and a series the code paints that no
 *                            declaration claims (the second is how a new duplicate cannot arrive unseen)
 *    sameSeries(decls)       the groups of rows that measure one series — derived, never listed
 *
 *  ⚠ WHAT IS DISCOVERED, AND HOW. Only the files that call the World Bank API are read for World Bank
 *  series (the host literal decides — a file that starts fetching one is read the day it does), and only
 *  the row tables shaped the way those files write them:
 *    `{id:'<key>', code:'<C>'}` · `{id:'<key>', code:['<A>','<B>']}` (summed: one series, `A+B`) ·
 *    `{id:'<key>', modes:[{… code:'<C>'}, …]}` (one row, one series per mode) · `<key>:{ind:'<C>'`.
 *  The country statistics rows are read from the code that paints them: `applyChoro('<key>',s=>s.<field>`.
 *  ⚠ PURE: reads text it is handed, no fs. The callers (scripts/layer-descriptors.mjs, the tests) read files.
 * ==========================================================================*/

/** the World Bank's API host: a file containing it fetches World Bank series */
export const WORLD_BANK_HOST = 'api.worldbank.org';
/** the publishers a `measures` claim may name, and what each means */
export const PUBLISHERS = Object.freeze({
  worldbank: 'a World Bank WDI series code (a summed series is `A+B`)',
  countrystats: 'a field of the country table js/time-countries.js keeps in step with the clock',
});
/** the shape of one claim */
export const CLAIM = /^(worldbank|countrystats):[A-Za-z0-9_.+]+$/;

/* one row of a module's table: the series the module paints for it, and the row ids the same file can mean by
   its key — `'<prefix>'+key` for every id prefix the file composes (`'bx-'+L.id`, `'beta-dl-'+key`) and every
   literal id ending «-<key>» it writes out (`'dl-milSpend'`). Which declaration that is, is decided against
   js/layers/ (rowFor), never by the key's spelling alone: `precip` is the World Bank row in js/layer-packs.js
   and the IMERG raster `dl-precip` elsewhere — the same short word, two layers. */
const add = (m, key, v, src) => {
  if (!m.has(key)) m.set(key, { series: new Set(), ids: new Set() });
  const e = m.get(key); e.series.add(v);
  for (const p of src.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)*-)'\s*\+/g)) e.ids.add(p[1] + key);
  for (const l of src.matchAll(new RegExp("'([a-z0-9]+(?:-[a-z0-9]+)*-" + key.replace(/[^A-Za-z0-9_]/g, '') + ")'", 'g'))) e.ids.add(l[1]);
};

/**
 * Every series a row of the tree paints, by the module's key for the row.
 * @param {[string, string][]} files  [file name, code with comments stripped]
 * @returns {Map<string, { series: Set<string>, ids: Set<string> }>}
 */
export function discoverSeries(files) {
  const out = new Map();
  for (const [, src] of files) {
    if (src.includes(WORLD_BANK_HOST)) {
      /* `{id:'wbX', code:'C'}` and `{id:'wbX', code:['A','B']}` */
      for (const m of src.matchAll(/\{\s*id\s*:\s*'([A-Za-z0-9_]+)'\s*,\s*code\s*:\s*(\[[^\]]*\]|'[^']+')/g)) {
        const codes = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
        if (codes.length) add(out, m[1], 'worldbank:' + codes.join('+'), src);
      }
      /* `{id:'wbX', modes:[ {…code:'C'…}, … ]}` — the bracket the modes list opens is matched by depth */
      for (const m of src.matchAll(/\{\s*id\s*:\s*'([A-Za-z0-9_]+)'\s*,\s*modes\s*:\s*\[/g)) {
        let i = m.index + m[0].length, depth = 1;
        while (i < src.length && depth) { const c = src[i++]; if (c === '[') depth++; else if (c === ']') depth--; }
        for (const c of src.slice(m.index, i).matchAll(/\bcode\s*:\s*'([^']+)'/g)) add(out, m[1], 'worldbank:' + c[1], src);
      }
      /* `key:{ind:'C'` — the key is a whole word (a word boundary before it) */
      for (const m of src.matchAll(/\b([A-Za-z0-9_]+)\s*:\s*\{\s*ind\s*:\s*'([^']+)'/g)) add(out, m[1], 'worldbank:' + m[2], src);
    }
    /* the country-table choropleths: `applyChoro('<key>',s=>s.<field>` */
    for (const m of src.matchAll(/applyChoro\(\s*'([A-Za-z0-9_]+)'\s*,\s*s\s*=>\s*s\.([A-Za-z0-9_]+)/g)) add(out, m[1], 'countrystats:' + m[2], src);
  }
  return out;
}

/**
 * Claims against what the code paints, as sentences. `decls` are layer declarations (with `id`, `measures`).
 * @param {any[]} decls @param {Map<string, { series: Set<string>, ids: Set<string> }>} found
 */
export function seriesProblems(decls, found) {
  const out = [];
  const ds = decls.filter((d) => d && d.id);
  const painted = new Map();   /* declaration → the series the code paints for it */
  for (const [key, e] of found) {
    const d = rowFor(ds, key, e);
    if (!d) { out.push('the code paints ' + [...e.series].join(', ') + ' for its row `' + key + '`, and no declaration in js/layers/ is that row (the ids the file can mean: ' + ([...e.ids].join(', ') || 'none') + ')'); continue; }
    if (!painted.has(d)) painted.set(d, new Set());
    for (const c of e.series) painted.get(d).add(c);
  }
  for (const d of ds) {
    const has = painted.get(d) || new Set();
    for (const c of d.measures || []) {
      if (!CLAIM.test(c)) out.push(d.id + '.js: measures `' + c + '` — a claim is «' + Object.keys(PUBLISHERS).join('|') + ':<series>»');
      else if (!has.has(c)) out.push(d.id + '.js: measures `' + c + '` — the code that paints this row does not fetch or read that series');
    }
    for (const c of has) if (!(d.measures || []).includes(c)) out.push(d.id + '.js: the code paints `' + c + '` for this row, and the declaration does not say so — add it to `measures`');
  }
  return out;
}

/**
 * The declaration a module's row is: the ONE declaration whose id the same file names for the key.
 * @param {any[]} ds @param {string} key @param {{ ids: Set<string> }} e
 */
export function rowFor(ds, key, e) {
  const hit = ds.filter((d) => e.ids.has(d.id));
  return hit.length === 1 ? hit[0] : null;
}

/**
 * The rows that measure one series, as groups of two or more — derived from the declarations alone.
 * @param {any[]} decls
 * @returns {{ series: string, ids: string[] }[]}
 */
export function sameSeries(decls) {
  const by = new Map();
  for (const d of decls) for (const c of (d && d.measures) || []) { if (!by.has(c)) by.set(c, []); by.get(c).push(d.id); }
  return [...by].filter(([, ids]) => ids.length > 1).map(([series, ids]) => ({ series, ids: ids.slice().sort() }))
    .sort((a, b) => (a.series < b.series ? -1 : a.series > b.series ? 1 : 0));
}
