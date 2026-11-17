/* ============================================================================
 *  IntMap · tests/feature-consolidation-checks.test.mjs
 * ----------------------------------------------------------------------------
 *  (feature-consolidation, 2026-11-16) 「機能増えすぎ——消すのではなく整理を」. What this pins:
 *   ① a retired row id is history: a declaration may not name a CURRENT id in `formerly`, and the one resolver
 *      turns old ids into what replaced them (each once, a split into every row)
 *   ② a World Bank read that does not name its WDI source takes the catalogue's (corruption lives on source 3)
 *   ③ every World Bank row is painted by ONE table, and a touch screen can read a value by tapping
 *   ④ the vestiges that were removed stay removed (nothing on the page could reach them)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setProblems } from '../scripts/lib/layer-descriptor.mjs';
import * as M from '../js/layer-manifest.js';
import { makeWorldBankReader } from '../js/wb-indicators.js';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('① `formerly` is history, and one resolver reads it for the link, the session and the favourites', () => {
  const base = { shelf: 'lyrGrpClimate' };
  assert.deepEqual(setProblems([{ ...base, id: 'a', order: 1 }, { ...base, id: 'b', order: 2, formerly: ['old'] }]), []);
  assert.match(setProblems([{ ...base, id: 'a', order: 1 }, { ...base, id: 'b', order: 2, formerly: ['a'] }]).join('\n'),
    /`a` is in the `formerly` of b and is also a current id/, 'a current id named as retired is refused');
  /* every declared old id is not a row today, and opens rows that are */
  for (const l of M.LAYERS) for (const old of (M.layerDeclaration(l.id) || {}).formerly || []) {
    assert.ok(!M.isLayer(old), old + ' is retired and a row at once');
    assert.ok(M.currentIds(old).includes(l.id), old + ' does not open ' + l.id);
  }
  assert.deepEqual(M.translateRetired(['beta-dl-lifeexp', 'bx-wblife', 'dl-wars']).sort(), ['bx-wblife', 'dl-ww1', 'dl-ww2']);
  assert.deepEqual(M.currentIds('no-such-row'), ['no-such-row'], 'an id nobody retired is passed through unchanged');
  /* the three doors ask it */
  assert.match(codeOnly(read('js/map-ui.js')), /const want=translateRetired\(list\|\|\[\]\)/);
  assert.match(codeOnly(read('js/session-tabs.js')), /translateRetired\(want\)/);
  assert.match(codeOnly(read('js/layer-favs.js')), /currentIds\(id\)/);
  assert.ok(!/const RETIRED=/.test(codeOnly(read('js/session-tabs.js'))), 'a second table of retirements is back');
});

test('② a World Bank read that names no source takes the catalogue\'s', async () => {
  const asked = [];
  const R = makeWorldBankReader({ clockFor: () => 1000, readWithin: async (u) => { asked.push(u); return { text: '[{},[]]' }; } });
  await R.read({ code: 'GOV_WGI_CC.SC', perPage: 1 });
  await R.read({ code: 'SP.DYN.LE00.IN', perPage: 1 });
  assert.match(asked[0], /[?&]source=3(&|$)/, 'the corruption series is asked on its own source');
  assert.ok(!/source=/.test(asked[1]), 'a default-source series is asked as before');
});

test('③ one World Bank table paints every World Bank row, and a tap reads a value on a touch screen', () => {
  const packs = codeOnly(read('js/layer-packs.js'));
  assert.ok(!/function wbToggle\(/.test(packs), 'js/layer-packs.js paints World Bank series again');
  const wb = codeOnly(read('js/wb-layers.js'));
  const hover = wb.slice(wb.indexOf('function _wbHover('), wb.indexOf('const _nmOf='));
  assert.match(hover, /_imTouchPrimary\(\)\) GE\(\)\.events\.onLayer\('click',fill,/, 'no tap popup on a touch screen');
  assert.match(hover, /IntMapSafe\.html\(bxLabel\(L\(\)\)\)/, 'the popup writes the name as text');
});

test('④ the removed vestiges stay removed', () => {
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => codeOnly(read('js/' + f))).join('\n');
  for (const name of ['imIsPro', 'refreshProUI', 'openProModal', '_imWelcome', 'IntMapOverlays', 'proIntelOn']) {
    assert.ok(!new RegExp('\\b' + name + '\\b').test(js), name + ' is back');
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/premium-plan.js')), 'js/premium-plan.js is back');
});
