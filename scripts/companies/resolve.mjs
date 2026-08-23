/* ============================================================================
 *  IntMap · company identity resolution — name/ticker/domain  ->  Wikidata QID
 * ----------------------------------------------------------------------------
 *  Nothing downstream may invent a fact, so nothing downstream may guess WHICH
 *  company a row is about either. A candidate is accepted only when independent
 *  evidence agrees:
 *
 *      +6  official website (P856) host equals the manifest domain
 *      +5  a stock-exchange listing (P414) carries the manifest ticker
 *      +2  country of origin (P17) equals the manifest ISO-3
 *      +2  an exact label match in any of the ten languages we read
 *      +1  a normalised label match (case / punctuation / legal suffix folded)
 *      -6  the item is not an organisation at all
 *      -4  the item has a dissolution date (P576)
 *
 *  A winner needs >= MIN_SCORE and must beat the runner-up by MARGIN, otherwise
 *  the row is reported unresolved and simply does not ship. "Unresolved" is a
 *  real, reportable outcome — it is never rounded up to a plausible QID.
 * ==========================================================================*/
import { entities, sparql, httpJSON, claims, best, dvItem, dvStr, qualStr, chunk, qid, val, cacheGet, cachePut } from './wd.mjs';

const MIN_SCORE = 5;
const MARGIN = 2;

/* Legal-form suffixes folded away before comparing names. Kept deliberately
   small: folding too much turns "Delta Air Lines" and "Delta" into one name. */
const SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|nv|n\.v|bv|sa|s\.a|se|ag|kgaa|gmbh|ab|as|asa|oyj|spa|s\.p\.a|srl|kk|k\.k|holdings?|group|international|intl|the)\b/g;

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hostOf(url) {
  try {
    const u = new URL(String(url));
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) { return ''; }
}

/* Ticker suffixes in the curated table follow Yahoo's convention. We only use
   them to know WHICH SYMBOL to compare; the exchange item itself is not pinned,
   because Wikidata models the same exchange under several items. */
export function bareTicker(tk) {
  const s = String(tk || '');
  const dot = s.lastIndexOf('.');
  const base = dot > 0 ? s.slice(0, dot) : s;
  return base.replace(/-/g, '.');           /* BRK-B on Yahoo is BRK.B on the exchange */
}

/* ── candidate sources ───────────────────────────────────────────────────── */

/** All items that carry any of these ticker symbols as a P249 qualifier of a P414 listing. */
export async function candidatesByTicker(tickers) {
  const byTicker = new Map();
  const uniq = [...new Set(tickers.map(bareTicker).filter(Boolean))];
  for (const grp of chunk(uniq, 120)) {
    const values = grp.map((t) => JSON.stringify(t)).join(' ');
    const rows = await sparql(
      'SELECT ?item ?tk WHERE {\n'
      + '  VALUES ?tk { ' + values + ' }\n'
      + '  ?item p:P414 ?st . ?st pq:P249 ?tk .\n'
      + '} LIMIT 4000');
    for (const r of rows) {
      const t = val(r, 'tk');
      if (!byTicker.has(t)) byTicker.set(t, new Set());
      byTicker.get(t).add(qid(val(r, 'item')));
    }
  }
  return byTicker;
}

/** wbsearchentities — one request per name, cached. */
export async function candidatesByName(name, lang = 'en') {
  const key = lang + '|' + name;
  const hit = cacheGet('search', key);
  if (hit) return hit;
  const u = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=12'
    + '&language=' + encodeURIComponent(lang) + '&uselang=' + encodeURIComponent(lang)
    + '&search=' + encodeURIComponent(name);
  const j = await httpJSON(u);
  const ids = ((j && j.search) || []).map((s) => s.id);
  return cachePut('search', key, ids);
}

/* ── scoring ─────────────────────────────────────────────────────────────── */

/* P31 values that mean "this is an organisation of some kind". Resolved once at
   runtime from the subclass closure of `organization` so the list cannot rot. */
let ORG_SET = null;
export async function orgClasses() {
  if (ORG_SET) return ORG_SET;
  const rows = await sparql('SELECT ?t WHERE { ?t wdt:P279* wd:Q43229 } LIMIT 20000', { maxAgeMs: 90 * 24 * 3600 * 1000 });
  ORG_SET = new Set(rows.map((r) => qid(val(r, 't'))));
  return ORG_SET;
}

export function scoreCandidate(ent, want, orgSet) {
  if (!ent || ent.missing !== undefined) return -99;
  let s = 0;
  const sites = claims(ent, 'P856').map(dvStr).filter(Boolean).map(hostOf);
  if (want.domain && sites.some((h) => h === want.domain || h.endsWith('.' + want.domain) || want.domain.endsWith('.' + h))) s += 6;

  if (want.ticker) {
    const wanted = bareTicker(want.ticker);
    const tks = claims(ent, 'P414').map((c) => qualStr(c, 'P249')).filter(Boolean);
    if (tks.some((t) => String(t).toUpperCase() === wanted.toUpperCase())) s += 5;
  }

  if (want.cc3) {
    const ccs = claims(ent, 'P17').map(dvItem).filter(Boolean);
    if (want.ccQids && ccs.some((q) => want.ccQids.has(q))) s += 2;
  }

  const wn = normName(want.name);
  const labels = Object.values(ent.labels || {}).map((l) => l.value);
  const alias = [];
  if (labels.some((l) => String(l).toLowerCase() === String(want.name).toLowerCase())) s += 2;
  else if (labels.concat(alias).some((l) => normName(l) === wn && wn)) s += 1;

  const types = claims(ent, 'P31').map(dvItem).filter(Boolean);
  if (types.length && !types.some((t) => orgSet.has(t))) s -= 6;
  if (claims(ent, 'P576').length) s -= 4;                 /* dissolved */
  return s;
}

/** Resolve one batch of manifest rows. Returns {resolved:Map<id,qid>, unresolved:[{id,reason,top}]} */
export async function resolveAll(rows, opts = {}) {
  const log = opts.log || (() => {});
  const orgSet = await orgClasses();

  /* ISO-3 -> country QIDs, so a country match is checked against real items. */
  const ccRows = await sparql('SELECT ?c ?code WHERE { ?c wdt:P298 ?code } LIMIT 1000', { maxAgeMs: 90 * 24 * 3600 * 1000 });
  const ccQids = new Map();
  for (const r of ccRows) {
    const code = val(r, 'code');
    if (!ccQids.has(code)) ccQids.set(code, new Set());
    ccQids.get(code).add(qid(val(r, 'c')));
  }

  log('resolving ' + rows.length + ' companies…');
  const tickerMap = await candidatesByTicker(rows.map((r) => r.ticker).filter(Boolean));

  /* gather candidates */
  const cand = new Map();
  let n = 0;
  for (const row of rows) {
    const set = new Set();
    if (row.wikidata) set.add(row.wikidata);
    if (row.ticker) { const t = bareTicker(row.ticker); (tickerMap.get(t) || []).forEach((q) => set.add(q)); }
    for (const nm of [row.name, row.legalName].filter(Boolean)) {
      (await candidatesByName(nm)).forEach((q) => set.add(q));
    }
    cand.set(row.id, set);
    if (++n % 50 === 0) log('  candidates ' + n + '/' + rows.length);
  }

  const allIds = [...new Set([].concat(...[...cand.values()].map((s) => [...s])))];
  log('fetching ' + allIds.length + ' candidate entities…');
  const ents = await entities(allIds);

  const resolved = new Map();
  const unresolved = [];
  for (const row of rows) {
    const want = { name: row.name, domain: (row.domain || '').toLowerCase(), ticker: row.ticker, cc3: row.country, ccQids: ccQids.get(row.country) };
    const scored = [...cand.get(row.id)]
      .map((q) => ({ q, s: scoreCandidate(ents[q], want, orgSet) }))
      .sort((a, b) => b.s - a.s);
    const top = scored[0];
    const second = scored[1];
    if (row.wikidata) { resolved.set(row.id, row.wikidata); continue; }   /* pinned by hand wins */
    if (!top || top.s < MIN_SCORE) { unresolved.push({ id: row.id, reason: 'no candidate reached the evidence floor', top: scored.slice(0, 3) }); continue; }
    if (second && top.s - second.s < MARGIN) { unresolved.push({ id: row.id, reason: 'ambiguous', top: scored.slice(0, 3) }); continue; }
    resolved.set(row.id, top.q);
  }
  return { resolved, unresolved };
}
