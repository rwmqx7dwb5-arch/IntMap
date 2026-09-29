/* ============================================================================
 *  IntMap · what a reload and a share link bring back (IntMapShareState registrations, the
 *  retired-row translation in js/session-tabs.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r214-checks ⑥ and tests/r224-checks ⑥.
 *  ⚠ READ, NOT RUN (both tests): registration and restoration happen across the eager shell, the
 *  lazy loader and the map UI at page start; what is asked is that every owner registers under the
 *  key the loader can fetch, and that a retired row id is translated rather than lost.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══ ⑥ WHAT A RELOAD BRINGS BACK ═════════════════════════════════════════════════════════════ */

test('R214 ⑥: every simulator #R211 left out now registers with the share registry', () => {
  /* #R211 built IntMapShareState and registered three modules; the rest were listed as "later" in
     three consecutive rounds. Each pair below is (the file that owns the state, the key it must
     register under) — and the KEY MATTERS: js/map-ui.js `apply()` calls IntMapLazy.need(key) for a
     module that has not registered yet, so a lazily-fetched simulator whose key is not its lazy
     name is never fetched and its state silently does not arrive. */
  const want = [
    ['js/tsunami.js', 'tsunami', true],      /* lazy → the key must be the lazy-module name */
    ['js/viewshed.js', 'los', true],         /* lazy, and its lazy name is 'los', not 'viewshed' */
    ['js/sims.js', 'sun', false],
    /* ⚠ (#R296) 'disaster' left this list with its module — 「4つのうち、放射性物質拡散シミュ
       レーションを残し全削除」. A share link cannot restore a panel that does not exist, and
       'radiation' below is the one that survives (it is what the fourth hazard opened). */
    ['js/sims.js', 'radiation', false],
    ['js/drone-nav.js', 'drone', false],
  ];
  const lazy = read('js/lazy-modules.js');
  for (const [file, key, isLazy] of want) {
    const src = read(file);
    const re = new RegExp("IntMapShareState[\\s\\S]{0,80}register\\('" + key + "'");
    assert.ok(re.test(src), `${file} does not register '${key}' with IntMapShareState`);
    if (isLazy) assert.ok(!!LAZY_REGISTRY[key],   /* (#R798) the registry */
      `'${key}' is registered as if it were a lazy module, but js/lazy-modules.js cannot fetch it`);
  }
  /* ⚠⚠ AND LOAD ORDER MUST NOT DECIDE WHETHER A SIMULATOR IS SHAREABLE. Every call site is guarded
     with `window.IntMapShareState && …`, which is a silent no-op for a module evaluated BEFORE
     js/map-ui.js builds the registry. Measured: js/drone-nav.js is one, and its registration
     vanished without a trace. The eager modules therefore queue instead, and map-ui drains. */
  assert.ok(/_imShareEarly/.test(read('js/map-ui.js')), 'js/map-ui.js must drain the early queue');
  for (const f of ['js/sims.js', 'js/drone-nav.js', 'js/viewshed.js']) {
    assert.ok(/_imShareEarly/.test(read(f)), `${f} registers eagerly and must queue when the registry is not up yet`);
  }
  /* …and the registry's own contract: both halves, or `register` refuses it and says nothing. */
  for (const [file] of want) {
    const src = read(file);
    const i = src.indexOf('_share');
    if (i < 0) continue;
    const blk = src.slice(i, i + 1400);
    assert.ok(/get\(\)/.test(blk) && /set\(v\)/.test(blk), `${file}'s _share must have BOTH get and set`);
  }
  /* the tsunami's free-drawn rupture has to travel: the same magnitude at the same epicentre with a
     different ring is a different earthquake (#R212), so a link without it reopens on another run */
  const ts = read('js/tsunami.js');
  const blk = ts.slice(ts.indexOf("register('tsunami'"), ts.indexOf("register('tsunami'") + 1400);
  assert.ok(/rupture/.test(blk) && /ring/.test(blk), 'the tsunami share state must carry the drawn rupture ring');
});

/* ── ⑥ ONE OCEAN-CURRENT LAYER, AND ONE ATLAS, FETCHED WHEN REACHED FOR ────────────────────────── */
test('R224 ⑥ the second ocean-current layer is gone and saved sessions migrate', () => {
  const dl = read('js/data-layers.js');
  for (const re of [/\['oceancur','lyrOceanCur'\]/, /function addOceanCurrents/, /lyr-oceancur/, /OC_WARM/])
    assert.ok(!re.test(dl), `data-layers still carries ${re}`);
  const st = read('js/session-tabs.js');
  /* (#R232) the table gained a second row ('dl-night' → 'dl-nightside'), which is the point of its
     being a table. What is pinned is that the ocean-current translation is IN it, once. */
  assert.match(st, /const RETIRED=\{[^}]*'dl-oceancur':'wp-dl-currents'[^}]*\};/, 'the retired id is translated, once');
  assert.match(read('js/ocean-currents.js'), /wp-dl-currents/, 'and the survivor owns that row');
});

