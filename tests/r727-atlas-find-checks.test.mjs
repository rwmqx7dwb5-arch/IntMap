/* ============================================================================
 *  #R727 — find_capability reads the catalogue too, and a term is worth what it distinguishes
 * ----------------------------------------------------------------------------
 *  Production verification of #R726 (2026-09-15): asked 「ISSは今どこ？次に東京の上空を通るのはいつ？」,
 *  Atlas searched for «ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測…» and
 *  got `matches: []` — the aliases are English camelCase words and the category hints are verbs;
 *  the SUBJECT («ISS», 「衛星」) lives only in the catalogue block. Told IntMap had no such control,
 *  Atlas researched a position the satellite layer was propagating and spent seventeen steps.
 *
 *  ① the catalogue block is part of the score, so a request that names the subject reaches the
 *     capability; ② a term is weighted by how few blocks carry it (inverse document frequency in one
 *     line), so the longest block does not win every search; ③ a Latin term is a whole word («iss» is
 *     not inside «missile»); ④ an exact alias still outranks any documentation score; ⑤ the empty
 *     note tells Atlas what to do with the ids it already holds instead of «no such control».
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const top = (q) => CAPS.search(q, { want: 3, min: 1 }).ranked.map((r) => r.id);

test('R727 ① the measured request reaches layers.satellites first, in Japanese and in English', () => {
  for (const q of [
    'ISS（NORAD 25544）のリアルタイム位置と、指定地点からの次回可視通過予測（見え始め・最大仰角・見え終わり、方位、仰角、明るさ、JST）',
    'where is the ISS now', 'when does the ISS next pass over Tokyo', 'ISSは今どこ？', 'GPS衛星を見せて',
  ]) assert.equal(top(q)[0], 'layers.satellites', q + ' → ' + top(q).slice(0, 3).join(', '));
});

test('R727 ② a term common to many blocks is worth little, so the longest block does not win', () => {
  /* 「位置」「現在」 sit in dozens of blocks; without the weighting map.clear (the longest block) led the ISS search */
  const ids = top('ISS（NORAD 25544）のリアルタイム位置');
  assert.equal(ids[0], 'layers.satellites', ids.slice(0, 3).join(', '));
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js')));
  assert.match(liftFunction(src, 'docTermScore'), /Math\.min\(1, 2 \/ Math\.max\(1, df\)\)/, 'points fall with the number of blocks that carry the term');
});

test('R727 ③ a Latin term is matched as a word — «iss» is not found inside «missile»', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js')));
  const fn = liftFunction(src, 'hasTerm');
  const hasTerm = new Function('var _termRe = {}; return ' + fn)();
  assert.equal(hasTerm('a missile strike', 'iss'), false);
  assert.equal(hasTerm('the iss passes', 'iss'), true);
  assert.equal(hasTerm('人工衛星を表示', '衛星'), true, 'a CJK window is a substring');
});

test('R727 ④ an exact alias still outranks any documentation score', () => {
  const r = CAPS.search('show live satellites', { want: 1, min: 1 }).ranked;
  assert.equal(r[0].id, 'layers.satellites');
  assert.ok(r[0].score >= 100, 'exact alias = 100 points');
  assert.ok(r[0].score - r[1].score > 30, 'documentation alone cannot close that gap (cap 30)');
  assert.equal(top('rank countries by life expectancy')[0], 'data.rank');
  assert.equal(top('基本表示をデフォルトに戻して')[0], 'layers.baseDisplay');
});

test('R727 ⑤ the empty note points Atlas at the ids it already holds, not at «no such control» alone', () => {
  const fn = liftFunction(codeOnly(readLF(join(ROOT, 'js/atlas-toolsurface.js'))), 'find');
  assert.match(fn, /call run_capability with it directly/);
  assert.match(fn, /Rephrasing this search will not find more/);
});
