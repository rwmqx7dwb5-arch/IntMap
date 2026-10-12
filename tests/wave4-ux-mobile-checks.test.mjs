/* ============================================================================
 *  IntMap · wave4-ux-mobile — the phone sheet's home (js/start-home.js), RUN (not read)
 * ----------------------------------------------------------------------------
 *    ① «Live now» is the rule, not a list: every layer whose time declaration says it describes NOW, that the panel
 *      shows unfolded (not `rest`, not the beta shelf, not hidden) and whose row is built — in the panel's order,
 *      under the name the row shows; a layer missing any one of the three is not offered
 *    ② nothing of it is on the start-up path: no file imports js/start-home.js statically, and the phone shell asks
 *      for it only when the reader grabs the sheet or it rests above `min`; widening hands the board back
 *    ③ one row, two doors: the search's empty state and the home hold js/here-entry.js entryRow; the press ends the
 *      search only in the search
 *    ④ one install entry, two doors: Settings and the home read the same held prompt (js/installable-app.js) and
 *      the home hears every change of what can be offered
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const { LAYERS, BETA, HIDDEN } = await import('../js/layer-manifest.js');
const { TIME } = await import('../js/layer-time-decl.js');
const SH = await import('../js/start-home.js');

const rowsFor = (ids) => ids.map((id) => ({ id, name: 'name of ' + id }));
const isLiveStart = (l) => l.shelf !== BETA && l.shelf !== HIDDEN && !l.rest && l.kind !== 'display' && !!TIME[l.id] && TIME[l.id].kind === 'live';

test('wave4-ux-mobile ① «Live now» is every live, unfolded, built row — in the panel order, under the row\'s own name', () => {
  const all = rowsFor(LAYERS.map((l) => l.id));
  const got = SH.liveStarts(LAYERS, TIME, all);
  const want = LAYERS.filter(isLiveStart).map((l) => l.id);
  assert.ok(want.length > 0, 'the declarations name at least one live layer the panel shows unfolded');
  assert.deepEqual(got.map((s) => s.id), want, 'exactly the layers the three owners agree on, in manifest order');
  for (const s of got) assert.equal(s.name, 'name of ' + s.id, 'the name is the one the row shows');
  /* each of the three facts is necessary: the layers that fail one of them are present in the manifest and absent here */
  const liveFolded = LAYERS.filter((l) => TIME[l.id] && TIME[l.id].kind === 'live' && (l.rest || l.shelf === BETA));
  assert.ok(liveFolded.length > 0, 'the manifest has live layers that the panel folds or files under beta');
  for (const l of liveFolded) assert.ok(!got.some((s) => s.id === l.id), l.id + ' is folded in the panel, so it is not a start');
  const notLive = LAYERS.filter((l) => !(TIME[l.id] && TIME[l.id].kind === 'live') && !l.rest && l.shelf !== BETA && l.shelf !== HIDDEN);
  for (const l of notLive) assert.ok(!got.some((s) => s.id === l.id), l.id + ' does not describe now');
  /* a row the panel has not built yet is not offered (the switch would have no checkbox to turn) */
  const dropped = want[0];
  assert.ok(!SH.liveStarts(LAYERS, TIME, all.filter((r) => r.id !== dropped)).some((s) => s.id === dropped));
  assert.deepEqual(SH.liveStarts(LAYERS, TIME, []), [], 'no rows yet → no switches');
  /* a declaration that stops saying «live» takes the layer out */
  const T2 = Object.assign({}, TIME, { [dropped]: Object.assign({}, TIME[dropped], { kind: 'record' }) });
  assert.ok(!SH.liveStarts(LAYERS, T2, all).some((s) => s.id === dropped));
});

test('wave4-ux-mobile ② the home is not on the start-up path, and leaves when the window widens', () => {
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    if (f === 'start-home.js') continue;
    assert.doesNotMatch(read('js/' + f), /^\s*import\s[^;]*from\s+['"]\.\/start-home\.js['"]/m, 'js/' + f + ' imports the home statically');
  }
  const mui = read('js/mobile-ui.js');
  const imports = mui.match(/import\(\s*'\.\/start-home\.js'\s*\)/g) || [];
  assert.equal(imports.length, 1, 'one door fetches it');
  const want = mui.slice(mui.indexOf('function wantStart('), mui.indexOf('function setDetent('));
  assert.match(want, /import\('\.\/start-home\.js'\)/, 'the fetch is inside wantStart');
  assert.match(want, /embedded\(\)/, 'an embed has no sheet, so no home');
  const setDetent = mui.slice(mui.indexOf('function setDetent('), mui.indexOf('function setDetent(') + 600);
  assert.match(setDetent, /if\(RANK\[name\]>RANK\.min\) wantStart\(\)/, 'only a rest above min asks for it');
  const dragStart = mui.slice(mui.indexOf('function dragStart('), mui.indexOf('function dragStart(') + 400);
  assert.match(dragStart, /wantStart\(\)/, 'the grab asks for it, so it is drawn before the sheet rests');
  const desk = mui.slice(mui.indexOf('function applyLayout('), mui.indexOf('THE BOTTOM SHEET'));
  assert.match(desk, /_startMod\.unmountStart\(\)/, 'widening hands the board back');
});

test('wave4-ux-mobile ③ the search and the home hold one «Where you are» row', () => {
  const he = read('js/here-entry.js');
  assert.match(he, /export function entryRow\(onPress\)/);
  const show = he.slice(he.indexOf('export function showEntry('));
  assert.match(show, /entryRow\(\(\) => \{[\s\S]*res\.style\.display = 'none'; res\.innerHTML = '';/, 'in the search, a press closes the list');
  assert.doesNotMatch(he.slice(he.indexOf('export function entryRow('), he.indexOf('export function showEntry(')), /ms-results|res\.innerHTML/, 'the row itself ends nothing');
  const sh = read('js/start-home.js');
  assert.match(sh, /entryRow\(null\)/, 'the home holds the row and ends nothing');
  assert.match(sh, /showInResults\(gal, \(\) => \{\}\)/, 'the day\'s map and the examples are the gallery\'s own strip, and the home keeps it');
});

test('wave4-ux-mobile ③b «See all» ends what the caller says: the search\'s list closes, the home keeps its strip', () => {
  /* MEASURED (review): the handler emptied whatever `res` it was handed, so in the home one press of «See all» left the
     strip blank until a language change or a re-mount. The ending is the caller's now, as entryRow(onPress) does. */
  const sg = read('js/showcase-gallery.js');
  const fn = sg.slice(sg.indexOf('export function showInResults('), sg.indexOf('/** the empty state is showing in this list */'));
  assert.match(fn, /export function showInResults\(res, onLeave\)/);
  assert.match(fn, /const leave = typeof onLeave === 'function' \? onLeave : \(\) => \{ res\.style\.display = 'none'; res\.innerHTML = ''; \};/, 'no ending given: the list closes, as in the search');
  assert.match(fn, /all\.addEventListener\('click', \(\) => \{ leave\(\); openGallery\(\); \}\)/, '«See all» runs the caller\'s ending');
  assert.equal((fn.match(/res\.innerHTML = ''/g) || []).length, 1, 'the only emptying is the default ending');
  /* the search still passes no ending, so it keeps closing its list */
  assert.match(read('js/search-geocode.js'), /G\.showInResults\(res\);/);
  /* the home's ending empties nothing */
  const sh = read('js/start-home.js');
  const call = /showInResults\(gal, \(([^)]*)\) => \{([^}]*)\}\)/.exec(sh);
  assert.ok(call, 'the home passes its own ending');
  assert.doesNotMatch(call[2], /innerHTML|display/, 'and it leaves the strip as it is');
});

test('wave4-ux-mobile ④ the install entry is one held prompt with two doors', async () => {
  const IA = await import('../js/installable-app.js');
  assert.equal(typeof IA.installState, 'function');
  assert.equal(typeof IA.promptInstall, 'function');
  /* in Node there is no browser to install into: nothing is offered, so the home draws no row */
  assert.ok(['none', 'installed'].includes(IA.installState()));
  let heard = 0; const off = IA.onInstallChange(() => { heard++; });
  assert.equal(typeof off, 'function'); off();
  assert.equal(heard, 0);
  const src = read('js/installable-app.js');
  const sync = src.slice(src.indexOf('function syncInstallEntry('), src.indexOf('export async function promptInstall('));
  assert.match(sync, /_listeners\.forEach/, 'every change of what can be offered reaches the other door');
  assert.ok(sync.indexOf('_listeners.forEach') < sync.indexOf("getElementById('setting-install-group')"), 'the other door hears it even where Settings is not in the page');
  const sh = read('js/start-home.js');
  assert.match(sh, /onInstallChange\(/);
  assert.match(sh, /st !== 'prompt' && st !== 'ios'/, 'only an entry the browser can act on, or the sentence that says how, is offered');
});
