/* ============================================================================
 *  IntMap · #R245 — source-level checks
 * ----------------------------------------------------------------------------
 *  Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
 *  against the symptom, so it fails on the shipped code that produced the report.
 *
 *  ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
 *  quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => {
  const src = read(p);
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = (e < 0 ? src.length : e + 2); continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = (e < 0 ? src.length : e); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
};

/* ── ① the pinned footer is PINNED: it is a sibling of .sq-body, not a child ────────────────────
   「ポップアップ時に震度分布を計算が下部スティックになっていない。」 Card 1 opened three boxes and
   closed two, so the parser nested cards 2…6 inside card 1 and `_flowFoot()` landed INSIDE the
   scroller. Measured on the shipped build: panel 80…706, `.sq-foot` 1510…1580.
   ⚠ This counts the tags rather than matching a literal, so any future card that forgets a closer
   fails here too — the defect was an imbalance, so the test is about balance. */
test('r245 ① the seismic panel closes every box it opens, so the footer stays out of the scroller', () => {
  const src = code('js/seismic.js');
  const i = src.indexOf("panel.innerHTML='<div class=\"sq-head\"");
  assert.ok(i > 0, 'render() builds the panel here');
  const j = src.indexOf('+_flowFoot();', i);
  assert.ok(j > i, 'and finishes with the pinned footer');
  const body = src.slice(i, j);
  /* only the literal markup in this template — every `<div` and `</div>` inside a quoted string */
  const opens = (body.match(/<div\b/g) || []).length;
  const closes = (body.match(/<\/div>/g) || []).length;
  assert.equal(opens, closes,
    `the panel markup opens ${opens} <div> and closes ${closes} — an imbalance nests the footer inside .sq-body`);
});

/* ── ② the transport is not a media player ───────────────────────────────────────────────────────
   「再生ボタンは音楽プレーヤー風ではなく、もっとシンプルな洗練されたUIにしろ。」 Three rounds restyled
   the same ⏮ ▶ ⏭ cluster; what goes is the ARRANGEMENT. Every class and handler stays. */
test('r245 ② the seismic transport keeps its mechanism and loses the media-player idiom', () => {
  const src = code('js/seismic.js');
  for (const cls of ['sq-play', 'sq-t', 'sq-tv', 'sq-pl-jump', 'sq-spdc', 'sq-spd'])
    assert.ok(src.includes(cls), `${cls} is still there — this is a re-dress, not a second mechanism`);
  assert.ok(!/sq-pl-top/.test(src), 'the centred ⏮ ▶ ⏭ cluster is gone');
  assert.ok(!/SVG_START|SVG_END/.test(src.slice(src.indexOf('sq-player'))),
    'the two jumps are words, not transport glyphs');
  assert.ok(/'\.sq-play\{[^']*width:32px/.test(src), 'a 32 px control, not a 46 px accent disc');
  assert.ok(/sq-segwrap sq-pl-chips/.test(src), "the rate rides the panel's own segmented control");
});

/* ── ③ the notice was reworded, and the inline tables were re-keyed with it ─────────────────────
   ⚠ #R235's rule: the English string IS the key fr/ko/zh/zh-Hans are stored under, so a reworded
   sentence silently drops four languages unless they move in the same change. */
test('r245 ③ the reworded safety notice reaches every language', () => {
  const EN = 'An educational model. In a real emergency, follow the instructions of the official authorities. It does not predict whether damage will occur. Keep your everyday preparations ready.';
  assert.ok(read('js/seismic.js').includes(EN), 'the seismic panel carries the new wording');
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) {
    const s = read(`js/locales/ui.${c}.js`);
    assert.ok(s.includes(JSON.stringify(EN)) || s.includes(EN),
      `ui.${c}.js is keyed by the new sentence`);
  }
});

/* ── ④ the far field and the fine image tile exactly ────────────────────────────────────────────
   「震源の外側に数千キロ規模の四角形の線がありそこで震度分布が断絶している。」 The line was the far
   raster's ALPHA being interpolated towards its transparent cells along the fine image's box. Two
   things fix it and both have to be present: the box is snapped onto the far raster's own cell grid
   (so no cell is drawn twice or dropped) and the far layer stops interpolating. */
test('r245 ④ the intensity field has one boundary, on the grid, with no fade across it', () => {
  const src = code('js/seismic.js');
  assert.ok(/const FAR_N=\(\)=>/.test(src), 'the far grid size is declared once, for both functions');
  assert.ok(/snapLngFar/.test(src) && /snapLatFar/.test(src), 'the fine box is snapped to that grid');
  assert.ok(/const W=snapLngFar\(/.test(src) && /const Nn=snapLatFar\(/.test(src), '…and the snap is what W/E/Nn/Ss are');
  assert.ok(/'raster-resampling':'nearest'/.test(src), 'the far layer does not interpolate towards its transparent cells');
  /* and the seam must stay a partition: no margin, no overlap */
  assert.ok(/if\(km<=rFine\|\|km>rEdge\) continue;/.test(src), 'the inner limit is rFine itself');
  assert.ok(/if\(lo>=box\.W&&lo<=box\.E&&la>=box\.Ss&&la<=box\.Nn\) continue;/.test(src),
    'and the box test is the box, not the box plus or minus a margin');
});

/* ── ⑤ the dock watch cannot go stale ───────────────────────────────────────────────────────────
   「ケッペンの気候区分レイヤの凡例はパネルにいかない。全凡例はパネルにいくように。」 The flag saying
   «this element is already watched» lived ON THE ELEMENT and was cleared only for `__winReg`, which
   never holds a legend — so after mode off→on the new observer watched nothing. The invariant is
   «watched by THIS observer», so the set must live and die with it. */
test('r245 ⑤ the dock observer owns its own watched set', () => {
  const src = code('js/window-manager.js');
  assert.ok(!/__imDockWatched/.test(src), 'no per-element flag that can outlive the observer');
  assert.ok(/let __dockWatched=null;/.test(src), 'the set is a variable beside the observer');
  assert.ok(/__dockWatched=new WeakSet\(\);/.test(src), '…created with it');
  assert.ok(/__dockObs=null; \} __dockWatched=null;/.test(src), '…and thrown away with it');
});

/* ── ⑥ the first aircraft answer is drawn when it arrives ───────────────────────────────────────
   「Live aircraft trafficで航空機が表示されるまでが遅い。」 `lastPub` starts at the sweep's start, so
   the in-loop publish could not fire before PLANE_PUBLISH_MS — the centre circle's aircraft sat in
   `byHex` for four seconds. The request PACE is not touched: that is the measured limit. */
test('r245 ⑥ a live-aircraft sweep publishes its first success immediately', () => {
  const src = code('js/data-layers.js');
  assert.ok(/if\(ok>0&&\(published===0 \? circles\.length>1 : Date\.now\(\)-lastPub>=PLANE_PUBLISH_MS\)\) publish\(false\);/.test(src),
    'the first success publishes; the 4 s cadence takes over after it');
  assert.ok(/const PLANE_GAP_MS=1200;/.test(src), 'the measured spacing between requests is unchanged');
});

/* ── ⑦ the standing sky view tiles the screen ───────────────────────────────────────────────────
   「Stand and look upはパネル部分をもう少しパネルの領域範囲を整理して。」 A constant split (#R244's
   VIEW_VH) cannot be right — the panel's height depends on the language and the font. */
test('r245 ⑦ the standing view is two flex bands and three columns of controls', () => {
  const src = code('js/night-sky.js');
  /* ⚠ the NAME still appears in the note that explains why it went, so the check is on the CODE
     that used it: the lens was `top:0;height:' + VIEW_VH + 'vh` and the panel `top:' + VIEW_VH`. */
  assert.ok(!/\+ VIEW_VH \+/.test(src), 'nothing is positioned by the constant split any more');
  assert.ok(/flex:1 1 auto;min-height:0/.test(src), 'the lens takes what is left');
  assert.ok(/flex:0 0 auto/.test(src), 'the panel takes what its controls need');
  assert.ok(/ns-cols/.test(src) && /grid-template-columns/.test(src), 'the controls are three columns in the band');
});

/* ── ⑧ the eleventh translation shape, in the files this round closed ───────────────────────────
   A tuple of translations held as an object keyed by language code is invisible to every instrument
   and has no inline-table fallback (#R244). These nine files no longer contain one, and the ONE
   gate's number is ratcheted so it can only go down. */
test('r245 ⑧ nine more files hold their translation tuples as calls, and the count only falls', async () => {
  const CLOSED = ['js/data-layers.js', 'js/history.js', 'js/space-cosmos.js', 'js/flight-sim.js',
    'js/world-packs.js', 'js/map-extras.js', 'js/engine-select.js', 'js/ocean-currents.js'];
  const CODES = new Set(['en', 'jp', 'ja', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans', 'zh-hant']);
  const CODEY = /^[A-Za-z][A-Za-z0-9_.-]{0,7}$/, URLISH = /^[^\s]*[=&?][^\s]*$/;
  const isProse = (v) => !CODEY.test(v) && !URLISH.test(v);
  let total = 0;
  for (const f of CLOSED) {
    const src = read(f);
    const ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' });
    let n = 0;
    walk.simple(ast, { ObjectExpression(o) {
      const vals = []; let langs = 0;
      for (const p of o.properties) {
        if (p.type !== 'Property' || p.computed) continue;
        const k = p.key.type === 'Identifier' ? p.key.name : (p.key.type === 'Literal' ? String(p.key.value) : null);
        if (k == null || !CODES.has(String(k).toLowerCase())) continue;
        if (!(p.value.type === 'Literal' && typeof p.value.value === 'string')) continue;
        langs++; vals.push(p.value.value);
      }
      if (langs >= 2 && vals.some(isProse)) n++;
    } });
    assert.equal(n, 0, `${f} still holds ${n} translation tuple(s) as a language-keyed object`);
    total += n;
  }
  assert.equal(total, 0);
});

/* ⚠ …and the RATCHET on what is left, so the number this round measured cannot creep back up.
   #R244 left 713; this round leaves 590. The rule #R242 set for an OPEN GAP is that it is printed
   rather than hidden, and that it only ever goes down. */
test('r245 ⑧b the language-keyed-object count is a ratchet', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-langmap-audit.mjs'), '--json'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const n = JSON.parse(out).total;
  assert.ok(n <= 590, `the eleventh shape is at ${n}; #R245 left it at 590 and it may only go down`);
});

/* ── ⑨ the climate names are ONE table, and every reader goes through one lookup ────────────────
   They were four tables (an `{en,jp}` literal plus `_kde`/`_kru`/`_kes` patched on at load), which
   is the two-lists defect and the eleventh shape at the same time. */
test('r245 ⑨ Köppen names are one table and one accessor', () => {
  const src = code('js/data-layers.js');
  assert.ok(!/_kde|_kru|_kes/.test(src), 'no per-language patch tables');
  assert.equal((src.match(/window\.KNAME=/g) || []).length, 1, 'one declaration');
  assert.ok(/window\.kName=function\(code\)\{[^}]*LDL\.arr\(e\)/.test(src), 'the accessor resolves through pick()');
  for (const [f, pat] of [['js/map-ui.js', /window\.kName\(c\)/], ['js/map-readout.js', /window\.kName\(code\)/]])
    assert.ok(pat.test(code(f)), `${f} asks that accessor rather than reading the table`);
});
