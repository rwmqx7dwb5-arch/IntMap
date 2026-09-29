/* ============================================================================
 *  Space: live satellites, the space explorer and the eclipse arithmetic
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r266-checks.test.mjs, tests/r184-checks.test.mjs, tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeAtlasCatalogText } from '../js/atlas-catalog-text.js';
import { byKey } from './helpers/layer-groups.mjs';
import { uiLocale, langCodes } from './helpers/layer-locale-tables.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r266-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/space.js・js/satellites-live.js・js/data-layers.js・js/atlas-console.js はキャンバス・DOM・描画エンジンに閉じたファクトリで node では組み立てられない（食の計算は実行している） */
/* (#R266) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

test('R266 ⑫: the satellite layer has no second way to be showing fewer objects', () => {
  const sl = read('js/satellites-live.js');
  assert.ok(!/setVisibleOnly/.test(sl), 'the filter API is back');
  assert.ok(!/let visibleOnly/.test(sl), 'the filter state is back');
  assert.match(sl, /function shown\(\)\{ return fixes; \}/, '`shown()` filters again');
  assert.ok(!/gl-satvis/.test(read('js/data-layers.js')), 'the checkbox is back in the legend');
  /* the per-satellite geometry is NOT what was removed */
  assert.match(sl, /function lookFrom\(/);
  assert.match(sl, /nextPass/);
});
}

/* ══════════ from tests/r184-checks.test.mjs — 3 of its 9 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/space.js・js/satellites-live.js・js/data-layers.js・js/atlas-console.js はキャンバス・DOM・描画エンジンに閉じたファクトリで node では組み立てられない（食の計算は実行している） */
// R184 source-level regression checks — the things that are true about the FILES rather than about
// a running browser, and that a later change could quietly undo without any test noticing.
//
// The browser suites (r184-satellites / r184-drone / r184-routing / r184-cesium-fs / r184-imagery)
// prove the behaviour. These prove the wiring: a module that is written but never imported, a
// dependency that is used but not declared, a build alias that stops being needed until a
// dependency bump makes it needed again — none of those show up as a failing behaviour test,
// they show up as a feature that silently is not there (#R162's lesson exactly).

const root = new URL('../', import.meta.url);

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const rd = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n')
  : readFileSync(new URL(p, root), 'utf8'));

/* ── ② THE ONE npm DEPENDENCY THIS ROUND ADDS IS DECLARED ─────────────────────────────────── */
test('R184 #2: satellite.js is a declared dependency and the WASM alias that makes it bundle exists', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(pkg.dependencies['satellite.js'], 'satellite.js ships to the browser, so it is a dependency');
  /* DYNAMIC, not static: a static import puts 27 KB gz of SGP4 in the main bundle for every session
     including the ones that never open the layer (the same reasoning js/engine-select.js applies to
     Cesium). And it must sit INSIDE the factory, because no js/ module may have a top-level
     declaration — tests/r175-checks proves that invariant and this round briefly broke it. */
  const sat = rd('js/satellites-live.js');
  assert.match(sat, /import\('satellite\.js'\)/,
    'the propagator is imported, not hand-rolled — see the file header for why');
  /* ⚠ (#R408) THE NEEDLE NAMES THE PACKAGE NOW, BECAUSE IT USED TO NAME THE SYNTAX. «no static
     import at all» was a proxy for «no static import OF SGP4», and the two parted company the moment
     this file joined js/runtime.js's timer wheel: `import { everyTick } from './runtime.js'` pulls in
     a module js/app-body.js already has eagerly, so it adds nothing to any bundle, and the 27 kB gz
     the rule exists to keep out is still behind `import('satellite.js')`. A proxy that fails on a
     change it was never about teaches people to weaken the assertion; naming the package keeps it. */
  assert.ok(!/^import\s[^\n]*satellite\.js/m.test(sat),
    'and imported DYNAMICALLY, so a session that never opens the layer never downloads it');
  assert.ok(sat.indexOf('let SAT=null') > sat.indexOf('IntMapModules.satellitesLive=function'),
    'the lazy-loader state lives inside the factory, not at file scope (#R175 top-level rule)');
  /* satellite.js 7 re-exports an optional WASM accelerator whose Emscripten entry points use
     top-level await and import node:module. Rollup keeps them in the graph (the package declares no
     sideEffects) and the build then fails outright. The alias is what makes `npm run build` work,
     and it is exactly the sort of thing that gets "cleaned up" by someone who does not know why. */
  const vite = rd('vite.config.js');
  assert.match(vite, /#wasm-\(single\|multi\)-thread|#wasm-\(single\|multi\)/,
    'vite.config.js aliases the package-internal WASM subpath imports');
  assert.match(vite, /satellite-wasm-stub\.js/, 'the alias points at the stub');
  const stub = rd('src/satellite-wasm-stub.js');
  assert.match(stub, /throw new Error/,
    'the stub THROWS if anything ever calls it — a silent no-op would hide a real regression');
});

/* ── ⑥ THE FIVE-LANGUAGE RULE, ON THE STRINGS THIS ROUND ADDED ────────────────────────────── */
test('R184 #6: the new layer name exists in all five languages', () => {
  /* (consolidation) EVALUATED: the tables are the objects js/locales/ui.<code>.js hands to
     IntMapLang.define, and the language list is the one js/locales/_langs.js publishes — a key in a
     comment, or in a table that does not evaluate, can no longer answer for what a reader sees. */
  /* ⚠ (#R223) once per REGISTERED language — a sixth (zh) landed; the claim is coverage, not five.
     (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
  const codes = langCodes();
  const NL = codes.length;
  assert.ok(NL >= 5, 'the registered language list evaluates to ' + NL + ' codes');
  const vals = codes.map((c) => uiLocale(c).ui.lyrSats);
  vals.forEach((v, i) => assert.ok(typeof v === 'string' && v.length > 0, 'lyrSats is defined for ' + codes[i]));
  /* and it is a DIFFERENT string in each — a copy-paste of the English into all five would pass a
     count check and fail the actual instruction */
  assert.equal(vals.length, NL);
  assert.equal(new Set(vals).size, NL, 'each language has its own wording');
});

/* ── ⑦ THE NEW LAYER IS WIRED EVERYWHERE A LAYER HAS TO BE ────────────────────────────────── */
test('R184 #7: the satellite layer is registered, grouped, legended and toggled', () => {
  const dl = rd('js/data-layers.js');
  assert.match(dl, /\['sats','lyrSats'\]/, 'the layer row is declared with its i18n key');
  /* (#R202) it was filed under lyrGrpMaritime «beside live aircraft», which is a fact about how the
     two were built and not somewhere anyone looks for satellites — 「いや今衛星レイヤーなんてないわ」.
     What #7 is actually about is that the row reaches a REAL group rather than falling through to
     Others(beta), so it asks that, and the group it names is the one it is in now. */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(byKey.lyrGrpOrbit.includes('sats'), 'it is filed into a real group of its own');
  /* (#R241) the legend TITLE table is written as calls now — `LA('Live satellites', …)` — because a
     bare array is invisible to every translation instrument and has no inline-table fallback, so
     fr/ko/zh read element 0 (English) for ever. Same table, same key, same assertion. */
  assert.match(dl, /sats:LA\('Live satellites'/, 'it has a legend');
  assert.match(dl, /HAS_LEGEND=new Set\(\[[\s\S]{0,400}'sats'/, 'and the panel knows the legend exists');
  /* (heal-waits-for-inflight) the branch hands its chain back as the box's request — `req=` is how
     every asynchronous branch of toggleLayer now reports «still working» to the heal */
  assert.match(dl, /id==='sats'\)\{ (?:req=)?startSats\(\)/, 'switching it on starts it');
  assert.match(dl, /id==='sats'\)\{ stopSats\(\)/, 'switching it off stops it');
  assert.match(dl, /opacities\.sats|sats:0\.95/, 'it has a default opacity');
  assert.match(dl, /dl-sats/, 'and it is excluded from the layer-reconcile auto-learn like the other live layers');
  /* Atlas: an alias table entry and an action, because a layer Atlas cannot drive is half a feature */
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  /* spelling kept: js/atlas-console.js is the Atlas panel itself (DOM, renderer, network) and cannot
     be evaluated here, so its alias table and its dispatch door are read as source */
  const atlas = rd('js/atlas-console.js');
  assert.match(atlas, /'satellites':'dl-sats'/, 'the Atlas layer alias table knows it');
  assert.match(atlas, /case 'satellites':/, 'and there is an action');
  /* (consolidation) EVALUATED: the SYS catalogue is what makeAtlasCatalogText hands the planner */
  const DOCS = makeAtlasCatalogText({}, {});
  assert.match(DOCS.text(DOCS.idsCovered()), /LIVE SATELLITES: \{"type":"satellites"/,
    '…which is in the SYS catalogue — an action the planner cannot see does not exist (#R115)');
  /* the sources page: a new third-party feed has to name itself and its terms */
  const refs = rd('js/reference-data.js');
  assert.match(refs, /CelesTrak/, 'CelesTrak is credited in Sources');
  assert.match(refs, /satellite\.js/, 'and so is the propagator library');
});
}

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/space.js・js/satellites-live.js・js/data-layers.js・js/atlas-console.js はキャンバス・DOM・描画エンジンに閉じたファクトリで node では組み立てられない（食の計算は実行している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 6. the eclipse arithmetic, against the published catalogue ────────────────────────────────── */
test('R212 ⑥: lunar and solar eclipses come out where — and what — the catalogue says', async () => {
  const win = {};
  const ephem = read('js/ephemeris.js');
  const events = read('js/space-events.js');
  // eslint-disable-next-line no-new-func
  new Function('window', ephem + '\n;return window.IntMapEphemeris;')(win);
  win.IntMapEphemeris = new Function('window', ephem + '\n;return window.IntMapEphemeris;')(win);
  const SE = new Function('window', events + '\n;return window.IntMapSpaceEvents;')(win);

  const lunar = SE.eclipses(Date.UTC(2023, 8, 1), 1200, false);
  const byDate = (list) => Object.fromEntries(list.map((x) => [new Date(x.ms).toISOString().slice(0, 10), x]));
  const L = byDate(lunar);
  /* dates first — a wrong date is a wrong search, not a wrong classification */
  for (const d of ['2023-10-28', '2024-03-25', '2024-09-18', '2025-03-14', '2025-09-07', '2026-03-03', '2026-08-28'])
    assert.ok(L[d], 'no lunar eclipse found on ' + d);
  /* …then the magnitudes. Published umbral magnitudes: 0.122, −0.13 (penumbral), 0.085, 1.178, 0.9297 */
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a.toFixed(3) + ' vs ' + b);
  near(L['2023-10-28'].umbraMag, 0.122, 0.03, '2023-10-28 umbral magnitude');
  near(L['2024-09-18'].umbraMag, 0.085, 0.03, '2024-09-18 umbral magnitude');
  near(L['2025-03-14'].umbraMag, 1.178, 0.03, '2025-03-14 umbral magnitude');
  near(L['2026-08-28'].umbraMag, 0.9297, 0.03, '2026-08-28 umbral magnitude');
  assert.equal(L['2024-03-25'].kind, 'penumbral');
  assert.equal(L['2025-03-14'].kind, 'total');
  assert.equal(L['2026-08-28'].kind, 'partial');

  const S = byDate(SE.eclipses(Date.UTC(2023, 8, 1), 1200, true));
  assert.equal(S['2024-04-08'] && S['2024-04-08'].kind, 'total', '2024-04-08 is the North American total');
  assert.equal(S['2023-10-14'] && S['2023-10-14'].kind, 'annular');
  assert.equal(S['2026-02-17'] && S['2026-02-17'].kind, 'annular');
  assert.equal(S['2026-08-12'] && S['2026-08-12'].kind, 'total');
  near(S['2026-08-12'].gamma, 0.898, 0.02, '2026-08-12 gamma');

  /* the shadow radii are Meeus's, and the coefficient is the one that reproduces all of the above */
  assert.match(events, /0\.998340\*par/, 'the umbra/penumbra coefficient is 0.998340 (1.29 gave every eclipse as total)');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 3 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/space.js・js/satellites-live.js・js/data-layers.js・js/atlas-console.js はキャンバス・DOM・描画エンジンに閉じたファクトリで node では組み立てられない（食の計算は実行している） */
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ═══ ⑩ THE SPACE EXPLORER ═══════════════════════════════════════════════════════════════════
   「太陽系外のはるか遠くまでズームアウトできるように」／「月にも軌道／各惑星を選択時にその衛星たちも」／
   「年月日時選択欄のUIがくそ。（現在日時表示欄と別とか、あほか）」 */
test('R215 ⑩a: the camera ceiling reaches past everything the scene draws', () => {
  const sp = read('js/space.js');
  const reach = sp.slice(sp.indexOf('function reachAu()'), sp.indexOf('function distCeil()'));
  assert.match(reach, /starMaxPc\s*\*\s*AU_PER_PC/,
    'the star catalogue is drawn every frame, so the ceiling has to include it (#R208’s own rule)');
  assert.match(reach, /showDeep/, 'and the deep-sky population still pushes it further when it is on');
  /* the rule that must NOT change: bounded by measured data, never open-ended */
  assert.match(sp, /const REACH_AU=1e7;/, 'the floor of the reach is still a stated distance, not infinity');
});

test('R215 ⑩b: the satellite list is ordered by a real comparator', () => {
  const sp = read('js/space.js');
  const fn = codeOnly(sp.slice(sp.indexOf('function moonList()'), sp.indexOf('function moonList()') + 1600));   /* the prose deliberately NAMES the old shape */
  assert.equal(/b\.rKm/.test(fn), false,
    '`rKm` is the PLANET’s radius — comparing it with a satellite’s `radiusKm` is not an ordering');
  assert.match(fn, /\(b\.radiusKm\|\|0\)-\(a\.radiusKm\|\|0\)/, 'biggest first, on one field');
  /* a comparator must depend on BOTH arguments, which is the property the old one lacked */
  const cmp = /sort\(\(a,b\)=>([^)]*\)[^;]*)\)/.exec(fn);
  assert.ok(cmp && /\ba\./.test(cmp[1]) && /\bb\./.test(cmp[1]), 'the comparator reads both arguments');
});

test('R215 ⑩c: there is ONE clock — the date field is the readout', () => {
  const sp = read('js/space.js');
  /* exactly one .sp-clock, and it lives inside the box that holds the field */
  const box = sp.slice(sp.indexOf("class=\"sp-whenbox\""), sp.indexOf("class=\"sp-whenbox\"") + 2200);
  assert.match(box, /class="sp-clock"/, 'the live/time-base label is on the date box');
  assert.match(box, /class="sp-when"/, '…and so is the field it labels');
  assert.equal((sp.match(/class="sp-clock"/g) || []).length, 1, 'there is no second readout elsewhere in the bar');
  /* and the field is FILLED from the tick — it used to be write-only, which is why a second
     readout existed at all */
  const rc = sp.slice(sp.indexOf('function refreshClock()'), sp.indexOf('function refreshClock()') + 1600);
  assert.match(rc, /\.sp-when/, 'refreshClock writes the instant into the field');
  assert.match(rc, /document\.activeElement!==w/, '…but never while the caret is in it');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 3 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/space.js・js/satellites-live.js・js/data-layers.js・js/atlas-console.js はキャンバス・DOM・描画エンジンに閉じたファクトリで node では組み立てられない（食の計算は実行している） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

/* ── ⑧ the space explorer ───────────────────────────────────────────────────────────── */
test('#R216 ⑧ space: the hint starts earlier, the ✕ animates, and the deep sky is named', () => {
  const s = read('js/space.js');
  const m = /const\s+NEAR_FLOOR\s*=\s*([\d.]+)/.exec(s);
  assert.ok(m, 'NEAR_FLOOR is gone');
  assert.ok(parseFloat(m[1]) >= 2, 'the space hint still starts less than two zoom levels out');
  assert.match(s, /\.sp-close'\)\.onclick=\(\)=>\{\s*if\(!leaveToMap\(\)\)\s*close\(\);\s*\}/,
    'the close button still drops back to the map with no transition');
  assert.equal(s.includes('太陽系の外'), false, 'the deep-sky button is named after where it is not');
  assert.match(s, /L\('Galaxies & nebulae','銀河・星雲'/, 'the deep-sky button lost its name');
});
test('#R216 ⑧ space: the selected planet\'s satellites are drawn in the SYSTEM view', () => {
  const s = read('js/space.js');
  assert.match(s, /function drawSysMoons\(/, 'there is no system-view satellite pass');
  const sys = s.slice(s.indexOf("if(mode==='system')"), s.indexOf('const taken=drawSystemLabels'));
  assert.match(sys, /drawSysMoons\(jd,pos,VP,centre,cam,extraLabels\)/, 'it is never called from the system branch');
  /* placed by the Moon's own law, or model scale puts them inside the planet (#R203) */
  assert.match(s, /moonSep\(rr\*b\.rKm\)/, 'satellites are placed with a raw separation');
  /* and the Moon is not drawn twice: it is already a BODY */
  assert.match(s, /if\(focus==='earth'&&\(m\.code===301\|\|m\.name==='Moon'\)\)\s*continue/, 'the Moon would be drawn twice');
});
test('#R216 ⑧ space: six display switches live behind one button', () => {
  const s = read('js/space.js');
  assert.match(s, /class="sp-show"/, 'the Show menu is gone');
  ['sp-orbits', 'sp-moons', 'sp-names', 'sp-craft', 'sp-small', 'sp-deep'].forEach((c) =>
    assert.ok(s.includes('class="' + c + '"'), c + ' is not in the HUD'));
  /* the two right-hand panels are one column — the old literal top offset is what made them overlap */
  assert.equal(/top:calc\(52px \+ 232px\)/.test(s), false, 'the events panel is positioned by a guessed height again');
  assert.match(s, /class="sp-col"/, 'there is no panel column');
  const css = read('css/intmap.css');
  assert.match(css, /#space-view \.sp-bar\{[^}]*flex-wrap:nowrap/, 'the phone bar still stacks');
  assert.match(css, /#space-view \.sp-col\{/, 'the phone has no bottom sheet');
});
}
