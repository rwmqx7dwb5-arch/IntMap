/* ============================================================================
 *  R210 — source-level checks (no browser, no boot).
 * ----------------------------------------------------------------------------
 *  Each of these states a property that a running app cannot cheaply show, and that a later round
 *  could undo without noticing. They are written as RELATIONS wherever a value would have done,
 *  because five assertions in this suite had to be rewritten this round for pinning literals.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

test('R210 ①: the graticule builder needs no turf, and nothing gates it on turf', () => {
  const src = rd('js/map-readout.js');
  const fn = /function buildGridFeatures\(\)\{[\s\S]*?\n  \}/.exec(src);
  assert.ok(fn, 'buildGridFeatures still exists');
  /* the defect: a gate on a library the function never uses. Both halves are asserted, because
     either one alone can come back — the gate without the usage, or the usage without the gate. */
  assert.doesNotMatch(fn[0], /hasTurf\(\)/, 'no turf gate — that gate WAS the reported display delay');
  assert.doesNotMatch(fn[0], /\bturf\./, 'and the body genuinely does not use turf, so the gate cannot be justified later');
  assert.match(src, /TROPIC_LAT=23\.4362/, 'the tropics use the mean obliquity of this epoch, not 23.5');
  assert.match(fn[0], /kind:'tropic'/, 'both tropics come out of the same builder as the rest of the grid');
});

test('R210 ②: the graticule style is white with a casing, and lives in one file', () => {
  const g = rd('js/grid-style.js');
  assert.match(g, /id: 'grid-lines-casing'/, 'the casing exists…');
  assert.ok(g.indexOf("id: 'grid-lines-casing'") < g.indexOf("id: 'grid-lines',"),
    '…and is declared BEFORE the white line, or it would be painted over it');
  assert.match(g, /'line-color': '#ffffff'/, 'the graticule is white');
  assert.match(g, /'line-color': '#f4b740'/, 'the tropics are 山吹色');
  /* every kind the builder emits as its own layer must be excluded from the generic line layer,
     or it is painted twice — once as itself and once as a plain graticule line */
  const notSingle = /const notSingle = \[([\s\S]*?)\];/.exec(g);
  assert.ok(notSingle, 'the exclusion list is named');
  for (const kind of ['equator', 'prime', 'tropic']) {
    assert.ok(notSingle[1].includes(`'${kind}'`), `${kind} is excluded from grid-lines`);
  }
  /* ⚠ the reason this is a module and not a member of IM_READOUT (#R200's boot-total-loss shape) */
  const body = rd('js/app-body.js');
  assert.match(body, /import \{ gridLayerSpecs \} from '\.\/grid-style\.js';/, 'app-body imports it by name');
  assert.ok(body.indexOf('...gridLayerSpecs()') < body.indexOf('const IM_READOUT='),
    'the style literal runs BEFORE IM_READOUT exists — that is why this is an import');
});

test('R210 ③: a click can be claimed, and the label side asks after everyone else has run', () => {
  const eng = rd('js/geo-engine.js');
  assert.match(eng, /claimClick:\(e\)=>_claimClick\(e\), clickClaimed:\(e\)=>_clickClaimed\(e\)/,
    'the contract publishes both halves');
  assert.match(eng, /_claimedOE===oe/, 'the test is DOM-event identity, not a time window');
  assert.doesNotMatch(eng, /_claimedT|Date\.now\(\)-_claimed/, 'a timer here would swallow a later click');

  const ui = rd('js/map-ui.js');
  assert.match(ui, /function _deferLabel\(e,fn\)\{[\s\S]{0,400}?Promise\.resolve\(\)\.then\(/,
    'the label popup is deferred by a microtask — that is what "after every listener" means');
  /* all three routes into the same popup have to yield, or the defect survives on one of them */
  const routes = [...ui.matchAll(/_deferLabel\(/g)].length;
  assert.ok(routes >= 3, `all three label routes defer; found ${routes}`);

  /* and the owners actually claim */
  for (const [f, why] of [['js/data-layers.js', 'aircraft'], ['js/satellites-live.js', 'satellites'],
    ['js/seismic.js', 'the seismic panel'], ['js/tsunami.js', 'the tsunami read-out'],
    ['js/terrain-water.js', 'the terrain brush']]) {
    assert.match(rd(f), /claimClick&&[^;]{0,40}claimClick\(e\)/, `${why} claims the click it consumes`);
  }
});

test('R210 ④: ★ Saved is not a filter over the live feed any more', () => {
  const news = rd('js/news-ui.js');
  assert.match(news, /intmap_saved_articles/, 'a snapshot store exists');
  assert.match(news, /function publishSaved\(\)\{/, 'published from a FUNCTION — a factory body may only declare (#R168 ④)');
  assert.match(news, /merge\(feed,links\)/, 'and it can hand back what the feed no longer carries');
  const body = rd('js/app-body.js');
  assert.match(body, /window\.IntMapNewsSaved\.merge\(globalData,bookmarks\)/,
    'the saved view is built from feed + snapshot, not from the feed alone');
  /* the authority must stay where it was: the star is never inferred from the cache */
  assert.match(body, /currentMode==='saved'&&!bookmarks\.includes\(it\.link\)/,
    'membership is still decided by bookmarks (DB or localStorage), never by the snapshot');
});

test('R210 ⑤: enlarging the country label did not drag every other label up with it', () => {
  const ls = rd('js/label-scale.js');
  assert.match(ls, /const SUB_REF=/, 'SUB has its own reference…');
  assert.match(ls, /const SUB=SUB_REF\.map/, '…and SUB is derived from it, not from REF');
  assert.doesNotMatch(ls, /const SUB=REF\.map/, 'deriving SUB from REF is what made the sea names grow');
});

test('R210 ⑥: the test seat opts out of the first-visit panel on purpose', () => {
  /* If this ever reverts, ~350 tests silently start measuring a narrower canvas — and they will
     not fail loudly, they will fail as a scatter of pixel and camera assertions (#R207's shape). */
  const seed = rd('tests/helpers/session-seed.js');
  assert.match(seed, /"lsrOpen":false/, 'the seeded session answers the layer-panel question');
  const ui = rd('js/map-ui.js');
  assert.match(ui, /typeof ui\.right!=='boolean'/, 'and the app is what distinguishes "no answer" from an answer');
});
