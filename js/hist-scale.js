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
  function ohmFilter(lo, hi, t) {
    return ['all',
      ['==', ['get', 'type'], 'administrative'],
      ['>=', ['to-number', ['get', 'admin_level'], -1], lo],
      ['<=', ['to-number', ['get', 'admin_level'], -1], hi],
      ['!=', ['to-string', ['get', 'maritime']], 'yes'],
      ['any', ['!', ['has', 'start_decdate']], ['!', dated('start_decdate')], ['<=', ['to-number', ['get', 'start_decdate'], 0], t]],
      ['any', ['!', ['has', 'end_decdate']], ['!', dated('end_decdate')], ['>=', ['to-number', ['get', 'end_decdate'], 0], t]]
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
    const yr = v => { const n = Math.abs(Number(v)); return Number.isFinite(n) && n >= YEAR_LO && n <= YEAR_HI; };
    if (p.start_decdate != null && yr(p.start_decdate) && Number(p.start_decdate) > t) return false;
    if (p.end_decdate != null && yr(p.end_decdate) && Number(p.end_decdate) < t) return false;
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
  function breaks(min, max) {
    const a = Math.round(+min), b = Math.round(+max);
    const raw = [[a, 0], [1500, 0.25], [1850, 0.5], [b, 1]];
    /* a floor above a breakpoint drops it — the rail never runs backwards, and a
       future round that raises the floor does not have to edit this list. */
    return raw.filter((e, i, ar) => i === 0 || (e[0] > ar[i - 1][0] && e[0] <= b));
  }
  function toYear(p, min, max) {
    const b = breaks(min, max), f = Math.max(0, Math.min(1, (+p || 0) / POS));
    for (let i = 1; i < b.length; i++) {
      if (f <= b[i][1] || i === b.length - 1) {
        const y0 = b[i - 1][0], f0 = b[i - 1][1], y1 = b[i][0], f1 = b[i][1];
        return Math.round(f1 > f0 ? y0 + (y1 - y0) * (f - f0) / (f1 - f0) : y1);
      }
    }
    return Math.round(+max);
  }
  function toPos(y, min, max) {
    const b = breaks(min, max), v = Math.max(b[0][0], Math.min(Math.round(+max), Math.round(+y) || 0));
    for (let i = 1; i < b.length; i++) {
      if (v <= b[i][0] || i === b.length - 1) {
        const y0 = b[i - 1][0], f0 = b[i - 1][1], y1 = b[i][0], f1 = b[i][1];
        return Math.round(POS * (y1 > y0 ? f0 + (f1 - f0) * (v - y0) / (y1 - y0) : f1));
      }
    }
    return POS;
  }

  return { utcAt, decYear, ohmFilter, inForce, rail: { POS, breaks, toYear, toPos } };
})();
