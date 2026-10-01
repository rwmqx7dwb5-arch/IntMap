/* ============================================================================
 *  shell-weather-packs-routing-checks — weather, world packs and the route panel
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r296-checks.test.mjs
 *  tests/r302-checks.test.mjs
 *  tests/r289-checks.test.mjs
 *  tests/r408-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { installSafe } from './helpers/safe-html.mjs';
import { importModule, langRegistry } from './helpers/import-module.mjs';
import { codeOnly as code, codeOnly as noComments } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* The ONE route renderer, EVALUATED: js/routing-cards.js runs in a fresh context on top of the real
   language registry and the real output encoder. The only stub is the time-zone lookup, which is
   handed in so the test can say which offset a coordinate has — and see that it was asked.
   (module-graph) IMPORTED, fresh per call: its registry import is the real shared module. */
async function routeCards(offsetAt) {
  const w = { console, document: { documentElement: { lang: 'en', setAttribute() { } }, querySelector: () => null, addEventListener() { } } };
  w.window = w;
  langRegistry();
  installSafe(w);
  const asked = [];
  w.IntMapTimeZones = { offsetAt: (lng, lat) => { asked.push([lng, lat]); return offsetAt(lng, lat); } };
  await importModule('js/routing-cards.js', { globals: { window: w, document: w.document } });
  return { C: w.IntMapRouteCards, asked };
}

/* ═══════════════════════ #R296 · from r296-checks.test.mjs ═══════════════════════ */
// ============================================================================
//  #R296 — the route popup and everything after it
// ----------------------------------------------------------------------------
//  「今回やるのは経路ポップアップ以下の項目だけでいいです。」 Twelve requests, and the ones that were
//  DEFECTS rather than preferences all had the same shape: a finished thing with nothing pressing it.
//
//    · `useHere(which)` — the current-location handler, complete with permission states — had NO
//      caller anywhere in the program (#R291 wrote it; nothing pressed it).
//    · the account preference sync read `intmap_widgets3`, the key #R292 left as a migration SOURCE
//      and never writes again, so a deleted card came back on every sign-in.
//    · the widget board had no scrolling ancestor at all: measured, every one of them was
//      `overflow-y: visible` or `hidden`, so a board taller than the sidebar was simply unreachable.
//
//  ⚠ EVERY CHECK HERE IS ABOUT WHAT RUNS, and several of them strip comments first: this is the
//  twenty-first round in which a check for a removed name matched the note explaining the removal.
// ============================================================================
{
/* comments out, so an assertion about code cannot be satisfied by prose about code */

/* ═══ ③ THE CURRENT-LOCATION BUTTON HAS A CALLER ═════════════════════════════════════════════
   「経路機能は現在地を地点に楽に選べるように。」 `useHere` was written in #R291 and never pressed. */
/* spelling kept: browser script (js/routing-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R296 ③ every route field can use the reader’s own position', () => {
  const ui = code(read('js/routing-ui.js'));
  assert.match(ui, /function useHere\(which\)/, 'the handler exists');
  assert.match(ui, /class="rtp-btn-ico rtp-here/, 'and a field draws the button');
  assert.match(ui, /q\('\.rtp-here'\)\).*useHere\(which\)/, 'and pressing it calls the handler');
  /* it says which state it is in — asking and denied are not silent */
  assert.match(ui, /function hereLabel\(\)/, 'the label is a function of the state');
  assert.match(ui, /hereState === 'denied'/, 'a refusal is spoken');
  assert.match(ui, /hereState === 'asking'/, '…and so is the wait');
  /* ⚠ opening the panel still asks for nothing — the prompt happens on the press (§4.3) */
  const open = /function open\(o\)\s*\{([\s\S]*?)\n    \}/.exec(read('js/routing-ui.js'));
  if (open) assert.equal(/getCurrentPosition/.test(open[1]), false, 'opening the panel asks for no permission');
});

/* ═══ ④ 「徒歩 → END」 ══════════════════════════════════════════════════════════════════════════
   MOTIS names the two ends of a trip `START` and `END`. They are not place names — they are the API
   saying 「the coordinate you gave me」 — and they were being printed as if they were. */
test('R296 ④ the provider’s END sentinel never reaches the reader', async () => {
  /* spelling kept: js/routing.js turns a MOTIS leg into route data inside the router factory (network, live map); what it records is read off its text. */
  const r = read('js/routing.js');
  assert.match(r, /const _sent=\(n\)=>\/\^\(START\|END\)\$\/i\.test/, 'the sentinel is recognised');
  assert.match(r, /toEnd:_sent\(_tN\)&&\/\^END\$\/i\.test\(_tN\)\?1:0/, 'and recorded as a FLAG, not a word');
  /* (tests-by-topic) the renderer is RUN: a walk leg whose end is the flag reads as the word, in
     the reader's language, at render time. */
  const { C } = await routeCards(() => null);
  const leg = { walk: true, mode: 'WALK', toEnd: 1, duration: 300 };
  assert.match(C.legRows([leg], { lang: 'en' }), /Walk → Arrival/, 'the word is chosen at render time…');
  assert.match(C.legRows([leg], { lang: 'jp' }), /徒歩 → 到着/, '…in the language being read now');
  assert.doesNotMatch(C.legRows([leg], { lang: 'en' }), /\bEND\b/, 'and the sentinel itself is never printed');
  /* ⚠ #R291 追記's lesson: a translated string baked into route DATA is resolved once and can never
     follow a language change. That is exactly why the flag travels and the word does not. */
  assert.doesNotMatch(code(r), /'到着'/, '…so js/routing.js never bakes a language into the data');
});

/* ═══ ⑤ 「経路機能で、現地の時刻に合わせろ」 ════════════════════════════════════════════════════ */
test('R296 ⑤ a route’s clocks are local to the place they happen', async () => {
  /* (tests-by-topic) THE FORMATTER IS RUN. Tokyo is +9 and New York −5 by the stubbed lookup; the
     same instant must read differently at the two places, and a pinned zone must override both. */
  const TOKYO = [139.7, 35.7], NYC = [-74.0, 40.7];
  const { C, asked } = await routeCards((lng) => (lng > 0 ? 9 : -5));
  const t0 = Date.UTC(2026, 0, 15, 0, 30);
  assert.equal(C.clock(t0, { lang: 'en' }, TOKYO), '09:30', 'the zone comes from a coordinate');
  assert.deepEqual(asked[0], TOKYO, '…through the app’s own zone lookup');
  assert.equal(C.clock(t0, { lang: 'en' }, NYC), '19:30', 'and the formatter takes a place');
  /* an explicit Settings zone still wins — a reader who pinned one asked for every time to be in it */
  const n = asked.length;
  assert.equal(C.clock(t0, { lang: 'en', tz: 'UTC' }, TOKYO), '00:30', 'a pinned zone short-circuits');
  assert.equal(asked.length, n, '…without asking the lookup at all');
  /* each end of a ride is clocked WHERE IT HAPPENS */
  const ride = C.legRows([{ mode: 'RAIL', route: 'X1', from: 'A', to: 'B', dep: t0, arr: t0 + 3600000, fromLL: TOKYO, toLL: NYC, duration: 3600 }], { lang: 'en' });
  assert.match(ride, /09:30/, 'departure in the departing city');
  assert.match(ride, /20:30/, 'arrival in the arriving one');
  /* spelling kept: the router factory in js/routing.js builds the legs from a network reply; that it copies both ends' coordinates is read off its text. */
  assert.match(read('js/routing.js'), /fromLL:_ll\(l\.from\),toLL:_ll\(l\.to\)/, 'the legs carry those coordinates');
  /* the panel asks for the polygons rather than assuming somebody else did (#R293 ⑧'s defect) */
  assert.match(read('js/routing-ui.js'), /TZ\.ensure && \(!TZ\.ready \|\| !TZ\.ready\(\)\)/, 'and the data is requested on open');
});

/* ═══ ⑥ THE ROUTE PANEL IS NOT UNCONDITIONALLY TRANSLUCENT ═══════════════════════════════════
   「経路ポップアップは無条件で透過するな。」 — 「無条件で」 names the defect: every other surface follows
   the reader's own Settings ▸ サイドバーの質感 choice, and this one declared `--popup-bg` plus a
   backdrop-filter with no reference to it at all. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R296 ⑥ the directions panel follows the transparency setting', () => {
  const css = read('css/intmap.css');
  const m = /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) \.rtp\{([^}]*)\}/.exec(css);
  assert.ok(m, 'an opaque rule must exist for the default (non-glass) setting');
  assert.match(m[1], /backdrop-filter:none/, 'and it turns the blur off');
  assert.match(m[1], /background:var\(--panel-bg,var\(--card-bg\)\)/, 'with an opaque fill');
  /* the SAME shape js/map-ui.js already uses for the layer sidebar — one idea, not two */
  assert.match(read('js/map-ui.js'), /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) #layer-sidebar-r\{background:var\(--panel-bg,var\(--card-bg\)\)/,
    'the layer sidebar states it the same way');
});

/* ═══ ⑫ THE CARD OPENS ═══════════════════════════════════════════════════════════════════════
   「経路の選択肢からひとつをえらんだときに、詳細が経路候補一覧の下に表示されるのではなく、経路カードが
     広がって詳細が表示されるUIに。」 #R291 put the detail below the list and wrote down why: a list of
   step BUTTONS cannot be nested inside a card that is itself a button. So the card stops being one. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R296 ⑫ the selected route card holds its own detail, and a step press is a step press', () => {
  const c = read('js/routing-cards.js');
  assert.match(c, /<div class="rt-alt/, 'the card is a div…');
  assert.match(c, /role="radio"[^>]*tabindex=/, '…with the role the radiogroup around it already declared');
  assert.match(c, /o\.detail === 'function'/, 'and it can be given a detail to hold');

  const ui = read('js/routing-ui.js');
  assert.match(ui, /detail: \(i2, a2\) => detailFor\(a2\)/, 'the panel supplies it');
  /* ⚠ ORDER MATTERS NOW. With the detail nested in the card, `closest('.rt-alt')` also matches a
     press on a STEP; testing the card first would swallow every turn press and re-select the same
     alternative — which looks exactly like 「押しても何も起きない」 (#R268 counted that three times). */
  /* ⚠ (#R296) comments stripped FIRST. The note beside these two branches explains the ordering by
     naming `.rt-alt`, and reading it as code is the twenty-second instance of a check hitting the
     comment that documents the very thing it is asserting. */
  const onClick = code(ui).slice(code(ui).indexOf('function onClick(e)'));
  const iStep = onClick.indexOf(".rt-step'");
  const iAlt = onClick.indexOf(".rt-alt'");
  assert.ok(iStep > 0 && iAlt > 0, 'both branches exist');
  assert.ok(iStep < iAlt, 'the step is tested before the card');

  const css = read('css/intmap.css');
  assert.match(css, /\.rt-alt-detail\{/, 'the detail has a style of its own');
  assert.match(css, /\.rt-alt\{\s*\n\s*display:flex; flex-direction:column;/, 'and the card is a column that can hold it');
});
}

/* ═══════════════════════ #R302 · from r302-checks.test.mjs ═══════════════════════ */
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
{
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-four times; ask the question of the text that RUNS. */
const WP = () => noComments(read('js/world-packs.js'));

/* ── ① the bulletin's own municipality list outranks its region row ──────────────────────────
   r8 carries `class10Items` (一次細分区域) and `class20Items` (市町村) in the SAME bulletin. The
   region row was fanned out over every child, and the children the bulletin itself calls quiet were
   dropped one line earlier, so the fan-out could not be contradicted by the agency's own answer.
   MEASURED, same bulletin: 青森 020010 津軽 has 19 children of which **14 say 「なし」**;
   名瀬 460040 奄美地方 has 13 of which 7 do. Those 21 were painted with nothing in force. */
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/wx-ecmwf.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/weather.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/weather.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑦ the forecast prefetch warms the view, and only the layers that are up', () => {
  const s = WX();
  /* ⚠ (#R337) THE CONDITION WIDENED BECAUSE THE PICTURE DID, AND NOT ONE PIXEL FURTHER. #R302's
     rule is 「u and v are warmed only when they are on the map」, and since #R337 they can be on
     the map without the wind LAYER — the temperature legend can ask for the streaks alone. So this
     still says 「only when they are being drawn」; what changed is what drawing them means.
     ⚠⚠ (#R356) …AND THE LIST IT GUARDS IS PER MODEL. Both halves met in one block on the rebase and
     keeping either alone would have been a silent regression: #R337's condition is orthogonal to
     #R356's buckets, so both are asserted, on their own lines, against the same statement. */
  assert.match(s, /if\(W&&\(\(W\.on&&W\.on\(\)\)\|\|\(W\.solo&&W\.solo\(\)\)\)\)\{[\s\S]{0,220}?\.push\('wind_u_component_10m','wind_v_component_10m'\);/,
    "the wind's two components belong to the warm only while they are actually being drawn");
  assert.match(s, /\(byModel\[wm\]=byModel\[wm\]\|\|\[\]\)\.push\('wind_u_component_10m'/,
    '…and they go to the model the WIND is reading, not to whichever layer was last in the list');
  assert.match(s, /pb=inst\.bandFor\(pbS,pbN\)/, 'the view becomes a band');
  assert.match(s, /inst\.prefetch\(byModel\[m\],Math\.min\(n-1,i\+1\),pb\)/, '…and the band is passed');
});

/* ── ⑧ the same text is not rebuilt from Intl on every render ────────────────────────────────
   The player's option list runs `E.fmt()` over every valid time (~109), and the legend is redrawn
   at the start AND the end of every load and on each of `time` / `play` / `meta`. The memo key has
   to carry everything the text depends on, or a language switch would print the old words. */
/* spelling kept: browser script (js/weather.js, js/wx-ecmwf.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/weather.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
  /* (ui-layer-owner) the one boundary: the desktop side is 769, the phone side 768 */
  const a = s.indexOf('@media (min-width:769px){', s.indexOf('.rtp{'));
  const b = s.indexOf('@media (max-width:768px){', a);
  if (!(a > 0 && b > a)) throw new Error('the route panel desktop block could not be delimited');
  return s.slice(a, b);
};

/* ── ⑪ the desktop block overrides the things that actually decide the upper half ────────────
   MEASURED in Chromium on the real markup, 1280×950, no via point, a route shown:
     head 44.00 → 36.00 · fixed 268.77 → 224.19 · tabs 33.13 → 28.39
     upper half 345.90 → 288.58 px (−16.6 %) · `.rtp-body` 459.11 → 516.42
     turn steps fully visible: English 11 → 12, Japanese 11 → 13 */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
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
  const phone = CSS().slice(CSS().indexOf('@media (max-width:768px){', CSS().indexOf('.rtp{')));
  assert.match(phone, /\.rtp-btn-ico\{ width:44px; height:44px/, 'the phone keeps its 44 px buttons');
  assert.match(phone, /\.rtp-in\{[^}]*height:48px/, '…and its 48 px fields');
});

/* ── ⑩ a session longer than one model run re-reads the run ──────────────────────────────────
   `fetchMeta(force)` existed and NOTHING passed `force`, so the branch that re-pins the axis to a
   new `referenceTime` was unreachable: a tab left open all day kept yesterday's run for ever. */
/* spelling kept: browser script (js/wx-ecmwf.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑩ the model run is re-read when the axis is older than the window', () => {
  const s = EC();
  assert.match(s, /var META_MAX_AGE = \d+;/, 'the window is a named constant');
  assert.match(s, /function metaDue\(\)/, 'and the question is asked in one place');
  assert.match(s, /fetchMeta\(metaDue\(\)\)/, '…and the answer actually reaches fetchMeta');
  /* ⚠ and it must not make the reader wait: an axis in hand is used while the re-read runs */
  assert.match(s, /if \(meta\) \{ m\.catch/, 'a held axis does not block on the refresh');
});

/* ── ⑮ the wind readout answers from the field on screen ─────────────────────────────────────
   #R276 wrote the rule (「地図上の地点値は、表示中のレイヤー・モデル・時刻と同じデータから取得する」) and
   #R288 carried the `temp` row over to it; the `wind` row went on asking api.open-meteo.com for a
   live 「now」 reading while the ECMWF frame the particles are drawn from sat decoded in RAM. */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
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
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑯ an ended warning is not a warning', () => {
  const s = WP();
  assert.match(s, /status_en\|\|''\)\.trim\(\)\)[\s\S]{0,120}?status_fr/,
    'both language fields are read, because either may be the one that says ended');
  assert.match(s, /\(ended\|termin\)/,
    'and 「ended」 is what is dropped — as a stem, because the French agrees in gender (terminé/terminée)');
  /* ⚠ (#R383) …and the PAGE is not the FEED. This read asks for `limit=500` and the collection
     answers with `numberMatched` — 238 today, so the cap is not binding, and that is the state a
     silent truncation hides in (#R320). The denominator is whichever number is larger. */
  assert.match(s, /PLACED\.CAN=\[out\.length,Math\.max\(out\.length,caMatched-caEnded,\(j\.features\|\|\[\]\)\.length-caEnded\)\]/,
    'the denominator is what is still in force, so a shape that could not be drawn shows as a shortfall');
});

/* ── ⑰ a counter that cannot report a shortfall is not a counter ─────────────────────────────
   MEASURED live: the NWS publishes 281 alerts of which **201 carry `geometry: null`** (it files them
   against UGC zone codes), they were dropped in silence, and `PLACED.USA=[80,80]` reported success.
   Twelve jurisdictions with a warning in force were then covered by the 「発表なし」 grey, which is
   drawn per unit and knows only about what was placed. Hong Kong's loader draws nothing at all and
   was reporting `[1,1]`. */
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑰ what could not be drawn is counted, in every loader', () => {
  const s = WP();
  /* ⚠ (#R383) THE COUNTING RULE IS THE SAME; THE NUMERATOR FINALLY MOVES. This round resolves the
     UGC zone codes against the NWS's own reference layers, so `placed` is no longer always zero —
     MEASURED, `PLACED.USA` went from [11, 135] to [403, 403]. What #R302 wrote survives verbatim:
     a zone this map still cannot draw is in the denominator and raises `UNPL`. */
  assert.match(s, /PLACED\.USA=\[own\+placed,own\+placed\+noGeom\]; UNPL\.USA=noGeom\?worstNG:0;/,
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
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑱ raising the European index re-places the grey as well as the colour', () => {
  const s = WP();
  assert.match(s, /function nutsSetUnits\(by\)\{/, 'the quiet units have a rebuild of their own');
  const fine = /function askNutsFine\(\)\{[\s\S]{0,1400}?nutsFineAsked=false; \}\); \}/.exec(s);
  assert.ok(fine, 'askNutsFine must be findable');
  assert.match(fine[0], /nutsSetUnits\(before\)/, '…and the upgrade calls it');
  assert.match(fine[0], /maFeatures\(\)/, 'the warnings are re-placed from the same index');
  assert.match(s, /UNIT_SRC\[iso\]!=='nuts'\) return;/, 'only the countries actually drawn from it move');
});
}

/* ═══════════════════════ #R289 · from r289-checks.test.mjs ═══════════════════════ */
/* (#R289 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const read = (p) => readLF(resolve(ROOT, p));

/* ── ② THE WIND CHIP: A LOCALISED WORD AND AN ARROW WHOSE PHASE SURVIVES A REBUILD ──────────
   「風向きも、矢印を動的に動くように表示してください。」 The readout is rebuilt with innerHTML on every
   mousemove, so a CSS animation on a freshly created node is re-seeded at t=0 sixty times a second —
   an arrow that is only "dynamic" while nobody is touching the map. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R289 ② the wind arrow points downwind and carries its animation phase across rebuilds', () => {
  const s = read('js/map-readout.js');
  assert.match(s, /const card=window\.IntMapCompass\.point\(w\.dir,HOST\.lang,8\);/,
    'the direction is a word from the one table');
  assert.match(s, /const to=\(\(w\.dir\+180\)%360\)\.toFixed\(1\);/,
    'the arrow points DOWNWIND — `dir` is the meteorological FROM bearing');
  /* ⚠ (#R290) THE DRIFT IS GONE, BY REQUEST — 「風の流れる向きに動かさなくてよい。向きだけ表示しろ。」
     What #R289 built here was the motion and the machinery that kept its phase continuous across
     the readout's `innerHTML` rebuild. Both are removed; the ROTATION, which is the direction and
     is what the reader kept, is asserted above and again below. The removal is asserted too, so a
     later round cannot quietly put the animation back. */
  assert.ok(!/animation-duration:'\+dur/.test(s), 'no speed-scaled drift duration');
  assert.ok(!/animation-delay:-'\+ph/.test(s), 'no phase carry — there is no animation to carry');
  const css = read('css/intmap.css');
  assert.ok(!/@keyframes cr-wind-fly\{/.test(css), 'the drift keyframes are gone with it');
  assert.ok(!/\.coord-readout \.cr-warr i\{[^}]*animation-name/.test(css), 'and the inner element does not animate');
  /* (#R290) the reduced-motion escape hatch went with the motion — there is nothing left to
     suppress, and a rule for an animation that does not exist is a rule that will outlive its
     subject. Every reader now gets what 「prefers-reduced-motion」 asked for. */
  assert.ok(!/prefers-reduced-motion:reduce\)\{ \.coord-readout \.cr-warr/.test(css),
    'and the reduced-motion escape hatch is gone with it — nothing moves for anybody');
});
}

/* ═══════════════════════ #R408 · from r408-checks.test.mjs ═══════════════════════ */
/* (#R408 — the round's own account of why these checks exist heads its other half, in tests/shell-layer-panel-checks.test.mjs) */
{
const rd = read;

/* ── ⑤ THE HATCH CUT IS KEYED ON THE COUNTRIES, NOT ON THE RECTANGLE ──────────────────────────*/
/* spelling kept: browser script (js/world-packs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ⑤: 斜線カットの鍵が視野の矩形でなく、視野に入っている tier 0 の集合である', () => {
  const src = rd('js/world-packs.js');
  const i = src.indexOf('function rebuildHatchCut(');
  assert.ok(i > 0, 'rebuildHatchCut が居る');
  const head = src.slice(i, src.indexOf('if(key===hatchCutKey) return false;', i));
  assert.ok(head.length > 0 && head.length < 4000, '鍵は関数の頭で組み立てられている');

  assert.ok(!/getBounds\(\)/.test(head),
    '鍵の組み立てにカメラの矩形が入っている — 0.25 度に丸めても、指が動かすパンは必ずこれを外す');
  assert.match(head, /const zeroSeen=\[\]/,
    '視野に入っている tier 0 の国だけを集めている');
  assert.match(head, /const key=sig\+'\|'\+zeroSeen\.join\(','\)\+'\|'\+zero\.join\(','\)/,
    '鍵は「描かれている地物の署名 × 視野内の tier 0 × tier 0 全体」である');

  /* ⚠ そして視野の旗は早期 return の**前**で数えられていなければ意味が無い。下で数えていた
     ままだと、鍵は集合を名乗るのに集合を知らないので組み立てられない。 */
  assert.match(head, /inv\[c\]=!!inView\(geo\[i\]\)/, '視野の旗はここで数えている');
  const body = src.slice(i);
  assert.equal((body.match(/inv\[c\]=!!inView\(geo\[i\]\)/g) || []).length, 1,
    '視野の旗を2か所で数えると、鍵が指すものと実際に回すものが別々に決まる');
});
}
