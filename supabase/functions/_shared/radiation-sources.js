// ============================================================================
//  IntMap · _shared/radiation-sources.js — measured gamma dose rate, one shape  (#R574)
// ----------------------------------------------------------------------------
//  Six national networks publish a MEASURED ambient gamma dose rate as open data. They agree on
//  nothing else: two units, three quantities, five encodings (GeoJSON, a WFS multipointcoverage,
//  a bespoke JSON API, one CSV per station per year, and a weather bulletin whose station names are
//  baked into its KEY names). The layer that draws them is ONE graphic, so the difference has to die
//  HERE — in a registry where every upstream DECLARES what it is, and in one conversion function —
//  rather than in the page as a switch on the country.
//
//  ⚠ THIS IS A REGISTRY OF FACTS ABOUT UPSTREAMS, NOT A LIST OF SPECIAL CASES. Nothing below asks
//  "which country is this"; the code asks each provider what it declares and obeys the answer. A new
//  network is a new object, not a new branch.
//
//  ── WHAT WAS MEASURED, 2026-09-09, from this machine ─────────────────────────────────────────
//    de-bfs   1,676 features, 1,582 with a value   µSv/h  0.047–0.226   0.87 MB   ACAO *
//    jp-nra   6,500 rows → 5,423 distinct stations µSv/h  0.000–4.735   9.5 MB    ACAO is its own origin
//    fi-stuk    239 stations                       µSv/h  ~0.06–0.20    0.27 MB   ACAO *
//    hk-hko      11 stations (day mean)            µSv/h  0.08–0.15     4.3 kB    ACAO *
//    nl-rivm    151 stations (2011 ANNUAL MEAN)    nSv/h  ~40–100       58 kB     ACAO *
//    us-epa     140 station files, 122 with a dose rate   nSv/h  27–132  67.3 MB in 102 s
//
//  ── TWO UPSTREAMS THAT DO NOT EXIST IN USABLE FORM (measured the same day, kept here so the next
//     reader does not spend the afternoon re-discovering it) ──────────────────────────────────────
//  · ua-seb (SaveEcoBot via data.gov.ua). The open dataset is three CSVs: locations (1,037 rows with
//    lat/lon), indicators (the unit table), and MEASUREMENTS — one ZIP whose content-length is
//    604,935,935 bytes. There is no keyless current-value endpoint; www.saveecobot.com/api/radiation
//    answers 401 «No API key found in request». A registry of coordinates with no values is not a
//    dose map, so Ukraine is ABSENT rather than fabricated.
//  · opendata:eurdep_latestValue on the BfS WFS (3,633 stations, 44 countries) returns 200 and is
//    DELIBERATELY NOT USED: it has no GovData dataset entry, so there is no licence to redistribute
//    under. Nothing EURDEP-derived is in this file.
//
//  ⚠ NO TYPE ANNOTATIONS. scripts/static-checks.mjs runs `node --check` over every committed .js/.ts.
// ============================================================================

/* ── THE ONE PLACE A UNIT IS CONVERTED ───────────────────────────────────────────────────────────
   Everything this feed emits is nSv/h. Only units an upstream actually declares are here; an unknown
   unit THROWS, because the failure that matters on a radiation map is a silent 0 — or a silent
   factor of a thousand. µ is accepted as U+00B5 MICRO SIGN (what BfS sends), as U+03BC GREEK SMALL
   LETTER MU, and as ASCII "u".

   ⚠ µGy/h CONVERTS AT 1000, i.e. 1 Gy ↦ 1 Sv. That is not this project's assumption: it is what the
   publishing network already did before the number reached us (a radiation weighting factor of 1 for
   photons). A record converted from an absorbed-dose quantity says so by carrying
   `quantity: "air-kerma"`, so a legend can be honest instead of pretending the two are one thing. */
const UNIT_TO_NANO = {
  "nSv/h": 1,
  "uSv/h": 1000,
  "uGy/h": 1000,
};

export function normaliseUnit(unit) {
  return String(unit == null ? "" : unit).trim().replace(/[µμ]/g, "u");
}

/* ⚠ `+""`, `+null` AND `+[]` ARE ALL 0, AND 0 IS FINITE. Every absent field in every upstream here
   arrives as one of those, so a coercion that only asks Number.isFinite() turns "this monitor sent
   nothing" into "this monitor measured zero" — a missing station becomes a station reading 0 nSv/h.
   This is the ONE coercion in the file, and everything that reads an upstream number goes through
   it.  (#R543) */
function num(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toNanoSvH(value, unit) {
  const key = normaliseUnit(unit);
  const factor = UNIT_TO_NANO[key];
  if (!factor) throw new RangeError("unknown_radiation_unit:" + key);
  const n = num(value);
  if (n == null) return null;
  return n * factor;
}

/* A coordinate is only a coordinate if it is a finite number inside the world. `null` is NOT a
   failure here — a station whose position is genuinely unknown keeps its reading and is simply not
   drawn; a station at NaN or at 999 would be drawn somewhere, which is worse than absent. */
export function validLatLon(lat, lon) {
  const a = num(lat);
  const b = num(lon);
  if (a == null || b == null) return false;
  return a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

/* One record, built only from things the upstream said. `kind` is the averaging window the SOURCE
   applied, not an interpretation: an hourly mean and a 2011 annual mean must never be plotted by one
   rule, and the only way the page can know is if the record says.

   ⚠ `below` EXISTS BECAUSE AN INSTRUMENT CANNOT MEASURE ZERO. Measured 2026-09-09: seven RAMIS
   stations reported air_dose_rate exactly 0 with missing_status "0" (i.e. NOT flagged missing) and a
   declared meas_range_low_limit of 0.2 µSv/h — their detector does not resolve below 200 nSv/h, so
   the 0 means "under my floor", not "no radiation here". Emitting it as a reading of 0 puts seven
   Japanese towns at the bottom of the colour scale claiming something no detector can claim, and
   dropping them instead deletes seven working monitors. So the record keeps the number and says the
   upstream's own floor was not cleared. The floor is READ from the record, never assumed. */
function record(o) {
  const ok = validLatLon(o.lat, o.lon);
  return {
    code: String(o.code),
    name: o.name == null ? "" : String(o.name),
    lat: ok ? Number(o.lat) : null,
    lon: ok ? Number(o.lon) : null,
    nsvh: o.nsvh,
    at: o.at || null,
    quantity: o.quantity,
    kind: o.kind,
    below: o.below === true,
  };
}

/* ── de-bfs ──────────────────────────────────────────────────────────────────────────────────────
   Bundesamt für Strahlenschutz ODL network, via the BfS open-data WFS as GeoJSON. Every feature
   carries its OWN unit and its own averaging window (`duration: "1h"`), so neither is assumed here.
   The join key is `kenn` — the official station number both timeseries layers are filtered by. */
const deBfs = {
  id: "de-bfs",
  name: "Bundesamt für Strahlenschutz — ODL-Messnetz",
  country: "DE",
  homepage: "https://odlinfo.bfs.de/",
  attribution: "Bundesamt für Strahlenschutz (BfS), ODL-Messnetz",
  licence: "DL-DE/BY-2.0",
  licenceUrl: "https://www.govdata.de/dl-de/by-2-0",
  quantity: "H*(10)",
  unitUpstream: "uSv/h",
  kind: "hourly-mean",
  historyDays: 365,
  needsProxy: false,
  latest: {
    requests: 1,
    contentTypeRe: /json/i,
    urls() {
      return ["https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=2.0.0&request=GetFeature" +
        "&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json"];
    },
    parse(bodies) {
      const j = JSON.parse(bodies[0]);
      const out = [];
      for (const f of (j.features || [])) {
        const p = f.properties || {};
        const v = num(p.value);
        if (v == null) continue;
        const c = (f.geometry && f.geometry.coordinates) || [];
        out.push(record({
          code: p.kenn || p.id,
          name: p.name,
          lat: c[1],
          lon: c[0],
          nsvh: toNanoSvH(v, p.unit),
          at: p.end_measure,
          quantity: "H*(10)",
          kind: p.duration === "1d" ? "daily-mean" : "hourly-mean",
        }));
      }
      return out;
    },
  },
  /* Two timeseries layers, and which one answers is decided by the SPAN the caller asked for, not by
     a preference: measured, the 1 h layer holds 168 rows (7 days) and the 24 h layer holds 365. */
  series: {
    requests: 1,
    contentTypeRe: /json/i,
    urls(q) {
      const days = (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
      const layer = (Number.isFinite(days) && days > 7)
        ? "opendata:odlinfo_timeseries_odl_24h"
        : "opendata:odlinfo_timeseries_odl_1h";
      return ["https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=2.0.0&request=GetFeature" +
        "&outputFormat=application/json&typeName=" + layer +
        "&cql_filter=" + encodeURIComponent("kenn='" + String(q.code).replace(/[^0-9A-Za-z]/g, "") + "'")];
    },
    parse(bodies) {
      const j = JSON.parse(bodies[0]);
      const out = [];
      for (const f of (j.features || [])) {
        const p = f.properties || {};
        const v = num(p.value);
        if (v == null) continue;
        out.push({ at: p.end_measure, nsvh: toNanoSvH(v, p.unit) });
      }
      out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      return out;
    },
  },
  day: null,
};

/* ── jp-nra ──────────────────────────────────────────────────────────────────────────────────────
   The NRA radiation monitoring information sharing system (RAMIS). Seven `data_type` values cover
   seven monitoring-table classes; together they returned 6,500 rows on 2026-09-09 for 5,423 DISTINCT
   stations, because the API sends every sample it holds for a station in the window, not one — a
   single station appeared 616 times. Deduplication is therefore not tidiness but correctness:
   without it a monitor is drawn hundreds of times and the value shown is whichever row arrived last.
   The key is `obs_station_unique_code`; `id` is NOT unique (5,490 distinct vs 5,423 — measured).

   ⚠ THE ONE FIELD THIS PROVIDER ASSERTS RATHER THAN READS IS THE UNIT. Every other upstream in this
   file names its unit in the payload; RAMIS names none anywhere in the response. `air_dose_rate` is
   published by NRA as µSv/h, and the per-record `meas_range_low_limit`/`meas_range_high_limit` of
   0.001–10 that arrives beside it is consistent with that and with nothing else. If NRA ever adds a
   unit field, read it instead of this line. */
const jpNra = {
  id: "jp-nra",
  name: "原子力規制委員会 放射線モニタリング情報共有・公表システム (RAMIS)",
  country: "JP",
  homepage: "https://www.ramis.nra.go.jp/",
  attribution: "原子力規制委員会 (Nuclear Regulation Authority, Japan) / RAMIS",
  licence: "政府標準利用規約 (第2.0版)",
  licenceUrl: "https://www.ramis.nra.go.jp/",
  quantity: "ambient-gamma",
  unitUpstream: "uSv/h",
  kind: "instant",
  historyDays: 0,
  needsProxy: true,
  latest: {
    requests: 7,
    contentTypeRe: /json/i,
    urls() {
      const u = [];
      for (let t = 1; t <= 7; t++) {
        u.push("https://www.ramis.nra.go.jp/api/v1/map/map-means-data-public?data_type=" + t);
      }
      return u;
    },
    parse(bodies) {
      const newest = new Map();
      for (const body of bodies) {
        if (body == null) continue;
        const j = JSON.parse(body);
        for (const d of (j.data || [])) {
          const key = d.obs_station_unique_code;
          if (!key) continue;
          const t = Date.parse(d.meas_datetime);
          const prev = newest.get(key);
          if (prev && !(Number.isFinite(t) && t > prev.t)) continue;
          newest.set(key, { t: Number.isFinite(t) ? t : -Infinity, d });
        }
      }
      const out = [];
      for (const entry of newest) {
        const d = entry[1].d;
        const v = num(d.air_dose_rate);
        if (v == null) continue;
        /* RAMIS states each detector's usable range per record; a value that does not clear the
           declared floor is reported as such rather than as a measurement of that value. */
        const floor = num(d.meas_range_low_limit);
        out.push(record({
          code: entry[0],
          name: d.display_name_roman || d.display_name,
          lat: d.latitude,
          lon: d.longitude,
          nsvh: toNanoSvH(v, "uSv/h"),
          at: d.meas_datetime,
          quantity: "ambient-gamma",
          kind: "instant",
          below: floor != null && v < floor,
        }));
      }
      return out;
    },
  },
  /* Measured 2026-09-09: the graph endpoint answers 403 «Missing Authentication Token» and the map
     endpoint rejects a `start_datetime` with 400 «リクエストが不正です。». There is no keyless history. */
  series: null,
  day: null,
};

/* ── fi-stuk ─────────────────────────────────────────────────────────────────────────────────────
   STUK's external-radiation network, published through the FMI open-data WFS. The `::latest::simple`
   stored query is cheap but carries NO station names, only coordinates — so this uses
   `multipointcoverage`, which puts the station register (fmisid, name, position) and the value matrix
   in one document. `::simple` also rejects starttime/endtime with a 400 (measured, with and without
   other parameters), so multipointcoverage is the only route to history as well; with `fmisid=` a
   whole day costs 7.6 kB.

   The document is: N `<gml:Point gml:id="point-FMISID">` blocks each with a name and a position,
   then a positions list of "lat lon epochSeconds" rows, then a tuple list with one row per position
   and one column per `swe:field`. Rows join to stations by POSITION, and on 2026-09-09 the 239
   stations had 239 distinct positions, so the join is unambiguous. `NaN` is how FMI writes "no
   observation", and num() drops it. */
const FI_MPC = "https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=GetFeature" +
  "&storedquery_id=stuk::observations::external-radiation::multipointcoverage";

/* The window is wide because STUK's answer lags: at 12:39 UTC the newest observation was 12:00, and
   a 20-minute window came back numberMatched="0" (measured). Three hours at hourly steps is 0.27 MB
   and always contains at least one complete sweep of the network. */
const FI_WINDOW_MS = 3 * 3600 * 1000;

function fiParse(xml, wantParam) {
  const stations = new Map();
  const pointRe = /<gml:Point gml:id="point-(\d+)"[^>]*>\s*<gml:name>([^<]*)<\/gml:name>\s*<gml:pos>\s*([-\d.]+)\s+([-\d.]+)/g;
  for (let m = pointRe.exec(xml); m; m = pointRe.exec(xml)) {
    stations.set(m[3] + " " + m[4], { fmisid: m[1], name: m[2], lat: +m[3], lon: +m[4] });
  }
  const fields = [];
  const fieldRe = /<swe:field name="([^"]*)"/g;
  for (let m = fieldRe.exec(xml); m; m = fieldRe.exec(xml)) fields.push(m[1]);
  const col = fields.indexOf(wantParam);
  if (col < 0) return { stations, rows: [] };
  const posBlock = /<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/.exec(xml);
  const tupBlock = /<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/.exec(xml);
  if (!posBlock || !tupBlock) return { stations, rows: [] };
  const pos = posBlock[1].trim().split("\n").map((s) => s.trim().split(/\s+/));
  const tup = tupBlock[1].trim().split("\n").map((s) => s.trim().split(/\s+/));
  const rows = [];
  for (let i = 0; i < pos.length && i < tup.length; i++) {
    const v = num(tup[i][col]);
    const epoch = num(pos[i][2]);
    if (v == null || epoch == null) continue;
    rows.push({ key: pos[i][0] + " " + pos[i][1], epoch, value: v });
  }
  return { stations, rows };
}

const fiStuk = {
  id: "fi-stuk",
  name: "Säteilyturvakeskus (STUK) — ulkoisen säteilyn valvontaverkko",
  country: "FI",
  homepage: "https://www.stuk.fi/",
  attribution: "Säteilyturvakeskus (STUK), delivered by Ilmatieteen laitos open data",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  quantity: "H*(10)",
  unitUpstream: "uSv/h",
  kind: "10min-mean",
  /* Measured: a request for 2010-01-01 returns observations, so the archive goes back at least to
     the date STUK's own open-data description names. Expressed in days from that date. */
  historyDays: 6000,
  needsProxy: false,
  latest: {
    requests: 1,
    contentTypeRe: /xml/i,
    urls(q) {
      const now = (q && q.now) || Date.now();
      const s = new Date(now - FI_WINDOW_MS).toISOString().slice(0, 19) + "Z";
      const e = new Date(now).toISOString().slice(0, 19) + "Z";
      return [FI_MPC + "&starttime=" + s + "&endtime=" + e + "&timestep=60"];
    },
    parse(bodies) {
      const parsed = fiParse(bodies[0], "DR_PT10M_avg");
      const newest = new Map();
      for (const r of parsed.rows) {
        const prev = newest.get(r.key);
        if (!prev || r.epoch > prev.epoch) newest.set(r.key, r);
      }
      const out = [];
      for (const entry of newest) {
        const st = parsed.stations.get(entry[0]);
        if (!st) continue;
        out.push(record({
          code: st.fmisid,
          name: st.name,
          lat: st.lat,
          lon: st.lon,
          nsvh: toNanoSvH(entry[1].value, "uSv/h"),
          at: new Date(entry[1].epoch * 1000).toISOString(),
          quantity: "H*(10)",
          kind: "10min-mean",
        }));
      }
      return out;
    },
  },
  series: {
    requests: 1,
    contentTypeRe: /xml/i,
    urls(q) {
      return [FI_MPC + "&starttime=" + q.from + "&endtime=" + q.to +
        "&timestep=60&fmisid=" + encodeURIComponent(String(q.code).replace(/\D/g, ""))];
    },
    parse(bodies) {
      return fiParse(bodies[0], "DR_PT10M_avg")
        .rows
        .map((r) => ({ at: new Date(r.epoch * 1000).toISOString(), nsvh: toNanoSvH(r.value, "uSv/h") }))
        .sort((a, b) => a.at.localeCompare(b.at));
    },
  },
  day: null,
};

/* ── hk-hko ──────────────────────────────────────────────────────────────────────────────────────
   The Hong Kong Observatory "Yesterday's Weather" bulletin (dataType=RYES) carries the daily mean
   ambient gamma dose rate. There is no station list inside it: a station EXISTS iff a key ends in
   `Microsieverts`, and its label is the sibling key `<prefix>LocationName`. That is why nothing here
   spells out eleven place names — the eleven are DISCOVERED, and a twelfth would appear on its own.
   (33 keys end in LocationName; only 11 have a radiation sibling. The other 22 are thermometers.)

   ⚠ THE BULLETIN CARRIES NO COORDINATES, so HKO_POS below is the one geocoded table this provider
   needs; its provenance is written above it. A station missing from that table still ships — with
   lat/lon null — because a reading whose position we lost is still a reading. */

/* HKO_POS — resolved once, on 2026-09-09, by `node scripts/probe-radiation-sources.mjs --geocode`,
   which asks Nominatim for "<station>, Hong Kong" and keeps the first result inside Hong Kong. Every
   entry was read back against the place HKO names; ONE was wrong and was re-resolved by hand —
   «Kat O» came back as 吉慶圍 Kat Hing Wai in Yuen Long, 25 km from the island 吉澳 the station is on
   (the #R515 failure: full-text search answers with a different place rather than with nothing). The
   corrected point is 吉澳漁民村, 22.5514 / 114.2896.
   OBSERVATION: Nominatim, 2026-09-09.  EXPIRES: when HKO adds, renames or moves a monitoring
   station — the parser then emits a name that is not a key here and that station ships with a null
   position, which the probe script reports.  CANONICAL: this table; the bulletin publishes none. */
const HKO_POS = {
  "Chek Lap Kok": [22.3125, 113.9184],
  "Kat O": [22.5514, 114.2896],
  "King's Park": [22.3106, 114.1743],
  "Kwun Tong": [22.3121, 114.2265],
  "Ping Chau": [22.5456, 114.4283],
  "Sai Wan Ho": [22.2824, 114.2215],
  "Sha Tau Kok": [22.5455, 114.2216],
  "Tai Mei Tuk": [22.473, 114.2332],
  "Tap Mun": [22.4757, 114.3619],
  "Tsim Bei Tsui": [22.4862, 114.011],
  "Yuen Ng Fan": [22.3779, 114.3372],
};

function hkUrl(iso) {
  return "https://data.weather.gov.hk/weatherAPI/opendata/opendata.php?dataType=RYES&lang=en" +
    "&rformat=json&date=" + String(iso).replace(/-/g, "");
}

function hkParse(body) {
  const j = JSON.parse(body);
  const at = /^\d{8}$/.test(String(j.ReportTimeInfoDate || ""))
    ? String(j.ReportTimeInfoDate).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3T00:00:00Z")
    : null;
  const out = [];
  for (const key of Object.keys(j)) {
    if (!/Microsieverts$/.test(key)) continue;
    const prefix = key.slice(0, key.length - "Microsieverts".length);
    const v = num(j[key]);
    if (v == null) continue;
    const name = j[prefix + "LocationName"] || prefix;
    const pos = Object.prototype.hasOwnProperty.call(HKO_POS, name) ? HKO_POS[name] : null;
    out.push(record({
      code: prefix,
      name,
      lat: pos ? pos[0] : null,
      lon: pos ? pos[1] : null,
      nsvh: toNanoSvH(v, "uSv/h"),
      at,
      quantity: "ambient-gamma",
      kind: "daily-mean",
    }));
  }
  return out;
}

const hkHko = {
  id: "hk-hko",
  name: "Hong Kong Observatory — ambient gamma dose rate",
  country: "HK",
  homepage: "https://www.hko.gov.hk/en/radiation/monitoring/index.html",
  attribution: "Hong Kong Observatory",
  licence: "data.gov.hk Terms of Use (redistribution permitted with attribution)",
  licenceUrl: "https://data.gov.hk/en/terms-and-conditions",
  quantity: "ambient-gamma",
  unitUpstream: "uSv/h",
  kind: "daily-mean",
  historyDays: 0,
  needsProxy: false,
  latest: {
    requests: 1,
    contentTypeRe: /json/i,
    urls(q) {
      /* The bulletin is YESTERDAY's weather; asking for today returns a document with no readings. */
      const now = (q && q.now) || Date.now();
      return [hkUrl(new Date(now - 86400000).toISOString().slice(0, 10))];
    },
    parse(bodies) { return hkParse(bodies[0]); },
  },
  series: null,
  /* The same bulletin IS the day mode: one document per date, already a daily mean. */
  day: {
    requests: 1,
    contentTypeRe: /json/i,
    urls(q) { return [hkUrl(q.iso)]; },
    parse(bodies) { return hkParse(bodies[0]); },
  },
};

/* ── nl-rivm ─────────────────────────────────────────────────────────────────────────────────────
   ⚠ THIS IS NOT A CURRENT READING AND MUST NEVER BE MERGED WITH ONE. RIVM's INSPIRE WFS layer is
   `gamma_radiation_2011`: the ANNUAL MEAN dose rate at each of 151 monitoring posts for the year
   2011. RIVM's own portal says the live display is being rebuilt and points readers at EURDEP.
   Putting a 2011 average beside a reading taken twenty minutes ago, under one colour scale, would be
   a lie told by the graphic rather than by any sentence — so these records declare
   `kind: "annual-mean"`, and mergeLatest() files them in a separate array that the current-value
   legend does not colour. Each feature declares its own unit in `eenheid`. */
const nlRivm = {
  id: "nl-rivm",
  name: "RIVM Nationaal Meetnet Radioactiviteit — annual mean 2011",
  country: "NL",
  homepage: "https://www.rivm.nl/stralingsmeetnet",
  attribution: "Rijksinstituut voor Volksgezondheid en Milieu (RIVM)",
  licence: "CC0 1.0",
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  quantity: "ambient-gamma",
  unitUpstream: "nSv/h",
  kind: "annual-mean",
  asOf: "2011",
  historyDays: 0,
  needsProxy: false,
  latest: {
    requests: 1,
    contentTypeRe: /json/i,
    urls() {
      return ["https://data.rivm.nl/geo/inspire/wfs?service=WFS&version=2.0.0&request=GetFeature" +
        "&typeNames=inspire:gamma_radiation_2011&outputFormat=application/json&srsName=EPSG:4326"];
    },
    parse(bodies) {
      const j = JSON.parse(bodies[0]);
      const out = [];
      for (const f of (j.features || [])) {
        const p = f.properties || {};
        const v = num(p.dosis_tempo);
        if (v == null) continue;
        const c = (f.geometry && f.geometry.coordinates) || [];
        out.push(record({
          code: String(f.id || p.inspireid),
          name: p.stationname,
          lat: c[1],
          lon: c[0],
          nsvh: toNanoSvH(v, p.eenheid),
          at: "2011-12-31T23:59:59Z",
          quantity: "ambient-gamma",
          kind: "annual-mean",
        }));
      }
      return out;
    },
  },
  series: null,
  day: null,
};

/* ── us-epa ──────────────────────────────────────────────────────────────────────────────────────
   ⚠ RADNET CANNOT BE READ IN ONE REQUEST, AND THAT IS THE WHOLE SHAPE OF THIS ENTRY. The only
   keyless RadNet endpoint is one CSV PER STATION PER YEAR — the year to date, hourly. Measured
   2026-09-09: 140 station files, 70,608,513 bytes, 102 s at concurrency 8, and the server offers
   neither Range (no `Accept-Ranges`, and `Range: bytes=-20000` returned all 638 kB) nor gzip.
   122 of the 140 files carried a dose-equivalent rate; values 27–132 nSv/h. The Envirofacts ERM_*
   tables are the laboratory sample programme, not this, and hold no coordinates; the near-real-time
   dashboard is a Qlik mashup over a websocket.

   So `latest.requests` is 140 and the endpoint's per-request budget refuses it — by ARITHMETIC, not
   by name. What keeps RadNet reachable is `chunkSize`: the same `latest`, in slices that DO fit,
   which the page asks for when it wants the United States. And `series` is where RadNet is actually
   cheap — one request IS a whole year at hourly resolution. */

/* EPA_STATIONS — [path, lat, lon, year]. The PATHS AND YEARS ARE NOT INVENTED: they are every
   `radnet.epa.gov/cdx-radnet-rest/api/rest/csv/<year>/fixed/<ST>/<CITY>` link on
   https://www.epa.gov/radnet/radnet-csv-file-downloads, which is EPA's own published register of the
   station files. `node scripts/probe-radiation-sources.mjs --epa` re-derives this table from that
   page and prints a diff. Eight of the 140 name 2025 as their latest year — those stations stopped
   reporting, and the year is kept as EPA published it rather than bumped to the current one.
   The COORDINATES are the city each station is named for, resolved once via Nominatim on 2026-09-09
   and read back against the state name; RadNet publishes no station coordinates at all, so this is
   CITY-CENTROID precision — the record's `quantity` describes the value, not the position.
   OBSERVATION: EPA download page + Nominatim, 2026-09-09.  EXPIRES: when EPA adds, removes or
   renames a station file — the probe script's diff is how that is noticed.  CANONICAL: this table,
   because the only alternative is a geocoder call per station at request time. */
const EPA_STATIONS = [
  ["ak/anchorage", 61.2163, -149.8949, "2026"],
  ["AK/FAIRBANKS", 64.8378, -147.7167, "2026"],
  ["ak/juneau", 58.302, -134.4197, "2026"],
  ["AL/BIRMINGHAM", 33.5207, -86.8024, "2026"],
  ["AL/MOBILE", 30.6913, -88.0438, "2026"],
  ["AL/MONTGOMERY", 32.3777, -86.3091, "2026"],
  ["AR/FT SMITH", 35.388, -94.4265, "2026"],
  ["AR/LITTLE ROCK", 34.7465, -92.2896, "2026"],
  ["AZ/PHOENIX", 33.4484, -112.0741, "2026"],
  ["az/tucson", 32.2229, -110.9748, "2026"],
  ["AZ/YUMA", 32.721, -114.6203, "2026"],
  ["CA/ANAHEIM", 33.8348, -117.9117, "2026"],
  ["CA/BAKERSFIELD", 35.3739, -119.0195, "2026"],
  ["CA/EUREKA", 40.8019, -124.1708, "2026"],
  ["CA/FRESNO", 36.7394, -119.7848, "2026"],
  ["CA/LOS ANGELES", 34.0537, -118.2428, "2026"],
  ["CA/RIVERSIDE", 33.9825, -117.3742, "2026"],
  ["ca/sacramento", 38.5811, -121.4939, "2026"],
  ["CA/SAN BERNARDINO COUNTY", 34.8253, -116.0833, "2026"],
  ["CA/SAN DIEGO", 32.7174, -117.1628, "2026"],
  ["CA/SAN FRANCISCO", 37.7879, -122.4075, "2026"],
  ["CA/SAN JOSE", 37.3362, -121.8906, "2026"],
  ["CO/COLORADO SPRINGS", 38.834, -104.8253, "2026"],
  ["CO/DENVER", 39.7392, -104.9849, "2026"],
  ["CO/GRAND JUNCTION", 39.0673, -108.5645, "2026"],
  ["CT/HARTFORD", 41.7646, -72.6909, "2026"],
  ["DC/WASHINGTON", 38.8951, -77.0364, "2026"],
  ["DE/DOVER", 39.1582, -75.5244, "2026"],
  ["FL/JACKSONVILLE", 30.3262, -81.6579, "2026"],
  ["fl/miami", 25.7742, -80.1936, "2026"],
  ["FL/ORLANDO", 28.5421, -81.379, "2026"],
  ["FL/TALLAHASSEE", 30.4381, -84.2809, "2026"],
  ["FL/TAMPA", 27.945, -82.4583, "2026"],
  ["GA/ATLANTA", 33.7545, -84.3898, "2026"],
  ["ga/augusta", 33.471, -81.9748, "2026"],
  ["HI/HONOLULU", 21.3045, -157.8557, "2026"],
  ["ia/des moines", 41.5869, -93.6249, "2026"],
  ["IA/FORT MADISON", 40.6311, -91.3084, "2026"],
  ["IA/MASON CITY", 43.1525, -93.2018, "2026"],
  ["ID/BOISE", 43.6166, -116.2009, "2026"],
  ["ID/IDAHO FALLS", 43.4888, -112.0363, "2026"],
  ["il/aurora", 41.7572, -88.3148, "2026"],
  ["il/champaign", 40.1165, -88.2431, "2026"],
  ["il/chicago", 41.8756, -87.6244, "2026"],
  ["in/fort wayne", 41.08, -85.1386, "2026"],
  ["IN/INDIANAPOLIS", 39.7683, -86.1584, "2026"],
  ["ks/dodge city", 37.7528, -100.0171, "2026"],
  ["KS/KANSAS CITY", 39.1135, -94.6265, "2026"],
  ["KS/WICHITA", 37.6922, -97.3375, "2026"],
  ["ky/lexington", 38.0464, -84.497, "2026"],
  ["KY/LOUISVILLE", 38.2542, -85.7594, "2025"],
  ["ky/paducah", 37.0834, -88.6, "2026"],
  ["LA/BATON ROUGE", 30.4494, -91.187, "2026"],
  ["LA/SHREVEPORT", 32.5135, -93.7478, "2026"],
  ["MA/BOSTON", 42.3588, -71.0578, "2026"],
  ["MA/WORCESTER", 42.2626, -71.8019, "2026"],
  ["MD/BALTIMORE", 39.2909, -76.6108, "2026"],
  ["ME/ORONO", 44.8836, -68.6728, "2026"],
  ["me/portland", 43.6574, -70.2587, "2026"],
  ["mi/bay city", 43.5962, -83.8882, "2026"],
  ["MI/DETROIT", 42.3316, -83.0466, "2026"],
  ["MI/GRAND RAPIDS", 42.9632, -85.6679, "2026"],
  ["mn/duluth", 46.7838, -92.1053, "2026"],
  ["MN/ST. PAUL", 44.9497, -93.0931, "2026"],
  ["MO/JEFFERSON CITY", 38.5774, -92.1724, "2026"],
  ["MO/SPRINGFIELD", 37.2082, -93.2923, "2026"],
  ["mo/st. louis", 38.6254, -90.19, "2026"],
  ["ms/jackson", 32.2999, -90.183, "2026"],
  ["mt/billings", 45.7875, -108.4961, "2026"],
  ["MT/KALISPELL", 48.2022, -114.3153, "2026"],
  ["nc/charlotte", 35.2272, -80.8431, "2026"],
  ["nc/greensboro", 36.0726, -79.792, "2026"],
  ["nc/raleigh", 35.7804, -78.6391, "2026"],
  ["NC/WILMINGTON", 34.2353, -77.9487, "2026"],
  ["nd/bismarck", 46.8083, -100.7837, "2026"],
  ["ne/kearney", 40.4906, -98.9472, "2026"],
  ["ne/lincoln", 40.8089, -96.7078, "2026"],
  ["NE/OMAHA", 41.2587, -95.9384, "2026"],
  ["NH/CONCORD", 43.2072, -71.5375, "2026"],
  ["NH/PORTSMOUTH", 43.0751, -70.7602, "2026"],
  ["nj/edison", 40.5005, -74.3984, "2026"],
  ["nm/albuquerque", 35.0841, -106.651, "2026"],
  ["NM/CARLSBAD", 32.4257, -104.2376, "2026"],
  ["NM/NAVAJO LAKE", 36.9214, -107.4508, "2026"],
  ["nv/las vegas", 36.1674, -115.1484, "2026"],
  ["nv/reno", 39.5262, -119.8127, "2026"],
  ["ny/albany", 42.6512, -73.755, "2026"],
  ["ny/buffalo", 42.8864, -78.8781, "2026"],
  ["NY/NYC (EML)", 40.7127, -74.006, "2026"],
  ["ny/rochester", 43.1573, -77.6152, "2026"],
  ["NY/SYRACUSE", 43.0481, -76.1474, "2026"],
  ["NY/YAPHANK", 40.8322, -72.93, "2026"],
  ["oh/cincinnati", 39.1013, -84.5127, "2026"],
  ["oh/cleveland", 41.4997, -81.6937, "2026"],
  ["OH/COLUMBUS", 39.9623, -83.0007, "2026"],
  ["oh/toledo", 41.6529, -83.5378, "2026"],
  ["ok/oklahoma city", 35.473, -97.5171, "2026"],
  ["OK/TULSA", 36.1563, -95.9928, "2026"],
  ["OR/CORVALLIS", 44.5646, -123.262, "2026"],
  ["or/portland", 45.5202, -122.6742, "2026"],
  ["PA/BLOOMSBURG", 41.0045, -76.4537, "2026"],
  ["pa/philadelphia", 39.9527, -75.1635, "2026"],
  ["pa/pittsburgh", 40.4407, -80.0026, "2026"],
  ["PR/SAN JUAN", 18.3842, -66.0534, "2026"],
  ["ri/providence", 41.824, -71.4128, "2026"],
  ["sc/columbia", 34.0008, -81.0352, "2026"],
  ["sd/pierre", 44.3684, -100.3511, "2026"],
  ["sd/rapid city", 44.0806, -103.228, "2026"],
  ["tn/knoxville", 35.9604, -83.921, "2026"],
  ["TN/MEMPHIS", 35.146, -90.0518, "2026"],
  ["tn/nashville", 36.1623, -86.7743, "2026"],
  ["tx/amarillo", 35.2073, -101.8371, "2026"],
  ["tx/austin", 30.2711, -97.7437, "2026"],
  ["tx/corpus christi", 27.7635, -97.4033, "2026"],
  ["tx/dallas", 32.7763, -96.7969, "2026"],
  ["TX/EL PASO", 31.7601, -106.487, "2025"],
  ["TX/FT. WORTH", 32.7532, -97.3327, "2025"],
  ["TX/HARLINGEN", 26.1908, -97.6961, "2025"],
  ["TX/HOUSTON", 29.7589, -95.3677, "2025"],
  ["TX/LAREDO", 27.5079, -99.507, "2025"],
  ["TX/LUBBOCK", 33.5856, -101.847, "2025"],
  ["TX/SAN ANGELO", 31.465, -100.4405, "2025"],
  ["tx/san antonio", 29.4246, -98.4951, "2026"],
  ["ut/salt lake city", 40.7596, -111.8868, "2026"],
  ["ut/st. george", 37.1099, -113.5832, "2026"],
  ["va/harrisonburg", 38.4493, -78.8689, "2026"],
  ["va/richmond", 37.5385, -77.4343, "2026"],
  ["va/virginia beach", 36.8497, -75.9761, "2026"],
  ["vt/burlington", 44.4762, -73.2129, "2026"],
  ["wa/ellensburg", 46.9971, -120.5451, "2026"],
  ["wa/olympia", 47.0451, -122.895, "2026"],
  ["WA/RICHLAND", 46.2804, -119.2752, "2026"],
  ["wa/seattle", 47.6038, -122.3301, "2026"],
  ["wa/spokane", 47.6572, -117.4235, "2026"],
  ["wi/la crosse", 43.8123, -91.2514, "2026"],
  ["wi/madison", 43.0747, -89.3842, "2026"],
  ["WI/MILWAUKEE", 43.0386, -87.9091, "2026"],
  ["WI/SHAWANO", 44.7817, -88.7119, "2026"],
  ["wv/charleston", 38.3506, -81.6333, "2026"],
  ["WY/CASPER", 42.8501, -106.3251, "2026"],
];

function epaUrl(path, year) {
  const parts = String(path).split("/");
  return "https://radnet.epa.gov/cdx-radnet-rest/api/rest/csv/" + encodeURIComponent(year) +
    "/fixed/" + parts.map((p) => encodeURIComponent(p)).join("/");
}

/* The CSV's first line names its own columns, so the dose column is FOUND rather than counted to —
   RadNet's header is «DOSE EQUIVALENT RATE (nSv/h)» and the unit lives inside that header text, so
   even here the unit is read rather than assumed. Rows with a blank dose cell are ordinary: the
   monitor reported gamma counts but no dose for that hour. */
function epaHeader(lines) {
  if (lines.length < 2) return null;
  const head = lines[0].split(",");
  let di = -1;
  for (let i = 0; i < head.length; i++) if (/DOSE EQUIVALENT RATE/i.test(head[i])) { di = i; break; }
  if (di < 0) return null;
  const unitMatch = /\(([^)]*)\)/.exec(head[di]);
  return { di, unit: unitMatch ? unitMatch[1] : "nSv/h" };
}

function epaRow(cells, h) {
  const v = num(cells[h.di]);
  if (v == null) return null;
  return { at: epaTime(cells[1]), nsvh: toNanoSvH(v, h.unit), name: cells[0] };
}

function epaRows(csv) {
  const lines = String(csv == null ? "" : csv).trim().split(/\r?\n/);
  const h = epaHeader(lines);
  if (!h) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const r = epaRow(lines[i].split(","), h);
    if (r) out.push(r);
  }
  return out;
}

/* ⚠ THE LATEST VALUE IS FOUND BY WALKING BACKWARDS, AND THAT IS A CPU BOUND, NOT TIDINESS. Each file
   is a whole year at hourly resolution — measured, ~6,100 rows and 638 kB — and `latest` needs
   exactly one of them. Parsing all of them for every station in a chunk is the difference between
   scanning tens of rows and scanning tens of thousands inside one edge invocation. */
function epaLastRow(csv) {
  const lines = String(csv == null ? "" : csv).trim().split(/\r?\n/);
  const h = epaHeader(lines);
  if (!h) return null;
  for (let i = lines.length - 1; i >= 1; i--) {
    const r = epaRow(lines[i].split(","), h);
    if (r) return r;
  }
  return null;
}

/* «01/01/2026 00:47:00», with no zone. RadNet publishes collection time in the station's LOCAL time,
   which the file never names — so this keeps the wall clock the source wrote and leaves it without a
   Z rather than inventing an offset that would move every US point by hours. */
function epaTime(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(String(s == null ? "" : s).trim());
  if (!m) return null;
  return m[3] + "-" + m[1] + "-" + m[2] + "T" + m[4] + ":" + m[5] + ":" + m[6];
}

/* MEASURED 2026-09-09: a chunk of ten cost 4,778 kB and 17.9 s at concurrency 4 — inside the
   endpoint's per-request deadline but uncomfortably close to it, and the whole of that is transfer.
   Five is 2.4 MB and about 9 s, which leaves the same margin the other five providers enjoy. It also
   makes 28 chunks of the 140 files, which is what a page asking for the United States must pay. */
const EPA_CHUNK = 5;

function epaSlice(q) {
  const chunk = Math.max(0, Math.floor(Number((q && q.chunk) || 0)));
  return EPA_STATIONS.slice(chunk * EPA_CHUNK, chunk * EPA_CHUNK + EPA_CHUNK);
}

const usEpa = {
  id: "us-epa",
  name: "US EPA RadNet — fixed monitoring stations",
  country: "US",
  homepage: "https://www.epa.gov/radnet",
  attribution: "U.S. Environmental Protection Agency, RadNet",
  licence: "Public domain (work of the U.S. federal government)",
  licenceUrl: "https://www.epa.gov/radnet/radnet-csv-file-downloads",
  quantity: "H*(10)",
  unitUpstream: "nSv/h",
  kind: "hourly-mean",
  /* RadNet's per-year files start at 2006; expressed as days so one number answers every provider. */
  historyDays: 7300,
  needsProxy: true,
  latest: {
    requests: EPA_STATIONS.length,
    chunkSize: EPA_CHUNK,
    chunks: Math.ceil(EPA_STATIONS.length / EPA_CHUNK),
    contentTypeRe: /text|csv/i,
    urls(q) { return epaSlice(q).map((s) => epaUrl(s[0], s[3])); },
    parse(bodies, q) {
      const slice = epaSlice(q);
      const out = [];
      for (let i = 0; i < slice.length; i++) {
        if (bodies[i] == null) continue;
        const last = epaLastRow(bodies[i]);
        if (!last) continue;
        out.push(record({
          code: slice[i][0],
          name: last.name || slice[i][0],
          lat: slice[i][1],
          lon: slice[i][2],
          nsvh: last.nsvh,
          at: last.at,
          quantity: "H*(10)",
          kind: "hourly-mean",
        }));
      }
      return out;
    },
  },
  series: {
    requests: 1,
    contentTypeRe: /text|csv/i,
    urls(q) {
      let st = null;
      for (const s of EPA_STATIONS) if (s[0].toUpperCase() === String(q.code).toUpperCase()) { st = s; break; }
      const asked = String(q.to || "").slice(0, 4);
      const year = /^\d{4}$/.test(asked) ? asked : (st ? st[3] : "");
      return [epaUrl(st ? st[0] : q.code, year)];
    },
    parse(bodies) {
      return epaRows(bodies[0]).map((r) => ({ at: r.at, nsvh: r.nsvh }));
    },
  },
  day: null,
};

export const PROVIDERS = [deBfs, jpNra, fiStuk, hkHko, nlRivm, usEpa];

export function providerById(id) {
  for (const p of PROVIDERS) if (p.id === id) return p;
  return null;
}

/* ── THE MERGE ───────────────────────────────────────────────────────────────────────────────────
   `results` is one entry per provider that was ASKED, whether or not it answered. Two distinctions
   are load-bearing here and each costs a field rather than an inference:

     · read=false (no answer ever arrived) vs read=true with n=0 (the network answered and every
       station is offline). A page that renders "Germany: no data" for both is telling the reader the
       same thing about two different worlds.  (#R499, #R536)
     · `stations` (somebody measured this recently) vs `reference` (a published mean for a period
       that has ended). Nothing whose kind is a completed-period mean enters `stations`. */
const PERIOD_MEAN_KINDS = ["annual-mean"];

export function isPeriodMean(kind) {
  return PERIOD_MEAN_KINDS.indexOf(kind) >= 0;
}

export function mergeLatest(results) {
  const stations = [];
  const reference = [];
  const sources = [];
  for (const r of results) {
    const p = r.provider;
    const recs = r.read ? (r.records || []) : [];
    let n = 0;
    for (const rec of recs) {
      if (rec.nsvh == null) continue;
      const row = {
        c: p.id + ":" + rec.code,
        s: p.id,
        n: rec.name,
        y: rec.lat,
        x: rec.lon,
        v: Math.round(rec.nsvh * 10) / 10,
        t: rec.at,
        q: rec.quantity,
        k: rec.kind,
      };
      /* Present only when true, because it is the minority case and the wire pays per row.
         ⚠ Measured against the DEPLOYED function (2026-09-09): 720 of 7,172 rows. An earlier note
         here said 7, from a sample taken before the Japanese network's whole roster was being read;
         the number is recorded because someone will otherwise size a decision on it. It expires the
         moment a provider changes what it declares as its detectors' lower limit. */
      if (rec.below) row.b = 1;
      if (isPeriodMean(rec.kind)) reference.push(row); else stations.push(row);
      n++;
    }
    sources.push({
      id: p.id,
      name: p.name,
      country: p.country,
      attribution: p.attribution,
      licence: p.licence,
      licenceUrl: p.licenceUrl,
      url: p.homepage,
      quantity: p.quantity,
      kind: p.kind,
      asOf: p.asOf || null,
      historyDays: p.historyDays,
      chunks: (p.latest && p.latest.chunks) || 1,
      n,
      read: !!r.read,
      reason: r.reason || null,
    });
  }
  return { stations, reference, sources };
}
