/* ============================================================================
 *  IntMap · #R302 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION that a report named, not a number a round happened to pick.
 *
 *    · 「何も発令されていないのに、灰色に塗られていない場所がある。発令されていないのに都道府県単位で
 *       塗られてしまい、発令判定になっている市町村がある。」
 *      Three separate defects, all measured against the JMA's own map algorithm (extracted from
 *      jma.go.jp/bosai/map.html: union every r8 row, skip only 「解除」, draw class10s at z4–7 and
 *      class20s at z8–11 as two layers that never spread onto one another):
 *
 *        ① a class10 row was spread over EVERY municipality inside it, overriding the same
 *           bulletin's own 「発表警報・注意報はなし」 for those towns — 21 municipalities painted with
 *           nothing in force (青森県津軽 14 · 鹿児島県奄美 7) and 宮古郡多良間村 painted two ranks high;
 *        ② `jpShape` guessed that a designated city's wards are its code +1…+99, which holds for the
 *           FIRST designated city in a prefecture and no other: 横浜市's shape took in 川崎市 and
 *           相模原市, and 川崎市・相模原市・浜松市・堺市・福岡市 could never be placed at all;
 *        ③ the nationwide `s0001` build is missing EIGHT municipalities outright, and the
 *           per-prefecture upgrade threw them away because they were not already in the index —
 *           so they carried neither a warning nor the 「発表なし」 grey. They were holes.
 *
 *      MEASURED on the live feed, before → after: 塗りすぎ 21 → 0 · 階級違い 1 → 0 · 塗り漏れ 0 → 0,
 *      unplaceable class20 codes 15 → 0, and Japan's unit index 1,894 → 1,902.
 *
 *    · 「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」
 *    · 「経路ポップアップ、UIがでかすぎな箇所が多々ある。…上半分がでかすぎて肝心の下半分が見にくい。」
 *    · 「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出す
 *       のを辞めろ。…普通の既存の赤メッセージ使ってください。…最初に地点選ぶ必要のないものまで全部
 *       最初に選ばせようとするな。」
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-four times; ask the question of the text that RUNS. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => noComments(read('js/world-packs.js'));

/* ── ① the bulletin's own municipality list outranks its region row ──────────────────────────
   r8 carries `class10Items` (一次細分区域) and `class20Items` (市町村) in the SAME bulletin. The
   region row was fanned out over every child, and the children the bulletin itself calls quiet were
   dropped one line earlier, so the fan-out could not be contradicted by the agency's own answer.
   MEASURED, same bulletin: 青森 020010 津軽 has 19 children of which **14 say 「なし」**;
   名瀬 460040 奄美地方 has 13 of which 7 do. Those 21 were painted with nothing in force. */
test('R302 ① a region row only fills municipalities its own bulletin does not name', () => {
  const s = WP();
  assert.match(s, /\(w\.class20Items\|\|\[\]\)\.forEach\(a=>\{ spoken\[String\(a\.areaCode\|\|''\)\]=1; \}\);/,
    'the bulletin must first record which municipalities it speaks for');
  const fan = /kidsOf\[r10\]\.forEach\(mc=>\{([\s\S]{0,120}?)\}\);/.exec(s);
  assert.ok(fan, 'the class10 fan-out must still exist — a town the bulletin never names still gets it');
  assert.match(fan[1], /if\(spoken\[mc\]\) return;/,
    'a child the bulletin itself answers for must not be overwritten by the region row');
  /* and the drop that makes 「発表なし」 invisible must still be there — it is what makes ① necessary */
  assert.match(s, /k\.status==='解除'\|\|k\.status==='発表警報・注意報はなし'/,
    'the two statuses that are not warnings must still be dropped');
});

/* ── ② a designated city is the union of ITS OWN wards, read rather than guessed ─────────────
   `if(/00$/.test(jis)){ lo=+jis.slice(2)+1; hi=+jis.slice(2)+100; }` assumed the wards of a
   designated city are its code +1…+99. MEASURED on the boundary file this layer reads:
     横浜市 14100 → 14101–14199 = 28 keys (横浜 18 + 川崎 7 + 相模原 3)
     静岡市 22100 → 静岡 3 + 浜松 7 · 大阪市 27100 → 大阪 24 + 堺 7 · 北九州市 40100 → 北九州 7 + 福岡 7
   and the same assumption made 14130/14150/22130/27140/40130 unresolvable, so those cities' own
   warnings were never drawn. ⚠ 「ends in 0」 is not a discriminator either: 札幌市清田区 is 01110. */
test('R302 ② a designated city resolves to its own wards, from the file, not from the digits', () => {
  const s = WP();
  assert.match(s, /function jpRow\(p,c\)\{/, 'one owner builds a row for both the floor and the upgrade');
  assert.match(s, /\/市\$\/\.test\(String\(p\.N03_003\)\)\) rec\.city=String\(p\.N03_003\);/,
    'a row is a ward because the file says it sits under a 市');
  assert.match(s, /function jpWards\(idx\)\{/, 'the grouping is its own named thing');
  assert.match(s, /const c=jpWards\(idx\)\[jis\];/, '…and jpShape asks it');
  assert.ok(!/\/00\$\/\.test\(jis\)/.test(s),
    'the +1…+99 range scan must not come back — it swallowed the next designated city');
  /* the consumed ward codes still have to be reported, or each ward is emitted again as grey
     LATER in the same array, i.e. painted over the warning it was just given (#R273) */
  assert.match(s, /geom:multi\(parts\),used\}/, 'the resolver says which ward codes it consumed');
  assert.match(s, /\(s\.used\|\|\[\]\)\.forEach\(k=>\{ drawn\[k\]=1; \}\)/,
    '…and the caller marks every one of them drawn');
});

/* ── ③ the per-prefecture upgrade may ADD a municipality, not only sharpen one ────────────────
   `if(!c||!idx[c]) return;` threw away a key the nationwide floor did not have. MEASURED, the
   floor (`s0001`) is missing EIGHT municipalities the per-prefecture build (`s0010`) carries —
   利島村・青ヶ島村・日吉津村・上島町・姫島村・座間味村・粟国村・渡名喜村, and 日吉津村 is a village
   enclaved inside 米子市, not an island. A municipality with no polygon is painted by nobody: not
   the warning, and not the 「発表なし」 grey, which is drawn per unit off this same index. */
test('R302 ③ the finer boundary build may add a municipality the nationwide floor lacks', () => {
  const s = WP();
  assert.ok(!/if\(!c\|\|!idx\[c\]\) return;/.test(s),
    'a municipality the floor lacks must no longer be discarded by the upgrade');
  assert.match(s, /if\(!rec\)\{ rec=idx\[c\]=jpRow\(q,c\); rec\.__fine=1; _jpWards=null;/,
    'a new row is built the same way the floor builds one, and the ward grouping is dropped');
  /* the existing rule must survive: a row that WAS in the floor is replaced, not appended to */
  assert.match(s, /if\(!rec\.__fine\)\{ rec\.__fine=1; rec\.parts=\[\]; \}/,
    'the first fine geometry for a row still replaces the coarse one');
  /* and both halves of the picture are still re-placed together, or a fine grey sits beside a
     coarse warning — the mismatched-edge defect #R298 removed (#R299 note over askJpFine) */
  const fine = /function askJpFine\(\)\{[\s\S]*?\n      \}/.exec(s);
  assert.ok(fine, 'askJpFine must be findable');
  assert.match(fine[0], /jpSetUnits\(idx\)/, 'the units are rebuilt');
  assert.match(fine[0], /refresh\(\)/, '…and the warnings are re-placed from the same index');
});

/* ── ④ the three numbers are surfaced, so 「it works」 is a measurement and not an opinion ───── */
test('R302 ④ the placement diagnostics say how far the index got', () => {
  const s = WP();
  assert.match(s, /jpFineOn, jpFineAdd, jpUnits:\(\(UNITS\.JPN\|\|\[\]\)\.length\)/,
    'how many prefectures are upgraded, how many municipalities were added, how many units there are');
  assert.match(s, /jmaUnit, jmaAreas, jmaPlaced, jmaQuiet/,
    'and the existing placement counters stay — jmaPlaced/jmaAreas is the 「everything placed」 test');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「風レイヤーは品質保ったまま、起動から日時変更からすべてに至るまで、爆速にしろ。」
 *  Nothing below lowers a sample count, a grid, a particle budget or an interpolation. What each
 *  one removes is a WAIT, a DUPLICATE, or a REBUILD.
 * ==========================================================================================*/
const WX = () => noComments(read('js/weather.js'));
const EC = () => noComments(read('js/wx-ecmwf.js'));

/* ── ⑤ the SDK and the axis are fetched together ────────────────────────────────────────────
   340 kB of SDK and a 3 kB `latest.json` were chained with `.then`, and the file's own comment
   said the metadata 「needs no SDK at all」. */
test('R302 ⑤ the SDK and the metadata are asked for at the same time', () => {
  const s = EC();
  const r = /function ready\(\)\s*\{[\s\S]{0,700}?\n  \}/.exec(s);
  assert.ok(r, 'ready() must be findable');
  assert.match(r[0], /Promise\.all\(\[\s*s\s*,\s*m\s*\]\)/, 'both are in flight at once');
  /* the two are separate statements, so neither is inside the other's continuation */
  assert.match(r[0], /var s = loadSDK\(\)/, 'the SDK is one statement');
  assert.match(r[0], /var m = fetchMeta\(/, '…and the metadata is another — it needs no SDK at all');
  /* …and an axis already in hand does not make the caller wait for a re-read */
  assert.match(r[0], /if \(meta\)/, 'an axis in hand is used at once');
});

/* ── ⑥ the per-frame constants are read per FRAME, not per particle ──────────────────────────
   `randomLL()` is called from `spawn()`, i.e. every time a particle dies — at 6,000 particles and a
   1.2–3.6 s life that is ~2,500 times a second — and it asked the camera for its bounds and the
   model for its held band each time. `heldBand` walks `stateKey()`, which is two `Date.parse` and
   two `new URLSearchParams`. Neither value can change inside one frame. */
test('R302 ⑥ the spawn window is taken once a frame, not once a particle', () => {
  const s = WX();
  assert.match(s, /function spawnCtx\(\)\{[\s\S]{0,400}?getBounds\(\)[\s\S]{0,400}?heldBand\(VAR\)/,
    'one place asks for the bounds and the held band');
  assert.match(s, /_spawnCtx=null;/, '…and the frame drops it');
  /* the sampling itself is unchanged: same band gate, same eight retries */
  assert.match(s, /for\(let k=0;k<8;k\+\+\)/, 'the retry count is untouched — this is not a quality change');
  assert.match(s, /if\(hb&&\(la<hb\[1\]\|\|la>hb\[3\]\)\) continue;/, 'and so is the band gate');
});

/* ── ⑦ the forecast warm is bounded by the view, and by what is actually on the map ──────────
   `prefetch(vars, i+1)` with no third argument reaches `band=null`, which warms the variable over
   the whole globe — 13.2 M samples for a reader looking at one country. And the wind's two
   components were appended whether or not the wind layer was on. */
test('R302 ⑦ the forecast prefetch warms the view, and only the layers that are up', () => {
  const s = WX();
  /* ⚠ (#R337) THE CONDITION WIDENED BECAUSE THE PICTURE DID, AND NOT ONE PIXEL FURTHER. #R302's
     rule is 「u and v are warmed only when they are on the map」, and since this round they can be on
     the map without the wind LAYER — the temperature legend can ask for the streaks alone. So this
     still says 「only when they are being drawn」; what changed is what drawing them means. */
  assert.match(s, /if\(W&&\(\(W\.on&&W\.on\(\)\)\|\|\(W\.solo&&W\.solo\(\)\)\)\) vars\.push\('wind_u_component_10m','wind_v_component_10m'\);/,
    "the wind's two components belong to the warm only while they are actually being drawn");
  assert.match(s, /pb=EC\(\)\.bandFor\(b\.getSouth\(\),b\.getNorth\(\)\)/, 'the view becomes a band');
  assert.match(s, /EC\(\)\.prefetch\(vars,Math\.min\(n-1,i\+1\),pb\)/, '…and the band is passed');
});

/* ── ⑧ the same text is not rebuilt from Intl on every render ────────────────────────────────
   The player's option list runs `E.fmt()` over every valid time (~109), and the legend is redrawn
   at the start AND the end of every load and on each of `time` / `play` / `meta`. The memo key has
   to carry everything the text depends on, or a language switch would print the old words. */
test('R302 ⑧ the time labels and the formatter are memoised on everything that can change them', () => {
  const s = WX(), e = EC();
  const m = /function _optLabels\(E,times,n,now,nowTxt\)\{[\s\S]{0,700}?\n    \}/.exec(s);
  assert.ok(m, '_optLabels must be findable');
  for (const part of ['E.MODEL', 'times[0]', 'times[n-1]', 'now', 'nowTxt', 'H.lang', 'H.userTZ'])
    assert.ok(m[0].includes(part), `the memo key must carry ${part}`);
  assert.match(s, /\+\(k===i\?' selected':''\)/, 'the selected index is still written every render');
  assert.match(e, /_dtf\[k\] \|\| \(_dtf\[k\] = new Intl\.DateTimeFormat\(/,
    'the formatter is kept per (locale, options) rather than rebuilt on every value');
});

/* ── ⑨ a field slot that already holds the key is not torn down and rebuilt ──────────────────
   `addField` removed the layer, removed the source and added it again unconditionally, and two
   callers can reach it for the same key (the `idle` ladder and `load().then`), so the tiles were
   ordered twice. */
test('R302 ⑨ every path into addField has already asked whether the key is live', () => {
  const s = WX();
  /* ⚠ (#R302 追記) THE GUARD #R302 ADDED HERE COULD NOT FIRE, so it went. Every one of the four
     call sites tests `liveKey` before it calls, and `liveKey=key` is written synchronously at the
     end of a successful build — so `addField` is never entered with `liveKey===key`. Asserting the
     guard would be asserting dead code; what has to hold is the property that made it dead. */
  assert.ok(!/liveKey===key&&liveSlot>=0/.test(s), 'the unreachable early return must not come back');
  assert.match(s, /if\(on&&key&&key!==liveKey\) ensureField\(key\);/, 'the load path asks first');   /* (#R337) …and only for the wind LAYER */
  assert.match(s, /if\(!on\|\|liveKey===key\) return;/, 'the retry ladder stops the moment the slot is live');
  assert.match(s, /if\(on&&liveKey!==key\) addField\(key\)/, '…and so does the idle hook');
  assert.match(s, /liveKey=key; liveSlot=use;/, 'the slot is recorded when it is built');
  assert.match(s, /liveKey=''; liveSlot=-1;/, '…and cleared together, so a torn-down slot is never reused');
  /* and the ladder itself — #R85's defect — must still be able to rebuild a slot that never took */
  assert.match(s, /function ensureField\(key\)\{\s*if\(addField\(key\)\) return;/,
    'a build that is refused is retried, which is the whole point of the ladder');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「経路ポップアップ、UIがでかすぎな箇所が多々ある。…上半分がでかすぎて肝心の下半分が見にくい。」
 *  ⚠ THIS IS THE SECOND TIME. #R299 lowered fourteen declarations in the same block and the upper
 *  half stayed 346 px, because the declarations it lowered were `min-height`s that CONTENT already
 *  exceeded — a floor under something taller does nothing. What decides the height is asserted here.
 * ==========================================================================================*/
const CSS = () => read('css/intmap.css');
const rtpDesktop = () => {
  const s = CSS();
  const a = s.indexOf('@media (min-width:768px){', s.indexOf('.rtp{'));
  const b = s.indexOf('@media (max-width:767px){', a);
  if (!(a > 0 && b > a)) throw new Error('the route panel desktop block could not be delimited');
  return s.slice(a, b);
};

/* ── ⑪ the desktop block overrides the things that actually decide the upper half ────────────
   MEASURED in Chromium on the real markup, 1280×950, no via point, a route shown:
     head 44.00 → 36.00 · fixed 268.77 → 224.19 · tabs 33.13 → 28.39
     upper half 345.90 → 288.58 px (−16.6 %) · `.rtp-body` 459.11 → 516.42
     turn steps fully visible: English 11 → 12, Japanese 11 → 13 */
test('R302 ⑪ the route panel shrinks where its height is actually decided', () => {
  const d = rtpDesktop();
  /* the header was a row of 34 px icon buttons under a 14 px title */
  assert.match(d, /\.rtp-btn-ico\{[^}]*height:28px/, 'the icon buttons decide the header height');
  /* the mode row was the 18 px glyph the JS writes, not the min-height above it */
  assert.match(d, /\.rtp-mode-ic svg\{[^}]*(width|height):15px/,
    'the mode glyph is sized in CSS — a min-height cannot shrink content that is taller');
  /* the tab row was ten pixels of padding, not its min-height either */
  assert.match(d, /\.rtp-tab\{[^}]*padding:3px 6px/, 'the tab row is its padding');
  /* the largest text in the panel */
  assert.match(d, /\.rtp-summary b\{[^}]*font-size:17px/, 'the summary is the panel’s biggest number');
  /* and the bottom half gets the room back */
  assert.match(d, /\.rtp-body\{ min-height:min\(240px,34vh\); \}/, 'the lower half has a bigger floor');
  assert.match(d, /\.rtp\[data-dragged="1"\] \.rtp-body\{ min-height:min\(180px,28vh\); \}/,
    '…except in a panel the reader sized themselves, where the floor would push the footer out');
  /* one gutter down the panel. ⚠ read the blocks out by hand rather than building a RegExp from a
     string — a half-escaped name is not an escaped name, which CodeQL flagged this round. */
  for (const sel of ['.rtp-fixed{', '.rtp-body{', '.rtp-foot{']) {
    const blocks = [];
    for (let i = d.indexOf(sel); i >= 0; i = d.indexOf(sel, i + 1)) blocks.push(d.slice(i, d.indexOf('}', i)));
    assert.ok(blocks.length, `${sel} must be declared in the desktop block`);
    assert.ok(blocks.some((b) => b.includes('12px')), `${sel} shares the 12 px gutter`);
  }
  /* ⚠ AND THE PHONE IS UNTOUCHED. A finger is a finger: tests/smoke.spec.js measures 44 px tap
     targets and 13 px text at 320×640, and none of the above may reach that block. */
  const phone = CSS().slice(CSS().indexOf('@media (max-width:767px){', CSS().indexOf('.rtp{')));
  assert.match(phone, /\.rtp-btn-ico\{ width:44px; height:44px/, 'the phone keeps its 44 px buttons');
  assert.match(phone, /\.rtp-in\{[^}]*height:48px/, '…and its 48 px fields');
});

/* ── ⑩ a session longer than one model run re-reads the run ──────────────────────────────────
   `fetchMeta(force)` existed and NOTHING passed `force`, so the branch that re-pins the axis to a
   new `referenceTime` was unreachable: a tab left open all day kept yesterday's run for ever. */
test('R302 ⑩ the model run is re-read when the axis is older than the window', () => {
  const s = EC();
  assert.match(s, /var META_MAX_AGE = \d+;/, 'the window is a named constant');
  assert.match(s, /function metaDue\(\)/, 'and the question is asked in one place');
  assert.match(s, /fetchMeta\(metaDue\(\)\)/, '…and the answer actually reaches fetchMeta');
  /* ⚠ and it must not make the reader wait: an axis in hand is used while the re-read runs */
  assert.match(s, /if \(meta\) \{ m\.catch/, 'a held axis does not block on the refresh');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出すのを
 *   辞めろ。…普通の既存の赤メッセージ使ってください。…最初に地点選ぶ必要のないものまで全部最初に
 *   選ばせようとするな。」
 * ==========================================================================================*/

/* ── ⑫ the ask is the app's existing red toast, and nothing new was invented ─────────────────
   #R298 answered this sentence by inventing a pill on the shared bar; #R299 removed the pill and
   left the bar arming in silence. The reader then said which message they meant: the ordinary one,
   `.sat-toast` on `--info-mil` (#ff3b30) — the same red js/community.js has used since #R16 for
   「まず初めに場所を選ばせろ」. */
test('R302 ⑫ asking for a point uses the toast the app already has', () => {
  const ui = noComments(read('js/map-ui.js'));
  const ask = /function _askPoint\(run,id\)\{[\s\S]{0,2400}?\n    \}/.exec(ui);
  assert.ok(ask, '_askPoint must be findable');
  assert.match(ask[0], /\(HOST\.imToast\|\|HOST\.satToast\)\(ask\)/, 'the existing red toast carries the ask');
  /* ONE string for the bar and the toast, so nine languages cannot drift between them */
  assert.match(ask[0], /hint:ask/, 'the shared bar carries the very same sentence');
  assert.match(ask[0], /const ask=/, '…because there is only one of it');
  /* the pre-existing shared bar is still the mechanism, and no new chrome was added */
  assert.match(ask[0], /P\.start\(\{/, "#R196's shared picker is what arms");
  const css = read('css/intmap.css');
  assert.ok(!/im-pick-alt/.test(css) && !/im-pick-alt/.test(ui), 'the invented pill must not come back');
  assert.match(css, /\.sat-toast\{[^}]*--info-mil/, 'and the toast the ask uses is the red one');
});

/* ── ⑬ a panel with no point draws nothing rather than answering for the camera ──────────────
   `siteLL()` returned the camera's centre with a `mine:false` flag, and every reader of it printed
   the numbers anyway: sun elevation, azimuth, sunrise/noon/sunset, and real building shadows on the
   map, for a place nobody chose. */
test('R302 ⑬ the sun panel has no centre to fall back to', () => {
  const s = noComments(read('js/sims.js'));
  assert.match(s, /function siteLL\(\)\{ return hasSite\(\)\?\{ lng:\+site\.lng, lat:\+site\.lat \}:null; \}/,
    'no point means no point');
  assert.ok(!/siteLL[\s\S]{0,300}?getCenter\(\)/.test(s), 'the centre fallback must not come back');
  assert.match(s, /function askSite\(\)\{ endPick\(\);/, 'the panel can ask for one');
  assert.match(s, /if\(!hasSite\(\)\) askSite\(\);/, '…and does, when it is opened without one');
  /* …and the panel never asks the raster to draw without one */
  assert.match(s, /function drawShadows\(\)\{[\s\S]{0,300}?const c=siteLL\(\);[\s\S]{0,120}?if\(!c\)\{ updatePanel\(null\);/,
    'no site means no numbers AND no cast shadows — the polygons follow the sun at the observer');
  /* ⚠ (#R302) BUT THE VIEW-SCOPED RASTER KEEPS THE VIEW CENTRE, and that is not the same defect.
     `IntMapInsolation.shade()` / `dayShadow()` shade THE GRID THAT IS ON SCREEN; the sun moves less
     than that grid's angular resolution across one viewport, so the centre is 「the sun over the area
     you are looking at」. Taking it away forces a point on a product that does not need one — the
     other half of 「最初に地点選ぶ必要のないものまで全部最初に選ばせようとするな」 — and it breaks
     tests/r176 ⑥, which shades Mt Fuji from the view alone. */
  const ins = noComments(read('js/insolation.js'));
  assert.match(ins, /const _sunAt=\(o\)=>\{[\s\S]{0,200}?getCenter\(\)/,
    'the view-wide raster still reads the sun over the view');
  assert.match(ins, /if\(a&&isFinite\(a\.lng\)&&isFinite\(a\.lat\)\) return \{ lat:\+a\.lat, lng:\+a\.lng \};/,
    '…but a point it was GIVEN always wins over the view');
});

/* ── ⑭ Atlas hands over the point it resolved, instead of throwing it away ───────────────────
   `case 'sun'` geocoded the place in the sentence, flew to it, and then called `open()` with no
   argument — so the panel answered for the camera's centre, and since `flyTo` had not landed that
   centre was the view the reader had BEFORE they asked. */
test('R302 ⑭ Atlas passes the coordinate it resolved, and asks when it has none', () => {
  const a = noComments(read('js/atlas-console.js'));
  assert.ok(!/IntMapSun\.open\(\);/.test(a), 'the resolved place must not be dropped on the floor');
  assert.ok(!/IntMapSun\.open\(ll\|\|undefined\)/.test(a), '…nor turned back into «no argument»');
  assert.equal((a.match(/IntMapSun\.open\(\{lng:ll\.lng,lat:ll\.lat\}\)/g) || []).length, 2,
    'both sun actions open on the point they resolved');
  /* the seismic arrival times are a function of ONE coordinate and were read at the camera centre */
  assert.ok(!/IntMapSeismic\.at\(c\.lng,c\.lat\)/.test(a), 'arrival times must not be read at the centre');
  assert.match(a, /IntMapSeismic\.at\(h\.lng,h\.lat\)/, '…they are read at the point the reader named');
});

/* ── ⑮ the wind readout answers from the field on screen ─────────────────────────────────────
   #R276 wrote the rule (「地図上の地点値は、表示中のレイヤー・モデル・時刻と同じデータから取得する」) and
   #R288 carried the `temp` row over to it; the `wind` row went on asking api.open-meteo.com for a
   live 「now」 reading while the ECMWF frame the particles are drawn from sat decoded in RAM. */
test('R302 ⑮ the wind row reads the frame that is on the map', () => {
  const ui = noComments(read('js/map-ui.js'));
  const row = /register\('wind',[\s\S]{0,900}?\n    register\('precip'/.exec(ui);
  assert.ok(row, "the wind row must be findable");
  assert.match(row[0], /window\.Wind\.sampleAt\(x,y\)/, 'the field on screen answers first');
  assert.match(row[0], /return _om\('wind',x,y\);/, '…and Open-Meteo stays as the fallback');
  assert.match(row[0], /_windFld\(\)\?'ECMWF IFS HRES · Open-Meteo':'Open-Meteo'/,
    'the attribution says which of the two answered');
  assert.match(row[0], /_windFld\(\)\?window\.IntMapECMWF\.validTime\(\):null/,
    "…and the hour is the frame's, or nothing");
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「他の国にも同じ欠陥があるのなら、それも修正して。」 — the same shape, audited across all twelve
 *  loaders. Two of them were painting ground with nothing in force ON THE DAY THIS WAS MEASURED.
 * ==========================================================================================*/

/* ── ⑯ Canada was painting warnings the ECCC had already ended ───────────────────────────────
   MEASURED live: 159 items, 35 of them `status_en:"ended"`, including fourteen consecutive rural
   municipalities across the Manitoba Interlake. Every other loader already drops its agency's own
   word for 「over」 — `loadHKO` CANCEL, `loadINMET` `encerrado`, the relay CAP `msgType: cancel`. */
test('R302 ⑯ an ended warning is not a warning', () => {
  const s = WP();
  assert.match(s, /status_en\|\|''\)\.trim\(\)\)[\s\S]{0,120}?status_fr/,
    'both language fields are read, because either may be the one that says ended');
  assert.match(s, /\(ended\|termin\)/,
    'and 「ended」 is what is dropped — as a stem, because the French agrees in gender (terminé/terminée)');
  assert.match(s, /PLACED\.CAN=\[out\.length,Math\.max\(out\.length,\(j\.features\|\|\[\]\)\.length-caEnded\)\]/,
    'the denominator is what is still in force, so a shape that could not be drawn shows as a shortfall');
});

/* ── ⑰ a counter that cannot report a shortfall is not a counter ─────────────────────────────
   MEASURED live: the NWS publishes 281 alerts of which **201 carry `geometry: null`** (it files them
   against UGC zone codes), they were dropped in silence, and `PLACED.USA=[80,80]` reported success.
   Twelve jurisdictions with a warning in force were then covered by the 「発表なし」 grey, which is
   drawn per unit and knows only about what was placed. Hong Kong's loader draws nothing at all and
   was reporting `[1,1]`. */
test('R302 ⑰ what could not be drawn is counted, in every loader', () => {
  const s = WP();
  assert.match(s, /PLACED\.USA=\[out\.length,out\.length\+noGeom\]; UNPL\.USA=noGeom\?worstNG:0;/,
    'the NWS shapes it could not draw are in the denominator and in UNPL');
  assert.match(s, /PLACED\.HKG=\[0,items\.length\?1:0\];/,
    'Hong Kong places no geometry at all and now says so');
  assert.ok(!/PLACED\.USA=\[out\.length,out\.length\];/.test(s), 'and neither claims «all of them»');
});

/* ── ⑱ Europe's quiet units move with the index the warnings move to ─────────────────────────
   #R297 raised the index the WARNINGS are placed against to NUTS 03M and left `UNITS[iso]` on the
   20M build, so across 34 countries a warned region was drawn at one simplification and its quiet
   neighbour at another — a sliver of unpainted ground along every shared edge. It is the mismatch
   #R298 removed, surviving on the European side; #R299 wrote the rule for it in Japanese. */
test('R302 ⑱ raising the European index re-places the grey as well as the colour', () => {
  const s = WP();
  assert.match(s, /function nutsSetUnits\(by\)\{/, 'the quiet units have a rebuild of their own');
  const fine = /function askNutsFine\(\)\{[\s\S]{0,1400}?nutsFineAsked=false; \}\); \}/.exec(s);
  assert.ok(fine, 'askNutsFine must be findable');
  assert.match(fine[0], /nutsSetUnits\(before\)/, '…and the upgrade calls it');
  assert.match(fine[0], /maFeatures\(\)/, 'the warnings are re-placed from the same index');
  assert.match(s, /UNIT_SRC\[iso\]!=='nuts'\) return;/, 'only the countries actually drawn from it move');
});
