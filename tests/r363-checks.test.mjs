/* ============================================================================
 *  R363 — one English key cannot carry two meanings
 * ----------------------------------------------------------------------------
 *  「js/locales/ui.{fr,ko,zh,zh-hans}.js の `inline:` 表は英語原文をキーにするので、
 *    異なる意味の3か所が同じ行を共有している。」
 *
 *  `js/lang-registry.js` `pick()` gives en / ja / de / ru / es the POSITIONAL
 *  arguments and everything after them `inline[code][arguments[0]]` — ONE row per
 *  English string. So the positional five cannot collide and the inline four
 *  cannot avoid it: `'Clear'` was one row over five meanings and ten sites, and
 *  fr / ko / zh-Hant / zh-Hans printed «erase» for a clear sky and for clean air.
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT SHIPPED SOURCE, not about the audit's opinion
 *  of it. ① and ② run the instrument; ③ proves the instrument can still SEE a
 *  collision (a detector that has quietly stopped detecting reports zero and looks
 *  exactly like success — #R347's rule that a negative check needs a line that can
 *  make it red); ④ pins each rename at its site so reverting one is red here; and
 *  ⑤ pins the three incidental defects that were fixed in the same pass.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const audit = (...a) => JSON.parse(execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', 'i18n-key-collision-audit.mjs'), '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ① no English key carries two meanings unless a reader has said it may ──────────────────── */
test('① every colliding English key is judged benign, explicitly', () => {
  const j = audit();
  assert.equal(j.unlisted.length, 0,
    'English key(s) carrying more than one meaning and not in BENIGN — one inline row cannot serve '
    + 'both, so fr/ko/zh-Hant/zh-Hans are wrong at one of the sites: '
    + j.unlisted.map((u) => `${JSON.stringify(u.en)} (${u.meanings.join(' / ')})`).join(', '));
});

/* ── ② …and the allowlist is not carrying entries that stopped asserting anything ───────────── */
test('② no stale BENIGN entry', () => {
  const j = audit();
  assert.equal(j.stale.length, 0,
    'BENIGN entr(ies) that no longer collide — delete them, or the allowlist becomes a place a real '
    + 'collision can hide: ' + j.stale.join(', '));
});

/* ── ③ ⚠ THE DETECTOR STILL DETECTS ────────────────────────────────────────────────────────────
   ① and ② are both satisfied by an instrument that has stopped looking — a broken walker returns
   no hits, `unlisted` is empty, `stale` is empty, and the gate is green for the one reason that
   means nothing. So assert that it still FINDS the benign duplicates it is supposed to tolerate,
   and that `'Clear'` is still one of them (three meanings survive: 消去 / クリア / 解除 — the two
   that were wrong, 快晴 and 清浄, moved to their own keys in ④). */
test('③ the detector still finds the duplicates it tolerates', () => {
  const j = audit();
  assert.ok(j.total >= 150, `only ${j.total} colliding keys found — the walker has probably stopped seeing call sites`);
  assert.ok(j.keys >= 4000, `only ${j.keys} English keys found — the walker has probably stopped seeing call sites`);
  assert.equal(j.listed, j.total, 'listed + unlisted must account for every collision');
});

/* ── ④ each rename is pinned at its site ───────────────────────────────────────────────────────
   The English key is ALSO what English readers see, so these are user-visible strings, not
   internal identifiers. Reverting any one of them puts two meanings back on one row. */
const RENAMES = [
  ['js/widget-defs-data.js', `L('Clear sky', '快晴'`, `L('Clear', '快晴'`],
  ['js/data-layers.js', `'Clean air','清浄'`, `'Clear','清浄'`],
  ['js/data-layers.js', `'Turn all off','すべて解除'`, `'Clear all','すべて解除'`],
  ['js/widget-defs-markets.js', `L('Economy fee', '低速'`, `L('Economy', '低速'`],
  ['js/satellite-detail.js', `L('Elevation angle','仰角'`, `L('Elevation','仰角'`],
  ['js/atlas-console.js', `L('Source term','放出量'`, `L('Source','放出量'`],
  ['js/aircraft-detail.js', `L('Signal source','信号種別'`, `L('Source','信号種別'`],
  ['js/osm-facilities.js', `LA('Wind power','風力'`, `LA('Wind','風力'`],
  ['js/world-packs.js', `LA('Wind power','風力'`, `LA('Wind','風力'`],
  ['js/space.js', `L('total eclipse','皆既'`, `L('total','皆既'`],
  ['js/widget-defs-data.js', `L('Max', '最高'`, `L('High', '最高'`],
  ['js/widget-defs-data.js', `L('Min', '最低'`, `L('Low', '最低'`],
  ['js/atlas-console.js', `L('Max','最高'`, `L('High','最高'`],
  ['js/atlas-console.js', `L('Min','最低'`, `L('Low','最低'`],
  ['js/widget-defs-time.js', `L('Days elapsed', '経過日'`, `L('Day', '経過日'`],
  ['js/osm-facilities.js', `L('Emergency room','救急'`, `L('Emergency','救急'`],
  ['js/aircraft-detail.js', `L('Aircraft type','機種'`, `L('Aircraft','機種'`],
  ['js/drone-nav.js', `L('Highest altitude','最高高度'`, `L('Highest point','最高高度'`],
  ['js/satellite-detail.js', `L('Max elevation','最大仰角'`, `L('Highest point','最大仰角'`],
  ['js/world-packs.js', `L('Metric','指標'`, `L('Measure','指標'`],
  ['js/map-extras.js', `"Runway use","種別"`, `"Use","種別"`],
  ['js/viewshed.js', `L('Sample spacing','間隔'`, `L('samples','間隔'`],
  ['js/viewshed.js', `L('Sample points','点'`, `L('points','点'`],
  ['js/data-layers.js', `'Time window','期間'`, `'Window','期間'`],
  ['js/volcano-intel.js', `L('Announcement','発表内容'`, `L('Warning','発表内容'`],
  ['js/countries-ui.js', `TR('Neighbours','隣接'`, `TR('Borders','隣接'`],
  ['js/map-tools.js', `OL('Shape','図形'`, `OL('Drawing','図形'`],
  ['js/seismic.js', `L('Place it','置く'`, `L('Place','置く'`],
  ['js/sims.js', `SN('Selected day','この日'`, `SN('Today','この日'`],
  ['js/widget-defs-map.js', `L('watchlist', 'ウォッチ'`, `L('watch', 'ウォッチ'`],
  ['js/atlas-console.js', `L('map points','地点'`, `L('points','地点'`],
];
test('④ every R363 rename is present, and the key it replaced is gone from that site', () => {
  for (const [file, want, gone] of RENAMES) {
    const src = read(file);
    assert.ok(src.includes(want), `${file}: expected ${want}…) — the R363 rename was reverted`);
    assert.ok(!src.includes(gone), `${file}: ${gone}…) is back — that key now carries two meanings again`);
  }
});

/* ── ⑤ the three defects that were not collisions ──────────────────────────────────────────── */
test('⑤ no Japanese argument is the English word, and the dead `ago` helper is gone', () => {
  const wp = read('js/world-packs.js');
  assert.ok(wp.includes(`L('Moderate','中程度'`), "world-packs.js: the Japanese for 'Moderate' is the English word again");
  assert.ok(!wp.includes(`L('Moderate','Moderate'`), "world-packs.js: L('Moderate','Moderate',…) is back");
  assert.ok(wp.includes(`L('Extreme','極端（最も深刻）'`), "world-packs.js: the Japanese for 'Extreme' has English mixed back in");
  assert.ok(!wp.includes(`'Extreme（最も深刻）'`), "world-packs.js: 'Extreme（最も深刻）' is back");

  /* `rel` was declared and never called — its ML('ago','','','','') never rendered, so there was
     nothing to translate. The only `rel` left in the file must be the rel="noopener" attribute. */
  const mon = read('js/monitors.js');
  assert.ok(!mon.includes(`ML('ago'`), 'monitors.js: the dead `rel` helper with the empty translations is back');
  /* …and the Russian branch beside it, which printed «мин назад» with no number at all */
  assert.ok(!mon.includes(`'мин назад',Math.round(diff/60)+' min'`),
    'monitors.js: the Russian relative time is missing its number again');
});

/* ── ⑤b ⚠⚠ WHEN A MEANING LEAVES, THE ROW IT WAS TRANSLATED FOR STAYS ─────────────────────────
   Moving the outlier to its own key fixes the outlier. It does NOT fix the key it left behind,
   whose row may have been written for the meaning that just departed — and if only one site now
   remains, the collision audit cannot see it, because one site is not a collision.
   `'Emergency'` was exactly that: two sites (救急 the hospital ER, 緊急（最高階級）the top class of
   the alert ladder) and a row that said «emergency room». The ER moved to `'Emergency room'`, and
   the alert ladder was left calling its most severe class «Urgences / 응급 / 急診» — a hospital
   department. The four rows must stay on the ALERT sense, and distinct from the three steps below
   them (Advisory < Warning < Danger < Emergency). */
test('⑤b the alert ladder is four distinct steps, and its top is not a hospital department', () => {
  const ER = { fr: 'Urgences', ko: '응급', zh: '急診', 'zh-hans': '急诊' };
  for (const code of ['fr', 'ko', 'zh', 'zh-hans']) {
    const src = read(`js/locales/ui.${code}.js`);
    const row = (k) => (src.match(new RegExp(`["']${k}["']\\s*:\\s*"([^"]*)"`)) || [])[1];
    const steps = ['Advisory', 'Warning', 'Danger', 'Emergency'].map(row);
    assert.ok(steps.every(Boolean), `ui.${code}.js: the alert ladder is missing a row — ${steps.join(' / ')}`);
    assert.notEqual(row('Emergency'), ER[code],
      `ui.${code}.js: 'Emergency' is back to the hospital-ER word, but its only call site is the TOP CLASS of the alert ladder (js/world-packs.js NORM_NAME)`);
    assert.equal(new Set(steps).size, 4,
      `ui.${code}.js: the four alert steps collapse to ${new Set(steps).size} distinct words — ${steps.join(' / ')}`);
  }
});

/* ── ⑥ the surface is actually RUN ─────────────────────────────────────────────────────────────
   #R301: a check that no list names never executes, and is therefore not a weaker check — it is
   not a check. This one has two registries to be in. */
test('⑥ the collision surface is wired into the one i18n gate and into test:checks', () => {
  const gate = read('scripts/i18n-audit.mjs');
  assert.ok(gate.includes(`run('i18n-key-collision-audit.mjs')`),
    'scripts/i18n-audit.mjs no longer runs the key-collision surface — `npm run check:i18n` would not see it');
  assert.ok(/collide\.unlisted\.length\)\s*problems\.push/.test(gate),
    'scripts/i18n-audit.mjs runs the surface but no longer FAILS on it');
  assert.ok(/collide\.stale\.length\)\s*problems\.push/.test(gate),
    'scripts/i18n-audit.mjs no longer fails on a stale BENIGN entry — the ratchet is one-directional');

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['test:checks'].includes('tests/r363-checks.test.mjs'),
    'tests/r363-checks.test.mjs is not in test:checks — it would never run');
});
