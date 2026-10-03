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
});
