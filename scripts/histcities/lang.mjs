/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — the shared vocabulary   (#R427)
 * ----------------------------------------------------------------------------
 *  「都市名ラベルも同じ要領で（Chronos に）対応するように。できる限り多くの、地名の
 *    変わった経験のある都市に。」 The country labels have travelled in time since #R94k
 *  (js/history.js `histId`); this is the same idea one level down — the name a SETTLEMENT
 *  carried in the year on the clock.
 *
 *  ══ WHAT A ROW IS ══════════════════════════════════════════════════════════════════════════
 *  One city, its coordinate, the spellings the vector tile may carry for it TODAY, and the
 *  spans in which it was called something else. Outside every span the modern tile label
 *  stands — so a city that reverted (Saint Petersburg → Petrograd → Leningrad → Saint
 *  Petersburg) is two spans and no third, rather than a chain that has to end at the present.
 *
 *  ⚠ THE COORDINATE IS NOT WHAT POSITIONS THE LABEL — the label is the tile's own, drawn where
 *  OpenMapTiles puts it. But since #R521 it IS what decides WHICH label is renamed: the row's
 *  point is the centre of the guard radius the runtime tests every candidate feature against
 *  (`distance`, js/hist-cities.js), and scripts/build-hist-cities.mjs proves the point against
 *  GeoNames. See the note on `C()` below.
 *
 *  ══ THE NINE LANGUAGES, AND WHAT A MISSING ONE MEANS ═══════════════════════════════════════
 *  `N()` takes en / ja / ru / zh-Hant / zh-Hans / ko positionally and de / es / fr as an
 *  options object, because those three take the English (Latin) form for the overwhelming
 *  majority of transliterated proper nouns and differ only where the language really has its
 *  own word for the place.
 *
 *  ⚠ A ZERO IS A STATEMENT, NOT A GAP. `N('Tsaritsyn','ツァリーツィン','Царицын',0,0,0)` says
 *  «no established Chinese or Korean form for this place» — and the answer there is the Latin
 *  name, which is EXACTLY what the live map already does for such a city: js/place-labels.js
 *  coalesces `name:zh-Hant` → `name:zh` → `name:en` → `name:latin`, so a settlement OSM has no
 *  Chinese tag for is already labelled in Latin for a Chinese reader. Inventing a transcription
 *  here would make the past claim more than the present does.
 *  ⚠ THE BUILD RESOLVES THE DEFAULTS, so data/hist-cities.json carries all nine keys spelled
 *  out and js/hist-cities.js has no fallback rule of its own to keep in step. `--check` prints
 *  the per-language coverage, so «how much of this is Latin» is a measured number.
 *
 *  ⚠ THE KEYS ARE js/lang-registry.js's OWN CODES — `jp`, `zh` (Traditional) and `zh-hans`.
 *  Same rule, and same reason, as scripts/wars/lang.mjs: a second spelling of the language list
 *  fails the quiet way, with a reader in 日本語 silently getting English.
 * ==========================================================================*/

/** ⚠ NOT A RECORD FILE — scripts/histcities-record.mjs skips a module that says so. */
export const HELPER = true;

/* ⚠⚠⚠ THE ONE COPY OF THE LANGUAGE LIST, in js/lang-registry.js's own codes and in the order
   data/hist-cities.json publishes as `langs`. Everything downstream indexes by this order —
   including the derived rows' attestation bitmask, where a reordering would silently relabel
   which language somebody attested. A second spelling of this list fails the quiet way, with a
   reader in 日本語 getting English (the same reason scripts/wars/lang.mjs gives). */
export const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

/* one era name in nine languages. `o` = { de, es, fr } where they differ from the English form. */
export function N(en, jp, ru, zh, zhHans, ko, o) {
  o = o || {};
  if (!en || typeof en !== 'string') throw new Error('N(): the English form is required');
  return {
    en,
    jp: jp || en,
    de: o.de || en,
    ru: ru || en,
    es: o.es || en,
    zh: zh || en,
    'zh-hans': zhHans || zh || en,
    fr: o.fr || en,
    ko: ko || en,
    /* what the row actually SUPPLIED, so the build can measure coverage instead of guessing it */
    _has: { en: true, jp: !!jp, de: !!o.de, ru: !!ru, es: !!o.es, zh: !!zh, 'zh-hans': !!(zhHans || zh), fr: !!o.fr, ko: !!ko },
  };
}

/* one span. `from`/`to` are YEARS, inclusive at both ends; 0 = open at that end.
   ⚠ (#R679) AN OPEN `from` MEANS «BEFORE THIS RECORD SAYS ANYTHING», NOT «SINCE THE FOUNDING».
   It used to mean «for as long as this app can travel», and that reading died with the floor it
   rested on: the clock now reaches astronomical year −122 999 (js/hist-scale.js FLOOR, which
   scripts/build-hist-cities.mjs evaluates rather than copies). An open start on a row about a
   nineteenth-century renaming does not assert anything about the Pleistocene; it asserts that
   nobody wrote down when the name began. */
export function E(from, to, name) {
  if (from && to && from > to) throw new Error(`E(): ${from} > ${to} for «${name.en}»`);
  return { from: from || 0, to: to || 0, name };
}

/* ══ ⚠⚠⚠ THE DERIVED VOCABULARY (#R679) ═════════════════════════════════════════════════════
 *  scripts/histcities/harvest.mjs writes thousands of rows out of Wikidata and Pleiades, and
 *  they cannot use `C`/`E`/`N` for three reasons, each of which is a claim the derived side is
 *  not entitled to make:
 *
 *   ① `N()` FILLS EVERY MISSING LANGUAGE WITH THE ENGLISH FORM AND FORGETS IT DID. That is right
 *      for a handwritten row, where a zero is a person saying «there is no established Chinese
 *      form» — the record's `_has` map records exactly that, and the build measures it. It is
 *      wrong for a derived row, where a missing language means «the upstream has not written one
 *      down», and the two must not look the same. Measured over the whole Wikidata corpus, the
 *      nine languages are served 2 465 (ru) / 919 (ja) / 800 (fr) / 511 (es) / 458 (de) /
 *      303 (en) / 278 (zh-cn) / 64 (zh) / 5 (ko) times — Korean FIVE — and not one of Volgograd,
 *      Tokyo, Istanbul, Saint Petersburg, Mumbai or Ho Chi Minh City has all nine. So `ED()`
 *      takes a MAP plus an attestation bitmask, the file ships the fallback spelled out exactly
 *      as before (js/hist-cities.js has no fallback rule of its own, and must not grow one), and
 *      `a` says which of the nine were actually written by somebody.
 *   ② A DERIVED SPAN HAS A PRECISION. «1868-09-03» and «1868» are different facts and the record
 *      has to be able to hold both, or the build invents a day (IM-20260824-001: 架空の改称日を
 *      捏造しない). An endpoint is [year, month, day, precision] with month/day 0 where the
 *      upstream did not give one, and precision one of 'd' 'm' 'y' 'c' — 'c' meaning the
 *      endpoint is a PERIOD BOUNDARY out of a vocabulary, which is what every Pleiades date is.
 *   ③ A DERIVED ROW CARRIES ITS OWN EVIDENCE instead of pointing at the committed homonym index,
 *      which covers only the handwritten record's spellings. See scripts/histcities/harvest.mjs.
 *
 *  ⚠ THE YEAR IS ASTRONOMICAL AND MAY BE NEGATIVE. −330 is 331 BC. There is a year 0 and the
 *  shipped encoding cannot express it (0 means «open»), so the harvest drops those spans and
 *  counts them rather than moving anybody's dates by a year. */
const PRECISIONS = ['d', 'm', 'y', 'c'];

/** one derived endpoint: [y, m, d, precision], or 0 for «open at this end» */
function stamp(t, what, id) {
  if (!t || t === 0) return null;
  if (!Array.isArray(t) || t.length !== 4) throw new Error(`ED(): ${id} — ${what} must be [y, m, d, precision]`);
  const [y, m, d, p] = t;
  if (!Number.isInteger(y) || y === 0) throw new Error(`ED(): ${id} — ${what} year ${y} is not a usable astronomical year (0 is the shipped encoding's «open»)`);
  if (!Number.isInteger(m) || m < 0 || m > 12) throw new Error(`ED(): ${id} — ${what} month ${m}`);
  if (!Number.isInteger(d) || d < 0 || d > 31) throw new Error(`ED(): ${id} — ${what} day ${d}`);
  if (!PRECISIONS.includes(p)) throw new Error(`ED(): ${id} — ${what} precision «${p}» is not one of ${PRECISIONS.join(' ')}`);
  if (p === 'd' && (!m || !d)) throw new Error(`ED(): ${id} — ${what} claims day precision without a day`);
  if (p === 'm' && !m) throw new Error(`ED(): ${id} — ${what} claims month precision without a month`);
  return { y, m, d, p };
}

/** one derived span. `from`/`to` are stamps (or 0); `n` is a partial map; `a` is the bitmask. */
export function ED(from, to, n, a) {
  const id = (n && n.en) || '?';
  const f = stamp(from, 'the start', id), t = stamp(to, 'the end', id);
  if (!t) throw new Error(`ED(): ${id} has no end — a name that has not ended is the one the tile already carries`);
  if (!n || typeof n.en !== 'string' || !n.en) throw new Error(`ED(): ${id} has no en form`);
  if (!Number.isInteger(a) || a < 0 || a >= (1 << 9)) throw new Error(`ED(): ${id} — the attestation bitmask is nine bits`);
  const name = { _has: {}, _derived: true, _att: a };
  /* ⚠ INCLUDING ENGLISH. A derived row's English column may be a Latin-script spelling borrowed
     from whichever languages agreed on it (see harvest.mjs), so bit 0 is a fact to be recorded like
     the other eight, not a constant. A handwritten row always has one, and N() says so. */
  for (const [i, lg] of LANGS.entries()) {
    name[lg] = n[lg] || n.en;
    name._has[lg] = !!(a & (1 << i));
  }
  return { from: f, to: t, name, derived: true };
}

/** one derived city. `ev` is the guard evidence the harvest measured; the build re-derives from it. */
export function D(id, lon, lat, cc, keys, eras, ev) {
  const r = C(id, lon, lat, cc, keys, eras);
  if (!ev || !Array.isArray(ev.a) || typeof ev.on !== 'string') {
    throw new Error(`D(): «${id}» carries no guard evidence — a derived row proves its own coordinate`);
  }
  r.derived = true;
  r.ev = ev;
  return r;
}

/* one city.
     id    stable slug, unique across every region file
     lon   longitude   lat  latitude   (decimal degrees, the modern settlement)
     cc    ISO-3166-1 alpha-2 of the country the city is in TODAY
     keys  the spellings the OpenMapTiles `place` layer may carry today — its `name:en` and its
           local `name`.
     eras  the spans, in chronological order
     o     the exceptions, when the record needs one: { unlisted, waive } — see below

  ══ ⚠⚠⚠ (#R521) THE COORDINATE IS NOW WHAT DECIDES WHICH CITY IS RENAMED ═══════════════════
  Until #R521 this field was checked at build time and thrown away: the label was rewritten
  wherever the vector tile's NAME matched a key, anywhere on Earth. «Kochi» renamed 高知市 in
  Japan コーチン, because a spelling is not an identity. The runtime now asks the feature how
  far it is from THIS point (`distance`, js/hist-cities.js) and only renames it inside a guard
  radius that scripts/build-hist-cities.mjs derives from the nearest namesake on Earth.

  ⚠ SO A WRONG COORDINATE IS NOW A SILENT LOSS, not a harmless typo — the era name would
  simply never appear. That is why the build fails when the coordinate is more than 10 km from
  the settlement GeoNames holds under one of these spellings (it found four: Sorokyne was 26 km
  out, KwaDukuza 23, Kunming 21, Kariega 16).

  ── `o.unlisted` ────────────────────────────────────────────────────────────────────────────
  «GeoNames cities500 carries no settlement under any of these spellings, so the coordinate
  cannot be proven and the guard falls back to its default.» A sentence, not a boolean — the
  build prints it. Six rows have one; every other row must be provable.

  ── `o.measured` ────────────────────────────────────────────────────────────────────────────
  «The guard this row needs is below the default floor, and here is the measurement that says it
  is still big enough.» { km, on, why } — `km` is the distance, IN KILOMETRES, from this row's
  coordinate to the label node the vector tiles actually draw, `on` is the ISO date it was
  measured, `why` is the sentence.

  ⚠ THE FLOOR IS «WHAT AN UNMEASURED ROW GETS», NOT A LAW. GUARD_FLOOR_KM exists because the gap
  between the record's coordinate and the tile's own node is unknown offline and was as large as
  6.68 km (Tokyo) across the rows that were checked. A row that has actually been measured knows
  its own gap, and refusing it on a number derived from OTHER rows' worst case would be refusing
  evidence in favour of a default. The build still requires the guard to be at least three times
  the measured gap, and never below GUARD_HARD_FLOOR_KM — below that the vector tile's own
  quantisation at `ofm-city`'s minzoom (±0.6 km at z3) is a coin toss on its own.

  ── `o.waive` ───────────────────────────────────────────────────────────────────────────────
  «A DIFFERENT settlement inside the guard also answers to this spelling — but only in
  GeoNames' alternate-name list, not as its own name, so no vector tile carries it.» Written as
  { key, place, cc, why }. ⚠ The build RE-CHECKS the claim on every run: if GeoNames ever
  promotes that spelling to the other town's `name` or `asciiname`, the waiver stops matching
  and the build fails. A waiver is a statement about the world that keeps being tested, not a
  permanent exemption — which is what the old «!» suffix was. */
export function C(id, lon, lat, cc, keys, eras, o) {
  o = o || {};
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`C(): bad id «${id}»`);
  if (!(Math.abs(lon) <= 180) || !(Math.abs(lat) <= 90)) throw new Error(`C(): bad coordinate for «${id}»`);
  if (!/^[A-Z]{2}$/.test(cc)) throw new Error(`C(): bad country code for «${id}»`);
  if (!Array.isArray(keys) || !keys.length) throw new Error(`C(): «${id}» has no tile keys`);
  if (!Array.isArray(eras) || !eras.length) throw new Error(`C(): «${id}» has no eras`);
  if (o.unlisted !== undefined && (typeof o.unlisted !== 'string' || o.unlisted.length < 20)) {
    throw new Error(`C(): «${id}» declares «unlisted» without saying why`);
  }
  if (o.measured !== undefined) {
    const m = o.measured;
    if (!m || !(m.km >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(m.on || '') || !m.why || m.why.length < 20) {
      throw new Error(`C(): «${id}» — «measured» needs { km, on: 'YYYY-MM-DD', why } and the why must be a sentence`);
    }
  }
  if (o.waive !== undefined) {
    if (!Array.isArray(o.waive)) throw new Error(`C(): «${id}» — «waive» is a list of { key, place, cc, why }`);
    for (const w of o.waive) {
      if (!w || !w.key || !w.place || !/^[A-Z]{2}$/.test(w.cc || '') || !w.why || w.why.length < 20) {
        throw new Error(`C(): «${id}» — a waiver needs { key, place, cc, why } and the why must be a sentence`);
      }
    }
  }
  return { id, lon, lat, cc, keys, eras, unlisted: o.unlisted || '', waive: o.waive || [], measured: o.measured || null };
}

/* ══ ⚠⚠⚠ WHOSE RECORD THIS IS, AND WHAT THAT COSTS US (#R689) ═══════════════════════════════
 *  #R679 added two DERIVED sources to a record that had been entirely IntMap's own, and one of
 *  them — Pleiades — is CC BY 3.0, where attribution is a CONDITION OF REDISTRIBUTION. The
 *  harvest wrote that condition into the generated file's header, in these words: «sources.html
 *  must name Pleiades and its contributors». ⚠ IT NEVER DID. 739 Pleiades cities shipped inside
 *  data/hist-cities.json and no reader-facing page named Pleiades anywhere.
 *
 *  ⚠⚠⚠ AND NO GATE COULD HAVE CAUGHT IT, because the licence was PROSE. A sentence in a comment
 *  is addressed to whoever reads the file next, and «whoever reads the file next» is not a
 *  program. So the declaration is now a VALUE: a derived record file exports one of these, the
 *  loader refuses a derived file that does not (scripts/histcities-record.mjs), and
 *  scripts/build-hist-cities.mjs asserts that every publisher whose licence requires attribution
 *  is named by a row of js/reference-data.js's DATA_SOURCES. The rule is attached to the fact
 *  «these rows are somebody else's work», not to a list of filenames (#R429), so the next
 *  upstream anybody harvests is covered on the day it is written.
 *
 *    publisher   who is owed the credit, as they name themselves
 *    licence     the licence as the upstream states it, verbatim
 *    url         where that statement was read
 *    attribution true when the licence makes credit a condition of redistribution
 *    source      ⚠ when attribution is true: the EXACT `n` string of the DATA_SOURCES row that
 *                carries the credit. Not a description of it — the string, so the gate compares
 *                values and not two people's idea of the same name.
 *    read        the ISO date the licence text was read at `url` */
export function LIC(o) {
  o = o || {};
  const need = (k) => { if (typeof o[k] !== 'string' || o[k].length < 3) throw new Error(`LIC(): «${k}» is required and must say something`); };
  need('publisher'); need('licence'); need('url');
  if (typeof o.attribution !== 'boolean') throw new Error('LIC(): «attribution» must be true or false — «probably not» is not a licence reading');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.read || '')) throw new Error('LIC(): «read» must be the ISO date the licence text was read');
  if (o.attribution) need('source');
  /* ⚠ `!o.source`, not `o.source === undefined`: this declaration is written out with
     JSON.stringify and read back by the loader, and the round trip turns «absent» into «''». A
     rule that cannot survive its own serialisation is a rule that fires on the generated file. */
  else if (o.source) throw new Error('LIC(): a licence that owes no attribution names no DATA_SOURCES row');
  return Object.freeze({ publisher: o.publisher, licence: o.licence, url: o.url, attribution: o.attribution, source: o.source || '', read: o.read });
}
