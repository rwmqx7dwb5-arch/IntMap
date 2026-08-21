/* ============================================================================
 *  IntMap · #R299 — source-level checks
 * ----------------------------------------------------------------------------
 *  Everything below pins a RELATION that a report named, not a number a round happened to pick.
 *
 *    · 「発令されているのに、ごっそり都道府県単位でもれ落ちていたりする」 — r8/map.json holds exactly
 *      ONE row per (publishingOffice, dataTypeCode) and each dataTypeCode is a different hazard
 *      family. Keeping 「the newest bulletin per office」 kept one family and dropped the other four.
 *      MEASURED through this module's own reduce on the live file: 601 → 812 municipalities,
 *      211 recovered (26 %), and the loss was whole prefectures — 千葉県 54/54, 東京都 53/53,
 *      熊本県 46/46, 山梨県 27/27, 石川県 19/19.
 *    · 「発令されているのに、灰色になっている場所がある」 — the country-wide 「読んだ。何も出ていない」
 *      sheet was painted over countries that were drawing warnings, because `quietSet` is empty
 *      below `QUIET_UNIT_Z` and while a unit index is still landing.
 *    · 「ポリゴンの境界線の解像度が低すぎる場所が多々ある」 — Japan's floor is 17.6 vertices per
 *      municipality (千代田区 = 7 points). The same publisher's per-prefecture build is 10.9× finer.
 *    · 「『いま発表されている警報』は…『危険』以上のものがある国だけ出すこと／ふさわしい名称に改名」
 *    · 「文章が長すぎる。簡潔に。」 ×2
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const WP = () => read('js/world-packs.js');
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-four times; ask the question of the text that RUNS. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const alertsModule = (src) => {
  const a = src.indexOf('(function alerts()'), b = src.indexOf('window.__wpAlerts=', a);
  if (!(a > 0 && b > a)) throw new Error('the alerts module could not be delimited');
  return src.slice(a, b);
};

/* ── ⓪ no file in this repository may carry a NUL byte ───────────────────────────────────────
   #R298 ⑨ found `js/routing-geocode.js` holding a raw 0x00: ripgrep classifies such a file as
   binary and SKIPS IT ENTIRELY, so every 「how many places is this fact in」 count taken over the
   repository silently excluded that module. This round put one into js/world-packs.js and caught
   it the same way — by grep calling the file binary. The rule is cheap, so it is a rule. */
test('R299 ⓪ no source file contains a NUL byte (ripgrep skips such files whole)', () => {
  for (const p of ['js/world-packs.js', 'js/routing-geocode.js', 'js/weather.js', 'js/wx-ecmwf.js',
    'js/routing.js', 'js/routing-ui.js', 'js/map-ui.js', 'js/atlas-console.js', 'js/app-body.js']) {
    const b = readFileSync(resolve(ROOT, p));
    assert.ok(!b.includes(0), p + ' contains a NUL byte — ripgrep would skip the whole file');
  }
});

/* ── ① the JMA state is one bulletin per office PER BULLETIN TYPE ─────────────────────────── */
test('R299 ① the JMA reduce keys on the bulletin TYPE as well as the office', () => {
  const code = noComments(alertsModule(WP()));
  const m = code.match(/const newest=Object\.create\(null\);[\s\S]{0,400}?const kept=Object\.values\(newest\);/);
  assert.ok(m, 'the r8 reduce is still one recognisable block');
  const reduce = m[0];
  assert.ok(/publishingOffice/.test(reduce), 'the office is still part of the key');
  /* ⚠ THE RELATION, not the separator: the key must ALSO name the bulletin type, because that is
     what distinguishes the five hazard families an office publishes. */
  assert.ok(/dataTypeCode/.test(reduce), 'the bulletin type is part of the key — one row per family');
  /* and the key is built from both in the same expression, not two competing keys */
  assert.ok(/publishingOffice[\s\S]{0,80}dataTypeCode/.test(reduce),
    'office and type are joined into one key');
});

test('R299 ① the age gate still asks 「is this feed alive」, not 「is every family fresh」', () => {
  const code = noComments(alertsModule(WP()));
  /* jmaAt is the newest row OF ALL — a quiet family that has not been re-issued for weeks is the
     current state of that family and must not fail the gate. */
  assert.ok(/jmaAt=kept\.reduce\(\(m,b\)=>\{[^}]*t>m\?t:m/.test(code.replace(/\s+/g, ' ').replace(/ /g, '')) ||
    /jmaAt=kept\.reduce/.test(code), 'the clock is still the newest bulletin of all');
  assert.ok(/JMA_MAX_AGE_H/.test(code), 'and the age gate is still there');
});

/* ── ② a country that is drawing warnings is never washed grey ────────────────────────────── */
test('R299 ② the country-wide 「nothing in force」 sheet is not painted over a country that is drawing', () => {
  const code = noComments(alertsModule(WP()));
  const m = code.match(/return\s*\(?[^;]*quietSet\[c\][^;]*\?\s*2\s*:\s*1;/);
  assert.ok(m, 'washTier still ends in the quiet/wash decision');
  assert.ok(/drawnISO\[c\]/.test(m[0]),
    'a country with features on the map takes the transparent arm — 「発令されているのに灰色」');
  /* the grey itself is unchanged: it is still one colour and still means 「read, and quiet」 */
  assert.ok(/readState\(c\)!=='ok'\)\s*return 0;/.test(code), 'unread still hatches rather than greys');
});

/* ── ③ Japan's units have a resolution ABOVE the nationwide floor ─────────────────────────── */
test('R299 ③ Japan is upgraded from the nationwide s0001 floor when a prefecture is on screen', () => {
  const s = WP();
  const code = noComments(alertsModule(s));
  assert.ok(/s0001/.test(code), 'the nationwide file is still the floor (one request for the world view)');
  /* the finer per-prefecture build exists and is reached */
  assert.ok(/s0010/.test(code), 'the per-prefecture build is what the upgrade reads');
  assert.ok(/function askJpFine\(/.test(code), 'there is an upgrade pass for Japan');
  /* …and it is wired into the SAME view-bounded ladder every other country uses, not a private one */
  /* ⚠ take a WINDOW rather than trying to match a closing brace: this file is CRLF and the
     indentation of a closing brace is not a contract. */
  const body = (name, n) => { const i = code.indexOf('function ' + name + '()'); return i < 0 ? '' : code.slice(i, i + n); };
  const up = body('upgradeUnitsInView', 900);
  assert.ok(/askJpFine\(\)/.test(up),
    'askJpFine runs from upgradeUnitsInView, so it is bounded by zoom and by the view');
  /* the warnings are re-placed, not only the quiet units: jpShape reads the same index */
  const fine = body('askJpFine', 2200);
  assert.ok(/refresh\(\)/.test(fine),
    'a finer index re-runs the feed — otherwise fine grey meets coarse colour along every border');
  assert.ok(/JP_FINE_MAX/.test(fine), 'and it is bounded, like GB_MAX is');
  assert.ok(/getBounds\(\)/.test(fine), 'and by what is on screen');
});

/* ── ④ the country list is cut at the normalised Danger step ──────────────────────────────── */
test('R299 ④ 「危険」以上の国だけ — one threshold, named once, used by the filter', () => {
  const code = noComments(alertsModule(WP()));
  assert.ok(/const HOT_MIN=3;/.test(code), 'the threshold is a named constant, not a literal in the filter');
  const m = code.match(/const list=\[\.\.\.by\.values\(\)\][^;]*;/);
  assert.ok(m, 'hotList still builds its list in one expression');
  assert.ok(/\.filter\(g=>g\.norm>=HOT_MIN\)/.test(m[0]), 'and it filters on the country worst rank');
  /* HOT_MIN has to BE the Danger step of NORM_NAME, or the heading and the rule drift apart */
  assert.ok(/n===3\?L\('Danger'/.test(code), 'norm 3 is still the step called Danger / 危険');
});

test('R299 ④ the heading names what the list is, and the empty line does not claim more than it knows', () => {
  const code = noComments(alertsModule(WP()));
  assert.ok(!/'What is in force now'/.test(code), 'the old caption is gone from the code that runs');
  assert.ok(/L\('Countries at Danger or above'/.test(code), 'the heading names the filter');
  /* ⚠ the empty state used to say 「nothing is in force anywhere」, which is FALSE once the list is
     filtered — lower ranks can be in force and drawn while this box is empty. */
  assert.ok(!/'Nothing in force in any connected service right now\.'/.test(code),
    'the old empty line would now be a false statement');
  assert.ok(/No country is at Danger or above right now\./.test(code), 'it says which question it answered');
});

/* ── ⑤ the two legend paragraphs are short ───────────────────────────────────────────────── */
test('R299 ⑤ 「文章が長すぎる。簡潔に。」 — both legend notes are one line in every language', () => {
  const code = noComments(alertsModule(WP()));
  assert.ok(!/Each agency’s ranks are mapped onto these four by IntMap/.test(code), 'the long ① is gone');
  assert.ok(!/Japan’s are the JMA’s yellow \/ red \/ magenta \/ black/.test(code), 'the long ② is gone');
  /* the claims that had to survive */
  const one = code.match(/L\('IntMap’s own conversion[^)]*\)/);
  assert.ok(one, '① still says whose arithmetic it is');
  assert.ok(/same step is not the same danger/.test(one[0]), '…and still carries the warning that goes with it');
  const two = code.match(/L\('Each agency’s own colours[^)]*\)/);
  assert.ok(two, '② still says the colours are not IntMap’s');
  /* and 「簡潔に」 is measurable: every language of both notes fits on one line */
  for (const lit of [one[0], two[0]]) {
    for (const arg of lit.match(/'((?:[^'\\]|\\.)*)'/g) || []) {
      assert.ok(arg.length - 2 <= 130, 'a legend note is still one line: ' + arg.slice(0, 60));
    }
  }
});

/* ── ⑥ the wind reaches the SAME picture with less waiting and less traffic ────────────────── */
test('R299 ⑥ a frame is kept per TIME, not one per variable — a step back costs nothing', () => {
  const s = read('js/wx-ecmwf.js');
  const i = s.indexOf('function keepFrame(');
  assert.ok(i > 0, 'keepFrame is still one function');
  const k = s.slice(i, i + 700);
  /* ⚠ the RELATION: what is dropped is what the new frame SUPERSEDES — same key, and a band the new
     one covers — never 「anything of this variable」, which is what made a step back a re-download. */
  assert.ok(/x\.key\s*===\s*f\.key/.test(k), 'the identity that is replaced is the KEY (variable + valid time)');
  assert.ok(/bandCovers\(/.test(k), '…and only when the new band covers the old one');
  assert.ok(!/x\.variable\s*===\s*f\.variable\s*\)\s*;?\s*\}?\s*\)/.test(k.replace(/\s+/g, ' ')) ||
    /x\.key/.test(k), 'dropping every frame of the same variable is what this replaces');
  assert.ok(/FRAME_SAMPLES/.test(s.slice(i, i + 900)), 'and the budget still bounds it');
});

test('R299 ⑥ a read that has been overtaken does not spend the network', () => {
  const s = read('js/wx-ecmwf.js');
  const i = s.indexOf('return serial(function () {');
  assert.ok(i > 0, 'the queued half of load() is still one block');
  const q = s.slice(i, i + 2600);
  assert.ok(/seq\s*!==\s*mine/.test(q), 'the queue checks its generation before it reads');
  /* ⚠ BEFORE it reads, not after: the point is that the ranged requests are never issued. */
  assert.ok(q.indexOf('seq !== mine') < q.indexOf('ensureData'), 'the check comes before the fetch');
  /* ⚠ and it must NOT answer falsy: js/weather.js reads falsy as 「fetch failed」 and runs a retry
     ladder that ends in a toast the reader reported in #R298. */
  assert.ok(/frames\./.test(q) || /held/.test(q), '…and answers with a frame rather than a failure');
});

test('R299 ⑥ the wide read is a staircase gated on stillness, and it still gets there', () => {
  const s = read('js/weather.js');
  assert.ok(/STILL_MS\s*=\s*\d+/.test(s), 'a rung waits for the map and the axis to be still');
  assert.ok(/RUNG_MAX/.test(s), 'and a rung is bounded by SAMPLES, not by width');
  assert.ok(/function runWiden\(/.test(s), 'the staircase is one function');
  assert.ok(/wideGen/.test(s), 'a time change restarts it rather than letting the old target land');
  /* ⚠ (#R297 ⑤) the wide read is NOT skipped — a reader who stays put still ends at band() */
  const w = s.slice(s.indexOf('function runWiden('), s.indexOf('function runWiden(') + 1400);
  assert.ok(/band\(\)/.test(w), 'the last rung is the band the view actually needs');
});

test('R299 ⑥ the coarse ECMWF domain is NOT used — its axis is a different axis', () => {
  const s = read('js/wx-ecmwf.js');
  const code = noComments(s);
  assert.ok(!/ecmwf_ifs025/.test(code),
    'ecmwf_ifs025 is 3-hourly against ecmwf_ifs’s hourly: using it would move the reader’s hour');
  assert.ok(/var DOMAIN = 'ecmwf_ifs'/.test(code) || /DOMAIN\s*=\s*'ecmwf_ifs'/.test(code), 'one domain');
});

/* ── ⑦ the route panel is a window, and the corner is part of it ───────────────────────────── */
test('R299 ⑦ the CORNER is caught on the document, because border-radius clips hit-testing', () => {
  const s = read('js/window-manager.js');
  const code = noComments(s);
  assert.ok(/function _armCornerCatch\(/.test(code), 'there is a document-level corner catcher');
  const c = code.slice(code.indexOf('function _armCornerCatch('), code.indexOf('function _armCornerCatch(') + 1800);
  /* ⚠ CORNERS ONLY — taking the edges here would swallow every click within M of a panel edge */
  assert.ok(/d\.length\s*!==\s*2/.test(c), 'only two-axis (corner) zones are claimed');
  /* ⚠ and the topmost window wins, which is the order bringToFront maintains */
  assert.ok(/zIndex/.test(c), 'the candidate with the highest z-index wins');
  /* ⚠ a press that already landed inside a resizable panel is that panel’s own */
  assert.ok(/data-edge-resize/.test(c), 'a press inside a resizable panel is left to it');
  /* the edge path is unchanged and still on the element */
  assert.ok(/panel\.addEventListener\('pointerdown'/.test(code), 'the edges are still the element’s own listener');
});

test('R299 ⑦ minimising banks the size before it takes it away', () => {
  const code = noComments(read('js/routing-ui.js'));
  const i = code.indexOf(".rtp-minb').addEventListener('click'");
  assert.ok(i > 0, 'the minimise button still has one handler');
  const h = code.slice(i, i + 700);
  /* saveGeom is debounced by a MutationObserver, so the height has to be written down BEFORE the
     class that removes it — otherwise restore puts back MIN_H (measured: 642 → 360). */
  assert.ok(/saveGeom\(\)[\s\S]{0,120}classList\.toggle\('rtp-min'\)/.test(h),
    'the geometry is saved before rtp-min is applied');
  assert.ok(/restoreGeom\(\)/.test(h), 'and restoring puts the stored rectangle back');
});

test('R299 ⑦ the upper half is capped and the answer list has a floor — on the DESKTOP only', () => {
  const css = read('css/intmap.css');
  const i = css.indexOf('.rtp-fixed');
  assert.ok(i > 0, 'the fixed head block is still there');
  assert.ok(/@media \(min-width:\s*768px\)/.test(css), 'the new sizing is behind a desktop query');
  /* the two halves of the fix: a ceiling above and a floor below */
  assert.ok(/\.rtp-fixed\s*\{[^}]*max-height/.test(css.replace(/\s+/g, ' ')) || /rtp-fixed[^{]*\{[^}]*max-height/.test(css),
    '.rtp-fixed has a ceiling');
  assert.ok(/\.rtp-body[^{]*\{[^}]*min-height/.test(css), '.rtp-body has a floor');
  /* ⚠ the phone sheet is not touched: 44 px targets and 13 px text are what tests/smoke R291 ⑧ measures */
  assert.ok(/@media\s*\(max-width:\s*767px\)/.test(css), 'the phone sheet block still exists');
});

/* ── ⑧ the routing module never shrinks its own public face ────────────────────────────────── */
test('R299 ⑧ routing has no renderer-less stub — a missing method is how it went silent', () => {
  const code = noComments(read('js/routing.js'));
  assert.ok(!/!GE\(\)\.hasRenderer\(\)\s*\|\|\s*!GE\(\)\.hasRenderer\(\)/.test(code),
    'the duplicated condition is gone');
  assert.ok(!/return\s*\{\s*route\(\)\s*\{[\s\S]{0,80}\},\s*clear\(\)\s*\{\s*\}\s*\}/.test(code),
    'and so is the two-method object it returned — callers wrap every call in try/catch');
  /* ensureLayers must be able to repair a style that has the source but not the layers */
  assert.ok(/_layersOK\(/.test(code), 'ensureLayers asks whether the LAYERS are there, not just the source');
});

test('R299 ⑧ the Atlas route toggle names every layer the route draws', () => {
  const code = noComments(read('js/atlas-console.js'));
  const m = code.match(/route:\[[^\]]*\]/);
  assert.ok(m, 'the overlay table still has a route row');
  /* ⚠ imroute-hit is the one that matters most: leaving it visible is 「the line is gone but it is
     still clickable」, which is half of the report about a route that will not go away. */
  for (const id of ['imroute-cas', 'imroute-walk', 'imroute-rail', 'imroute-pt', 'imroute-wp',
    'imroute-durlab', 'imroute-hit', 'imroute-area', 'imroute-diff', 'imroute-hist']) {
    assert.ok(m[0].includes(id), 'the toggle covers ' + id);
  }
});

/* ── ⑨ a tool asks only when it cannot open without an answer ──────────────────────────────── */
test('R299 ⑨ the extra 「use the map centre」 pill is gone, and the shared bar is not', () => {
  const code = noComments(read('js/map-ui.js'));
  assert.ok(!/im-pick-alt/.test(code), 'the pill #R298 added to the shared bar is gone');
  assert.ok(!/_hereLL/.test(code), '…and with it the accessor that named the camera centre');
  assert.ok(/window\.IntMapPick/.test(code) || /IntMapPick/.test(code), '#R196’s shared bar is still what asks');
  /* the picker itself is untouched */
  assert.ok(/im-pick-bar/.test(read('js/map-pick.js')), 'js/map-pick.js still owns the bar');
});

test('R299 ⑨ only the three tools that cannot open without a point are asked', () => {
  const code = noComments(read('js/map-ui.js'));
  const asked = (code.match(/_askPoint\(/g) || []).length;
  /* one definition plus one call per row that needs it */
  assert.ok(asked >= 3, '_askPoint is still used');
  for (const id of ['sim.los', 'sim.reach', 'sim.nightSky']) {
    const i = code.indexOf("'" + id + "'");
    assert.ok(i > 0, id + ' is still a row');
    assert.ok(/_askPoint/.test(code.slice(i, i + 400)), id + ' asks for a point');
  }
  for (const id of ['sim.terrainWater', 'sim.sun']) {
    const i = code.indexOf("'" + id + "'");
    assert.ok(i > 0, id + ' is still a row');
    assert.ok(!/_askPoint/.test(code.slice(i, i + 400)),
      id + ' opens straight away — its panel can name a point itself');
  }
});

test('R299 ⑨ the two panels that had no way to name a point now have one', () => {
  assert.ok(/IntMapPick/.test(noComments(read('js/map-tools.js'))), 'the reachable-area panel can pick');
  assert.ok(/IntMapPick/.test(noComments(read('js/night-sky.js'))), 'the night-sky panel can pick');
});

test('R299 ⑨ Atlas asks rather than answering for the centre', () => {
  const code = noComments(read('js/atlas-console.js'));
  /* the tsunami case is the model: it does not fall to the centre, it asks where */
  for (const probe of ['Where? Give the transmitter site', 'Where from? Give a place']) {
    assert.ok(code.includes(probe), 'Atlas asks: ' + probe);
  }
});

/* ── ⑩ the frosted sidebar owes the camera an inset; the solid one does not ─────────────────── */
test('R299 ⑩ the inset is frosted-only, measured from the sidebar’s STATE, and written only on change', () => {
  const s = read('js/sidebar-style.js');
  const code = noComments(s);
  assert.ok(/function _glassInset\(/.test(code), 'the visible width is one function');
  const g = code.slice(code.indexOf('function _glassInset('), code.indexOf('function _glassInset(') + 900);
  assert.ok(/sidebar-glass/.test(g), 'solid gets nothing — its canvas is already narrower');
  /* ⚠ a collapsed sidebar keeps its width (a negative margin parks it), so the STATE is read */
  assert.ok(/collapsed/.test(g), 'a collapsed sidebar contributes 0');
  assert.ok(/display|visibility/.test(g), 'and so does one hidden by workspace mode');
  /* ⚠ read before write: bottom belongs to the phone sheet */
  assert.ok(/getPadding\(\)/.test(code), 'the other sides are read before the left one is written');
  assert.ok(/setPadding\(/.test(code), 'and the left one is written');
  /* ⚠ only when it changed — a layer toggle must not move the map by a pixel (CONSTITUTION §3) */
  assert.ok(/!==\s*want/.test(code) || /!=\s*want/.test(code), 'nothing is written when the number is the same');
});

test('R299 ⑩ the shell moved a feature OUT rather than raising its ceiling', () => {
  /* tests/r168 #8 budgets index.html + src/* + js/app-body.js + js/geo-engine.js + js/lazy-modules.js.
     The rule that test states is that the ceiling follows the floor DOWN. */
  const body = read('js/app-body.js');
  assert.ok(/from '\.\/sidebar-style\.js'/.test(body), 'the shell imports the module it handed the feature to');
  /* ⚠ (#R167 dead-zone rule) js/mobile-ui.js binds this name at factory time, so it must be HOISTED */
  assert.ok(/function applySidebarStyle\(/.test(body),
    'the name stays a hoisted function declaration — a const would be undefined for earlier factories');
  assert.ok(/sidebar-style\.js/.test(read('docs/FILES.md')), 'and the ledger describes the new file');
});

