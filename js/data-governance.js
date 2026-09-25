/* ============================================================================
 *  IntMap · WHERE DID THIS NUMBER COME FROM — window.IntMapDataGovernance   (#729)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE GENERAL RULE WAS WRITTEN AS A COMMENT AND NEVER AS CODE. scripts/build-cshapes.mjs:372
 *  states, in prose, 「The general rule — every shipped data bundle's `src` names its licence — is
 *  scripts/doc-facts.mjs's `bundle-licence`, whose universe is discovered from data/」. Measured
 *  before this file existed: `bundle-licen` occurs ONCE in every tracked file, and that once is the
 *  sentence above. doc-facts.mjs has no such rule. So the repository's only statement of the
 *  cross-cutting rule was a pointer to an implementation nobody wrote — the shape
 *  [[intmap-refusal-that-becomes-implementation]] and [[intmap-licence-must-be-a-value]] name, and
 *  the cost was measurable: scripts/data-governance.mjs counts 72 logical datasets under data/ and 43
 *  scripts that write into them, and 130 of those subjects state not one governance facet.
 *
 *  ══ AND THE REASON NO GATE COULD SEE IT IS THAT GOVERNANCE WAS PROSE IN THREE WORLDS ══════════
 *  Measured, before this file:
 *    ① js/gis-datasets.js + js/gis-export.js + js/gis-project.js — the ONLY place a licence was a
 *       value, and it covered data a READER drops on the map, never data IntMap ships.
 *    ② js/reference-data.js DATA_SOURCES — the reader-visible credits, 175 rows of `{n,u}`, with
 *       the licence buried inside the NAME: 「Country facts — mledoze/countries (…; ODbL 1.0, build
 *       time only)」. A machine asking 「what are the terms」 has to parse a sentence.
 *    ③ Each bundle's own `src` string, checked by 9 SUBJECT-SPECIFIC gates with /CC0/.test(d.src)
 *       and one hand-copied DATA_SOURCES regex in TWO builders. Nine rules on nine functions; zero
 *       on the fact (.agents/rules/no-ad-hoc-hardcoding.md §3).
 *  The three were never compared. This module is the one vocabulary all three now read, so a term
 *  stated once is the term the gate checks, the term Atlas answers with, and the term the reader
 *  sees — never three spellings of one obligation.
 *
 *  ══ THE CONTRACT ══════════════════════════════════════════════════════════════════════════════
 *      SPELLINGS                  the synonym groups this repository's provenance writers use
 *      statedValue(obj, group)    the first key of a group the object ACTUALLY carries, or null
 *      FACETS / SUBJECTS          the declared slots of a governance record
 *      REASONS                    why a facet is silent — a CODE, never a sentence
 *      FRESHNESS                  the verdicts, and `unknown` is not a weaker `stale`
 *      read(rec)                  one normalisation, wherever the record came from
 *      freshness(rec, now)        {verdict, reason, ageDays, ...}
 *      attribution(rec)           the DISPLAY string, DERIVED from the values (never the source)
 *      account(rec)               {stated, undeclared:[{facet,why}], notApplicable:[{facet,why}]}
 *      measureQuality(rows, opt)  missing / out-of-range / duplicate counts, as a MEASUREMENT
 *
 *  ⚠ NO VALUE IS WRITTEN IN THIS FILE. There is no table of sources here and there never may be:
 *  every statement is asked of the thing that states it (a bundle's own bytes, a builder's own
 *  LICENCE, a layer's own registration). A list here would be the photograph
 *  [[intmap-discovered-list-is-a-photograph]] measured — right on the day it was written.
 *
 *  ⚠ NO DOM, NO window, NO fetch. `scripts/data-governance.mjs` imports this file in Node and
 *  js/gis-core.js mounts it in the browser; two readers of one vocabulary is the point, and a
 *  vocabulary that needs a document is a vocabulary only one of them can have
 *  ([[intmap-two-readers-one-field-list]]).
 * ========================================================================== */

/* ⚠⚠⚠ ONE EXPORTED TOP-LEVEL BINDING, AND THE WHOLE FILE INSIDE IT. tests/r175 ③ is the property
   the bundling rests on: a js/ module may hold NO unexported top-level declaration, because a
   classic script's top-level `const`/`function` was a global and these files are still loaded as
   chunks beside kernels that resolve each other by global name. This module has module-private
   helpers that nothing outside may import — the cadence parser, the calendar arithmetic, the
   instant reader, the aging fraction — and exporting them to satisfy the rule would trip its other
   half (an export no js/ module names is dead code). So they live in one closure and the file
   publishes exactly what its readers import, the way js/gis-core.js publishes `mountGis`.
   ⚠ WRAPPED WHOLE, NOT REWRITTEN: the body below is what it was, minus the `export` keyword on
   each public name, which the return statement now carries instead. */
export const {
  SPELLINGS, FACETS, SUBJECTS, REASONS, FRESHNESS,
  statedValue, read, freshness, attribution, account, measureQuality, makeDataGovernance,
} = (function () {


/* ── the spellings ──────────────────────────────────────────────────────────────────────────────
   ⚠ THIS TABLE WAS PRIVATE TO ONE FILE. It began as `INTEROP` inside js/gis-export.js's factory
   closure — correct, complete for what it read, and unreachable from anywhere else, so the build
   scripts that write the same facts used their own spellings (`src`, `generated`, `lic`) and the
   reader-visible table used a third. Promoting it is the whole of the unification: `licence` and
   `license` are two spellings of ONE word, not two facts, and there is now ONE place that says so.
   ⚠ A key in none of these groups IS NOT LOST — read() carries the whole record verbatim beside
   the groups, for the reason js/gis-atlas.js datasetRow() is a projection and not a copy. */
const SPELLINGS = Object.freeze({
  publisher: Object.freeze(['publisher', 'author', 'agency', 'producer']),
  /* the human-readable credit line an upstream asks to be shown */
  attribution: Object.freeze(['attribution', 'attributions', 'credit', 'credits']),
  /* ⚠ `lic` IS THIS REPOSITORY'S OWN SPELLING AND IT BELONGS HERE. js/reference-data.js's
     DATA_SOURCES rows (the reader-visible credits) and scripts/build-elections.mjs's per-pack
     records both write `lic`; leaving it out would have meant the one registry a reader actually
     opens was illegible to the vocabulary that exists to read registries — two spellings of one
     fact, which is the defect this file's header describes. */
  licence: Object.freeze(['licence', 'license', 'lic']),
  licenceUrl: Object.freeze(['licenceUrl', 'licenseUrl', 'licenceHref', 'licUrl', 'terms']),
  source: Object.freeze(['url', 'source', 'href', 'sourceUrl', 'source_url']),
  /* when THIS COPY was taken from upstream */
  retrievedAt: Object.freeze(['retrievedAt', 'fetchedAt', 'readAt', 'acquiredAt', 'at', 'retrieved']),
  /* when this copy was WRITTEN by a builder — not the same fact as retrievedAt, and not the same
     fact as asOf. A bundle rebuilt today from a 2017 upstream is a new file about an old world. */
  generatedAt: Object.freeze(['generatedAt', 'builtAt', 'generated', 'buildTime']),
  /* what the data is ABOUT. ⚠ THE ONE THE OTHER TWO ARE MOST OFTEN MISTAKEN FOR. */
  asOf: Object.freeze(['asOf', 'asof', 'as_of', 'epoch', 'vintage']),
  /* how often upstream publishes, as an ISO 8601 duration or the word `static`. Declared BY THE
     SUPPLIER, never inferred from how often we happened to fetch. */
  cadence: Object.freeze(['cadence', 'updateEvery', 'refresh']),
  /* the name of the DATA_SOURCES row that PAYS an attribution obligation — a value that must match
     a row's `n` exactly, because 「説明ではなく値で照合する」 (scripts/histcities/lang.mjs's LIC). */
  paidBy: Object.freeze(['paidBy', 'creditRow', 'attributionRow']),
  /* the script that rebuilds this bundle, so 「もう一度取れるか」 has an answer */
  builtBy: Object.freeze(['builtBy', 'buildScript', 'script']),
  /* which upstream wins when two of them answer the same question, and WHY */
  priority: Object.freeze(['priority', 'prefer', 'rank']),
  /* the measurement, never a verdict somebody typed */
  quality: Object.freeze(['quality', 'qa']),
  /* the schema (or validator) this bundle was checked against */
  schema: Object.freeze(['schema', 'validatedBy', 'validator']),
});

/* ⚠ THE SUBJECTS ARE THE FACETS' OWN PREFIXES, NOT A SECOND LIST — the argument js/gis-atlas.js
   PREFETCH_SUBJECTS is written for. A subject written out here could lose one the facets gained. */
const FACETS = Object.freeze([
  /* 誰の仕事か */
  'origin.publisher', 'origin.url', 'origin.retrievedAt', 'origin.builtBy',
  /* どの条件で再配布できるか */
  'rights.licence', 'rights.licenceUrl', 'rights.attribution', 'rights.paidBy',
  /* いつのものか — 3 つは別の事実である */
  'freshness.generatedAt', 'freshness.asOf', 'freshness.cadence', 'freshness.verdict',
  /* 形と中身が測られているか */
  'integrity.schema', 'integrity.rows', 'integrity.missing', 'integrity.outOfRange',
  'integrity.duplicates',
  /* 同じ問いに上流が 2 つあるとき、どちらを採るか */
  'precedence.rank', 'precedence.over',
]);

const SUBJECTS = Object.freeze(
  FACETS.map((f) => f.slice(0, f.indexOf('.'))).filter((s, i, a) => a.indexOf(s) === i)
);

/* ── why a facet is silent ──────────────────────────────────────────────────────────────────────
   ⚠ EVERY ONE OF THESE IS AN OBSERVATION, NEVER A DEFAULT. A facet with no reason is a facet that
   was STATED. And 「宣言が無い」 と 「その問いは当たらない」 are two different answers, which is why
   account() puts every facet in exactly one of three places rather than leaving a key absent
   ([[intmap-data-must-not-claim-an-author-it-lacks]]). */
const REASONS = Object.freeze([
  'record-absent',              /* the bundle carries no governance record at all */
  'facet-undeclared',           /* the record exists and is silent about this facet */
  'stated-only-in-prose',       /* a value was found inside a sentence, which is not a value */
  'no-builder-in-repo',         /* nothing here rebuilds this bundle, so no builder can state it */
  'licence-imposes-no-credit',  /* the terms make attribution optional, so no row is owed */
  'upstream-states-no-cadence', /* the supplier does not publish on a schedule it declares */
  'static-by-construction',     /* a derived bundle whose inputs are fixed — 「次の更新」 が無い */
  'not-measured',               /* the quality facets: nobody ran a pass, so there is no count */
  'single-upstream',            /* precedence does not apply: one supplier answers this question */
]);

/* ── freshness ──────────────────────────────────────────────────────────────────────────────────
   ⚠ FOUR WORDS, AND `unknown` IS NOT A WEAKER `stale`. `stale` means 「宣言された周期より古い」 —
   an observation, made against a cadence the supplier declared. `unknown` means 「測れなかった」 —
   nothing was declared to measure against. The repository has paid for collapsing those two before
   ([[intmap-atlas-failed-because-intmap-said-so]]: 「確認できなかった」 is not a failure), and a
   reader needs different things from them: a stale bundle is fixed by refetching, an unknown one by
   somebody declaring a cadence. */
const FRESHNESS = Object.freeze(['fresh', 'aging', 'stale', 'unknown']);

/* `aging` begins at this fraction of the declared cadence.
   OBSERVATION: the one scheduled refresh in this repository (.github/workflows/tle-refresh.yml)
   runs twice a day against a cadence of one day, so a bundle is expected to be at most half a
   period behind its upstream when everything works. Two thirds leaves the margin that one missed
   run costs and still says 「そろそろ」 before the period is out.
   EXPIRES: if a refresh schedule is added whose period is longer than its own cadence — then a
   bundle would enter `aging` on the day it was written, and the fraction is the wrong instrument.
   CANON: this constant, read by freshness() alone. No caller may pass its own. */
const AGING_AT = 2 / 3;

/* ISO 8601 durations, to milliseconds. ⚠ MONTHS AND YEARS ARE NOT CONVERTED HERE.
   OBSERVATION: a month is 28–31 days and a year 365–366, so 「P1M 経過したか」 is a question about
   two calendar dates and not about a length. freshness() adds them to the date instead. */
const DUR = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

function parseCadence(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (/^static$/i.test(s)) return { static: true };
  const m = DUR.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map((x) => (x == null ? 0 : +x));
  if (!(y || mo || d || h || mi || se)) return null;
  return { years: y, months: mo, days: d, hours: h, minutes: mi, seconds: se };
}

/* Add a parsed cadence to a Date. Months and years move the calendar; the rest is arithmetic. */
function advance(date, c) {
  const d = new Date(date.getTime());
  if (c.years) d.setUTCFullYear(d.getUTCFullYear() + c.years);
  if (c.months) d.setUTCMonth(d.getUTCMonth() + c.months);
  const ms = ((c.days || 0) * 86400 + (c.hours || 0) * 3600 + (c.minutes || 0) * 60 + (c.seconds || 0)) * 1000;
  return new Date(d.getTime() + ms);
}

/* ⚠ A BARE YEAR IS THAT YEAR, NOT ITS FIRST INSTANT IN THE READER'S ZONE. `new Date('2017')` is
   UTC midnight, but `new Date('2017-01-01')`… also is, while `new Date(2017, 0, 1)` is local — the
   trap [[intmap-declared-axis-must-be-verified]] measured in four places. Everything here is
   parsed as UTC explicitly, and a string that is not a date is `null` rather than `NaN` wearing a
   Date's clothes. */
function parseInstant(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (s === '') return null;
  let m = /^(-?\d{1,6})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[1], 0, 1)); return isNaN(d.getTime()) ? null : d; }
  m = /^(-?\d{1,6})-(\d{2})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, 1)); return isNaN(d.getTime()) ? null : d; }
  m = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ── reading a record ───────────────────────────────────────────────────────────────────────── */

/* The first key of `group` that `obj` ACTUALLY carries, or null.
   ⚠ AN EMPTY STRING IS NOT A STATEMENT — a licence field somebody left blank must not become a
   licence claim. This is js/gis-export.js's statedValue(), promoted verbatim in behaviour so that
   the rule which kept a blank out of a GeoJSON keeps it out of a gate's verdict too. */
function statedValue(obj, group) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = SPELLINGS[group];
  if (!keys) return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const v = obj[key];
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return v;
  }
  return null;
}

/* Where a governance record hides. ⚠ ASKED IN THIS ORDER AND THE ORDER IS THE POINT: a bundle that
   carries `gov` has been written since this vocabulary existed and says so in values; `rights` is
   the shape data/hist-cities.json already ships (scripts/build-hist-cities.mjs:686); and a bare
   object IS a record when it carries the facets directly, which is how a builder's own LICENCE
   constant reaches this function without being wrapped first. */
function recordOf(x) {
  if (!x || typeof x !== 'object') return null;
  if (x.gov && typeof x.gov === 'object') return x.gov;
  if (x.governance && typeof x.governance === 'object') return x.governance;
  if (x.rights && typeof x.rights === 'object' && !Array.isArray(x.rights)) return x.rights;
  return x;
}

/* ⚠ `rights` IS SOMETIMES AN ARRAY, AND THAT IS NOT A DEFECT TO NORMALISE AWAY. data/hist-cities.json
   ships THREE upstreams in one bundle (OHM, Pleiades, Wikidata), each with its own terms, because
   739 rows came from one of them and 2,245 from another. A single licence for the file would be a
   claim no upstream made. read() therefore returns `upstreams[]` whenever more than one is stated,
   and the top-level facets are the ones that hold for EVERY row: the strictest obligation wins,
   because a file is only as redistributable as its least permissive part. */
function upstreamList(x) {
  if (!x || typeof x !== 'object') return null;
  const r = x.rights || x.upstreams || x.sources;
  if (Array.isArray(r) && r.length) return r.filter((e) => e && typeof e === 'object');
  return null;
}

/* One normalisation, wherever the record came from: a shipped bundle, a builder's constant, a
   layer registration, or a GIS record's `provenance`. Returns the facets as VALUES plus `raw`. */
function read(x) {
  const rec = recordOf(x);
  const list = upstreamList(x) || upstreamList(rec);
  const one = (r) => ({
    publisher: statedValue(r, 'publisher'),
    url: statedValue(r, 'source'),
    licence: statedValue(r, 'licence'),
    licenceUrl: statedValue(r, 'licenceUrl'),
    /* ⚠ TWO FACTS WEAR ONE WORD. `attribution` is a boolean in scripts/histcities/lang.mjs's LIC
       (「表記が再配布の条件か」) and a credit STRING in js/gis-export.js's INTEROP (「表示する文」).
       Both are real and neither may swallow the other, so the boolean is `required` and the string
       is `credit`. A truthy non-boolean states the string and, by stating it, states that there is
       something to show — but it does not state that showing it is a CONDITION. */
    credit: (() => { const v = statedValue(r, 'attribution'); return typeof v === 'boolean' ? null : v; })(),
    creditRequired: (() => {
      const v = statedValue(r, 'attribution');
      return typeof v === 'boolean' ? v : null;
    })(),
    paidBy: statedValue(r, 'paidBy'),
    retrievedAt: statedValue(r, 'retrievedAt'),
  });
  const base = one(rec);
  const out = {
    ...base,
    generatedAt: statedValue(rec, 'generatedAt'),
    asOf: statedValue(rec, 'asOf'),
    cadence: statedValue(rec, 'cadence'),
    builtBy: statedValue(rec, 'builtBy'),
    priority: statedValue(rec, 'priority'),
    quality: statedValue(rec, 'quality'),
    schema: statedValue(rec, 'schema'),
    upstreams: null,
    /* verbatim — the real carrier, for the reason js/gis-export.js keeps `raw` */
    raw: rec && typeof rec === 'object' ? rec : null,
  };
  if (list) {
    out.upstreams = list.map(one);
    /* ⚠ THE STRICTEST OBLIGATION WINS, and 「一つも述べていない」 does not become 「不要」.
       If ANY upstream requires credit the file does; if any is silent the answer is null, never
       false — the same rule js/gis-sources.js §3.1 states for coverage (沈黙は all ではない). */
    const reqs = out.upstreams.map((u) => u.creditRequired);
    out.creditRequired = reqs.some((v) => v === true) ? true
      : (reqs.length && reqs.every((v) => v === false) ? false : null);
    if (out.licence == null) {
      const ls = out.upstreams.map((u) => u.licence).filter((v) => v != null);
      /* Many licences in one file cannot be summarised into one; the list is the answer. */
      if (ls.length === 1) out.licence = ls[0];
    }
    if (out.publisher == null) {
      const ps = out.upstreams.map((u) => u.publisher).filter((v) => v != null);
      if (ps.length === 1) out.publisher = ps[0];
    }
  }
  return out;
}

/* ── freshness ──────────────────────────────────────────────────────────────────────────────── */

/* ⚠ THE VERDICT IS MEASURED AGAINST A DECLARED CADENCE, AND AGAINST NOTHING ELSE. There is no
   default period here: a bundle whose supplier publishes once and never again is not stale in
   2030, and a bundle with no cadence is not fresh because nobody complained. Both answer
   `unknown`, with different reasons, and the gate fails on NOT STATING rather than on being old
   (.agents/rules/no-ad-hoc-hardcoding.md §4 — a threshold with no author is not a threshold). */
function freshness(x, now) {
  const r = read(x);
  const at = parseInstant(r.generatedAt) || parseInstant(r.retrievedAt);
  const cad = parseCadence(r.cadence);
  const ref = parseInstant(now) || new Date();
  const ageDays = at ? Math.max(0, (ref.getTime() - at.getTime()) / 86400000) : null;
  const out = { verdict: 'unknown', reason: null, ageDays: ageDays == null ? null : Math.round(ageDays * 10) / 10, at: at ? at.toISOString() : null, cadence: r.cadence == null ? null : String(r.cadence) };
  if (!cad) { out.reason = r.cadence == null ? 'facet-undeclared' : 'upstream-states-no-cadence'; return out; }
  if (cad.static) {
    /* ⚠ 「更新されない」 IS A FRESHNESS ANSWER, NOT THE ABSENCE OF ONE. A bundle derived from fixed
       inputs is as current as it will ever be, and calling that `unknown` would send a reader
       looking for a refresh that does not exist. */
    out.verdict = 'fresh'; out.reason = 'static-by-construction'; return out;
  }
  if (!at) { out.reason = 'facet-undeclared'; return out; }
  const due = advance(at, cad);
  const span = due.getTime() - at.getTime();
  const elapsed = ref.getTime() - at.getTime();
  if (elapsed >= span) { out.verdict = 'stale'; out.reason = 'older-than-declared-cadence'; out.dueAt = due.toISOString(); return out; }
  out.verdict = elapsed >= span * AGING_AT ? 'aging' : 'fresh';
  out.dueAt = due.toISOString();
  return out;
}

/* ── the display string, DERIVED ─────────────────────────────────────────────────────────────── */

/* ⚠⚠⚠ THE SENTENCE IS BUILT FROM THE VALUES, AND THE VALUES ARE NEVER PARSED BACK OUT OF IT. This
   is js/map-ui.js's `measure`→`text` precedent (#R763) applied to credit: before this round the
   layer registry held `source:()=>'aisstream.io / Digitraffic (Fintraffic, CC BY 4.0) AIS'` — a
   licence obligation legible to a human and to nothing else. A registration states the values; the
   line a reader sees comes from here, so a change of terms upstream cannot leave one of the two
   saying the old thing.
   ⚠ AND IT STATES ONLY WHAT IS STATED. No 「出典不明」, no 「Public domain」 by omission: an absent
   publisher produces a shorter line, never an invented one. */
function attribution(x) {
  const r = read(x);
  const one = (u) => {
    const bits = [];
    if (u.credit) bits.push(String(u.credit));
    else if (u.publisher) bits.push(String(u.publisher));
    if (u.licence) bits.push(String(u.licence));
    return bits.join(' · ');
  };
  if (r.upstreams && r.upstreams.length) {
    const lines = r.upstreams.map(one).filter((s) => s !== '');
    return lines.length ? lines.join(' / ') : null;
  }
  const s = one(r);
  return s === '' ? null : s;
}

/* ── accounting ─────────────────────────────────────────────────────────────────────────────── */

/* Every facet in exactly one of three places: stated (inside its subject), `undeclared` with WHY
   the silence, or `notApplicable` with why the question does not apply. ⚠ AN ABSENT KEY IS NEITHER
   OF THOSE, which is the distinction js/gis-atlas.js prefetch() is built on and the one this
   repository keeps paying for. A reader of `undeclared` learns what to go and find out; a reader of
   `notApplicable` learns not to look.
   `opts.hasBuilder` — whether anything in the repository rebuilds this bundle. Passed in, because
   this module does not read the filesystem and must not guess. */
function account(x, opts) {
  const o = opts || {};
  const r = read(x);
  const out = {};
  for (const s of SUBJECTS) out[s] = {};
  out.undeclared = [];
  out.notApplicable = [];
  const put = (f, v) => { const i = f.indexOf('.'); out[f.slice(0, i)][f.slice(i + 1)] = v; };
  const none = (f, why) => { out.undeclared.push({ facet: f, why: why }); };
  const na = (f, why) => { out.notApplicable.push({ facet: f, why: why }); };
  /* 「記録が無い」 is one reason for every facet, said once per facet so a caller counting
     undeclared facets counts the same way whether the record is absent or merely silent. */
  const mute = r.raw ? 'facet-undeclared' : 'record-absent';

  /* 誰の仕事か */
  if (r.publisher != null) put('origin.publisher', String(r.publisher)); else none('origin.publisher', mute);
  if (r.url != null) put('origin.url', String(r.url)); else none('origin.url', mute);
  if (r.retrievedAt != null) put('origin.retrievedAt', String(r.retrievedAt)); else none('origin.retrievedAt', mute);
  if (r.builtBy != null) put('origin.builtBy', String(r.builtBy));
  else if (o.hasBuilder === false) na('origin.builtBy', 'no-builder-in-repo');
  else none('origin.builtBy', mute);

  /* どの条件で再配布できるか */
  if (r.licence != null) put('rights.licence', String(r.licence)); else none('rights.licence', mute);
  if (r.licenceUrl != null) put('rights.licenceUrl', String(r.licenceUrl)); else none('rights.licenceUrl', mute);
  if (r.creditRequired != null) put('rights.attribution', r.creditRequired); else none('rights.attribution', mute);
  /* ⚠ THE ROW THAT PAYS IT IS OWED ONLY WHEN THE TERMS IMPOSE IT. Asking every bundle for a
     DATA_SOURCES row would make a public-domain file fail a test about somebody else's licence. */
  if (r.paidBy != null) put('rights.paidBy', String(r.paidBy));
  else if (r.creditRequired === false) na('rights.paidBy', 'licence-imposes-no-credit');
  else none('rights.paidBy', mute);

  /* いつのものか */
  if (r.generatedAt != null) put('freshness.generatedAt', String(r.generatedAt)); else none('freshness.generatedAt', mute);
  if (r.asOf != null) put('freshness.asOf', String(r.asOf)); else none('freshness.asOf', mute);
  if (r.cadence != null) put('freshness.cadence', String(r.cadence)); else none('freshness.cadence', mute);
  const fr = freshness(x, o.now);
  /* ⚠ THE VERDICT IS ALWAYS STATED, INCLUDING `unknown`. It is this module's own measurement and
     never a supplier's silence, so it belongs in `stated` with its reason beside it — the shape
     #R759 gave a derived coverage (`derived:true`), for the same reason. */
  put('freshness.verdict', { verdict: fr.verdict, reason: fr.reason, ageDays: fr.ageDays, derived: true });

  /* 形と中身が測られているか */
  if (r.schema != null) put('integrity.schema', String(r.schema)); else none('integrity.schema', mute);
  const q = (r.quality && typeof r.quality === 'object') ? r.quality : null;
  const qf = (facet, key) => {
    if (q && q[key] != null) put('integrity.' + facet, q[key]);
    else none('integrity.' + facet, q ? 'facet-undeclared' : 'not-measured');
  };
  qf('rows', 'rows'); qf('missing', 'missing'); qf('outOfRange', 'outOfRange'); qf('duplicates', 'duplicates');

  /* 同じ問いに上流が 2 つあるとき */
  const pr = r.priority;
  if (pr != null && typeof pr === 'object') {
    if (pr.rank != null) put('precedence.rank', pr.rank); else none('precedence.rank', 'facet-undeclared');
    if (pr.over != null) put('precedence.over', pr.over); else none('precedence.over', 'facet-undeclared');
  } else if (pr != null) {
    put('precedence.rank', pr);
    none('precedence.over', 'facet-undeclared');
  } else if (r.upstreams && r.upstreams.length > 1) {
    none('precedence.rank', mute); none('precedence.over', mute);
  } else {
    na('precedence.rank', 'single-upstream'); na('precedence.over', 'single-upstream');
  }
  return out;
}

/* ── the measurement ────────────────────────────────────────────────────────────────────────────
   ⚠⚠⚠ THIS MEASURES. IT DOES NOT REFUSE. 「異常値を検出したら取得を失敗させる」 would need a
   threshold with an author for every field of every bundle, and a wrong one deletes correct data —
   the failure .agents/rules/no-ad-hoc-hardcoding.md §1 forbids (a constant nobody can date is a
   case-by-case fix wearing a number). So the counts become a STATEMENT on the bundle, the gate
   fails a bundle that never ran a pass, and a reader who sees 「3 rows out of the declared range」
   knows something a silent file could not have told them.
   ⚠ AND THE RANGE IS THE DECLARER'S, NOT THIS FUNCTION'S. `opts.fields` is {name:{min,max}} as the
   builder declared it from its upstream's documentation; a field with no declared range is counted
   as present-or-missing and never as out-of-range, because 「範囲を述べていない」 is not 「0〜1」. */
function measureQuality(rows, opts) {
  const o = opts || {};
  const fields = o.fields && typeof o.fields === 'object' ? o.fields : {};
  const list = Array.isArray(rows) ? rows : [];
  const out = { rows: list.length, missing: {}, outOfRange: {}, duplicates: 0 };
  const names = Object.keys(fields);
  for (const n of names) { out.missing[n] = 0; if (fields[n] && (fields[n].min != null || fields[n].max != null)) out.outOfRange[n] = 0; }
  /* The key that makes a row the same fact as another row. ⚠ DECLARED, never guessed: two rows with
     equal geometry are not one place (js/world-packs.js dedupeSameShape is about SHAPES), and a
     duplicate detector that invents its own identity deletes Tokyo-the-prefecture or
     Tokyo-the-city. A bundle with no declared key states `duplicates` as not measured. */
  /* ⚠ THE JOINED KEY IS JSON, NOT A DELIMITER. A separator character — even a control one — is a
     value some row is allowed to contain, and the first time it does, two different rows collapse
     into one 「duplicate」. JSON.stringify of the array keeps a value containing the separator apart
     with no character reserved, and it also keeps 1 and '1' apart, which a joined string cannot. */
  const keyOf = typeof o.key === 'function' ? o.key
    : (Array.isArray(o.key) && o.key.length
      ? (row) => JSON.stringify(o.key.map((k) => (row == null ? null : row[k])))
      : null);
  const seen = keyOf ? new Set() : null;
  for (const row of list) {
    for (const n of names) {
      const v = row == null ? null : row[n];
      if (v == null || (typeof v === 'string' && v.trim() === '')) { out.missing[n]++; continue; }
      const f = fields[n];
      if (!f || (f.min == null && f.max == null)) continue;
      const num = typeof v === 'number' ? v : Number(v);
      /* ⚠ A VALUE THAT IS NOT A NUMBER IS NOT OUT OF RANGE — it is a type problem, and calling it
         「範囲外」 would report the wrong defect. Counted as missing is equally wrong, so it is
         counted here, under its own name. */
      if (!Number.isFinite(num)) { out.notNumeric = out.notNumeric || {}; out.notNumeric[n] = (out.notNumeric[n] || 0) + 1; continue; }
      if ((f.min != null && num < f.min) || (f.max != null && num > f.max)) out.outOfRange[n]++;
    }
    if (seen) { const k = keyOf(row); if (seen.has(k)) out.duplicates++; else seen.add(k); }
  }
  if (!keyOf) delete out.duplicates;
  return out;
}

/* ── the browser mount ──────────────────────────────────────────────────────────────────────────
   Same convention as js/gis-core.js's other mounts: a factory, so the module imports in Node with
   no DOM and the app publishes one instance. */
function makeDataGovernance() {
  const API = {
    spellings: () => SPELLINGS,
    facets: () => FACETS.slice(),
    subjects: () => SUBJECTS.slice(),
    reasons: () => REASONS.slice(),
    freshnessWords: () => FRESHNESS.slice(),
    statedValue,
    read,
    freshness,
    attribution,
    account,
    measureQuality,
  };
  /* Each kernel is the right owner of its own name (js/gis-core.js's note on why the assembly does
     not name them a second time), and it publishes only where a window exists — this module is
     imported by scripts/data-governance.mjs in Node, where there is none. */
  try { window.IntMapDataGovernance = API; } catch (_) { }
  return API;
}
  return {
    SPELLINGS, FACETS, SUBJECTS, REASONS, FRESHNESS,
    statedValue, read, freshness, attribution, account, measureQuality, makeDataGovernance,
  };
})();
