/* ============================================================================
 *  #R273 — source-level checks
 * ----------------------------------------------------------------------------
 *  What this round was asked for, and what each test holds:
 *
 *    ① 「GDACSを完全に撤廃しろ」「ソースは一国一ソース」「対応国も増やせ」
 *    ② 「日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ」
 *    ③ 「まだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に」
 *    ④ 「各国の警報階級を同じ紫・赤・黄に押し込んでいる」→ 各国公式配色 / IntMap換算の切替
 *    ⑤ 「何の警報なのか地図から分からない」→ 種別を区域に文字で、重複は +N
 *    ⑥ 「更新時間31.1hと2minが同列」→ Fresh / Delayed / Stale / Error
 *    ⑦ 「一覧が取得先一覧になっている」→ パネルは「どこで何が」から始まる
 *    ⑧ 「これ長すぎ」→ 出典の一文
 *    ⑨ 「なにか形がおかしい×をやめろ」→ アプリ全体で1つの ×
 *    ⑩ 「セルビア語系言語は似た色味に」
 *    ⑪ 「水流シミュレーションの解像度が低すぎる」「一回きりの水源、再生できない」
 *    ⑫ 「大規模にレイヤーカテゴリ分類を再編しろ」→ 見出しの名前が中身と一致する
 *
 *  ⚠ EVERY «X is gone» ASSERTION IS WRITTEN IN THE SYNTAX X WAS WRITTEN IN, and against the source
 *  with its comments stripped — the prose that RECORDS a removal is not evidence against it. That
 *  is #R266's own lesson, and it has cost this repo a round twice.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));

/* ── ① one country, one national service, and no global event feed ─────────────────────────── */
test('R273 ① GDACS is gone, and every country the layer speaks about has its own agency', () => {
  const s = WP();
  for (const form of ['loadGDACS', 'gdacsapi', 'GDACSCOL', 'GDACSWASH', 'GDACS_TIER', 'gCountries', "'gdacs'"]) {
    assert.ok(!s.includes(form), 'GDACS must be gone: ' + form);
  }
  const feeds = /const FEEDS=\{([\s\S]*?)\};/.exec(s);
  assert.ok(feeds, 'the country → service table must exist');
  /* one country appears once: a second entry would silently win and fetch twice */
  const isos = [...feeds[1].matchAll(/([A-Z]{3}):'/g)].map((m) => m[1]);
  assert.equal(new Set(isos).size, isos.length, 'a country may be routed to exactly one service');
  const ma = /const MA=\{([\s\S]*?)\};/.exec(s);
  assert.ok(ma, 'the MeteoAlarm table must exist');
  for (const iso of isos) assert.ok(!new RegExp('\\b' + iso + ':').test(ma[1]),
    iso + ' has its own service and must not ALSO be pulled from the relay');
  /* 「対応国も増やせ」 — the two added this round, each through the one CAP-index reader */
  assert.ok(isos.includes('TWN') && isos.includes('NZL'), 'Taiwan and New Zealand must be wired');
  assert.match(s, /const CAPFEED=\{/, 'the CAP-index services must share one table');
  assert.match(s, /async function loadCAP\(feed\)/, '…and one loader, so a country costs one entry');
  const relay = codeOnly(read('supabase/functions/alerts-relay/index.ts'));
  assert.match(relay, /const CAPSRC\s*=\s*\{/, 'and the relay must hold the index URLs in one table');
  assert.match(relay, /alerts\.ncdr\.nat\.gov\.tw/, 'Taiwan’s CAP aggregator');
  assert.match(relay, /alerts\.metservice\.com/, 'New Zealand’s CAP index');
});

/* ── ② Japan, at the unit the JMA issues at ────────────────────────────────────────────────── */
test('R273 ② Japan is drawn at the municipality, from the JMA’s own codes', () => {
  const s = WP();
  assert.match(s, /const JP_MUNI_URL=/, 'the municipal boundary set must be named once');
  assert.match(s, /N03_007/, '…and keyed on the JIS code the file publishes');
  assert.match(s, /function jpShape\(idx,code\)\{ const jis=String\(code\)\.slice\(0,5\);/,
    'a class20 code’s first five digits ARE the JIS code');
  /* a designated city files as PP100 and its wards as PP101…PP199 — the union is the city */
  assert.match(s, /if\(\/00\$\/\.test\(jis\)\)/, 'a designated city must fall back to the union of its wards');
  assert.match(s, /return \{name:nm\|\|jis,geom:multi\(parts\),used\}/,
    '…and must say WHICH ward codes it consumed');
  /* ⚠ or every consumed ward is emitted again as a «nothing in force» grey, LATER in the same
     array, i.e. painted over the warning it was just given */
  assert.match(s, /\(s\.used\|\|\[\]\)\.forEach\(k=>\{ drawn\[k\]=1; \}\)/, 'the consumed codes mark the shape drawn');
  assert.match(s, /hot\.forEach\(f=>out\.push\(f\)\)/, 'the grey goes in FIRST and the warned units on top');
  assert.match(s, /jmaUnit='muni'/, 'and the panel must be able to say which unit is on screen');
});

test('R273 ② the JMA’s own colours, read from the JMA’s own page', () => {
  const s = WP();
  const m = /jma:\{([^}]*)\}/.exec(s);
  assert.ok(m, 'the JMA palette must exist');
  const pal = {};
  for (const e of m[1].matchAll(/(\d+):'([^']*)'/g)) pal[e[1]] = e[2];
  assert.deepEqual(pal, { 20: '#f2e700', 30: '#ff2800', 40: '#aa00aa', 50: '#0c000c' },
    'these are `.contents-levelNN` on jma.go.jp/bosai/warning — not a palette chosen here');
  /* ⚠ (#R293) 「灰色塗の色味は少しだけ白に近づけろ」 — the grey is no longer the JMA's own #c8c8cb.
     What #R273 was pinning is that 「発表なし」 has ONE colour and it is declared once; the value is
     the reader's to choose, so this asserts the declaration rather than the hex. */
  assert.match(s, /const NONE_COL='#[0-9a-f]{6}';/, '…and 「発表なし」 is one declared colour');
  assert.equal((s.match(/const NONE_COL=/g) || []).length, 1, '…declared exactly once');
  assert.ok(!/'#c8c8cb'/.test(s), 'and it is no longer the JMA\'s own grey (#R293)');
});

/* ── ③ 「警報なし」と「データなし」 are different states and look different ─────────────────── */
test('R273 ③ a country with no feed is hatched, a quiet one is grey, and they are not the same', () => {
  const s = WP();
  /* ⚠ (#R288) …and it is not only the feed table any more: a service whose own polygon lands in a
     country with no feed of its own covers that country, learned from the geometry rather than
     written down (`LEARNED`). Still not a hand-written list, which is what #R273 was asserting. */
  assert.match(s, /const supported=\(c\)=>!!\(FEEDS\[c\]\|\|LEARNED\[c\]\);/, 'support is derived, not a hand-written list');
  assert.match(s, /function learnCoverage\(list\)\{/, '…and the derivation has a name');
  const wi = s.indexOf('function washTier(c){');
  const w = s.slice(wi, s.indexOf('function paintCountries', wi));
  assert.match(w, /if\(!supported\(c\)\) return 0;/, 'no feed → state 0');
  /* ⚠ (#R290) …and the question is 「is the unit layer drawing this country RIGHT NOW」 rather than
     「are its shapes in the cache」: the quiet collection is bounded by the view and by the zoom
     (see quietISOs), so a country whose units are held but off-screen must keep the country-wide
     sheet or nothing would paint it at all. */
  assert.match(w, /return quietSet\[c\]\?2:1;/, 'a feed and nothing in force → grey (#R288: per unit where this map holds them)');
  assert.match(s, /function ensureHatch\(\)/, 'the hatch must be drawn, once');
  assert.match(s, /GE\(\)\.scene\.addImage\(HATCH_IMG/, '…through the image API the engine actually has');
  assert.match(s, /'fill-pattern':'wp-alert-hatch-img'/, '…and used as a pattern');
  /* the two states must not be one expression away from each other */
  assert.match(s, /\['==',\['to-number',\['feature-state','wpAlert'\],-1\],0\]/, 'the hatch is state 0 only');
});

/* ── ④ two palettes, and the normalisation says it is IntMap’s ─────────────────────────────── */
test('R273 ④ the map paints in the agency’s own colours or in IntMap’s, and says which', () => {
  const s = WP();
  assert.match(s, /let mode=\(function\(\)\{ try\{ return localStorage\.getItem\('im\.alertPal'\)/,
    'the choice is a reading preference and is kept');
  assert.match(s, /const colField=\(\)=>\(mode==='agency'\?'colA':'colN'\)/, 'one field name, two properties');
  assert.match(s, /colA:agCol\(feed,lv\), colN:PAL_NORM\[norm\]/,
    'every feature carries BOTH, so a mode change is a paint swap and not a re-fetch');
  assert.match(s, /function repaintMode\(\)/, '…and there is one place that swaps it');
  /* the normalisation is stated, not hidden inside a colour */
  assert.match(s, /function normOf\(feed,lv\)/, 'one normaliser');
  assert.match(s, /Each agency’s ranks are mapped onto these four by IntMap\./,
    'and the panel must say the conversion is IntMap’s own');
  assert.match(s, /the warning systems themselves differ/,
    '…and that the same step does not mean the same danger');
});

/* ── ⑤ the hazard is on the map ────────────────────────────────────────────────────────────── */
test('R273 ⑤ the area carries the hazard’s own name, and says when more than one is in force', () => {
  const s = WP();
  assert.match(s, /hz:hz\+\(extra\?\(' \+'\+extra\):''\)/, 'a second warning in the same unit must not vanish');
  assert.match(s, /'text-field':\['get','hzs'\]/, 'the small form is a property, not an expression on zoom');
  assert.match(s, /'text-field':\['get','hz'\]/, '…and so is the full one');
  /* ⚠ two LAYERS with minzoom/maxzoom, because `['step',['zoom'],['get',…]]` in `text-field` is a
     style-time error in MapLibre — measured, it took the whole page down */
  assert.match(s, /id:'wp-alert-lbls'[\s\S]{0,120}maxzoom:5/, 'the abbreviation is a layer below z5');
  assert.match(s, /id:'wp-alert-lbl'[\s\S]{0,120}minzoom:5/, '…and the full name a layer above it');
  /* an acronym is not a short name: 「MTW+4」 is a code the reader has no key to */
  assert.match(s, /const HZ_DROP=/, 'the short form drops the RANK words, which the colour already says');
  assert.ok(!/map\(x=>x\.charAt\(0\)\.toUpperCase\(\)\)\.join\(''\)/.test(s), 'no initials');
  /* ⚠⚠ (#R273 追記) …and the answer must survive the opacity slider. MEASURED on production:
     `line-opacity` on `wp-alert-line` was **0.38**, because `_applyGenericOpacity` dims every layer
     the checkbox declares — including the outline that was given the rank to carry. The fill and
     the country wash follow the slider; the outline and the label do not. */
  const reg = /legendId:'wpalerts', layers:\(\)=>\[([^\]]*)\]/.exec(s);
  assert.ok(reg, 'the opacity targets must be declared');
  assert.ok(reg[1].includes("'wp-alert-fill'"), 'the fill follows the slider');
  /* ⚠ (#R298) THE RULE IS ABOUT THE RANK, NOT ABOUT THE LAYER. The outline layer draws two
     different things: the outline of a WARNED unit, which carries the rank and must survive a fill
     you can see through, and the outline of a `norm` 0 unit, which is the DIVISION between two
     greys and is part of the wash. MEASURED on production: with the slider at 0 the quiet units and
     their outlines were still painted at full strength — 「発表無しポリゴンだけ不透明度選択の対象外
     なのを辞めろ」. So the layer IS a target and its opacity is an EXPRESSION: 0.95 where the rank
     is, the slider where it is not — the same shape `hatchOp`/`choroOp` already use, and ⑯ below is
     what stops the slider flattening it back to a scalar. */
  assert.ok(reg[1].includes("'wp-alert-line'"), 'the outline is a target…');
  assert.match(s, /const lineOp=\(v\)=>\['case',\['>',\['get','norm'\],0\],0\.95,/,
    '…but the rank keeps its own opacity, and only the quiet division follows the slider');
  assert.match(s, /OE\['wp-alert-line'\]=lineOp;/, 'and the builder is registered, so the scalar never lands');
  assert.ok(!reg[1].includes('wp-alert-lbl'), 'the hazard name does not follow the slider');
});

/* ── ⑥ four grades, not one green dot ──────────────────────────────────────────────────────── */
test('R273 ⑥ Fresh / Delayed / Stale / Error are four states with four colours', () => {
  const s = WP();
  const g = /const GRADE_COL=\{([^}]*)\}/.exec(s);
  assert.ok(g, 'the grade palette must exist');
  for (const k of ['fresh', 'delayed', 'stale', 'error', 'loading']) {
    assert.ok(g[1].includes(k + ':'), k + ' has no colour of its own');
  }
  const cols = [...g[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((m) => m[1]);
  assert.ok(new Set(cols).size >= 4, `the grades must be distinguishable, got ${cols}`);
  assert.match(s, /function grade\(k\)/, 'and one function that decides which');
});

/* ── ⑦ the panel answers 「どこで何が」 before it answers 「どのAPIから」 ─────────────────────── */
test('R273 ⑦ the panel leads with what is in force and folds the source list away', () => {
  const s = WP();
  assert.match(s, /function hotList\(\)/, 'the first thing must be what is in force');
  assert.match(s, /function sourceList\(\)/, '…and the sources must still be complete');
  const o = s.slice(s.indexOf('function overview()'), s.indexOf('function tick()'));
  assert.ok(o.indexOf('hotList()') < o.indexOf('sourceList()'), 'the sources come after, not first');
  assert.match(o, /<details[\s\S]{0,400}sourceList\(\)/, '…and behind a disclosure');
  assert.match(o, /<details[\s\S]{0,900}placedLine\(\)/, 'the placement diagnostics one level below that');
  /* 「左の数字が比較不能」 — every source line counts the SAME thing */
  assert.match(s, /const drawnCount=\(iso\)=>/, 'one unit for every source');
  assert.match(s, /n\+' '\s*\n?\s*\+esc\(L\('areas'/, '…and it is labelled as areas');
});

/* ── ⑧ 「これ長すぎ」 ───────────────────────────────────────────────────────────────────────── */
test('R273 ⑧ the attribution under the panel is one sentence', () => {
  const s = WP();
  const m = /Each country is drawn from its own agency, at the unit that agency issues for\. [^']*/.exec(s);
  assert.ok(m, 'the attribution must exist');
  assert.ok(m[0].length < 200, `the attribution is ${m[0].length} characters — it must stay a sentence`);
  /* the paragraph it replaces named eighteen countries and three failure modes */
  assert.ok(!/were probed this round and none of them has a public feed/.test(s),
    'the eighteen-country paragraph must be gone');
});

/* ── ⑨ one close mark, in the app’s own font ───────────────────────────────────────────────── */
test('R273 ⑨ every × in the app is U+00D7, which Inter actually draws', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) { if (!/node_modules|dist|test-results/.test(rel)) walk(rel); }
    else if (/\.(js|css|html)$/.test(e.name)) files.push(rel); } };
  walk('js'); walk('css');
  /* ⚠ THE RAW FILE, COMMENTS INCLUDED. The note in js/map-ui.js that records this measurement
     NAMES the two code points instead of typing them, precisely so this sweep can be the strong
     version — 「自分の検査が自分のコメントに当たった」 is a shape this repo has hit nine times, and the
     answer is to change the input rather than to weaken the instrument (#R267). */
  const bad = files.filter((f) => read(f).includes('✕'));
  assert.deepEqual(bad, [], 'U+2715 has no glyph in ANY family this app names — measured, the advance '
    + 'is 13.07 px in Inter, Noto Sans JP, system-ui, sans-serif and Arial alike, i.e. all five fall '
    + 'through to the platform symbol font. Files still using it: ' + bad);
  assert.match(read('js/map-ui.js'), /window\.IntMapClearGlyph=function\(\)\{ return '×'; \};/,
    'the two search boxes share ONE definition of the mark');
});

/* ── ⑩ the Serbo-Croatian standards are one hue ────────────────────────────────────────────── */
test('R273 ⑩ Serbian, Croatian, Bosnian and Montenegrin are near-identical colours', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  assert.match(s, /const FAM_BCMS=\{ sr:0, cnr:1, bs:2, hr:3, sh:4 \}/, 'the family must be named');
  const m = /const FAM_COL=\[([^\]]*)\]/.exec(s);
  assert.ok(m, 'the family palette must exist');
  const cols = [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((c) => c[1]);
  assert.equal(cols.length, 5, 'one colour per standard');
  assert.equal(new Set(cols).size, 5, 'and each of them distinct — a key needs to answer WHICH');
  /* «almost the same colour»: one hue, separated by lightness. Measured as the max pairwise
     difference of the hue angle over the five. */
  const hue = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255,
    b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360; };
  const hs = cols.map(hue);
  const spread = Math.max(...hs) - Math.min(...hs);
  assert.ok(spread <= 12, `the family must share a hue — spread is ${spread.toFixed(1)}°`);
  /* and the generated palette must never hand one of these to another language */
  assert.match(s, /FAM_COL\.forEach\(c=>\{ seen\[c\.toLowerCase\(\)\]=1; \}\)/, 'the family colours are reserved');
  assert.match(s, /if\(key==='language'&&FAM_BCMS\[cat\]!=null\) return FAM_COL\[FAM_BCMS\[cat\]\]/,
    'and the layer must actually paint from them');
});

/* ── ⑪ the water model: a resolution dial and a run you can repeat ─────────────────────────── */
test('R273 ⑪ the flow model has a resolution the reader chooses, and it is kept', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /const RES_D=\[384,512,768,1024\], RES_M=\[150,192,256,384\]/, 'the steps must be named');
  assert.match(s, /localStorage\.getItem\('im\.twRes'\)/, 'and the choice kept');
  assert.match(s, /const NX=resNX\(\);/, 'the grid must be built at the chosen step');
  /* the default went UP — 「解像度が低すぎる」 */
  assert.match(s, /return _mob\(\)\?192:512;/, 'the desktop default must be 512, not 384');
  /* changing it must not move the working rectangle to wherever the camera happens to be */
  assert.match(s, /if\(opt&&opt\.keep&&G&&G\.bbox\)\{/, 'a resolution rebuild keeps the same rectangle');
  assert.match(s, /build\(\{keep:true\}\)/, '…and the control must use it');
  assert.match(s, /function syncRes\(\)/, 'and the cell it produces must be printed');
});

test('R273 ⑪ a run can be repeated without throwing the terrain or the sources away', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  const m = /function replay\(\)\{([\s\S]*?)\n    function resetSim/.exec(s);
  assert.ok(m, 'replay() must exist');
  assert.match(m[1], /pourSimS=0;/, 'the clock goes back to zero');
  /* ⚠⚠ (#R275) BOTH KINDS, ONE LINE. 「一回きりの水源、再生できない。ふざけるな。」 came back: the
     button was right and there was nothing for it to restart, because a one-shot volume was a still
     lake rather than a run. `m3` is what a source has DELIVERED — for both kinds now — so putting it
     back to zero IS the replay, and there is no second field to reset. */
  assert.match(m[1], /sources\.forEach\(x=>\{ x\.m3=0; \}\);/,
    'every source’s delivery goes back to zero — a source’s m3 is what it has DELIVERED');
  assert.ok(!/x\.cont/.test(m[1]), 'and the two kinds are replayed the same way');
  assert.match(m[1], /resetSim\(\);/, 'and the water with it');
  /* ⚠ the one door every mutation in that file has to pass — four rounds have found something
     that skipped it (#R255 brush, #R258 addLevee, #R268 reset, #R271 addSource) */
  assert.match(m[1], /editDirty\(\);/, 'replay must go through editDirty()');
  assert.ok(!/sculpt=new Float32Array/.test(m[1]), 'it must NOT throw the sculpted ground away');
  assert.ok(!/sources=\[\]/.test(m[1]), '…nor the sources');
  assert.match(s, /class="tw-play tw-replay"/, 'and there must be a control for it');
});

test('R273 ⑪ the panel has one control height and one gap', () => {
  const s = read('js/terrain-water.js');
  const rule = (sel) => { const i = s.indexOf("'" + sel + '{'); assert.ok(i > 0, sel + ' must be styled here');
    return s.slice(i, s.indexOf('}', i)).split("'+'").join(''); };
  const play = rule('.tw-play'), btn = rule('.tw-btn');
  const h = (r) => +(/(?:min-)?height:(\d+)px/.exec(r) || [])[1];
  assert.equal(h(play), h(btn), `the transport and the buttons must be the same height (${h(play)} vs ${h(btn)})`);
  assert.match(s, /#tw-panel \.tw-foot \.tw-segwrap\{height:'\+TW_CTL\+'/, '…and so must the speed strip');
  /* ⚠ (#R275) 36 was the number; ONE HEIGHT is the property. It is a declaration now because the
     panel was rescaled to the size every other legend uses (「内部要素のサイズが大きすぎる」), and the
     three controls have to move together or the footer goes back to having three heights. */
  assert.match(s, /const TW_CTL=_mob\(\)\?'(\d+)px':'(\d+)px';/, 'and that height is one declaration');
  /* two containers were touching: the tool picker ended exactly where the card below it began */
  assert.match(s, /#tw-panel \.tw-body > div > \* \+ \*\{margin-top:'\+TW_GAP\+';\}/, 'siblings in a section are spaced');
  /* (#R275) the pinned tool block is a second place a caption can be, so the rule names both */
  assert.match(s, /#tw-panel \.tw-body > div > \.tw-cap \+ \*[^{]*\{margin-top:0;\}/,
    '…except under a caption, which already carries its own gap');
});

/* ── ⑫ the shelves say what is on them ─────────────────────────────────────────────────────── */
test('R273 ⑫ the population shelf is renamed in every language, because the economy left it', () => {
  const s = read('js/data-layers.js');
  const m = /\['lyrGrpDemo',\[([^\]]*)\]\]/.exec(s);
  assert.ok(m, 'the shelf must exist');
  assert.ok(!/'gdppc'/.test(m[1]), 'GDP per capita left for Economy');
  assert.ok(!/'hdi'/.test(m[1]), 'HDI left for Society');
  for (const f of ['js/locales/ui.en.js', 'js/locales/ui.jp.js', 'js/locales/ui.de.js', 'js/locales/ui.ru.js',
    'js/locales/ui.es.js', 'js/locales/ui.fr.js', 'js/locales/ui.ko.js', 'js/locales/ui.zh.js',
    'js/locales/ui.zh-hans.js']) {
    const t = read(f);
    const v = /lyrGrpDemo"?\s*:\s*"([^"]*)"/.exec(t);
    assert.ok(v, f + ' declares no name for the shelf');
    assert.ok(!/economy|Wirtschaft|экономик|economía|économie|経済|经济|經濟|경제/i.test(v[1]),
      f + ' still calls the shelf «economy»: ' + v[1]);
  }
});

/* ── the refresh is real time, and every feed is on it ─────────────────────────────────────── */
test('R273 the refresh interval is a named bound and every feed is graded against it', () => {
  const s = WP();
  const ms = +/const TICK_MS=(\d+)/.exec(s)[1];
  assert.ok(ms > 0 && ms <= 30000, `the interval is ${ms} ms — 「リアルタイムにと言っている」`);
  const keys = /const FEED_KEYS=\[([^\]]*)\]/.exec(s);
  assert.ok(keys, 'the feed list must be one array');
  const list = [...keys[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  const feeds = /const FEEDS=\{([\s\S]*?)\};/.exec(s)[1];
  const used = new Set([...feeds.matchAll(/:'([a-z]+)'/g)].map((m) => m[1]));
  for (const f of used) assert.ok(list.includes(f), f + ' is routed to but never graded');
});
