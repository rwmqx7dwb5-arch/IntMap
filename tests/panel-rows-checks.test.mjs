/* ============================================================================
 *  IntMap · layer-panel rows — which shelf a row is on, and whether its switch and its layers agree
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r153-checks.test.mjs #4 / tests/r154-checks.test.mjs #3 (the Street View
 *  coverage line), tests/r154-checks.test.mjs #10 (a learned layer left painted after OFF) and
 *  tests/r233-checks.test.mjs ⑤ ⑥ (Population & economy; day/night). From their headers:
 * ==========================================================================*/
//   #4  Street View coverage line — genuinely thinner via tileSize:128 overzoom + maxzoom:21
//   #3  Street View coverage line — tileSize 128→64 (~0.9px hairline) + opacity 0.9→0.62
//   #10 Layer on/off desync — an auto-learned layer left visible after being toggled OFF is now hidden by _auditLearned
//   ⑤  Population & economy is the seven layers the instruction names, and nothing else
//   ⑥  day/night shading is a basic-display switch, not a hazard overlay
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
import { readdirSync } from 'node:fs';
import { byKey } from './helpers/layer-groups.mjs';

const ROOT = root;
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
test('R153/R154 #4 Street View coverage line thinner via overzoom', () => {
  /* spelling kept — the row wiring lives in js/data-layers.js's map-host closure; shelves are asked through tests/helpers/layer-groups.mjs where they can be */
  /* ⚠ FOLDED HERE: 'R154 #3 Street View coverage line — thinner hairline' asserted exactly these two lines. */
  assert.match(html, /type:'raster',tileSize:64,minzoom:0,maxzoom:21/, 'R154: svv source tileSize 128→64 (fetch z+3, ~4× downscale → ~0.9px hairline)');
  assert.match(html, /'raster-opacity':0\.62/, 'R154: coverage opacity 0.9→0.62 (lighter perceived weight)');
});

test('R154 #10 Layer on/off desync — OFF learned layer is hidden', () => {
  /* spelling kept — the row wiring lives in js/data-layers.js's map-host closure; shelves are asked through tests/helpers/layer-groups.mjs where they can be */
  assert.match(html, /function _ownedByCheckedOther\(cbId,lid\)\{/, 'cross-owner guard so an OFF-hide never mis-hides');
  assert.match(html, /function _auditLearned\(cb\)\{ try\{ if\(_LEARN_SKIP\.test\(cb\.id\)\|\|userTouched\(cb\)\)/, 'guards apply to BOTH directions (no !cb.checked bail)');
  assert.match(html, /if\(!cb\.checked\)\{[\s\S]*fix:'hide-learned'[\s\S]*setLayout\(lid,'visibility','none'\)/   /* (#R178) …through the contract (layers.setLayout) */, 'OFF + still-painted owned layers are hidden');
  /* ⚠ (#R276) ASSERTED AS A PROPERTY, NOT AS A LINE. The original pinned the exact text
     `try{ state[id].on=false; }catch(_){}` and its trailing comment; #R276 rewrote that failure
     branch (the toast, the state, the checkbox and the legend) and the property — a load failure
     clears the STATE, not only the checkbox — is unchanged and is what is checked. Pinning the line
     turned a correct change into a red test, which is this project's most-repeated false signal. */
  {
    const after = html.slice(html.indexOf('function toggle(id,on)'));
    const m = /\.catch\(\(\)=>\{([\s\S]{0,700}?)\n\s*\}\);/.exec(after);
    assert.ok(m, 'the ECMWF toggle has a failure branch');
    assert.match(m[1], /state\[id\]\.on=false/, 'ECMWF load-failure also clears state.on…');
    assert.match(m[1], /cb\.checked=false/, '…as well as the checkbox');
  }
});

/* ── ⑤ Population & economy is the seven that were named ─────────────────────────────────────── */
test('R233 layers: Population & economy is the seven named layers, the rest fell to beta', () => {
  /* spelling kept — the row wiring lives in js/data-layers.js's map-host closure; shelves are asked through tests/helpers/layer-groups.mjs where they can be */
  const dl = read('js/data-layers.js');
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(byKey.lyrGrpDemo, 'the group is still built from a list');
  const ids = byKey.lyrGrpDemo;
  /* ⚠ (#R254) 'energy' JOINED THE SEVEN, BY INSTRUCTION — 「エネルギー構成レイヤーは昇格」, and the
     reader chose this group when asked which one. So the assertion is «the seven #R233 named, plus
     whatever a later instruction promoted», not a frozen set: freezing it would make the next
     promotion look like a regression. The seven are still asserted individually, which is what
     #R233's own report was about (nothing else may fall back IN by accident). */
  /* ══ ⚠⚠ (#R271) THE SEVEN ARE STILL CURATED — THEY ARE NO LONGER ALL ON ONE SHELF ═══════════
     「レイヤーのカテゴリ分類があきらかに不適切なレイヤーが大量にある。大規模に…再編しろ。」 #R233's
     report was that 人口・経済 had swollen to twenty-five World-Bank rows and that these SEVEN are
     the curated set; the shelf they sit on was this file's reading, not the instruction's. #R271
     moved four of them to the shelf their own subject names (民主主義指数 and 汚職指標 → 政治・統治,
     平均寿命 → 医療・衛生, エネルギー構成 → エネルギー・資源) under an explicit instruction to
     reorganise. Pinning the shelf here would have made that instruction look like a regression, so
     what is asserted is the property #R233 was actually about: each of them is on a CURATED shelf,
     exactly one, and none of them fell back into Beta / Others. */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const shelves = byKey;
  const shelfOf = (id) => Object.keys(shelves).filter((g) => shelves[g].includes(id));
  const SEVEN = ['cpi', 'dem', 'gdppc', 'hdi', 'lifeexp', 'popgrid', 'tfr'];
  SEVEN.concat(['energy']).forEach((id) => {
    const w = shelfOf(id);
    assert.equal(w.length, 1, id + ' must be on exactly one shelf, not ' + w.length);
    assert.ok(!/Others|Beta/i.test(w[0]),
      id + ' fell back into ' + w[0] + '; #R233 named it as a curated row');
  });
  assert.ok(ids.includes('popgrid') && ids.includes('tfr'),
    '人口密度 and 合計特殊出生率 are what 人口・経済 is named for and must stay on it');
  /* ⚠ THE DEMOTED ROWS MUST STILL EXIST — 「betaに降格」 is a section change, not a deletion, and a
     regression that quietly dropped them would look identical in the panel. Their owners are spread
     across js/ (data-layers builds `pop`, layer-packs and wb-layers build the World-Bank set), so the
     question is asked of the whole directory rather than of one file. */
  const all = readdirSync(new URL('js/', ROOT))
    .filter((f) => f.endsWith('.js')).map((f) => read('js/' + f)).join('\n');
  for (const id of ['pop', 'unemp', 'internet', 'wbgini', 'wbschool']) {
    assert.ok(new RegExp("'" + id + "'").test(all), `${id} is demoted, not deleted`);
  }
});

/* ── ⑥ day/night is a basic-display switch ───────────────────────────────────────────────────── */
test('R233 the day/night shading sits in the basic-display block, exactly once', () => {
  /* spelling kept — the row wiring lives in js/data-layers.js's map-host closure; shelves are asked through tests/helpers/layer-groups.mjs where they can be */
  const dl = read('js/data-layers.js');
  assert.match(dl, /const nsRow=rowFor\('nightside'\);/, 'it is placed with the always-there view switches');
  assert.match(dl, /if\(nsRow\) placed\.add\(nsRow\);/,
    'and marked placed, or the safety sweep would file it under Others (beta) as well');
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(!byKey.lyrGrpHazard.includes('nightside'), 'it is no longer a hazard overlay — one row, one owner');
});
