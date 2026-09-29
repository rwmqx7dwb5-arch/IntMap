/* ============================================================================
 *  THE LAYER CATALOGUE — categories, facility sets, data centres, POI, elections, Köppen
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The shelves are evaluated through
 *    tests/helpers/layer-groups.mjs where the catalogue is involved; the rows, cards and colours live
 *    in page closures (js/data-layers.js, js/osm-facilities.js, js/datacenters.js) and are read.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as LM from '../js/layer-manifest.js';
import { readLF } from '../scripts/eol.mjs';
import { byKey, publishedList } from './helpers/layer-groups.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r202-checks.test.mjs (tests #10 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

test('R202 ③c the satellite layer is in a group somebody would open', () => {
  const dl = rd('js/data-layers.js');
  /* ⚠ (#R261) THE LITERAL LIST BECAME A PROPERTY. #R261 added `osmspace` (spaceports and satellite
     ground stations) to this shelf — 「1行だけのグループはカテゴリではない」 — and a list literal
     asserts «and nothing else, ever», which is not what #R202 was claiming. The claim is that `sats`
     has a group of its own and is not filed under the ocean. */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(byKey.lyrGrpOrbit.includes('sats'), 'sats is in its own group');
  assert.ok(!byKey.lyrGrpMaritime.includes('sats'), 'and no longer under Oceans & maritime');
  /* ⚠ (#R239) SAME CLAIM, NEW HOME — every keyed string moved into js/locales/ui.<code>.js.
     The `Object.assign(i18n.en…es,{…})` shape this test read was five languages by
     construction, and fr/ko/zh fell back to English for ~170 keys declared that way
     (scripts/i18n-keyed-audit.mjs). Nine locale files is the stricter form of the same
     question. (#R203: move the assertion, say why.) */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok((() => { const t = rd('js/locales/ui.' + c + '.js'); return t.includes('lyrGrpOrbit:') || t.includes('"lyrGrpOrbit":'); })(), `the group is named in ${c}`);
  }
});
}

/* ═══ from tests/r211-checks.test.mjs (tests #11 of 12) ═══
   R211 source-level regression checks.

   Everything here is written as a RELATION, never as a value (#R203's trap, hit five more times in
   #R210): "the gate does not grow with the ladder", "there is one palette and both halves use it",
   "the width is a square root of a ratio". A literal pinned here is a literal the next instruction
   breaks.

   (layer-manifest) which layers exist, and their facts */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 9 · POI labels ───────────────────────────────────────────────────────────────────────────── */
test('R211 POI: on by default, coloured by tier, industry named, and no all-at-once zoom', () => {
  const pl = read('js/place-labels.js');
  /* ⚠ the gate must not be a step — that is what made a whole tier appear at one zoom */
  /* ⚠ the right-hand side MUST be a `step` — MapLibre rejects an `interpolate` on zoom inside a
     filter and addLayer throws, which took the whole label stack down. What removes the
     all-at-once is (a) the per-feature offset and (b) a ladder that advances by less than a whole
     tier per zoom, so each step admits only part of a tier. */
  const gate = /const POI_GATE=\['<=',\['\+',POI_TIER,POI_JITTER\],\['step',\['zoom'\],([0-9.,\s]+)\]\];/.exec(pl);
  assert.ok(gate, 'the gate compares the jittered tier against a zoom STEP');
  const nums = gate[1].split(',').map(Number).filter(Number.isFinite);
  const thresholds = nums.filter((_, i) => i % 2 === 0);   // stop outputs: 1st, then every other
  let advance = 0, steps = 0;
  for (let i = 1; i < thresholds.length; i++) { advance += thresholds[i] - thresholds[i - 1]; steps++; }
  assert.ok(steps >= 4, `the ladder has at least four steps (got ${steps})`);
  assert.ok(advance / steps < 1, 'each step admits LESS than a whole tier — that is what spreads a tier over zooms');
  assert.match(pl, /const POI_JITTER=\['\*',0\.9,/, 'and each feature carries its own offset inside a tier');
  assert.ok(!/\['interpolate',\['linear'\],\['zoom'\],12,1,18,5\]/.test(pl), 'no interpolate-on-zoom in a filter');
  /* colour by tier, both themes */
  assert.match(pl, /const POI_COL_DARK=\['match',POI_TIER,/, 'dark theme colours by tier');
  assert.match(pl, /const POI_COL_LIGHT=\['match',POI_TIER,/, 'light theme too');
  assert.ok(!/setPaint\('ofm-poi','text-color', lightPoi\?'#ffd9a0':'#8a5300'\)/.test(pl),
    'the flat repaint that undid it is gone');
  /* factories and companies are named rather than falling through to the bottom tier */
  for (const cls of ['industrial', 'factory', 'works', 'office', 'warehouse']) {
    assert.ok(pl.includes(`'${cls}'`), `${cls} is a named class`);
  }
  /* ⚠⚠ AND EVERY CLASS APPEARS IN EXACTLY ONE BRANCH. A `match` with a repeated label fails
     MapLibre's style validation («Branch labels must be unique»), addLayer THROWS, and the entire
     label stack stops existing — the silent-loss shape this project keeps paying for. Adding
     'office' to tier 2 while it was still in tier 3 did precisely that; tests/smoke caught it.
     Derived from the source rather than listed, so a future addition cannot reintroduce it. */
  const tierBlock = codeOnly(pl.slice(pl.indexOf('const POI_TIER='), pl.indexOf('    4];')));
  const classes = [...tierBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const seen = new Set();
  const dups = [...new Set(classes.filter((c) => (seen.has(c) ? true : (seen.add(c), false))))];
  assert.deepEqual(dups, [], `a class may appear in only one tier; repeated: ${dups.join(', ')}`);
  assert.ok(classes.length > 60, 'and the tiers are actually populated');
  /* ⚠ and the OSM schema's own British spellings are still intact — they are a data contract */
  assert.ok(pl.includes("'sports_centre'") && pl.includes("'community_centre'"),
    'the tile schema keeps its own spelling');
  /* default on */
  assert.match(read('js/app-body.js'), /poiOn=true;/, 'the shop/facility names are on from the start');
  assert.ok(LM.LAYERS.find((l) => l.id === 'cb-poi').on && LM.LAYERS.find((l) => l.id === 'cb-poi').html, '…and the box shows it (js/layer-manifest.js writes it ticked)');
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #5 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK. #R231 hit this five times and #R208/#R229
   before it: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax,
   never prose. */
const noJs = (s) => codeOnly(String(s));

/* ── ③ the day/night switch ──────────────────────────────────────────────────────────────────── */
test('R232 layers: the flat night layer is gone and the shading has one owner', () => {
  const dl = noJs(read('js/data-layers.js'));
  assert.doesNotMatch(dl, /function buildNight\(/, 'the turf disc is deleted');
  assert.doesNotMatch(dl, /'lyr-night'/, 'and so is its layer');
  assert.doesNotMatch(dl, /\['night','lyrNight'\]/, 'and its row');
  assert.match(dl, /\['nightside','lyrNightSide'\]/, 'the row that replaced it drives the shading');
  assert.match(dl, /function _setNightSide\(on\)/, 'ONE place writes the boolean');
  assert.match(dl, /window\._imSyncNightSideRow/, '…and the other two surfaces re-read it');
  assert.match(read('js/app-body.js'), /_imSyncNightSideRow/, 'Settings follows');
  assert.match(read('js/atlas-console.js'), /_imSyncNightSideRow/, 'Atlas follows');
  assert.match(read('js/session-tabs.js'), /'dl-night':'dl-nightside'/, 'a saved session is migrated');
});
}

/* ═══ from tests/r235-checks.test.mjs (tests #7 of 9) ═══
    R235 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic it is COMPUTED here rather than pinned to a
    number this round happened to produce (#R203/#R229).

   (layer-manifest) the lists are views of js/layer-manifest.js */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234 — SEVEN rounds of a check hitting its own explanation). Strip the
   comments and match the SYNTAX. */

/* ── 7 · day/night is a basic display, not a layer ──────────────────────────────────────────── */
test('R235 day/night: not counted, not chipped, not offered as a layer to discover', () => {
  const dl = code(read('js/data-layers.js'));
  /* ⚠ (#R309) THIS USED TO PIN THE SPELLING `const skip=new Set(['cb-names',…,'dl-nightside'])`, and
     that literal was the defect it was guarding against: the section's membership existed in FOUR
     hand-written copies, so #R271 and #R273 could move two more rows in without any counter learning.
     The requirement was never the Set literal — it is that day/night is subtracted from the
     Active-layers count. Ask that of the ONE published list, and of the counter that reads it. */
  /* (layer-manifest) the published section is the manifest's \`base\` shelf (window.IntMapBasicLayers=basicLayers()) */
  assert.ok(publishedList('IntMapBasicLayers').includes('dl-nightside'),
    'day/night is in the published base-map section');
  assert.match(dl, /const skip=new Set\(window\.IntMapBasicLayers\)/,
    'it is skipped by the Active-layers list, like the other basics');
  /* ⚠ (#R292) THE ROULETTE BECAME A SUGGESTION, AND THE REQUIREMENT SURVIVED THE CHANGE. There is
     no hand-written `FEAT_IDS` list any more: the featured-layer card scores the app's OWN layer
     registry (js/widget-defs-map.js `featuredList`), so a layer the registry stops listing is one
     the card stops offering — which is a stronger version of what #R235 pinned by name. What must
     still hold is that day/night is not IN that registry's list, and `skip` above is what keeps it
     out. This asserts the card reads the registry rather than a table of its own. */
  const w = code(read('js/widget-defs-map.js'));
  assert.match(w, /var all = \(ctx\.layers && ctx\.layers\.all\) \|\| \[\];/,
    'the featured-layer card offers what the layer registry lists, not a list of its own');
  assert.doesNotMatch(w, /'dl-nightside'/, 'and it never names the day/night switch');
  /* the row itself must STILL be in the basic-display block — this is a re-classification, not a removal */
  assert.match(dl, /const nsRow=rowFor\('nightside'\); if\(nsRow\)/, 'the row is still placed among the basics');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #12, #13 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{

/* ── ⑦ every U.S. presidential election ───────────────────────────────────────────────────────── */
test('R243 ⑦ the election dataset is sixty elections and every cell resolves', () => {
  assert.ok(existsSync(join(ROOT, 'data/us-elections.json')), 'data/us-elections.json is committed');
  const d = JSON.parse(read('data/us-elections.json'));
  const geo = JSON.parse(read('data/us-states.json'));
  const codes = new Set(geo.features.map((f) => f.properties.st));
  assert.equal(d.elections.length, 60, '1789 → 2024 inclusive is sixty elections');
  assert.equal(d.elections[0].y, 1789);
  assert.equal(d.elections[59].y, 2024);
  assert.equal(geo.features.length, 51, '50 states + DC');
  let cells = 0;
  for (const e of d.elections) {
    assert.ok(e.c.length >= 2, e.y + ': at least two candidates');
    assert.ok(e.t > 0, e.y + ': the elector total is what a majority is taken of');
    for (const st of Object.keys(e.s)) {
      cells++;
      assert.ok(codes.has(st), e.y + ': ' + st + ' is not a state in the geometry');
      assert.ok(e.s[st] >= 0 && e.s[st] < e.c.length, e.y + ' ' + st + ': candidate index out of range');
    }
    for (const c of e.c) assert.ok(d.parties[c.p], e.y + ': unknown party ' + c.p);
  }
  assert.ok(cells > 2000, 'the state matrix is the whole point: ' + cells + ' cells');
  /* the years a party label cannot answer, spot-checked against the record */
  const at = (y, st) => { const e = d.elections.find((x) => x.y === y); return e.c[e.s[st]].n; };
  assert.equal(at(1789, 'VA'), 'George Washington');
  assert.equal(at(1824, 'OH'), 'Henry Clay');
  assert.equal(at(1836, 'MA'), 'Daniel Webster');
  assert.equal(at(1860, 'KY'), 'John Bell');
  assert.equal(at(1860, 'MO'), 'Stephen A. Douglas');
  assert.equal(at(1912, 'PA'), 'Theodore Roosevelt');
  assert.equal(at(1948, 'SC'), 'Strom Thurmond');
  assert.equal(at(1968, 'AL'), 'George Wallace');
  assert.equal(at(2024, 'PA'), 'Donald Trump');
  assert.equal(at(2020, 'GA'), 'Joe Biden');
  /* a state that did not exist yet must be ABSENT, never present-with-a-party */
  assert.equal(d.elections.find((e) => e.y === 1789).s.CA, undefined, 'California did not vote in 1789');
});

test('R243 ⑦ «did not vote» is expressed in the colour, because the opacity slider owns fill-opacity', () => {
  const c = code(read('js/us-elections.js'));
  assert.ok(/'fill-color':\['coalesce',\['get','col'\],'rgba\(0,0,0,0\)'\]/.test(c),
    'a `fill-opacity` expression is replaced by _registerLayerOpacity the moment the slider initialises');
  assert.ok(/delete f\.properties\.col/.test(c),
    'the property must be ABSENT, not null — coalesce over a present-but-null property does not fall through');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #10 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ⑩ 「アメリカ大統領選挙レイヤーは、操作時に凡例が上に伸びるのではなく下に伸びるように。」 */
test('r244 ⑩ a legend may declare that it grows downward, and the election legend does', () => {
  assert.ok(/dataset\.growDown==='1'/.test(code('js/data-layers.js')), 'tileLegends honours the flag');
  assert.ok(/el\.dataset\.growDown='1'/.test(code('js/us-elections.js')), 'the election legend sets it');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #10 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => codeOnly(read(p));

/* ── ⑨ the climate names are ONE table, and every reader goes through one lookup ────────────────
   They were four tables (an `{en,jp}` literal plus `_kde`/`_kru`/`_kes` patched on at load), which
   is the two-lists defect and the eleventh shape at the same time. */
test('r245 ⑨ Köppen names are one table and one accessor', () => {
  const src = code('js/data-layers.js');
  assert.ok(!/_kde|_kru|_kes/.test(src), 'no per-language patch tables');
  assert.equal((src.match(/window\.KNAME=/g) || []).length, 1, 'one declaration');
  assert.ok(/window\.kName=function\(code\)\{[^}]*LDL\.arr\(e\)/.test(src), 'the accessor resolves through pick()');
  for (const [f, pat] of [['js/map-ui.js', /window\.kName\(c\)/], ['js/map-readout.js', /window\.kName\(code\)/]])
    assert.ok(pat.test(code(f)), `${f} asks that accessor rather than reading the table`);
});
}

/* ═══ from tests/r255-checks.test.mjs (tests #3, #12, #13 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */

/* ── ③ the data-centre card is PLACED ────────────────────────────────────────────────────────── */
test('#R255 ③ detail cards set their own left/top — .country-popup has none', () => {
  for (const f of ['js/datacenters.js', 'js/osm-facilities.js']) {
    const s = code(read(f));
    assert.match(s, /className='country-popup'/, `${f} no longer uses the shared detail-card shell`);
    assert.match(s, /el\.style\.left=/, `${f} appends a .country-popup without placing it — it lands below the fold`);
    assert.match(s, /el\.style\.top=/, `${f} appends a .country-popup without placing it — it lands below the fold`);
    /* project() is canvas-relative; the card is placed in page coordinates (#R252) */
    assert.match(s, /getBoundingClientRect\(\)/, `${f} places the card without the canvas offset`);
  }
});

/* ── ⑧ the four new categories, their rows, and the layers that fill them ────────────────────── */
test('#R255 ⑧ four new categories exist, are filled, and are named in all nine languages', () => {
  const dl = code(read('js/data-layers.js'));
  const KEYS = ['lyrGrpPolitics', 'lyrGrpSecurity', 'lyrGrpHealth', 'lyrGrpTech'];
  const seen = new Map();
  for (const k of KEYS) {
    /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
       matched nothing once each shelf grew a count of the rows the reader named. */
    assert.ok(byKey[k], `${k} is not built from a list`);
    const ids = byKey[k];
    assert.ok(ids.length >= 4, `${k} holds only ${ids.length} rows`);
    ids.forEach((i) => { assert.ok(!seen.has(i), `${i} is in ${seen.get(i)} AND ${k} — order.push MOVES the element, so it renders only in the last group`); seen.set(i, k); });
  }
  /* a row may not appear in two groups anywhere in the taxonomy, not only among the new four */
  for (const k of ['lyrGrpClimate', 'lyrGrpOrbit', 'lyrGrpMaritime', 'lyrGrpTerrain', 'lyrGrpDemo', 'lyrGrpHazard', 'lyrGrpIndic', 'lyrGrpOthersReal']) {
    const m = new RegExp(String.raw`\['` + k + String.raw`',\[([^\]]*)\]\]`).exec(dl);
    if (!m) continue;
    m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
      .forEach((i) => { assert.ok(!seen.has(i), `${i} is in ${seen.get(i)} AND ${k}`); seen.set(i, k); });
  }
  /* the four surveyed-facility layers are the point layers those categories were asked for */
  ['osmdiplo', 'osmmil', 'osmhealth', 'osmtelecom'].forEach((i) =>
    assert.ok(seen.has(i), `${i} is not filed in any category`));
  /* rowFor must find the rows those categories name, or they fall to the beta sweep.
     (layer-manifest) it resolves through the checkbox id js/layer-manifest.js declares, not through a prefix table */
  ['osmdiplo', 'osmmil', 'osmhealth', 'osmtelecom'].forEach((i) =>
    assert.ok(LM.layerFor(i) && /^fac-dl-/.test(LM.layerFor(i).id), "rowFor does not resolve '" + i + "' to its fac-dl- row"));

  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh-hans', 'zh']) {
    const s = read('js/locales/ui.' + c + '.js');
    KEYS.forEach((k) => assert.match(s, new RegExp(k + '["\']?\\s*:'), `ui.${c}.js has no label for ${k}`));
  }
});

test('#R255 ⑧b the facility layers are surveyed objects, attributed, and never invented', () => {
  const f = read('js/osm-facilities.js');
  assert.match(f, /ODbL/, 'the OSM attribution is missing');
  assert.match(code(f), /osmId:e\.type\+'\/'\+e\.id/, 'a point does not carry the id of the object it came from');
  /* four sets, one engine */
  ['diplo', 'mil', 'health', 'telecom'].forEach((k) => assert.match(code(f), new RegExp(k + ':\\{'), `the ${k} set is gone`));
  assert.equal((code(f).match(/async function overpass\(/g) || []).length, 1, 'the Overpass path is written more than once');
  /* the military layer must say what it is and what it is not */
  assert.match(f, /NOT AN INTELLIGENCE PRODUCT/, 'the military layer no longer states the limits of what it shows');
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #15, #16 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ⑩ the new category, and the layers in it ──────────────────────────────────────────────── */
test('R258 ⑩: Energy & resources is a category with two surveyed layers in it', () => {
  const dl = read('js/data-layers.js');
  /* ⚠ (#R261) THIS PINNED THE LITERAL LIST, AND THE NEXT INSTRUCTION MADE IT RED. 「Others, Betaも
     含め既存レイヤーの再編」 moved the five World-Bank energy indicators and the dams row onto this
     shelf, which is what the shelf is for. What #R258 was actually asserting is that the category
     exists and that its two SURVEYED layers are on it — a list literal also asserts «and nothing
     else will ever be», which is not something this round knew. (#R244's lesson, third time.) */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  assert.ok(byKey.lyrGrpEnergy, 'the Energy & resources group is there');
  ['osmpower', 'osmextract'].forEach(k => assert.ok(byKey.lyrGrpEnergy.includes(k),
    k + ' is on the Energy & resources shelf'));
  const fac = read('js/osm-facilities.js');
  assert.match(fac, /id:'osmpower', row:'fac-dl-osmpower'/, 'the power layer exists');
  assert.match(fac, /id:'osmextract', row:'fac-dl-osmextract'/, 'the extraction layer exists');
  assert.match(fac, /nwr\["power"="plant"\]/, '…and asks OpenStreetMap for real objects');
  ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans'].forEach((c) => {
    assert.ok(read('js/locales/ui.' + c + '.js').includes('lyrGrpEnergy'),
      'ui.' + c + '.js names the new group');
  });
});

/* ── ⑪ the data-centre layer ───────────────────────────────────────────────────────────────── */
test('R258 ⑪: the curated table grew, and a size on the map means a published number', () => {
  const s = read('js/datacenters.js');
  const rows = (s.slice(s.indexOf('const DC=['), s.indexOf('\n  ];', s.indexOf('const DC=['))).match(/^\s*\[-?[0-9]/gm) || []).length;
  assert.ok(rows >= 310, 'the curated table holds ' + rows + ' entries (it was 260 before #R258)');
  assert.match(s, /const rFor=\(k,mw\)=>\{ const base=R_OF\[k\]\|\|5;/,
    'the radius is a function of the PUBLISHED capacity…');
  assert.match(s, /return \(mw>0\)\?Math\.min\(base\*2\.4, base\*\(1\+0\.055\*Math\.sqrt\(mw\)\)\):base;/,
    '…√MW, and the class’s own size where nothing is published');
  assert.match(s, /toggleKey\(k\)\{/, 'the legend key is a filter');
  /* the six coordinates that were the nearest big city rather than the published site */
  assert.match(s, /\[135\.47,34\.57,'SoftBank/, 'SoftBank Sakai is in Sakai');
  assert.match(s, /\[54\.37,24\.47,'G42/, 'G42 is in Abu Dhabi, not Dubai');
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #2, #10, #11, #12 of 13) ═══
    #R261 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here.

    ⚠ (#R283) EVERY ASSERTION BELOW IS ABOUT THE CONTENT OF A FILE, SO IT READS THE
    CONTENT. This file used to read the bytes the checkout produced, and ③ demands a
    line break at a named place — which on a CRLF working copy has a carriage return
    in front of it, so ③ has been red on Windows and green in CI ever since #R275 gave
    it that shape. See scripts/eol.mjs: the line break ③ requires is still required,
    and nothing else moved.

   (layer-manifest) which layers exist, and their facts */
{

/* ── ② the detail card's × is the app's rounded square, not a disc ──────────────────────────────
   「詳細のポップアップは×を丸にするな。」 Two files built a private `border-radius:50%` button on a
   shell that already has `.country-popup-close` (8 px, transparent, 32 px on a phone, in the drag
   exclusion list). */
test('R261 ②: no detail card builds its own circular close button', () => {
  for (const f of ['js/datacenters.js', 'js/osm-facilities.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /class="cp-close"[^>]*border-radius:50%/,
      f + ': the round × is gone');
    assert.match(s, /class="country-popup-close cp-close"/,
      f + ': it uses the shell’s own close button');
  }
  /* the class has to keep carrying the phone size and the drag exclusion */
  assert.match(read('js/data-layers.js'), /\.country-popup-close, #cp-close\{ width:32px !important/);
  assert.match(read('js/window-manager.js'), /\.country-popup-close/);
});

/* ── ⑩ the four new shelves, and what did NOT move ──────────────────────────────────────────────
   「Others, Betaも含め既存レイヤーの再編…」 — the authorisation #R255 and #R258 both said they did
   not have. What they refused to move on their own is still exactly where the reader put it. */
test('R261 ⑩: Others is emptied into named families and the demoted rows stay demoted', () => {
  const s = read('js/data-layers.js');
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  for (const k of ['lyrGrpEconomy','lyrGrpSociety','lyrGrpTransport','lyrGrpAgri'])
    assert.ok(byKey[k], k + ' is a group');
  assert.deepEqual(byKey.lyrGrpOthersReal, [], 'the Others shelf is empty, and kept (the lyrGrpGeoPol precedent)');
  /* ⚠ (#R271) #R233's seven and #R254's energy-mix promotion are still CURATED — they are no longer
     all on one shelf. This round was told 「大規模にレイヤーカテゴリ分類を再編しろ」, which is the
     authorisation #R255, #R258 and #R270 each said they did not have, and four of the eight moved to
     the shelf their own subject names. What #R261 was about — that nothing quietly falls back into
     Beta / Others — is what is asserted now. */
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const grp261 = byKey;
  for (const id of ['popgrid', 'gdppc', 'tfr', 'hdi', 'dem', 'cpi', 'lifeexp', 'energy']) {
    const w = Object.keys(grp261).filter((g) => grp261[g].includes(id));
    assert.equal(w.length, 1, id + ' must be on exactly one shelf');
    assert.ok(!/Others|Beta/i.test(w[0]), id + ' fell back into ' + w[0]);
  }
  /* the rows #R40 demoted BY INSTRUCTION are not promoted */
  /* (layer-manifest) the curated shelves are js/layer-manifest.js — their short names, as the old slice read them */
  const groups = LM.layerGroups().flatMap(([, ids]) => ids).map((k) => "'" + k + "'").join(',');
  /* ⚠ (#R266) THE GIBS HALF OF THIS LIST IS GONE, AND NOT BECAUSE IT WAS PROMOTED. #R40 demoted
     seven GIBS rasters to Beta by instruction; #R266 DELETED eight of them by instruction (「以下の
     レイヤーは削除」), so «is gxtruecolor still in Beta» no longer has a subject. The three EC
     weather rows are the demotions that still exist, and #R266 ① asserts the deletions separately —
     between them nothing about #R40's decision goes unchecked. */
  /* ⚠ (#R288) `ec-temp` LEFT THIS LIST, and not because #R40's demotion was overturned. It absorbed
     `temp` — the MERRA-2 air-temperature row that lived on the Climate shelf — by instruction
     (「気温（2m・再解析）レイヤーも統合し、一つのレイヤー…ソースだけ切り替えられる仕様に」), so the
     merged row is where the row it absorbed was. The other two demotions are unchanged, and the
     merged row must be on the Climate shelf rather than nowhere. */
  /* ⚠ (#R439) `ec-precip` LEFT THIS LIST, and — like `ec-temp` above — not because #R40's decision
     was overturned by us. It was promoted BY INSTRUCTION, and the instruction made the promotion
     conditional on the work: 「あ、降水量、露点もWindyとグラフィックをRGBレベルで対応させる作業
     やってから、気候・気象レイヤーに。」 The same message promoted 気圧 and 最大瞬間風速, and #R439
     did the colour work for all three before moving any of them. `ec-wind` (the 10 m arrows) was NOT
     named and is the demotion this line still guards; #R439 ⑨ asserts the four promotions and that
     `ec-cape`, also unnamed, stayed where it was — between them nothing about #R40 goes unchecked. */
  for (const id of ['ec-wind'])
    assert.ok(!groups.includes("'" + id + "'"), id + ' stays in Beta — it was demoted per request');
  assert.ok(groups.includes("'ec-temp'"), 'the merged air-temperature row is where the row it absorbed was');
  assert.ok(!s.includes("['temp','lyrTemp']"), '…and the row it absorbed is not declared twice');
  for (const id of ['gxtruecolor','gxlst','gxcloud'])
    assert.ok(!s.includes("'" + id + "'"), id + ' was deleted in #R266 and must not come back');
  /* every id in a GROUP has to be resolvable, which is what the `ox-` prefix gap broke */
  /* (layer-manifest) rowFor resolves through the checkbox id js/layer-manifest.js declares — every short name has one */
  for (const k of LM.layerGroups().flatMap(([, ids]) => ids)) assert.ok(LM.layerFor(k), k + ' resolves to no row');
  assert.ok(/^ox-/.test(LM.layerFor('oxrail').id) && /^ox-/.test(LM.layerFor('oxsea').id),
    'rowFor knows the ox- rows, or oxrail/oxsea silently stay in Beta');
  /* the nine locales carry the four new headings */
  for (const f of ['en','jp','de','ru','es','fr','ko','zh','zh-hans']) {
    const t = read('js/locales/ui.' + f + '.js');
    for (const k of ['lyrGrpEconomy','lyrGrpSociety','lyrGrpTransport','lyrGrpAgri'])
      assert.ok(t.includes(k), f + ' declares ' + k);
  }
});

/* ── ⑪ six new surveyed-object layers, on the shelves that had nothing to click ─────────────────
   「新レイヤー（国単位で塗るだけのやつじゃなくて、モノホンのやつ。）」 */
test('R261 ⑪: the six new facility sets exist, are filed, and invent nothing', () => {
  const s = read('js/osm-facilities.js');
  const ids = ['osmair','osmport','osmwater','osmedu','osmemg','osmspace'];
  for (const id of ids) {
    assert.match(s, new RegExp("id:'" + id + "', row:'fac-dl-" + id + "'"), id + ' is a set');
    assert.match(s, new RegExp("SW=\\{[\\s\\S]{0,400}"), 'the swatch table is there');
  }
  /* each one queries OpenStreetMap for real objects — no synthetic geometry anywhere in this file */
  assert.doesNotMatch(s, /Math\.random\(\)/, 'nothing here is generated');
  /* and every one of them is on a shelf */
  /* (layer-manifest) the shelves are js/layer-manifest.js */
  for (const id of ids) assert.ok(LM.layerGroups().some(([, g]) => g.includes(id)), id + ' is filed into a group');
});

/* ── ⑫ the data-centre layer can be asked a question ────────────────────────────────────────────
   「データセンター、AIインフラレイヤーを爆発的に強化。」 It had a colour key and nothing else. */
/* ⚠⚠ (#R264) THIS PINNED THE SUMMARY'S HOST AND WOULD HAVE CALLED ITS MOVE A REGRESSION. The three
   assertions below used to name `id='dc-panel'` and `openPanel:dcOpenPanel, closePanel:dcClosePanel`
   — i.e. «the answer lives in a floating window of its own», which is exactly what 「ポップアップ
   二つあるのを辞めろ」 asked to stop. What #R261 was ABOUT is that the layer can be asked a question
   at all, and that it never states a capacity without its denominator; that is what is asserted now,
   and where the answer is drawn is #R264's ③ to decide. (Same lesson as ⑬ below, one round later.) */
/* ⚠⚠⚠ (#R265) …AND THE IN-VIEW SUMMARY ITSELF IS GONE — 「表示範囲内のものを表示する機能はいらない」.
   That is the FOURTH round in a row in which this test's subject moved (#R261 built it, #R264 moved
   its host, #R265 deleted it), and the third time the assertions had frozen the implementation
   rather than the property. What survives of #R261 is real and is what is asserted now: the layer
   can be filtered by class from its legend, and the two kinds of switch share ONE filter expression
   on ONE layer — two sets would be two filters and the last one written would silently win. */
test('R261 ⑫: the data-centre layer is filterable, through a single expression', () => {
  const s = read('js/datacenters.js');
  /* the classes and the operator rows are both understood, and both end up in one filter */
  assert.match(s, /const CLASS_KEYS=\['ai','cloud','colo','hpc','other'\];/);
  assert.match(s, /if\(outKinds\.length\) clauses\.push\(\['!',\['in',\['get','k'\],\['literal',outKinds\]\]\]\);/);
  assert.match(s, /if\(outOps\.length\) clauses\.push\(\['!',\['in',\['get','op'\],\['literal',outOps\]\]\]\);/);
  const setFilter = s.match(/GE\(\)\.layers\.setFilter\(/g) || [];
  assert.equal(setFilter.length, 1, 'exactly one place writes the filter');
  /* and the door the legend rows drive it through is still there */
  assert.match(s, /toggleKey\(k\)\{ if\(hidden\.has\(k\)\) hidden\.delete\(k\); else hidden\.add\(k\);/);
});
}

/* ═══ from tests/r264-checks.test.mjs (tests #3 of 7) ═══
    #R264 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ③ the data-centre layer has one window, not two ────────────────────────────────────────────
   「データセンター、AIインフラレイヤーにポップアップ二つあるのを辞めろ。」 #R261's in-view summary was a
   floating `.tool-panel` beside the floating detail card. The card is the one that has to float (it
   is about the point under the finger); the summary is about the layer, so it is rendered into the
   legend block the layer already has. Every figure and every handler is the same markup. */
/* ⚠⚠ (#R265) THE SUMMARY IS NOT JUST UNHOUSED, IT IS DELETED — 「表示範囲内のものを表示する機能は
   いらない」. #R264's assertions named `mountSummary` / `dcRender` / `.dc-krow`, i.e. the mechanism,
   so they would have called this round's deletion a regression. What #R264 was ABOUT is that this
   layer has ONE floating thing, and that is still the property worth holding: the detail card (the
   answer about the point under the finger) floats, and nothing else does. */
test('R264 ③: the data-centre layer floats exactly one thing — the card about a point', () => {
  const s = read('js/datacenters.js');
  assert.doesNotMatch(s, /id='dc-panel'/, 'no floating summary panel');
  assert.doesNotMatch(s, /className='tool-panel'/, '…and no shell for one');
  /* the in-view readout is gone outright (#R265) */
  for (const gone of ['dcStats', 'dcRender', 'mountSummary', 'unmountSummary', 'sumHost', 'dc-sum']) {
    assert.doesNotMatch(s, new RegExp('function\\s+' + gone + '\\b|\\b' + gone + ':'),
      gone + ' is gone with the in-view summary');
  }
  assert.doesNotMatch(read('js/layer-packs.js'), /DCM\.(un)?mountSummary/,
    'and the consumer no longer mounts one');
  /* what does float is the card, and it places itself beside the point that was clicked (#R255) */
  assert.match(s, /id='dc-detail'/, 'the detail card survives');
  assert.match(s, /HOST\.makeDraggable&&HOST\.makeDraggable\(el,el\.querySelector\('\.dc-drag'\)\)/);
});
}

/* ═══ from tests/r273-checks.test.mjs (tests #11, #15 of 16) ═══
    #R273 — source-level checks
    What this round was asked for, and what each test holds:

      ① 「GDACSを完全に撤廃しろ」「ソースは一国一ソース」「対応国も増やせ」
      ② 「日本では気象庁の塗分けに対応させろ。また、市町村単位で塗り分けろ」
      ③ 「まだ対応していない国は灰色斜線で、発令されていないだけの地域は灰色に」
      ④ 「各国の警報階級を同じ紫・赤・黄に押し込んでいる」→ 各国公式配色 / IntMap換算の切替
      ⑤ 「何の警報なのか地図から分からない」→ 種別を区域に文字で、重複は +N
      ⑥ 「更新時間31.1hと2minが同列」→ Fresh / Delayed / Stale / Error
      ⑦ 「一覧が取得先一覧になっている」→ パネルは「どこで何が」から始まる
      ⑧ 「これ長すぎ」→ 出典の一文
      ⑨ 「なにか形がおかしい×をやめろ」→ アプリ全体で1つの ×
      ⑩ 「セルビア語系言語は似た色味に」
      ⑪ 「水流シミュレーションの解像度が低すぎる」「一回きりの水源、再生できない」
      ⑫ 「大規模にレイヤーカテゴリ分類を再編しろ」→ 見出しの名前が中身と一致する

    ⚠ EVERY «X is gone» ASSERTION IS WRITTEN IN THE SYNTAX X WAS WRITTEN IN, and against the source
    with its comments stripped — the prose that RECORDS a removal is not evidence against it. That
    is #R266's own lesson, and it has cost this repo a round twice. */
{

/* ── ⑩ the Serbo-Croatian standards are one hue ────────────────────────────────────────────── */
test('R273 ⑩ Serbian, Croatian, Bosnian and Montenegrin are near-identical colours', () => {
  const s = codeOnly(read('js/layer-packs.js'));
  /* ⚠ (#R538) THIS USED TO PIN «{ sr:0, cnr:1, bs:2, hr:3, sh:4 }» — five ISO 639-1 tags that no
     longer exist. Pinning them would have asserted the old model, not the family. The family is a
     fact in the data, so it is asked of the data: the five members must be real languoids, exactly
     one of them must be the LANGUAGE, and the other four must be its immediate standards. */
  const mF = /const FAM_BCMS=\{([^}]*)\}/.exec(s);
  assert.ok(mF, 'the family must be named');
  const fam = [...mF[1].matchAll(/([a-z0-9]{4}\d{4})\s*:/g)].map((x) => x[1]);
  assert.equal(fam.length, 5, 'five members: four standards and the language they are standards of');
  const T = JSON.parse(read('data/language-tree.json'));
  const at = new Map(T.g.map((g, i) => [g, i]));
  for (const g of fam) assert.ok(at.has(g), `${g} must exist in the language tree`);
  const lang = fam.filter((g) => T.lv[at.get(g)] === T.levels.indexOf('language'));
  assert.equal(lang.length, 1, 'exactly one member is the language');
  /* ⚠ NOT «immediate»: Glottolog puts an intermediate node (Eastern Herzegovinian Shtokavian)
     between the four standards and the language. Descent is the relation that matters — it is what
     lets the family tree draw them together and the hue say so. */
  const ancestors = (g) => { const out = []; let i = at.get(g); while (T.p[i] >= 0) { i = T.p[i]; out.push(T.g[i]); } return out; };
  for (const g of fam) if (g !== lang[0]) {
    assert.ok(ancestors(g).includes(lang[0]), `${g} must descend from ${lang[0]}`);
    assert.equal(T.lv[at.get(g)], T.levels.indexOf('dialect'), `${g} must be a standard, not a language of its own`);
  }
  const m = /const FAM_COL=\[([^\]]*)\]/.exec(s);
  assert.ok(m, 'the family palette must exist');
  const cols = [...m[1].matchAll(/'(#[0-9a-f]{6})'/g)].map((c) => c[1]);
  assert.equal(cols.length, 5, 'one colour per standard');
  assert.equal(new Set(cols).size, 5, 'and each of them distinct — a key needs to answer WHICH');
  /* «almost the same colour»: one hue, separated by lightness. Measured as the max pairwise
     difference of the hue angle over the five. */
  const hue = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255,
    b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360; };
  const hs = cols.map(hue);
  const spread = Math.max(...hs) - Math.min(...hs);
  assert.ok(spread <= 12, `the family must share a hue — spread is ${spread.toFixed(1)}°`);
  /* and the generated palette must never hand one of these to another language */
  assert.match(s, /FAM_COL\.forEach\(c=>\{ seen\[c\.toLowerCase\(\)\]=1; \}\)/, 'the family colours are reserved');
  assert.match(s, /if\(key==='language'&&FAM_BCMS\[cat\]!=null\) return FAM_COL\[FAM_BCMS\[cat\]\]/,
    'and the layer must actually paint from them');
});

/* ── ⑫ the shelves say what is on them ─────────────────────────────────────────────────────── */
test('R273 ⑫ the population shelf is renamed in every language, because the economy left it', () => {
  const s = read('js/data-layers.js');
  /* (#R469) the shared reader — the regex this replaced needed `]]` after the id list, and
     matched nothing once each shelf grew a count of the rows the reader named. */
  const m = [null, byKey.lyrGrpDemo.map((x) => "'" + x + "'").join(',')];
  assert.ok(m, 'the shelf must exist');
  assert.ok(!/'gdppc'/.test(m[1]), 'GDP per capita left for Economy');
  assert.ok(!/'hdi'/.test(m[1]), 'HDI left for Society');
  for (const f of ['js/locales/ui.en.js', 'js/locales/ui.jp.js', 'js/locales/ui.de.js', 'js/locales/ui.ru.js',
    'js/locales/ui.es.js', 'js/locales/ui.fr.js', 'js/locales/ui.ko.js', 'js/locales/ui.zh.js',
    'js/locales/ui.zh-hans.js']) {
    const t = read(f);
    const v = /lyrGrpDemo"?\s*:\s*"([^"]*)"/.exec(t);
    assert.ok(v, f + ' declares no name for the shelf');
    assert.ok(!/economy|Wirtschaft|экономик|economía|économie|経済|经济|經濟|경제/i.test(v[1]),
      f + ' still calls the shelf «economy»: ' + v[1]);
  }
});
}
