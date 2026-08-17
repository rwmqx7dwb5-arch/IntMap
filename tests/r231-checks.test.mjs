/* ============================================================================
 *  IntMap · #R231 — source-level regression checks
 * ----------------------------------------------------------------------------
 *  One test per claim this round makes, written against the SOURCE rather than against a rendered
 *  page, because every one of these is a structural property: a list that must have one owner, a
 *  route that must not exist, a coordinate system that must come from one box.
 *
 *  ⚠ THE ASSERTIONS ARE RELATIONS, NOT THIS ROUND'S NUMBERS. Pinning a measured value here is the
 *  defect this project keeps re-learning (#R198, #R199, #R203, #R218, #R226): the next round moves
 *  the number in the direction it was asked to, and its own test fails. So the checks below ask
 *  "does the launch screen name every registered language" and not "does it name seven", and
 *  "is the field of the dark mark the dark screen colour" and not "is it #000000 at 89.7 %".
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* CRLF is what git hands these files out as on Windows (#R215): compare TEXT, never line endings */
const flat = (p) => read(p).split('\r').join('');

/* ⚠⚠ A NEGATIVE CHECK MUST READ CODE, NOT PROSE — and this file proved it on its first run. Five of
   the assertions below failed against a correct tree because the thing they were looking for is
   quoted in the COMMENT that explains its removal: `#0a0a0c`, the magnifier, `monitors:'tab.monitors'`
   and `{timeout:2000}` are all named in the note that says they are gone. #R208 and #R229 hit exactly
   this ("a check whose regex matches its own comment"), so the rule is now a helper: strip comments,
   then match syntax. */
const noJs = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')                       /* block comments */
  .replace(/^[ \t]*\/\/.*$/gm, ' ');                       /* whole-line // comments */
const noHtml = (p) => read(p).replace(/<!--[\s\S]*?-->/g, ' ');
const noCss = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── ⓪ the build stamp, both halves ─────────────────────────────────────────────────────────── */
test('R231 build: index.html names the same round in both stamps', () => {
  const h = read('index.html');
  const a = h.match(/window\.__imBuild='(R\d+)'/);
  const b = h.match(/window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-(R\d+)'/);
  assert.ok(a && b, 'both stamps present');
  assert.equal(a[1], b[1], 'the two stamps name the same round');
  /* ⚠ (#R232) THE ROUND NUMBER IS NOT THE PROPERTY — this line pinned R231 and would fail on every
     round after it, which is the shape #R203 warned about (「前回のpinを値で書くと同じ方向の指示で自分が
     落ちる」). What #R231 was protecting is that the two stamps AGREE and that they MOVE: they sat at
     R171 through three rounds. Both are checked above and below, without naming a round. */
  assert.ok(+a[1].slice(1) >= 231, 'the stamp must not go backwards: ' + a[1]);
});

/* ── ① the launch mark's field IS the launch screen ─────────────────────────────────────────── */
test('R231 launch screen: the dark mark is flattened onto the dark screen colour', () => {
  /* the CSS half — the tile is right in the frame before the PNG decodes */
  const css = read('css/intmap.css');
  const rule = css.slice(css.indexOf('.boot-icon{'), css.indexOf('.boot-icon{') + 260);
  assert.match(rule, /background:var\(--bg-color\)/, 'the dark tile takes the screen variable');
  assert.ok(!/background:#0a0a0c/.test(noCss('css/intmap.css')), 'and the hand-picked near-black is gone from the stylesheet');

  /* the FILE half — measured, not asserted from the script's own output */
  const buf = readFileSync(join(ROOT, 'IntMap.Icon.png'));
  const px = decodePNG(buf);
  const corners = [[0, 0], [px.w - 1, 0], [0, px.h - 1]];
  for (const [x, y] of corners) {
    const o = (y * px.w + x) * px.bpp;
    assert.ok(px.data[o] === 0 && px.data[o + 1] === 0 && px.data[o + 2] === 0,
      `the mark's field at ${x},${y} is the dark screen colour, not (${px.data[o]},${px.data[o + 1]},${px.data[o + 2]})`);
  }
  /* the script that produced it is idempotent and says so */
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/boot-icon-flatten.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /already wears the screen colour/);
});

/* a minimal truecolour PNG reader — the same one the build scripts carry */
function decodePNG(buf) {
  let i = 8, w = 0, h = 0, depth = 0, colour = -1;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8);
    const d = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; colour = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  assert.equal(depth, 8); assert.ok(colour === 2 || colour === 6);
  const bpp = colour === 2 ? 3 : 4, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], row = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev ? prev[x] : 0, c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/* ── ② the phone's three marks are the app's own, not vendor emoji ──────────────────────────── */
test('R231 mobile icons: the search FAB, the locate FAB and the time machine carry drawn marks', () => {
  const html = read('index.html'), css = read('css/intmap.css');
  /* ⚠ THIS IS THE INVERSE OF tests/r191-checks ③, WHICH REQUIRED THE GLYPH. That check was written
     when the emoji was the answer; the instruction this round is that it is not, so the assertion is
     flipped rather than deleted — a removed check is a hole, an inverted one is a statement. */
  assert.ok(!/#ms-btn::after\{\s*content:'\u{1F50D}'/u.test(css), 'no magnifier pseudo-element left');
  assert.ok(!/\u{1F50D}/u.test(noHtml('index.html')), 'and no magnifier in the markup either');
  assert.match(html, /<button id="ms-btn"[^>]*>.*<svg class="ms-ico"/s, 'the search button holds an svg');
  assert.match(html, /<span class="ms-btn-t" data-i18n="searchBtn">/, 'the WORD carries data-i18n, so a language pass cannot wipe the svg');
  assert.match(css, /#ms-btn \.ms-ico\{ display:none; \}/, 'desktop shows the word');
  assert.match(css, /#ms-btn \.ms-btn-t\{ display:none; \}/, 'the phone shows the mark');
  /* the locate FAB is the navigation dart, not the old crosshair */
  const loc = html.slice(html.indexOf('id="m-fab-locate"'), html.indexOf('id="m-fab-locate"') + 900);
  assert.match(loc, /<polygon points="[^"]+"/, 'a four-point dart');
  assert.ok(!/circle cx="12" cy="12" r="3\.4"/.test(loc.replace(/<!--[\s\S]*?-->/g, ' ')), 'and no crosshair ring');
});

test('R231 time machine: the collapsed pill is a round icon button on a phone', () => {
  const css = read('css/intmap.css');
  const m = css.match(/\.news-timeline\.collapsed\{[^}]*\}/g) || [];
  const round = m.find((r) => /border-radius:27px/.test(r));
  assert.ok(round, 'the collapsed timeline becomes a circle');
  assert.match(round, /width:54px; height:54px/, 'one size up from the 46 px FABs');
  assert.match(css, /\.news-timeline\.collapsed \.ntl-open-txt\{ display:none; \}/, 'the two label lines are hidden, not deleted');
  /* it has to be inside the phone media block — the desktop pill keeps its words */
  const at = css.indexOf('.news-timeline.collapsed{ width:54px');
  assert.ok(css.lastIndexOf('@media(max-width:768px){', at) > css.lastIndexOf('\n    }\n', at) - 60000, 'inside the mobile block');
});

/* ── ③ the base-map square ──────────────────────────────────────────────────────────────────── */
test('R231 base map: the five view controls left the layer sheet for the square', () => {
  const html = read('index.html'), bm = read('js/basemap-switch.js');
  assert.ok(!/m-seg-block/.test(noHtml('index.html')), 'the segmented block is gone from the Map & layers sheet');
  assert.ok(existsSync(join(ROOT, 'js/basemap-switch.js')), 'the module exists');
  assert.match(bm, /window\.IntMapBasemapSwitch\s*=/, 'and publishes an eager global');
  /* the same five real controls, by the ids index.html actually defines */
  const want = ['btn-view-map', 'btn-view-sat', 'btn-view-globe', 'btn-view-flat', 'btn-view-3d'];
  for (const id of want) {
    assert.ok(bm.includes(`data-proxy="${id}"`), `the popover proxies ${id}`);
    assert.ok(html.includes(`id="${id}"`), `…and index.html still owns ${id}`);
  }
  /* the phone's label pass must reach it, or the popover keeps the previous language (#R8's defect) */
  assert.match(read('js/mobile-ui.js'), /const PROXY_SEL=[^;]*#bm-pop \[data-proxy\]/, 'syncControls covers the popover');
  /* it draws from data the app already ships — no new network at boot */
  assert.match(bm, /IntMapWorldBase/, 'the satellite face comes from the bundled Blue Marble');
  /* ⚠⚠ THE FUNCTION IT CALLS MUST BE EXPORTED, and this check exists because it was not. `tile` was
     internal to js/world-base.js — reachable only through the registered tile protocol — so the
     satellite face called `undefined`, caught nothing, and quietly drew the MAP face instead. Caught
     by looking at the live canvas (2 distinct colours where a photograph belongs, 4,658 after the
     fix), which is the only way a silent fallback is ever caught. */
  const wb = read('js/world-base.js');
  const api = /return \{([\s\S]*?)\n  \};/.exec(wb);
  assert.ok(api && /(^|[\s,])tile\s*,/.test(api[1]), 'js/world-base.js exports tile()');
  assert.match(bm, /satFail: _satFail/, 'and a failed satellite face is reported, not swallowed');
  assert.match(bm, /IntMapLandMask/, 'the map face from the bundled land raster');
  assert.ok(!/fetch\(|XMLHttpRequest|\.src\s*=\s*['"`]https?:/.test(bm), 'and it fetches nothing itself');
  /* a deploy that lost the file must show up as a missing global, not as a missing feature */
  assert.match(read('tests/prod-smoke.spec.js'), /'IntMapBasemapSwitch'/, 'named in MODULE_GLOBALS');
  assert.match(read('src/main.js'), /import '\.\.\/js\/basemap-switch\.js';/, 'and imported by the entry');
});

/* ── ④ the bottom sheet's two behaviours ────────────────────────────────────────────────────── */
test('R231 sheet: a full sheet swallows the map TAP and keeps the hover', () => {
  const src = read('js/mobile-ui.js');
  assert.match(src, /window\.addEventListener\('click',[\s\S]{0,400}?closest\('#map'\)[\s\S]{0,200}?setDetent\('half'\)/, 'a capture-phase click swallow lowers the sheet');
  assert.match(src, /window\.addEventListener\('contextmenu'/, 'and the long-press with it');
  /* ⚠ THE NEGATIVE IS THE POINT: neither CSS answer may appear, because both take the hover away. */
  const css = read('css/intmap.css');
  assert.ok(!/\.m-tap-guard\{/.test(noCss('css/intmap.css')) && !/m-tap-guard/.test(noJs('js/mobile-ui.js')), 'no transparent catcher over the map');
  assert.ok(!/body\.sheet-full\s+#map\{[^}]*pointer-events:none/.test(css), 'and #map keeps its pointer events');
});

test('R231 sheet: the scroll → drag hand-off is delegated, not a list of tab ids', () => {
  const src = read('js/mobile-ui.js');
  assert.ok(!/'live-news-feed','info-dashboard','monitors-feed','community-feed','news-reader-pane'/.test(noJs('js/mobile-ui.js')),
    'the five hard-coded feed ids are gone');
  assert.match(src, /function scrollerUnder\(/, 'the nearest scrollable ancestor is found at touchstart');
  assert.match(src, /sidebar\.addEventListener\('touchstart'/, 'one delegated listener on the sheet');
  assert.match(src, /sc\.scrollTop>0/, 'content that can still scroll keeps the gesture');
});

/* ── ⑤ Monitors is withdrawn, and every route with it ───────────────────────────────────────── */
test('R231 Monitors: the tab and all four routes to it are closed', () => {
  assert.ok(!/id="btn-monitors"/.test(noHtml('index.html')), 'no tab button');
  const tabs = read('js/session-tabs.js');
  assert.ok(!/IntMapOS\.register\('tab\.monitors'/.test(noJs('js/session-tabs.js')), 'the command is not registered');
  assert.ok(!/monitors:'tab\.monitors'/.test(noJs('js/session-tabs.js')), 'a saved session cannot restore it');
  assert.ok(!/getElementById\('btn-monitors'\)/.test(noJs('js/session-tabs.js')), 'nothing wires the missing button');
  const ws = read('js/workspace.js');
  assert.ok(!/\{id:'monitors',/.test(noJs('js/workspace.js')), 'no workspace window');
  assert.ok(!/monitors:flo\(/.test(noJs('js/workspace.js')), 'and no default rect for one');
  const atlas = read('js/atlas-console.js');
  assert.ok(!/\+'AREA MONITORS \(saved SERVER-SIDE/.test(atlas), 'the planner is not offered the action');
  assert.match(atlas, /FEATURE_WITHDRAWN/, 'and if one arrives anyway the reply says so rather than claiming success');
  /* ⚠ WITHDRAWN, NOT DELETED — 一旦撤去. The feature must still be here to come back. */
  assert.ok(existsSync(join(ROOT, 'js/monitors.js')), 'js/monitors.js is untouched');
  assert.match(read('index.html'), /id="monitors-feed"/, 'and so is its content area');
});

/* ── ⑥ the reading pages come back to the map you left ──────────────────────────────────────── */
test('R231 reading pages: back is history.back, and the href survives for a new tab', () => {
  const src = read('js/page-i18n.js');
  assert.match(src, /function wireBack\(a\)/, 'one helper');
  assert.match(src, /history\.back\(\)/, 'which goes back');
  assert.match(src, /new URL\(document\.referrer\)\.origin === location\.origin/, 'only when that lands on this site');
  assert.match(src, /e\.button !== 0 \|\| e\.metaKey \|\| e\.ctrlKey/, 'and only for a plain primary click');
  assert.ok((src.match(/wireBack\(/g) || []).length >= 3, 'wired at both links (header + footer) and declared');
  for (const p of ['sources.html', 'science.html']) {
    assert.match(read(p), /class="pg-back" href="\.\/index\.html"/, `${p} keeps a real href`);
  }
});

/* ── ⑦ the language system: ONE list, and Chinese actually reaches the screen ────────────────── */
test('R231 i18n: no hand-written five-language chain is left in js/', () => {
  /* the codemod is the check — it reports what it could still convert */
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/lang-ternary-codemod.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /convertible: 0\b/, 'nothing convertible is left:\n' + out);
});

test('R231 i18n: the registry answers for translations AND for Intl', () => {
  const reg = read('js/lang-registry.js');
  assert.match(reg, /function t\(lang\)/, 't(lang, …) exists');
  assert.match(reg, /function locale\(code, enTag\)/, 'and locale(code, enTag)');
  assert.match(reg, /t: t, locale: locale/, 'both are exported');
  /* the English default must be preservable, or every en-GB call site silently changes format */
  assert.match(reg, /if \(c === FALLBACK\) return enTag \|\| REGION\.en;/, 'an English caller keeps its own tag');
  /* and the report can SEE the new shape, or the blind spot just moved */
  /* ⚠ (#R251) …and the shape is recognised in ONE place now (scripts/i18n-helpers.mjs), because the
     same question was answered three times, per file, and all three missed a helper reached through
     a property of another module. The report must still SEE `t(…)`, so assert that it asks. */
  assert.match(read('scripts/i18n-helpers.mjs'), /property\.name === 't'/, 'the shared resolver counts t(…) call sites');
  assert.match(read('scripts/i18n-report.mjs'), /shapeOf\(/, 'the coverage report asks the shared resolver');
});

test('R231 i18n: the reading pages read the ONE registry, and Chinese is there', () => {
  const src = read('js/page-i18n.js');
  assert.match(src, /window\.IntMapLang && window\.IntMapLang\.list/, 'LANGS is derived from the registry');
  for (const p of ['sources.html', 'science.html']) {
    const h = noHtml(p);
    assert.ok(h.indexOf('lang-registry.js') >= 0, `${p} loads the registry`);
    assert.ok(h.indexOf('lang-registry.js') < h.indexOf('page-i18n.js'), `${p} loads it FIRST`);
  }
  /* ⚠⚠ …AND IT HAS TO REACH dist/. The two pages are copied, not bundled, so a file they <script
     src> is only in the build if vite.config.js's STATIC list names it. It did not, so the built
     page had no `window.IntMapLang`, page-i18n fell back to its five literals, and the picker lost
     Chinese again — the very defect this round exists to fix, reintroduced one layer down. Caught by
     opening the BUILT page, which is the only place a copy list can be wrong. */
  assert.match(read('vite.config.js'), /'js\/lang-registry\.js',/, 'vite copies the registry to dist/');
  /* every registered language must have a reading-pages file, or its picker entry renders English */
  const codes = [...read('js/lang-registry.js').matchAll(/\{ code: '([^']+)',[^}]*html: '([^']+)'/g)].map((m) => m[2].toLowerCase());
  assert.ok(codes.length >= 7, 'the registry has at least the seven that ship');
  for (const c of codes) {
    assert.ok(existsSync(join(ROOT, 'js/locales/pages.' + c + '.js')), `js/locales/pages.${c}.js exists`);
  }
  /* a partial translation must not delete the English prose it has not reached */
  assert.match(src, /Object\.keys\(t\)\.forEach/, 'sections merge per FIELD, not wholesale');
});

test('R231 i18n: the Simplified files are generated, never hand-written', () => {
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/zh-hans.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /ui\.zh-hans\.js is in sync/);
  assert.match(out, /pages\.zh-hans\.js is in sync/);
  /* ⚠⚠ AND THE ENGLISH KEYS SURVIVE THE CONVERSION. The `inline` table is keyed by the English
     source string, and two of those strings quote Japanese inside otherwise-English prose (the
     seismic method note cites 気象庁「計測震度の算出方法」). The character map rewrote the quote, so
     the Simplified key no longer equalled the string at the call site and the entry was dead — a
     translation sitting in the file, never used. */
  assert.match(read('scripts/zh-hans.mjs'), /keys are therefore lifted out before the conversion|Keys are\s+therefore lifted out/i,
    'the generator preserves keys');
  const hans = read('js/locales/ui.zh-hans.js');
  assert.ok(hans.includes('気象庁「計測震度の算出方法」'), 'the Japanese quoted INSIDE an English key is untouched');
});

test('R231 i18n: coverage is MEMBERSHIP, and Chinese is actually complete', () => {
  /* ⚠⚠ THE REPORT USED TO DIVIDE TWO SIZES. A table of 2,068 entries against 2,038 live strings
     printed "100 %" while five of those live strings had no entry at all — thirty stale keys, left
     over from call sites since edited, padded the number that hid them. That is this round's own
     headline defect one level down: an instrument reporting green for something it is not looking
     at. It counts the intersection now. */
  const rep = read('scripts/i18n-report.mjs');
  assert.match(rep, /const covered = \[\.\.\.inline\.keys\(\)\]\.filter\(\(s\) => i\.has\(s\)\)\.length;/,
    'coverage counts the intersection');
  assert.ok(!/i\.size \/ Math\.max\(1, inline\.size\)/.test(rep), 'not a size ratio');
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/i18n-report.mjs')], { encoding: 'utf8' });
  for (const code of ['zh', 'zh-hans']) {
    const line = out.split('\n').find((l) => l.startsWith(code + ' ') || l.startsWith(code.padEnd(6) + ' '));
    assert.ok(line, `the report has a row for ${code}`);
    assert.match(line, /100\.0%/, `${code} inline coverage is complete: ${line}`);
  }
});

test('R231 i18n: the launch screen names every registered language', () => {
  /* ⚠ IT CANNOT IMPORT THE REGISTRY — it runs before any module, which is the whole point of a launch
     screen (#R224 says so in that file). So it is VERIFIED against the registry instead of trusted to
     be remembered: #R223 added a language and missed this line, and Chinese booted in English. */
  const codes = [...read('js/lang-registry.js').matchAll(/\{ code: '([^']+)'/g)].map((m) => m[1]);
  const boot = read('index.html');
  const table = boot.slice(boot.indexOf('var L={en:'), boot.indexOf('var L={en:') + 400);
  for (const c of codes) {
    assert.ok(new RegExp(`(^|[{,])\\s*'?${c.replace('-', '\\-')}'?\\s*:`).test(table),
      `the launch screen has a word for '${c}' — add it to the L={…} table in index.html`);
  }
});

/* ── ⑧ the profile sheet ────────────────────────────────────────────────────────────────────── */
test('R231 profile: Display name and Bio are gone, and the look left the module', () => {
  const src = read('js/auth-ui.js');
  const bare = noJs('js/auth-ui.js');
  for (const id of ['acct-name', 'acct-bio', 'acct-save']) {
    assert.ok(!bare.includes(`'${id}'`) && !bare.includes(`id="${id}"`), `${id} is gone`);
  }
  assert.match(src, /class="acct-sheet"/, 'the sheet is built from classes');
  assert.match(src, /class="acct-card acct-rows"/, 'grouped cards');
  /* ⚠ THE SETTINGS GO, THE DATA STAYS — nothing here may drop a column. */
  assert.ok(!/\.update\(\{display_name:/.test(src) || /meta\.display_name/.test(src), 'no write of a field the UI no longer offers');
  assert.match(read('css/intmap.css'), /\.acct-sheet\{/, 'and the styling is in the stylesheet');
});

/* ── ⑨ Atlas: an attached picture is not a speech bubble ────────────────────────────────────── */
test('R231 Atlas: the image row is its own element, the text keeps the bubble', () => {
  const src = read('js/atlas-console.js');
  assert.match(src, /if\(imgs\.length\) bubble\('u','<div class="atl-imgrow-in">/, 'images get their own row');
  assert.match(src, /classList\.add\('atl-imgrow'\)/, 'marked so the bubble styling comes off');
  assert.match(src, /if\(q\|\|files\.length\) bubble\('u',/, 'and no empty bubble when there is no text');
  assert.match(src, /\.atl-b\.u\.atl-imgrow\{background:none;box-shadow:none;padding:0/, 'no fill, no shadow, no padding');
  assert.ok(!/object-fit:cover;border-radius:8px/.test(noJs('js/atlas-console.js')), 'the 74 px square crop is gone');
});

/* ── ⑩ the AI research reply does not open by naming the place ──────────────────────────────── */
test('R231 AI research: the leading place-name line is asked against AND removed', () => {
  const ap = read('js/analysis-panels.js');
  assert.match(ap, /function _dropLeadTitle\(text,name\)/, 'the defensive strip exists');
  assert.match(ap, /md\(_dropLeadTitle\(out\|\|'',name\)\)/, 'and is applied to the reply');
  assert.match(ap, /Do NOT open with a heading or bold line that merely repeats the place name/, 'the model is told too');
  /* equality, never containment — a title that CONTAINS the name is a real title */
  assert.match(ap, /if\(key\(lines\[i\]\)!==want\) return text;/, 'only an exact match is dropped');
  const at = read('js/atlas-console.js');
  assert.match(at, /_titleIsJustThePlace/, 'the Atlas researchMap title does the same');
  assert.match(at, /_bare\(_tt\)===_bare\(place\)/, 'by equality');
});

/* ── ⑪ the gazetteer index yields to the gesture ────────────────────────────────────────────── */
test('R231 performance: the world-gazetteer registration is deadline-bound and yields to the camera', () => {
  const src = read('js/news-context.js');
  assert.ok(!/SLICE=4000/.test(noJs('js/news-context.js')), 'the fixed 4,000-row slice is gone');
  assert.match(src, /deadline\.timeRemaining\(\)>SLACK/, 'the idle deadline decides how much runs');
  assert.match(src, /E\.events\.on\('movestart',\(\)=>\{ moving=true; \}\)/, 'it watches the camera');
  assert.match(src, /if\(moving\)\{ schedule\(\); return; \}/, 'and re-schedules instead of spending a gesture frame');
  /* the 2 s timeout was the part that fired INTO pinches */
  assert.ok(!/\{timeout:2000\}/.test(noJs('js/news-context.js')), 'no 2-second idle timeout left');
  assert.match(src, /\{timeout:20000\}/, 'a background index is allowed to starve on a busy page');
  const batch = src.match(/const BATCH=(\d+);/);
  assert.ok(batch && +batch[1] <= 500, 'a batch is small enough to fit inside one frame');
});

/* ── ⑫ the screenshot has ONE coordinate system ─────────────────────────────────────────────── */
test('R231 screenshot: both layers are drawn into the container box, and capture-mode always comes off', () => {
  const src = read('js/screenshot.js');
  assert.match(src, /const cw=Math\.max\(1,cont\.clientWidth\), ch=Math\.max\(1,cont\.clientHeight\);/, 'the box is the container');
  assert.match(src, /out\.width=Math\.round\(cw\*scale\); out\.height=Math\.round\(ch\*scale\);/, 'the output is that box at the renderer density');
  assert.match(src, /ctx\.drawImage\(mapCv,0,0,mapCv\.width,mapCv\.height,0,0,out\.width,out\.height\)/, 'the map is mapped onto it explicitly');
  assert.match(src, /finally\{ document\.body\.classList\.remove\('capture-mode'\);/, 'the class comes off on every path');
  /* the phone's own controls are controls */
  const css = read('css/intmap.css');
  for (const sel of ['.bm-square', '.bm-pop', '.m-scrim']) {
    assert.ok(css.includes('body.capture-mode ' + sel), `capture mode hides ${sel}`);
  }
});

/* ── ⑬ nothing in this round quietly lowered the picture ────────────────────────────────────── */
test('R231 quality: the round changed no rendering setting', () => {
  /* 「見た目ゼロ変更のみ」 — the two levers named in the brief were NOT taken, and this records that
     so a later round cannot take them by accident and call it a #R231 follow-up. */
  const app = flat('js/app-body.js');
  assert.ok(!/glass-motion|render-scale/.test(app.replace(/\/\*[\s\S]*?\*\//g, ' ')), 'the two withdrawn quality-reducers stay withdrawn (#R229)');
  const css = read('css/intmap.css');
  const blurs = (css.match(/backdrop-filter:/g) || []).length;
  assert.ok(blurs > 40, 'the frosted material is untouched — a round that thins it must say so here');
});
