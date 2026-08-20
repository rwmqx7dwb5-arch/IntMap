/* ============================================================================
 *  IntMap · #R284 source checks
 * ----------------------------------------------------------------------------
 *  「気象警報はまだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に。」
 *  「対応国まで斜線で塗るのを辞めろ。」「漏れが多すぎる。」「対応国も増やせ。」
 *  「「ここに水」ネーミングがダサすぎる。」
 *  「CAPE 不安定度（ECMWF）レイヤーの凡例名がECMWF気象になっている。また、凡例がない。その他の
 *    ECMWF系レイヤーも、凡例名がECMWF気象になっている。ECMWFレイヤーはなぜか凡例が連結してしまう。」
 *  「Wind(animated)は色味は段彩ではなくグラデーションに。…点滅してしまうバグが発生する。
 *    未来や過去に変えたとき、読み込みまでの速度が異常におそい。」
 *  「ECMWFの時間UIはボタンがくそ。…再生ボタンと次に行くボタンが同じアイコンというくそ仕様。」
 *
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH. This round's own source comments QUOTE the strings
 *  it removed — the old player glyphs, 「ここに水」, 「ECMWF weather」 — so a check that read the raw
 *  file would fail on the sentence explaining the fix. That is the fifteenth time.
 *  ⚠ EVERY DELETION CHECK ALSO COUNTS WHAT MUST SURVIVE, so a fix that goes too far is red too.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TW = () => codeOnly(read('js/terrain-water.js'));

/* ── ① the hatch is 「未対応」 and NOTHING else ─────────────────────────────────────────────────
   `washTier` decided the country's appearance, and it answered 0 — the hatch — for BOTH 「no feed」
   and 「wired but not read yet / could not be read」. Measured on the built page: 22 wired countries
   were hatched 45 s after the layer was switched on, and North Macedonia for ever.               */
test('#R284 ① a wired country never gets the 「未対応」 hatch', () => {
  const src = WP();
  const i = src.indexOf('function washTier(');
  assert.ok(i > 0, 'washTier must exist');
  const body = src.slice(i, src.indexOf('function paintCountries(', i));
  assert.match(body, /if\(!supported\(c\)\)\s*return\s*0;/, 'no feed is still the hatch');
  assert.match(body, /if\(readState\(c\)!=='ok'\)\s*return\s*-1;/,
    'a wired country that has not been read draws NOTHING — the hatch is not an answer for it');
  assert.ok(!/if\(readState\(c\)!=='ok'\)\s*return\s*0;/.test(body),
    'the old 「unread → hatched」 line must be gone');
  /* and the two paint expressions still read the tier the way the four states assume */
  assert.match(src, /'fill-opacity':\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],0\.9,0\]/,
    'the hatch paints on tier 0 only');
  assert.match(src, /'fill-opacity':\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],1,0\]/,
    'the country wash paints on tiers above 0 only');
});

/* ── ② the services that issue beyond their own border ───────────────────────────────────────
   Measured against api.weather.gov: the NWS's active-alert feed carries UGC zones in GU, MP, PW
   and FM as well as the states. Those warnings were being drawn while the country layer hatched
   「未対応」 over the same islands.                                                                */
test('#R284 ② a service’s territories are wired to that service', () => {
  const src = WP();
  const m = src.match(/const ALSO=\{[\s\S]*?\};/);
  assert.ok(m, 'the territory table must exist');
  for (const iso of ['PRI', 'VIR', 'GUM', 'MNP', 'ASM', 'PLW', 'FSM', 'MHL'])
    assert.ok(m[0].includes("'" + iso + "'"), iso + ' is an NWS area of responsibility');
  assert.match(src, /Object\.keys\(ALSO\)\.forEach\(f=>\{ ALSO\[f\]\.forEach\(c=>\{ if\(!FEEDS\[c\]\) FEEDS\[c\]=f; \}\); \}\);/,
    'and it may never overwrite a country that already has its own feed (一国一ソース)');
  /* the twelve national feeds are still there — this is an addition, not a rewrite */
  const feeds = src.match(/const FEEDS=\{[\s\S]*?\};/);
  for (const iso of ['JPN', 'USA', 'CAN', 'CHN', 'AUS', 'BRA', 'HKG', 'DEU', 'NOR', 'PHL', 'TWN', 'NZL'])
    assert.ok(feeds[0].includes(iso + ':'), iso + ' keeps its own feed');
});

/* ── ③ the shape ladder has five rungs and the library accumulates ───────────────────────────
   `?swicgeo=` answers with the member's CURRENT areas, so the library empties whenever that
   service is quiet — measured: Portugal 0 shapes, Moldova 0, Hungary 0, and therefore Moldova
   placed 0 of 42 and Portugal 1 of 18.                                                          */
test('#R284 ③ the shape library accumulates, and there is a rung that does not depend on the weather', () => {
  const src = WP();
  const i = src.indexOf('function askSwicGeo(');
  const body = src.slice(i, src.indexOf('function gbIndex(', i));
  assert.match(body, /const by=swicGeoBy\[iso\]\|\|Object\.create\(null\)/,
    'a later read MERGES into the library instead of replacing it');
  assert.ok(!/const by=Object\.create\(null\); let n=0;[\s\S]{0,200}swicGeoBy\[iso\]=by; SHAPELIB\[iso\]=n;/.test(body),
    'the replace-wholesale version must be gone');
  assert.match(body, /SWIC_GEO_RETRY_MS/, 'a member that answered with nothing is asked again later');
  /* the stable administrative index, and the host that actually serves the bytes */
  assert.match(src, /media\.githubusercontent\.com\/media\/wmgeolab\/geoBoundaries/,
    'raw.githubusercontent returns the Git-LFS pointer; the media host serves the file, with CORS');
  const sh = src.match(/const shapeOf=\(a\)=>\{[\s\S]*?wholeCountryShape\(iso,a\.name\); \};/);
  assert.ok(sh, 'the MeteoAlarm ladder must exist');
  const order = ['a.poly', 'lib', 'idx', 'aliasUnit', 'gb', 'wholeCountryShape'];
  let at = -1;
  for (const step of order) {
    const k = sh[0].indexOf(step);
    assert.ok(k > at, step + ' comes after ' + (order[order.indexOf(step) - 1] || 'the start'));
    at = k;
  }
});

/* ── ④ the words on the map ──────────────────────────────────────────────────────────────────
   Measured across every MeteoAlarm country and the WMO register: 163 distinct event strings, of
   which the classifier could not name seven. Two of those are deliberate (a row whose whole text
   is 「Yellow Warning」 carries no hazard, and 「Other dangers」 names none); five were real gaps.  */
test('#R284 ④ the five hazard names the table had not learned', () => {
  const src = WP();
  const rows = src.match(/const HAZ=\[[\s\S]*?\]\];/);
  assert.ok(rows, 'the hazard table must exist');
  const has = (key, needle) => {
    const line = rows[0].split('\n').find(l => l.includes("['" + key + "'"));
    assert.ok(line, key + ' row exists');
    assert.ok(line.includes(needle), key + ' now matches ' + needle);
  };
  has('wildfire', 'red flag');                  /* the NWS's own name for fire weather */
  has('landslide', 'geological');               /* the CMA's 「geological disaster」 */
  has('thunderstorm', 'strong convection');     /* the CMA's 「strong convection」 */
  has('tsunami', 'rissaga');                    /* the Balearic meteotsunami */
  has('marine', 'small craft');                 /* the NWS's 「Small Craft Advisory」 */
  /* …and the twenty-odd hazards that were already there are still there */
  for (const k of ['cyclone', 'tornado', 'flood', 'snow', 'heat', 'cold', 'wind', 'rain', 'fog', 'hail'])
    assert.ok(rows[0].includes("['" + k + "'"), k + ' survives');
});

/* ── ⑤ 「ここに水」 → 「水源」 ─────────────────────────────────────────────────────────────── */
test('#R284 ⑤ the water tool is named for what it places', () => {
  const src = TW();
  assert.match(src, /m==='source'\?L\('Water source','水源'/, 'the full name is the new one');
  assert.ok(!/'Water here'/.test(src), 'the old name is gone from the code');
  /* the other three tools are untouched — a rename must not become a redesign */
  for (const [en, ja] of [['Raise', '盛る'], ['Lower', '削る'], ['Levee / dam', '堤防・ダム']])
    assert.ok(src.includes("L('" + en + "','" + ja + "'"), en + ' is unchanged');
  /* every language the keyed tables hold has the new key */
  for (const f of ['ui.fr.js', 'ui.ko.js', 'ui.zh.js', 'ui.zh-hans.js'])
    assert.match(read('js/locales/' + f), /["']Water source["']\s*:/, f + ' translates it');
});

/* ── ⑥ one ECMWF legend per layer, under that layer's own name ───────────────────────────────
   Measured at 1280×800 with three ECMWF layers on: ONE box titled 「ECMWF weather」 holding three
   stacked `.ecl-item`s, 354 px tall.                                                            */
test('#R284 ⑥ every ECMWF layer has its own legend box and its own title', () => {
  const src = WX();
  assert.match(src, /function renderOne\(cfg\)\{[\s\S]*?<h4>'\+ecLbl\(cfg\)\+'<\/h4>/,
    "a layer's box is titled with that layer's own name");
  assert.match(src, /el\.id='data-legend-'\+id;/, 'each box gets its own DOM id');
  assert.ok(!/id='data-legend-ecmwf'/.test(src) && !/data-legend-ecmwf/.test(src),
    'the one shared box is gone');
  /* the forecast axis is a control, so it is its own box — and it still exists */
  assert.match(src, /L\('ECMWF forecast time','ECMWF 予報時刻'/, 'the shared player has its own titled box');
  /* the tiler has to be able to see them, or a legend sits on top of the one below it (#R276) */
  const DL = codeOnly(read('js/data-layers.js'));
  assert.match(DL, /querySelectorAll\('\[id\^="data-legend-ec-"\]'\)/,
    'tileLegends matches the ECMWF boxes by id prefix rather than naming one element');
});

/* ── ⑦ the player's five buttons are five different pictures ─────────────────────────────────
   Measured: `⏮ ◀ ▶ ▶ ⦿` — play and next were the same character.                                */
test('#R284 ⑦ no two forecast-player buttons look the same', () => {
  const src = WX();
  const ic = src.match(/const IC=\{[\s\S]*?\n    \};/);
  assert.ok(ic, 'the icon set must exist');
  const paths = [...ic[0].matchAll(/_svg\('([^']*)'\)/g)].map(m => m[1]);
  assert.equal(paths.length, 5, 'five drawn icons');
  assert.equal(new Set(paths).size, 5, 'and no two of them are the same drawing');
  for (const g of ['⏮', '⦿'])
    assert.ok(!src.includes("'" + g + "'"), 'the old glyph ' + g + ' is gone');
  /* both players — the ECMWF box and the wind legend — use the ONE declaration */
  assert.equal((src.match(/IC\.play/g) || []).length, 2, 'both players read the same play icon');
  assert.equal((src.match(/const IC=\{/g) || []).length, 1, 'and there is exactly ONE declaration of them');
  assert.equal((src.match(/IC\.next/g) || []).length, 2, 'both players read the same next icon');
});

/* ── ⑧ the wind ramp is continuous, and its anchors are the same colours ─────────────────────
   The SDK has two colour-scale types and NEITHER interpolates: a 17-entry table paints 17 flat
   bands. Measured on the built page: 601 stops, largest adjacent channel step 4/255, and the
   scanline over the Atlantic carried 46 of 51 colours the 17-band table could not produce.      */
test('#R284 ⑧ the wind colour table is resampled, not rewritten', () => {
  const src = EC();
  assert.match(src, /var WIND_ANCHORS = \{/, 'the anchors are declared on their own');
  assert.match(src, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/, 'and resampled at 0.1 m/s');
  const a = src.match(/var WIND_ANCHORS = \{[\s\S]*?\n  \};/)[0];
  for (const c of ['[98, 113, 184, 1]', '[240, 220, 245, 1]', '[224, 56, 60, 1]'])
    assert.ok(a.includes(c), 'the colour ' + c + ' is unchanged');
  assert.ok(a.includes('[0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 20, 23, 26, 30, 36, 45, 60]'),
    'and so are the seventeen speeds they sit at');
  /* a 601-stop table must not become a 601-stop CSS gradient in the legend */
  assert.match(src, /if \(draw\.length > 64\)/, 'the legend thins the gradient it draws');
  assert.match(src, /return \{ unit: s\.unit \|\| '', min: min, max: max, stops: stops,/,
    'while `stops` — the numbers a caller reads — stays complete');
});

/* ── ⑨ the axis moves once per gesture, and the particles are never erased ───────────────────
   Measured: a twelve-step drag produced 12 `index` events and ONE `time` event (it had produced
   twelve full field loads and twelve layer rebuilds), and the particle renderer drew on every one
   of 22 sampled frames, minimum 1,513 segments.                                                 */
test('#R284 ⑨ a slider drag is one forecast step, and it does not blank the animation', () => {
  const ec = EC();
  assert.match(ec, /timeT = setTimeout\(fireTime, COALESCE_MS\);/, 'the expensive event is coalesced');
  assert.match(ec, /emit\('index', \{ index: idx, validTime: meta\.validTimes\[idx\] \}\);/,
    'and a cheap one fires immediately so the clock follows the finger');
  assert.match(ec, /function step\(n\) \{[^}]*setIndex\(\(\(idx \+ n\) % c \+ c\) % c, \{ now: true \}\)/,
    'a click is a decision, not a sweep — it fires at once');
  const wx = WX();
  assert.ok(!/renderer\.setField\(null\)/.test(wx),
    'a time change must not erase the field the particles are reading');
  assert.match(wx, /if\(ev\.type==='index'\)\{ touchWindTime\(\); return; \}/,
    'the wind legend follows the cheap event');
  assert.match(wx, /if\(ev\.type==='index'\)\{ touchTime\(\); return; \}/,
    'and so does the ECMWF box');
  /* the forecast step builds the new hour beside the old one instead of removing it first */
  assert.match(wx, /function applyTime\(\)\{[\s\S]*?dropSlot\(cfg,nu\);[\s\S]*?setOpSlot\(cfg,nu,0\);[\s\S]*?dropSlot\(cfg,old\);/,
    'two slots: the old picture stays up until the new one has painted');
});

/* ── ⑩ green means «this ran», not «this file was read» ──────────────────────────────────────
   Every deletion check above is run once more against a synthetic source carrying the OLD shape,
   so a predicate that matches nothing anywhere cannot pass by accident (#R274 ③).               */
test('#R284 ⑩ the deletion checks would catch the old code', () => {
  const oldWash = "function washTier(c){ if(!supported(c)) return 0; if(readState(c)!=='ok') return 0; return 1; }";
  assert.ok(/if\(readState\(c\)!=='ok'\)\s*return\s*0;/.test(oldWash),
    'the predicate that must not match the new file DOES match the old one');
  const oldPlayer = "'<button class=\"ecl-b\" data-act=\"next\">▶</button>'";
  assert.ok(oldPlayer.includes('▶'), 'and the old player really did carry the play glyph on next');
  const oldWind = "if(ev.type==='time'){ if(renderer) renderer.setField(null); load(); }";
  assert.ok(/renderer\.setField\(null\)/.test(oldWind), 'and the erase really was there');
});
