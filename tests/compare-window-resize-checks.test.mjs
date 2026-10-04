/* (compare-window-resize) 「compare viewのウィンドウ、サイズ変更ができない。」 — the compare window resizes through the
 * app's ONE edge-resize (js/window-manager.js addEdgeResize), not a mechanism of its own; on a phone the edge zone stands aside. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('compare-window-resize ① the compare window asks the app\'s one edge-resize, with a minimum and a phone skip', () => {
  const src = codeOnly(read('js/compare.js'));
  assert.match(src, /HOST\.addEdgeResize\(win,\{ min:\[260,200\], skip:\(\)=>/, 'the compare window does not call addEdgeResize');
  assert.match(src, /skip:\(\)=>_compact\(\)/, 'the skip is the phone layout');
  assert.match(src, /const _compact=\(\)=>\{ try\{ return !!window\.IntMapDevice\.compact\(\); \}/, 'the phone layout is the device module\'s own predicate, read in one place');
  /* its own resize is gone: no corner squares, no second pointer machine */
  assert.doesNotMatch(src, /cmp-rz/, 'the four corner squares are back');
  assert.doesNotMatch(src, /FOUR-corner/);
  /* the phone height grip and the map's ResizeObserver stay */
  assert.match(src, /\.cmp-resize/);
  assert.match(src, /new ResizeObserver\(/);
});

test('compare-window-resize ② addEdgeResize asks the caller\'s skip before hover and press', () => {
  const src = read('js/window-manager.js');
  const body = src.slice(src.indexOf('function addEdgeResize('), src.indexOf('function _armCornerCatch('));
  assert.match(body, /const _inWsWin2=\(\)=>\{ try\{ if\(typeof opts\.skip==='function'&&opts\.skip\(\)\) return true;/);
  assert.match(body, /addEventListener\('pointermove',\(e\)=>\{ if\(panel\.dataset\.resizing\|\|_inWsWin2\(\)\) return;/, 'hover does not ask');
  assert.match(body, /addEventListener\('pointerdown',\(e\)=>\{ if\(_inWsWin2\(\)\) return;/, 'press does not ask');
});
