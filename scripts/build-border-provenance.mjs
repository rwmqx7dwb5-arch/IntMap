#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHAT THE SHIPPED BORDER RECORDS DROPPED, PUT BACK BESIDE THEM — the provenance indexes
 *  (border-provenance)
 * ----------------------------------------------------------------------------
 *  The bundles the time machine draws keep only what drawing needs. Three facts a reader asking
 *  「この線の根拠は？」 needs were dropped on the way, and this file writes them back, row by row:
 *
 *    data/border-provenance-ohm.json   data/hist-borders.js and data/hist-borders-late.js keep a
 *                                      relation's name, Wikidata id and dates — NOT its OpenHistoricalMap
 *                                      relation id, and not the words its `start_date` / `end_date`
 *                                      tags actually say. So the map could not tell «OHM wrote 1871»
 *                                      from «the build clamped this end to the successor's start».
 *                                      Here: the relation id, the two tags verbatim, who set each date
 *                                      the bundle draws, and the relation's own `source*`, `fixme*`,
 *                                      `note*`, `start_event*` / `end_event*` tags verbatim.
 *    data/border-provenance-clio.json  data/hist-clio.js keeps Cliopatria's name, QID and Wikipedia
 *                                      title, and a row's dates after the build cut it where a more
 *                                      precise record changes. Here: the upstream row's own FromYear /
 *                                      ToYear, its SeshatID, and whether each drawn edge is Cliopatria's
 *                                      year or a cut.
 *    data/border-provenance-gaps.json  the subdivision gap records (HIST_ADMIN_GAPS, js/border-coast.js)
 *                                      lose their columns 10-12 when js/hist-bundles.js splices them
 *                                      into the first tier — so a reconstructed province could not name
 *                                      the dossier it was reconstructed from. Here: each row's publisher
 *                                      key, unit key and country, and each record's own `sources`.
 *
 *  ⚠ EVERY ROW CARRIES ITS FINGERPRINT (js/border-provenance.js `rowKey`, the SAME function the page runs),
 *  and the card uses a fact only when the drawn row's fingerprint equals it. A bundle rebuilt after this
 *  index is therefore answered «the index does not describe this row», never with the old row's id.
 *  ⚠ NOTHING IS GUESSED. A row that matches no upstream row, or more than one, is written as such
 *  (`null`, or every candidate) — never as the first one found.
 *  ⚠ THE CACHES ARE THE BUILDERS' OWN (scripts/build-hist-borders.mjs, scripts/build-hist-clio.mjs), read,
 *  never fetched: this script makes no network request.
 *
 *    node scripts/build-border-provenance.mjs            write the three indexes
 *    node scripts/build-border-provenance.mjs --check    every index row still keys a shipped row (no cache needed)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { rowKey, PROVENANCE_INDEX } from '../js/border-provenance.js';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { OPENHISTORICALMAP, CLIOPATRIA } from './lib/upstream-cadence.mjs';

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。 */
export const GOVERNANCE = {
  'data/border-provenance-ohm.json': {
    publisher: 'OpenHistoricalMap',
    url: 'https://www.openhistoricalmap.org/',
    licence: 'CC0 1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false,
    schema: 'scripts/build-border-provenance.mjs --check (every row keys its shipped row)',
    ...OPENHISTORICALMAP,
    builtBy: 'scripts/build-border-provenance.mjs',
  },
  'data/border-provenance-clio.json': {
    publisher: 'Seshat Global History Databank (Cliopatria)',
    url: 'https://github.com/Seshat-Global-History-Databank/cliopatria',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true,
    creditRequired: true,
    paidBy: 'Cliopatria — Seshat Global History Databank (CC BY 4.0)',
    schema: 'scripts/build-border-provenance.mjs --check (every row keys its shipped row)',
    ...CLIOPATRIA,
    builtBy: 'scripts/build-border-provenance.mjs',
  },
  'data/border-provenance-gaps.json': {
    publisher: 'IntMap',
    url: 'https://github.com/rwmqx7dwb5-arch/IntMap',
    licence: 'IntMap licence (LICENSE)',
    licenceUrl: 'https://github.com/rwmqx7dwb5-arch/IntMap/blob/main/LICENSE',
    attribution: false,
    schema: 'scripts/build-border-provenance.mjs --check (every row keys its shipped row)',
    cadence: 'static',
    cadenceBasis: {
      observed: 'the keys and source lists are copied from the gap records under data/ when they are rebuilt; nothing upstream is read',
      expires: 'whenever a gap record (HIST_ADMIN_GAPS in js/border-coast.js) is rebuilt — the fingerprints then refuse every changed row until this is re-run',
      canon: 'scripts/build-border-provenance.mjs',
    },
    builtBy: 'scripts/build-border-provenance.mjs',
  },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HB = join(ROOT, 'data', 'hist-borders.js'), HBL = join(ROOT, 'data', 'hist-borders-late.js'), CL = join(ROOT, 'data', 'hist-clio.js');
const HB_CACHE = process.env.INTMAP_HISTB_CACHE || join(tmpdir(), 'intmap-histb-cache');
/* the three destinations, spelled where they are written (scripts/data-governance.mjs reads the writes from the bytes);
   `check` holds them equal to js/border-provenance.js PROVENANCE_INDEX, the names the page reads */
const OUT_OHM = join(ROOT, 'data', 'border-provenance-ohm.json');
const OUT_CLIO = join(ROOT, 'data', 'border-provenance-clio.json');
const OUT_GAPS = join(ROOT, 'data', 'border-provenance-gaps.json');
const OUTS = { ohm: OUT_OHM, clio: OUT_CLIO, gaps: OUT_GAPS };
const evalBundle = (file) => { const w = {}; new Function('window', readFileSync(file, 'utf8'))(w); return Object.values(w)[0]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
/* the file states its own provenance, from the one declaration above (no second spelling of it) */
const headOf = (k) => { const g = GOVERNANCE[k]; const o = {}; for (const f of ['publisher', 'url', 'licence', 'licenceUrl', 'attribution', 'creditRequired', 'paidBy', 'cadence', 'builtBy', 'schema']) if (g[f] !== undefined) o[f] = g[f]; return o; };
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/* the keys of an OHM relation's tags that say where it came from and what its mappers doubt, verbatim */
const SAYS = /^(source|fixme|note|start_event|end_event)(:|$)/i;
export function sayingTags(tags) {
  const o = {}; let any = false;
  for (const k of Object.keys(tags || {}).sort()) if (SAYS.test(k)) { o[k] = String(tags[k]); any = true; }
  return any ? o : null;
}

/** Who set one drawn edge of an OHM row — `raw` is the relation's tag (or null), `shown` the bundle's [y,m,d].
 *  → 'upstream' (the tag names that day) | 'partial' (the tag names a year or month; the bundle reads its first
 *  instant, or for an end the first instant after it) | 'unstated' (no tag; the bundle draws it open) |
 *  'derived' (the bundle's day is not what the tag says) | 'unparsed' (a tag the build's own parser rejects). */
export function ohmEdge(raw, shown, isEnd, parse) {
  const sentinel = isEnd ? [3000, 1, 1] : [-99999, 1, 1];
  if (raw == null || String(raw).trim() === '') return same(shown, sentinel) ? 'unstated' : 'derived';
  const p = parse(String(raw), isEnd);
  if (!p) return 'unparsed';
  if (!same(p, shown)) return 'derived';
  return /^-?\d{1,4}-\d{1,2}-\d{1,2}/.test(String(raw).trim()) ? 'upstream' : 'partial';
}

/* ── OpenHistoricalMap ───────────────────────────────────────────────────── */
async function ohmIndex() {
  const { parseDate, LANGS } = await import('./build-hist-borders.mjs');
  const idx = JSON.parse(readFileSync(join(HB_CACHE, 'index.json'), 'utf8'));
  const late = existsSync(join(HB_CACHE, 'late.json')) ? JSON.parse(readFileSync(join(HB_CACHE, 'late.json'), 'utf8')) : null;
  const enTag = (LANGS.find((l) => l[0] === 'en') || [])[1];
  const nameOf = (t) => String(t[enTag] || '').trim() || String(t.name || '').trim();
  const byId = new Map(idx.elements.map((e) => [e.id, e]));
  /* the elements by the identity a bundle row keeps: English name, Wikidata id, start as parsed */
  const byKey = new Map(), byDates = new Map();
  const startsOf = new Map();   /* wd → the starts of every relation of that entity (a clamped end is one of them) */
  for (const el of idx.elements) {
    const t = el.tags || {}, en = nameOf(t); if (!en) continue;
    const s = parseDate(t.start_date, false) || [-99999, 1, 1];
    const k = en + '\u0000' + (t.wikidata || '') + '\u0000' + s.join(',');
    if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(el);
    /* the second identity: name and BOTH dates as the tags parse — used only when the Wikidata id differs */
    const k2 = en + '\u0000' + s.join(',') + '\u0000' + (parseDate(t.end_date, true) || [3000, 1, 1]).join(',');
    if (!byDates.has(k2)) byDates.set(k2, []); byDates.get(k2).push(el);
    if (t.wikidata) { if (!startsOf.has(t.wikidata)) startsOf.set(t.wikidata, new Set()); startsOf.get(t.wikidata).add(ymd(...s)); }
  }
  const edges = (el, sArr, eArr) => {
    const t = el.tags || {};
    let eBy = ohmEdge(t.end_date, eArr, true, parseDate), basis = null;
    if (eBy === 'derived') {
      if (t.wikidata && startsOf.get(t.wikidata) && startsOf.get(t.wikidata).has(ymd(...eArr))) basis = 'successor';
      else if (t.start_date && t.end_date && String(t.start_date).trim() === String(t.end_date).trim()) basis = 'one-day';
    }
    return { s: ohmEdge(t.start_date, sArr, false, parseDate), e: eBy, basis };
  };
  const rowOf = (els, f, sBy, eBy, sBasis, eBasis) => {
    if (!els.length) return [rowKey(f), null];
    const t0 = els[0].tags || {};
    return [rowKey(f), els.length === 1 ? els[0].id : els.map((e) => e.id), t0.start_date == null ? null : String(t0.start_date), sBy, sBasis,
      t0.end_date == null ? null : String(t0.end_date), eBy, eBasis, sayingTags(t0)];
  };

  /* data/hist-borders.js — a row's start is never moved by the build (clamping moves ends only) */
  const hb = evalBundle(HB);
  let unmatched = 0, ambiguous = 0;
  const hbRows = hb.feats.map((f) => {
    const sArr = [f[2], f[3], f[4]], eArr = [f[5], f[6], f[7]];
    let els = byKey.get(f[0].en + '\u0000' + (f[1] || '') + '\u0000' + sArr.join(',')) || [];
    /* duplicates share a start: keep those whose end the bundle could have drawn */
    /* the bundle's Wikidata id may differ from the relation's tag: then name, start AND end must all agree,
       and agree with exactly one relation */
    if (!els.length) { const c = byDates.get(f[0].en + '\u0000' + sArr.join(',') + '\u0000' + eArr.join(',')) || []; if (c.length === 1) els = c; }
    if (els.length > 1) { const k = els.filter((el) => { const e = edges(el, sArr, eArr); return e.e !== 'derived' || e.basis; }); if (k.length) els = k; }
    if (!els.length) unmatched++; else if (els.length > 1) ambiguous++;
    const e = els.length ? edges(els[0], sArr, eArr) : null;
    return rowOf(els, f, e && e.s, e && e.e, null, e && e.basis);
  });

  /* data/hist-borders-late.js — rows are pieces of late.json's relations, cut at 1886-01-01 and where CShapes changes */
  const L = existsSync(HBL) ? evalBundle(HBL) : null;
  let lateRows = [], lateUnmatched = 0;
  if (L && late) {
    const T0 = ymd(L.window[0], 1, 1), T1 = ymd(L.window[1] + 1, 1, 1);
    const recsBy = new Map();
    for (const r of late.recs) { const k = r.names.en + '\u0000' + (r.wd || ''); if (!recsBy.has(k)) recsBy.set(k, []); recsBy.get(k).push(r); }
    lateRows = L.feats.map((f) => {
      const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]);
      const recs = (recsBy.get(f[0].en + '\u0000' + (f[1] || '')) || []).filter((r) => ymd(...r.sArr) <= s && e <= ymd(...r.eArr));
      if (!recs.length) { lateUnmatched++; return [rowKey(f), null]; }
      const els = recs.map((r) => byId.get(r.id)).filter(Boolean);
      if (!els.length) { lateUnmatched++; return [rowKey(f), recs.length === 1 ? recs[0].id : recs.map((r) => r.id)]; }
      const r = recs[0], rs = ymd(...r.sArr), re = ymd(...r.eArr);
      const full = edges(els[0], r.sArr, r.eArr);
      const sBy = s === rs ? full.s : 'derived', sBasis = s === rs ? null : (s === T0 && rs < T0 ? 'window-start' : 'cut-cshapes');
      const eBy = e === re ? full.e : 'derived', eBasis = e === re ? full.basis : (e === T1 ? 'window-end' : 'cut-cshapes');
      const row = rowOf([els[0]], f, sBy, eBy, sBasis, eBasis);
      if (recs.length > 1) row[1] = recs.map((x) => x.id);   /* more than one relation holds this piece: every one is named */
      return row;
    });
  }
  console.error(`ohm: hist-borders ${hbRows.length} rows (${unmatched} unmatched, ${ambiguous} with more than one relation) · hist-borders-late ${lateRows.length} rows (${lateUnmatched} unmatched)`);
  return { v: 1, ...headOf('data/border-provenance-ohm.json'), src: 'OpenHistoricalMap (openhistoricalmap.org) · CC0 1.0 · relation ids and tags read by IntMap from the build cache of scripts/build-hist-borders.mjs',
    /* the day the cache's relation index was written — the tags below are what OHM said THEN */
    retrievedAt: statSync(join(HB_CACHE, 'index.json')).mtime.toISOString().slice(0, 10),
    built: new Date().toISOString().slice(0, 10),
    columns: ['key', 'relation', 'start_date', 'startBy', 'startBasis', 'end_date', 'endBy', 'endBasis', 'tags'],
    sets: { 'data/hist-borders.js': hbRows, 'data/hist-borders-late.js': lateRows } };
}

/* ── Cliopatria ──────────────────────────────────────────────────────────── */
async function clioIndex() {
  const { readUpstream, astro } = await import('./build-hist-clio.mjs');
  const feats = readUpstream();
  const d = evalBundle(CL);
  const bare = (n) => (/^\(.*\)$/.test(n) ? n.slice(1, -1) : n);
  const by = new Map();
  for (const ft of feats) { const p = ft.properties; if (p.Type !== 'POLITY') continue;
    const k = bare(p.Name) + '\u0000' + (p.Wikipedia || ''); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const top = ymd(d.window[1] + 1, 1, 1);
  let unmatched = 0, ambiguous = 0;
  const rows = d.feats.map((f) => {
    const s = ymd(f[2], f[3], f[4]), e = ymd(f[5], f[6], f[7]), m = f[9] || {};
    /* a name the review withholds is blank on the row and kept as `wn`; a realm row is Cliopatria's «(Name)» */
    const nm = f[0].en || m.wn || '';
    const cands = (by.get(nm + '\u0000' + (m.w || '')) || []).filter((p) => /^\(.*\)$/.test(p.Name) === !!m.r).filter((p) => {
      const s0 = ymd(astro(p.FromYear), 1, 1), e0 = ymd(astro(p.ToYear) + 1, 1, 1);
      /* a held row (review.json `ground`) is drawn back before its upstream start: its span is the review's */
      return (s0 <= s || (f[9] && f[9].hs != null)) && e <= e0;
    });
    if (!cands.length) { unmatched++; return [rowKey(f), null]; }
    if (cands.length > 1) ambiguous++;
    const p = cands[0], s0 = ymd(astro(p.FromYear), 1, 1), e0 = ymd(astro(p.ToYear) + 1, 1, 1);
    const sBy = s === s0 ? 'partial' : 'derived', sBasis = s === s0 ? null : ((f[9] && f[9].hs != null && s < s0) ? 'held' : 'cut-precise');
    const eBy = e === e0 ? 'partial' : 'derived', eBasis = e === e0 ? null : (e === top ? 'window-end' : 'cut-precise');
    return [rowKey(f), cands.length === 1 ? 1 : cands.length, p.FromYear, p.ToYear, sBy, sBasis, eBy, eBasis, p.SeshatID || null, p.Wikidata || null, p.MemberOf || null, p.Components || null];
  });
  console.error(`clio: ${rows.length} rows (${unmatched} unmatched, ${ambiguous} matching more than one upstream row)`);
  return { v: 1, ...headOf('data/border-provenance-clio.json'), src: d.src.split(' · adapted by')[0] + ' · upstream rows read by IntMap from the build cache of scripts/build-hist-clio.mjs',
    citation: d.citation || null, upstream: d.upstream || null, built: new Date().toISOString().slice(0, 10),
    columns: ['key', 'candidates', 'FromYear', 'ToYear', 'startBy', 'startBasis', 'endBy', 'endBasis', 'SeshatID', 'Wikidata', 'MemberOf', 'Components'],
    sets: { 'data/hist-clio.js': rows } };
}

/* ── the gap records ─────────────────────────────────────────────────────── */
function gapsIndex() {
  const sets = {};
  for (const g of HIST_ADMIN_GAPS) {
    const f = join(ROOT, g.file); if (!existsSync(f)) continue;
    const d = evalBundle(f);
    sets[g.file] = { src: d.src || null, built: d.built || null, sources: d.sources || null,
      tolerance: d.tolerance != null ? d.tolerance : ((d.precision && d.precision.targetTolerance != null) ? d.precision.targetTolerance : null),
      rows: d.feats.map((r) => [rowKey(r), r[10] == null ? null : r[10], r[11] == null ? null : r[11], r[12] == null ? null : r[12]]) };
  }
  console.error('gaps: ' + Object.entries(sets).map(([k, v]) => k + ' ' + v.rows.length).join(' · '));
  return { v: 1, ...headOf('data/border-provenance-gaps.json'), src: 'IntMap · the keys and source lists of its subdivision gap records (js/border-coast.js HIST_ADMIN_GAPS), derived by copying them from each record — each set below keeps the src of its record, which states its terms; the compilation is under the IntMap LICENSE', built: new Date().toISOString().slice(0, 10),
    columns: ['key', 'publisherKey', 'unit', 'country'], sets };
}

/* ── --check: every index row still keys the shipped row at its position ── */
export function check(read = (p) => readFileSync(join(ROOT, p), 'utf8'), has = (p) => existsSync(join(ROOT, p))) {
  const bad = [];
  for (const k of Object.keys(PROVENANCE_INDEX)) if (!OUTS[k] || join(ROOT, PROVENANCE_INDEX[k]) !== OUTS[k]) bad.push('the page reads ' + PROVENANCE_INDEX[k] + ' but this script writes ' + (OUTS[k] || 'nothing') + ' for it');
  const ev = (p) => { const w = {}; new Function('window', read(p))(w); return Object.values(w)[0]; };
  for (const k of Object.keys(PROVENANCE_INDEX)) {
    const p = PROVENANCE_INDEX[k];
    if (!has(p)) { bad.push(p + ' is missing — node scripts/build-border-provenance.mjs'); continue; }
    const ix = JSON.parse(read(p));
    if (!ix || ix.v !== 1 || !ix.sets || typeof ix.src !== 'string' || !ix.src) { bad.push(p + ' has no v:1 / src / sets'); continue; }
    for (const [file, set] of Object.entries(ix.sets)) {
      if (!has(file)) { bad.push(p + ' indexes ' + file + ', which is not shipped'); continue; }
      const d = ev(file), rows = Array.isArray(set) ? set : set.rows;
      if (!Array.isArray(rows) || rows.length !== d.feats.length) { bad.push(`${p}: ${file} has ${d.feats.length} rows, the index ${rows ? rows.length : 0} — rebuild the index`); continue; }
      let off = 0; rows.forEach((r, i) => { if (r[0] !== rowKey(d.feats[i])) off++; });
      if (off) bad.push(`${p}: ${off} row(s) of ${file} no longer match their fingerprint — rebuild the index`);
    }
  }
  /* every gap record the page splices is indexed (the list is js/border-coast.js's, discovered, not copied) */
  const gx = has(PROVENANCE_INDEX.gaps) ? JSON.parse(read(PROVENANCE_INDEX.gaps)) : null;
  if (gx) for (const g of HIST_ADMIN_GAPS) if (has(g.file) && !gx.sets[g.file]) bad.push(PROVENANCE_INDEX.gaps + ' does not index ' + g.file);
  return bad;
}

const arg = process.argv.slice(2);
if (process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  if (arg.includes('--check')) {
    const bad = check();
    if (bad.length) { console.error('border-provenance: ' + bad.length + ' problem(s)'); for (const b of bad) console.error('  ' + b); process.exitCode = 1; }
    else console.log('border-provenance ok — every index row keys its shipped row');
  } else {
    const ohm = await ohmIndex(); writeFileSync(OUT_OHM, JSON.stringify(ohm) + '\n');
    const clio = await clioIndex(); writeFileSync(OUT_CLIO, JSON.stringify(clio) + '\n');
    const gaps = gapsIndex(); writeFileSync(OUT_GAPS, JSON.stringify(gaps) + '\n');
    for (const k of Object.keys(OUTS)) console.error(OUTS[k] + ' ' + readFileSync(OUTS[k]).length + ' B');
  }
}
