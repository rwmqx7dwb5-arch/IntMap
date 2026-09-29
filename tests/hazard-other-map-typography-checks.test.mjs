/* ============================================================================
 *  MAP TYPOGRAPHY — the glyph atlases, the font variable and the characters Inter draws
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The glyph builder is run; the font variable and the
 *    MapLibre glyph redirection are CSS and page-closure wiring, which are read.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs, { existsSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r242-checks.test.mjs (tests #15, #16, #17, #19 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */

/* ── ⑦ the typeface, both surfaces ────────────────────────────────────────────────────────────── */
test('R242 ⑦ the UI reads one font variable, set per language', () => {
  const f = read('css/fonts.css');
  for (const fam of ['Inter', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans TC', 'Pretendard']) {
    assert.ok(f.includes(fam), 'css/fonts.css must name ' + fam);
  }
  assert.ok(/html\[lang="ja" i\]/.test(f) && /html\[lang="zh-Hant" i\]/.test(f) && /html\[lang="zh-Hans" i\]/.test(f)
    && /html\[lang="ko" i\]/.test(f), 'the selectors must be case-insensitive — the registry writes zh-Hant');
  const css = read('css/intmap.css');
  assert.ok(/body,input,select,textarea,button\{ font-family:var\(--im-font\); \}/.test(css),
    'css/intmap.css must read the variable rather than name a face');
  assert.ok(/font-family:var\(--im-font\)/.test(read('css/pages.css')), 'the reading pages use the same stack');
  assert.ok(read('index.html').includes('css/fonts.css'), 'index.html must load it');
});

test('R242 ⑦ the map is redirected to the bundled Inter atlases, and the ranges are one list', () => {
  const app = code(read('js/app-body.js')), mt = code(read('js/map-typography.js'));
  assert.ok(/localIdeographFontFamily:MT\(\)\.cjkFamily\(\)/.test(app), 'CJK/Hangul labels come from the UI faces');
  assert.ok(/transformRequest:MT\(\)\.glyphRewrite/.test(app), 'Latin/Cyrillic labels come from our own atlases');
  const a = /const GLYPH_RANGES = \[([^\]]+)\]/.exec(mt);
  const b = /export const RANGES = \[([^\]]+)\]/.exec(read('scripts/build-glyphs.mjs'));
  assert.ok(a && b, 'both lists must exist');
  assert.deepEqual(a[1].split(',').map((s) => +s.trim()), b[1].split(',').map((s) => +s.trim()),
    'the app and the generator must agree about which ranges are self-hosted');
  for (const r of b[1].split(',').map((s) => +s.trim())) {
    assert.ok(existsSync(join(ROOT, 'fonts', 'Inter Regular', r + '-' + (r + 255) + '.pbf')),
      'fonts/Inter Regular/' + r + '-' + (r + 255) + '.pbf is missing — run node scripts/build-glyphs.mjs');
  }
  assert.ok(read('vite.config.js').includes("'fonts',"), 'the fonts directory must be deployed');
});

test('R242 ⑦ the flag-font shim keeps the stack live', () => {
  const app = code(read('js/map-typography.js'));
  assert.ok(/b\.style\.fontFamily = '"Twemoji Country Flags", var\(--im-font\)'/.test(app),
    'freezing getComputedStyle would outlive every language change');
});

/* ── ⑨ the news bands are measured, not estimated ─────────────────────────────────────────────── */
test('R242 ⑨ a news band reserves the box it will actually occupy', () => {
  const app = code(read('js/map-typography.js'));
  assert.ok(/function bandBox\(/.test(app), 'the pill is measured');
  assert.ok(/measureText/.test(app) && /subAt\(/.test(app), '…at the real text size, in the real font');
  const i = app.indexOf('function declutterNewsBands');
  const body = app.slice(i, i + 2600);
  assert.ok(!/Math\.min\(txt\.length,16\)\*6\.4/.test(body), 'the character-count estimate must not decide the layout');
  assert.ok(/GAP/.test(body), 'and the pills are kept apart, not merely non-overlapping');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #1, #2 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{
const node = (...a) => execFileSync(process.execPath, a.map((x) => (x.startsWith('-') ? x : join(ROOT, x))), { cwd: ROOT, encoding: 'utf8' });

/* ── ① the map's own letters sit on the baseline ──────────────────────────────────────────────── */
test('R243 ① every committed glyph carries the metrics the font says, `top` included', () => {
  /* --check re-derives every glyph from fonts/src/Inter.ttf and compares width/height/left/top/
     advance against the committed atlas. #R242's version compared only the SET of codepoints, which
     a file with every glyph at the wrong `top` passes without a word — that was the defect. */
  const out = node('scripts/build-glyphs.mjs', '--check');
  assert.ok(/glyph atlases check out/.test(out), 'scripts/build-glyphs.mjs --check must pass:\n' + out);
});

test('R243 ① the builder writes `top` as the distance to the TOP of the box', () => {
  const c = code(read('scripts/build-glyphs.mjs'));
  /* ⚠ (#R247) the EDGE is still the top of the box (that is what this test was written for) — what
     changed is the ORIGIN it is measured from. A server font's `top` is relative to a point 27 units
     ABOVE the alphabetic baseline, not to the baseline itself (MapLibre calls the same number
     `topAdjustment = 27.5` where it converts TinySDF metrics into this convention). Writing it from
     the baseline drew every Latin glyph 1.125 em high, which is invisible on a bare place label and
     is why the news band's pill and its text came apart. */
  assert.ok(/left:\s*x0,\s*top:\s*-y0\s*-\s*TOP_ORIGIN,/.test(c),
    '`top: -y0 - h` is the distance to the glyph BOTTOM and `-y0` alone is measured from the wrong '
    + 'origin — MapLibre places the quad at (−top − border) in the SERVER convention');
  assert.ok(/const TOP_ORIGIN\s*=\s*27\b/.test(c),
    'and the origin is 27 units above the baseline — measured against the font this atlas replaces');
  assert.ok(/o\.top\s*\|\s*0\)\s*!==\s*g\.top/.test(c) || /o\.top\s*!==\s*g\.top/.test(c),
    '--check must compare `top`, or a wrong metric can be committed again');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #1, #2 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */

/* ── ① THE GLYPH ORIGIN ───────────────────────────────────────────────────────────────────────
   The reported defect was 「ニュースピンの帯から文字位置がずれてはみ出ている」 and the cause was one
   metric: a SERVER font's `top` is measured from an origin 27 units above the alphabetic baseline
   (MapLibre calls the same number `topAdjustment = 27.5` where it converts TinySDF glyphs into this
   convention), and this atlas was writing it from the baseline. Every Latin and Cyrillic glyph was
   drawn 1.125 em high — invisible on a bare place label, and unmissable inside a pill that is fitted
   to the metric-independent shaping box. */
test('r247 ① the glyph atlas writes `top` from the server origin, not from the baseline', () => {
  const c = code(read('scripts/build-glyphs.mjs'));
  assert.match(c, /const TOP_ORIGIN\s*=\s*27\b/, 'the origin is a named constant');
  assert.match(c, /top:\s*-y0\s*-\s*TOP_ORIGIN/, '…and `top` is measured from it');
});

/* ⚠ AND THE COMMITTED ATLAS AGREES WITH THE FONT IT REPLACES. `--check` re-derives every glyph from
   fonts/src/Inter.ttf, so a stale atlas (the metric fixed in the script and not in the files, which
   is exactly what shipping half this change would look like) fails here rather than in production. */
test('r247 ① the committed atlas is the one this builder produces', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-glyphs.mjs'), '--check'],
    { encoding: 'utf8', stdio: 'pipe' });
});
}

/* ═══ from tests/r273-checks.test.mjs (tests #10 of 16) ═══
    #R273 — source-level checks
    What this round was asked for, and what each test holds:

      ① 「GDACSを完全に撤廃しろ」「ソースは一国一ソース」「対応国も増やせ」
      ② 「日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ」
      ③ 「まだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に」
      ④ 「各国の警報階級を同じ紫・赤・黄に押し込んでいる」→ 各国公式配色 / IntMap換算の切替
      ⑤ 「何の警報なのか地図から分からない」→ 種別を区域に文字で、重複は +N
      ⑥ 「更新時間31.1hと2minが同列」→ Fresh / Delayed / Stale / Error
      ⑦ 「一覧が取得先一覧になっている」→ パネルは「どこで何が」から始まる
      ⑧ 「これ長すぎ」→ 出典の一文
      ⑨ 「なにか形がおかしい×をやめろ」→ アプリ全体で1つの ×
      ⑩ 「セルビア語系言語は似た色味に」
      ⑪ 「水流シミュレーションの解像度が低すぎる」「一回きりの水源、再生できない」
      ⑫ 「大規模にレイヤーカテゴリ分類を再編しろ」→ 見出しの名前が中身と一致する

    ⚠ EVERY «X is gone» ASSERTION IS WRITTEN IN THE SYNTAX X WAS WRITTEN IN, and against the source
    with its comments stripped — the prose that RECORDS a removal is not evidence against it. That
    is #R266's own lesson, and it has cost this repo a round twice. */
{

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
}
