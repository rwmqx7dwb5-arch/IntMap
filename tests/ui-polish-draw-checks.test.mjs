/* ============================================================================
 *  IntMap · UI polish batch: the draw stroke's per-event cost, the country outline's source,
 *  the Objects panel's width/opacity sliders and its head spacing (js/map-tools.js, js/map-extras.js)
 * ----------------------------------------------------------------------------
 *  READ, NOT RUN: each of these is a property of how a handler is built or of what a layer is
 *  declared to read, which a browser computes; what is asked is the shipped text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\r\n/g, '\n');
const tools = read('js/map-tools.js');
const extras = read('js/map-extras.js');

/* the text of `function <name>(` up to the matching close brace */
function body(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' exists');
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('unbalanced ' + name);
}

test('draw: a pointer event does O(1) work and the paint is coalesced to one per frame', () => {
  const s = codeOnly(body(tools, 'sample'));
  for (const heavy of ['recomputeLine', 'recomputeArea', 'setData(', 'updateNumbers(', 'rdp(']) {
    assert.ok(!s.includes(heavy), 'sample() must not call ' + heavy + ' per pointer event');
  }
  assert.match(s, /scheduleFlush\(\)/, 'the write is scheduled, not performed');
  const flush = codeOnly(body(tools, 'scheduleFlush'));
  assert.match(flush, /requestAnimationFrame/, 'one flush per animation frame');
  assert.match(flush, /setData\(\)[\s\S]*updateNumbers\(\)/, 'the frame writes the source and the readout together');
  assert.match(codeOnly(body(tools, 'finish')), /recomputeLine\(\)/, 'committing still simplifies, so the final line and length are unchanged');
  assert.match(codeOnly(body(tools, 'finish')), /flushNow\(\)/, 'a pending frame is cancelled when the stroke commits');
});

/* (isolate-outline-geometry) the outline test that stood here required the line to be the ofm `boundary` layer filtered by adm0_l /
   adm0_r — the tiles omit one or both codes on a third of the frontier pieces, so that line broke off. The outline's fill and line are
   now one shape fitted to the drawn border, measured in tests/isolate-outline-geometry-checks.test.mjs. */

test('Objects: width and opacity are stored on the item and read by the layer', () => {
  assert.match(extras, /'line-width':\['coalesce',\['get','lw'\]/, 'annot-line reads width from the feature');
  assert.match(extras, /'line-opacity':\['coalesce',\['get','lop'\]/, 'annot-line reads opacity from the feature');
  assert.match(extras, /lw:it\.width/, 'the feature carries the item width');
  assert.match(tools, /setWidth:w=>\{ it\.width=w;/, 'annotation entries can set width');
  assert.match(tools, /data-act="width"/);
  assert.match(tools, /data-act="alpha"/);
  assert.match(tools, /act==='width'/, 'the input handler wires the width slider');
});

test('Objects: the head buttons have a gap and a 28 px hit area', () => {
  assert.match(tools, /\.iol-clear,#iol-panel \.iol-head \.iol-close\{min-width:28px;min-height:28px;/);
  assert.match(tools, /\.iol-head \.iol-close\{margin-inline-start:14px;\}/);
});
