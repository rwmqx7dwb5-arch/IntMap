/* ============================================================================
 *  Map tools: drawing and 3-D solids, the context menu, point picking, search boxes, the toolbar, drone and routing
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r217-checks.test.mjs, tests/r204-checks.test.mjs, tests/r268-checks.test.mjs, tests/r184-checks.test.mjs, tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs, tests/r254-checks.test.mjs, tests/r271-checks.test.mjs, tests/r305-checks.test.mjs, tests/r307-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code, codeOnly as noComments } from '../scripts/code-only.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r217-checks.test.mjs — 2 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（ツールバーの並び）・js/search-geocode.js は DOM に閉じている */
/* (#R217) the round's header note is kept with its largest block, in tests/layer-place-labels-rivers-checks.test.mjs */
const rd = read;

/* ═══ ⑥ THE TWO UI PLACEMENTS THIS ROUND WAS ALSO ASKED FOR ════════════════════════════════════ */

test('R217 ⑥a: Objects sits to the LEFT of Measure, not between Measure and Share', () => {
  const h = rd('index.html');
  const objects = h.indexOf('id="btn-tool-objects"');
  const measure = h.indexOf('class="measure-menu-container"');
  const share = h.indexOf('class="share-menu-container"');
  assert.ok(objects > 0 && measure > 0 && share > 0, 'all three are in the toolbar');
  assert.ok(objects < measure, 'Objects comes before the Measure menu in the toolbar row');
  assert.ok(measure < share, 'Measure still comes before Share');
});

test('R217 ⑥b: dropping a pin from the place-search card closes the card', () => {
  const s = rd('js/search-geocode.js');
  assert.match(s, /#src-pin'\)\.onclick=\(\)=>\{ const id=HOST\.addPin\(lng,lat\); HOST\.openPinPopup\(id\); closeSearchCard\(\); \};/,
    'the pin is dropped and its popup opened BEFORE the card is torn down');
});
}

/* ══════════ from tests/r204-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R204) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */
const rd = read;

/* ── ⑧ THE RIGHT-CLICK MENU ───────────────────────────────────────────────────────────────────── */
test('R204 ⑧ the context menu is grouped, in five languages, and nothing was dropped', () => {
  const tp = rd('js/tool-panel.js');
  const heads = [...tp.matchAll(/\{h:L\((.*?)\),head:true\}/g)];
  assert.ok(heads.length >= 3, `${heads.length} section headings`);
  for (const h of heads) assert.equal(h[1].split("','").length, 5, `heading ${h[1]} is not five languages`);
  /* every entry that existed before still exists — counted by its action target */
  for (const m of ['IntMapStreetView', 'addPin', 'ctxCopy', 'IntMapShare', 'openComposeModal', 'setTool',
    '_radiusFromPoint', 'IntMapWeather', 'RunwaySearch', 'IntMapLOS', 'IntMapIsochrone',
    'IntMapTerrainWater', 'IntMapSeismic', 'IntMapSun', 'clearAllPins', 'askHere'])
    assert.ok(tp.includes(m), `the context menu lost ${m}`);
  /* ⚠ the button index is its position, not indexOf — two identical labels would collide.
     (#R205) THIS PIN NAMED THE RENDERING LOOP AND BROKE THE FIRST TIME THE RENDERING CHANGED
     (`items.map((it,i)=>{` → a forEach that emits sections). The invariant was never the loop; it is
     that the index handed to a button is the entry's OWN position in `items`, which is what
     `indexOf` gets wrong. So: the index comes from the iteration, and `indexOf` appears nowhere. */
  assert.match(tp, /items\.(map|forEach)\(\((it|_),\s*i\)\s*=>/);
  assert.match(tp, /<button data-act="\$\{i\}">/);
  assert.doesNotMatch(tp, /data-act="\$\{items\.indexOf\(it\)\}"/);
});
}

/* ══════════ from tests/r268-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（検索欄の CSS） */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

/* ── ⑪ the search box's clear button, and the precipitation tile ───────────────────────────── */
test('R268 ⑪ neither layer-search clear button paints a background', () => {
  for (const f of ['js/map-ui.js', 'js/map-extras.js']) {
    const s = read(f);
    const cls = f.includes('map-ui') ? 'lsr-clear' : 'ls-clear';
    const rules = [...s.matchAll(new RegExp('[^\\n]*' + cls + '[^\\n]*', 'g'))].map((m) => m[0]);
    const painted = rules.filter((r) => /background:\s*rgba?\(/i.test(r));
    assert.equal(painted.length, 0, `${f}: ${cls} still has a background disc: ${painted[0] || ''}`);
  }
});
}

/* ══════════ from tests/r184-checks.test.mjs — 2 of its 9 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R184) the round's header note is kept with its largest block, in tests/layer-space-satellites-checks.test.mjs */

const root = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const rd = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n')
  : readFileSync(new URL(p, root), 'utf8'));

/* ── ⑧ THE DRONE AND ROUTE ADDITIONS ARE WIRED INTO ATLAS TOO ─────────────────────────────── */
test('R184 #8: the new drone and routing capabilities are reachable from Atlas and documented in SYS', () => {
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = (rd('js/atlas-console.js') + '\n' + capsSource()) + '\n' + rd('js/atlas-catalog-text.js');
  /* drone: the operational checks and the three route actions */
  for (const act of ['prepare', 'compare', 'rth', 'conflicts']) {
    assert.ok(atlas.includes(`act==='${act}'`), `the drone action "${act}" is dispatched`);
  }
  assert.match(atlas, /action "prepare" \(or "check"\)/, 'the drone SYS entry describes the checks');
  assert.match(atlas, /EMERGENCY LANDING SITES/, 'including the ones that are new capabilities, not new words');
  /* routing: the three request-shaping options */
  assert.match(atlas, /"avoidAreas"\?:/, 'the directions SYS entry documents the keep-out area');
  assert.match(atlas, /"transitModes"\?:/, '…the transit mode allow-list');
  assert.match(atlas, /"maxWalkM"\?:/, '…and the walking cap');
  assert.match(atlas, /avoidAreas:_areas/, 'and the action actually passes them through');
});

/* ── ⑨ THE SEAMS #R174 DECLARED ARE THE ONES THAT GOT FILLED ──────────────────────────────── */
test('R184 #9: drone-ops attaches through the published seams rather than editing the planner', () => {
  const ops = rd('js/drone-ops.js'), nav = rd('js/drone-nav.js');
  assert.match(ops, /registerWindField/, 'the wind field goes in through the documented seam');
  for (const id of ['wind', 'link', 'nofly', 'return']) {
    assert.ok(new RegExp(`registerHazardSource\\('${id}'`).test(ops), `the "${id}" source registers itself`);
  }
  /* the planner still exports the seams — removing them would break this file silently */
  assert.match(nav, /registerHazardSource,\s*unregisterHazardSource,\s*hazardSourceIds,\s*registerWindField/,
    'js/drone-nav.js still publishes the seams');
  /* every finding kind the ops module produces has a translated label in the planner's one table */
  const kinds = [...ops.matchAll(/kind:'([a-z-]+)'/g)].map((m) => m[1]);
  const labelled = nav.match(/function kindLabel\(k\)\{[\s\S]*?\n  \}/)[0];
  const missing = [...new Set(kinds)].filter((k) => !labelled.includes(`'${k}'`));
  assert.deepEqual(missing, [], 'a finding kind with no label prints its internal slug to the operator');
});
}

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 11. wide 3-D bodies follow the curvature ──────────────────────────────────────────────────── */
test('R212 ⑪: a solid’s outline is densified and its caps are subdivided with one count', () => {
  const s = read('js/solid3d.js');
  assert.match(s, /const SEG_KM=\d+, MAX_N=\d+/);
  assert.match(s, /function densify/, 'the outline gains points so the walls curve');
  assert.match(s, /capN=Math\.max\(capN,Math\.min\(MAX_N/, 'ONE subdivision count for the whole mesh…');
  assert.match(s, /const u=\(capN-i\)\/capN, v=\(i-j\)\/capN, w=j\/capN/, '…applied barycentrically (no T-junctions)');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 2 of its 19 test(s) ══════════ */
{
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ═══ ③ A SOLID FOLLOWS THE GREAT CIRCLE ═════════════════════════════════════════════════════
   「3D立体は…単なる多角形ではなく、地球の曲がりに沿ったものにして。（追記：いやなんで大圏考慮して
   ないねんくそが。）」 — the identity: a densified edge's midpoint is ON the great circle, which for a
   pair of points on the equator/meridian has an answer nobody has to trust the implementation for. */
function densifier() {
  const src = read('js/volume3d.js');
  const a = src.indexOf('const _D=Math.PI/180;');
  const b = src.indexOf('function closedRing()');
  assert.ok(a > 0 && b > a, 'the great-circle helpers are where this test expects them');
  const win = {};
  new Function('out', src.slice(a, b) + '\nout.gcPoints=gcPoints; out.densify=densify;')(win);
  return win;
}

test('R215 ③a: a densified edge lies on the great circle between its ends', () => {
  const { densify } = densifier();
  /* along a meridian the great circle IS the meridian: every inserted point keeps the longitude */
  const merid = densify([[10, 0], [10, 60]]);
  assert.ok(merid.length > 2, 'a 6,600 km edge is subdivided');
  merid.forEach((p) => assert.ok(Math.abs(p[0] - 10) < 1e-9, 'a meridian stays at its longitude'));
  /* along the equator the great circle IS the equator */
  const eq = densify([[0, 0], [80, 0]]);
  eq.forEach((p) => assert.ok(Math.abs(p[1]) < 1e-9, 'the equator stays at latitude 0'));
  /* and OFF those two special cases the inserted point is NOT the straight-line midpoint — which is
     the entire defect being fixed. Tokyo → Los Angeles: the great circle passes far north of it. */
  const tk = [139.69, 35.69], la = [-118.24, 34.05];
  const mid = densify([tk, la]);
  const half = mid[Math.floor(mid.length / 2)];
  assert.ok(half[1] > 45, `the great circle bulges north (got ${half[1].toFixed(1)}°, the chord midpoint is ~35°)`);
});

test('R215 ③b: densifying preserves the ends, the winding and the closure', () => {
  const { densify } = densifier();
  const ring = [[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]];
  const d = densify(ring);
  assert.deepEqual(d[0], [0, 0], 'the first vertex is the first clicked vertex');
  assert.equal(d[d.length - 1][0], 0, 'and the ring still closes on it');
  assert.equal(d[d.length - 1][1], 0);
  /* no jump longer than 180° anywhere — the unwrap rule, which is what stops a body being drawn
     the long way round the world */
  for (let i = 1; i < d.length; i++) assert.ok(Math.abs(d[i][0] - d[i - 1][0]) <= 180, 'longitudes are unwrapped');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 3 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑦ the right-click menu says which point once ───────────────────────────────────── */
test('#R216 ⑦ the context menu does not repeat 「この」「ここ」 on every entry', () => {
  const s = read('js/tool-panel.js');
  const menu = s.slice(s.indexOf('function showContextMenu'), s.indexOf('function place('));
  assert.ok(menu.length > 500, 'the menu body was not found');
  const hits = (menu.match(/'(ここ|この地点|ここの|この表示)/g) || []);
  assert.deepEqual(hits, [], 'deictic labels are back in the context menu: ' + hits.join(', '));
  /* the coordinate row is the coordinate, not a label plus the coordinate */
  assert.match(s, /\{coord:HOST\.fmtLL\(/, 'the coordinate row still carries a label (icon-system: its pin is drawn beside it by the menu, js/icons.js «pin»)');
});
test('#R216 ⑦ …and the i18n keys it shares carry no deixis either, in all five languages', () => {
  const s = read('js/i18n.js');
  for (const bad of ['ここにピンを刺す', 'ここから計測を開始', 'ここに投稿', 'Drop pin here', 'Start measure from here', 'Post here (community)'])
    assert.equal(s.includes(bad), false, 'js/i18n.js still has ' + bad);
});

/* ── ⑨ the 3-D solid is always fully triangulated ───────────────────────────────────── */
test('#R216 ⑨ ear clipping never abandons a ring half-covered', () => {
  const s = read('js/solid3d.js');
  const fn = s.slice(s.indexOf('function triangulate('), s.indexOf('/* ---- shaders'));
  assert.equal(/if\(!clipped\)\s*break;/.test(fn), false, 'the clipper can still give up and leave a hole');
  assert.match(fn, /if\(cut<0\)\s*cut=\(bestConvex>=0\)\?bestConvex:0/, 'there is no forced ear');
  assert.match(fn, /1e-13/, 'consecutive duplicates are not removed');
});
}

/* ══════════ from tests/r254-checks.test.mjs — 1 of its 11 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R254) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

/* ── ⑨ THE FINE PLACE NAME ───────────────────────────────────────────────────────────────────── */
test('#R254 ⑨ a name the search cannot surface is asked of OpenStreetMap itself', () => {
  const mt = code(read('js/map-tools.js'));
  assert.match(mt, /async function _overpassArea\(/, 'the Overpass fallback is gone');
  assert.match(mt, /relation\["name"="/, 'the fallback does not look for a relation — a 丁目 boundary usually is one');
  assert.match(mt, /nominatim\.openstreetmap\.org\/lookup\?osm_ids=/,
    'the polygon is not fetched through the same geometry endpoint as every other outline');
  /* it must run ONLY after the tight search found nothing, or every click costs an Overpass query */
  const i = mt.indexOf('bounded=1'), j = mt.lastIndexOf('_overpassArea(q'), k = mt.indexOf('const d=8');
  assert.ok(i >= 0 && j > i && k > j, 'the Overpass pass is not between the tight search and the wide one');
});
}

/* ══════════ from tests/r271-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R271) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */

/* ── ④ the clear mark is placed from the field ──────────────────────────────────────────────── */
test('R271 ④ the ✕ is measured against the input, not the box around it', () => {
  const s = codeOnly(read('js/map-ui.js'));
  assert.match(s, /window\.IntMapPlaceClear\s*=/, 'one definition, because there are two search boxes');
  const m = /window\.IntMapPlaceClear=function\(inp,btn,gap\)\{([\s\S]*?)\n  return place; \};/.exec(s.replace(/\s*\n\s*/g, '\n'))
         || /IntMapPlaceClear=function[\s\S]*?return place;/.exec(s);
  assert.ok(m, 'the helper must exist');
  assert.match(m[0], /inp\.offsetTop/, 'the vertical placement must come from the field’s own box');
  assert.match(m[0], /inp\.offsetHeight/, '…and from its height, not the wrapper’s');
  /* both boxes must use it — #R239's standing lesson */
  assert.match(codeOnly(read('js/map-ui.js')), /IntMapPlaceClear\(inp,b\)/, 'the sidebar box calls it');
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(codeOnly(read('js/map-extras.js')), /IntMapPlaceClear\(/, 'and the classic panel box is gone');
});
}

/* ══════════ from tests/r305-checks.test.mjs — 3 of its 17 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R305) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-five times; ask the question of the text that RUNS. */

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  「地点を選ばないといけない系のツール…いや並行してどちらも出てくるとかあほか。」
 * ==========================================================================================*/

/* ── ⑬ one gesture says its sentence once ───────────────────────────────────────────────────*/
test('R305 ⑬ the shared bar can arm without speaking', () => {
  const s = noComments(read('js/map-pick.js'));
  assert.match(s, /if\(o\.announce!==false\)\{/, 'the banner is optional');
  assert.match(s, /\} else if\(bar\) bar\.style\.display='none';/,
    'and a silent arm takes down a banner an earlier gesture left up');
  /* everything the gesture IS stays on both paths */
  assert.match(s, /if\(panel&&o\.hidePanel!==false\)\{ s\.prevStyle=_ghost\(panel\); s\.hid=true; \}/,
    'the panel is still ghosted (#R207/#R219)');
  assert.match(s, /GE\(\)\.render\.canvas\(\)\.style\.cursor='crosshair';/, 'the crosshair is still set');
  assert.match(s, /document\.addEventListener\('keydown',s\.esc,true\);/, 'Esc still cancels');
});

/* ── ⑭ …and the tools list is the caller that has its own voice ──────────────────────────────
   ⚠ THE RED MESSAGE IS THE ONE THE READER ASKED FOR — 「普通の既存の赤メッセージ使ってください」 — so
   it is the bar that goes quiet here, not the toast. */
test('R305 ⑭ a tool row asks with the red toast and nothing else', () => {
  const s = noComments(read('js/map-ui.js'));
  const ap = /function _askPoint\(run,id\)\{[\s\S]{0,2600}?\n    \}/.exec(s);
  assert.ok(ap, '_askPoint must be findable');
  assert.match(ap[0], /P\.start\(\{ onPick:\(ll\)=>end\(ll\), onCancel:\(\)=>end\(null\), hint:ask, announce:false \}\)/,
    'the shared bar is armed silently');
  assert.match(ap[0], /\(HOST\.imToast\|\|HOST\.satToast\)\(ask\);/,
    "…and the app's own red toast is what says it (#R302)");
  /* one sentence object, so nine languages cannot drift apart */
  assert.match(ap[0], /const ask=\(name\?\(name\+' — '\):''\)\+T\(/, 'the bar and the toast share one string');
});

/* ── ⑮ the sun panel speaks in its own status line, once ─────────────────────────────────────*/
test('R305 ⑮ the sun panel does not say it twice either', () => {
  const s = noComments(read('js/sims.js'));
  const ask = /function askSite\(\)\{[\s\S]{0,700}?catch\(_\)\{ return false; \} \}/.exec(s);
  assert.ok(ask, 'askSite must be findable');
  assert.match(ask[0], /engSay\(_pickMsg\(\)\);/, 'the panel line is where the sentence goes');
  assert.match(ask[0], /announce:false/, 'and the bar is armed silently');
  /* the callers must not print it a second time on top of askSite's own line */
  assert.ok(!/engSay\(_pickMsg\(\)\); askSite\(\);/.test(s),
    'no caller repeats the sentence before calling askSite');
  /* …and the point still reaches the panel */
  assert.match(ask[0], /onPick:\(ll\)=>\{ engSay\(''\); setSite\(ll\);/,
    'answering the question clears it');
});
}

/* ══════════ from tests/r307-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/tool-panel.js・js/map-ui.js・js/map-pick.js・js/solid3d.js・js/map-tools.js・js/drone-ops.js などは DOM・WebGL・地図の入力に閉じたファクトリで node では組み立てられない（大圏の稠密化は切り出して実行している） */
/* (#R307) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing */
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-balanced (the #R228 helper, and the answer to
   #R306's ⚠ about character-counted windows: ask the BODY, not a byte range around a name) */
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'function ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ══ ⑨ 地点を選ばせろ ═════════════════════════════════════════════════════════════════════════ */
test('R307 ⑨ a tool row asks for its own point every time', () => {
  const s = code('js/map-ui.js');
  const ask = fnBody(s, '_askPoint');
  assert.ok(/P\.start\(\{ onPick/.test(ask), 'the gesture is armed');
  /* the defect was a short-circuit BEFORE the gesture: 「had」 → fire() with a remembered point */
  assert.ok(!/const had=/.test(ask), 'and nothing answers ahead of it');
  assert.ok(!/_chosenLL|_picked|userPins/.test(s),
    'no remembered point and no pin fallback is left in this file for it to come back through');
  /* …and the half of #R299 that must survive: the rows that need no point are still not asked */
  const rows = (s.match(/run:\(\)=>_askPoint\(/g) || []).length;
  /* (science-instruments) five: los · reach · sun · nightSky, and sim.ashPlume — from this list there is no
     volcano under the cursor, so the tapped point becomes the vent (the row's own comment in js/map-ui.js) */
  assert.equal(rows, 5, 'exactly the five rows that cannot answer without a coordinate');
  assert.ok(/id:'sim\.terrainWater'/.test(s) && !/sim\.terrainWater'[\s\S]{0,400}?_askPoint/.test(s),
    'the terrain/water simulator opens on the view rectangle and is not asked');
  /* #R305: one gesture, one voice — the shared bar stays silent for a caller that speaks */
  assert.ok(/announce:false/.test(ask), 'and exactly one thing says so');
});
}
