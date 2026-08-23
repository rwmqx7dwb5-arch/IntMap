/* ============================================================================
 *  #R266 — source-level checks for the round's twelve reports
 * ----------------------------------------------------------------------------
 *  These are the invariants that a later round could undo WITHOUT anything else
 *  going red: a deleted layer coming back, a retired World-Bank indicator being
 *  re-typed, the two globally-sparse facility sets losing their shipped snapshot,
 *  the alert layer losing a feed, the year picker losing its default.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';   /* (#R388) the railway data ships gzipped */

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* (#R273) the prose that records why something went is not evidence that it is still there */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const json = (p) => JSON.parse(read(p));
/* ⚠ THE CHECK MUST NOT BE ABLE TO CATCH THE NOTE THAT EXPLAINS IT. Every «X must be gone» assertion
   below names the CODE SHAPE X had — `code:'…'`, `fetch('…')`, `esc(L('…` — and not the bare string,
   because this round's own comments quote the retired strings to explain why they went:
   [[intmap-recurring-lessons]] records that shape eight times, and it caught three of these checks
   on the first run. ⚠ AND NOT BY STRIPPING COMMENTS EITHER: the first fix here was
   `read(p).replace(/\/\*…\*\//g, ' ')`, which CodeQL reads as an incomplete sanitizer
   (js/incomplete-sanitization, high) — correctly, since a comment terminator inside a string
   literal breaks it, which this very note managed to demonstrate on its first draft.
   Matching on syntax needs no sanitizer at all. */

test('R266 ①: the eight GIBS rasters named for deletion are gone from every surface', () => {
  const DEAD = ['gxtruecolor', 'gxlst', 'gxwvapor', 'gxcloud', 'gxcloudtop', 'gxlstnight', 'gxbtday', 'gxchlor'];
  const files = ['js/layer-packs.js', 'js/layer-previews.js', 'js/atlas-console.js', 'js/data-layers.js', 'scripts/static-checks.mjs'];
  for (const f of files) {
    const s = read(f);
    for (const id of DEAD) assert.ok(!read(f).includes(id), `${f} still names ${id}`);
  }
  /* …and the ones that were NOT named are still there — a deletion instruction is a list, not a sweep */
  const lp = read('js/layer-packs.js');
  /* ⚠ (#R289) `gxaero` and `gxco` LEFT THIS LIST BECAUSE THEY WERE ASKED FOR BY NAME — 「紫外線エアロゾル
     指数」「一酸化炭素 (CO)」 are deleted this round, so a check that they still exist would report a
     requested change as a regression. The list is otherwise unchanged, which is the point of it. */
  for (const id of ['gxndvi', 'gxseaice', 'gxsstanom', 'gxrelief', 'gxsoil']) {
    assert.ok(lp.includes("{id:'" + id + "'"), id + ' was deleted and nobody asked for that');
  }
});

test('R266 ②: the sea-surface-temperature ANOMALY layer explains what an anomaly is', () => {
  const s = read('js/layer-packs.js');
  const i = s.indexOf("{id:'gxsstanom'");
  assert.ok(i > 0);
  const block = s.slice(i, i + 4000);
  assert.match(block, /more:LA\(/, 'the anomaly layer carries no explanation');
  assert.match(block, /a DIFFERENCE, not a temperature/, 'the explanation does not say what an anomaly IS');
  assert.match(s, /m\.querySelector\('\.gx-more-b'\)\.textContent=_lx\(L\.more\)/, 'the legend never renders `more`');
});

test('R266 ③: no World-Bank layer points at an indicator the Bank has retired', () => {
  const s = read('js/wb-layers.js');
  /* the API answers «The indicator was not found. It may have been deleted or archived.» for both */
  for (const dead of ['SM.POP.REFG', 'SH.STA.OWAD.ZS']) {
    assert.ok(!s.includes("code:'" + dead + "'"), dead + ' is archived — the layer can only ever say 「取得できませんでした」');
  }
  assert.ok(s.includes("'SM.POP.RHCR.EA'") && s.includes("'SM.POP.RRWA.EA'"),
    'the refugee layer must sum the UNHCR and UNRWA series that replaced SM.POP.REFG');
  /* the exact duplicates are merged, not both kept */
  /* ⚠ COUNTED BY SPLITTING, NOT BY BUILDING A REGEXP. Escaping dots and not backslashes is what
     CodeQL reads as an incomplete sanitizer (js/incomplete-sanitization, high) — and it is right that
     the shape is wrong even where the input is a literal I control. A substring count needs no
     escaping at all. */
  for (const ind of ['SP.URB.TOTL.IN.ZS', 'ST.INT.ARVL']) {
    const n = s.split("code:'" + ind + "'").length - 1;
    assert.equal(n, 1, ind + ' is declared twice — that is the 「何が違うか」 report');
  }
});

test('R266 ④: every World-Bank choropleth paints ONE year, and says which', () => {
  const s = read('js/wb-layers.js');
  assert.match(s, /function wbSeries\(code\)/, 'the whole series is not fetched, so no year can be chosen');
  assert.match(s, /const wbYear=\{\}/, 'no per-layer year state');
  assert.match(s, /class="bx-year"/, 'the legend has no year picker');
  /* the default is a year, not the old mixed «latest per country» */
  assert.match(s, /wbYear\[L\.id\]!==undefined\)\?wbYear\[L\.id\]:\(\(S&&S\.best\)\|\|''\)/, 'the default is not the series default year');
  assert.match(s, /counts\[years\[i\]\]>=max\*0\.9/, 'the default year is not chosen by coverage');
  /* the second World-Bank family (js/layer-packs.js) got the same control */
  const lp = read('js/layer-packs.js');
  assert.match(lp, /const wbYr=\{\}/, 'the corruption / life-expectancy / unemployment / internet / precipitation family has no year state');
  assert.match(lp, /class="wb-year"/, '…and no picker');
  assert.match(lp, /window\.IntMapWB&&window\.IntMapWB\.series/, '…and it fetches its own series instead of sharing one');
});

test('R266 ⑤: the two globally sparse facility sets ship a global snapshot', () => {
  const s = read('js/osm-facilities.js');
  assert.match(s, /global:'data\/osm-diplo\.json'/);
  assert.match(s, /global:'data\/osm-space\.json'/);
  assert.match(s, /if\(z<SET\.zoom\) return;\s*\/\* the live query stays gated; the picture no longer is \*\//,
    'the zoom gate still blanks the layer');
  /* only these two — the other ten are dense enough that a viewport always holds some */
  assert.equal((s.match(/global:'data\/osm-/g) || []).length, 2);
  for (const [f, min] of [['data/osm-diplo.json', 10000], ['data/osm-space.json', 3000]]) {
    const j = json(f);
    assert.ok(j.count >= min, `${f} holds ${j.count}, expected at least ${min}`);
    assert.equal(j.count, j.features.length);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(j.built), f + ' does not say when it was built');
    for (const p of j.features.slice(0, 50)) {
      assert.ok(p.x >= -180 && p.x <= 180 && p.y >= -85 && p.y <= 85, 'a point is off the map');
      assert.ok(typeof p.k === 'string' && p.k.length, 'a point has no bucket');
    }
  }
  /* the diplomatic snapshot has to contain what the layer is named after */
  const d = json('data/osm-diplo.json');
  const kinds = new Set(d.features.map((f) => f.k));
  assert.ok(kinds.has('embassy') && kinds.has('consulate'), 'no embassies or consulates in the embassy layer');
  const sp = json('data/osm-space.json');
  const sk = new Set(sp.features.map((f) => f.k));
  for (const k of ['spaceport', 'pad', 'ground', 'radio']) assert.ok(sk.has(k), 'the space set has no ' + k);
});

test('R266 ⑥: the warnings layer covers the G7 and China with their own services', () => {
  const s = read('js/world-packs.js');
  /* ⚠ (#R268) THE MEMBERSHIP, NOT THE WHOLE LITERAL. #R266's four are still each on their own
     agency's feed; #R268 added Australia, Brazil and Hong Kong, and pinning the exact object made a
     LARGER table look like a regression. What this test is about is that these four countries are
     not on GDACS. */
  const feeds = /const FEEDS=\{([^}]*)\}/.exec(s);
  assert.ok(feeds, 'the national-feed table is gone');
  for (const [iso, feed] of [['JPN', 'jma'], ['USA', 'nws'], ['CAN', 'eccc'], ['CHN', 'cma']]) {
    assert.ok(feeds[1].includes(iso + ":'" + feed + "'"), iso + ' lost its own service');
  }
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table is gone');
  /* ⚠ (#R271) GERMANY LEFT THIS TABLE BECAUSE IT GAINED SOMETHING BETTER. The DWD publishes its
     warnings WITH the district polygons (maps.dwd.de, ACAO *) while MeteoAlarm relays the same
     warnings with no geometry at all — measured, 16,272 German areas and 0 polygons — so Germany is
     read from its own service and must NOT also be pulled as ten megabytes from the relay. Norway
     left for the same reason. What #R266 was about is that every G7 member is covered by a national
     service, whichever one, and that is what is asserted. */
  const feedTable = feeds[1];
  const G7 = ['JPN', 'USA', 'CAN', 'DEU', 'FRA', 'ITA', 'GBR'];
  for (const iso of G7) assert.ok(feedTable.includes(iso + ":'") || ma[1].includes(iso + ':'),
    iso + ' is covered by no national service at all');
  assert.match(s, /const MA_DEFAULT=\[/, 'the European members fetched up front must still be named');
  assert.match(s, /async function loadECCC\(\)/);
  assert.match(s, /async function loadCMA\(\)/);
  assert.match(s, /async function loadMA\(list\)/);
  /* real time, and on the way back to the foreground.
     ⚠ (#R273) 「更新が遅すぎる。リアルタイムにと言っている。」 — the interval came down again, to 30 s,
     so what is asserted is the BOUND rather than the number: a warning is a safety claim with a
     clock on it and a minute was already the second answer to that sentence. */
  const ms = /const TICK_MS=(\d+)/.exec(s);
  assert.ok(ms, 'the refresh interval must be a named constant');
  assert.ok(+ms[1] > 0 && +ms[1] <= 60000, `the interval is ${ms[1]} ms — it must be a minute or better`);
  assert.match(s, /timer=setInterval\(tick,TICK_MS\)/, '…and the timer must use it');
  assert.match(s, /addEventListener\('visibilitychange'/, 'a backgrounded tab never catches up');
  /* the slow feeds must not hold the fast ones */
  assert.ok(!/loadMA\(maAsked\)[\s\S]{0,120}\]\)/.test(s), 'MeteoAlarm is awaited inside the Promise.all again');
  /* ⚠⚠ (#R273) 「GDACSを完全に撤廃しろ。」 — the global event feed is GONE, and with it the whole
     class of defect #R266 追記 was about (an event listed under a national agency's heading,
     because `mine` carried both). One country, one national service; there is no second kind of
     row in a country's list to attribute wrongly. */
  /* ⚠ 「Xは消えたか」はXが書かれていた構文で書け (#R266's own lesson) — and the question is about the
     CODE, so the prose that records why it went is not evidence against it. */
  const code = codeOnly(s);
  for (const form of ['loadGDACS', 'gdacsapi', 'GDACSCOL', 'GDACSWASH', "'gdacs'", 'gCountries']) {
    assert.ok(!code.includes(form), 'GDACS must be gone from the layer entirely: ' + form);
  }
  assert.match(s, /const FEEDS=\{/, 'the country → service table is what covers the world now');
});

test('R266 ⑦: a tap lists administrative units, not a flat run of municipalities', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function grouped\(rows,cap\)/, 'there is no grouping renderer');
  /* every feed labels its rows with an admin-1 unit, or the grouping has nothing to group on */
  /* ⚠ (#R271) the JMA row is bucketed by its class10 region now (that is what stopped whole
     prefectures being painted), and the PREFECTURE survives as `adm` — which is what this test is
     about: the tap groups on the admin-1 unit. It is read off `pn` rather than inlined. */
  assert.match(s, /const pn=nameOf\(String\(pref\)/, 'the JMA prefecture name must still be resolved');
  assert.match(s, /adm:pn,/, 'JMA rows carry no prefecture');
  assert.match(s, /adm:st,unit:'zone'/, 'NWS rows carry no state');
  assert.match(s, /adm:p\.province\|\|''/, 'ECCC rows carry no province');
  assert.match(s, /adm:prov/, 'CMA rows carry no province');
  assert.match(s, /const CN_PROV=\{/, 'the Chinese division codes are gone, so China cannot be grouped');
  assert.ok(!/rows\.slice\(0,160\)\.map/.test(s), 'the old flat 160-row list is back');
});

test('R266 ⑧: annual precipitation is a measured field, and its grid is read from the manifest', () => {
  const s = read('js/precip-annual.js');
  assert.ok(!/const\s+(VAL_W|W)\s*=\s*\d{3,}/.test(s), 'the grid is hard-coded here instead of read from the manifest');
  assert.match(s, /fetch\(url\('data\/precip-mm\.json'\)\)/);
  assert.match(s, /fetch\(url\('data\/precip-year\.json'\)\)/);
  assert.match(s, /GE\(\)\.layers\.updateImage\(SRC/, 'the image source is repointed off-contract');

  const mm = json('data/precip-mm.json');
  assert.equal(mm.bands.length + 1, mm.colors.length, 'the bands and the colours disagree');
  assert.ok(mm.width >= 1800 && mm.height >= 900, 'the readout grid is coarser than 0.2°');
  assert.ok(/CHELSA/.test(mm.source), 'the climatology does not name its source');
  assert.ok(mm.mercator && mm.mercator.file && mm.mercator.phone, 'no picture is declared');

  const yr = json('data/precip-year.json');
  assert.ok(yr.years.length >= 30, 'fewer than thirty years to choose from');
  assert.equal(yr.years[0], 1981);
  assert.ok(/GPCC/.test(yr.source) && /DWD|Deutscher Wetterdienst/.test(yr.source));
  /* the two rasters share ONE encoding, so one decoder serves both */
  assert.equal(mm.logMax, yr.logMax);

  for (const f of ['precip_mercator_1981-2010.png', 'precip_mercator_1981-2010_4k.png', 'data/precip-mm.png', 'data/precip-year.png']) {
    const st = fs.statSync(path.join(ROOT, f));
    assert.ok(st.size > 100000, f + ' is suspiciously small');
    assert.ok(st.size < 12 * 1024 * 1024, f + ' is too heavy to ship');
  }
  /* the country-average World-Bank precipitation layer is still there — this is additive */
  const lp = read('js/layer-packs.js');
  assert.match(lp, /AG\.LND\.PRCP\.MM/);
  /* ⚠ (#R266 追記) …AND THE TWO ARE NOT BOTH CALLED «Annual precipitation». Measured on production:
     the new 1 km field and the World-Bank country average both read 「年降水量」 in the layer list —
     the very ambiguity 「人口密度レイヤは、国別とグリッドで名称の区別をつけて」 was reported about,
     reproduced by this round's own addition. */
  assert.match(lp, /precip:LA\('Annual precipitation \(by country\)'/, 'the country average does not say so');
  assert.ok(!/precip:LA\('Annual precipitation','/.test(lp), 'the two precipitation layers share a name again');
});

test('R266 ⑨: religion is split by denomination and language is not sixteen entries', () => {
  const rel = json('data/religion.json'), lang = json('data/language.json');
  assert.ok(Object.keys(rel.countries).length >= 180, 'religion covers ' + Object.keys(rel.countries).length + ' countries');
  assert.ok(Object.keys(lang.countries).length >= 180, 'language covers ' + Object.keys(lang.countries).length + ' countries');
  for (const j of [rel, lang]) assert.match(j.source, /World Factbook/);

  const tops = new Set(Object.values(rel.countries).map((r) => r.top));
  for (const k of ['catholic', 'protestant', 'orthodox']) {
    assert.ok(tops.has(k), 'no country leads with ' + k + ' — the denominations are not separated');
  }
  /* the three are genuinely apart, on the countries the report is about */
  assert.equal(rel.countries.POL.top, 'catholic');
  assert.equal(rel.countries.GRC.top, 'orthodox');
  assert.equal(rel.countries.SWE.top, 'protestant');
  /* …and where the Factbook does NOT separate them, neither does the map */
  assert.equal(rel.countries.GBR.top, 'christian_other');

  const lt = new Set(Object.values(lang.countries).map((r) => r.top));
  assert.ok(lt.size >= 60, 'only ' + lt.size + ' distinct languages lead a country (the old table had 16)');

  const s = read('js/layer-packs.js');
  assert.match(s, /file:'data\/religion\.json'/);
  assert.match(s, /file:'data\/language\.json'/);
  assert.ok(!s.includes("christian:'USA CAN MEX BRA ARG"), 'the hand-typed ISO lists are back');
});

test('R266 ⑩: the long legends fold, and the developer-facing failure text is gone', () => {
  assert.match(read('js/ocean-currents.js'), /<details class="im-more">/);
  const iw = read('js/industry-web.js');
  assert.match(iw, /<details class="im-more"/);
  assert.match(iw, /class="iw-retry"/, 'the failure gives the reader nothing to do');
  assert.ok(!iw.includes("esc(L('Nothing is drawn"), 'the developer-facing sentence is back');
  assert.match(read('css/intmap.css'), /\.im-more > summary\{/, 'the disclosure has no styling');
});

test('R266 ⑪: 1520 and 1524 are two gauges, and the three population layers are three names', () => {
  /* ⚠ (#R388) THE FINDING SURVIVED THE LAYER IT WAS WRITTEN AGAINST. #R266's claim is that 1520 mm
     and 1524 mm are two gauges and the map must draw them apart; what it checked was a colour table
     in js/layer-packs.js, a legend row, and a country list in _rail_convert.py — all three of which
     were how the OLD layer expressed it. The layer now reads OpenStreetMap's own `gauge` tag per
     track (js/rail-schema.js + js/railways.js), so the claim is re-asserted against that, and the
     DATA half is now stronger than it was: 1524 no longer comes from a hard-coded ['FIN'], it comes
     from Finnish track that says 1524. A gate outlives the mechanism it was written for. */
  const schema = read('js/rail-schema.js');
  assert.match(schema, /\['g1520', '#e03131'\]/, 'the Russian gauge has no colour of its own');
  assert.match(schema, /\['g1524', '#f08080'\]/, 'the Finnish gauge has no colour of its own');
  const layer = read('js/railways.js');
  assert.match(layer, /g1524: \(\) => LA\('Finnish 1524 mm'/, '…and no legend row');
  assert.match(layer, /g1520: \(\) => LA\('Russian 1520 mm'/);
  assert.ok(!layer.includes("'Russian 1520/1524 mm'"), 'the merged label is back');
  /* …and the two buckets cannot collapse into one */
  const bucket = /function gaugeBucket[\s\S]*?\n  \}/.exec(schema);
  assert.ok(bucket && /1520/.test(bucket[0]) && /1524/.test(bucket[0]), 'gaugeBucket stopped distinguishing them');

  const worldGz = path.resolve(ROOT, 'data/railways/world.json.gz');
  if (fs.existsSync(worldGz)) {
    const w = JSON.parse(gunzipSync(fs.readFileSync(worldGz)).toString('utf8'));
    const gi = w.k.indexOf('g');
    assert.ok(gi >= 0, 'the world file no longer ships a gauge');
    const seen = new Set();
    for (const t of w.d) if (t[gi] != null) seen.add(t[gi]);
    assert.ok(seen.has(1524), 'no line in the world is 1524 mm — Finland lost its own gauge');
    assert.ok(seen.has(1520), 'the 1520 mm class was emptied');
  }

  /* one is a 1 km grid, one is a country average, one is the World Bank's country average */
  const en = read('js/locales/ui.en.js');
  assert.match(en, /lyrPop:"Population density \(by country\)"/);
  assert.match(en, /lyrPopGrid:"Population density \(1 km grid\)"/);
  assert.match(read('js/wb-layers.js'), /Population density \/km² \(World Bank\)/);
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const t = read('js/locales/ui.' + c + '.js');
    const m = /["']?lyrPop["']?\s*:\s*"([^"]*)"/.exec(t);
    assert.ok(m, c + ' lost lyrPop');
    const grid = /["']?lyrPopGrid["']?\s*:\s*"([^"]*)"/.exec(t);
    assert.ok(grid && m[1] !== grid[1], c + ' calls the country layer and the grid layer the same thing');
  }
});

test('R266 ⑫: the satellite layer has no second way to be showing fewer objects', () => {
  const sl = read('js/satellites-live.js');
  assert.ok(!/setVisibleOnly/.test(sl), 'the filter API is back');
  assert.ok(!/let visibleOnly/.test(sl), 'the filter state is back');
  assert.match(sl, /function shown\(\)\{ return fixes; \}/, '`shown()` filters again');
  assert.ok(!/gl-satvis/.test(read('js/data-layers.js')), 'the checkbox is back in the legend');
  /* the per-satellite geometry is NOT what was removed */
  assert.match(sl, /function lookFrom\(/);
  assert.match(sl, /nextPass/);
});

test('R266 ⑬: the auto-rotate row is named the same thing in all nine languages', () => {
  const s = read('js/layer-packs.js');
  assert.match(s, /spin:LA\('Auto-rotate','自動回転'/);
  assert.ok(!s.includes("LA('Globe tour (slow spin)'"));
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) {
    const t = read('js/locales/ui.' + c + '.js');
    assert.match(t, /"Auto-rotate":/, 'ui.' + c + '.js has no entry for the new name');
    assert.ok(!/"Globe tour \(slow spin\)":/.test(t), 'ui.' + c + '.js still carries the old key');
  }
});

test('R266 ⑭: the alert relay is an allow-list, not an open proxy', () => {
  const s = read('supabase/functions/alerts-relay/index.ts');
  assert.match(s, /h === "feeds\.meteoalarm\.org"/);
  assert.match(s, /h === "www\.nmc\.cn"/);
  assert.match(s, /return null;\s*\n\}/, 'the allow-list falls through to something other than a refusal');
  /* ⚠ THE HEADER IS STILL SENT; IT IS DECLARED IN ONE PLACE NOW. The four keyless relays share
     _shared/relay-guard.js (allow-list bounds, deadline, byte ceiling, generic errors), and the CORS
     object came with them — a literal grep in this file could only ever find a copy. */
  assert.match(s, /corsFor\(/, 'the relay does not build its CORS headers from the shared guard');
  assert.match(read('supabase/functions/_shared/relay-guard.js'), /"Access-Control-Allow-Origin": "\*"/);
  /* ⚠ (#R297) the number moved (60 → 30 s, for 「更新が遅すぎる」) and the PROPERTY did not: a
     warning is cached for SECONDS, never minutes, and `tests/r288 ④` ties the app's rotation floor
     to whatever this is. */
  const smax = +(/s-maxage=(\d+)/.exec(s) || [])[1];
  assert.ok(smax > 0 && smax <= 60, `a warning must not be cached for minutes (s-maxage=${smax})`);
  /* Canada sends its own ACAO — a relay that is not needed is another thing to be down */
  assert.ok(!/api\.weather\.gc\.ca/.test(s.slice(s.indexOf('function allowed'), s.indexOf('Deno.serve'))),
    'Canada is being relayed even though it sends ACAO');
  assert.match(read('js/world-packs.js'), /fetch\('https:\/\/api\.weather\.gc\.ca/);
});
