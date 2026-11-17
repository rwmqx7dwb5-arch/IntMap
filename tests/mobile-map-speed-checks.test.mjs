/* ============================================================================
 *  mobile-map-speed — 「スマホ版で地図が遅すぎる」
 * ----------------------------------------------------------------------------
 *  ① a local glyph waits (briefly) for the subset that holds IT, is drawn once in that face, is marked and kept
 *  ② a glyph this device already drew in its face is answered without drawing, as the renderer's own bitmap class
 *  ③ a face arriving keeps the glyphs drawn in their face; a new FAMILY still drops them
 *  ④ the star field is shown where it was drawn — no per-frame copy of the GL canvas onto #space-canvas
 *  The functions are evaluated as written (sliced out of js/geo-engine.js), never re-described here.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the install as written: FACE_WAIT_MS, _alphaImage and _drawWithItsFace, with the store and the page handed in */
function installer() {
  const src = read('js/geo-engine.js');
  const a = src.indexOf('const FACE_WAIT_MS='), b = src.indexOf('function _redrawLocalGlyphs(');
  assert.ok(a > 0 && b > a, 'js/geo-engine.js no longer has the face-first draw where this test reads it');
  return new Function('document', 'readGlyph', 'keepGlyph', 'setTimeout', 'clearTimeout', src.slice(a, b) + '; return _drawWithItsFace;');
}
class Bitmap { constructor(size, data) { this.width = size.width; this.height = size.height; this.data = data || new Uint8Array(size.width * size.height); } clone() { return new Bitmap(this, this.data.slice()); } }
function fakeFonts(loaded) {
  const calls = [];
  return { calls, check: (font, id) => loaded.has(id), load: async (font, id) => { calls.push([font, id]); loaded.add(id); return []; } };
}
function fakeManager(order) {
  const r = { ctx: { font: 'normal 400 48px "Noto Sans JP", sans-serif' }, lang: 'ja', size: 72, buffer: 6, radius: 16, cutoff: 0.25 };
  class GM {
    constructor() { this.entries = { 'Noto Sans Regular': { glyphs: { default: { A: { id: 65, bitmap: new Bitmap({ width: 2, height: 2 }), metrics: {} } } } } }; }
    async _getTinySDF() { return r; }
    async _drawGlyph(entry, stack, id) { order.push('draw:' + id); return { id: id.codePointAt(0), bitmap: new Bitmap({ width: 2, height: 3 }, new Uint8Array([1, 2, 3, 4, 5, 6])), metrics: { advance: 24 } }; }
  }
  return GM;
}

test('① a local glyph waits for ITS subset, is drawn once in its face, marked and kept', async () => {
  const order = [], kept = [], loaded = new Set(), fonts = fakeFonts(loaded);
  const GM = fakeManager(order);
  const draw = installer()({ fonts }, async () => null, (k, v) => kept.push([k, v]), setTimeout, clearTimeout);
  draw(GM.prototype);
  const gm = new GM();
  const g = await gm._drawGlyph(null, 'Noto Sans Regular', '東');
  assert.deepEqual(fonts.calls, [['normal 400 48px "Noto Sans JP", sans-serif', '東']], 'the subset of THIS character was asked for, with the rasteriser\'s own font');
  assert.deepEqual(order, ['draw:東'], 'and drawn once');
  assert.equal(g.__imFace, true, 'marked as drawn in its face');
  assert.equal(kept.length, 1, 'kept for the next session');
  assert.match(kept[0][0], /東$/);
  assert.ok(kept[0][0].includes('ja') && kept[0][0].includes('72'), 'the key carries what the bitmap is a function of');
  /* a face that is not there within the wait: drawn in the fallback, not marked, not kept */
  const slow = { check: () => false, load: () => new Promise(() => {}) };
  const order2 = [], kept2 = [], GM2 = fakeManager(order2);
  installer()({ fonts: slow }, async () => null, (k, v) => kept2.push(v), setTimeout, clearTimeout)(GM2.prototype);
  const t0 = Date.now(); const g2 = await new GM2()._drawGlyph(null, 's', '大');
  assert.ok(Date.now() - t0 < 1000, 'a face that never arrives does not hold the label');
  assert.equal(g2.__imFace, undefined); assert.equal(kept2.length, 0, 'the fallback\'s shapes are never written down');
});

test('② a glyph this device drew before is answered without drawing, as the renderer\'s own bitmap', async () => {
  const order = [], GM = fakeManager(order), fonts = fakeFonts(new Set());
  const rec = { id: 0x6771, w: 2, h: 3, d: new Uint8Array([9, 9, 9, 9, 9, 9]), m: { advance: 24 }, t: Date.now() };
  installer()({ fonts }, async () => rec, () => assert.fail('a kept glyph is not kept again'), setTimeout, clearTimeout)(GM.prototype);
  const g = await new GM()._drawGlyph(null, 'Noto Sans Regular', '東');
  assert.deepEqual(order, [], 'not drawn');
  assert.ok(g.bitmap instanceof Bitmap, 'rebuilt as the class getGlyphs will clone()');
  assert.deepEqual([...g.bitmap.data], [9, 9, 9, 9, 9, 9]);
  assert.equal(g.__imFace, true);
  assert.equal(fonts.calls.length, 0, 'and no face was waited for');
});

test('③ a face arriving keeps what was drawn in its face; a new family drops it', async () => {
  globalThis.window = globalThis;
  globalThis.document = globalThis.document || { baseURI: 'https://example.test/' };
  const { IntMapGeoEngine: E } = await import(pathToFileURL(join(ROOT, 'js/geo-engine.js')).href);
  const imap = window.__imap;
  try {
    const glyph = (cp, face) => { const g = { id: cp, bitmap: {}, metrics: {} }; if (face) Object.defineProperty(g, '__imFace', { value: true }); return g; };
    const gm = {
      localIdeographFontFamily: "'Noto Sans JP'", _charUsesLocalIdeographFontFamily: (cp) => cp >= 0x3000,
      entries: { s: { glyphs: { default: { '東': glyph(0x6771, true), '本': glyph(0x672c, false) } }, ranges: {}, requests: {} } },
    };
    window.__imap = { style: { glyphManager: gm }, _update() {}, getGlyphs: () => 'u', setGlyphs() {} };
    const tab = gm.entries.s.glyphs.default;
    E.scene.refreshCjkGlyphs([[0x6700, 0x67ff]]);
    assert.ok(tab['東'], 'drawn in its face: a face arriving cannot change it');
    assert.equal(tab['本'], undefined, 'drawn in the fallback: redrawn as before');
    E.scene.refreshCjkGlyphs();
    assert.equal(tab['東'], undefined, 'a new family (no range) still redraws every local glyph');
  } finally { if (imap === undefined) delete window.__imap; else window.__imap = imap; }
});

test('④ the star field is shown where it was drawn, not copied each frame', () => {
  const src = read('js/space-sky.js');
  assert.doesNotMatch(src, /drawImage\(\s*field/);
  assert.match(src, /starsShown\(!!field\)/, 'shown on the frames it drew');
  assert.match(src, /if\(!on\) starsShown\(false\)/, 'and hidden with the sky');
});
