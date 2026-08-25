/* ============================================================================
 *  #R225 — the round's own contracts, checked in Node
 * ----------------------------------------------------------------------------
 *  The phone gate is a GPU question, not a layout one · the LRU stopped walking the whole cache ·
 *  the instrument never touches the renderer · the nine geopolitics layers are GONE, everywhere ·
 *  a default-ON row that was switched off stays off.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── ① THE FROSTED GLASS WAS UNGATED IN LANDSCAPE ──────────────────────────────────────────────────
   Measured on the shipped build at 375 × 812: nineteen backdrop-filter elements covering 383 % of the
   viewport (#R221 found fifteen at 153 %). They are all marked and they all drop out during a move —
   but only when the gate says «phone», and the gate was `max-width: 768px`, which is FALSE on a phone
   held sideways (812 × 375). Rotating the device switched the whole suppression off. */
/* ⚠ (#R229) THIS ROUND WIDENED A MECHANISM THAT SHOULD NOT HAVE EXISTED. The gate really was wrong —
   `max-width: 768px` is false on a phone held sideways — but the thing being gated was #R221 taking
   the frosting off every panel during a gesture, which was never agreed to. Fixing the gate made the
   unwanted behaviour MORE reliable. The module is deleted; this now checks that it is. */
test('R225 ① the gesture-time glass suppression is gone (#R229)', () => {
  const css = read('css/intmap.css');
  assert.ok(!/body\.im-moving\s+\.im-glass\s*\{/.test(css), 'no gesture-time backdrop-filter override');
  let present = true;
  try { read('js/glass-motion.js'); } catch (_) { present = false; }
  assert.equal(present, false, 'js/glass-motion.js must not exist');
});

/* ── ② THE SERVICE WORKER'S LRU ────────────────────────────────────────────────────────────────────
   `trim()` ran after every stored tile and its first act was `await cache.keys()` — up to 12,000
   Request objects, on the thread the map is waiting on, once per tile. */
test('R225 ② the tile cache stops enumerating itself on every store', async () => {
  const sw = read('sw.js');
  assert.match(sw, /let _trimming = false, _n = -1, _sinceCheck = 0;/, 'the count is carried, not re-read');
  assert.match(sw, /const CHECK_EVERY = 64;/);
  assert.match(sw, /if \(_n <= MAX_ENTRIES\) return;\s+\/\* nowhere near the cap/, 'the common case does no walk');
  assert.match(sw, /_n = keys\.length;\s+\/\/ …and re-seed the hint from the truth/,
    'the hint is re-seeded from the real keys, so drift cannot lose a tile');

  /* run the algorithm: 14,000 stores must not be 14,000 walks, and the cap must still hold */
  const MAX_ENTRIES = 12000, TRIM_TO = 10200, CHECK_EVERY = 64;
  let walks = 0, entries = 0, _trimming = false, _n = -1, _since = 0;
  const cache = { keys: async () => { walks++; return new Array(entries); }, delete: async () => { entries--; } };
  async function trim() {
    if (_trimming) return;
    if (_n >= 0) { _n++; if (_n <= MAX_ENTRIES) return; if (_since++ < CHECK_EVERY && _n < MAX_ENTRIES * 1.05) return; }
    _trimming = true; _since = 0;
    try {
      const keys = await cache.keys(); _n = keys.length;
      if (keys.length > MAX_ENTRIES) { const rm = keys.length - TRIM_TO; for (let i = 0; i < rm; i++) await cache.delete(); _n = keys.length - rm; }
    } finally { _trimming = false; }
  }
  for (let i = 0; i < 14000; i++) { entries++; await trim(); }
  assert.ok(walks < 10, `14,000 stores took ${walks} cache.keys() walks`);
  assert.ok(entries <= MAX_ENTRIES && entries >= TRIM_TO, `the cap still holds (${entries} entries)`);
});

/* ── ③ THE INSTRUMENT ──────────────────────────────────────────────────────────────────────────── */
test('R225 ③ the perf HUD is opt-in and never touches the renderer', () => {
  const hud = read('js/perf-hud.js');
  assert.match(hud, /if \(!\/\[\?&\]perf=1\\b\/\.test\(location\.search\)\) return null;/, 'dormant unless asked for');
  /* ⚠ the renderer-decoupling ratchet (#R178/#R180): only js/geo-engine.js may hold it */
  assert.ok(!/window\.__imap/.test(hud), 'the HUD must not reach for the renderer handle');
  assert.match(hud, /GE\(\)\.render\.instrumentFrames\(/, 'the frame timing is a contract member');
  assert.match(hud, /GE\(\)\.render\.sceneStats\(\)/, 'and so are the scene counts');
  const ge = read('js/geo-engine.js');
  assert.match(ge, /instrumentFrames\(cb\)\{/); assert.match(ge, /sceneStats\(\)\{/);
  assert.match(ge, /if\(m\.__imFrameInstrumented\) return true;/, 'wrapping twice would time the first wrapper');
  assert.match(read('src/main.js'), /js\/perf-hud\.js/);
});

/* ── ④ THE NINE GEOPOLITICS LAYERS ARE GONE — EVERYWHERE ──────────────────────────────────────────
   「大昔に捨てたはずの地政学レイヤーが勝手にオンになる。ふざけるな。」 → 「レイヤー自体を削除してほしい」.
   ⚠ A feature comes back when its removal is partial (#R220), so this counts every place it lived. */
test('R225 ④ the geopolitics layer family is deleted in every file that held a piece of it', () => {
  const KEYS = ['sahel', 'islandChain1', 'islandChain2', 'stringOfPearls', 'seaRoute', 'chokepoints', 'bri', 'pipelines', 'nuclear'];
  const html = read('index.html');
  for (const k of KEYS) assert.ok(!html.includes(`data-layer="${k}"`), `index.html still has the ${k} row`);
  assert.ok(!/data-i18n="lyrGrpGeo"|data-i18n="lyrGrpStrat"/.test(html), 'and neither group title');
  /* the data */
  const tables = read('js/tables.js');
  assert.ok(!/const geoLayersDB=\{/.test(tables), 'geoLayersDB is gone');
  assert.ok(!/const GEO_LABEL_JP=\{/.test(tables), 'and so are its Japanese labels');
  assert.ok(!/[{,]geoLayersDB[,}]/.test(tables), 'and it is not exported');
  /* the drawing and labelling */
  const pl = read('js/place-labels.js');
  for (const f of ['function buildGeoFC', 'function ensureGeoLayers', 'function updateGeoLayers', 'function localizeGeoLabels'])
    assert.ok(!pl.includes(f), `js/place-labels.js still declares ${f}`);
  assert.match(pl, /return \{ applyLabelLang, ensurePlaceLabels \};/, 'and the surface shrank with them');
  /* the callers */
  const ab = read('js/app-body.js');
  assert.ok(!/ensureGeoLayers\(\)|updateGeoLayers\(\)|localizeGeoLabels\(\)/.test(ab), 'app-body still calls one of them');
  assert.ok(!/\{geoLayersDB,GEO_LABEL_JP\}=window\.IntMapTables/.test(ab));
  assert.ok(!/document\.querySelectorAll\('\.geo-layer-cb'\)\.forEach/.test(ab), 'the change listener is gone');
  /* the preview and the favourite */
  assert.ok(!/function geoDBPrev/.test(read('js/layer-previews.js')));
  assert.ok(!/key:'geo:'\+k/.test(read('js/layer-favs.js')));
  /* ⚠⚠ AND THE READ SIDE OF THE URL HASH — this is what actually turned them on. A link saved months
     ago still carries `l=bri,pipelines,…`; resolving those keys by `data-layer` is how they came back
     on every load. Not writing them is not enough; the restore must stop resolving them. */
  const mu = read('js/map-ui.js');
  assert.ok(!/querySelector\('\.geo-layer-cb\[data-layer="'\+k\+'"\]'\)/.test(mu),
    'the hash restore must not resolve a retired key by data-layer');
  assert.match(mu, /want\.forEach\(k=>\{ const cb=document\.getElementById\(k\); if\(cb&&!cb\.checked\)\{/,
    'ids only');
  assert.ok(!/\.geo-layer-cb:checked/.test(mu.slice(mu.indexOf('function activeLayers'), mu.indexOf('function encode'))),
    'and it must not write them either');
});

/* ── ⑤ A DEFAULT-ON ROW THAT WAS SWITCHED OFF STAYS OFF ────────────────────────────────────────────
   「base map & labelsも勝手に全部オンになる」. index.html ships seven base toggles CHECKED; the session
   saved them correctly as absent and the restore only ever turned OFF the ids in IntMapDefaultLayers,
   so every reload put them back at their HTML default. */
test('R225 ⑤ every default-ON id is in ONE list, and the restore turns all of them off', () => {
  const dl = read('js/data-layers.js');
  assert.match(dl, /window\.IntMapDefaultOn=\[(?:'cb-[a-z0-9]+',)*'cb-[a-z0-9]+'\]\s*\n\s*\.concat\(window\.IntMapDefaultLayers\);/,
    'the union is declared once, beside the thematic list it extends');
  /* every id in it is genuinely shipped checked (or is a thematic default)
     ⚠ (#R476) DERIVED, NOT COPIED. This loop used to carry its own hand-written copy of the seven ids,
     so the eighth (cb-coast) could be added to the list above and be checked by nobody — the shape
     #R309 spent a round removing from the product is not one to keep in the gate. */
  const html = read('index.html');
  const declared = /window\.IntMapDefaultOn=\[([^\]]*)\]/.exec(dl)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.ok(declared.length >= 8, 'the base half is parsed, not assumed');
  for (const id of declared) {
    const m = new RegExp('id="' + id + '"[^>]*checked|checked[^>]*id="' + id + '"');
    assert.ok(m.test(html), `${id} must actually be shipped checked, or it does not belong in the list`);
  }
  const st = read('js/session-tabs.js');
  assert.match(st, /const defOff=\(window\.IntMapDefaultOn\|\|window\.IntMapDefaultLayers\|\|\[\]\)\.filter/,
    'the off-sweep reads the union');
  assert.match(read('js/app-body.js'), /const IDS=\(\)=>\(window\.IntMapDefaultOn\|\|/,
    'and so does the default-on dispatcher — one list, two readers');
});

/* ── ⑥ NOTHING NAMES A LAYER THAT NO LONGER EXISTS ────────────────────────────────────────────────
   The cheap sweep that would have caught #R220's half-removals: no shipped source may still mention
   one of the deleted layer keys as a live identifier. */
test('R225 ⑥ no shipped source still resolves a deleted geopolitics key', () => {
  const KEYS = ['islandChain1', 'islandChain2', 'stringOfPearls'];   /* unambiguous names only */
  const files = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = read('js/' + f);
    for (const k of KEYS) {
      const at = src.indexOf(k);
      if (at < 0) continue;
      assert.fail(`js/${f} still names ${k} at offset ${at}`);
    }
  }
});

/* ── ⑦ THE SEED IS IN ONE PLACE ────────────────────────────────────────────────────────────────────
   ⚠ #R225 changed what an ABSENT id means, and the suite's seed said `"layers":[]` — so «no thematic
   layer» silently became «switch every base toggle off» and tests/r211.spec.js ③ went red in CI. The
   seed now states what it always meant. It was ALSO inlined verbatim in two specs, which is how a
   value drifts (#R220): they import it. */
test('R225 ⑦ the seeded session lives in exactly one place, and it states the base toggles', () => {
  const seed = read('tests/helpers/session-seed.js');
  assert.match(seed, /export const SESSION_VALUE = '\{"v":2,"defv":190,"layers":\["cb-names","cb-geolabels","cb-poi","cb-borders","cb-coast","cb-admin1","cb-roads","cb-rail2"\],"lsrOpen":false\}';/);
  const files = readdirSync(new URL('tests/', root)).filter((f) => f.endsWith('.spec.js'));
  for (const f of files) {
    const src = read('tests/' + f);
    assert.ok(!/'\{"v":2,"defv":\d+,"layers"/.test(src),
      `tests/${f} inlines its own session seed — import SESSION_VALUE instead`);
  }
  /* the seed's base half must be exactly the base half of the app's own list */
  const dl = read('js/data-layers.js');
  const m = /window\.IntMapDefaultOn=\[([^\]]*)\]/.exec(dl);
  assert.ok(m, 'IntMapDefaultOn is declared');
  const appBase = m[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  for (const id of appBase) assert.ok(seed.includes('"' + id + '"'), `the seed is missing ${id}`);
});
