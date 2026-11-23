/* ============================================================================
 *  IntMap · ATLAS — research.search: THE INVESTIGATION'S OWN TOOL  (js/atlas-research-search.js)
 * ----------------------------------------------------------------------------
 *  `research.analyze` gathers once and answers once. An investigation is a LOOP: plan → search in parallel →
 *  read → name what is missing or contradicted → search differently (other words, the sources' own language,
 *  a primary source) → check against it → conclude. The loop is Atlas's: WHAT to search next, in which
 *  language, against which kind of source, and WHEN to stop are the model's decisions, made from what the
 *  last round returned. This module is the tool side of it, and only that:
 *
 *    · it SEARCHES — several queries at once, each in the language/country/site the model names;
 *    · it REMEMBERS WHAT IT ALREADY FETCHED, for the turn: a query asked again is answered «already run»
 *      with the documents it found (not fetched again, not silently dropped); a document returned by an
 *      earlier query is listed once and then only counted (.agents/rules/one-pass-or-a-reason.md §4);
 *    · it SAYS WHAT HAPPENED PER QUERY — ok / empty / unavailable, three answers and never two: a source that
 *      did not answer is not «nothing was published» (the Greece report, #R769);
 *    · it CARRIES THE INVESTIGATION: the `gap` (what is missing), `contradiction` (what disagrees) and
 *      `changed` (what the method now does differently) the model states are kept with the round, and what
 *      actually changed is COMPUTED from the queries (words, languages, sites, engines that are new), so the
 *      next round reads a ledger rather than reconstructing it.
 *
 *  ⚠ NOTHING HERE LIMITS ATLAS. No cap on rounds, queries or languages (CONSTITUTION.md §5): the only bound on
 *    a round is the budget each fetch already carries. A language is any BCP-47 primary tag the model writes;
 *    its GDELT name is derived (Intl.DisplayNames), not listed (.agents/rules/no-ad-hoc-hardcoding.md §2).
 *  ⚠ NO FIGURE IS INVENTED. A document is a headline, a link, a date and the outlet that said it. Whether it
 *    is true, and what the primary source says, is read by Atlas — a `site` query is how it asks for one.
 * ==========================================================================*/

const str = (v) => (v == null ? '' : String(v));
const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const REGION_RE = /^[A-Z]{2}$/;
const SITE_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/;

/** the display name of a language/region in English, derived from the platform; '' when it has none */
function englishName(kind, code) {
  try { const n = new Intl.DisplayNames(['en'], { type: kind }).of(code); return n && n !== code ? n : ''; } catch (_) { return ''; }
}
/** GDELT writes `sourcelang:ukrainian`, `sourcecountry:unitedstates` — the English name, lower-case, no spaces */
const gdeltWord = (name) => name.toLowerCase().replace(/[^a-z]/g, '');

/** one raw query row from Atlas → the normalised row, or { error } saying exactly what was wrong with it */
export function normaliseQuery(raw, index) {
  const r = (raw && typeof raw === 'object') ? raw : { q: raw };
  const q = str(r.q != null ? r.q : r.query).trim();
  if (!q) return { index, error: 'q is empty' };
  const lang = str(r.lang).trim();
  if (lang && !LANG_RE.test(lang)) return { index, q, error: 'lang «' + lang + '» is not a language tag such as uk, ru, pl, ja, zh-TW' };
  const country = str(r.country).trim().toUpperCase();
  if (country && !REGION_RE.test(country)) return { index, q, error: 'country «' + str(r.country) + '» is not an ISO 3166-1 alpha-2 code such as UA, PL' };
  const site = str(r.site).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (site && !SITE_RE.test(site)) return { index, q, error: 'site «' + str(r.site) + '» is not a domain such as president.gov.ua' };
  const engine = str(r.engine || 'both').toLowerCase();
  if (engine !== 'both' && engine !== 'gdelt' && engine !== 'gnews') return { index, q, error: 'engine must be gdelt, gnews or both' };
  const timespan = str(r.timespan).trim();
  if (timespan && !/^\d+(?:min|h|d|w|m)$/i.test(timespan)) return { index, q, error: 'timespan «' + timespan + '» must look like 72h, 7d, 3m' };
  const key = [engine, q.toLowerCase(), lang, country, site, timespan].join('␟');
  return { index, q, lang, country, site, engine, timespan, key };
}

/** the GDELT query string for a row: the model's words plus the operators its language/country/site ask for */
export function gdeltQueryOf(n, names) {
  const ops = [];
  if (n.lang) { const w = gdeltWord(names.language(n.lang.split('-')[0])); if (w) ops.push('sourcelang:' + w); }
  if (n.country) { const w = gdeltWord(names.region(n.country)); if (w) ops.push('sourcecountry:' + w); }
  if (n.site) ops.push('domainis:' + n.site);
  return ops.length ? n.q + ' ' + ops.join(' ') : n.q;
}
/** the Google News edition [hl, gl, ceid] for a row, or null for «the reader's own editions» */
export function gnewsEditionOf(n) {
  if (!n.lang && !n.country) return null;
  const lang = n.lang || 'en', region = n.country || 'US';
  return [lang, region, region + ':' + lang.split('-')[0]];
}
const gnewsQueryOf = (n) => (n.site ? n.q + ' site:' + n.site : n.q);

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }
const wordsOf = (q) => str(q).toLowerCase().split(/[\s"'()]+/).filter((w) => w.length > 1 && !/^(and|or|not)$/.test(w));

/**
 * makeResearchSearch({ gdelt, gnews, names? }) → { run(args, turnKey) }
 *   gdelt(query, sink, timespan, budgetMs, note)   js/atlas-sources.js _gdeltNews
 *   gnews(query, sink, mkNote, edition)            js/atlas-sources.js _gnewsNews
 *   `sink` receives {url,title,src,date,dateType,origin,lang,country} per document; `note.reason==='ok'` says the source answered
 */
export function makeResearchSearch(deps) {
  const gdelt = deps.gdelt, gnews = deps.gnews;
  const names = deps.names || { language: (c) => englishName('language', c), region: (c) => englishName('region', c) };
  const turns = new Map();   /* turnKey → ledger; the last few turns only — a ledger is a turn's memory, not an archive */
  const TURNS_KEPT = 8;
  function ledgerOf(turnKey) {
    const k = turnKey == null ? '(no turn)' : String(turnKey);
    let l = turns.get(k);
    if (!l) {
      l = { queries: new Map(), docs: new Map(), rounds: [], words: new Set(), langs: new Set(), sites: new Set(), engines: new Set() };
      turns.set(k, l);
      while (turns.size > TURNS_KEPT) turns.delete(turns.keys().next().value);
    }
    return l;
  }

  async function runOne(n, budgetMs) {
    const sink = [], notes = [];
    const mk = () => { const o = {}; notes.push(o); return o; };
    const jobs = [];
    if (n.engine !== 'gnews') jobs.push(Promise.resolve().then(() => gdelt(gdeltQueryOf(n, names), sink, n.timespan || '7d', budgetMs, mk())).catch(() => null));
    if (n.engine !== 'gdelt') jobs.push(Promise.resolve().then(() => gnews(gnewsQueryOf(n), sink, mk, gnewsEditionOf(n))).catch(() => null));
    await Promise.all(jobs);
    const docs = [], seen = new Set();
    for (const d of sink) { if (!d || !d.url || seen.has(d.url)) continue; seen.add(d.url); docs.push({ url: str(d.url), title: str(d.title), outlet: str(d.src) || hostOf(d.url), date: str(d.date), dateKind: str(d.dateType), engine: str(d.origin), lang: str(d.lang), country: str(d.country) }); }
    /* ok = documents came back; empty = a source answered and had none; unavailable = no source answered */
    const state = docs.length ? 'ok' : (notes.some((o) => o && o.reason === 'ok') ? 'empty' : 'unavailable');
    return { docs, state };
  }

  /**
   * run(args, turnKey) → { ok, code?, round, queries, documents, alreadySeen, delta, investigation, totals }
   *   args  { queries:[{q, lang?, country?, site?, engine?, timespan?}], gap?, contradiction?, changed?, budgetMs? }
   */
  async function run(args, turnKey) {
    const a = args || {};
    const rawList = Array.isArray(a.queries) ? a.queries : (a.q || a.query ? [a] : []);
    if (!rawList.length) return { ok: false, code: 'needs_input', message: 'give queries:[{q, lang?, country?, site?}] — one or several, searched at the same time' };
    const L = ledgerOf(turnKey);
    const norm = rawList.map(normaliseQuery);
    const fresh = [];
    const planned = new Set();
    for (const n of norm) { if (!n.error && !L.queries.has(n.key) && !planned.has(n.key)) { planned.add(n.key); fresh.push(n); } }
    const budget = Number.isFinite(+a.budgetMs) && +a.budgetMs > 0 ? +a.budgetMs : undefined;
    /* GDELT asks callers to be gentle (one request per second per IP): the GDELT halves go one after another inside
       runOne's parallel pair only when a round has several; Google News needs no such care. Parallel across the round. */
    const ran = await Promise.all(fresh.map((n) => runOne(n, budget).then((r) => ({ n, r }))));
    const round = L.rounds.length + 1;
    const newDocs = [], reported = new Set();
    for (const { n, r } of ran) {
      const urls = [];
      for (const d of r.docs) { urls.push(d.url); if (!L.docs.has(d.url)) { L.docs.set(d.url, Object.assign({ firstRound: round }, d)); newDocs.push(L.docs.get(d.url)); } }
      L.queries.set(n.key, { state: r.state, urls, round, q: n.q });
    }
    const rows = norm.map((n) => {
      if (n.error) return { index: n.index, q: n.q || '', state: 'rejected', error: n.error };
      const prev = L.queries.get(n.key);
      const base = { index: n.index, q: n.q, lang: n.lang || undefined, country: n.country || undefined, site: n.site || undefined, engine: n.engine, state: prev.state };
      if (prev.round !== round || reported.has(n.key)) return Object.assign(base, { alreadyRun: true, ranInRound: prev.round, found: prev.urls.length, note: 'the same query was already run this turn; its documents are in the ledger and were not fetched again' });
      reported.add(n.key);
      return Object.assign(base, { found: prev.urls.length, newDocuments: prev.urls.filter((u) => L.docs.get(u).firstRound === round).length });
    });
    /* what is NEW in method, computed from the queries — not from what the model says it changed */
    const added = { words: [], languages: [], sites: [], engines: [] };
    for (const { n } of ran) {
      for (const w of wordsOf(n.q)) if (!L.words.has(w)) { L.words.add(w); added.words.push(w); }
      const lg = n.lang || '(reader default)'; if (!L.langs.has(lg)) { L.langs.add(lg); added.languages.push(lg); }
      if (n.site && !L.sites.has(n.site)) { L.sites.add(n.site); added.sites.push(n.site); }
      if (!L.engines.has(n.engine)) { L.engines.add(n.engine); added.engines.push(n.engine); }
    }
    const note = { round, gap: str(a.gap).slice(0, 600), contradiction: str(a.contradiction).slice(0, 600), changed: str(a.changed).slice(0, 600), queries: fresh.length, newDocuments: newDocs.length };
    L.rounds.push(note);
    const documents = newDocs.map((d) => ({ url: d.url, title: d.title, outlet: d.outlet, date: d.date, dateKind: d.dateKind, lang: d.lang || undefined, country: d.country || undefined, engine: d.engine }));
    const repeated = [];
    for (const { r } of ran) for (const d of r.docs) if (L.docs.get(d.url).firstRound !== round && !repeated.includes(d.url)) repeated.push(d.url);
    const states = { ok: 0, empty: 0, unavailable: 0, rejected: 0, alreadyRun: 0 };
    for (const r of rows) { if (r.alreadyRun) states.alreadyRun++; else states[r.state] = (states[r.state] || 0) + 1; }
    return {
      ok: true, round, queries: rows, documents,
      alreadySeen: repeated,
      delta: added,
      investigation: { gap: note.gap, contradiction: note.contradiction, changed: note.changed, history: L.rounds.map((x) => ({ round: x.round, gap: x.gap, contradiction: x.contradiction, changed: x.changed, queries: x.queries, newDocuments: x.newDocuments })) },
      totals: { documentsThisTurn: L.docs.size, languages: [...L.langs], sites: [...L.sites], states },
      /* the source sentence for the reader and for Atlas: a state is a fact about the SOURCE, not about the world */
      reading: 'ok = documents came back. empty = a source answered and had none for these words. unavailable = no source could be reached — that is not evidence that nothing was published. A document is a headline, its outlet and its date; read the source itself (a `site` query reaches an official one) before relying on it.',
    };
  }
  return { run, ledgerOf };
}
