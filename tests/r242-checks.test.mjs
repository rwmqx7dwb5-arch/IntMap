/* ============================================================================
 *  IntMap · #R242 — source-level contracts for this round
 * ----------------------------------------------------------------------------
 *  Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
 *  which is the only thing that makes a green suite mean anything (#R228).
 *  Comments are stripped before matching wherever a test looks for a fragment that this file's own
 *  prose could contain ([[intmap-recurring-lessons]] E, eight rounds running).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① Atlas is never docked, and it says so where the panel is born ──────────────────────────── */
test('R242 ① the Atlas panel opts out of the dock at creation, not at settings time', () => {
  const c = code(read('js/atlas-console.js'));
  const ensure = c.slice(c.indexOf("panel.id='atlas-panel'"), c.indexOf("panel.id='atlas-panel'") + 400);
  assert.ok(/dataset\.nodock\s*=\s*'1'/.test(ensure),
    'js/atlas-console.js must set data-nodock where #atlas-panel is created — applyDockMode runs at boot, before the lazy panel exists');
  /* …and window-manager must NOT be the one that writes it, or there are two owners again */
  assert.ok(!/getElementById\('atlas-panel'\)[^\n]*nodock/.test(code(read('js/window-manager.js'))),
    'js/window-manager.js must not write the Atlas opt-out: the panel does, at creation');
});

test('R242 ① the dock stylesheet no longer caters for a docked Atlas', () => {
  const css = read('css/intmap.css');
  assert.ok(!/\.im-docked\s+\.atl-chat/.test(css) && !/\.im-docked\s+\.atl-ex/.test(css),
    '.im-docked .atl-chat / .atl-ex only existed because Atlas was being docked — both must be gone');
});

/* ── ② the dock's empty line is a readout of the count ────────────────────────────────────────── */
test('R242 ② the "legends will appear here" line follows the docked count in both directions', () => {
  const wm = code(read('js/window-manager.js'));
  for (const fn of ['_dockOne', '_undockOne', 'setDocked', 'dockRefresh']) {
    const i = wm.indexOf('function ' + fn);
    assert.ok(i > 0, fn + ' must exist');
    assert.ok(wm.slice(i, i + 1400).includes('_dockEmptySync()'),
      fn + ' must re-sync the empty line — otherwise closing the last panel leaves a blank column');
  }
  assert.ok(/window\._dockEmptyRender\s*=/.test(code(read('js/news-ui.js'))),
    'js/news-ui.js owns the WORDS (it knows the language) and must publish the renderer');
});

test('R242 ② a panel that arrives on its own brings its tab forward', () => {
  const wm = code(read('js/window-manager.js'));
  assert.ok(/function _reveal\(/.test(wm), '_reveal must exist');
  assert.ok(/if\(!__dockBulk\)\s*_reveal\(el\)/.test(wm),
    'only a panel that docks OUTSIDE a bulk sweep may pull the tab forward');
  assert.ok(/OS\.exec\('tab\.docked'/.test(wm), 'the tab is opened through the OS action, not by poking currentMode');
});

/* ── ③ the phone's rail gets its own 10 px ────────────────────────────────────────────────────── */
test('R242 ③ #docked-feed reserves the scrollbar width on a phone', () => {
  /* ⚠ the sheet is CRLF: slice by INDEX, never by a literal containing \n — #R241 shipped an
     always-green test that way — and assert on the rule inside the phone block only. */
  const css = read('css/intmap.css').replace(/\r/g, '');
  /* the phone rule is the ONE `#docked-feed{…}` that cancels the sheet's inset — matching on that
     pair identifies it without depending on which @media block happens to come first in the file. */
  const rules = [...css.matchAll(/#docked-feed\{([^}]*)\}/g)].map((m) => m[1]);
  const phone = rules.filter((r) => /margin-left:-16px/.test(r));
  assert.equal(phone.length, 1, 'exactly one full-bleed #docked-feed rule (the phone one)');
  assert.ok(/padding-right:10px/.test(phone[0]),
    'the overlay scrollbar is painted inside the feed; without a gutter it lands on the panel');
});

/* ── ④ the quake panel: one Advanced fold, no tick track ──────────────────────────────────────── */
test('R242 ④ there is exactly one 詳細設定 and the ✓ track is gone', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function _advHTML\(/.test(c), 'the merged Advanced fold must exist');
  assert.equal((c.match(/<details class="sq-adv-box"/g) || []).length, 1, 'one <details> for the advanced settings');
  assert.ok(!/sq-fadv-box|sq-madv-box/.test(c), 'the two old folds must be gone, not hidden');
  assert.ok(!/class="sq-track"/.test(c) && !/sq-fkdot/.test(c), 'the footer tick track was asked to be removed');
  assert.ok(/class="sq-foot"/.test(c) && /sq-fhint/.test(c), '…but the hint and the primary button stay');
});

test('R242 ④ the site table fits: one elastic column, the unit in the header', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/\.sq-st-nm\{[^']*width:100%;max-width:0/.test(c.replace(/'\s*\+\s*'/g, '')),
    'the place column is the only elastic one — that is what keeps the intensity chip on screen');
  assert.ok(!/\+' km<\/td>'/.test(c), 'Δ prints a bare number; the unit is in the column head');
});

test('R242 ④ the intensity legend paints the class number itself', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/class="sq-lgc"[^]*?background:'\+k\.col/.test(c), 'the legend chip carries the class colour as its own background');
  assert.ok(/function _onCol\(/.test(c), 'and the ink is chosen from that colour, not fixed');
});

test('R242 ④ the observed-values block is a table', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/<table class="sq-obs">/.test(c), 'what was observed is name/value rows, not a paragraph');
});

test('R242 ④ a loaded earthquake can be unloaded, and the feed clears it', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/function clearEvent\(/.test(c), 'clearEvent must exist');
  assert.ok(/if\(v===''\)\{\s*clearEvent\(\);/.test(c), 'the empty option in the list clears the selection');
  assert.ok(/class="sq-ev-x"/.test(c), 'and there is a visible ✕ while something is loaded');
  const ar = c.indexOf('function applyReal(');
  assert.ok(/evNow=null/.test(c.slice(ar, ar + 200)),
    'loading from the USGS feed must clear the curated event, or its 実測値 table stays on screen');
});

test('R242 ④ the observation cities are drawn on the map', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/kind:'city'/.test(c) && /'seis-city'/.test(c) && /'seis-city-n'/.test(c),
    'obsCities() feeds the table AND the map — a named city with nothing on the map is the report');
});

test('R242 ④ the transport is a player and the tsunami hand-off is the loud thing in the card', () => {
  const c = code(read('js/seismic.js'));
  assert.ok(/class="sq-player/.test(c) && /SVG_PLAY/.test(c) && /class="sq-spdc/.test(c),
    'round play/pause, a real scrubber and a segmented rate');
  assert.ok(!/class="sq-play sq-btn"/.test(c), 'the old 36 px text button must be gone');
  /* ⚠ (#R244) 「Open the tsunami simulatorにはマークを使うな。」 — the glyph in its translucent disc is
     gone (tests/r244 ④ pins that it stays gone). What THIS line has always been about survives: the
     button is still the only FILLED element in the result card, which is the 「もっと目立たせろ」 of
     #R242, and it now says what it does in words alone. */
  assert.ok(/class="sq-tsu"/.test(c) && /linear-gradient\(135deg,#0a84ff/.test(c),
    'the tsunami button is the only filled element in the result card');
  assert.ok(!/sq-tsu-ic/.test(c), 'and it carries no mark');
});

/* ── ⑤ the seismic simulator is reachable from the Layers panel ───────────────────────────────── */
test('R242 ⑤ the Layers panel opens the seismic simulator through the OS action', () => {
  assert.ok(/btn-seismic-sim/.test(code(read('js/data-layers.js'))), 'the Tools strip must carry the button');
  assert.ok(/IntMapOS\.register\('sim\.seismic'/.test(code(read('js/app-body.js'))),
    'one command, so the palette, Atlas and this button are one path');
});

/* ── ⑥ the place-label language is a table, and it covers every language ──────────────────────── */
test('R242 ⑥ every language the registry knows has an OSM name key', () => {
  const pl = code(read('js/place-labels.js'));
  const m = /const OSM_LANG=\{([\s\S]*?)\};/.exec(pl);
  assert.ok(m, 'OSM_LANG must exist — the else-if chain of five is what left fr/ko/zh in English');
  const have = new Set([...m[1].matchAll(/(?:^|[,{\s])'?([a-z-]+)'?\s*:/g)].map((x) => x[1]));
  const codes = readdirSync(join(ROOT, 'js', 'locales'))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => f.slice(3, -3));
  for (const c of codes) assert.ok(have.has(c), 'js/place-labels.js OSM_LANG has no row for «' + c + '»');
  assert.ok(!/HOST\.lang==='de'/.test(pl), 'the per-language else-if chain must be gone, not extended');
});

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

/* ── ⑧ the tsunami animation ──────────────────────────────────────────────────────────────────── */
test('R242 ⑧ the near-source picture is undecimated over a window', () => {
  const t = code(read('js/tsunami.js'));
  assert.ok(/function nearDec\(\)\{ return 1; \}/.test(t), 'the near animation is no longer decimated');
  assert.ok(/NEAR_WIN_DEG/.test(t) && /winI0/.test(t) && /winNx/.test(t), 'and it is cropped to the source region');
  assert.ok(/sim\.lng0==null\?-180:sim\.lng0/.test(t), 'the image is placed by the window, not by ±180');
  const w = code(read('src/tsunami-worker.js'));
  assert.ok(/const winNx =/.test(w) && /wcol\s*=/.test(w), 'the worker emits the window, wrapping at the antimeridian');
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

/* ── ⑩ the ninth translation surface is measured and printed ──────────────────────────────────── */
test('R242 ⑩ the gate reports the helper-ternary gap rather than hiding it', () => {
  const g = code(read('scripts/i18n-audit.mjs'));
  assert.ok(/i18n-helper-ternary-audit\.mjs/.test(g), 'the ninth surface must run inside the ONE gate');
  assert.ok(/OPEN GAP/.test(read('scripts/i18n-audit.mjs')), 'and its number must be printed, not swallowed');
  assert.ok(existsSync(join(ROOT, 'scripts', 'i18n-helper-ternary-audit.mjs')));
});
