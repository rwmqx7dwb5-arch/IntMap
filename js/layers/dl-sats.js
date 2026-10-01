/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* ══ ⚠⚠⚠ (restored-layers-under-load) AN ELEMENT SET SPEAKS FOR THE DAYS AROUND ITS EPOCH, NOT FOR AN ERA ══
   SGP4 will turn any element set into a position at any instant, and until this round the layer drew
   whatever came out: with the clock at 1914-06-28 it drew **5,234** objects, at 1991-06-25 **8,355**
   — 2026 element sets run back 112 and 35 years. No source states those positions; they are made by
   the arithmetic (.agents/rules/historical-verification.md §2 ③). So an object is computed and drawn
   only while the instant is inside the span its OWN element set is good for, judged per element set
   (each has its own epoch) — and never before the year its international designator says it was
   launched (`98067A` → 1998; the epoch window alone could reach back before a launch for a young
   high orbit).
   THE SPAN, MEASURED (not quoted): the repository's own catalogue history — 61 snapshots of
   data/tle/catalogue.tle, 2026-08-01 … 2026-09-30, the same satellite.js 7.1.0 — each object's older
   element set propagated to the epoch of its newest one and compared with the newest set there.
   Criterion: half the objects within 100 km and nine in ten within 1,000 km (a dot that is still on
   the right place at a world view, and a footprint that still covers the right ground).
       band (mean motion)        median / p90 error at the age              span kept
       LEO   > 11 rev/day        5 d: 38 / 394 km   · 7 d: 115 / 2,473 km    5 days
       MEO/HEO 1.5–11 rev/day    60 d: 18 / 226 km  (the longest age measured) 60 days
       GEO   ≤ 1.5 rev/day       14 d: 85 / 253 km  · 21 d: 185 / 480 km     14 days
   ⚠ ESTIMATE where it reaches past the measurement: the history runs FORWARD from older sets; the
     span is applied the same way backwards (the clock in the past), and MEO/HEO is capped at the
     60 days the history covers, not at a limit it showed. EXPIRES when satellite.js's propagator
     changes, when the catalogue source changes, or when a longer history lets the MEO/HEO cap be
     measured — re-run the measurement in dev-notes/2026-10-01-restored-layers-under-load.md.
     This table (`time.bands` below) is the ONE copy: js/satellites-live.js reads it, and everything there
     that propagates asks its `_elementSpan()`. A band applies when the mean motion EXCEEDS its first number.
   The «a few days either side» use — playing the clock to watch the objects move — stays inside it. */
export default {
  id: 'dl-sats',
  shelf: 'lyrGrpOrbit',
  order: 10,
  key: 'sats',
  label: 'lyrSats',
  share: true,
  lazy: ['satellitesLive'],
  registry: ['satellites'],
  atlas: ['layers.satellites'],
  /* the time contract — moved here from js/satellites-live.js (which reads it); the measurement is the note above */
  time: { kind: 'elements', bands: [[11, 5], [1.5, 60], [-Infinity, 14]] },
};
