/* ============================================================================
 *  IntMap · js/transit-feeds.js — WHICH PUBLIC-TRANSPORT TIMETABLES WE MAY USE, AND ON WHAT TERMS
 * ----------------------------------------------------------------------------
 *  IntMap is a commercial service (CLAUDE.local / memory intmap-commercial-service-licences). A
 *  timetable is therefore usable only if its OWN publisher's licence permits commercial use. That is
 *  the reason this table exists instead of a call to a hosted planner:
 *
 *    · Transitous (api.transitous.org) — the planner routing.js/routing-providers.js still call as a
 *      fallback — states in its usage policy (https://transitous.org/api/, read 2026-11-20): "Due to
 *      data source licences and resource prioritisation, commercial use is not allowed", "Your
 *      project is not commercial", and over 720 /plan | /one-to-all requests per 24 h must be
 *      coordinated with them. IntMap meets none of those conditions, so Transitous is OFF by default
 *      (TRANSITOUS_FALLBACK below) until Transitous agrees in writing.
 *    · Each feed here is read from its PUBLISHER, under the licence the PUBLISHER states, compiled by
 *      scripts/build-transit-timetables.mjs into data/transit/<id>.json and planned over in the
 *      browser by js/transit-raptor.js. Nothing is sent to a third party when a route is asked.
 *
 *  ⚠ A FEED IS ADDED ONLY AFTER ITS PUBLISHER'S LICENCE PAGE WAS READ. `verified` carries the page and
 *  the day. A licence copied from an aggregator (Transitous' feed list, mobilitydatabase…) is a lead,
 *  not a verification: those lists say what the aggregator believes, and several mirror a feed that
 *  somebody else publishes under different terms.
 *
 *  ⚠ SCHEDULED IS NOT LIVE. `realtime` is null unless the publisher offers a real-time feed IntMap
 *  actually reads. null is a statement — «no live data» — and every plan built on a null feed says
 *  `basis: 'scheduled'` out loud (js/transit-raptor.js `planBasis`).
 *
 *  Pure data + pure functions, no DOM: imported by the builder (node) and the browser alike.
 * ==========================================================================*/

/* Transitous: see the header. One declaration; routing-providers.js reads it. */
export const TRANSITOUS_FALLBACK = false;
export const TRANSITOUS_TERMS = {
  url: 'https://transitous.org/api/',
  readOn: '2026-11-20',
  commercialUse: false,
  clause: 'Due to data source licences and resource prioritisation, commercial use is not allowed.',
};

/* licences that permit commercial use WITH attribution (or without). ODbL / CC-BY-SA are accepted by
   the owner's decision of 2026-10-06 (share-alike is met by offering the compiled bundle under the
   same terms: data/transit/<id>.json states `offeredUnder`). Non-commercial licences are never here. */
export const COMMERCIAL_OK = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'ODbL-1.0', 'CC-BY-SA-4.0', 'etalab-2.0', 'NLOD-2.0', 'OGL-UK-3.0', 'DL-DE-BY-2.0', 'MIT', 'Apache-2.0']);

/* The feeds that are built and shipped. `bbox` is [w,s,e,n] of the feed's stops (written by the
   builder into the bundle and compared here by the gate). */
export const FEEDS = Object.freeze([
  {
    id: 'lu', country: 'LU', name: 'Luxembourg — Mobilitéits-Zentral (all public transport)',
    publisher: 'Administration des transports publics (Luxembourg)',
    source: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/',
    /* the resource URL carries a date; the builder asks the dataset API for the current one */
    resolve: { api: 'https://data.public.lu/api/1/datasets/horaires-et-arrets-des-transport-publics-gtfs/', pick: 'latest-zip' },
    licence: { spdx: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    verified: { page: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/', api: 'data.public.lu /api/1/datasets: license "cc-by"', on: '2026-11-20' },
    /* the credit as DATA (who, on what licence, via where) — the reply words it in the reader's language (js/atlas-cap-routing.js) */
    credit: { publisher: 'Administration des transports publics (Luxembourg)', licence: 'CC BY 4.0', via: 'data.public.lu' },
    crossBorder: ['FR', 'DE', 'BE'], bbox: [5.7101, 48.948, 6.9904, 50.2814], tz: 'Europe/Berlin',
    realtime: null,
  },
]);

const byId = Object.create(null);
FEEDS.forEach((f) => { byId[f.id] = f; });

export function feedById(id) { return byId[id] || null; }
export function feedList() { return FEEDS.slice(); }

/** the licence rule, as a function the gate and the builder both call */
export function licenceAllowsCommercial(spdx) { return COMMERCIAL_OK.indexOf(String(spdx || '')) >= 0; }

/** the credit a reply that used these feeds MUST print: structured rows, one per feed (the reply words them) */
export function attributionFor(ids) {
  const out = [];
  (ids || []).forEach((id) => { const f = byId[id]; if (f && !out.some((o) => o.id === id)) out.push({ id, ...f.credit }); });
  return out;
}

/** which shipped feeds could serve a point (their stops' bounding box, widened by the walk we allow) */
export function feedsNear(lng, lat, bboxes, padKm) {
  const pad = (padKm == null ? 3 : padKm) / 111;
  const out = [];
  Object.keys(bboxes || {}).forEach((id) => {
    const b = bboxes[id]; if (!b || !byId[id]) return;
    const cl = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    if (lng >= b[0] - pad / cl && lng <= b[2] + pad / cl && lat >= b[1] - pad && lat <= b[3] + pad) out.push(id);
  });
  return out;
}
