/* ============================================================================
 *  IntMap · NewsGeo accuracy report  (#R161)
 * ----------------------------------------------------------------------------
 *  Runs the LABELLED corpus (tests/newsgeo-corpus.mjs) through
 *    (a) the LEGACY locator — the gazetteer + scoreGeo that shipped in
 *        index.html, reconstructed here from the real arrays in that file so
 *        the comparison is against the actual previous behaviour, not a
 *        strawman, and
 *    (b) the NEW deterministic engine js/newsgeo.js
 *  and prints per-class accuracy plus the overall improvement.
 *
 *      node scripts/newsgeo-eval.mjs           # summary
 *      node scripts/newsgeo-eval.mjs --miss    # + every miss, both engines
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORPUS } from '../tests/newsgeo-corpus.mjs';
import { HOLDOUT } from '../tests/newsgeo-holdout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* (#R162) The legacy gazetteer arrays no longer all live in index.html: _BUILTIN_GZ and
   _EXTRA_GZ moved to js/gazetteer.js in the file split, while _DEMONYM_GZ/_ORG_GZ stayed.
   Concatenate both so this comparison still reconstructs the REAL previous behaviour. */
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8') + '\n' +
             readFileSync(join(ROOT, 'js', 'gazetteer.js'), 'utf8');

/* ---------- extract a literal array from the app source by balanced brackets ---- */
function pullArray(name) {
  const at = HTML.indexOf('const ' + name + '=[');
  if (at < 0) throw new Error('array not found in the app source: ' + name);
  let i = HTML.indexOf('[', at), depth = 0, end = -1, inStr = null;
  for (let p = i; p < HTML.length; p++) {
    const ch = HTML[p];
    if (inStr) { if (ch === '\\') p++; else if (ch === inStr) inStr = null; continue; }
    /* comments must be skipped BEFORE quote handling — an apostrophe inside a
       prose comment ("don't") would otherwise open a bogus string. */
    if (ch === '/' && HTML[p + 1] === '*') { const e = HTML.indexOf('*/', p + 2); p = (e < 0 ? HTML.length : e + 1); continue; }
    if (ch === '/' && HTML[p + 1] === '/') { const e = HTML.indexOf('\n', p); p = (e < 0 ? HTML.length : e); continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) { end = p; break; } }
  }
  if (end < 0) throw new Error('unbalanced array: ' + name);
  return JSON.parse(JSON.stringify(new Function('return ' + HTML.slice(i, end + 1))()));
}

/* ---------- LEGACY engine — a faithful port of rebuildGeoIndex + scoreGeo --- */
const TYPE_SCORE = { flashpoint: 5, city: 2, country: 0, region: 0 };
const TYPE_LOCAL = { flashpoint: 4, city: 3, country: 2, region: 1 };
const isCJKTerm = (t) => /[぀-鿿]/.test(t);

function buildLegacy(countries) {
  const merged = {};
  const push = (type, row) => { (merged[type] = merged[type] || []).push(row); };
  for (const [type, terms, lng, lat, en, jp] of [...pullArray('_BUILTIN_GZ'), ...pullArray('_EXTRA_GZ')])
    push(type, { terms, loc: [lng, lat], name: { en, jp } });
  /* countryStats-derived entries: name EN + name JP + capital NAME, all at the
     country's representative point (exactly what index.html does). */
  for (const c of countries) push('country', { terms: c.terms, loc: c.loc, name: c.name });
  for (const [dem, lng, lat, en, jp] of pullArray('_DEMONYM_GZ'))
    push('country', { terms: [dem], loc: [lng, lat], name: { en, jp }, demonym: true });
  for (const [terms, lng, lat, en, jp] of pullArray('_ORG_GZ'))
    push('country', { terms: terms.slice(), loc: [lng, lat], name: { en, jp }, org: true });
  for (const [type, terms, lng, lat, en, jp] of pullArray('_DERU_GZ'))
    push(type, { terms: terms.slice(), loc: [lng, lat], name: { en, jp } });
  for (const [dem, lng, lat, en, jp] of pullArray('_DERU_DEM'))
    push('country', { terms: [dem], loc: [lng, lat], name: { en, jp }, demonym: true });
  for (const [type, terms, lng, lat, en, jp] of pullArray('_ES_GZ'))
    push(type, { terms: terms.slice(), loc: [lng, lat], name: { en, jp } });
  for (const [dem, lng, lat, en, jp] of pullArray('_ES_DEM'))
    push('country', { terms: [dem], loc: [lng, lat], name: { en, jp }, demonym: true });

  const db = Object.entries(merged).flatMap(([type, arr]) => arr.map((g) => ({ ...g, type })));
  db.sort((a, b) => Math.max(...b.terms.map((t) => t.length)) - Math.max(...a.terms.map((t) => t.length)));
  for (const g of db) {
    g._terms = g.terms.map((term) => {
      const jp = isCJKTerm(term), cyr = /[Ѐ-ӿ]/.test(term), esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (cyr) return { term, jp: false, cyr: true,
        matchRe: new RegExp('(?:^|[^А-Яа-яЁёІіЇїЄє])' + esc + '[а-яёіїєa-z]{0,4}', 'i'),
        ctxRe: new RegExp('(?:в|во|на|из|под|у|около)\\s+' + esc, 'i') };
      return { term, jp,
        matchRe: jp ? null : new RegExp(`\\b${esc}\\b`, 'i'),
        ctxRe: jp ? new RegExp(`${esc}(?:で|へ|に|を|から|では)`) : new RegExp(`\\b(?:in|at|to|from|near|into)\\s+${esc}\\b`, 'i') };
    });
  }
  return db;
}

function legacyScore(g, title, desc) {
  let titleHit = false, descHit = false, ctx = false, firstIdx = Infinity;
  for (const t of g._terms) {
    if (t.jp) { const i = title.indexOf(t.term); if (i >= 0) { titleHit = true; if (i < firstIdx) firstIdx = i; if (!ctx && t.ctxRe.test(title)) ctx = true; } }
    else { const i = title.search(t.matchRe); if (i >= 0) { titleHit = true; if (i < firstIdx) firstIdx = i; if (!ctx && t.ctxRe.test(title)) ctx = true; } }
    if (desc && (t.jp ? desc.includes(t.term) : t.matchRe.test(desc))) { descHit = true; if (!ctx && t.ctxRe.test(desc)) ctx = true; }
  }
  if (!titleHit && !descHit) return 0;
  const tl = title.length || 1;
  const posBonus = titleHit ? Math.max(0, 3 - Math.floor((Math.min(firstIdx, tl) / tl) * 4)) : 0;
  const corro = (titleHit && descHit) ? 2 : 0;
  const demPen = (g.demonym || g.org) ? 3 : 0;
  return (titleHit ? 10 : 0) + (descHit ? 3 : 0) + (TYPE_SCORE[g.type] || 0) + (ctx ? 4 : 0) + posBonus + corro - demPen;
}

function legacyLocate(db, title, desc) {
  let best = null, bestScore = 0;
  for (const g of db) {
    const s = legacyScore(g, title, desc || '');
    if (s <= 0) continue;
    if (s > bestScore || (s === bestScore && (!best || (TYPE_LOCAL[g.type] || 0) > (TYPE_LOCAL[best.type] || 0)))) { best = g; bestScore = s; }
  }
  return best ? { lng: best.loc[0], lat: best.loc[1], name: best.name.en } : null;
}

/* ---------- NEW engine ---------- */
await import('../js/newsgeo.js');
const NG = globalThis.IntMapNewsGeo;

/* Country list handed to the LEGACY engine so both see the same ~200 countries
   (index.html feeds them in from countryStats at runtime). */
const countries = [];
for (const e of NG._ents()) {
  if (e.kind === 'country' && !e.demonym && e.iso2 !== 'EU') countries.push({ terms: [e.name.en, e.name.jp], loc: e.loc, name: e.name, iso: e.iso2 });
}
for (const e of NG._ents()) {
  if (e.capital) { const c = countries.find((x) => x.iso === e.iso2); if (c) c.terms.push(e.name.en, e.name.jp); }
}
const LEGACY = buildLegacy(countries);

/* ---------- scoring ---------- */
const R = 6371;
const km = (a, b) => {
  const r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};
function judge(res, c) {
  if (c.at === null) return !res;                       // must NOT pin
  if (!res) return false;                               // must pin
  return km([res.lng, res.lat], c.at) <= (c.km || 150);
}

export function evaluate(set) {
  const rows = (set || CORPUS).map((c) => {
    const nw = NG.locate(c.t, { desc: c.d || '', publisher: c.pub || '' });
    const lg = legacyLocate(LEGACY, c.t, c.d || '');
    return { c, nw, lg, nwOk: judge(nw, c), lgOk: judge(lg, c) };
  });
  const byTag = new Map();
  for (const r of rows) {
    const t = byTag.get(r.c.tag) || { n: 0, nw: 0, lg: 0 };
    t.n++; if (r.nwOk) t.nw++; if (r.lgOk) t.lg++;
    byTag.set(r.c.tag, t);
  }
  const nw = rows.filter((r) => r.nwOk).length, lg = rows.filter((r) => r.lgOk).length;
  return { rows, byTag, total: rows.length, nw, lg };
}

function report(label, set) {
  const { rows, byTag, total, nw, lg } = evaluate(set);
  const pc = (a, b) => ((a / b) * 100).toFixed(1).padStart(5) + '%';
  console.log('\nIntMap NewsGeo — deterministic locator accuracy (' + total + ' labelled headlines)\n');
  console.log('  class          n     legacy      new');
  console.log('  ' + '-'.repeat(44));
  for (const [tag, t] of [...byTag.entries()].sort())
    console.log('  ' + tag.padEnd(12) + String(t.n).padStart(3) + '   ' + pc(t.lg, t.n) + '   ' + pc(t.nw, t.n));
  console.log('  ' + '-'.repeat(44));
  console.log('  ' + 'TOTAL'.padEnd(12) + String(total).padStart(3) + '   ' + pc(lg, total) + '   ' + pc(nw, total));
  const errLg = total - lg, errNw = total - nw;
  console.log('\n  errors: legacy ' + errLg + '  →  new ' + errNw +
    (errNw ? '   (' + (errLg / Math.max(1, errNw)).toFixed(1) + '× fewer)' : '   (all fixed)'));
  if (process.argv.includes('--miss')) {
    console.log('\n  --- new-engine misses ---');
    for (const r of rows) if (!r.nwOk)
      console.log('   [' + r.c.tag + '] ' + r.c.t + '\n       got: ' + (r.nw ? r.nw.name.en + ' (' + r.nw.lng + ',' + r.nw.lat + ')' : 'null') +
        '   want: ' + (r.c.at ? r.c.at.join(',') : 'null'));
    console.log('\n  --- legacy misses (fixed by the new engine) ---');
    for (const r of rows) if (!r.lgOk && r.nwOk)
      console.log('   [' + r.c.tag + '] ' + r.c.t + '\n       legacy: ' + (r.lg ? r.lg.name : 'null') + '   new: ' + (r.nw ? r.nw.name.en : 'null'));
  }
  console.log('');
  return { total, nw, lg };
}

if (process.argv[1] && process.argv[1].endsWith('newsgeo-eval.mjs')) {
  report('IntMap NewsGeo — DEVELOPMENT corpus (weights were tuned on this)', CORPUS);
  report('IntMap NewsGeo — HELD-OUT set (written after the engine, scored once)', HOLDOUT);
}
