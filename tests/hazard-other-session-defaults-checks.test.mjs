/* ============================================================================
 *  SAVED SESSIONS AND THE DEFAULT-ON LAYERS — js/session-tabs.js and the test seeds
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The generation stamp is compared across files (the
 *    seeds are test files); buildLegend is inside js/data-layers.js's page closure.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r189-checks.test.mjs (tests #2, #3, #4 of 15) ═══
    R189 — eight reports: the aircraft glyph's storage generation, both default
    layers healing poisoned sessions, the Cesium polar offline fallback, the
    water tracer's TDZ crash + talweg + resolution ladder + discharge, the
    flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
    playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
    polar-safe rings).
    Source-level checks: each one pins the exact code that fixed a report, so a
    refactor that silently undoes it fails here with the reason attached. */
{

/* ── 2 · defaults: sessions written before #R188 are healed ONCE ─────────────────────────────── */
test('R189 defaults: poisoned sessions are migrated, and the SW keeps the cable cache', () => {
  /* (#R200) the session block is js/session-tabs.js now — a real ES module, imported by name. */
  const body = read('js/session-tabs.js');
  assert.match(body, /defv:191/, 'the snapshot stamps its generation (basic-display-not-layers bumped it — see js/session-tabs.js)');
  assert.match(body, /if\(!\(\+s\.defv>=190\)\) \(window\.IntMapDefaultLayers\|\|\[\]\)\.forEach/,
    'a session from an older generation gets the default-on ids back once');
  /* (basic-display-not-layers) a session written while Köppen and the cables were default-on sheds them once */
  assert.ok(body.includes("if(!(+s.defv>=191)) for(let i=want.length-1;i>=0;i--){ if(FORMER_DEFAULT_ON.indexOf(want[i])>=0) want.splice(i,1); }"),
    'a session older than defv 191 sheds the former default-on layers once');
  const sw = read('sw.js');
  /* the SW activate purge spares the page-owned cable cache — now by the page-owned name prefix, and
     EVALUATED against every cache the page opens in tests/sw-cache-names-owned-checks.test.mjs */
  assert.match(sw, /const PAGE_CACHE_PREFIX = 'intmap-page-';/, 'the SW keeps every intmap-page-* cache');
  const dl = read('js/layer-pkg-subcables.js');   /* (layer-packages) the cable row's implementation is its layer package */
  /* the build() give-up path is no longer silent */
  assert.match(dl, /console\.warn\('addSubcables',e\); autoUncheck\('dl-subcables'\);/,
    'a style that never accepts the layers unticks with imAutoOff…');
  assert.match(dl, /海底ケーブルレイヤーを追加できませんでした/, '…and says so');
});

/* The migration reaches every saved session — INCLUDING the ones the test suite writes for itself.
   The Playwright seed (#R186) exists to say "this profile has already opted out of the default-on
   layers" so ~350 tests boot in 3.2 s instead of 9.2 s; unstamped, `_restore()` healed them all
   back on and CI measured three straight timeouts of r174 «zooming in still moves the viewpoint»
   plus three newly-flaky tests. Whatever generation js/app-body.js writes, the seeds must claim. */
test('R189 defaults: every test-suite session seed carries the CURRENT generation', () => {
  const gen = /defv:(\d+)/.exec(read('js/session-tabs.js'));
  assert.ok(gen, 'js/session-tabs.js stamps a generation');
  /* ⚠ (#R225) `tests/helpers/session-seed.js` IS NOW ONE OF THE SEEDS. It gained `sessionWith()` so a
     spec that needs its own layer set stops writing the whole snapshot inline — which is what let the
     stamp drift in the first place. A file that DELEGATES to it is stamped by it, so it is checked
     there rather than twice. */
  const seeds = ['playwright.config.js', 'tests/r172.spec.js', 'tests/r173.spec.js', 'tests/r186.spec.js',
                 'tests/helpers/session-seed.js'];
  for (const f of seeds) {
    const src = read(f);
    for (const m of src.matchAll(/intmap_session2[\s\S]{0,200}?\{[\s\S]{0,200}?\}/g)) {
      const stamp = /["']?defv["']?\s*:\s*(\d+)/.exec(m[0]);
      if (!stamp && /sessionWith\s*\(/.test(m[0])) continue;    /* stamped by the helper, not here */
      assert.ok(stamp, `${f}: a session seed without defv is healed back to the default-on layers`);
      assert.equal(stamp[1], gen[1], `${f}: the seed's generation must track js/session-tabs.js`);
    }
  }
  /* …and the helper itself stamps both of the snapshots it can produce */
  const helper = read('tests/helpers/session-seed.js');
  const stamps = [...helper.matchAll(/["']?defv["']?\s*:\s*(\d+)/g)].map((m) => m[1]);
  assert.ok(stamps.length >= 2, 'both SESSION_VALUE and sessionWith() carry a generation');
  for (const st of stamps) assert.equal(st, gen[1], "the helper's generation must track js/session-tabs.js");
});

test('R189 defaults: buildLegend survives a missing legend element', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /function buildLegend\(\)\{\s*\n\s*const lg=document\.getElementById\('koppen-legend'\);[\s\S]{0,400}if\(!lg\) return;/,
    'the default-on dispatcher fires synthetic changes up to 2.6 s after boot — with the legend ' +
    'element absent this wrote innerHTML on null and killed the change handler uncaught');
});
}
