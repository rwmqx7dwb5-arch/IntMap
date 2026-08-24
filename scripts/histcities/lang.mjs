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
 *  ⚠ THE COORDINATE IS NOT WHAT POSITIONS THE LABEL. The label is the tile's own, drawn where
 *  OpenMapTiles puts it; the coordinate here is what scripts/build-hist-cities.mjs checks the
 *  row against (data/gazetteer-world.json.gz), so a mistyped key is a city in the wrong country
 *  at build time rather than a wrong name on the map.
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
           local `name`. The label is rewritten when the tile's own name matches one of these,
           so this is the join, and scripts/build-hist-cities.mjs proves each one resolves to
           THIS city and to no other populated place on Earth.
     eras  the spans, in chronological order */
export function C(id, lon, lat, cc, keys, eras) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`C(): bad id «${id}»`);
  if (!(Math.abs(lon) <= 180) || !(Math.abs(lat) <= 90)) throw new Error(`C(): bad coordinate for «${id}»`);
  if (!/^[A-Z]{2}$/.test(cc)) throw new Error(`C(): bad country code for «${id}»`);
  if (!Array.isArray(keys) || !keys.length) throw new Error(`C(): «${id}» has no tile keys`);
  if (!Array.isArray(eras) || !eras.length) throw new Error(`C(): «${id}» has no eras`);
  return { id, lon, lat, cc, keys, eras };
}
