/* 国名の消える閾値・地名ポップアップの 2×2・操作感度の基準値と移行・Isolate の縁（dev-notes/2026-11-27-map-labels-sensitivity-outline.md）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule } from './helpers/import-module.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('① 国名は領域の長辺が表示範囲に達したら消える（閾値は規則 1 つ・国名の列挙なし）', async () => {
  const win = {}; await importModule('js/country-extent.js', { globals: { window: win } });
  const CE = win.IntMapCountryExtent;
  assert.equal(CE.NAME_GONE_SHARE, 1);
  const france = [-5, 42, 9, 51], malta = [14.1, 35.8, 14.6, 36.1];
  for (const e of [france, malta]) {
    assert.ok(CE.viewShare(e, 0, 1400, 800) < 1, 'at the world view the name is shown');
    assert.ok(CE.viewShare(e, 16, 1400, 800) >= 1, 'zoomed past the region it is gone');
  }
});

test('② 地名ポップアップのボタンは全幅で 2 列の格子', () => {
  const css = read('css/intmap.css');
  assert.match(css, /\.plc-popup \.plc-acts\{ display:grid; grid-template-columns:repeat\(2,/);
  assert.doesNotMatch(css, /\.plc-popup \.plc-acts\{ flex-direction:column/);
});

test('③ 感度スライダー 100% は従来の 170/170/110 と同じ実効値になり、旧設定は移行される', async () => {
  const calls = { zoom: [], glide: null };
  const win = { imNavZoomSens: 1, imNavPanSens: 1, imNavInertia: 1 };
  const GEo = { hasRenderer: () => true, render: { canvasContainer: () => null },
    input: { set() { }, setZoomRate: (r, w) => calls.zoom.push([r, w]), setGlide: (g) => { calls.glide = g; } },
    events: { once() { } }, camera: {} };
  const prev = globalThis.window; globalThis.window = win;
  try {
    const { makeWheelZoom } = await importModule('js/wheel-zoom.js', { globals: { window: win } });
    makeWheelZoom({}, { GE: () => GEo, i18n: {} });
    assert.deepEqual(win.IM_NAV_BASE, { zoom: 1.7, pan: 1.7, inertia: 1.1 });
    assert.ok(Math.abs(calls.zoom[0][0] - 1.7 / 300) < 1e-12);
    assert.ok(Math.abs(calls.glide.speed - 1.7) < 1e-12 && Math.abs(calls.glide.length - 1.1) < 1e-12);
    win.imNavZoomSens = 0.5; win._applyNavSens();
    assert.ok(Math.abs(calls.zoom.at(-2)[0] - 0.85 / 300) < 1e-12, 'a slider value is a percent of the default');
  } finally { if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
  const src = read('js/app-body.js');
  assert.match(src, /navVer:2,/, 'saved settings carry the scale version');
  assert.match(src, /s\.navVer>=2\|\|v===1\)\?v:/, 'a pre-rebase value of 1 follows the new default; others keep their raw feel');
});

test('④ Isolate は国の ofm 国境線をマスクの上に引き直す', () => {
  const src = read('js/map-tools.js');
  assert.match(src, /id:'iso-edge'[^]*'source-layer':'boundary'|'source-layer':'boundary'[^]*id:'iso-edge'|GE\(\)\.layers\.add\(\{id:'iso-edge',type:'line',source:'ofm','source-layer':'boundary'/);
  assert.match(src, /for\(const id of top\) GE\(\)\.layers\.move\(id\)/, 'the edge stays above the mask');
  assert.match(src, /function exit\(\)\{[^}]*\} hideEdge\(\);|hideEdge\(\);/);
});
