/* ============================================================================
 *  IntMap · TABLE BIND — which column of a table names a place, and which place each row names   (data-studio)
 * ----------------------------------------------------------------------------
 *  「自分の表を、地図・分析・公開まで 1 つの面で」. A table with latitude and longitude columns has reached the map
 *  since #R576, and one with neither has been importable since #R738 — as the right-hand side of a `join` the
 *  reader had to assemble by hand. What no part of the program could do is the step every spreadsheet of
 *  statistics needs: look at a column of 「Japan / Deutschland / France」, 「JPN / DEU」, 「392 / 276」 or
 *  「Osaka / Lyon」 and say which places those are. This file is that step and nothing else.
 *
 *  ⚠ PURE. No DOM, no fetch, no window: the country records and the gazetteer are HANDED IN (js/data-studio.js
 *  reads them through the data door; the node checks read the same files from disk), so the answer can be
 *  measured on the real data in Node and is the same in the page.
 *
 *  ⚠ NO NAME IS WRITTEN HERE. The names a country is matched by are DISCOVERED:
 *    · Intl.DisplayNames (type 'region') — every locale the platform can name regions in, found by asking
 *      `supportedLocalesOf` about every two-letter language code plus the locales IntMap's own languages use
 *      (js/lang-registry.js). Nothing here lists a language either.
 *    · Natural Earth's own name columns on the country record (`NAME`, `NAME_JA`, `NAME_LONG`, `ADMIN`, …) —
 *      the same records the map draws.
 *    The CODES (ISO 3166-1 alpha-2 / alpha-3 / numeric) and the correspondence between them are Natural Earth's
 *    `ISO_A2_EH` / `ISO_A3_EH` / `ISO_N3_EH` — the repository's country data (data/ne-countries/, read by
 *    js/ne-countries.js), so a code resolves to exactly the polygon the map will colour.
 *    City names are GeoNames' (data/gazetteer-phone.json.gz: `en`, `ja`, `disp`, `alt`).
 *
 *  ⚠ AMBIGUITY IS AN ANSWER, NOT A TIE TO BREAK. 「Springfield」 is many places; when the same row names a country
 *  the candidates are narrowed to it, and when it does not the row is reported `ambiguous` with its candidates
 *  — never the most populous one chosen in silence (.agents/rules/no-ad-hoc-hardcoding.md §2: the code refuses
 *  what it has no grounds for; the reader decides).
 *  ⚠ A QUANTITY IS NOT A KEY. A column of small integers matches ISO numeric codes by accident (4 is Afghanistan,
 *  12 is Algeria), so a numeric column is only offered when its cells are WRITTEN the way the standard writes the
 *  code — three digits, the leading zeros kept (ISO 3166-1 numeric is a three-digit code) — evidenced by at least
 *  one cell such as 「004」. A reader whose file dropped the zeros can still choose the column by hand (`bind`
 *  with kind 'numeric' accepts 「4」), which is the reader's statement, not this file's guess.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';

/* ══ HOW MUCH OF A COLUMN MUST NAME PLACES FOR IT TO BE OFFERED AS THE KEY ═════════════════════════════
   ESTIMATE, stated as one: 0.6 — a column is offered automatically when at least three cells in five name a
   place of one kind. Lower than js/geo-import.js's 0.9 for coordinates on purpose: a coordinate is a number
   whose range proves what it is, while a place name is spelled however the table's author spelled it
   (「Korea, Rep.」, 「USA」), so a real key column routinely carries a minority the indexes do not know — and
   those rows are not dropped, they are LISTED as unresolved for the reader. Below the bar the column is still
   reported with its ratio and the reader can choose it. Expires when a corpus of real statistical tables is
   measured against it (none has been). 正本: this line. */
export const DETECT_MIN = 0.6;
/* ⚠ HOW MANY CELLS OF A COLUMN ARE READ TO DECIDE WHAT IT IS — all of them. A sample would be the first rows,
   and a table sorted by region names its last continent only at the bottom. The indexes are maps, so a
   column of 200,000 cells (js/geo-import.js's feature ceiling) is 200,000 lookups. */

/** the KINDS a column can be, finest first in a tie: a code says exactly one country, a name may say several */
export const KINDS = Object.freeze(['iso3', 'iso2', 'numeric', 'country', 'city']);
const COUNTRY_KINDS = ['iso3', 'iso2', 'numeric', 'country'];

/* ══ NAMES, NORMALISED — the same function on both sides of every comparison ═══════════════════════════
   Unicode compatibility form, lower case, the combining accents of the Latin, Greek and Cyrillic scripts
   removed (U+0300–U+036F only: the kana voicing marks U+3099/U+309A are NOT accents, and removing them would
   make ガ a カ), punctuation and brackets to spaces, runs of space to one. */
export function normName(s) {
  let t = String(s == null ? '' : s).normalize('NFKC').toLowerCase();
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
  t = t.replace(/[()\[\]{}「」『』【】〈〉《》"“”‘’'`´.,，、。;:!?・·\-‐‑‒–—―_/\\&＆]/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}
/** every form a name is filed under: as written, and without its parenthetical (「Congo (DRC)」 → 「congo」) */
function nameForms(s) {
  const out = [], a = normName(s), b = normName(String(s == null ? '' : s).replace(/[(（\[［][^)）\]］]*[)）\]］]/g, ' '));
  if (a) out.push(a); if (b && b !== a) out.push(b);
  return out;
}

/* ══ THE COUNTRIES — Natural Earth's records, keyed once ═══════════════════════════════════════════════
   `key` is the identity a row binds to and the column the polygons are joined on: the ISO alpha-3 code where
   Natural Earth states one (`ISO_A3_EH`), else Natural Earth's own ADM0_A3 — which is how Kosovo (alpha-2 XK,
   no alpha-3) is still reachable by its alpha-2 code and its name. Several features may share a key (Australia's
   external territories carry ISO_A3_EH AUS); the NAMES are taken only from the feature whose ADM0_A3 is the key
   itself, so 「Ashmore and Cartier Is.」 is not filed as a name of Australia. '-99' is Natural Earth's «none». */
const NONE = (v) => v == null || String(v).trim() === '' || String(v).trim() === '-99';
/** placeKey(props) → the join key of one Natural Earth record (null when it states no identity) */
export function placeKey(p) {
  if (!p) return null;
  if (!NONE(p.ISO_A3_EH)) return String(p.ISO_A3_EH).trim().toUpperCase();
  if (!NONE(p.ADM0_A3)) return String(p.ADM0_A3).trim().toUpperCase();
  return null;
}
/* Natural Earth's name columns, recognised by their own column naming (NAME, NAME_xx, NAME_LONG …) plus the two
   it writes the full name in — not by a list of languages. */
const NE_NAME_COL = (k) => /^NAME(_[A-Z]{2,4})?$/.test(k) || k === 'NAME_LONG' || k === 'NAME_ALT' || k === 'NAME_SORT' || k === 'NAME_CIAWF' || k === 'ADMIN' || k === 'FORMAL_EN';
/** countriesFrom(features) → [{key, iso2, iso3, n3, name, names:[{name, source}]}] */
export function countriesFrom(features) {
  const by = new Map();
  for (const f of (features || [])) {
    const p = (f && f.properties) || {}, key = placeKey(p); if (!key) continue;
    let c = by.get(key);
    if (!c) { c = { key, iso2: null, iso3: null, n3: null, name: '', names: [] }; by.set(key, c); }
    if (!c.iso2 && !NONE(p.ISO_A2_EH)) c.iso2 = String(p.ISO_A2_EH).trim().toUpperCase();
    if (!c.iso3 && !NONE(p.ISO_A3_EH)) c.iso3 = String(p.ISO_A3_EH).trim().toUpperCase();
    if (!c.n3 && !NONE(p.ISO_N3_EH)) c.n3 = String(p.ISO_N3_EH).trim().padStart(3, '0');
    if (String(p.ADM0_A3 || '').toUpperCase() === key) {
      if (!c.name && typeof p.NAME === 'string') c.name = p.NAME;
      for (const k of Object.keys(p)) if (NE_NAME_COL(k) && typeof p[k] === 'string' && p[k].trim()) c.names.push({ name: p[k], source: 'ne:' + k });
    }
  }
  return [...by.values()];
}

/* ══ WHICH LOCALES CAN NAME A REGION HERE — asked, not listed ══════════════════════════════════════════ */
/** every locale this platform's Intl.DisplayNames supports among: all two-letter language codes, and the HTML
    language tags of IntMap's own languages (zh-Hant / zh-Hans are not two letters) */
function discoverLocales() {
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return [];
  const cands = [];
  for (let a = 97; a < 123; a++) for (let b = 97; b < 123; b++) cands.push(String.fromCharCode(a, b));
  try { (IntMapLang.LANGS || []).forEach((r) => { if (r && r.html && cands.indexOf(r.html) < 0) cands.push(r.html); }); } catch (_) { }
  try { return Intl.DisplayNames.supportedLocalesOf(cands); } catch (_) { return []; }
}

/** countryIndex(countries, {locales?}) → the lookups a column is matched against */
export function countryIndex(countries, opts) {
  const list = countries || [];
  const locales = (opts && Array.isArray(opts.locales)) ? opts.locales : discoverLocales();
  const byKey = new Map(), code2 = new Map(), code3 = new Map(), n3 = new Map(), names = new Map();
  const file = (form, key, source) => { let e = names.get(form); if (!e) { e = { keys: new Set(), sources: new Set() }; names.set(form, e); } e.keys.add(key); e.sources.add(source); };
  for (const c of list) {
    byKey.set(c.key, c);
    if (c.iso2 && !code2.has(c.iso2)) code2.set(c.iso2, c.key);
    if (c.iso3 && !code3.has(c.iso3)) code3.set(c.iso3, c.key);
    if (c.n3 && !n3.has(c.n3)) n3.set(c.n3, c.key);
    for (const nm of c.names) for (const f of nameForms(nm.name)) file(f, c.key, nm.source);
  }
  for (const loc of locales) {
    let dn = null; try { dn = new Intl.DisplayNames([loc], { type: 'region', fallback: 'none' }); } catch (_) { dn = null; }
    if (!dn) continue;
    for (const c of list) {
      if (!c.iso2) continue;
      let nm; try { nm = dn.of(c.iso2); } catch (_) { nm = undefined; }
      if (!nm || nm === c.iso2) continue;
      for (const f of nameForms(nm)) file(f, c.key, 'intl:' + loc);
    }
  }
  return { kind: 'countries', byKey, code2, code3, n3, names, locales: locales.slice(), count: list.length };
}

/* ══ THE CITIES — GeoNames, read by the file's own field names ═════════════════════════════════════════ */
/** cityIndex(doc) → {byName: Map(form → [city]), byGid, count, attribution}. `doc` is data/gazetteer-phone.json
    ({fields, rows, attribution}); the columns are found by name in `doc.fields`, never by position. */
export function cityIndex(doc) {
  const F = (doc && Array.isArray(doc.fields)) ? doc.fields : [];
  const at = (n) => F.indexOf(n);
  const iEn = at('en'), iJa = at('ja'), iIso = at('iso2'), iLng = at('lng'), iLat = at('lat'), iPop = at('pop'), iAlt = at('alt'), iGid = at('gid'), iDisp = at('disp');
  const byName = new Map(), byGid = new Map();
  let n = 0;
  for (const r of ((doc && doc.rows) || [])) {
    if (!Array.isArray(r)) continue;
    const lng = +r[iLng], lat = +r[iLat];
    if (!isFinite(lng) || !isFinite(lat)) continue;
    const gid = iGid >= 0 && r[iGid] ? String(r[iGid]) : ('row' + n);
    if (byGid.has(gid)) continue;
    const city = { gid, name: String((iDisp >= 0 && r[iDisp]) || r[iEn] || ''), en: String(r[iEn] || ''), ja: String((iJa >= 0 && r[iJa]) || ''),
      iso2: String((iIso >= 0 && r[iIso]) || '').toUpperCase(), lng, lat, pop: iPop >= 0 ? (+r[iPop] || 0) : 0 };
    byGid.set(gid, city); n++;
    const spell = [r[iEn], iJa >= 0 ? r[iJa] : null, iDisp >= 0 ? r[iDisp] : null].concat((iAlt >= 0 && Array.isArray(r[iAlt])) ? r[iAlt] : []);
    const seen = new Set();
    for (const s of spell) for (const f of nameForms(s)) {
      if (seen.has(f)) continue; seen.add(f);
      let l = byName.get(f); if (!l) { l = []; byName.set(f, l); } l.push(city);
    }
  }
  return { kind: 'cities', byName, byGid, count: n, attribution: (doc && doc.attribution) || null };
}

/* ══ ONE CELL ══════════════════════════════════════════════════════════════════════════════════════════
   → {key, why, candidates?} — `key` is the country key or the city's GeoNames id; `why` is null when resolved,
   'unknown' (no place of this kind is spelled so), 'ambiguous' (several are — the candidates are listed),
   'empty' (the cell is blank). `within` narrows a city to a country (its alpha-2 code). */
function cellOf(kind, raw, idx, within, loose) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { key: null, why: 'empty' };
  const C = idx.countries, Y = idx.cities;
  if (kind === 'iso2') { const k = /^[A-Za-z]{2}$/.test(s) && C ? C.code2.get(s.toUpperCase()) : null; return k ? { key: k, why: null } : { key: null, why: 'unknown' }; }
  if (kind === 'iso3') { const k = /^[A-Za-z]{3}$/.test(s) && C ? C.code3.get(s.toUpperCase()) : null; return k ? { key: k, why: null } : { key: null, why: 'unknown' }; }
  if (kind === 'numeric') {
    /* the strict form is three digits; `loose` (the reader chose this column) also takes a code whose zeros were dropped */
    const ok = loose ? /^\d{1,3}$/.test(s) : /^\d{3}$/.test(s);
    const k = ok && C ? C.n3.get(s.padStart(3, '0')) : null; return k ? { key: k, why: null } : { key: null, why: 'unknown' };
  }
  if (kind === 'country') {
    if (!C) return { key: null, why: 'unknown' };
    for (const f of nameForms(s)) {
      const e = C.names.get(f); if (!e) continue;
      if (e.keys.size === 1) return { key: [...e.keys][0], why: null };
      return { key: null, why: 'ambiguous', candidates: [...e.keys].slice(0, 8) };
    }
    return { key: null, why: 'unknown' };
  }
  if (kind === 'city') {
    if (!Y) return { key: null, why: 'unknown' };
    for (const f of nameForms(s)) {
      let l = Y.byName.get(f); if (!l || !l.length) continue;
      if (within) l = l.filter((c) => c.iso2 === within);
      if (!l.length) return { key: null, why: 'unknown', candidates: [] };
      if (l.length === 1) return { key: l[0].gid, why: null };
      return { key: null, why: 'ambiguous', candidates: l.slice(0, 8).map((c) => ({ gid: c.gid, name: c.name, iso2: c.iso2 })) };
    }
    return { key: null, why: 'unknown' };
  }
  return { key: null, why: 'unknown' };
}

/** the table's columns and rows, from either a FeatureCollection a decoder returned or {columns, rows} */
export function tableOf(src) {
  if (src && Array.isArray(src.columns) && Array.isArray(src.rows)) return { columns: src.columns.map(String), rows: src.rows };
  const feats = (src && Array.isArray(src.features)) ? src.features : [];
  const cols = []; const seen = new Set();
  const stated = src && src.stats && Array.isArray(src.stats.columns) ? src.stats.columns : null;
  if (stated) stated.forEach((c) => { const k = String(c); if (!seen.has(k)) { seen.add(k); cols.push(k); } });
  feats.forEach((f) => Object.keys((f && f.properties) || {}).forEach((k) => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
  return { columns: cols, rows: feats.map((f) => (f && f.properties) || {}) };
}

/* ══ WHAT EACH COLUMN COULD BE ═════════════════════════════════════════════════════════════════════════
   detect(table, idx) → {columns:[{name, kind, ratio, hits, tried, evidence, kinds:[{kind, ratio, hits}], refused?}],
   key: the column offered as the key (or null), kind, within: the country column a city key is narrowed by (or null)} */
export function detect(src, idx) {
  const t = tableOf(src);
  const columns = t.columns.map((name) => {
    const vals = t.rows.map((r) => r[name]).filter((v) => v != null && String(v).trim() !== '');
    const tried = vals.length;
    const kinds = []; let refused = null;
    for (const kind of KINDS) {
      if (COUNTRY_KINDS.indexOf(kind) >= 0 && !idx.countries) continue;
      if (kind === 'city' && !idx.cities) continue;
      let hits = 0; const ev = new Set();
      for (const v of vals) {
        const r = cellOf(kind, v, idx, null, kind === 'numeric');   /* numeric: counted in its loose form; whether the column is WRITTEN as codes is the evidence test below */
        if (r.key || r.why === 'ambiguous') {
          hits++;
          if (kind === 'country') { for (const f of nameForms(v)) { const e = idx.countries.names.get(f); if (e) { e.sources.forEach((s) => { if (ev.size < 6) ev.add(s); }); break; } } }
        }
      }
      if (kind === 'numeric' && hits && !vals.some((v) => /^0\d\d$/.test(String(v).trim()))) { refused = 'numeric-not-evidenced'; continue; }
      if (hits) kinds.push({ kind, ratio: tried ? hits / tried : 0, hits, evidence: [...ev] });
    }
    kinds.sort((a, b) => (b.ratio - a.ratio) || (KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)));
    const top = kinds[0] || null;
    return { name, kind: top ? top.kind : null, ratio: top ? top.ratio : 0, hits: top ? top.hits : 0, tried, evidence: top ? top.evidence : [], kinds, refused };
  });
  const usable = columns.filter((c) => c.kind && c.ratio >= DETECT_MIN);
  usable.sort((a, b) => (b.ratio - a.ratio) || (KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)) || (t.columns.indexOf(a.name) - t.columns.indexOf(b.name)));
  const key = usable[0] || null;
  const within = key && key.kind === 'city' ? (usable.find((c) => c !== key && COUNTRY_KINDS.indexOf(c.kind) >= 0) || null) : null;
  return { columns, key: key ? key.name : null, kind: key ? key.kind : null, within: within ? within.name : null, rows: t.rows.length };
}

/* ══ EACH ROW'S PLACE ══════════════════════════════════════════════════════════════════════════════════
   bind(table, {column, kind, within?, chosen?}, idx) → {column, kind, within, rows:[{key, why, candidates?}],
   resolved, total, ratio, unresolved:[{row, cell, why, candidates?}]}
   `within` (a city key only) is a country column of the SAME row: each row's candidates are narrowed to the country
   that row names; a row whose country does not resolve is not narrowed and says so in its own answer. */
export function bind(src, choice, idx) {
  const t = tableOf(src);
  const column = String((choice && choice.column) || ''), kind = String((choice && choice.kind) || '');
  if (!column || t.columns.indexOf(column) < 0) return { ok: false, why: 'no-such-column', column };
  if (KINDS.indexOf(kind) < 0) return { ok: false, why: 'kind-unknown', kind };
  if (kind === 'city' && !idx.cities) return { ok: false, why: 'cities-unavailable' };
  if (kind !== 'city' && !idx.countries) return { ok: false, why: 'countries-unavailable' };
  const within = (kind === 'city' && choice && choice.within && t.columns.indexOf(String(choice.within)) >= 0 && idx.countries) ? String(choice.within) : null;
  /* a country cell that narrows a city is read in whichever country form it is written — a code and a name cannot be
     mistaken for each other (a code is two or three letters or three digits, and no country's name is), so a column
     that mixes 「Canada」 and 「GB」 still narrows every row it can */
  const countryOf = (raw) => { for (const k of COUNTRY_KINDS) { const w = cellOf(k, raw, idx, null, true); if (w.key) return w.key; } return null; };
  const loose = !!(choice && choice.chosen);
  const rows = [], unresolved = []; let resolved = 0, total = 0;
  t.rows.forEach((r, i) => {
    let iso = null, narrowedBy = null;
    if (within) { const wk = countryOf(r[within]); if (wk) { const c = idx.countries.byKey.get(wk); iso = c && c.iso2 ? c.iso2 : null; narrowedBy = wk; } }
    const out = cellOf(kind, r[column], idx, iso, loose);
    if (narrowedBy) out.within = narrowedBy;
    rows.push(out);
    if (out.why === 'empty') { unresolved.push({ row: i, cell: '', why: 'empty' }); return; }
    total++;
    if (out.key) resolved++;
    else unresolved.push(Object.assign({ row: i, cell: String(r[column] == null ? '' : r[column]), why: out.why }, out.candidates ? { candidates: out.candidates } : null));
  });
  return { ok: true, column, kind, within, rows, resolved, total, ratio: total ? resolved / total : 0, unresolved };
}

/** placeOf(kind, key, idx) → what a key names: a country record or a city — for the dataset and the legend */
export function placeOf(kind, key, idx) {
  if (key == null) return null;
  if (kind === 'city') return (idx.cities && idx.cities.byGid.get(String(key))) || null;
  return (idx.countries && idx.countries.byKey.get(String(key))) || null;
}
