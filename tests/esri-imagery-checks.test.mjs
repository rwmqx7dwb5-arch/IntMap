/* ============================================================================
 *  IntMap · esri-imagery — World Imagery's URL is built in ONE place, and the key switches all of it
 * ----------------------------------------------------------------------------
 *  ① keyless (no key): the two arcgisonline hosts, split by x+y parity — what the app always did.
 *  ② keyed: every URL goes to ibasemaps-api.arcgis.com with ?token=, evaluated from the module's own text.
 *  ③ a refused key (non-image reply) falls back to the keyless hosts for the page — the map never blanks.
 *  ④ no other browser file spells a World_Imagery tile URL: a new reader has to come through the module.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';

const root = new URL('../', import.meta.url);
const SRC = readFileSync(new URL('js/esri-imagery.js', root), 'utf8');

/* import the module's own text with the key line replaced — not a copy of its logic */
async function load(key) {
  /* a data: URL, so nothing is written to the checkout; the module's own imports are lazy (inside the
     credit refresh, never called here), so it evaluates on its own */
  assert.match(SRC, /^const ESRI_IMAGERY_KEY = '[^']*';/m, 'the key is one line the test can set');
  assert.doesNotMatch(SRC, /^import /m, 'no static import — the worker imports this module too');
  const text = SRC.replace(/^const ESRI_IMAGERY_KEY = '[^']*';/m, 'const ESRI_IMAGERY_KEY = ' + JSON.stringify(key) + ';');
  return import('data:text/javascript;charset=utf-8,' + encodeURIComponent(text + '\n//' + Math.random()));
}

test('① no key: the keyless hosts, split by parity', async () => {
  const m = await load('');
  assert.equal(m.imageryKeyed(), false);
  assert.equal(m.imageryTileUrl(5, 10, 20), 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/10/20');
  assert.equal(m.imageryTileUrl(5, 10, 21), 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/10/21');
  assert.equal(m.imageryTiles().length, 2);
});

test('② a key: every URL is the keyed service with the token', async () => {
  const m = await load('AAPK test/key');
  assert.equal(m.imageryKeyed(), true);
  assert.equal(m.imageryTileUrl(5, 10, 21), 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/5/10/21?token=AAPK%20test%2Fkey');
  assert.deepEqual(m.imageryTiles(), ['https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=AAPK%20test%2Fkey']);
});

test('③ a refused key falls back to the keyless hosts; only an image reply is imagery', async () => {
  const m = await load('k');
  const quiet = console.warn; console.warn = () => {};
  try { m.imageryRefused('499'); } finally { console.warn = quiet; }
  assert.equal(m.imageryKeyed(), false);
  assert.match(m.imageryTileUrl(1, 0, 0), /^https:\/\/server\.arcgisonline\.com\//);
  const res = (t) => ({ headers: new Headers({ 'content-type': t }) });
  assert.equal(m.isImageryReply(res('image/jpeg')), true);
  assert.equal(m.isImageryReply(res('text/plain;charset=utf-8')), false, 'the 200 token error is JSON as text/plain');
});

test('④ no other browser file builds a World_Imagery tile URL', () => {
  const offenders = [];
  for (const dir of ['js', 'src']) {
    for (const f of readdirSync(new URL(dir + '/', root), { recursive: true })) {
      if (!/\.(m?js)$/.test(f) || /esri-imagery\.js$/.test(f) || /locales/.test(f)) continue;
      const text = codeOnly(readFileSync(new URL(dir + '/' + f, root), 'utf8'));   /* comments are not URLs */
      if (/World_Imagery\/MapServer/.test(text)) offenders.push(dir + '/' + f);
    }
  }
  assert.deepEqual(offenders, [], 'route these through js/esri-imagery.js');
});
