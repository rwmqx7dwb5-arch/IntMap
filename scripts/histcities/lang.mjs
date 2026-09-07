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
    _has: { jp: !!jp, de: !!o.de, ru: !!ru, es: !!o.es, zh: !!zh, 'zh-hans': !!(zhHans || zh), fr: !!o.fr, ko: !!ko },
  };
}

/* one span. `from`/`to` are YEARS, inclusive at both ends; 0 = open at that end.
   ⚠ The clock's floor is 1850 (js/chronos.js YMIN), so an open `from` means «for as long as this
   app can travel», not «since the city was founded». */
export function E(from, to, name) {
  if (from && to && from > to) throw new Error(`E(): ${from} > ${to} for «${name.en}»`);
  return { from: from || 0, to: to || 0, name };
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
