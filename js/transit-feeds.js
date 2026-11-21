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
 *      scripts/build-transit-timetables.mjs into data/transit-<id>.json and planned over in the
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

import { spdxAllowsCommercial } from './transit-licence.js';   /* the licence GRAMMAR (CC versions, national licences): the same rule the discovery catalogue sorts by */

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
   same terms: data/transit-<id>.json states `offeredUnder`). Non-commercial licences are never here. */
export const COMMERCIAL_OK = Object.freeze(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'ODbL-1.0', 'CC-BY-SA-4.0', 'etalab-2.0', 'NLOD-2.0', 'OGL-UK-3.0', 'DL-DE-BY-2.0', 'MIT', 'Apache-2.0']);

/* The feeds that are built and shipped. `bbox` is [w,s,e,n] of the feed's stops (written by the
   builder into the bundle and compared here by the gate).
   ⚠ A PLAIN LITERAL ON PURPOSE: scripts/build-transit-timetables.mjs derives each bundle's GOVERNANCE
   from these rows, and scripts/data-governance.mjs reads that declaration WITHOUT running the
   builder — it binds an imported constant only when the constant is pure data. One row per feed
   is therefore the single statement of who publishes it, on what terms, and how it is fetched.
   `resolve` says how the build finds the current archive AND re-reads the licence the publisher
   states, refusing to build if it changed (scripts/build-transit-timetables.mjs pickArchive):
     · udata         a udata dataset API (data.public.lu, data.gouv.fr): `license` must equal
                     `licence`; the archive is `resource` (a resource id) or the newest zip
     · gtfs-data.jp  the GTFSデータリポジトリ feed API: `feed_license` must equal `licence`; the
                     archive is the feed's `current` file
     · page          a publisher page that states the licence in words (`states` must still be on
                     it); the archive is the permanent `url`
   `published` is what was measured of the publisher's own rhythm (the cadence record cites it). */
export const FEED_ROWS = [
  {
    id: 'lu', country: 'LU', name: 'Luxembourg — Mobilitéits-Zentral (all public transport)',
    publisher: 'Administration des transports publics (Luxembourg)',
    source: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/',
    /* the resource URL carries a date; the builder asks the dataset API for the current one */
    resolve: { kind: 'udata', api: 'https://data.public.lu/api/1/datasets/horaires-et-arrets-des-transport-publics-gtfs/', licence: 'cc-by' },
    licence: { spdx: 'CC-BY-4.0', name: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    verified: { page: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/', api: 'data.public.lu /api/1/datasets: license "cc-by"', on: '2026-11-20' },
    /* the credit as DATA (who, on what licence, via where) — the reply words it in the reader's language (js/atlas-cap-routing.js) */
    credit: { publisher: 'Administration des transports publics (Luxembourg)', licence: 'CC BY 4.0', via: 'data.public.lu' },
    published: 'measured 2026-11-20 on data.public.lu: resources dated 2026-11-05, 2026-11-12 and 2026-11-20 — a new archive every week, each valid about four weeks ahead',
    crossBorder: ['FR', 'DE', 'BE'], bbox: [5.7101, 48.948, 6.9904, 50.2814], tz: 'Europe/Berlin',
    realtime: null,
  },
  /* ── France: the publishers' own datasets on data.gouv.fr (the national access point transport.data.gouv.fr
     lists the same ids). The licence is the one the publishing organisation set on its dataset; its text was
     read for the commercial clause: Licence Ouverte 2.0 «à des fins commerciales ou non»
     (https://www.data.gouv.fr/pages/legal/licences/etalab-2.0), ODbL 1.0 has no use restriction and asks
     share-alike of a conveyed database (the bundle states `offeredUnder`). ── */
  {
    id: 'fr-strasbourg', country: 'FR', name: 'Strasbourg — CTS (tram and bus)',
    publisher: 'CTS - Compagnie des Transports Strasbourgeois',
    source: 'https://www.data.gouv.fr/datasets/donnees-theoriques-gtfs-et-temps-reel-siri-lite-du-reseau-cts',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/5ae1715488ee384c8ba0342b/', resource: 'eeea9e52-4f8a-459e-aef5-a093a3b05356', licence: 'lov2' },
    licence: { spdx: 'etalab-2.0', name: 'Licence Ouverte / Open Licence 2.0', url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
    verified: { page: 'https://www.data.gouv.fr/datasets/donnees-theoriques-gtfs-et-temps-reel-siri-lite-du-reseau-cts', api: 'data.gouv.fr /api/1/datasets/5ae1715488ee384c8ba0342b: license "lov2", organization «CTS - Compagnie des Transports Strasbourgeois»', clause: 'Licence Ouverte 2.0: «à des fins commerciales ou non»', on: '2026-11-21' },
    credit: { publisher: 'CTS - Compagnie des Transports Strasbourgeois', licence: 'Licence Ouverte 2.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «monthly»; the GTFS resource was last modified 2026-10-15 (read 2026-11-21)',
    /* tram D runs to Kehl Bahnhof and Kehl Rathaus, east of the Rhine */
    crossBorder: ['DE'], bbox: [7.5865, 48.4656, 7.8313, 48.6851], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-rennes', country: 'FR', name: 'Rennes — STAR (metro and bus)',
    publisher: 'STAR',
    source: 'https://www.data.gouv.fr/datasets/versions-des-horaires-theoriques-des-lignes-de-bus-et-de-metro-du-reseau-star-dans-les-formats-gtfs-et-netex-ainsi-que-les-urls-dacces-au-gtfs-rt-1',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/580defb1a3a7292dcfa9d33f/', resource: '0644f537-575e-4cce-9570-06165d6f3b27', licence: 'odc-odbl' },
    licence: { spdx: 'ODbL-1.0', name: 'Open Data Commons Open Database License 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    verified: { page: 'https://www.data.gouv.fr/datasets/versions-des-horaires-theoriques-des-lignes-de-bus-et-de-metro-du-reseau-star-dans-les-formats-gtfs-et-netex-ainsi-que-les-urls-dacces-au-gtfs-rt-1', api: 'data.gouv.fr /api/1/datasets/580defb1a3a7292dcfa9d33f: license "odc-odbl", organization «STAR»', clause: 'ODbL 1.0: no restriction of purpose; a conveyed derivative database is offered under ODbL', on: '2026-11-21' },
    credit: { publisher: 'STAR (Rennes)', licence: 'ODbL 1.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «daily»; the GTFS resource was last modified 2026-11-19 (read 2026-11-21)',
    crossBorder: [], bbox: [-1.9465, 47.9393, -1.4783, 48.2998], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-toulouse', country: 'FR', name: 'Toulouse — Tisséo (metro, tram and bus)',
    publisher: 'Toulouse métropole',
    source: 'https://www.data.gouv.fr/datasets/tisseo-reseau-transport-urbain-toulousain',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/56b0c2fba3a7294d39b88a86/', resource: '64318177-f5b5-4144-a6be-2d0f22d26c77', licence: 'odc-odbl' },
    licence: { spdx: 'ODbL-1.0', name: 'Open Data Commons Open Database License 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    verified: { page: 'https://www.data.gouv.fr/datasets/tisseo-reseau-transport-urbain-toulousain', api: 'data.gouv.fr /api/1/datasets/56b0c2fba3a7294d39b88a86: license "odc-odbl", organization «Toulouse métropole»', clause: 'ODbL 1.0: no restriction of purpose; a conveyed derivative database is offered under ODbL', on: '2026-11-21' },
    credit: { publisher: 'Toulouse métropole (Tisséo)', licence: 'ODbL 1.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «daily»; the GTFS resource was last modified 2026-11-20 (read 2026-11-21)',
    crossBorder: [], bbox: [1.151, 43.3912, 1.6905, 43.7499], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-nice', country: 'FR', name: "Nice — Lignes d'Azur (tram and bus)",
    publisher: "Métropole Nice Côte d'Azur",
    source: 'https://www.data.gouv.fr/datasets/donnees-statiques-et-dynamiques-du-reseau-de-transport-lignes-dazur',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/685181f3733800e180c475fa/', resource: 'f5678ab2-c863-4b48-ba1f-9021c7d97634', licence: 'lov2' },
    licence: { spdx: 'etalab-2.0', name: 'Licence Ouverte / Open Licence 2.0', url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
    verified: { page: 'https://www.data.gouv.fr/datasets/donnees-statiques-et-dynamiques-du-reseau-de-transport-lignes-dazur', api: "data.gouv.fr /api/1/datasets/685181f3733800e180c475fa: license \"lov2\", organization «Métropole Nice Côte d'Azur»", clause: 'Licence Ouverte 2.0: «à des fins commerciales ou non»', on: '2026-11-21' },
    credit: { publisher: "Métropole Nice Côte d'Azur", licence: 'Licence Ouverte 2.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «daily»; the GTFS resource was last modified 2026-11-20 (read 2026-11-21)',
    crossBorder: [], bbox: [6.8664, 43.6512, 7.3827, 44.2837], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-nantes', country: 'FR', name: 'Nantes — Naolib',
    publisher: 'Nantes Métropole',
    source: 'https://www.data.gouv.fr/datasets/reseau-de-transports-collectifs-naolib',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/685d9000ec5a7481ab634360/', resource: '65bdd7e4-a8e7-4a54-893a-808e71c34d68', licence: 'lov2' },
    licence: { spdx: 'etalab-2.0', name: 'Licence Ouverte / Open Licence 2.0', url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
    verified: { page: 'https://www.data.gouv.fr/datasets/reseau-de-transports-collectifs-naolib', api: 'data.gouv.fr /api/1/datasets/685d9000ec5a7481ab634360: license "lov2", organization «Nantes Métropole»', clause: 'Licence Ouverte 2.0: «à des fins commerciales ou non»', on: '2026-11-21' },
    credit: { publisher: 'Nantes Métropole (Naolib)', licence: 'Licence Ouverte 2.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «continuous»; the GTFS resource was last modified 2026-11-18 (read 2026-11-21)',
    crossBorder: [], bbox: [-1.7783, 47.123, -1.3472, 47.3395], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-montpellier', country: 'FR', name: 'Montpellier — TaM (urban and suburban)',
    publisher: 'Montpellier Méditerranée Métropole',
    source: 'https://www.data.gouv.fr/datasets/offre-de-transport-tam-en-temps-reel-gtfs-rt-urbain-et-suburbain',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/662ba9a3f7d9ff84a3060d0a/', resource: '93a29ce2-cfc8-44ff-b712-bcfd814b7f00', licence: 'odc-odbl' },
    licence: { spdx: 'ODbL-1.0', name: 'Open Data Commons Open Database License 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    verified: { page: 'https://www.data.gouv.fr/datasets/offre-de-transport-tam-en-temps-reel-gtfs-rt-urbain-et-suburbain', api: 'data.gouv.fr /api/1/datasets/662ba9a3f7d9ff84a3060d0a: license "odc-odbl", organization «Montpellier Méditerranée Métropole»', clause: 'ODbL 1.0: no restriction of purpose; a conveyed derivative database is offered under ODbL', on: '2026-11-21' },
    credit: { publisher: 'Montpellier Méditerranée Métropole (TaM)', licence: 'ODbL 1.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «continuous»; the GTFS resource was last modified 2026-11-20 (read 2026-11-21)',
    crossBorder: [], bbox: [3.701, 43.5243, 4.0408, 43.7518], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'fr-grenoble', country: 'FR', name: 'Grenoble — TAG',
    publisher: "Syndicat Mixte des Mobilités de l'Aire Grenobloise",
    source: 'https://www.data.gouv.fr/datasets/horaires-theoriques-du-reseau-tag',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/5af03701b595081c1880a8a4/', resource: 'b6ec7ba4-09bc-46df-b9a1-79a2c2668cf2', licence: 'odc-odbl' },
    licence: { spdx: 'ODbL-1.0', name: 'Open Data Commons Open Database License 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    verified: { page: 'https://www.data.gouv.fr/datasets/horaires-theoriques-du-reseau-tag', api: "data.gouv.fr /api/1/datasets/5af03701b595081c1880a8a4: license \"odc-odbl\", organization «Syndicat Mixte des Mobilités de l'Aire Grenobloise»", clause: 'ODbL 1.0: no restriction of purpose; a conveyed derivative database is offered under ODbL', on: '2026-11-21' },
    credit: { publisher: "Syndicat Mixte des Mobilités de l'Aire Grenobloise (TAG)", licence: 'ODbL 1.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states no frequency; the GTFS resource was last modified 2026-11-20 (read 2026-11-21)',
    crossBorder: [], bbox: [5.5948, 44.9702, 5.9744, 45.375], tz: 'Europe/Paris',
    realtime: null,
  },
  {
    id: 'mc', country: 'MC', name: 'Monaco — Compagnie des Autobus de Monaco',
    publisher: 'Compagnie des Autobus de Monaco',
    source: 'https://www.data.gouv.fr/datasets/gtfs-3',
    resolve: { kind: 'udata', api: 'https://www.data.gouv.fr/api/1/datasets/68daa98c15653c939e48a336/', resource: '2f510784-2957-48e3-b01c-b0e4f9938da7', licence: 'lov2' },
    licence: { spdx: 'etalab-2.0', name: 'Licence Ouverte / Open Licence 2.0', url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
    verified: { page: 'https://www.data.gouv.fr/datasets/gtfs-3', api: 'data.gouv.fr /api/1/datasets/68daa98c15653c939e48a336: license "lov2", organization «COMPAGNIE AUTOBUS DE MONACO»', clause: 'Licence Ouverte 2.0: «à des fins commerciales ou non»', on: '2026-11-21' },
    credit: { publisher: 'Compagnie des Autobus de Monaco', licence: 'Licence Ouverte 2.0', via: 'data.gouv.fr' },
    published: 'data.gouv.fr states frequency «daily»; the GTFS resource was last modified 2026-10-20 (read 2026-11-21)',
    /* VARAVILLA and CHAPELLE ST-ROMAN lie in Roquebrune-Cap-Martin (OpenStreetMap reverse lookup of the stop points, 2026-11-21) */
    crossBorder: ['FR'], bbox: [7.4109, 43.7266, 7.4386, 43.7519], tz: 'Europe/Paris',
    realtime: null,
  },
  /* ── Norway: Entur, the national access point, publishes every public transport authority's timetable.
     https://developer.entur.org/stops-and-timetable-data reads «License: NLOD» with no version (read
     2026-11-21; the national catalogue data.norge.no states none for the dataset). Both NLOD 1.0 §2 and
     NLOD 2.0 §2 read «may use the information for any purpose and in all contexts», and NLOD 1.0 §10 lets
     the licensee use a newer version — so the feed is used under NLOD 2.0. ── */
  {
    id: 'no-oslo', country: 'NO', name: 'Oslo and Akershus — Ruter',
    publisher: 'Entur AS (Ruter)',
    source: 'https://developer.entur.org/stops-and-timetable-data',
    resolve: { kind: 'page', page: 'https://developer.entur.org/stops-and-timetable-data', states: 'License: NLOD', url: 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_rut-aggregated-gtfs.zip' },
    licence: { spdx: 'NLOD-2.0', name: 'Norwegian Licence for Open Government Data 2.0', url: 'https://data.norge.no/nlod/en/2.0' },
    verified: { page: 'https://developer.entur.org/stops-and-timetable-data', clause: '«License: NLOD»; NLOD 2.0 §2 «for any purpose and in all contexts»', on: '2026-11-21' },
    credit: { publisher: 'Entur AS (Ruter)', licence: 'NLOD', via: 'entur.org' },
    published: 'Entur: «all data dumps … are updated daily»; the file was last modified 2026-11-20 23:15 UTC (read 2026-11-21)',
    crossBorder: [], bbox: [10.2003, 59.4363, 11.8618, 60.5424], tz: 'Europe/Oslo',
    realtime: null,
  },
  {
    id: 'no-trondheim', country: 'NO', name: 'Trøndelag — AtB',
    publisher: 'Entur AS (AtB)',
    source: 'https://developer.entur.org/stops-and-timetable-data',
    resolve: { kind: 'page', page: 'https://developer.entur.org/stops-and-timetable-data', states: 'License: NLOD', url: 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_atb-aggregated-gtfs.zip' },
    licence: { spdx: 'NLOD-2.0', name: 'Norwegian Licence for Open Government Data 2.0', url: 'https://data.norge.no/nlod/en/2.0' },
    verified: { page: 'https://developer.entur.org/stops-and-timetable-data', clause: '«License: NLOD»; NLOD 2.0 §2 «for any purpose and in all contexts»', on: '2026-11-21' },
    credit: { publisher: 'Entur AS (AtB)', licence: 'NLOD', via: 'entur.org' },
    published: 'Entur: «all data dumps … are updated daily»; the file was last modified 2026-11-20 23:06 UTC (read 2026-11-21)',
    crossBorder: [], bbox: [7.7356, 62.4167, 14.0038, 65.1081], tz: 'Europe/Oslo',
    realtime: null,
  },
  {
    id: 'no-stavanger', country: 'NO', name: 'Rogaland — Kolumbus',
    publisher: 'Entur AS (Kolumbus)',
    source: 'https://developer.entur.org/stops-and-timetable-data',
    resolve: { kind: 'page', page: 'https://developer.entur.org/stops-and-timetable-data', states: 'License: NLOD', url: 'https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_kol-aggregated-gtfs.zip' },
    licence: { spdx: 'NLOD-2.0', name: 'Norwegian Licence for Open Government Data 2.0', url: 'https://data.norge.no/nlod/en/2.0' },
    verified: { page: 'https://developer.entur.org/stops-and-timetable-data', clause: '«License: NLOD»; NLOD 2.0 §2 «for any purpose and in all contexts»', on: '2026-11-21' },
    credit: { publisher: 'Entur AS (Kolumbus)', licence: 'NLOD', via: 'entur.org' },
    published: 'Entur: «all data dumps … are updated daily»; the file was last modified 2026-11-20 23:04 UTC (read 2026-11-21)',
    crossBorder: [], bbox: [4.8848, 58.2787, 6.9227, 59.8338], tz: 'Europe/Oslo',
    realtime: null,
  },
  /* ── Japan: GTFSデータリポジトリ (gtfs-data.jp) is where the operator itself registers its feed and sets its
     licence; the feed is distributed only there. The operator's own site (chitetsu.co.jp, read 2026-11-21)
     states no licence of its own. CC0 1.0 waives every right, commercial use included. ── */
  {
    id: 'jp-toyama-bus', country: 'JP', name: '富山地方鉄道バス (Toyama Chiho Railway buses)',
    publisher: '富山地方鉄道 (Toyama Chiho Railway)',
    source: 'https://gtfs-data.jp/search?target_feed=chitetsu/chitetsubus',
    resolve: { kind: 'gtfs-data.jp', api: 'https://api.gtfs-data.jp/v2/organizations/chitetsu/feeds/chitetsubus', licence: 'CC0 1.0' },
    licence: { spdx: 'CC0-1.0', name: 'Creative Commons Zero 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja' },
    verified: { page: 'https://gtfs-data.jp/search?target_feed=chitetsu/chitetsubus', api: 'api.gtfs-data.jp /v2/organizations/chitetsu/feeds/chitetsubus: feed_license "CC0 1.0", organization_name «富山地方鉄道»', clause: 'CC0 1.0: every right waived, commercial use included', on: '2026-11-21' },
    credit: { publisher: '富山地方鉄道 (Toyama Chiho Railway)', licence: 'CC0 1.0', via: 'gtfs-data.jp' },
    published: 'gtfs-data.jp: the current file was published 2026-10-22 and is valid 2026-10-22 to 2027-10-21 (read 2026-11-21)',
    crossBorder: [], bbox: [136.9871, 36.5616, 137.5103, 36.906], tz: 'Asia/Tokyo',
    realtime: null,
  },
];
export const FEEDS = Object.freeze(FEED_ROWS.slice());

const byId = Object.create(null);
FEEDS.forEach((f) => { byId[f.id] = f; });

export function feedById(id) { return byId[id] || null; }
function feedList() { return FEEDS.slice(); }

/** the licence rule, as a function the gate and the builder both call */
export function licenceAllowsCommercial(spdx) { return COMMERCIAL_OK.indexOf(String(spdx || '')) >= 0 || spdxAllowsCommercial(spdx); }

/** the credit a reply that used these feeds MUST print: structured rows, one per feed (the reply words them) */
export function attributionFor(ids) {
  const out = [];
  (ids || []).forEach((id) => { const f = byId[id]; if (f && !out.some((o) => o.id === id)) out.push({ id, ...f.credit }); });
  return out;
}

/** which shipped feeds could serve a point (their stops' bounding box, widened by the walk we allow),
    NEAREST FIRST: a feed whose box holds the point comes before a neighbour that reaches it only through
    the widening. The planner plans over the first one (js/transit-planner.js), so without this order a
    point in Monaco would be handed to the Nice feed listed before it, whose box ends 2 km to the west. */
export function feedsNear(lng, lat, bboxes, padKm) {
  const pad = (padKm == null ? 3 : padKm) / 111;
  const cl = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const out = [];
  Object.keys(bboxes || {}).forEach((id) => {
    const b = bboxes[id]; if (!b || !byId[id]) return;
    if (lng >= b[0] - pad / cl && lng <= b[2] + pad / cl && lat >= b[1] - pad && lat <= b[3] + pad) {
      const dx = Math.max(b[0] - lng, 0, lng - b[2]) * cl, dy = Math.max(b[1] - lat, 0, lat - b[3]);
      out.push({ id, d: dx * dx + dy * dy });
    }
  });
  return out.sort((a, b) => a.d - b.d).map((o) => o.id);   /* Array#sort is stable: equal distance keeps registry order */
}
