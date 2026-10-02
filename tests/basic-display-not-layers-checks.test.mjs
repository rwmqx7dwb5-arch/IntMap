/* ============================================================================
 *  basic-display-not-layers — the map display (基本表示) is not a layer, and no layer is on by default
 * ----------------------------------------------------------------------------
 *  The reader, 2026-10-02:「どちらも規定レイヤーは削除。基本表示をレイヤーって言うな。」
 *  元の欠陥: 地名・ラベル・国境・道路・鉄道・昼夜・3D 建物は、パネルでは「基本表示」の節だったが、構造の上では
 *  レイヤーと同じ登録簿の行で、種類を述べる欄が無かった。紹介ページの「174 のレイヤー」・共有リンクの `l=`・
 *  利用統計の `layer`・Atlas の「全レイヤーをオフ」（4 つの id を正規表現で書き出していた）は区別せずに数えていた。
 *  そしてケッペンと海底ケーブルは初めての読者に点いていた（#R186）。
 *
 *  What this file RUNS:
 *    ① the kind is a fact of the declaration: every row of the `base` shelf says `kind: 'display'` and no other
 *       row does; layers + display items are the registry; no LAYER is `on`
 *    ② the gate refuses each half — a display item off the `base` shelf, a layer on it, a shelf that mixes them
 *    ③ the numbers the reader is told count layers only (the landing page, both languages)
 *    ④ the share link: `l=` carries layers, `d=` the display items; a link from before `d=` (display items in
 *       `l=`) still names them, and decode → encode gives every such link back unchanged
 *    ⑤ Atlas's 「all layers off」 leaves the map display alone (all:true clears it) and counts the two apart
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../js/layer-manifest.js';
import { SHELVES as SHELF_LIST } from '../js/layers/_shelves.js';
import { descriptorProblems, setProblems } from '../scripts/lib/layer-descriptor.mjs';
import { decode, encode } from '../js/map-state.js';
import { facts } from '../scripts/landing.mjs';
import CAPS from '../js/atlas-cap-layers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① ──────────────────────────────────────────────────────────────────────────────────── */
test('basic-display-not-layers ① the kind is the declaration\'s, the base shelf is exactly the map display, and no layer is on', () => {
  const base = M.SHELVES.find((s) => s.key === M.BASE).layers.map((l) => l.id);
  const shown = M.displayItems().map((l) => l.id);
  assert.ok(shown.length > 0, 'there is a map display');
  assert.deepEqual(shown, base, 'the map display is the base shelf, in panel order');
  assert.deepEqual(M.basicLayers(), shown, 'the section every counter subtracts is the map display');
  assert.equal(M.dataLayers().length + shown.length, M.LAYERS.length, 'every row is a layer or a display item');
  for (const l of M.LAYERS) assert.equal(M.isDisplay(l.id), l.kind === 'display', l.id);
  assert.equal(M.isDisplay('no-such-row'), false);
  assert.deepEqual(M.defaultLayers(), [], 'no layer is on for a first-time reader');
  const onLayers = M.dataLayers().filter((l) => l.on).map((l) => l.id);
  assert.deepEqual(onLayers, [], 'no layer declares `on`');
  for (const id of M.defaultOn()) assert.ok(M.isDisplay(id), id + ' is on by default and is not a display item');
  for (const c of M.catalog()) assert.equal(c.kind, M.isDisplay(c.id) ? 'display' : 'layer', 'Atlas\'s catalogue states the kind of ' + c.id);
});

/* ── ② ──────────────────────────────────────────────────────────────────────────────────── */
test('basic-display-not-layers ② the gate refuses a display item off its shelf, a layer on it, and a mixed shelf', () => {
  const shelves = new Set(SHELF_LIST.map((s) => s.key));
  const ok = { id: 'zz-a', kind: 'display', shelf: 'base', order: 999 };
  assert.deepEqual(descriptorProblems(ok, 'zz-a.js', shelves), []);
  const off = descriptorProblems({ id: 'zz-b', kind: 'display', shelf: 'lyrGrpClimate', order: 999 }, 'zz-b.js', shelves);
  assert.ok(off.some((m) => /display item/.test(m)), off.join('\n'));
  const onBase = descriptorProblems({ id: 'zz-c', shelf: 'base', order: 998 }, 'zz-c.js', shelves);
  assert.ok(onBase.some((m) => /map display only/.test(m)), onBase.join('\n'));
  const odd = descriptorProblems({ id: 'zz-d', kind: 'overlay', shelf: 'lyrGrpClimate', order: 997 }, 'zz-d.js', shelves);
  assert.ok(odd.some((m) => /`kind` is one of/.test(m)), odd.join('\n'));
  const mixed = setProblems([{ id: 'zz-e', shelf: 'hidden', order: 1 }, { id: 'zz-f', kind: 'display', shelf: 'hidden', order: 2 }]);
  assert.ok(mixed.some((m) => /mixes/.test(m)), mixed.join('\n'));
});

/* ── ③ ──────────────────────────────────────────────────────────────────────────────────── */
test('basic-display-not-layers ③ the landing page counts layers, not the map display', () => {
  const n = M.dataLayers().length;
  assert.equal(facts().layers, n);
  assert.ok(read('about.html').includes('IntMap has ' + n + ' layers'), 'about.html states the number of layers');
  assert.ok(read('ja/about.html').includes('IntMap には' + n + 'のレイヤー'), 'ja/about.html states the number of layers');
  assert.ok(!read('about.html').includes('IntMap has ' + M.LAYERS.length + ' layers'), 'the old count that included the map display');
});

/* ── ④ ──────────────────────────────────────────────────────────────────────────────────── */
test('basic-display-not-layers ④ the share link: l= is layers, d= is the map display, and an older link still opens the same map', () => {
  const shared = M.sharedIds(), shownShared = M.sharedDisplayIds();
  assert.ok(shownShared.length > 0, 'some display items travel in the link');
  for (const id of shared) assert.ok(!M.isDisplay(id), id + ' is carried as a layer');
  for (const id of shownShared) assert.ok(M.isDisplay(id), id + ' is carried as a display item');
  const v = { lng: 1, lat: 2, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' };
  /* a new link */
  const h = encode({ view: v, layers: ['dl-climate'], display: [shownShared[0]] });
  assert.match(h, /&l=dl-climate&d=/);
  const st = decode(h);
  assert.deepEqual(st.layers, ['dl-climate']);
  assert.deepEqual(st.display, [shownShared[0]]);
  assert.equal(encode(st), h, 'round trip');
  /* a link from before the field: display items in l=, no d= — the codec says null (read l=), and gives the link back */
  const old = '#v=1.0000,2.0000,3.00,0,0,f&l=' + shownShared[0] + ',dl-climate';
  const o = decode(old);
  assert.equal(o.display, null, 'no `d=` is «what l= names», not «none»');
  assert.deepEqual(o.layers.filter((id) => M.isDisplay(id)), [shownShared[0]], 'the display item the old link names is still in it');
  assert.equal(encode(o), old, 'an old link decodes and encodes back to itself');
  /* the owner reads null as l= — through the restore's state, which the store hands every owner */
  const ui = read('js/map-ui.js');
  assert.ok(/MapState\.own\('display',/.test(ui), 'js/map-ui.js owns the display field');
  assert.ok(/list==null\?\(\(ctx&&ctx\.state&&ctx\.state\.layers\)/.test(ui), 'a link with no `d=` is read from its `l=`');
  assert.ok(/const want=\(list\|\|\[\]\)\.filter\(k=>!isDisplay\(k\)\)/.test(ui), 'the layers field opens layers only');
});

/* ── ⑤ ──────────────────────────────────────────────────────────────────────────────────── */
test('basic-display-not-layers ⑤ Atlas\'s all-layers-off leaves the map display, and all:true clears it, counted apart', async () => {
  const cap = CAPS.find((c) => c.row[0] === 'layers.allOff');
  assert.ok(cap, 'layers.allOff exists');
  const ids = M.LAYERS.map((l) => l.id);
  const rig = () => { const boxes = ids.map((id) => ({ id, checked: true, dispatchEvent() { } }));
    return { boxes, K: { layerCatalog: () => boxes.map((cb) => ({ cb })), R: (ok, html) => ({ ok, html }), note: (s) => s, L: (en) => en } }; };
  let r = rig();
  let out = await cap.run({}, {}, r.K);
  for (const b of r.boxes) assert.equal(b.checked, M.isDisplay(b.id), b.id + (b.checked ? ' left on' : ' turned off'));
  assert.match(out.html, new RegExp('^✓ ' + M.dataLayers().length + ' layer\\(s\\) turned off$'));
  r = rig();
  out = await cap.run({ all: true }, {}, r.K);
  assert.ok(r.boxes.every((b) => !b.checked), 'all:true clears everything');
  assert.match(out.html, new RegExp(M.dataLayers().length + ' layer\\(s\\) turned off · ' + M.displayItems().length + ' map display item\\(s\\) turned off'));
});
