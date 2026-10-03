/* ============================================================================
 *  IntMap · js/wiki-lookup.js — WHICH WIKIPEDIA ARTICLE A MAP FEATURE IS, ASKED BY ITS QUERY FIELDS
 * ----------------------------------------------------------------------------
 *  MEASURED on production (f01c607, 2026-10-03): clicking the country label of Libya asked
 *      en.wikipedia.org/api/rest_v1/page/summary/ⵍⵉⴱⵢⴰ_ليبيا_Libya
 *  — 404, so the place popup never showed its Wikipedia button. The string is OpenStreetMap's `name`
 *  tag, which for Libya (and Morocco, Algeria, Belgium, Switzerland, Cameroon …) is a DISPLAY string:
 *  the country's official scripts written side by side. The popup handed that display value to a
 *  lookup that needs an IDENTITY, while the same feature carried `name:en` = «Libya» and
 *  `name:ja` = «リビア» — the fields that ARE article titles in one wiki each.
 *  ([[intmap-display-value-is-not-analysis-value]] — a value shaped for a reader is not a query.)
 *
 *  So the lookup is no longer «the name, in the reader's wiki, then in English». It is an ordered list
 *  of TARGETS, each one a (wiki, title) pair whose title was written FOR that wiki's language:
 *    1. a Wikidata QID (`wikidata`) when the feature carries one — an identity, resolved to the
 *       reader's wiki through its sitelinks, then English;
 *    2. each `name:<lang>` the map's own label order names for this reader (window.IntMapOsmNameKeys —
 *       the ONE answer to «which name fields does this reader read», js/place-labels.js), in that
 *       order, each in the wiki of ITS language (`name:zh-Hant` → zh, `name:ja` → ja); a `name:*` the
 *       label itself refuses (#R691's recorded wrecks) is refused here too;
 *    3. the English-language fields (`name:en`, `name_en`, `name_int`, `name:latin`) in en;
 *    4. `name` itself, LAST and only when it is one name — a value written in more than one script is
 *       the side-by-side display form, which no wiki has a page for.
 *  Duplicate (wiki, title) pairs are asked once. Pure functions + one async walker that is handed its
 *  fetch, so node runs it (tests/ux-next-checks.test.mjs).
 * ==========================================================================*/

/** the wiki (subdomain) a `name:*`-style field is written for, or '' when the field names no language */
export function siteOfKey(key) {
  const k = String(key || '');
  if (k === 'name_int' || k === 'name:latin' || k === 'name_en') return 'en';
  const m = /^name[:_]([a-z]{2,3})(?:[-_][A-Za-z]+)?$/.exec(k);
  return m ? m[1].toLowerCase() : '';
}

/* Unicode scripts a name can be written in, counted by property — no list of languages is written here.
   Common/Inherited (digits, punctuation, spaces, combining marks) belong to no script. */
const SCRIPT_RES = (() => {
  const names = ['Latin', 'Greek', 'Cyrillic', 'Armenian', 'Georgian', 'Hebrew', 'Arabic', 'Syriac', 'Thaana', 'Nko',
    'Tifinagh', 'Ethiopic', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada',
    'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Tibetan', 'Myanmar', 'Khmer', 'Mongolian', 'Hangul', 'Han', 'Hiragana',
    'Katakana', 'Bopomofo', 'Yi', 'Cherokee', 'Canadian_Aboriginal', 'Ol_Chiki', 'Vai'];
  const out = [];
  for (const n of names) { try { out.push([n, new RegExp('\\p{Script=' + n + '}', 'u')]); } catch (_) { /* engine without it */ } }
  return out;
})();
/* Japanese is written in three scripts at once (漢字・ひらがな・カタカナ), and Korean may mix Hangul and Han:
   those are ONE writing system, so they count as one. Everything else counts as itself. */
const WRITING_SYSTEM = { Han: 'cjk', Hiragana: 'cjk', Katakana: 'cjk', Hangul: 'cjk', Bopomofo: 'cjk' };
/** the writing systems a string uses (a Set of names) */
function scriptsOf(s) {
  const out = new Set();
  for (const ch of String(s || '')) {
    for (const [n, re] of SCRIPT_RES) { if (re.test(ch)) { out.add(WRITING_SYSTEM[n] || n); break; } }
  }
  return out;
}
/** is this one name — written in a single writing system — rather than a side-by-side display of several? */
export const isSingleName = (s) => !!String(s || '').trim() && scriptsOf(s).size <= 1;

/**
 * The ordered (wiki, title) targets for a feature's properties.
 * @param {object} props      the feature's properties (OpenMapTiles fields, or any object with the same keys)
 * @param {string[]} keys     the reader's label key order (window.IntMapOsmNameKeys(lang)); may be empty
 * @param {{refused?:(key:string)=>boolean}} [opt]
 * @returns {{qid?:string, site?:string, title?:string, sites?:string[], via:string}[]}
 */
export function wikiTargets(props, keys, opt) {
  const p = props || {}, refused = (opt && opt.refused) || (() => false);
  const order = Array.isArray(keys) ? keys.slice() : [];
  const reader = order.map(siteOfKey).find(Boolean) || 'en';
  const out = [], seen = new Set();
  const add = (site, title, via) => {
    const t = String(title == null ? '' : title).trim(); if (!site || !t) return;
    const k = site + '\u0000' + t; if (seen.has(k)) return; seen.add(k);
    out.push({ site, title: t, via });
  };
  const qid = String(p.wikidata || p['wikidata'] || '').trim();
  if (/^Q[1-9]\d*$/.test(qid)) out.push({ qid, sites: reader === 'en' ? ['en'] : [reader, 'en'], via: 'wikidata' });
  for (const k of order) { if (!p[k] || refused(k)) continue; add(siteOfKey(k), p[k], k); }
  for (const k of ['name:en', 'name_en', 'name_int', 'name:latin']) { if (p[k] && !refused(k)) add('en', p[k], k); }
  if (isSingleName(p.name)) { add(reader, p.name, 'name'); add('en', p.name, 'name'); }
  return out;
}

const summaryUrl = (site, title) => 'https://' + site + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(String(title).replace(/ /g, '_'));
const sitelinksUrl = (qid, sites) => 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=sitelinks&ids='
  + encodeURIComponent(qid) + '&sitefilter=' + sites.map((s) => s + 'wiki').join('|');

/**
 * Walk the targets in order and answer the first real article.
 * @param {ReturnType<typeof wikiTargets>} targets
 * @param {(url:string)=>Promise<any>} fetchJSON  resolves the parsed body, or null on any failure
 * @returns {Promise<{url:string, site:string, title:string, via:string, asked:string[]}|null>}
 */
export async function findArticle(targets, fetchJSON) {
  const asked = [];
  const probe = async (site, title, via) => {
    const u = summaryUrl(site, title); asked.push(u);
    const j = await fetchJSON(u);
    const url = j && j.type !== 'disambiguation' && j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page;
    return url ? { url, site, title: j.title || title, via, asked } : null;
  };
  for (const t of targets || []) {
    if (t.qid) {
      const u = sitelinksUrl(t.qid, t.sites); asked.push(u);
      const j = await fetchJSON(u);
      const links = j && j.entities && j.entities[t.qid] && j.entities[t.qid].sitelinks;
      if (!links) continue;
      for (const s of t.sites) { const sl = links[s + 'wiki']; if (sl && sl.title) { const hit = await probe(s, sl.title, 'wikidata'); if (hit) return hit; } }
      continue;
    }
    const hit = await probe(t.site, t.title, t.via); if (hit) return hit;
  }
  return null;
}
