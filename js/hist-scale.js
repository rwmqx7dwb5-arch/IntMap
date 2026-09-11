/* ============================================================================
 *  hist-scale.js — the ARITHMETIC of deep time  (#R604)
 * ----------------------------------------------------------------------------
 *  「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。
 *    線の解像度も低すぎる。」
 *
 *  ══ ⚠⚠⚠ WHY THIS IS A FILE AND NOT THREE HELPERS WHERE THEY ARE USED ═══════
 *  #R570 measured the cost of the alternative and it was six P0 defects in one
 *  round: the pandemic model's arithmetic lived inside a DOM closure, so not one
 *  of its invariants could be asserted, and every one of them was wrong. The
 *  three functions below have exactly that shape — pure arithmetic, reachable
 *  only from inside a factory that needs a map, a language table and a slider to
 *  evaluate at all. They decide:
 *    · WHICH YEAR a boundary is drawn for (`decYear` → the number OHM's tiles
 *      compare against),
 *    · WHICH BOUNDARIES are drawn (`ohmFilter` → the expression the layer runs),
 *    · WHICH YEAR the reader actually asked for (`rail` → slider position ⇄ year).
 *  Get any of the three wrong by a little and the map is confidently wrong about
 *  a century, silently, in a way no screenshot shows. They are here so
 *  tests/r604-checks.test.mjs can EVALUATE them (#R505: a check that reads source
 *  cannot see what a function returns) rather than re-implement them, which would
 *  be a second copy of the rule and therefore a second answer.
 *
 *  ⚠ NOTHING IN HERE TOUCHES THE DOM, THE MAP, THE CLOCK OR THE LANGUAGE. That is
 *  the property that makes it testable and it is the property to keep.
 * ==========================================================================*/
window.IntMapHistScale = (function () {

  /* ══ ⓪a HOW FAR BACK THE CLOCK GOES, AND WHY THAT NUMBER ═══════════════════
     「Chronosの歴史的地名、境界線coverageを、できる限りすべてを最高レベル品質と
       精度で網羅するように。私はあなたにいつの時代までかをここで制限すること
       もしません。」
     #R349 put the floor at 1850, #R604 at year 1. Both times the number was the
     oldest year some subsystem could ANSWER, and both times the subsystems below
     it were reachable all along — #R604 found that the era snapshots it was
     already fetching went back to AD 100 while the list in js/time-borders.js
     stopped at 1815, because nobody had asked the directory.
     ⚠ ASKED AGAIN, 2026-09-10: `GET api.github.com/repos/aourednik/historical-
     basemaps/contents/geojson`, everything matching `world_*.geojson`. FIFTY-THREE
     snapshots, not thirty-six — seventeen of them BEFORE the common era, from
     bc1 down to bc123000. Every one of them was fetched and parsed here the same
     day. The clock's floor of 1 was the ONLY reason none of them could be shown.
     ⚠ SO THE FLOOR IS THAT DATASET'S OWN FLOOR, IN ASTRONOMICAL YEARS: 123,000 BC
     is astronomical −122,999 (there is no year 0 in the era convention — see
     `era` below, and the off-by-one is the whole reason that function exists).
     ⚠ EXPIRES the day upstream publishes something older, and the check does not
     read this comment: scripts/build-hist-eras.mjs --check compares this constant
     against the oldest snapshot in the shipped bundle, so the two cannot drift.
     ⚠ IT IS NOT A CLAIM THAT THE MAP KNOWS 123,000 BC. What the deepest snapshots
     carry is upstream's own answer — hominin ranges and archaeological cultures,
     not polities — and the era layer says which it is showing rather than letting
     a drawn line borrow the authority of a border (CONSTITUTION「偽物・ハリボテ禁止」).
     ⚠ `Date` REACHES IT. The ECMA time range is ±8.64e15 ms ≈ ±273,790 years from
     1970, measured here: −122999 round-trips through `setUTCFullYear` exactly. */
  const FLOOR = -122999;

  /* ══ ⓪ AN INSTANT IN A YEAR THE TWO-DIGIT RULE WOULD EAT ═════════════════════
     ⚠⚠⚠ `Date.UTC(y, …)` IS NOT A DATE IN YEAR y WHEN y < 100 — IT IS y+1900.
     ECMA-262 applies the two-digit-year rule to Date.UTC's first argument, so
     Date.UTC(1,0,1) is 1901-01-01 and Date.UTC(50,…) is 1950. Once the clock's
     floor came down to year 1 (#R604, js/chronos.js) every construction of an
     instant had to stop going through it, and there were TWO of them: the kernel
     itself, and the Chronos panel's `floorMs()` — the lower bound it writes into
     the native date control and clamps a half-typed year to. The second was found
     by tests/smoke.spec.js R378 ①, which read «1901-01-01T00:00» where it wanted
     the floor, AFTER the kernel had been fixed and had a comment saying so.
     ⚠ THAT IS WHY IT IS HERE AND NOT IN EITHER OF THEM. Two callers, one rule; a
     copy in the second caller is what let the first fix look complete. */
  function utcAt(y, mo, d, h, mi, s) {
    const t = new Date(0);
    t.setUTCFullYear(Math.round(+y) || 0, mo || 0, d == null ? 1 : d);
    t.setUTCHours(h || 0, mi || 0, s || 0, 0);
    return t;
  }

  /* ══ ⓪b THE CALENDAR DATE OF AN INSTANT — FOR EVERY YEAR THE CLOCK CAN REACH ══
     ⚠⚠⚠ `d.toISOString().slice(0,10)` IS NOT A DATE BEFORE YEAR 0. ECMA-262 writes
     a year outside 0…9999 in the EXPANDED form — six digits and a sign — so year
     −322 comes back as `-000322-01-01T00:00:00.000Z` and the first ten characters
     of that are `-000322-01`: a string with no day in it at all. Measured here on
     Node 24 before the fix, for −122999 / −322 / −1, and the truncation is silent.
     ⚠ THIS IS THE SAME SHAPE AS #R604's `Date.UTC` TRAP, ONE FLOOR LOWER. A rule
     that was correct for every year the clock could reach starts lying the moment
     the floor moves past the range it was written for, and nothing throws.
     ⚠ AND IT HAD TWO IMPLEMENTATIONS: `ymdISO` in js/chronos.js (what the kernel
     broadcasts to every subscriber as `e.iso`) and a second one in js/app-body.js
     (what `HOST.ymdISO` hands the news feed and the screenshot filename). Two
     copies of one rule is what let #R604's first fix look complete while three
     other sites were still wrong, so this is the owner and both read it.
     The output is ECMA's own extended form, which means `Date.parse` round-trips
     it — the alternative (clamping the year to four characters) would hand every
     reader a plausible-looking date in the wrong millennium. */
  function ymd(d) {
    const y = d.getUTCFullYear(), p = n => String(n).padStart(2, '0');
    const ys = (y >= 0 && y <= 9999)
      ? String(y).padStart(4, '0')
      : (y < 0 ? '-' : '+') + String(Math.abs(y)).padStart(6, '0');
    return ys + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  /* ══ ⓪c ASTRONOMICAL YEAR ⇄ THE YEAR A READER IS SHOWN ══════════════════════
     ⚠⚠⚠ THE CLOCK COUNTS ASTRONOMICALLY AND THE READER DOES NOT. `Date` has a
     year 0; the era convention every reader uses does not — 1 BC is followed by
     AD 1 with nothing between. So astronomical −322 IS 323 BC, and the off-by-one
     is not a rounding question: it is the difference between the year Alexander
     died and the year after it.
     The kernel keeps astronomical years because that is what arithmetic works on
     (`setUTCFullYear`, differences, the rail below) and it is what `Date` itself
     stores. The conversion happens ONCE, here, at the edge where a number becomes
     something a person reads — never inside a subsystem, because a second copy is
     how the map and the label come to disagree about which year is on screen.
     ⚠ `n` IS ALWAYS POSITIVE. A label that says «−322年» has done the arithmetic
     and then not finished it. */
  function era(y) {
    const a = Math.round(+y) || 0;
    return a <= 0 ? { bce: true, n: 1 - a } : { bce: false, n: a };
  }
  /* the inverse, so a reader who TYPES «323 BC» lands on the same instant the
     label came from. One pair, tested against each other (#R604 ⑤: two separately
     written directions drift, and the drift is what a reader sees). */
  function fromEra(n, bce) {
    const v = Math.abs(Math.round(+n) || 0);
    return bce ? 1 - v : v;
  }

  /* ══ ⓪d THE YEAR, IN THE READER'S OWN WORDS — WITHOUT A TABLE OF ERA NAMES ══
     A year before the common era cannot be shown as a number. «−322» is not a
     year anybody writes, and the nine words that make it one (BC · 紀元前 ·
     v. Chr. · до н. э. · a. C. · av. J.-C. · 기원전 · 西元前 · 公元前) differ not
     only in spelling but in POSITION — Latin scripts put the era after the digits,
     CJK before them, and Korean puts one on each side.
     ⚠ SO IT IS NOT A TABLE. .agents/rules/no-ad-hoc-hardcoding.md forbids exactly
     this shape: nine hand-written strings plus nine hand-written orderings, which
     the tenth language would silently not have. `Intl.DateTimeFormat` already
     holds all of it — CLDR ships the era name and its place in the pattern for
     every locale that exists — so the rule is «ask the platform», and the tenth
     language is right the day it is added.
     ⚠ AND ICU AGREES WITH `era` ABOVE, WHICH IS THE POINT OF USING IT. Measured
     2026-09-10 on Node 24 / ICU 78.3: the astronomical instant −322 formats as
     «323 BC» / 「紀元前323年」 / «323 av. J.-C.». That is an INDEPENDENT confirmation
     of the off-by-one, from a source that did not read our arithmetic.
     ⚠ THE TAG IS AN ARGUMENT, NOT A LOOKUP. This file states that it touches
     neither the DOM nor the clock nor the language, and that property is why it
     can be evaluated in a test; the caller passes what `IntMapLang.htmlTag(lang)`
     gave it. ⚠ That accessor is already right where a call site would be wrong:
     it answers `zh-Hant` for IntMap's `zh`, and a bare `zh` handed to ICU resolves
     to Simplified — 公元前 where the reader expects 西元前 (measured, both ways).
     ⚠ THE COMMON ERA IS LEFT ALONE. `Intl` would render AD 1500 as «1500 AD» /
     「西暦1500年」, which is not what this app has ever shown and not what a reader
     dragging through the 20th century wants on every frame. The era word is what
     is missing, and it is missing only below year 1. */
  function yearText(y, tag, jpSuffix) {
     const a = Math.round(+y) || 0;
     if (a >= 1) return jpSuffix ? (a + jpSuffix) : String(a);
     try {
       const d = utcAt(a, 5, 15, 12);
       const out = new Intl.DateTimeFormat(String(tag || 'en'),
         { era: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
       if (out) return out;
     } catch (_) {}
     /* a runtime whose ICU carries no era data still must not print a negative
        year: the era is stated in the one form no locale can misread. */
     return era(a).n + ' BCE';
  }

  /* ══ ⓪d-bis A WHOLE DATE, FOR EVERY YEAR THE CLOCK CAN REACH ═══════════════
     ⚠⚠⚠ `year:'numeric'` DROPS THE ERA SILENTLY, so a date before year 1 formats
     to the SAME STRING as one after it. MEASURED in production 2026-09-11 with
     the border stepper standing on 3000 BC:
         ja-JP  {year:'numeric'}             → 「3000年1月1日」   ← says AD 3000
         ja-JP  {era:'short',year:'numeric'} → 「紀元前3000年1月1日」
         en-US  {year:'numeric'}             → «Jan 1, 3000»
         en-US  {era:'short',year:'numeric'} → «Jan 1, 3000 BC»
     `yearText` above already asks the platform for the era word when it prints a
     bare year; this is the same question for a whole date, and it is HERE for the
     reason that one is: the caller that needed it (js/news-timeline.js's stepper
     label) keeps its formatter inside a DOM closure, where nothing could measure
     what it does (#R575). One owner, evaluated by the gate.
     ⚠ THE ERA IS ASKED FOR ONLY WHEN THERE IS ONE TO SAY. Requesting it always
     prints 「西暦1990年10月2日」 and «Oct 2, 1990 AD» on every ordinary date —
     noise the reader did not have. WHERE the word goes is CLDR's answer.
     ⚠ AND `Date.UTC` IS NOT USED (it maps a year under 100 to 1900+y — #R602). */
  function dateText(y, mo, d, tag) {
    const a = Math.round(+y) || 0;
    const t = utcAt(a, (mo || 1) - 1, d == null ? 1 : d, 12);
    const opt = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (a < 1) opt.era = 'short';
    try {
      const out = new Intl.DateTimeFormat(String(tag || 'en'), opt).format(t);
      if (out) return out;
    } catch (_) {}
    /* a runtime whose ICU carries no era data still must not print a date that
       reads as the other era — the same last resort `yearText` takes. */
    const p = (n) => String(n).padStart(2, '0');
    return (a < 1 ? (era(a).n + ' BCE') : String(a)) + '-' + p(mo || 1) + '-' + p(d == null ? 1 : d);
  }

  /* ══ ⓪e WHERE TO PUT THE MARKS ON A RAIL THAT SPANS 125,000 YEARS ══════════
     The Chronos ruler carried a WRITTEN list of years — [1, 500, 1000, 1250, …] —
     clipped to the clock's floor. #R604 wrote it for a floor of 1 and it was fine
     there; below year 1 it produces no mark at all, so the entire pre-common-era
     tenth of the track would have been unlabelled — a reader dragging into it
     could not tell 500 BC from 5000 BC without releasing the thumb.
     ⚠ AND THE FIX IS NOT A LONGER LIST, for the reason a list is never the fix:
     the next round that moves the floor has to remember to edit it, and when it
     does not, nothing fails.
     ⚠ SO THE MARKS ARE DERIVED FROM THE RAIL ITSELF. Walk the track in equal
     steps; at each step take the year the rail actually shows there and round it
     to the nearest «round» number — a 1, 2 or 5 times a power of ten. That gives
     marks that are evenly spaced TO THE EYE (which is the whole job of a ruler on
     a warped axis) and are numbers a person recognises, at any floor, with no list
     to maintain. Duplicates collapse, so a dense band simply yields fewer marks
     rather than a pile of identical labels.
     ⚠ IT NEVER INVENTS A YEAR THE RAIL CANNOT REACH: every candidate is clamped
     into [min, max] and dropped if rounding pushed it outside. */
  function niceTicks(min, max, n) {
     const lo = Math.round(+min), hi = Math.round(+max);
     const steps = Math.max(2, Math.round(+n) || 24);
     /* ⚠ ROUND IN THE NUMBER THE READER SEES, NOT THE ONE THE CLOCK HOLDS. The
        first draft rounded the astronomical year: −5000 is a round number there
        and «5001 BC» on the ruler, and the mark at −5 came out as «6 BC».
        Measured before it shipped. The era offset is one, everywhere, and this is
        the second place in this file where forgetting it yields something that
        looks almost right. */
     const disp = y => (y >= 1 ? y : 1 - y);
     const undisp = (v, wasBce) => (wasBce ? 1 - v : v);
     const nice = w => {
       const a = Math.abs(w);
       if (!(a > 0)) return 1;
       const p = Math.pow(10, Math.floor(Math.log10(a)));
       const m = a / p;
       return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
     };
     const out = [];
     for (let k = 0; k <= steps; k++) {
       const y0 = toYear(POS * k / steps, lo, hi);
       const y1 = toYear(POS * Math.min(steps, k + 1) / steps, lo, hi);
       /* the step is the rail OWN local density — a ruler on a warped axis has no
          single one, and asking for one is how a written list gets there instead. */
       const step = nice(Math.max(1, Math.abs(y1 - y0)));
       const bce = y0 < 1;
       const v = Math.max(step, Math.round(disp(y0) / step) * step);
       const y = undisp(v, bce);
       if (y < lo || y > hi) continue;
       if (out.indexOf(y) < 0) out.push(y);
     }
     if (out.indexOf(lo) < 0) out.unshift(lo);
     if (out.indexOf(hi) < 0) out.push(hi);
     return out.sort((a, b) => a - b);
  }

  /* ══ ① THE CLOCK'S INSTANT, AS OPENHISTORICALMAP WRITES IT ═════════════════
     OHM's vector tiles carry `start_decdate` / `end_decdate` as NUMBERS: a
     decimal year, and the map's whole date comparison is against them. So the
     convention is not a thing to reason out — it is a thing to MEASURE, and it
     was, on 2026-09-10, by decoding 160 z5 tiles and fitting every candidate
     against the 103,093 records that carry BOTH a `*_date` string and a
     `*_decdate` number. Mean absolute error per candidate:
         year + (doy − 0.5)/len   2.06e-6   ← this one (float rounding only)
         year + (doy − 1)/len     1.37e-3   = half a day, everywhere
         year + doy/len           1.37e-3
         year + (doy − 1)/365.25  1.49e-3
     ⚠ IT IS THE MIDPOINT OF THE DAY, AND HALF A DAY IS NOT A ROUNDING ERROR HERE.
     The first draft used (doy − 1)/len — the day's START — which is BELOW the
     `start_decdate` of a unit that begins that very day, so every boundary was
     absent on its own first day and present on the day after it was abolished.
     One day, on every one of 4,679 units.
     ⚠ AND THE DENOMINATOR IS THE YEAR'S OWN LENGTH, not a flat 365.25: a boundary
     that moved on 29 February moved on 29 February. */
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  function decYear(y, m, d) {
    y = Math.round(+y) || 0;
    const mo = Math.max(1, Math.min(12, Math.round(+m) || 1));
    const dd = Math.max(1, Math.min(31, Math.round(+d) || 1));
    const leap = isLeap(y);
    const doy = CUM[mo - 1] + dd + ((leap && mo > 2) ? 1 : 0);   /* 1-based day of year */
    return y + (doy - 0.5) / (leap ? 366 : 365);
  }

  /* ══ ② WHICH BOUNDARIES BELONG ON SCREEN AT THAT INSTANT ═══════════════════
     A MapLibre/Cesium filter expression over OHM's `land_ohm_lines`.
     ⚠ AN ABSENT BOUND IS NOT A BOUND. A record with no `start_decdate` is one
     whose beginning upstream does not know — reading that as 0 (always started)
     or as +∞ (never started) are both guesses, and one of them silently deletes
     the record from every map. The clause simply does not constrain the end it
     has no value for, which is what "unknown" means.
     ⚠ `maritime` IS UPSTREAM'S OWN ANSWER to the question #R564 had to answer
     against Natural Earth: which run of this boundary is a coast rather than a
     border. It is the same clause `ref-admin1` / `ref-admin2` carry at Now
     (js/app-body.js, js/time-admin1.js), so both eras stop at the shore for one
     stated reason instead of two. */
  /* A day-exact record with identical endpoints is a one-day event (the bundle
     preserves it too). Decimal equality alone cannot distinguish a day from a
     year or an unknown bound: require both original date strings on this day.
     OHM tiles retain these strings (measured z5/7/12, 1,586 dated admin runs). */
  function dayDates(t) {
    const y = Math.floor(t), days = isLeap(y) ? 366 : 365;
    const d = utcAt(y, 0, Math.floor((t - y) * days) + 1);
    const suffix = '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    return [...new Set([ymd(d), String(y) + suffix,
      (y < 0 ? '-' : '') + String(Math.abs(y)).padStart(4, '0') + suffix])];
  }
  function oneDayFilter(t) {
    return ['all', ['has', 'start_date'], ['has', 'end_date'],
      ['==', ['get', 'start_date'], ['get', 'end_date']],
      ['any', ...dayDates(t).map(d => ['==', ['get', 'start_date'], d])]];
  }
  function ohmFilter(lo, hi, t) {
    return ['all',
      ['==', ['get', 'type'], 'administrative'],
      ['>=', ['to-number', ['get', 'admin_level'], -1], lo],
      ['<=', ['to-number', ['get', 'admin_level'], -1], hi],
      ['!=', ['to-string', ['get', 'maritime']], 'yes'],
      ['any', oneDayFilter(t), ['all',
        ['any', ['!', ['has', 'start_decdate']], ['!', dated('start_decdate')], ['<=', ['to-number', ['get', 'start_decdate'], 0], t]],
        ['any', ['!', ['has', 'end_decdate']], ['!', dated('end_decdate')], ['>', ['to-number', ['get', 'end_decdate'], 0], t]]]]
    ];
  }
  /* ⚠ A NUMBER THAT CANNOT BE A YEAR IS NOT A DATE — it is the ABSENCE of one.
     Decoding those same 160 tiles, 3,080 of 106,173 `*_decdate` values do not
     agree with the `*_date` string beside them, and every one of them is either
     within 1 of zero (1,573) or astronomically large (1e151…1e222) — never a
     plausible year. Whether that is upstream or an artefact of how the value is
     typed in the tile, the handling is the same and it is not a special case for
     those 3,080: a bound outside the range a year can occupy carries no
     information, so it constrains nothing, exactly like a missing one. Without
     this, a record whose `end_decdate` decodes as ~0 fails `>= t` in EVERY era
     and is silently deleted from the map in all of them. */
  const YEAR_LO = 1, YEAR_HI = 9999;   /* |year| — OHM's own reach is roughly −4000…2100 */
  function dated(k) {
    return ['all', ['>=', ['abs', ['to-number', ['get', k], 0]], YEAR_LO],
                   ['<=', ['abs', ['to-number', ['get', k], 0]], YEAR_HI]];
  }
  /* the same decision, evaluated rather than described — so a test can ask
     "would this record be drawn?" without a renderer, and so the expression above
     can never quietly stop meaning what this says. One rule, two readers. */
  function inForce(props, lo, hi, t) {
    const p = props || {};
    if (p.type !== 'administrative') return false;
    const lv = Number(p.admin_level);
    if (!(lv >= lo && lv <= hi)) return false;
    if (String(p.maritime == null ? '' : p.maritime) === 'yes') return false;
    if (p.start_date === p.end_date && dayDates(t).includes(p.start_date)) return true;
    const yr = v => { const n = Math.abs(Number(v)); return Number.isFinite(n) && n >= YEAR_LO && n <= YEAR_HI; };
    if (p.start_decdate != null && yr(p.start_decdate) && Number(p.start_decdate) > t) return false;
    if (p.end_decdate != null && yr(p.end_decdate) && Number(p.end_decdate) <= t) return false;
    return true;
  }

  /* ══ ③ THE YEAR RAIL — A POSITION IS NOT A YEAR ════════════════════════════
     #R604 lowered the clock's floor from 1850 to 1 (js/chronos.js). A slider that
     maps one year to one step then spends 91% of its length on the 1,849 years
     before 1850 and leaves 1850-2026 in the last 8.7% — measured on the Chronos
     panel's own 340 px track, 176 years in 30 px. Extending the reach must not
     take away the precision that was already there.
     ⚠ THE BREAKPOINTS ARE MEASURED, NOT CHOSEN. On a 160-tile z5 sweep of OHM's
     tiles on 2026-09-10, dated admin_level≥3 segments in force number 936 in
     year 1, 3,712 in 1500 and 6,138 in 1850, touching 14, 23 and 51 of those
     tiles: the record is regionally thin before 1500, thickens to 1850, and from
     1850 every OTHER time-aware subsystem (GDP, borders, climate) has a series
     too. Half the rail goes to the half that has the most to say.
     ⚠ EXPIRES IF that changes: the day OHM's coverage before 1500 stops being
     regional, this allocation is the wrong one and the sweep is the way to tell.
     ⚠ ONE PIECEWISE MAP, BOTH DIRECTIONS, so `toPos(toYear(v))` returns v at
     every stop. Two separately-written directions drift, and the drift is visible
     as a thumb that walks when the reader lets go of it. */
  const POS = 1000;
  /* ══ ③b THE BAND BELOW YEAR 1 — 123,000 YEARS FOR A TENTH OF THE TRACK ══════
     #R604 cut this rail for a floor of year 1: a quarter of the track to AD 1-1500,
     a quarter to 1500-1850, a half to 1850-now, each share justified by a measured
     count of what the record has to say there. The floor is now deep prehistory
     (FLOOR above), which is a band that did not exist when those shares were set.
     ⚠ THE FIRST DRAFT OF THIS CHANGE TOOK THE NEW BAND OUT OF THE OLD ONE — it let
     the floor fall inside the existing quarter, and AD 1-1500 went from 250 slider
     positions to 156. Measured here before it shipped. That is exactly what #R604
     forbade in its own words:「到達範囲を伸ばすことで、すでにあった精度を奪っては
     ならない」, and it is the easy way to get this wrong, because nothing about the
     rail complains — the reader simply loses a third of their precision in a band
     nobody was looking at, while another band is being added.
     ⚠ SO THE DEEP BAND IS A LEVY, NOT A REALLOCATION. It takes DEEP_SHARE of the
     whole track and every band above year 1 keeps its RELATIVE share of what is
     left, so no band is singled out. Measured after: AD 1-1500 250→225 positions,
     1500-1850 250→225, 1850-now 500→450. One tenth, charged evenly, and #R604s
     three measured proportions survive untouched.
     ⚠ WITHIN THE BAND, LOGARITHMIC IN THE DISTANCE BACK FROM DEEP_TOP — and the
     alternative is not "more breakpoints", because a list of breakpoints is a list
     (.agents/rules/no-ad-hoc-hardcoding.md: a hand-written one silently drops
     whatever upstream adds next, and this set grows). The warp is a function of the
     year alone; there is nothing in it to keep in sync with anything.
     ⚠ MEASURED, on the seventeen pre-common-era snapshots aourednik/historical-
     basemaps publishes (read from the repo directory itself, 2026-09-10), as slider
     positions inside this 100-position band. Widest gap between consecutive
     snapshots divided by the narrowest:
         linear     4,900 : 1        (bc123000→bc10000 alone eats 92 of the 100)
         log           16 : 1
     and the whole of recorded history — every snapshot from 3000 BC forward — gets
     68 of the 100 positions where linear gives it 2. The residual 16:1 is not the
     rails: it is the 113,000-year hole between bc123000 and bc10000 where upstream
     has nothing, and a rail that hid that hole would claim a resolution the record
     does not have.
     ⚠ THE PROPERTY THAT ACTUALLY MATTERS IS REACHABILITY, AND IT IS MEASURED, NOT
     ARGUED: sweeping all 1,001 positions and asking which snapshot each one lands
     on reaches ALL 53. A rail can be beautifully even and still leave a snapshot
     with no position that selects it, which for a round about coverage is the whole
     game. tests/r679-chronos-deep-time-checks.test.mjs asserts that, not the shape.
     ⚠ MORE RAIL WHERE THERE IS MORE TO SEE, and upstreams own feature counts say
     that is the right direction: 157 features in bc123000, 138 in bc3000, 163 in
     bc1000, 233 in bc100, 442 in bc1 (all fetched and counted 2026-09-10).
     ⚠ EXPIRES IF the record before year 1 stops being sparser the further back it
     goes — re-measure the snapshot spacing and this warp is the wrong one.
     ⚠ ONE PAIR, BOTH DIRECTIONS, inverse by construction (expm1 undoes log1p
     exactly), because #R604s own note is the reason: two separately-written
     directions drift and the drift is a thumb that walks when you let go. */
  const DEEP_TOP = 1, DEEP_SHARE = 0.10;
  function deepPos(y, min) {
    const span = Math.log1p(DEEP_TOP - min);
    if (!(span > 0)) return 1;
    return 1 - Math.log1p(Math.max(0, DEEP_TOP - y)) / span;
  }
  function deepYear(u, min) {
    const span = Math.log1p(DEEP_TOP - min);
    if (!(span > 0)) return DEEP_TOP;
    return DEEP_TOP - Math.expm1(span * (1 - Math.max(0, Math.min(1, u))));
  }
  /* is the first band the deep one? (a floor at or above DEEP_TOP has no deep
     band at all, and `breaks` has already dropped the breakpoint in that case) */
  const isDeep = b => b.length > 1 && b[0][0] < DEEP_TOP && b[1][0] === DEEP_TOP;
  function breaks(min, max) {
    const a = Math.round(+min), b = Math.round(+max);
    const keep = 1 - (a < DEEP_TOP ? DEEP_SHARE : 0), base = 1 - keep;
    const raw = [[a, 0], [DEEP_TOP, base], [1500, base + keep * 0.25], [1850, base + keep * 0.5], [b, 1]];
    /* a floor above a breakpoint drops it — the rail never runs backwards, and a
       future round that raises the floor does not have to edit this list. */
    return raw.filter((e, i, ar) => i === 0 || (e[0] > ar[i - 1][0] && e[0] <= b));
  }
  function toYear(p, min, max) {
    const b = breaks(min, max), f = Math.max(0, Math.min(1, (+p || 0) / POS));
    for (let i = 1; i < b.length; i++) {
      if (f <= b[i][1] || i === b.length - 1) {
        const y0 = b[i - 1][0], f0 = b[i - 1][1], y1 = b[i][0], f1 = b[i][1];
        if (!(f1 > f0)) return Math.round(y1);
        const u = (f - f0) / (f1 - f0);
        return Math.round((i === 1 && isDeep(b)) ? deepYear(u, y0) : y0 + (y1 - y0) * u);
      }
    }
    return Math.round(+max);
  }
  function toPos(y, min, max) {
    const b = breaks(min, max), v = Math.max(b[0][0], Math.min(Math.round(+max), Math.round(+y) || 0));
    for (let i = 1; i < b.length; i++) {
      if (v <= b[i][0] || i === b.length - 1) {
        const y0 = b[i - 1][0], f0 = b[i - 1][1], y1 = b[i][0], f1 = b[i][1];
        if (!(y1 > y0)) return Math.round(POS * f1);
        const u = (i === 1 && isDeep(b)) ? deepPos(v, y0) : (v - y0) / (y1 - y0);
        return Math.round(POS * (f0 + (f1 - f0) * u));
      }
    }
    return POS;
  }

  return { FLOOR, utcAt, ymd, era, fromEra, yearText, dateText, niceTicks, decYear, ohmFilter, inForce,
           rail: { POS, breaks, toYear, toPos, DEEP_TOP } };
})();
