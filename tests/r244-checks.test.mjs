/* ============================================================================
 *  #R244 — source-level checks
 * ----------------------------------------------------------------------------
 *  Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
 *  standing rule). Each names the defect it pins rather than the code that fixes it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① THE SEISMIC PANEL DRAWS DIFFERENT CARDS IN DIFFERENT STATES, SO NO WIRING MAY ASSUME ONE ═══
   #R243 stopped rendering cards ② and ③ for a loaded earthquake and left `panel.querySelector('.sq-fdraw').onclick = …`
   in the wiring block. With one loaded that threw `Cannot set properties of null`, which aborted the
   rest of the wiring (measured: `.sq-play`, `.sq-t`, `.sq-scale`, `.sq-op` had NO handler) AND threw
   out of `applyEvent()` before it could fetch the published finite-fault outline — so the map kept
   the offline rectangle. That is 「過去の地震の震源域などの精度が落ちている」. It is the second time
   this exact shape has shipped (#R236, `.sq-real`), so the check is on the SHAPE. */
test('r244 ① no unguarded querySelector assignment in js/seismic.js', () => {
  const src = read('js/seismic.js');
  const ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true });
  const bad = [];
  walk.simple(ast, {
    AssignmentExpression(n) {
      const l = n.left;
      if (l.type !== 'MemberExpression' || l.computed) return;
      const o = l.object;
      if (!(o.type === 'CallExpression' && o.callee.type === 'MemberExpression'
        && !o.callee.computed && o.callee.property.name === 'querySelector')) return;
      bad.push(`${n.loc.start.line}: ${src.slice(n.start, n.start + 70).split('\n')[0]}`);
    },
  });
  assert.deepEqual(bad, [], 'a control this panel only renders in SOME states must be looked up into a variable and guarded');
});

/* ② …and the same for reading a property off one. `panel.querySelector('.sq-tv').textContent = …`
   inside the playback loop is the same crash one frame later. */
test('r244 ② the seismic transport tolerates a panel without the transport', () => {
  const src = code('js/seismic.js');
  assert.ok(!/querySelector\('\.sq-tv'\)\.textContent\s*=/.test(src), '.sq-tv must be guarded');
  assert.ok(/const tl=panel\.querySelector\('\.sq-t'\); if\(tl\)/.test(src), '.sq-t must be guarded');
});

/* ══ ③ ONE PROGRESS READOUT ═══════════════════════════════════════════════════════════════════════
   「計算進捗ボタンが二つあるから下部のものだけにしろ。」 #R243 built a second `.sq-prog` in card 4
   AND kept the one in the pinned footer. `_progHTML` is called exactly once now, from `_flowFoot`. */
test('r244 ③ the seismic panel builds exactly one progress bar, in the footer', () => {
  const src = code('js/seismic.js');
  const calls = src.match(/_progHTML\(/g) || [];
  assert.equal(calls.length, 2, 'one declaration + one call site');   /* the `function _progHTML(` + one use */
  assert.ok(/sq-foot-prog[^]{0,80}_progHTML\('sq-prog-foot'\)/.test(src), 'the one call is the footer’s');
});

/* ④ 「Open the tsunami simulatorにはマークを使うな。」 */
test('r244 ④ the tsunami button carries no glyph', () => {
  const src = code('js/seismic.js');
  assert.ok(!/sq-tsu-ic/.test(src), 'the icon disc and its class are gone');
});

/* ══ ⑤ THE FAR FIELD MEASURES THE DISTANCE THE FINE FIELD MEASURES ════════════════════════════════
   「震源の外側に数千キロ規模の四角形の線がありそこで震度分布が断絶している。」 `buildFar` passed
   `srcDistM` the great-circle range to the rupture's CENTROID while `buildField` passes Rrup, so at
   the seam between the two images the same place was ~250 km further away on one side than the other
   (Tōhoku). The seam is the fine image's lat/lng box — the 四角形. */
test('r244 ⑤ buildFar subtracts the rupture’s reach before srcDistM', () => {
  const src = code('js/seismic.js');
  assert.ok(/function rupReach\(/.test(src), 'the bearing-indexed reach table exists');
  assert.ok(/const reach=rupReach\(C0\)/.test(src), 'buildFar builds it');
  assert.ok(/km=Math\.max\(0,kmC-reach\[/.test(src), 'and the painted distance is Rrup, not the centroid range');
});

/* ══ ⑥ THE ADDRESS THE READER OPENED IS READ BEFORE ANYTHING CAN OVERWRITE IT ═════════════════════
   「再読み込み時に情報が保持されなくなっている。」 `save()` is armed on `moveend` with a 400 ms timer
   and `restore()` waits for the renderer's `load`, so the default camera was written over the hash
   before the restorer parsed it (measured: `intmap_restore_try` held the DEFAULT hash). */
test('r244 ⑥ the bookmark restores from the boot hash and writes nothing before it', () => {
  const src = code('js/map-ui.js');
  assert.ok(/const BOOT_HASH=\(function\(\)\{ try\{ return location\.hash/.test(src), 'the opened address is captured at evaluation time');
  assert.ok(/function save\(\)\{ if\(!booted \|\| restoring/.test(src), 'nothing is written before the boot restore has run');
  assert.ok(/const H=\(opts&&opts\.shared===true\)\?location\.hash:\(bootDone\?location\.hash:BOOT_HASH\)/.test(src), 'the boot pass parses BOOT_HASH');
  /* …and every read inside restore() goes through it — a stray `location.hash` there is the bug back */
  const body = src.slice(src.indexOf('function restore(opts){'), src.indexOf('GE().events.on(\'moveend\''));
  const strays = (body.match(/location\.hash/g) || []).length;
  assert.equal(strays, 2, 'only the two in the `H` line itself');
});

/* ⑦ 「左右のサイドバーの開閉持ち手部分の色味が統一されていない」 — measured: the left handle computed
   to rgb(28,28,30) + saturate(1.5) blur(16px), the right to rgba(28,28,30,0.85) + blur(20px),
   because the shared glass-material rule named one and not the other. */
test('r244 ⑦ both sidebar handles read the one glass material', () => {
  const css = read('css/intmap.css');
  const rule = css.slice(css.indexOf('.ai-view-summary-btn,.btn-toggle-sidebar'));
  const decl = rule.slice(0, rule.indexOf('}'));
  assert.ok(/#lsr-toggle/.test(decl), 'the right sidebar’s handle is in the material list');
  assert.ok(/\.btn-toggle-sidebar/.test(decl), '…and so is the left one');
});

/* ⑧ 「Live aircraft trafficの民間機の色は山吹色に。」 — and it is written ONCE: the flat glyph and the
   two extrusion cases drifted apart in #R173, which is why `_feHex` exists. */
test('r244 ⑧ the civil-aircraft colour is 山吹色 and lives in one constant', () => {
  const src = code('js/data-layers.js');
  assert.ok(/const PLANE_CIV='#f8b500';/.test(src), 'the JIS 山吹色, declared once');
  assert.ok(!/#1e90ff/.test(src), 'no dodger-blue civil aircraft left anywhere');
  assert.equal((src.match(/PLANE_CIV/g) || []).length, 4, 'the declaration plus the glyph and the two extrusion cases');
});

/* ⑨ 「Stand and look upは視界部分とパネル部分が重ならないように。視界部分のほうを画面の上側に。」
   The two boxes are bands that cannot intersect: the lens is `height:VIEW_VH vh` from the top, the
   panel starts at exactly `VIEW_VH vh`. */
test('r244 ⑨ the standing sky view and its panel are disjoint bands', () => {
  const src = code('js/night-sky.js');
  assert.ok(/const VIEW_VH = 60;/.test(src), 'the share of the viewport the lens keeps');
  assert.ok(/top:0;height:' \+ VIEW_VH \+ 'vh/.test(src), 'the lens is the TOP band');
  assert.ok(/top:' \+ VIEW_VH \+ 'vh/.test(src), 'the panel starts where the lens ends');
});

/* ⑩ 「アメリカ大統領選挙レイヤーは、操作時に凡例が上に伸びるのではなく下に伸びるように。」 */
test('r244 ⑩ a legend may declare that it grows downward, and the election legend does', () => {
  assert.ok(/dataset\.growDown==='1'/.test(code('js/data-layers.js')), 'tileLegends honours the flag');
  assert.ok(/el\.dataset\.growDown='1'/.test(code('js/us-elections.js')), 'the election legend sets it');
});

/* ⑪ 「郵便番号で地点検索したら、その範囲が、地名ラベルをクリックした時みたいにハイライトされるように。」
   ⚠ and the #R59 rule holds: no polygon ⇒ nothing is drawn (never a rectangle). */
test('r244 ⑪ a postcode search outlines its real boundary and never a box', () => {
  const src = code('js/search-geocode.js');
  assert.ok(/postalcode='\+encodeURIComponent\(code\)/.test(src), 'the structured postcode query, not free text');
  /* ⚠ and BOUNDED to where the search landed: `postalcode=10115` alone returns Zagreb, Manhattan,
     Gimpo and Bouira before it ever reaches the Berlin the reader picked (measured). */
  assert.ok(/bounded=1&viewbox='\+\(lng-d\)/.test(src), 'bounded to the point that was flown to');
  assert.ok(/if\(!polys\.length\) return;/.test(src), 'no real boundary → draw NOTHING');
  assert.ok(/IntMapOutline && window\.IntMapOutline\.clear/.test(src), 'closing the card clears the outline');
});

/* ⑫ 「全凡例はパネルにいくように。（パネル設定時）」 — a second, independent path into the same sweep,
   so the column cannot depend on one MutationObserver having been armed at the right moment. */
test('r244 ⑫ a layer toggle re-runs the dock sweep', () => {
  const src = code('js/window-manager.js');
  assert.ok(/dl-\|gx-\|eco-dl-/.test(src), 'the layer-checkbox ids the listener watches');
  assert.ok(/setTimeout\(\(\)=>\{ try\{ dockRefresh\(\); \}catch\(_\)\{\} \},260\)/.test(src), 'and it calls the ONE sweep');
});

/* ══ ⑬ THE ELEVENTH SHAPE IS MEASURED, AND THE INSTRUMENT CANNOT BE QUIETLY DELETED ═══════════════
   A tuple of translations keyed by LANGUAGE CODE — `{en:'Tibet',jp:'チベット',…}` read as
   `nm[lg]||nm.en`. Invisible to every other instrument, and English for every language the object
   does not name. The count is an OPEN GAP in the one gate (#R242's rule for a gap too large to close
   in the round that finds it): printed, never counted in a percentage, and never absent. */
test('r244 ⑬ the language-keyed-object surface is in the one gate', () => {
  const src = read('scripts/i18n-audit.mjs');
  assert.ok(/i18n-langmap-audit\.mjs/.test(src), 'the gate spawns the instrument');
  assert.ok(/OPEN GAP — translation tuples held as an OBJECT/.test(src), 'and prints the number');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'i18n-langmap-audit.mjs'), '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const j = JSON.parse(out);
  assert.ok(typeof j.total === 'number', 'it answers with a number');
  /* ⚠ THE RATCHET: this number only ever goes DOWN. #R244 measured 713 after converting 15 sites. */
  assert.ok(j.total <= 713, `the open gap grew to ${j.total} — a new language-keyed object was added; write it as pickArgs() instead`);
});

/* ⑭ 「詳細設定」の左の▲・▶が微妙にUIに隠れている — the fold carries the card's own inset now. */
test('r244 ⑭ the 詳細設定 fold is inset like every other row in its card', () => {
  const src = code('js/seismic.js');
  assert.ok(/'\.sq-adv-box\{padding:0 11px 7px;/.test(src), 'the fold is inset by the row padding');
  assert.ok(/'\.sq-adv-box \.sq-row\{padding-left:0;padding-right:0;\}'/.test(src), '…and its rows do not indent twice');
});

/* ⑮ the published finite-fault outline is sampled like the rectangle it replaced */
test('r244 ⑮ the published rupture ring is densified along great circles', () => {
  const src = code('js/seismic-events.js');
  assert.ok(/const densifyRing = \(ring, maxKm\) =>/.test(src), 'nested in its one caller — tests/r175 ③');
  assert.ok(/ring: densifyRing\(ring, 50\)/.test(src), 'the fetched outline goes through it');
});
