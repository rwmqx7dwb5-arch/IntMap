/* The ONE place the hindcast's conditions are stated. The wind fetcher, the builder and the gate all read it,
   so "the same release and the same period" cannot become three slightly different ones. */
export const HINDCAST = Object.freeze({
  /* Fukushima Daiichi — the same coordinate the simulator's `fukushima` preset uses (RAD.SOURCE_TERMS.fukushima.ll) */
  source: { lng: 141.0329, lat: 37.4211 },
  /* the reactors' shutdown, 2011-03-11 14:46 JST = 05:46 UTC; the source term is decay-corrected to this instant */
  startISO: '2011-03-11T05:46:00Z',
  startDate: '2011-03-11', endDate: '2011-03-26',
  /* 14 days from shutdown. MEASURED against the survey: see docs/RADIATION-MODEL.md §10 */
  hours: 336,
  levels: [10, 100],
  /* the nest is sized from a mean wind in the live code; a fixed 5 m/s (that code's own default) over 336 h saturates at the ±15° cap either way */
  meanSpeedForNest: 5,
  isotope: 'cs137',
  source_term: 'fukushima',
  particles: 20000, dtSec: 600,
  seeds: [101, 102, 103],
  depRes: 0.01,
  /* the survey's cell size, and the instant its Cs-137 values are decay-compensated to (see docs/RADIATION-MODEL.md §10) */
  obsRes: 0.05, obsAsOf: '2012-06-28',
  /* figure-of-merit thresholds, Bq/m2: 100 kBq/m2 (the evacuation-scale band) and 1 MBq/m2 (the hottest contour) */
  fmsBq: [100000, 1000000],
  /* ── (science-next) THE ATTRIBUTION LADDER ────────────────────────────────────────────────────────
     The rung above ("preset") is the simulator as a reader runs it. Each rung below changes ONE thing, in an
     order where every change is a statement of fact about 2011 or about the model, never a fitted number:
       jaea                       the accident's own release, hour by hour (data/fukushima-release.json —
                                  71 intervals with their heights) instead of one rate for 120 h
       jaea-regional              + the regional wind nest (RAD.midPlan), which the live simulator does not fetch
       jaea-regional-particulate  + caesium counted as wholly depositable (the model's default removes 45 %)
     The release's central amount is the table's; its spread is UNSCEAR's reported range for the TOTAL Cs-137
     release (6–20 PBq, RAD.SOURCE_TERMS.fukushima), applied as a scale on the table's shape — the table itself
     states no range. Seeds and particles are the preset's. */
  releaseFile: 'data/fukushima-release.json',
  variants: Object.freeze([
    Object.freeze({ id: 'jaea', release: 'jaea', regional: false, depositableFraction: null }),
    Object.freeze({ id: 'jaea-regional', release: 'jaea', regional: true, depositableFraction: null }),
    Object.freeze({ id: 'jaea-regional-particulate', release: 'jaea', regional: true, depositableFraction: 1 }),
  ]),
});
