/* ============================================================================
 *  R383 — the warnings layer, audited against WHAT THE AGENCIES ACTUALLY HAVE IN FORCE
 * ----------------------------------------------------------------------------
 *  ⚠ THE PROSE LIVES HERE AND IN DEV-NOTES.md on purpose — js/world-packs.js already carries
 *  the notes that belong beside the code, and this file is where the MEASUREMENTS are.
 *
 *  ── ① EUROPE WAS PAINTED WITH WARNINGS NOBODY WAS UNDER ─────────────────────────────
 *  MEASURED against feeds.meteoalarm.org, all 34 reachable members, one minute:
 *
 *      non-green bulletins                       2,990
 *          already EXPIRED                       2,546
 *          not yet STARTED                         327
 *          IN FORCE                                117
 *
 *      regions the relay offered                 1,158
 *          under something in force                183      ← 84.2 % over-paint
 *
 *  Austria 116 → 0 (every one a thunderstorm warning that expired on 2026-08-18, five days
 *  before it was measured), Poland 319 → 1, Switzerland 107 → 0, Czechia 25 → 0, Greece 16 → 0,
 *  Israel 33 → 2, Latvia 43 → 12, France 96 → 15, Spain 147 → 37.
 *
 *  MEASURED on production the same minute (`IntMapWorld.alerts()`): the layer drew **1,015 of
 *  those areas out of 1,811 units it was painting anywhere in the world** — i.e. 56 % of every
 *  warning on this map was a European region whose warning had been lifted or had not begun.
 *
 *  `feeds-<country>` is a ROLLING LOG of what a member has ISSUED. Every other summariser in
 *  supabase/functions/alerts-relay already knew that and tested the same field: `summariseCAP`,
 *  `summarisePAGASA` and `summariseSWIC` all drop `expires < now`. `summariseMeteoAlarm` never
 *  looked — so the part of this map with the most feeds behind it had the least truth in it.
 *
 *  ── ② 96.9 % OF THE NWS'S ALERTS WERE NEVER DRAWN ───────────────────────────────────
 *  MEASURED on `api.weather.gov/alerts/active` this round: **127 alerts in force, FOUR with a
 *  geometry.** The other 123 are filed against UGC zone codes with `geometry: null` — 6 Extreme
 *  Heat Warnings, 14 Heat Advisories, 11 Gale Warnings, 9 Air Quality Alerts, 68 Small Craft
 *  Advisories, 3 Fire Weather Watches, a Red Flag Warning. MEASURED on production the same
 *  minute: `PLACED.USA = [11, 135]`.
 *
 *  #R302 measured this at 201 of 281 (71.5 %) and wrote 「THIS DOES NOT DRAW THEM. Turning a UGC
 *  code into a shape needs the NWS zone index」, so the counter stopped lying and the map stayed
 *  blank. The share has since gone from 71.5 % to 96.9 %.
 *
 *  → the shapes come from NOAA's OWN published reference service (`nws_reference_map`): layer 8
 *  public forecast zones, 9 fire weather zones, 5 coastal marine, 6 offshore, 2 counties. It is
 *  an INDEX, exactly as Eurostat NUTS, 国土数値情報 and DataV are — what is in force, its rank and
 *  its wording still come from api.weather.gov and nowhere else.
 *  MEASURED end to end by running the SHIPPED resolver against the live services (x/nws-live.mjs
 *  in this round's worktree): 339 distinct zone codes in force, **339 of 339 resolved in 4.0 s**,
 *  572,659 B of geometry / 32,078 vertices. 116 zones at `maxAllowableOffset=0.004` weigh
 *  **80,503 B against 1,099,442 B raw**.
 *
 *  ⚠ THE KIND IS PART OF THE KEY. Fire zones and public zones share the UGC namespace — both
 *  answer to `state_zone='AK317'` — so a lookup that ignored `/zones/fire/` vs `/zones/forecast/`
 *  would hand a Red Flag Warning the public zone's outline.
 *  ⚠ AND THE BARE `geocode.UGC` LIST IS A FALLBACK, NOT A SECOND ENTRY. A fire-weather bulletin
 *  names its zones BOTH ways, so adding the UGC unconditionally produced a `z:` key beside the
 *  `f:` one — the same ground claimed twice, once as a zone the register cannot answer for.
 *  MEASURED before that line: 10 phantom keys out of 110, every one a declared fire zone.
 *
 *  ── ③ THE FRESHNESS INSTRUMENT WAS READING THE RELAY'S OWN CLOCK ────────────────────
 *  #R269 built `FEED_AT` because 「A FEED THAT STOPPED IS NOT A FEED THAT FAILED」 — a JMA endpoint
 *  frozen for eighty-three days answered 200 with valid JSON the whole time. MeteoAlarm and the
 *  WMO register were fed `fetchedAt`, which is when the RELAY read them, i.e. always now.
 *  MEASURED on production: `feedAgeH.meteoalarm = 0` while Luxembourg had published nothing for
 *  104 h, Belgium 94 h, the United Kingdom 82 h, Cyprus 78 h, Ireland 66 h.
 *
 *  ── ④ A SECOND REQUEST PER REFRESH WHOSE ANSWER COULD NEVER BE READ ─────────────────
 *  `loadDWD` fetched `dwd.de/DWD/warnungen/warnapp/json/warnings.json` alongside the WFS to get
 *  each district's Bundesland, and looked it up as `st[p.WARNCELLID]`. MEASURED against the live
 *  WFS: the property is **`GC_WARNCELLID`**, and no feature carries a bare `WARNCELLID` — so the
 *  lookup was `st['undefined']` on every row for as long as it has existed, the Bundesland never
 *  resolved, and the tap card printed the district name twice. The same response already carries
 *  **`GC_STATE`**. One request per ten-second tick, for nothing.
 *
 *  ── ⑤ TAIWAN: FOUR AGENCIES UNDER ONE NAME, AND ONE SEVERITY FOR FOUR BANDS ─────────
 *  MEASURED through the relay: the feed labelled 「CWA (Taiwan), via NCDR」 carried bulletins
 *  written by 農業部農村發展及水土保持署 ×31, 中央氣象署 ×17, 交通部公路局 ×10 and 高雄市政府 ×1.
 *  Road closures were painted at 「Extreme」 and a 「temporary car parks opened」 notice contributed
 *  45 「areas」 whose names were primary schools.
 *  And `xmlOne(cap,'event')` is the FIRST `<event>` in a file while `xmlAll(cap,'area')` is EVERY
 *  `<area>` in it, so every band of a multi-`<info>` bulletin was painted at the first band's rank:
 *  MEASURED, 降雨 came back as **286 areas all at 紅色/Extreme**; read per `<info>` it is
 *  **125 紅色 · 108 橙色 · 53 黃色**, which is what the CWA published.
 *  MEASURED after: `notHazard 15` (CAP category `Transport`), `ungraded 1` (CAP severity
 *  `Unknown`), `areaTotal 694 → 386`, and every row names the agency that wrote it.
 *
 *  ── ⑥ SILENT CAPS ──────────────────────────────────────────────────────────────────
 *  `AREA_CAP` truncates the relay's area list at 400 and the app counted `areas.length` as the
 *  denominator — so a truncated list looked like a complete one (#R320). MEASURED: Taiwan
 *  `areaTotal` 694 against `areas` 400, printed to the reader as 「286 / 400」.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(join(ROOT, p));
const WP = () => read('js/world-packs.js');
const RELAY = () => read('supabase/functions/alerts-relay/index.ts');

/* ── ① issued ≠ in force, and every summariser in the relay asks ────────────────────── */
test('R383 ① MeteoAlarm is filtered to what is IN FORCE, and the predicate is one function', () => {
  const s = RELAY();
  const code = codeOnly(s);

  assert.match(code, /function forceState\(info, sent, now\) \{/,
    'one predicate decides whether a CAP bulletin is in force');

  /* THE PREDICATE, RUN — this is a statement about the code that ships, not about a regex
     over it (#R317). It is lifted out of the file and executed. */
  const src = code.slice(code.indexOf('function forceState('));
  const body = src.slice(0, src.indexOf('\n}\n') + 3);
  const forceState = new Function('return ' + body)();
  const NOW = Date.parse('2026-08-23T18:00:00Z');
  const iso = (h) => new Date(NOW + h * 3600e3).toISOString();

  assert.equal(forceState({ expires: iso(-1) }, iso(-2), NOW), 'expired', 'a closed window is not in force');
  assert.equal(forceState({ expires: iso(+1), onset: iso(-1) }, iso(-1), NOW), 'live', 'an open window is');
  assert.equal(forceState({ expires: iso(+8), onset: iso(+4) }, iso(-1), NOW), 'upcoming', 'a window that has not opened is not');
  /* ⚠ IT FAILS OPEN, both ways — a feed that stops publishing its clock must not empty the map.
     MEASURED the same minute: `noExpires = 0` across all 34 members, so this is a guard. */
  assert.equal(forceState({}, '', NOW), 'live', 'no clock at all is not a reason to drop a warning');
  assert.equal(forceState({ expires: 'not a date' }, 'nor this', NOW), 'live', 'an unparseable clock is not a closed one');
  assert.equal(forceState({ onset: iso(-3) }, iso(-3), NOW), 'live', 'no expiry means still in force');

  /* …and it is what every summariser here uses, so the inconsistency this round found cannot
     come back one function at a time. FOUR call sites: MeteoAlarm, PAGASA, the CAP reader —
     and SWIC keeps its own `expires` test because its rows are not CAP `<info>` blocks. */
  assert.equal((code.match(/forceState\(/g) || []).length, 4,
    'the predicate is declared once and called from every summariser that reads a validity window');
  assert.match(code, /const fs = forceState\(pick, asent, now\);/, 'MeteoAlarm asks it');
  assert.match(code, /if \(Number\.isFinite\(exp\) && exp < now\) \{ expired\+\+; continue; \}/,
    'the WMO register still drops an expired bulletin');

  /* nothing is dropped silently — the counts travel with the summary (#R320) */
  assert.match(code, /expired, upcoming, noExpires, upcomingAreas: \[\.\.\.upMap\.values\(\)\]\.slice\(0, AREA_CAP\), newest \};/);
  /* a region is only 「upcoming」 when nothing is in force there NOW */
  assert.match(code, /for \(const k of areaMap\.keys\(\)\) upMap\.delete\(k\);/);
});

/* ── ② the NWS's zone-filed alerts are drawn ─────────────────────────────────────────── */
test('R383 ② the UGC zone codes are resolved against the NWS’s own reference layers', () => {
  const s = WP();
  const code = codeOnly(s);

  assert.match(code, /const NWS_REF='https:\/\/mapservices\.weather\.noaa\.gov\/static\/rest\/services\/nws_reference_maps\/nws_reference_map\/MapServer\/';/,
    'the index is NOAA’s own published reference service');
  /* the four rungs, in the order a leftover walks down them */
  assert.match(code, /nwsQuery\(9,_sIn\('state_zone',fire\.map\(nwsSZ\)\),'state_zone,name'\)/, 'fire weather zones');
  assert.match(code, /nwsQuery\(8,_sIn\('state_zone',zone\.map\(nwsSZ\)\),'state_zone,name'\)/, 'public forecast zones');
  assert.match(code, /nwsQuery\(5,_sIn\('id',zone\),'id,name'\)/, 'coastal marine zones');
  assert.match(code, /nwsQuery\(6,_sIn\('id',zone\),'id,name'\)/, 'offshore zones');
  assert.match(code, /nwsQuery\(2,where,'state,fips,countyname'\)/, 'county zones, by state + FIPS suffix');
  /* the fire layer is asked TWICE: first for the codes the bulletin declared as fire, and LAST for
     a plain zone code no other register holds (a bulletin with no `affectedZones` names its zones
     only as bare UGC, and that namespace does not say which register they are in) */
  assert.equal((code.match(/nwsQuery\(9,/g) || []).length, 2,
    'the fire-weather register is the declared rung AND the last rung');

  /* ⚠ THE KIND IS PART OF THE KEY — a fire zone and a public zone share the UGC namespace */
  assert.match(code, /const k=\(ugc\.charAt\(2\)==='C'\?'c':\(kind==='fire'\?'f':'z'\)\)\+':'\+ugc;/,
    'the lookup key carries which register layer answers for the code');

  /* the generalisation is stated rather than silent, and finer than this map’s own ADM1 index */
  const off = /const NWS_OFF=([0-9.]+);/.exec(code);
  assert.ok(off && Number(off[1]) > 0 && Number(off[1]) <= 0.005,
    'the server-side generalisation is declared and no coarser than ~550 m');

  /* the answers are kept, like every other boundary set in this file */
  assert.match(code, /const NWS_GEO_CACHE='intmap-nwszone-v1';/);
  assert.match(code, /await c\.put\('nwszone\/all',new Response\(JSON\.stringify\(\{at:Date\.now\(\),by:by\}\),/);
  assert.match(code, /await nwsGeoLoad\(\);/, 'the stored index is read before the feed is');

  /* one feature per ZONE, and the counting rule #R302 wrote survives */
  assert.match(code, /const ft=unitFeature\('USA','nws',rec\.g,'zone',rec\.n\|\|g\.ugc,g\.rows,g\.at\);/);
  assert.match(code, /PLACED\.USA=\[own\+placed,own\+placed\+noGeom\]; UNPL\.USA=noGeom\?worstNG:0;/,
    'a zone the register cannot answer for is still a shortfall and still says so');

  /* the UGC list may not re-claim ground `affectedZones` already named under another kind */
  assert.match(code, /if\(!ugcSeen\[String\(u\|\|''\)\.toUpperCase\(\)\]\) add\('',u\); \}\);/);

  /* a cold index sprints: the batches chain, and only a FAILED sweep waits (#R284's shape) */
  assert.match(code, /if\(rest\.length\) return run\(rest\); \}\);/);
  assert.match(code, /if\(Date\.now\(\)-nwsGeoFailAt<NWS_RETRY_MS\) return;/);

  /* the instrument, so 「drawn」 is a reading rather than a belief (#R344) */
  assert.match(code, /nwsZones:\{ want:nwsZoneWant, known:nwsZoneKnown,/);

  /* ⚠ A CHECK THAT CANNOT GO RED IS NOT A CHECK (#R347). The escaping in the WHERE clause is the
     one thing here a caller could get wrong invisibly, so it is EXECUTED. */
  const sq = new Function('return ' + /const _sq=\([^;]+;/.exec(code)[0].replace(/^const _sq=/, '').replace(/;$/, ''))();
  assert.equal(sq("AR074'); DROP--"), "'AR074DROP'", 'anything that is not alphanumeric is removed before it reaches the query');
  assert.equal(sq('AR074'), "'AR074'");
});

/* ── ③ the freshness instrument reads the AGENCY’s clock ─────────────────────────────── */
test('R383 ③ FEED_AT is never the relay’s own clock', () => {
  const code = codeOnly(WP());

  assert.match(code, /seenAt\('meteoalarm',d\.newest\); \} \}\);/, 'MeteoAlarm reports the newest CAP `sent` in the member’s feed');
  assert.match(code, /seenAt\('swic',d\.newest\); \} \}\);/, 'the WMO register’s per-member read does too');
  assert.match(code, /seenAt\('swic',j&&j\.newest\);/, '…and so does its scan');
  assert.match(code, /seenAt\(feed,j&&j\.newest\);/, '…and the CAP services');

  /* the defect, spelled: no feed may pass `fetchedAt` to the instrument */
  assert.equal((code.match(/seenAt\([^)]*fetchedAt/g) || []).length, 0,
    'nothing feeds the relay’s own read time to the agency-age instrument');

  /* and the relay has to supply it */
  const r = codeOnly(RELAY());
  assert.match(r, /if \(asent > newest\) newest = asent;/);
  assert.match(r, /if \(String\(pr\.sent \|\| ""\) > newestSent\) newestSent = String\(pr\.sent \|\| ""\);/);
  assert.match(r, /if \(sent > newestSent\) newestSent = sent;/);
});

/* ── ④ Germany: one response, one truth, one request ─────────────────────────────────── */
test('R383 ④ the DWD’s Bundesland comes out of the WFS that already answered', () => {
  const s = WP();
  const code = codeOnly(s);

  assert.match(code, /const adm=String\(p\.GC_STATE\|\|''\)\|\|areaN;/,
    'the state is read from the field the WFS actually publishes');
  assert.equal((code.match(/WARNCELLID/g) || []).length, 0,
    'the property that never existed is gone from the code');
  assert.equal((code.match(/dwdStates/g) || []).length, 0,
    'and so is the second request it was fetched for');
  assert.equal((code.match(/warnapp\/json\/warnings\.json/g) || []).length, 0,
    'the DWD is one request per refresh');
  /* the note that says why survives in the prose, which is where a removed thing belongs */
  assert.match(s, /GC_WARNCELLID/, 'the measurement that explains the removal is still written down');
});

/* ── ⑤ Taiwan: per <info>, per agency, and only hazard warnings ──────────────────────── */
test('R383 ⑤ a CAP bulletin is read per <info>, and a road closure is not a weather warning', () => {
  const r = RELAY();
  const code = codeOnly(r);

  assert.match(code, /function capInfos\(cap\) \{/, 'the unit of work is the <info> block');
  assert.match(code, /for \(const info of capInfos\(cap\)\) \{/);
  /* every field that varies per band is read from the band, not from the file */
  for (const f of ['event', 'severity', 'expires', 'onset', 'effective', 'headline', 'category']) {
    assert.match(code, new RegExp('xmlOne\\(info, "' + f + '"\\)'), f + ' is read from the <info> block');
  }
  assert.match(code, /for \(const a of xmlAll\(info, "area"\)\)/, 'and so are its areas');
  /* the file-level fields stay file-level */
  assert.match(code, /const sender = unesc\(xmlOne\(cap, "senderName"\)\) \|\| unesc\(xmlOne\(cap, "sender"\)\);/);

  /* what counts as a hazard is CAP's own vocabulary, not a list of Taiwanese bodies */
  assert.match(code, /const CAP_HAZARD = \/\^\(Met\|Geo\|Fire\|Env\|Health\)\$\/i;/);
  assert.match(code, /if \(cat && !CAP_HAZARD\.test\(cat\)\) \{ drop\.category\+\+; continue; \}/);
  assert.match(code, /if \(\/\^unknown\$\/i\.test\(severity\)\) \{ drop\.ungraded\+\+; continue; \}/);
  /* both are counted, so neither filter is silent */
  assert.match(code, /notHazard: drop\.category, ungraded: drop\.ungraded, indexTotal,/);
  assert.match(code, /senders: \[\.\.\.senders\.entries\(\)\]/, 'and every distinct author is reported');

  /* the label names the aggregator rather than one of the four bodies in it (#R352) */
  assert.match(code, /source: "NCDR \(Taiwan\) — CWA and the Soil & Water Conservation Agency"/);
  /* …and the app prefers the label the data carries over its own constant */
  assert.match(codeOnly(WP()), /if\(CAPFEED\[feed\]&&capRec\[feed\]&&capRec\[feed\]\.source\) return String\(capRec\[feed\]\.source\);/);
  assert.match(codeOnly(WP()), /adm:String\(e\.by\|\|\(a\.by&&a\.by\[0\]\)\|\|''\)\|\|String\(a\.name\|\|''\),/);
});

/* ── ⑥ no silent caps, and the reader is told what was read and not painted ──────────── */
test('R383 ⑥ the denominator is what the agency published, and the filtering is printed', () => {
  const code = codeOnly(WP());

  /* the three places a relay-capped list is counted — MeteoAlarm, the WMO register, the CAP feeds */
  assert.equal((code.match(/PLACED\[iso\]=\[placed,Math\.max\(\+d\.areaTotal\|\|0,\(d\.areas\|\|\[\]\)\.length\)\];/g) || []).length, 2,
    'MeteoAlarm and the WMO register both count what the service published');
  assert.match(code, /PLACED\[cfg\.iso\]=\[out\.length,Math\.max\(\+\(\(j&&j\.areaTotal\)\|\|0\),areas\.length\)\];/,
    'and so do the CAP services');
  assert.equal((code.match(/PLACED\[[a-z.]*iso[^\]]*\]=\[[a-z.]+,\(d\.areas\|\|\[\]\)\.length\]/g) || []).length, 0,
    'no country counts the truncated list as the whole of it');

  /* …and a PAGE is not a FEED either: two loaders read a bounded slice of an unbounded list */
  assert.match(code, /PLACED\.CAN=\[out\.length,Math\.max\(out\.length,caMatched-caEnded,\(j\.features\|\|\[\]\)\.length-caEnded\)\];/,
    'Canada counts what the collection says it matched, not what one page carried');
  assert.match(code, /PLACED\.CHN=\[items\.length-lost,Math\.max\(items\.length,cnTotal\)\];/,
    'and China counts the CMA’s own total, not the two pages this map read');

  /* the reader is told, per country, in words */
  assert.match(code, /function notInForceCounts\(iso3,feed\)\{/);
  assert.match(code, /h\+=notInForceLine\(iso3,feed\);/, 'the country legend prints it');
  assert.match(code, /notInForce:\(function\(\)\{ let ex=0,up=0;/, 'and the diagnostics count it');
});
