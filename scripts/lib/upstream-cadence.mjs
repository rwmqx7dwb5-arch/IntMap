/* ============================================================================
 *  scripts/lib/upstream-cadence.mjs — HOW OFTEN EACH UPSTREAM PUBLISHES, ONCE PER UPSTREAM
 * ----------------------------------------------------------------------------
 *  check:datagov judges a bundle's freshness as «the date it was last written × the cadence
 *  declared for it» (scripts/data-governance.mjs, freshnessOf). The cadence is a fact about the
 *  UPSTREAM, and several builders read the same upstream (four read Natural Earth, three GeoNames,
 *  five Wikidata), so it is stated here once and SPREAD into each builder's GOVERNANCE record:
 *
 *      import { NATURAL_EARTH } from './lib/upstream-cadence.mjs';
 *      export const GOVERNANCE = { 'data/x.json': { publisher: …, ...NATURAL_EARTH, builtBy: … } };
 *
 *  ⚠ WHAT A CADENCE MEANS HERE. «After how long has this upstream published new material OF THE
 *  KIND THE BUNDLE CARRIES?» — a gazetteer's material is the daily dump, a climatology's is a new
 *  complete year of fields, an election result's is the next election. It is NEVER how often this
 *  repository happens to rebuild (js/data-governance.js SPELLINGS.cadence: «declared by the
 *  supplier, never inferred from how often we happened to fetch»). A bundle read from several
 *  upstreams takes the shortest cadence among the ones whose material it carries.
 *
 *  ⚠ EVERY VALUE CARRIES ITS BASIS (.agents/rules/no-ad-hoc-hardcoding.md §4): `observed` says what
 *  was measured or read, and when — and says «estimate» where nothing was measured; `expires` says
 *  what would make the value wrong; `canon` says where the value is stated. check:datagov refuses a
 *  cadence without all three.
 *
 *  ⚠ EACH EXPORT IS PURE DATA (string literals only). check:datagov reads builders WITHOUT RUNNING
 *  them and follows one level of `import { … } from './…'` into pure-data constants; a call, a
 *  template literal or a computed value here would make every declaration that spreads it
 *  unreadable to the gate.
 *
 *  ISO 8601 durations (js/data-governance.js parseCadence), or `static` for a finished edition.
 * ==========================================================================*/

export const NATURAL_EARTH = {
  cadence: 'P1Y',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/nvkelso/natural-earth-vector: releases v3.3.0 2016-09, v4.0.0 2017-10, v4.1.0 2018-05, v5.0.0 2021-12, v5.0.1 2022-03, v5.1.0-v5.1.2 2022-05; no commit since 2022-06-02. At most one release a year while the project is active.',
    expires: 'when Natural Earth publishes more than one release in a year, or states a release schedule of its own',
    canon: 'scripts/lib/upstream-cadence.mjs NATURAL_EARTH, spread by every builder that reads Natural Earth',
  },
};

export const GEONAMES = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'read 2026-09-30: download.geonames.org/export/dump/readme.txt publishes modifications-<date>.txt, «all records modified on the previous day», for daily synchronisation — the dumps change every day',
    expires: 'if GeoNames stops publishing the daily modification files, or moves the dumps to a slower schedule',
    canon: 'scripts/lib/upstream-cadence.mjs GEONAMES',
  },
};

export const OURAIRPORTS = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/davidmegginson/ourairports-data: one commit a day at 01:53 UTC, 2026-09-25 through 2026-09-30',
    expires: 'if the nightly export stops (the commit history is the evidence)',
    canon: 'scripts/lib/upstream-cadence.mjs OURAIRPORTS',
  },
};

export const MLEDOZE_COUNTRIES = {
  cadence: 'P1Y',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/mledoze/countries: releases v4.0.0 2020-04, v4.1.0 2022-02, v4.1.1 and 5.0.0 2023-09, 5.1.0 2025-02 — about one a year',
    expires: 'if releases become more frequent than yearly',
    canon: 'scripts/lib/upstream-cadence.mjs MLEDOZE_COUNTRIES',
  },
};

export const IANA_TZDB = {
  cadence: 'P3M',
  cadenceBasis: {
    observed: 'estimate, not measured this round: the IANA time zone database is released several times a year as governments change their rules (release names such as 2024a/2024b/2025a); zone.tab changes with those releases',
    expires: 'when the release history at data.iana.org/time-zones/releases/ is counted and differs',
    canon: 'scripts/lib/upstream-cadence.mjs IANA_TZDB',
  },
};

export const TERRAIN_TILES = {
  cadence: 'static',
  cadenceBasis: {
    observed: 'measured 2026-09-30: the terrarium tiles 4/8/5 and 10/900/400 at s3.amazonaws.com/elevation-tiles-prod answer Last-Modified 2017-11-29 and 2017-11-20 — the set was produced once (Mapzen, 2017) and has not been regenerated',
    expires: 'if a terrarium tile answers with a Last-Modified after 2017, or the AWS Open Data registry lists a new version of the dataset',
    canon: 'scripts/lib/upstream-cadence.mjs TERRAIN_TILES',
  },
};

export const GLOTTOLOG = {
  cadence: 'P6M',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/glottolog/glottolog: releases v4.6 2022-05, v4.7 2022-12, v4.8 2023-07, v5.0 2024-03, v5.1 2024-10, v5.2 2025-05, v5.2.1 2025-06, v5.3 2026-03 — one every five to seven months',
    expires: 'if the release interval moves outside five to seven months',
    canon: 'scripts/lib/upstream-cadence.mjs GLOTTOLOG',
  },
};

export const FACTBOOK = {
  cadence: 'P1M',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/factbook/factbook.json (the mirror the builders read): commits on 2026-08-19 (four), 2026-09-10 and 2026-09-11 — several updates a month',
    expires: 'if the mirror goes a quarter without a commit, or the builders read the Factbook from somewhere else',
    canon: 'scripts/lib/upstream-cadence.mjs FACTBOOK',
  },
};

export const WIKIDATA = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'estimate, not measured per class: Wikidata is edited continuously and its Query Service reflects an edit within minutes, so any day can change what a query answers',
    expires: 'if the builders read a Wikidata dump or a frozen snapshot instead of the live Query Service',
    canon: 'scripts/lib/upstream-cadence.mjs WIKIDATA',
  },
};

export const OPENSTREETMAP = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'planet.openstreetmap.org publishes minutely, hourly and daily replication diffs — the map changes every day; P1D is the finest period a build date stamped YYYY-MM-DD can be compared against',
    expires: 'if the builders read a dated extract instead of the live Overpass API',
    canon: 'scripts/lib/upstream-cadence.mjs OPENSTREETMAP',
  },
};

export const OPENHISTORICALMAP = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'estimate, not measured per relation: OpenHistoricalMap is edited continuously and its Overpass instance serves the live database, so any day can change the relations these bundles read',
    expires: 'if the builders read a dated OHM extract instead of the live Overpass instance',
    canon: 'scripts/lib/upstream-cadence.mjs OPENHISTORICALMAP',
  },
};

export const PLEIADES = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'estimate from the publisher: Pleiades regenerates its downloadable data exports from the live gazetteer every day',
    expires: 'if the Pleiades downloads page states a different schedule',
    canon: 'scripts/lib/upstream-cadence.mjs PLEIADES',
  },
};

export const AOUREDNIK_BASEMAPS = {
  cadence: 'P1M',
  cadenceBasis: {
    observed: 'measured 2026-09-30 on github.com/aourednik/historical-basemaps: eight commits between 2026-09-10 and 2026-09-15 — active in bursts; a month is the period within which a burst has been observed',
    expires: 'if the repository goes a quarter without a commit',
    canon: 'scripts/lib/upstream-cadence.mjs AOUREDNIK_BASEMAPS',
  },
};

export const JPL_SBDB = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'estimate from the publisher: JPL recomputes small-body orbits as observations arrive and the SBDB APIs serve the current solution; new numbered comets and newly measured diameters enter the sweeps this bundle makes',
    expires: 'if the SBDB API documentation states a release schedule',
    canon: 'scripts/lib/upstream-cadence.mjs JPL_SBDB',
  },
};

export const JPL_HORIZONS = {
  cadence: 'P1M',
  cadenceBasis: {
    observed: 'estimate, not measured: Horizons replaces a mission trajectory whenever its navigation team delivers a new reconstructed or predicted kernel, which for the active missions in this bundle is on the scale of weeks',
    expires: 'when kernel delivery dates are measured per spacecraft',
    canon: 'scripts/lib/upstream-cadence.mjs JPL_HORIZONS',
  },
};

export const JPL_SATELLITES = {
  cadence: 'P6M',
  cadenceBasis: {
    observed: 'estimate, not measured: the JPL planetary-satellite element tables change when moons are discovered or orbits are refitted, which has happened a few times a year',
    expires: 'when the table revisions are counted',
    canon: 'scripts/lib/upstream-cadence.mjs JPL_SATELLITES',
  },
};

export const SIMBAD = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'estimate from the publisher: CDS updates SIMBAD continuously as literature is ingested, and new distance measurements enter mesDistance, from which this bundle takes medians',
    expires: 'if CDS states a release schedule for SIMBAD',
    canon: 'scripts/lib/upstream-cadence.mjs SIMBAD',
  },
};

export const NASA_GIBS_DAILY = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'the daily GIBS products this bundle ranges (GHRSST MUR sea ice and SST anomaly, AMSR2 soil moisture) gain a date every day — data/gibs-range.json records `period: 1` for them, measured by tile probe',
    expires: 'if every ranged product becomes a composite with a longer period',
    canon: 'scripts/lib/upstream-cadence.mjs NASA_GIBS_DAILY',
  },
};

export const CELESTRAK_GP = {
  cadence: 'P1D',
  cadenceBasis: {
    observed: 'measured in data/tle/catalogue.json: at the build of 2026-09-29 the median element set was 19.9 h old — the upstream reissues each object about once a day',
    expires: 'if the median element age at build time moves far from a day',
    canon: 'scripts/lib/upstream-cadence.mjs CELESTRAK_GP',
  },
};

export const WHO_DON = {
  cadence: 'P10D',
  cadenceBasis: {
    observed: 'measured 2026-09-30 in the committed corpus data/who-don.json.gz: 36 Disease Outbreak News items published from 2025-09 to 2026-08 — one every ten days on average',
    expires: 'when the publication rate over the last year moves away from ten days',
    canon: 'scripts/lib/upstream-cadence.mjs WHO_DON',
  },
};

export const UNESCO_WHC = {
  cadence: 'P1Y',
  cadenceBasis: {
    observed: 'the World Heritage Committee inscribes properties and decides the in-danger list at one session a year',
    expires: 'if the Committee holds extraordinary sessions that change the List',
    canon: 'scripts/lib/upstream-cadence.mjs UNESCO_WHC',
  },
};

export const SMITHSONIAN_GVP = {
  cadence: 'P1M',
  cadenceBasis: {
    observed: 'estimate, not measured: the Volcanoes of the World database is versioned and revised through the year as eruptions are reported',
    expires: 'when the VOTW version history is counted',
    canon: 'scripts/lib/upstream-cadence.mjs SMITHSONIAN_GVP',
  },
};

export const UNDP_HDR = {
  cadence: 'P1Y',
  cadenceBasis: {
    observed: 'the Human Development Report and its composite-indices time series are published once a year; the builder pins the 2023/24 edition CSV, so a newer edition means changing its URL',
    expires: 'if UNDP publishes the series more often than yearly',
    canon: 'scripts/lib/upstream-cadence.mjs UNDP_HDR',
  },
};

export const WORLD_BANK_WDI = {
  cadence: 'P3M',
  cadenceBasis: {
    observed: 'estimate, not measured: World Development Indicators are revised several times a year as source agencies deliver data',
    expires: 'when the WDI update log is counted',
    canon: 'scripts/lib/upstream-cadence.mjs WORLD_BANK_WDI',
  },
};

export const USGS_PLANETARY_NAMES = {
  cadence: 'P1M',
  cadenceBasis: {
    observed: 'estimate, not measured: the IAU approves new planetary feature names several times a year and the USGS Gazetteer publishes them as they are approved',
    expires: 'when the Gazetteer approval dates are counted',
    canon: 'scripts/lib/upstream-cadence.mjs USGS_PLANETARY_NAMES',
  },
};

export const NOAA_CLIMATOLOGY = {
  cadence: 'P1Y',
  cadenceBasis: {
    observed: 'the bundles are multi-year monthly climatologies of NOAA ERDDAP daily fields; the material that changes a monthly mean is another complete year of those fields',
    expires: 'if the build starts shipping recent fields rather than a climatology',
    canon: 'scripts/lib/upstream-cadence.mjs NOAA_CLIMATOLOGY',
  },
};

export const TELEGEOGRAPHY = {
  cadence: 'P7D',
  cadenceBasis: {
    observed: 'measured 2026-09-30 (one observation): www.submarinecablemap.com/api/v3/cable/cable-geo.json answered Last-Modified 2026-09-22, eight days earlier',
    expires: 'when Last-Modified is sampled over several weeks and the interval differs',
    canon: 'scripts/lib/upstream-cadence.mjs TELEGEOGRAPHY',
  },
};

export const NATIONAL_ELECTIONS = {
  cadence: 'P3M',
  cadenceBasis: {
    observed: 'computed from the twelve polities scripts/elections/ covers (au ca de eu fr hk jp kr ru tw uk us): their national elections occur at about four a year in total, so a quarter usually brings one',
    expires: 'when a polity is added or removed from scripts/elections/',
    canon: 'scripts/lib/upstream-cadence.mjs NATIONAL_ELECTIONS',
  },
};

export const US_PRESIDENTIAL = {
  cadence: 'P4Y',
  cadenceBasis: {
    observed: 'a United States presidential election is held every four years (the last in the bundle is 2024; the next is 2028-11)',
    expires: 'never, while the Constitution fixes the term',
    canon: 'scripts/lib/upstream-cadence.mjs US_PRESIDENTIAL',
  },
};

export const GPCC_FULL_DATA = {
  cadence: 'P2Y',
  cadenceBasis: {
    observed: 'the GPCC Full Data Monthly product is released as numbered versions V2018, V2020, V2022 — one every two years',
    expires: 'if DWD changes the release interval',
    canon: 'scripts/lib/upstream-cadence.mjs GPCC_FULL_DATA',
  },
};

/* ── cadences that are not an upstream's, stated once because several bundles share them ─────── */

export const AUTHORED_HERE = {
  cadence: 'static',
  cadenceBasis: {
    observed: 'the record is written by hand in this repository (reviewed like code); no upstream publishes it, so there is no next edition to be behind',
    expires: 'if the record starts being derived from an upstream',
    canon: 'scripts/lib/upstream-cadence.mjs AUTHORED_HERE',
  },
};

export const DERIVED_FROM_THE_REPOSITORY = {
  cadence: 'static',
  cadenceBasis: {
    observed: 'derived only from other bundles in this repository and never from an upstream; it changes when they are rebuilt, and its own gate says whether it still matches them',
    expires: 'if the builder starts reading an upstream directly',
    canon: 'scripts/lib/upstream-cadence.mjs DERIVED_FROM_THE_REPOSITORY',
  },
};
