/* ============================================================================
 *  IntMap · the world's nuclear facilities, discovered — data/npp.json   (#R574)
 * ----------------------------------------------------------------------------
 *  Until now the only nuclear geography in the program was twelve hand-written
 *  regular expressions inside the plume model (js/sims.js, `SITES`): a list of
 *  names with coordinates typed next to them. That is the shape
 *  `.agents/rules/no-ad-hoc-hardcoding.md` §1 forbids — a table of spellings
 *  that answers for the twelve places somebody happened to think of and is
 *  silent about every other one, including the plant next door to the reader.
 *
 *  The fix is not a longer list. It is to stop keeping a list: ask an upstream
 *  that knows which nuclear facilities exist, and ship what it answers.
 *
 *    node scripts/build-npp-registry.mjs           → data/npp.json
 *
 *  ── the one class the scope is derived from ────────────────────────────────
 *  Everything comes out of ONE Wikidata class, `nuclear facility` (Q1739545),
 *  walked down its subclass tree. MEASURED 2026-09-09:
 *
 *      P31/P279* Q1739545                                     930 items
 *      the same union with Q134447 (nuclear power plant)
 *        and Q80877 (nuclear reactor) added explicitly        930 items
 *
 *  i.e. power plants and reactors are ALREADY inside the facility tree, so the
 *  scope is a single class and not a hand-assembled union. It also covers the
 *  non-power sites the plume model needs — Sellafield, Orano La Hague, Mayak
 *  and Hanford are reprocessing/production complexes, not power plants, and all
 *  four are inside this tree (measured by ASK).
 *
 *  ── licence ───────────────────────────────────────────────────────────────
 *  Wikidata is CC0-1.0 ("all structured data ... is available under the Creative
 *  Commons CC0 License"), so nothing here restricts the shipped file. Every
 *  record still carries its own `src`, because a second upstream under a
 *  different licence must never become invisible once merged in.
 *
 *  OpenStreetMap (ODbL) was MEASURED as a supplement for the facilities Wikidata
 *  has no P625 for, by joining on the OSM `wikidata=Q…` tag: 270 coordinate-less
 *  items, of which OSM knows exactly 2 (Q126813480, Q125929511; 0.7%). Taking a
 *  share-alike obligation onto the whole shipped dataset to gain two records is
 *  not a trade worth making, so this build is Wikidata-only. The `sources[]`
 *  array and the per-record `src` exist so that adding one later is an addition,
 *  not a rewrite.
 *
 *  IAEA PRIS has NO machine-readable route (measured 2026-09-09): pris.iaea.org
 *  is now an Angular shell ("PRIS Analytics") that answers the SAME 40,878-byte
 *  index.html to every path under /PRIS/ — including its own script bundles and
 *  the old scrapeable /PRIS/CountryStatistics/*.aspx tables — and www.iaea.org's
 *  world-statistics pages answer 403 behind a Cloudflare interstitial. Wikidata
 *  has no PRIS identifier property either (searched the property labels for
 *  "iaea"/"pris": nothing). So `pris` stays null until a machine-readable route
 *  exists, and the count cross-check lives in tests/r574-npp-checks.test.mjs.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, httpJSON, cacheGet, cachePut, chunk, qid, claims, best, dvItem, dvCoord, dvQuantity, wdDate, label } from './companies/wd.mjs';

/* The identity Wikimedia's user-agent policy asks for. `httpJSON` merges the
   headers it is given OVER its own defaults, so this is the string the upstream
   actually sees for this pipeline. */
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)';
const SCOPE = 'Q1739545';      /* nuclear facility — see the header for why this one class is the whole scope */
const REACTOR = 'Q80877';      /* nuclear reactor — the class whose instances/subclasses count as "units" */
const WATT = 'Q25236';         /* the SI unit every P2109 value must reduce to before it can be called MW */
const OUT = path.join(ROOT, 'data', 'npp.json');

/* Wikidata labels, in the order this program prefers them. A record with no
   label in ANY of these is dropped rather than shipped under its Q-number. */
const NAME_LANGS = ['en', 'ja', 'de', 'fr', 'es', 'ru', 'ko', 'zh-hant', 'zh-hans', 'zh'];

/* ── the nine languages the product is READ in ─────────────────────────────
   ⚠ These are IntMap's UI languages. They are NOT a claim about which languages
   the world's nuclear facilities are named in — see OFFICIAL below, which is the
   other half of the answer.

   Wikidata's code on the left, IntMap's on the right. They differ only in the
   case of the script subtag, and `zh` maps to ITSELF on purpose: an item that
   has a plain `zh` label has not said which script it is, and rewriting it as
   zh-Hans would be this pipeline asserting something the upstream did not. A
   consumer that sees the key `zh` therefore knows exactly where it came from.
   MEASURED 2026-09-09 over the 638 shipped sites: 195 carry a plain `zh` label
   (after the 81 that merely repeat a script-specific one are dropped below),
   against 101 with zh-hant and 104 with zh-hans — so dropping `zh` would
   silence Chinese for most of the ledger. */
const UI_LANGS = { en: 'en', ja: 'ja', de: 'de', ru: 'ru', es: 'es', 'zh-hant': 'zh-Hant', 'zh-hans': 'zh-Hans', fr: 'fr', ko: 'ko', zh: 'zh' };

/* ── state of use (P5817) → the product's vocabulary ────────────────────────
   The QIDs stay in this file: a raw Q-number in data/npp.json would push the
   classification into every consumer. The mapping is derived from the values
   that actually occur — MEASURED 2026-09-09 over the whole scope, with counts,
   and every one of the thirteen is decided here on purpose:

     Q11639308  113  decommissioned            → decommissioned
     Q55654238   86  in use                    → operational
     Q30108381   62  cancelled                 → cancelled
     Q811683     56  proposed building         → planned
     Q12377751   26  under construction        → under-construction
     Q1938123     4  nuclear decommissioning   → decommissioned (the process, used as the state)
     Q97317113    3  on hold                   → planned  (the project exists and is NOT cancelled;
     Q87772960    1  postponed                 → planned   Wikidata does not say whether work resumed)
     Q104664889   2  permanently closed        → shutdown (closed, but no decommissioning asserted)
     Q170584      1  project                   → planned
     Q2647254     1  study                     → planned
     Q109551035   1  in partial operation      → operational (some units run — it can still release)
     Q125517441   1  starting up               → under-construction (commissioning; not yet operating)

   A value that is not in this table becomes "unknown" and the item is KEPT —
   an unrecognised state must never delete a nuclear site from the map. New
   values print a warning at build time so the omission is visible. */
const STATE_OF_USE = {
  Q11639308: 'decommissioned',
  Q1938123: 'decommissioned',
  Q55654238: 'operational',
  Q109551035: 'operational',
  Q30108381: 'cancelled',
  Q811683: 'planned',
  Q97317113: 'planned',
  Q87772960: 'planned',
  Q170584: 'planned',
  Q2647254: 'planned',
  Q104664889: 'shutdown',
  Q12377751: 'under-construction',
  Q125517441: 'under-construction',
};

/* ── transports ────────────────────────────────────────────────────────────
   `httpJSON` (scripts/companies/wd.mjs) is the shared retry ladder: a transport
   failure throws instead of returning an empty answer, which is what stops a
   flaky network from silently shrinking the dataset. These two wrappers only
   add this pipeline's user agent and its own disk cache namespace. */
async function sparql(query) {
  const hit = cacheGet('npp-sparql', query, 7 * 24 * 3600 * 1000);
  if (hit) return hit;
  const j = await httpJSON('https://query.wikidata.org/sparql', {
    method: 'POST',
    body: query,
    headers: { 'User-Agent': UA, 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
    timeoutMs: 180000,
  });
  const rows = (j && j.results && j.results.bindings) || [];
  return cachePut('npp-sparql', query, rows);
}
async function entities(ids, props = 'claims|labels', langs = NAME_LANGS) {
  const out = {};
  for (const grp of chunk([...new Set(ids)].filter(Boolean), 50)) {
    /* ⚠ BOTH parameters are capped at 50 — `languages` as well as `ids`, and the
       500 in the API's `highlimit` needs a right this client does not have
       (MEASURED 2026-09-09: 88 codes answer `toomanyvalues … The limit is 50`).
       So the languages are walked in pages too and the answers are merged; the
       claims come back with the first page only, since they do not depend on
       the language and there is no reason to pay for them twice. */
    for (const [i, lg] of chunk(langs, 50).entries()) {
      const wanted = i === 0 ? props : props.split('|').filter((p) => p !== 'claims').join('|');
      if (!wanted) continue;
      const key = wanted + '|' + lg.join('|') + '|' + grp.join(',');
      let ents = cacheGet('npp-ent', key, 7 * 24 * 3600 * 1000);
      if (!ents) {
        const u = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=' + grp.join('%7C')
          + '&props=' + encodeURIComponent(wanted) + '&languages=' + encodeURIComponent(lg.join('|'));
        const j = await httpJSON(u, { headers: { 'User-Agent': UA } });
        /* ⚠ A MediaWiki API error arrives as HTTP 200 with an `error` object and
           no `entities`, which the retry ladder cannot see. Treating that as
           "the upstream knows nothing about these fifty items" is how a bad
           parameter silently ships an EMPTY ledger — measured, exactly that,
           when this function first asked for 88 languages at once. */
        if (j && j.error) throw new Error('wbgetentities: ' + j.error.code + ' — ' + j.error.info);
        ents = (j && j.entities) || {};
        cachePut('npp-ent', key, ents);
      }
      for (const [q, e] of Object.entries(ents)) {
        const cur = out[q] || (out[q] = { id: q });
        for (const k of ['claims', 'labels', 'aliases']) {
          if (!e[k]) continue;
          cur[k] = Object.assign(cur[k] || {}, e[k]);
        }
        for (const k of Object.keys(e)) if (!(k in cur)) cur[k] = e[k];
      }
    }
  }
  return out;
}

const say = (...a) => console.log(...a);

/* ── 1. the scope ─────────────────────────────────────────────────────────── */
say('scope: instances of', SCOPE, '(subclass tree)');
const ids = (await sparql(`SELECT DISTINCT ?p WHERE { ?p wdt:P31/wdt:P279* wd:${SCOPE} }`)).map((b) => qid(b.p.value));
say('  ', ids.length, 'facilities');

/* ── 2. what counts as a reactor ──────────────────────────────────────────── */
const reactorClasses = new Set((await sparql(`SELECT DISTINCT ?c WHERE { ?c wdt:P279* wd:${REACTOR} }`)).map((b) => qid(b.c.value)));
say('  ', reactorClasses.size, 'classes are a kind of nuclear reactor');

/* ── 2b. the language each facility's own country is governed in ────────────
   A plant's name in the language of the country it stands in is not a bonus
   translation, it is the name of the plant: Чорнобильська АЕС is in Ukraine and
   Ukrainian is what it is called there. Fetching only IntMap's nine UI languages
   made «чорнобиль» unresolvable in this ledger while the twelve hand-written
   regular expressions it replaces could answer it — the ledger was treating "the
   languages the product is read in" as if it were "the languages the world names
   these places in".

   Neither half of the join is written down here. The country is P17 on the
   facility, its official languages are P37 on the country, and the code each
   language is filed under in Wikidata is P424 (Wikimedia language code) on the
   language — so one query walks facility → country → language → code, and a
   country whose official language changes arrives on the next build. MEASURED
   2026-09-09: 66 countries in scope, every one of them with at least one P37
   whose language carries a P424, 78 distinct codes.

   Keyed by ISO 3166-1 alpha-2 because that is what a shipped record carries as
   its `country`; the map is shipped (out.officialLangs) so a consumer that meets
   the label key `uk` on a plant can tell provenance from noise, and so
   tests/r574-npp-checks.test.mjs can check a label code against the country it
   claims to come from without restating any of this. */
const official = new Map();
for (const b of await sparql(`SELECT DISTINCT ?iso ?code WHERE {
    ?p wdt:P31/wdt:P279* wd:${SCOPE} ; wdt:P17 ?c .
    ?c wdt:P297 ?iso ; wdt:P37 ?l . ?l wdt:P424 ?code }`)) {
  const isoCode = b.iso.value, lang = String(b.code.value || '').toLowerCase();
  /* A language code is a BCP-47-shaped token. Anything else is not something
     wbgetentities can be asked for, so it is refused rather than passed on. */
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang)) { say('   ⚠ ignoring P424 value that is not a language code:', JSON.stringify(b.code.value)); continue; }
  if (!official.has(isoCode)) official.set(isoCode, new Set());
  official.get(isoCode).add(lang);
}
const OFFICIAL_LANGS = [...new Set([...official.values()].flatMap((s) => [...s]))].sort();
say('  ', official.size, 'countries in scope declare an official language;', OFFICIAL_LANGS.length, 'distinct codes');

/* ── 3. the facts ─────────────────────────────────────────────────────────── */
/* Asked for in the UI languages AND in every official language that occurs, so
   that the label a site is known by at home is fetched at all. What is KEPT is
   narrower — see naming(). */
const FETCH_LANGS = [...new Set([...NAME_LANGS, ...Object.keys(UI_LANGS), ...OFFICIAL_LANGS])];
const ents = await entities(ids, 'claims|labels|aliases', FETCH_LANGS);
say('  ', Object.keys(ents).length, 'entities fetched');

/* countries, operators and power units, gathered from what the entities actually
   cite — never from a table of the countries somebody expected to see. */
const countryQ = new Set(), operatorQ = new Set(), unitQ = new Set(), unseenState = new Map();
for (const e of Object.values(ents)) {
  const c = best(claims(e, 'P17')); if (c) countryQ.add(dvItem(c));
  const o = best(claims(e, 'P137')); if (o) operatorQ.add(dvItem(o));
  for (const s of claims(e, 'P2109')) { const q = dvQuantity(s); if (q && q.unit) unitQ.add(q.unit); }
}

/* ISO 3166-1 alpha-2 (P297) for the countries that occur. */
const iso = new Map();
for (const grp of chunk([...countryQ].filter(Boolean), 200)) {
  const rows = await sparql(`SELECT ?c ?code WHERE { VALUES ?c { ${grp.map((q) => 'wd:' + q).join(' ')} } ?c wdt:P297 ?code }`);
  for (const b of rows) iso.set(qid(b.c.value), b.code.value);
}
say('  ', iso.size, 'of', countryQ.size, 'countries carry an ISO 3166-1 alpha-2 code');

/* Power units → watts, using Wikidata's OWN conversion (P2370, "conversion to
   SI unit"). Nothing here knows that a megawatt is 1e6 W; it asks. A unit that
   does not reduce to the watt (Q25236) is refused, not guessed at. */
const toWatt = new Map();
if (unitQ.size) {
  const rows = await sparql(`SELECT ?u ?amount ?si WHERE { VALUES ?u { ${[...unitQ].map((q) => 'wd:' + q).join(' ')} }
    ?u p:P2370/psv:P2370 [ wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?si ] }`);
  for (const b of rows) {
    if (qid(b.si.value) !== WATT) continue;
    const f = Number(b.amount.value);
    if (Number.isFinite(f) && f > 0) toWatt.set(qid(b.u.value), f);
  }
}
say('  ', toWatt.size, 'of', unitQ.size, 'power units reduce to the watt');

/* Operator names. */
const opEnts = await entities([...operatorQ], 'labels');
const opName = new Map();
for (const [q, e] of Object.entries(opEnts)) { const n = label(e, NAME_LANGS); if (n) opName.set(q, n); }

/* ── 4. one record per facility ───────────────────────────────────────────── */
function unitsOf(e) {
  /* Wikidata says how many reactors a site has in two shapes, and only these two:
       P2670 "has parts of the class" + P1114 quantity  — 68 facilities (measured)
       P527 / reverse P361 to individual reactor items  — 16 facilities (measured)
     Anything else is not asserted, and `units` is then null. It is NOT inferred
     from the name or the power output. */
  let n = 0, seen = false;
  for (const st of claims(e, 'P2670')) {
    const cls = dvItem(st);
    if (!cls || !reactorClasses.has(cls)) continue;
    let q = null;
    try { q = Number(String(st.qualifiers.P1114[0].datavalue.value.amount).replace('+', '')); } catch (_) { q = null; }
    if (Number.isFinite(q) && q > 0) { n += q; seen = true; }
  }
  if (seen) return n;
  const parts = claims(e, 'P527').map(dvItem).filter(Boolean);
  const asReactor = parts.filter((p) => {
    const pe = ents[p];
    return pe && claims(pe, 'P31').map(dvItem).some((c) => reactorClasses.has(c));
  });
  return asReactor.length ? asReactor.length : null;
}

/* ── the names a reader may actually type ────────────────────────────────────
   `name` alone is an English label, and a ledger that only holds English labels
   cannot answer 「福島第一原発」, «Чернобыльская АЭС» or 「ザポリージャ」 — which
   the twelve hand-written regular expressions this file replaces COULD answer.
   Replacing a list with an upstream must not cost the reader the languages the
   list happened to cover, so the same upstream is asked for the rest of them:

     labels   rdfs:label      one string per UI language (UI_LANGS above)
     alias    skos:altLabel   every other spelling Wikidata records, in ANY of
                              those languages, as ONE array — matching a name is
                              a cross-script question ("チョルノービリ" must reach
                              an item whose label is English), so the language a
                              spelling was filed under carries no information
                              the consumer can use.

   The languages asked for are the nine the product is READ in AND the ones the
   site's own country is GOVERNED in (see 2b) — the second half is why
   «чорнобиль» reaches Chornobyl NPP.

   Nothing is stored twice: a label equal to `name` is dropped, and an alias
   equal to the name or to any kept label is dropped. There is NO cap on the
   number of aliases — MEASURED 2026-09-09: 1,978 aliases over 445 of the 638
   sites, 3.1 on average and 53 at the worst (Q114295, Fukushima Daiichi), for a
   whole-file cost of 305 kB (the official languages added 8 kB of that). A cap
   would have to throw away the LONG spellings, because
   the short ones are what people type, and at this size there is nothing to buy
   with that loss. Revisit if the file approaches the ~500 kB where a fetch on a
   phone starts to be felt; the census is printed at the end of this build. */
function naming(q, e, name, home) {
  const labels = {}, same = [], keys = new Map();   /* keys: shipped key → the Wikidata code it came from */
  for (const [wd, ui] of Object.entries(UI_LANGS)) {
    const v = e.labels && e.labels[wd] && e.labels[wd].value;
    if (!v) continue;
    keys.set(ui, wd);
    if (v === name) same.push(ui); else labels[ui] = v;
  }
  /* …and the languages this particular site's own country is governed in. The
     key is the Wikidata code itself — a consumer meeting `uk` knows exactly
     which language answered, and no second table has to be consulted to find
     out. A code that is already a UI key is not asked twice.

     Dropped only where it would ship the same bytes twice: equal to `name`
     (recorded in nameLang instead, exactly as for a UI language), or equal to a
     label already kept for another VARIANT OF THE SAME LANGUAGE — zh-cn against
     zh-Hans is the same sentence in the same language under two spellings of the
     code. Two DIFFERENT languages that happen to agree are both kept, for the
     reason given above: that is two facts, not one repeated. */
  for (const wd of home) {
    if (keys.has(wd) || Object.values(UI_LANGS).includes(wd)) continue;
    const v = e.labels && e.labels[wd] && e.labels[wd].value;
    if (!v) continue;
    const base = wd.split('-')[0];
    const twice = [...keys].some(([k, c]) => c.split('-')[0] === base && (labels[k] === v || (same.includes(k) && name === v)));
    if (twice) continue;
    keys.set(wd, wd);
    if (v === name) same.push(wd); else labels[wd] = v;
  }
  /* `zh` is the code for "Chinese, script not stated", and it is kept only when
     it says something the script-specific codes do not: MEASURED 2026-09-09, 81
     items repeat their zh-Hans or zh-Hant label verbatim under `zh` (2.2 kB of
     the shipped file) while 272 items have `zh` and NO script-specific label at
     all. So the duplicate is dropped and the informative one is kept. Two
     different LANGUAGES whose label happens to coincide (fr and es, 18 cases,
     133 B) are both kept — a lookup map has to answer for the language it is
     asked about, and that coincidence is two facts, not one repeated. */
  if (labels.zh && (labels.zh === labels['zh-Hans'] || labels.zh === labels['zh-Hant'])) delete labels.zh;
  if (same.includes('zh') && (same.includes('zh-Hans') || same.includes('zh-Hant'))) same.splice(same.indexOf('zh'), 1);

  /* `same` is which UI languages call the site by `name` itself. It has to be
     SHIPPED (as `nameLang`): those labels are not repeated in `labels`, so
     without it nothing downstream can tell whether `name` is the reader's
     language or a foreign string — and 62 of the 638 sites are not named in
     English at all (measured), so "name is the English one" is not true either. */
  const seen = new Set([name, ...Object.values(labels)]);
  const alias = [];
  /* The alias languages are the SAME set the labels are drawn from — the UI
     languages plus this site's own country's. The fetch above asks for all 88
     codes at once (one request per 50 items, not per language), so without this
     filter a plant in France would ship the Ukrainian spellings of nothing. */
  const from = new Set([...Object.keys(UI_LANGS), ...home]);
  for (const [wd, arr] of Object.entries((e.aliases) || {})) {
    if (!from.has(wd)) continue;
    for (const a of (arr || [])) {
      const v = a && a.value;
      if (v && !seen.has(v)) { seen.add(v); alias.push(v); }
    }
  }
  return { labels, alias, same };
}

const records = [];
let noName = 0, noCoord = 0, multiPower = 0;
for (const q of ids) {
  const e = ents[q];
  if (!e) continue;
  const name = label(e, NAME_LANGS);
  if (!name) { noName++; continue; }
  const ll = dvCoord(best(claims(e, 'P625')));
  if (!ll) { noCoord++; continue; }
  const [lon, lat] = ll;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { noCoord++; continue; }

  const stQ = dvItem(best(claims(e, 'P5817')));
  const retired = wdDate(best(claims(e, 'P730')));   /* service retirement */
  const started = wdDate(best(claims(e, 'P729'))) || wdDate(best(claims(e, 'P571')));
  let status = stQ ? STATE_OF_USE[stQ] : null;
  if (stQ && !status) unseenState.set(stQ, (unseenState.get(stQ) || 0) + 1);
  if (!status) {
    /* No P5817. The dates still assert something: a retirement date means it
       stopped, a service-entry date with no retirement means it was running when
       the statement was last touched. Neither is invented — both are read. */
    if (retired) status = 'shutdown';
    else if (wdDate(best(claims(e, 'P729')))) status = 'operational';
    else status = 'unknown';
  }

  const pw = claims(e, 'P2109');
  if (pw.length > 1) multiPower++;
  const pq = dvQuantity(best(pw));
  let netMW = null;
  /* 1 kW resolution. The scope is not only power stations: research reactors are
     rated in kilowatts (measured: 6 facilities state kW, one states 1,000 W), and
     rounding to 0.1 MW turned those into "0 MW" — a fact deleted by arithmetic. */
  if (pq && Number.isFinite(pq.amount) && pq.amount > 0 && toWatt.has(pq.unit)) netMW = Math.round(pq.amount * toWatt.get(pq.unit) / 1e3) / 1e3;
  /* A stated "+0 MW" is not a rating, it is an empty field that reached the
     database as a number (measured: Q54296442 "Hinkley Point nuclear power
     stations", an umbrella item). It ships as null — "not stated" — because a
     consumer printing «0 MW» would be asserting something nobody asserted. */

  const cq = dvItem(best(claims(e, 'P17')));
  const oq = dvItem(best(claims(e, 'P137')));
  /* The site's home languages are looked up by the code it will SHIP as its
     country, so what a consumer can verify is exactly what the builder used.
     A facility whose country carries no ISO 3166-1 code (7 of 638, measured)
     gets the UI languages only — there is nothing to key the join on. */
  const home = [...(official.get(cq && iso.get(cq)) || [])];
  const { labels, alias, same } = naming(q, e, name, home);
  records.push({
    id: q,
    name,
    nameLang: same,
    ...(Object.keys(labels).length ? { labels } : {}),
    ...(alias.length ? { alias } : {}),
    country: (cq && iso.get(cq)) || null,
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    status,
    units: unitsOf(e),
    netMW,
    start: started || null,
    end: retired || null,
    operator: (oq && opName.get(oq)) || null,
    pris: null,   /* see the header: IAEA PRIS has no machine-readable route and Wikidata has no PRIS property */
    src: 'wikidata',
  });
}
say('  ', records.length, 'records —', noName, 'dropped for having no label,', noCoord, 'for having no usable P625');
if (multiPower) say('  ', multiPower, 'facilities state more than one P2109; the preferred/first statement is used');
for (const [q, n] of unseenState) say('   ⚠ unmapped P5817 value', q, '×', n, '→ status "unknown"; add it to STATE_OF_USE');

/* ── 5. one site, one record ──────────────────────────────────────────────────
   Wikidata regularly holds several items at ONE point: a site and a part of it
   ("Fukushima Daiichi" / "Fukushima Daiichi units 4, 5 and 6"), the same reactor
   entered twice, and the stations of a shared site that were all given the site's
   coordinate (measured: Sizewell A/B/C, Chooz A/B, Hunterston A/B, Tokai / Tokai
   No.2 — 47 such groups). Two pins at one point are one pin the reader cannot
   click, so a point carries one record. 0.001° is ~110 m, which is inside the
   footprint of a single site and far below the spacing of two distinct ones; it
   is the same window tests/r574-npp-checks.test.mjs measures.

   Nothing is deleted: the record kept is the WHOLE (a member that is P361 "part
   of" another member of the same group is a component and steps aside), then the
   one that asserts the most facts, and the rest stay reachable in `also`. */
const filled = (r) => ['country', 'status', 'units', 'netMW', 'start', 'end', 'operator'].filter((k) => r[k] != null && r[k] !== 'unknown').length;
const partOf = new Map(records.map((r) => [r.id, new Set(claims(ents[r.id], 'P361').map(dvItem).filter(Boolean))]));
const bySpot = new Map();
for (const r of records) {
  const k = Math.round(r.lat * 1000) + '/' + Math.round(r.lon * 1000);
  if (!bySpot.has(k)) bySpot.set(k, []);
  bySpot.get(k).push(r);
}
const plants = [];
let merged = 0;
for (const grp of bySpot.values()) {
  let cand = grp;
  if (grp.length > 1) {
    const ids = new Set(grp.map((r) => r.id));
    const wholes = grp.filter((r) => ![...partOf.get(r.id)].some((p) => ids.has(p)));
    if (wholes.length) cand = wholes;
  }
  const keep = cand.slice().sort((a, b) => filled(b) - filled(a) || a.id.localeCompare(b.id))[0];
  const rest = grp.filter((r) => r !== keep);
  if (rest.length) { keep.also = rest.map((r) => ({ id: r.id, name: r.name })); merged += rest.length; }
  plants.push(keep);
}
plants.sort((a, b) => a.id.localeCompare(b.id));
say('  ', merged, 'co-located records folded into their site (kept in `also`) →', plants.length, 'sites');

/* ── 6. write ─────────────────────────────────────────────────────────────── */
const counts = {};
for (const r of plants) counts[r.src] = (counts[r.src] || 0) + 1;
const shipped = new Set(plants.map((r) => r.country).filter(Boolean));
const out = {
  v: 1,
  generated: new Date().toISOString(),
  /* Which languages each country in the ledger is officially governed in
     (P37 → P424), for the countries that actually occur. This is what says
     that a label filed under `uk` on a plant in Ukraine is that plant's own
     name and not a stray translation. Only the countries with records are
     shipped: a table of every country on earth would be data nothing here
     answers for. */
  officialLangs: Object.fromEntries([...official].filter(([c]) => shipped.has(c))
    .sort((a, b) => a[0].localeCompare(b[0])).map(([c, s]) => [c, [...s].sort()])),
  sources: [{
    id: 'wikidata',
    licence: 'CC0-1.0',
    url: 'https://query.wikidata.org/sparql',
    scope: 'P31/P279* wd:' + SCOPE,
    count: counts.wikidata || 0,
  }],
  plants,
};
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
say('wrote', OUT, fs.statSync(OUT).size, 'bytes');
const tally = {};
for (const r of plants) tally[r.status] = (tally[r.status] || 0) + 1;
say('status:', JSON.stringify(tally));
say('with units:', plants.filter((r) => r.units != null).length, ' with netMW:', plants.filter((r) => r.netMW != null).length,
    ' with country:', plants.filter((r) => r.country).length, ' with operator:', plants.filter((r) => r.operator).length);
/* The census the naming block and tests/r574-npp-checks.test.mjs ⑦ are read
   against: how many sites can be NAMED in each language the product is read in,
   and how many spellings beyond those labels the ledger carries. */
const byLang = {};
for (const r of plants) {
  const has = new Set([...Object.keys(r.labels || {}), ...(r.nameLang || [])]);
  for (const k of has) byLang[k] = (byLang[k] || 0) + 1;
}
const aliases = plants.reduce((n, r) => n + ((r.alias || []).length), 0);
say('nameable in:', Object.entries(byLang).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join('  '), ' of', plants.length);
say('aliases:', aliases, 'over', plants.filter((r) => (r.alias || []).length).length, 'sites (max',
    plants.reduce((m, r) => Math.max(m, (r.alias || []).length), 0) + ')');
/* The census tests/r574-npp-checks.test.mjs ⑩ is read against: of the sites
   whose country declares an official language, how many can be named in it —
   i.e. how much of the ledger holds the name the place is known by at home.
   Codes are compared by their BASE subtag, exactly as ⑩ compares them, so the
   number printed here is the number that gate reads: Wikidata files China's
   official language as `zh-cn` while the labels themselves are `zh`/`zh-Hans`,
   which is one language under two codes and not a missing name. */
const baseTag = (c) => String(c).toLowerCase().split('-')[0];
const homeOf = (r) => out.officialLangs[r.country] || [];
const namedAtHome = (r) => {
  const has = new Set([...Object.keys(r.labels || {}), ...(r.nameLang || [])].map(baseTag));
  return homeOf(r).some((c) => has.has(baseTag(c)));
};
const homeable = plants.filter((r) => homeOf(r).length);
const pc = (n, d) => n + ' of ' + d + ' (' + (100 * n / (d || 1)).toFixed(1) + '%)';
say('nameable in an official language of its own country:', pc(homeable.filter(namedAtHome).length, homeable.length));
/* And the same figure for the sites whose home language IntMap does NOT read —
   the ones that exist only because of the P37/P424 join. This is the number that
   collapses to zero if that join, the language paging or the per-record filter
   ever breaks; the line above would barely move. */
const uiBases = new Set(Object.values(UI_LANGS).map(baseTag));
const foreign = homeable.filter((r) => !homeOf(r).some((c) => uiBases.has(baseTag(c))));
say('  of which home language is outside the nine UI languages:', pc(foreign.filter(namedAtHome).length, foreign.length));
