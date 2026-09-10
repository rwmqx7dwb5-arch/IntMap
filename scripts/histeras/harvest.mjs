/* ============================================================================
 *  IntMap · Wikidata candidates for the era names (network)                 (#R686)
 * ----------------------------------------------------------------------------
 *  ⚠ THIS FILE FINDS CANDIDATES. IT DOES NOT DECIDE. The deciding is scripts/histeras/match.mjs,
 *  which is pure and therefore testable; everything here is fetching and caching, so that a
 *  rebuild after a scoring change costs no network at all.
 *
 *  ══ WHY A LABEL LOOKUP AND NOT A SEARCH ════════════════════════════════════════════════════
 *  Wikidata's `wbsearchentities` ranks; a ranked first hit taken on faith is exactly #R515's
 *  geocoder, which put a port in the wrong country. So the query here is an EQUALITY on
 *  `rdfs:label` / `skos:altLabel` in English — it returns every item that carries the string,
 *  in no order, and hands all of them to the scorer. "Ainu" comes back as NINE items; the string
 *  cannot choose between them and is not asked to.
 *
 *  ══ WHAT THE UPSTREAM DOES NOT GIVE US ═════════════════════════════════════════════════════
 *  aourednik/historical-basemaps carries a `wikipedia` field, and it would be the join key if it
 *  were populated: measured on the shipped bundle, 21 of 10,212 named features have one, and
 *  they hold 13 distinct names — 0.4% of the corpus. There is no identifier to join on, so the
 *  string is the only way in, and the map's own geometry and clock are what keep it honest.
 *
 *  ══ PUNCTUATION VARIANTS ═══════════════════════════════════════════════════════════════════
 *  The upstream writes "Denmark-Norway" with a hyphen; Wikidata (following English Wikipedia)
 *  writes "Denmark–Norway" with an en dash. That is one typographic convention against another,
 *  not two different polities, so each name is also asked under a small set of DERIVED variants
 *  (dash class, apostrophe class). A variant match is still an equality — it is not a fuzzy one —
 *  and the scorer treats it exactly like the raw form.
 *
 *      node scripts/build-histeras-names.mjs --fetch    # runs this
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const CACHE = process.env.INTMAP_HISTERAS_NAMES_CACHE || join(tmpdir(), 'intmap-histeras-names-cache');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap; intmapofficial@gmail.com)';
const WDQS = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';

/* The nine app languages, as Wikidata terms them. The app's own codes are NOT these — the
   translation between the two lives in exactly one place, scripts/histeras/match.mjs. */
export const WD_LANGS = ['en', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hant', 'zh-hans'];

/* ── punctuation variants (derived, not a list of fixes) ───────────────────── */
const DASHES = ['-', '‐', '‑', '‒', '–', '—'];
const APOS = ["'", '‘', '’', 'ʻ', 'ʼ'];
function classSwap(s, klass) {
  const out = new Set();
  if (![...s].some((c) => klass.includes(c))) return out;
  const re = new RegExp('[' + klass.map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + ']', 'g');
  for (const ch of klass) out.add(s.replace(re, ch));
  return out;
}
export function variants(name) {
  const out = new Set([name]);
  for (const a of [name, ...classSwap(name, DASHES)]) { out.add(a); for (const b of classSwap(a, APOS)) out.add(b); }
  return [...out];
}

async function retry(fn, what) {
  let last;
  for (let a = 0; a < 5; a++) {
    try { return await fn(); } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
  }
  throw new Error(what + ': ' + (last && last.message));
}
async function sparql(query) {
  return retry(async () => {
    const r = await fetch(WDQS + '?format=json&query=' + encodeURIComponent(query),
      { headers: { 'user-agent': UA, accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.json()).results.bindings;
  }, 'WDQS');
}
async function api(params) {
  return retry(async () => {
    const r = await fetch(API + '?format=json&' + params, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }, 'wbgetentities');
}
function cached(key, make) {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, key + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  return make().then((v) => { writeFileSync(f, JSON.stringify(v)); return v; });
}
const esc = (s) => s.replace(/[\\"]/g, (m) => '\\' + m);
const qid = (u) => String(u).split('/').pop();

/** name → [{qid, exact}] for every item carrying the string as an English label or alias. */
export async function candidatesFor(names, log = () => {}) {
  const forms = new Map();                       /* query form → the census names it stands for */
  for (const n of names) for (const v of variants(n)) {
    if (!forms.has(v)) forms.set(v, []); forms.get(v).push(n);
  }
  const all = [...forms.keys()];
  const byName = new Map(names.map((n) => [n, new Map()]));
  const B = 120;
  for (let i = 0; i < all.length; i += B) {
    const batch = all.slice(i, i + B);
    const rows = await cached('lab-' + i.toString().padStart(6, '0'), () => sparql(`SELECT ?lab ?item ?exact WHERE {
  VALUES ?lab { ${batch.map((s) => '"' + esc(s) + '"@en').join(' ')} }
  { ?item rdfs:label ?lab . BIND(1 AS ?exact) } UNION { ?item skos:altLabel ?lab . BIND(0 AS ?exact) }
}`));
    for (const b of rows) {
      const q = qid(b.item.value), ex = b.exact.value === '1';
      for (const n of (forms.get(b.lab.value) || [])) {
        const m = byName.get(n); if (!m) continue;
        m.set(q, (m.get(q) || false) || ex);
      }
    }
    log('labels ' + Math.min(i + B, all.length) + '/' + all.length);
  }
  return byName;
}

/** qid → {labels, coord, dates, P31, hasCountry} for every candidate. */
export async function factsFor(qids, log = () => {}) {
  const out = {};
  const list = [...qids];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const j = await cached('ent-' + i.toString().padStart(6, '0') + '-' + batch.length, () => api(
      'action=wbgetentities&props=labels%7Cclaims&languages=' + WD_LANGS.join('%7C') +
      '&ids=' + encodeURIComponent(batch.join('|'))));
    for (const [q, e] of Object.entries(j.entities || {})) {
      if (!e || !e.id) continue;
      const cl = (p) => (e.claims && e.claims[p] || []).map((c) => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean);
      const co = cl('P625')[0] || null;
      out[q] = {
        labels: Object.fromEntries(Object.entries(e.labels || {}).map(([k, v]) => [k, v.value])),
        coord: co ? [+co.longitude, +co.latitude] : null,
        starts: [...cl('P571'), ...cl('P580')].map((v) => v.time).filter(Boolean),
        ends: [...cl('P576'), ...cl('P582')].map((v) => v.time).filter(Boolean),
        p31: cl('P31').map((v) => v.id).filter(Boolean),
        geo: !!(co || cl('P17').length || cl('P30').length || cl('P276').length),
      };
    }
    log('facts ' + Math.min(i + 50, list.length) + '/' + list.length);
  }
  return out;
}

/* ── what the map cannot be drawing ──────────────────────────────────────────
   ⚠ TWO ROOTS ARE NAMED HERE, AND THE SET UNDER THEM IS WIKIDATA'S ANSWER, NOT A LIST WRITTEN
   HERE. A list of QIDs to refuse would have to be edited for the next one, which is the edit
   `.agents/rules/no-ad-hoc-hardcoding.md` exists to prevent; a ROOT plus `wdt:P279*` is a
   statement about kinds, and it covers the ones nobody has met yet.

   · Q17442446 — Wikimedia internal item. Disambiguation pages, list articles, categories,
     templates. Measured on the first sweep: 353 of the 1,335 items an exact English-title match
     returned were disambiguation pages, "Ainu" among them (Q226570, Korean label
     «아이누 (동음이의)»). A quarter of what a spelling match returns is not a thing at all.
   · Q34770 — language. ⚠ THIS ONE IS THE UPSTREAM'S SUBJECT MATTER MEETING WIKIDATA'S. The map
     draws PEOPLES, and Wikidata's item bearing a people's English name is very often the
     LANGUAGE named after them: measured on the first build of this table, language was the single
     most common class among the 751 rows it accepted — 146 of them — and Burmese, Hän, Siuslaw
     and Northern Pomo were about to be labelled 「ビルマ語」「汗語」「サイウスロー語」「北波莫語」
     on a map of territories. A language is not a place, however many speakers it has a country
     statement for. */
export const REJECT_ROOTS = ['Q17442446', 'Q34770'];

export async function rejectedClasses(classQids, roots = REJECT_ROOTS) {
  const list = [...classQids];
  const bad = new Set();
  const tag = roots.join('_');
  for (let i = 0; i < list.length; i += 400) {
    const batch = list.slice(i, i + 400);
    const rows = await cached('cls-' + tag + '-' + i.toString().padStart(6, '0') + '-' + batch.length, () => sparql(`SELECT ?c WHERE {
  VALUES ?c { ${batch.map((q) => 'wd:' + q).join(' ')} }
  VALUES ?root { ${roots.map((q) => 'wd:' + q).join(' ')} }
  ?c wdt:P279* ?root .
}`));
    for (const b of rows) bad.add(qid(b.c.value));
  }
  return bad;
}
