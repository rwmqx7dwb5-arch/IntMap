/* ============================================================================
 *  first-impression — the facts the first visit rests on, checked without a browser.
 * ----------------------------------------------------------------------------
 *  tests/first-impression.spec.js asks a running app (one cold boot at 1024×768). These ask the
 *  source the same questions where a source can answer them — EVALUATED where the answer is a value
 *  (the sidebar's first-visit state, the rail's marks), and asked of the PARSE TREE where the answer is
 *  «who calls what» (no regex over code for a call graph: a comment or a string would satisfy it).
 *
 *   ①  a session that has never answered «is the left column open» boots it SHUT — on every device.
 *   ②  the right layer panel opens at boot only for a session that left it open.
 *   ③  the thumbnail gate has exactly one key: kick(), i.e. a grid being shown.
 *   ④  the world gazetteer is asked for by its readers, not by the boot's index build.
 *   ⑤  the Chronos year rail is the kernel's own axis: floor first, «now» last, positions in order.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, walkSource } from './helpers/ast.mjs';
import { histScale } from './helpers/hist-scale.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the names of the functions that enclose every call to `callee` (a bare identifier, or `x.callee`) */
function callersOf(src, callee, sourceType = 'module') {
  const ast = parseSource(src, { sourceType });
  const out = [];
  walkSource(ast, {
    CallExpression(node, ancestors) {
      const c = node.callee;
      const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
      if (name !== callee) return;
      const fn = [...ancestors].reverse().find((a) => a.type === 'FunctionDeclaration');
      out.push(fn && fn.id ? fn.id.name : '(top)');
    },
  }, 'ancestor');
  return out;
}

/* every place `name` is REFERENCED (called, or handed over as a callback) other than its own declaration,
   by enclosing function — handing `_openQueue` to requestIdleCallback is as much an opening as calling it */
function referencesOf(src, name) {
  const ast = parseSource(src, { sourceType: 'module' });
  const out = [];
  walkSource(ast, {
    Identifier(node, ancestors) {
      if (node.name !== name) return;
      const parent = ancestors[ancestors.length - 2];
      if (parent && parent.type === 'FunctionDeclaration' && parent.id === node) return;   /* the declaration */
      const fn = [...ancestors].reverse().find((a) => a.type === 'FunctionDeclaration' && a.id !== node);
      out.push(fn && fn.id ? fn.id.name : '(top)');
    },
  }, 'ancestor');
  return out;
}

test('① an unanswered session boots the left column shut, whatever the device', () => {
  const src = read('js/app-body.js');
  /* the ONE statement that sets the column's boot state, read from the source and EVALUATED */
  const m = /sidebar\.classList\.toggle\('collapsed',([^;]+)\);/.exec(src);
  assert.ok(m, 'js/app-body.js sets the column state with one toggle');
  const collapsedFor = (left) => Function('_sessUI', 'isMobile', 'return (' + m[1] + ');')({ left, right: null }, () => false);
  assert.equal(collapsedFor(null), true, 'a first visit (no saved answer) boots it shut');
  assert.equal(collapsedFor(false), true, 'a session that shut it keeps it shut');
  assert.equal(collapsedFor(true), false, 'a session that left it open gets it back');
  /* and nothing before that statement decides it per device any more */
  const at = src.indexOf(m[0]);
  const before = codeOnly(src.slice(Math.max(0, at - 1500), at));
  assert.ok(!/if\(isMobile\(\)\)\s*sidebar\.classList\.add\('collapsed'\)/.test(before), 'no device-only first-visit branch is left');
});

test('② the right layer panel auto-opens only for a session that left it open', () => {
  const code = codeOnly(read('js/map-ui.js'));
  assert.ok(!/\bunanswered\b/.test(code), 'there is no «unanswered → open» branch');
  assert.match(code, /if\(!isMob\(\)&&ui&&ui\.right===true\) open\(\);/, 'the boot opens it only when the saved answer is true');
});

test('③ the thumbnail gate is opened by kick() and by nothing else', () => {
  const src = read('js/layer-previews.js');
  const refs = referencesOf(src, '_openQueue');
  assert.deepEqual([...new Set(refs)], ['kick'], 'only kick() — «this grid is shown» — opens the queue (got ' + refs.join(', ') + ')');
  /* and every caller of kick() in the layer panel is a place where the grid is on screen */
  const ui = read('js/map-ui.js');
  const kicks = callersOf(ui, 'kick', 'module');
  assert.ok(kicks.length >= 3, 'the panel open, the sheet mount and the favourites row kick');
  for (const fn of kicks) assert.ok(['open', 'mountInto', 'refreshFavs'].includes(fn), 'kick() is called from ' + fn);
  /* the favourites row kicks only a host that is on screen */
  const fav = ui.slice(ui.indexOf('function refreshFavs('), ui.indexOf('function refreshFavs(') + 1400);
  assert.match(fav, /if\(h===sb\?sb\.classList\.contains\('open'\):_hostShown\(h\)\)/, 'a ★ change while the panel is shut does not open the gate');
});

test('④ the world gazetteer is fetched by its readers, not by the boot\'s index build', () => {
  const nc = read('js/news-context.js');
  const warmers = callersOf(nc, 'warm');
  assert.ok(!warmers.includes('rebuildGeoIndex'), 'the index build (a boot step) does not send for the world rows');
  assert.ok(warmers.includes('analyzeContext'), 'the locator\'s first pass over a headline does');
  /* the index still LISTENS, so whoever asks, the rows reach the locator */
  assert.match(nc, /addEventListener\('intmap-gazetteer-world',\(\)=>\{ try\{ rebuildGeoIndex\(\); \}catch\(_\)\{\} \},\{once:true\}\)/);
  /* the search box asks at the reach (focus / press), the same gesture that warms the country data */
  const ab = read('js/app-body.js');
  const reach = /const _reach=\(\)=>\{([\s\S]*?)\};\n\s*inp\.addEventListener\('focus',_reach,\{once:true\}\);\n\s*btn\.addEventListener\('pointerdown',_reach,\{once:true\}\);/.exec(ab);
  assert.ok(reach, 'the search field and its button share one reach handler');
  assert.match(reach[1], /IntMapGazetteer[\s\S]*\.warm\(\)/, 'which asks for the world gazetteer');
  assert.match(reach[1], /loadCountryData\(\)/, 'and still for the country data');
});

test('⑤ the Chronos year rail is the kernel\'s axis: floor first, «now» last, in rail order', () => {
  const HS = histScale();
  const lo = Math.round(HS.FLOOR), hi = new Date().getFullYear();
  /* buildPeek's own derivation — read from the source so this is the code that runs, then evaluated */
  const nt = read('js/news-timeline.js');
  const body = nt.slice(nt.indexOf('function buildPeek('), nt.indexOf('function placePeek('));
  assert.match(body, /HS\(\)\.niceTicks\(lo,curY,(\d+)\)/, 'the marks are niceTicks over the kernel\'s floor and the current year');
  assert.match(body, /y2p\(y\)/, 'and each sits at the slider\'s own position for its year');
  assert.match(body, /IntMapTime\.setYear\(y,\{source:'ui'\}\)/, 'a mark writes the master clock');
  assert.match(body, /IntMapTime\.setNow\(\{source:'ui'\}\)/, '«now» returns it to live');
  const n = +/HS\(\)\.niceTicks\(lo,curY,(\d+)\)/.exec(body)[1];
  let marks = HS.niceTicks(lo, hi, n).filter((y) => y >= lo && y < hi);
  if (marks[0] !== lo) marks.unshift(lo);
  assert.equal(marks[0], lo, 'the floor is the first mark');
  assert.ok(marks.length >= 3, 'a handful of marks between the floor and now (' + marks.join(', ') + ')');
  const pos = marks.map((y) => HS.rail.toPos(y, lo, hi));
  for (let i = 1; i < pos.length; i++) assert.ok(pos[i] > pos[i - 1], 'marks are in rail order (' + marks[i - 1] + ' → ' + marks[i] + ')');
  assert.ok(pos[pos.length - 1] < HS.rail.POS, 'every year mark is short of «now», which closes the rail');
});
