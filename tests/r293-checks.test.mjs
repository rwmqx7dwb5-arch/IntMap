/* ============================================================================
 *  IntMap · #R293 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round's report, in one paragraph, so a reader of this file knows what it is guarding:
 *
 *    Six of the sentences this round answers had been answered before, and every one of them
 *    turned out to be a DIFFERENT SURFACE of the same complaint — the shape [[intmap-recurring-
 *    lessons]] calls 「再送は『自分の診断が違った』から始めろ」. So nothing here was written from the
 *    text of the request; every test below pins something that was MEASURED on production first:
 *
 *      · 「警報レイヤーが重すぎる」 — the steady state was already 60 fps (frame p50 16.7 ms, the same
 *        as with the layer off). The page froze for 7,597 ms while it parsed boundary sets it was
 *        downloading TWICE: 23.07 MB of per-country geoBoundaries beside the 2.27 MB world index
 *        #R290 shipped to make those unnecessary. → ADM2 only after ADM1 leaves something unplaced,
 *        one concurrency gate, and Cache Storage. Longest task 1,240 ms; second visit pays nothing.
 *      · 「Chronosポップアップの『過去表示中』」 — #R290 taught the COLLAPSED button to read the
 *        instant. The badge INSIDE the panel is a different element and still said 「過去」 for a
 *        future instant. Measured: both in the same frame, disagreeing.
 *      · 「地図中心の標準時、機能していない」 — third round, third cause. The accessor works; the only
 *        caller of `ensure()` was the <select>'s change handler, so a preference RESTORED from
 *        localStorage never fetched the data and fell silently to the device clock.
 *      · 「透明度100%は全然100%ではない」 — measured, both weather layers ARE fully opaque at 100 %
 *        (identical pixels over a light and a dark basemap). What was false was the WORD: the same
 *        control is 「Opacity」 in en/de/es/fr/ko/zh and was 「透明度」 / 「Прозрачность」 — the
 *        opposite quantity — in ja and ru.
 *      · 「Windyと完全に同じ風速と色の対応に」 — the shipped table borrowed Windy's breakpoints and
 *        invented the colours; measured divergence up to 133/255. And windy.com's own `RGBA()` does
 *        not equal a linear interpolation of its declared gradient (#R288's finding, again).
 *      · 「日本の特別警報の凡例だけ図形の形が違う」 — nothing chose a different shape. Every swatch
 *        carried a border, and a border's contrast is against the FILL: the JMA's #0c000c is the
 *        only chip darker than that grey, so it alone read as a ring. (And the panel held three
 *        swatch sizes for one idea.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped before every claim about code — this project has now written a test
   that matched its own explanation nineteen times (see #R288 ⑪ this round for the twentieth). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ① 「IntMap独自階級は、灰色、黄色、赤色、紫色、黒にしろ」 ─────────────────────────────────
   Five names for the five rows this key has always had: the four ranks plus 「発令なし」. */
test('R293 ① the normalised ladder is grey · yellow · red · purple · black', () => {
  const s = WP();
  const m = /const PAL_NORM=\{([^}]*)\};/.exec(s);
  assert.ok(m, 'PAL_NORM must be one literal');
  const pal = {};
  for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) pal[e[1]] = e[2];
  assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4'], 'four ranks, as before');

  /* the NAMES are the claim, so they are computed rather than trusted: hue and lightness decide
     whether a colour is yellow, red, purple or black, not the constant it is stored in */
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hsl = (c) => {
    const [r, g, b] = c.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    return { h, s: mx ? d / mx : 0, l: (mx + mn) / 2 };
  };
  const y = hsl(hex(pal['1'])), r = hsl(hex(pal['2'])), p = hsl(hex(pal['3'])), k = hsl(hex(pal['4']));
  assert.ok(y.h >= 40 && y.h <= 70 && y.s > 0.7, `rank 1 must be YELLOW — ${pal['1']} is hue ${y.h.toFixed(0)}`);
  assert.ok((r.h <= 20 || r.h >= 345) && r.s > 0.7, `rank 2 must be RED — ${pal['2']} is hue ${r.h.toFixed(0)}`);
  assert.ok(p.h >= 265 && p.h <= 320 && p.s > 0.4, `rank 3 must be PURPLE — ${pal['3']} is hue ${p.h.toFixed(0)}`);
  assert.ok(k.l < 0.12, `rank 4 must be BLACK — ${pal['4']} has lightness ${k.l.toFixed(2)}`);
  /* …and the fifth row is the one that was already there: grey, meaning 「読んだ。何も出ていない」 */
  const none = /const NONE_COL='(#[0-9a-f]{6})';/.exec(s);
  assert.ok(none, 'the 「発令なし」 grey is declared once');
  const g = hsl(hex(none[1]));
  assert.ok(g.s < 0.12 && g.l > 0.6, `「発令なし」 must be a light GREY — ${none[1]}`);
  /* 「灰色塗の色味は少しだけ白に近づけろ」 — measurably lighter than the JMA's #c8c8cb it replaces */
  assert.ok(hex(none[1])[0] > 0xc8, 'and lighter than the #c8c8cb it replaces');
  assert.match(s, /const QUIET_COL='rgba\(\d+,\d+,\d+,0\.42\)';/, 'the unit grey is declared once');
  assert.equal((s.match(/rgba\(\d+,\d+,\d+,0\.42\)/g) || []).length, 1,
    'and the country-wide sheet names that declaration rather than copying its literal');
});

/* ── ② 「斜線塗をもっと見やすい感じに」「斜線塗がなんなのか分かるように、凡例に追加しろ」 ────── */
test('R293 ② the hatch is a haloed line, and the legend swatch is the same tile', () => {
  const s = WP();
  const i = s.indexOf('function hatchCanvas(');
  assert.ok(i > 0, 'the tile is built in one place');
  const body = s.slice(i, s.indexOf('let _hatchURL', i));
  assert.match(body, /g\.clearRect\(0,0,S,S\);/, 'it still starts transparent (#R290)');
  assert.ok(!/fillRect/.test(body), 'and nothing fills it — that was #R290’s defect');
  assert.match(body, /g\.strokeStyle=HATCH_HALO;[\s\S]{0,120}g\.strokeStyle=HATCH_LINE;/,
    'the halo is drawn UNDER the line, so the diagonal reads on any basemap');
  /* the halo is wider than the line it backs, or it is not a halo */
  const hw = /const HATCH_S=(\d+(?:\.\d+)?), HATCH_HW=(\d+(?:\.\d+)?), HATCH_LW=(\d+(?:\.\d+)?);/.exec(s);
  assert.ok(hw, 'the three numbers are declared together');
  assert.ok(+hw[2] > +hw[3], 'the halo is wider than the line');
  /* …and the GAPS survive: the covered fraction of the tile is well under half of it, which is
     what keeps 「未対応」 from wearing 「発令なし」’s appearance underneath (#R290) */
  const period = +hw[1] / Math.SQRT2;
  assert.ok(+hw[2] / period < 0.45, `the diagonals cover ${(100 * hw[2] / period).toFixed(0)} % of the tile`);

  /* ONE declaration, two surfaces — the legend swatch is a picture of the tile the map draws */
  assert.match(s, /const hatchSwatch=\(px\)=>\{[\s\S]{0,200}hatchCanvas\(\)\.toDataURL\(\)/,
    'the swatch is rendered from the same canvas');
  assert.ok(!/repeating-linear-gradient/.test(s),
    'and there is no hand-written pattern beside it to drift (there were two)');
  /* 「凡例に追加しろ」 — the hatch is a ROW of the world key, in both palette modes */
  assert.match(s, /const HATCH_ROW=\(\)=>\[HATCH_KEY,L\('Not covered, or not read yet/,
    'the hatch is named in the key');
  assert.equal((s.match(/HATCH_ROW\(\)/g) || []).length, 2,
    'and it appears in BOTH modes — the agency key and the IntMap key');
});

/* ── ③ 「日本の特別警報の凡例だけ、図形の形が違うのを辞めろ」 ───────────────────────────────
   The delimiter is OUTSIDE the chip, so its contrast is against the panel (the same for every row)
   rather than against the fill (which is what singled out the only chip darker than it). */
test('R293 ③ every severity swatch is one shape, one size, one delimiter', () => {
  const s = WP();
  assert.match(s, /const SW_PX=12;/, 'one size for every colour key');
  assert.match(s, /const swatchStyle=\(col,px\)=>[\s\S]{0,200}box-shadow:0 0 0 1px/,
    'the delimiter is a spread shadow OUTSIDE the chip');
  assert.ok(!/border:1px solid rgba\(128,128,128,0\.35\);"><\/span>/.test(s),
    'no swatch is outlined with a border any more');
  /* every swatch in the layer goes through the one builder — hard-coded width/height are gone */
  assert.ok(!/<span style="width:10px;height:10px;border-radius:3px/.test(s), 'no 10 px chip');
  assert.ok(!/<span style="width:14px;height:14px;border-radius:3px/.test(s), 'no 14 px chip');
  assert.ok(!/<span style="width:12px;height:12px;border-radius:3px/.test(s), 'no inline 12 px chip');
});

/* ── ④ 「ポップアップがでかすぎるからコンパクトに」「いつ発表の情報か、IntMapがいつ取得したかも」 ── */
test('R293 ④ the point card is compact and prints both clocks', () => {
  const s = WP();
  /* the biggest single thing in the card was the agency's full rank key, repeated from the legend */
  const i = s.indexOf('function pointBody(');
  const body = s.slice(i, s.indexOf('function openPointCard(', i));
  assert.ok(!/agencyKey\(feed\)/.test(body), 'the rank key is no longer repeated inside the card');
  assert.match(body, /hits\.slice\(0,6\)/, 'six warnings, not twelve');
  /* one padding, not two: `.country-popup` already has 18/22 px of its own */
  assert.match(s, /el\.style\.width='min\(316px,92vw\)'; el\.style\.padding='0';/,
    'the shell’s own padding is cleared and the width narrowed');

  /* TWO clocks, and they are different questions — #R269 is the round that paid for confusing them */
  assert.match(s, /const FEED_GOT=\{\};/, 'when THIS browser read the feed');
  /* ⚠ (#R298) …and the PANEL's 「Updated」 is written by the same setter now. It used to be written
     in one place only — the base sweep — so every rotated feed (MeteoAlarm, the WMO register, the
     CMA, the CAP providers) landed without touching it. MEASURED on production: 「Updated 0:56:52」
     at 01:05 and still 「Updated 0:56:52」 at 01:14, across ninety successful reads. */
  assert.match(s, /const feedOK=\(k\)=>\{ FEED_STATE\[k\]='ok'; FEED_GOT\[k\]=Date\.now\(\); lastAt=FEED_GOT\[k\]; \};/,
    'one setter writes the state, the read time and the panel’s own clock together');
  assert.ok(!/FEED_STATE\.[a-z]+='ok'/.test(s), 'no loader writes only half of it');
  assert.match(s, /function stampLine\(pr\)\{/, 'the card has one line for both');
  assert.match(s, /L\('issued','発表'/, '…the agency’s own issue time');
  assert.match(s, /L\('IntMap read','IntMap取得'/, '…and IntMap’s');
  assert.match(s, /const issued=stampAt\(pr\.at\)\|\|stampAt\(FEED_AT\[pr\.feed\]\);/,
    'the issue time falls back to the feed’s own clock, never to the fetch time');
  assert.match(s, /\(issued\|\|'—'\)/, 'and an unknown time prints a dash rather than a lie');

  /* the feature carries both, and the relay supplies the issue time it never used to send */
  assert.match(s, /function unitFeature\(iso,feed,geometry,unit,name,rows,at,got\)\{/);
  assert.match(s, /at:String\(at\|\|''\), got:String\(got\|\|''\),/);
  const r = read('supabase/functions/alerts-relay/index.ts');
  assert.match(r, /const st = String\(\(w\?\.alert\?\.sent\) \|\| pick\.onset \|\| pick\.effective \|\| ""\);/,
    'MeteoAlarm areas now carry the CAP bulletin’s own `sent`');
  /* two CAP services gained it this round; the WMO register already tracked its own `sent`, which
     is why the count is taken over the ones this round added rather than over every occurrence */
  assert.equal((r.match(/if \(sent > b\.sent\) b\.sent = sent; +\/\* \(#R293\)/g) || []).length, 2,
    '…and so do both CAP services');
  assert.equal((r.match(/if \(sent > b\.sent\) b\.sent = sent;/g) || []).length, 3,
    '…and the WMO register still does');
});

/* ── ⑤ 「警報レイヤーが重すぎる。品質保ったまま爆速にしろ」 ──────────────────────────────────
   MEASURED (production R292 → this build, same instrument, 75–80 s):
     longest main-thread task  7,597 ms → 1,240 ms
     geoBoundaries, cold        23.07 MB / 30 requests → 18.03 MB / 22
     geoBoundaries, second visit                       → 0.00 MB / 1
   The quality is preserved BY CONSTRUCTION: the only download that is skipped is one whose input
   condition is 「there was nothing left for it to place」.                                        */
test('R293 ⑤ boundary sets are cached, gated, and ADM2 is earned rather than assumed', () => {
  const s = WP();
  /* ① ADM2 waits for ADM1 to have been tried AND to have left something unplaced */
  assert.match(s, /function stillMissing\(iso\)\{ const p=PLACED\[iso\]; return p\?Math\.max\(0,p\[1\]-p\[0\]\):1; \}/);
  const i = s.indexOf('function askGB(iso)');
  const gb = s.slice(i, s.indexOf('const MA_ALIAS', i));
  assert.match(gb, /gbIndex\(iso,'ADM1'\)/, 'ADM1 first');
  assert.match(gb, /if\(!stillMissing\(iso\)\) return null;[\s\S]{0,120}gbIndex\(iso,'ADM2'\)/,
    'and ADM2 only when ADM1 left something unplaced');
  /* ② one concurrency gate for every geoBoundaries request, not one per caller */
  assert.match(gb, /if\(gbInflight>=GB_MAX\) return;/, 'the placement loader is gated');
  assert.match(s, /const GB_MAX=2;/, 'and the gate is one number');
  assert.equal((s.match(/gbInflight\+\+/g) || []).length, 2, 'both callers take from the same budget');
  /* ③ boundaries are cached — they are not news */
  assert.match(s, /const BND_CACHE='intmap-bnd-v1';/);
  assert.match(s, /async function bndJSON\(u\)\{ const hit=await bndCached\(u\); if\(hit\) return hit;/);
  /* ⚠ (#R297) the Eurostat urls are built from a base constant now (a finer generalisation was
     added for 「境界線解像度が低すぎる」, and two literals would have been two places to change), so
     the needle is that constant. Everything else is unchanged. */
  for (const u of ['class10s.json', 'JP_MUNI_URL', 'ne_50m_admin_1', 'NUTS_BASE+', 'cnUrl'])
    assert.ok(new RegExp('bndJSON\\((?:\'[^\']*)?' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s),
      u + ' is fetched through the cache');
  assert.match(s, /const NUTS_BASE='https:\/\/gisco-services\.ec\.europa\.eu[^']*';/,
    'and that base is the Eurostat distribution');
  assert.match(s, /NUTS_RG_20M_2021_4326_LEVL_3\.geojson/, '…still holding the floor generalisation');
  /* ⚠ a WARNING is never cached — only the shapes it is drawn on */
  assert.ok(!/bndJSON\(relay\(/.test(s), 'no live warning feed goes through the boundary cache');
  assert.ok(!/bndJSON\([^)]*swic/.test(s), '…including the register’s own shapes, which are today’s');
});

/* ── ⑥ 「境界線解像度が低すぎる」 ────────────────────────────────────────────────────────────
   The bundled world index (#R290) is Douglas–Peucker 0.01° — invisible at the zoom it exists for
   and exactly what a reader sees when they zoom to a coastline. It cannot be made finer without
   making the overview unaffordable, so it is a FLOOR: above UNIT_HIRES_Z a country that is on
   screen and still drawn from it is upgraded to its own published boundary set.                  */
test('R293 ⑥ the bundled world index is a floor, upgraded per country when it can be seen', () => {
  const s = WP();
  assert.match(s, /const UNIT_SRC=Object\.create\(null\);/, 'which index a country came from is recorded');
  /* ⚠ (#R298) the VALUE moved (5 → 4, 「境界線解像度が低すぎる」) and the PROPERTY did not: there is
     one zoom at which a country stops being drawn from the bundled index, and the upgrade pass
     reads that same constant. Pinning the number again would only pin the number. */
  assert.match(s, /const UNIT_HIRES_Z=\d+;/);
  assert.match(s, /if\(!\(z>=UNIT_HIRES_Z\)\) return;/, 'and the upgrade pass reads it');
  assert.match(s, /const COARSE=\/\^\(world\|ne50\)\$\/;/, 'and which of them are the coarse ones');
  /* every producer labels what it produced, or the upgrade cannot know what to upgrade */
  for (const src of ['jp', 'cn', 'tw', 'nuts', 'ne50', 'world', 'gb'])
    assert.ok(new RegExp("setUnits\\([^;]*,'" + src + "'\\)").test(s), src + ' labels its units');
  assert.match(s, /function upgradeUnitsInView\(\)\{[\s\S]{0,400}COARSE\.test\(UNIT_SRC\[c\]\|\|''\)/);
  assert.match(s, /if\(!inView\(f\)\) return;[\s\S]{0,80}askUnitsGB\(c\);/,
    'only for a country the reader is actually looking at');
  assert.match(s, /askUnitsInView[\s\S]{0,600}upgradeUnitsInView\(\);/,
    'and it runs on the same view pass the loader already had');
});

/* ── ⑦ 「Chronosの地図中心の標準時にする機能、機能していない」 — the third cause ─────────────── */
test('R293 ⑦ the map-centre clock asks for its data from BOTH doors, and follows the camera', () => {
  const t = TL();
  assert.match(t, /function zoneEnsure\(n\)\{ if\(zone!=='map'\) return;/, 'asking is a function');
  /* ⚠⚠⚠ (#R293 追記) …AND IT WAITS FOR ITS OWNER. js/app-body.js calls this module at line 3041 and
     publishes the accessor at 4296, so at init `window.IntMapTimeZones` does not exist yet — the
     first version of this fix guarded with `TZ&&TZ.ensure` and thereby became a SECOND silent
     fallback in the same place as the first (measured on the deployed build: ready() false, the
     device clock shown for a map centred on New York). */
  assert.match(t, /if\(!TZ\|\|!TZ\.ensure\)\{ if\(\(n\|0\)<60\) setTimeout\(\(\)=>zoneEnsure\(\(n\|0\)\+1\),200\); return; \}/,
    'and it polls for the owner rather than giving up silently');
  assert.match(t, /TZ\.ensure\(\)\.then\(\(\)=>\{ try\{ refreshUI/, '…and it re-renders when the data lands');
  /* the two doors: the reader choosing it, and a preference restored from localStorage */
  /* the change handler and boot both call it; the retry ladder calls itself with a counter */
  assert.equal((t.match(/zoneEnsure\(\)/g) || []).length, 2,
    'TWO callers — the change handler and boot');
  assert.equal((t.match(/zoneEnsure\(/g) || []).length, 4,
    '…one declaration, two callers, and the retry');
  assert.match(t, /tl\.classList\.add\('collapsed'\); localizeChrome\(\); applyMode\('year'\);\s*zoneEnsure\(\);/,
    'a restored preference fires no change event, so boot has to ask');
  /* 「地図中心の」 is a claim about where the camera IS */
  assert.match(t, /E\.events\.on\('moveend',\(\)=>\{ try\{ if\(zone==='map'/,
    'and the answer follows the camera');
});

/* ── ⑧ 「時刻と予報タブを分けるな」/「Chronosで時間を変更したら…すべての要素を合わせる」 ────── */
test('R293 ⑧ Chronos has one time tab, and the clock drives the weather', () => {
  const t = TL();
  assert.ok(!/ntl-mode-fc/.test(t), 'no fourth tab');
  assert.ok(!/mode==='forecast'/.test(t), '…and no fourth mode');
  assert.ok(!/id="ntl-mode-fc"/.test(read('index.html')), '…nor its markup');
  assert.match(t, /if\(mode!=='time'\|\|!fcReady\(\)\)\{ fcStop\(\); playerEl\.style\.display='none'/,
    'the transport lives inside the Time tab');
  /* the transport moves the CLOCK — that is what makes it one control rather than two */
  assert.match(t, /function fcGo\(i\)\{[\s\S]{0,220}window\.IntMapTime\.set\(new Date\(t\),\{allowFuture:true,source:'ui'\}\);/);
  assert.ok(!/E2\.setIndex\(/.test(t), 'and it never writes the model’s index behind the clock’s back');
  /* the date picker can reach where the clock can now go */
  assert.match(t, /function fcMaxISO\(\)\{/);
  assert.match(t, /datePicker\.max=fcMaxISO\(\);/);

  /* the pull is wired; the push is still cut (#R290's half of the instruction stands) */
  const e = EC();
  assert.match(e, /C\.on\(function\(e\)\{ try\{ _followClock\(e\); \}/, 'the master clock drives the axis');
  assert.match(e, /function _pushClock\(\) \{\}/, 'a forecast step still writes nothing back');
  assert.match(e, /if \(!covers\(ms\)\) return;/, 'travelling to 1972 is not a request for a forecast');
});

/* ── ⑨ 「気温レイヤーで、MERRA-2 再解析は削除」 ──────────────────────────────────────────── */
test('R293 ⑨ the reanalysis source is gone, and so is everything that only served it', () => {
  const w = WX();
  assert.ok(!/merra2|MERRA/.test(w), 'no branch of the weather module mentions it');
  assert.ok(!/srcOf\(/.test(w), 'the source resolver is gone with the second source');
  assert.ok(!existsSync(resolve(ROOT, 'js/wx-reanalysis.js')), 'the module is deleted');
  assert.ok(!/wx-reanalysis/.test(codeOnly(read('src/main.js'))), 'and not imported');
  /* what must SURVIVE: the layer, its ramp and its clock */
  assert.match(w, /id:'ec-temp',\s*variable:'temperature_2m'/);
  assert.match(w, /window\.IntMapWxPlayer\.timeUI\('ec-time-'\+cfg\.id,EC\(\),L\)/);
});

/* ── ⑩ 「Windyと完全に同じ風速と色の対応に…高風速帯でも同じになるように」 ──────────────────
   The table below is windy.com's own paint function, sampled every 0.1 m/s through `RGBA()` and
   fitted to the smallest set of stops that reproduces it — 27 stops, worst channel error 3/255.
   The four rows are readings taken from windy.com the day this was written; they are what makes
   this a comparison rather than a restatement of the file.                                       */
test('R293 ⑩ the wind ramp reproduces windy.com’s own, high speeds included', () => {
  const s = EC();
  const a = s.indexOf('var WIND_ANCHORS'), b = s.indexOf('var WINDY_WIND');
  assert.ok(a > 0 && b > a);
  const block = s.slice(a, b);
  const bp = JSON.parse(block.match(/breakpoints:\s*(\[[^\]]*\])/)[1]);
  const cols = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*1\s*\]/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  assert.equal(bp.length, cols.length, 'one colour per breakpoint');
  assert.equal(bp[0], 0);
  assert.equal(bp[bp.length - 1], 104, 'windy.com’s table ends at 104 m/s, and so does this one');
  for (let i = 1; i < bp.length; i++) assert.ok(bp[i] > bp[i - 1], 'breakpoints increase');

  const at = (v) => {
    if (v <= bp[0]) return cols[0];
    if (v >= bp[bp.length - 1]) return cols[cols.length - 1];
    for (let i = 0; i < bp.length - 1; i++) if (v >= bp[i] && v <= bp[i + 1]) {
      const f = (v - bp[i]) / (bp[i + 1] - bp[i]);
      return [0, 1, 2].map((k) => Math.round(cols[i][k] + (cols[i + 1][k] - cols[i][k]) * f));
    }
    return cols[cols.length - 1];
  };
  /* READINGS FROM windy.com — `W.colors.wind.RGBA(v)`, the function its map is painted through */
  const WINDY = [[0, [98, 113, 184]], [5, [77, 142, 124]], [15, [162, 109, 92]],
    [25, [95, 100, 160]], [60, [215, 209, 128]], [104, [129, 129, 129]]];
  for (const [v, want] of WINDY) {
    const got = at(v);
    const d = Math.max(...[0, 1, 2].map((k) => Math.abs(got[k] - want[k])));
    assert.ok(d <= 3, `${v} m/s: ${got} against windy.com’s ${want} — ${d}/255 apart`);
  }
  /* the high band is the half that was furthest off, so it is asserted as a DIFFERENCE from what
     was there before: [214,202,60] at 15 m/s and [240,220,245] at the top */
  assert.ok(Math.max(...[0, 1, 2].map((k) => Math.abs(at(15)[k] - [214, 202, 60][k]))) > 50,
    '15 m/s is no longer the yellow it was');
  assert.ok(!block.includes('[240, 220, 245, 1]'), 'and the scale no longer saturates to near-white');
  /* it is still a gradient rather than a staircase (#R284) */
  assert.match(s, /var WINDY_WIND = rampFrom\(WIND_ANCHORS, 0\.1\);/);
  /* …and OPAQUE: measured on windy.com, alpha is 255 at every speed — there is no calm-air hole */
  assert.ok(cols.length && !/,\s*0(\.\d+)?\s*\]/.test(block), 'every entry is fully opaque');
});

/* ── ⑪ 「透明度100%は、全然透明度100%ではない」 — the word, not the number ────────────────────
   MEASURED: at 100 % both weather layers ARE fully opaque (the same pixels over a light and a dark
   basemap, worst channel difference 1/255). So the slider is right and the label was not: the same
   control read 「Opacity」 in en/de/es/fr/ko/zh and 「透明度」/「Прозрачность」 — the OPPOSITE
   quantity — in ja and ru, where 100 % would mean invisible.                                      */
test('R293 ⑪ the opacity control is called opacity in every language', () => {
  const files = ['js/data-layers.js', 'js/atlas-console.js', 'js/atlas-controls.js', 'js/weather.js'];
  for (const f of files) {
    const s = codeOnly(read(f));
    /* every tuple whose English member is about opacity */
    for (const m of s.matchAll(/'(Opacity|opacity|opacity: |No opacity control: )','([^']*)','([^']*)','([^']*)','([^']*)'/g)) {
      assert.ok(!/透明度/.test(m[2]) || /不透明度/.test(m[2]),
        `${f}: the Japanese for 「${m[1]}」 is 「${m[2]}」 — 透明度 is the opposite quantity`);
      assert.ok(!/^[Пп]розрачность/.test(m[4]),
        `${f}: the Russian for 「${m[1]}」 is 「${m[4]}」 — прозрачность is the opposite quantity`);
    }
  }
  /* the keyed languages already had it right, and must stay right */
  for (const [lg, want] of [['fr', 'Opacité'], ['ko', '불투명도'], ['zh', '不透明度'], ['zh-hans', '不透明度']]) {
    const s = read('js/locales/ui.' + lg + '.js');
    /* the tables use either quote style, so the KEY is matched rather than one spelling of it */
    assert.match(s, new RegExp('[\'"]Opacity[\'"]:\\s*["\']' + want), lg + ' says opacity');
  }
  /* and the slider really is an opacity: 1 paints, 0 hides */
  assert.match(DL(), /GE\(\)\.layers\.setPaint\(lid,p,\(p==='hillshade-exaggeration'\)\?Math\.max\(0\.05,v\):v\);/,
    'the value is written straight to the paint property, so 1 is opaque');
});

/* ── ⑫ 「タイムスライダーをつけろ」 — and 「データのない時間を選べない」 still holds ───────────── */
test('R293 ⑫ the weather time control is a slider over the model’s own steps', () => {
  const w = WX();
  assert.match(w, /<input type="range" class="ecl-timerange"[\s\S]{0,140}step="1"/,
    'the range steps over the INDEX, so every reachable position is a published valid time');
  assert.match(w, /max="'\+Math\.max\(0,n-1\)\+'"/, '…and it cannot leave the published range');
  assert.match(w, /<select class="ecl-timesel"/, 'the select still names the instant it is on');
  /* dragging moves the axis; the fetch waits for the release (#R286's 「点滅と異常に遅い」) */
  assert.match(w, /rng\.addEventListener\('input',\(\)=>\{ E\.pause\(\); fill\(rng\);[\s\S]{0,160}E\.setIndex\(\+rng\.value\);/);
  assert.match(w, /rng\.addEventListener\('change',\(\)=>\{ E\.pause\(\); try\{ E\.setIndex\(\+rng\.value,\{now:true\}\);/);
  /* the two controls stay in step, in both directions */
  assert.match(w, /if\(rng\)\{ rng\.value=sel\.value; fill\(rng\); \}/);
  assert.match(w, /if\(sel\) sel\.value=rng\.value;/);
  assert.match(read('css/intmap.css'), /\.ecl-timerange\{/, 'and it is styled like the app’s other slider');
});

/* ── ⑬ 「オブジェクト一覧は、数がゼロになったら自動的に消える」 ─────────────────────────────── */
test('R293 ⑬ the object list closes on the transition to zero, not on being empty', () => {
  const s = MT();
  assert.match(s, /if\(!_objs\.length&&_had>0&&panel\.style\.display!=='none'\)\{ _had=0; close\(\); return; \}/,
    'the edge is what closes it — opening it with nothing still explains what it is for');
  assert.match(s, /if\(!n&&_had>0&&openState&&panel&&panel\.style\.display!=='none'\)\{ _had=0; close\(\); \}/,
    'and the periodic tick sees the emptying whoever did it');
  assert.equal((s.match(/_had=0; close\(\)/g) || []).length, 2, 'both doors, one rule');
});

/* ── ⑭ 「NATO/EU は赤から紫に連続的に」 — the ramp is measured in tests/r290 ⑮; here it is the
   DIRECTION that is pinned: the oldest wave is red and the newest is purple. ─────────────────── */
test('R293 ⑭ the accession ramp runs oldest-red to newest-purple', () => {
  const d = DL();
  const m = /const _WAVEPAL=\[([^\]]*)\];/.exec(d);
  assert.ok(m, 'one array literal');
  const pal = [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((x) => x[1]);
  assert.equal(pal.length, 11);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hue = (c) => { const [r, g, b] = c.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; if (!dd) return 0;
    let h = mx === r ? 60 * (((g - b) / dd) % 6) : mx === g ? 60 * ((b - r) / dd + 2) : 60 * ((r - g) / dd + 4);
    return h < 0 ? h + 360 : h; };
  const first = hue(hex(pal[0])), last = hue(hex(pal[pal.length - 1]));
  assert.ok(first < 30 || first > 340, `the oldest wave must be RED — hue ${first.toFixed(0)}`);
  assert.ok(last > 265 && last < 320, `the newest must be PURPLE — hue ${last.toFixed(0)}`);
  /* oldest-first is how yearColors indexes it, so the direction is a fact about the map */
  assert.match(d, /\(n<=P\)\?_WAVEPAL\[Math\.round\(i\*\(P-1\)\/\(n-1\)\)\]/);
});

/* ── ⑮ 「変えてから読み込まれるまでいったん地図が何もなくなる」 ────────────────────────────────
   MEASURED across one time step on the built app (polling every 150–200 ms for 12 s):
     the wind COLOUR FIELD is never absent      0 of 60 samples   (#R284's two slots hold)
     the PARTICLES are never without a field    each reads a closure over the frame it was made from
     the READOUT was                            15 of 80 samples, 0 → 2,144 ms
   `sampler()` builds the key for the CURRENT index, so it answers null until that hour is decoded.
   The picture kept moving and the number under the cursor went blank.                            */
test('R293 ⑮ the wind readout survives a time step, and says which hour it answered from', () => {
  const w = WX();
  assert.match(w, /let _lastField=null, _lastFieldAt=null;/, 'the last field that answered is kept');
  /* ⚠ (#R298) THIS PINNED THE LINE THAT WAS THE DEFECT, AND CONTRADICTED THIS TEST'S OWN RULE.
     The text it required passed `sf` — which is null whenever a superseded read was not kept —
     straight into `renderer.setField`, and the renderer reads null as 「draw nothing」: every streak
     on the map went out. It also re-stamped `_lastFieldAt` UNCONDITIONALLY, so a field that was
     kept from the previous hour was labelled with the new hour — the very thing the note four
     lines below forbids. The relation is: the hour is stamped only when a NEW field arrived, and
     null never reaches the renderer. */
  assert.match(w, /const fresh=EC\(\)\.sampler\(VAR\);\s*\n?\s*if\(fresh\)\{ _lastField=fresh; _lastFieldAt=EC\(\)\.validTime\(\); \}/,
    'the hour is re-stamped only when a new field actually arrived');
  assert.match(w, /const sf=fresh\|\|_lastField;\s*\n?\s*if\(sf\) renderer\.setField\(sf\);/,
    'and the field that is flying keeps flying until there is a new one to put in its place');
  assert.match(w, /const s=live\|\|_lastField; if\(!s\) return null;/,
    'the readout falls back to it while the new hour downloads');
  /* ⚠ and it is HONEST about which hour the number is from — a value labelled with an hour it was
     not measured in is #R269's defect in miniature, and this is the one place that could make it */
  assert.match(w, /const at=live\?E\.validTime\(\):_lastFieldAt;/);
  assert.match(w, /time:at \}; \},/, 'the stale value carries its own hour, not the axis’s');
  /* the two slots that keep the COLOUR field on screen are untouched */
  assert.match(w, /_whenSrcLoaded\(s\.src,reveal,12000\);/, 'the field still reveals on its own source');
  /* ⚠ (#R298) WHICH slot is dropped is decided when the reveal RUNS, not when it was scheduled.
     `old` was captured at schedule time, so two steps in quick succession made the first reveal
     delete the SECOND one's layer — measured with a harness against the previous file: two steps
     left both slots present and neither visible. The relation: everything that is not the slot now
     showing goes, and a superseded reveal drops nothing at all. */
  assert.match(w, /if\(!on\|\|mine!==fieldSeq\) return;/, 'a superseded reveal neither shows nor removes');
  assert.match(w, /SLOT\.forEach\(\(o,i\)=>\{ if\(i===use\) return;/,
    '…and the old slot is only dropped once the new one has painted, decided at that moment');
});

/* ── ⑯ 「塗りすぎ」 — A SLIDER THAT WRITES A SCALAR ERASES AN EXPRESSION ──────────────────────
   MEASURED on the built app with the warnings layer on:
     getPaint('wp-alert-hatch','fill-opacity')  →  0.38          ← a plain number
   That layer is declared with `['case', ['==', feature-state, 0], 0.9, 0]`, i.e. the EXPRESSION IS
   WHAT DECIDES WHICH COUNTRIES ARE HATCHED. `_applyGenericOpacity` wrote the slider's value over
   it, so every country on Earth — the ones with warnings in force included — was hatched at 38 %.
   #R273 met the same mechanism one property along (`line-opacity` on the outline) and answered it
   with a per-layer EXEMPTION. An exemption is the wrong shape here: the reader does want the hatch
   to follow the slider; what they do not want is the slider deciding WHO is hatched.               */
test('R293 ⑯ the opacity slider dims the country layers without deciding who they paint', () => {
  const d = DL();
  assert.match(d, /window\._opacityExpr=window\._opacityExpr\|\|\{\};/, 'a layer may register a builder');
  assert.match(d, /const build=window\._opacityExpr\[lid\];\s*if\(build\)\{ GE\(\)\.layers\.setPaint\(lid,p,build\(v\)\); return; \}/,
    'and the builder is asked BEFORE the scalar is written');
  /* …and it is asked before the scalar, not after — a `return` rather than an overwrite */
  const i = d.indexOf('function _applyGenericOpacity');
  const body = d.slice(i, d.indexOf('window._applyGenericOpacity=', i));
  assert.ok(body.indexOf('window._opacityExpr[lid]') < body.lastIndexOf('setPaint(lid,p,'),
    'the builder path comes first');

  const s = WP();
  /* both country-wide layers keep a CONDITION, and the slider multiplies inside it */
  assert.match(s, /const hatchOp=\(v\)=>\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    'the hatch still asks whether this country is state 0');
  assert.match(s, /const choroOp=\(v\)=>\['case',\['>',\['to-number',\['feature-state','wpAlert'\],-1\],0\],/,
    '…and the wash whether it is above 0');
  assert.match(s, /OE\[HATCH\]=hatchOp; OE\[CHORO\]=choroOp;/, 'both are registered');
  assert.match(s, /'fill-opacity':hatchOp\(OPACITY_DEFAULT\)/, 'and they are what the layer is built with');
  assert.match(s, /'fill-opacity':choroOp\(OPACITY_DEFAULT\)/);
  /* the raw conditionals must not be written anywhere else, or one copy drifts */
  assert.equal((s.match(/\['case',\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\]/g) || []).length, 1,
    'the hatch condition exists exactly once');
});
