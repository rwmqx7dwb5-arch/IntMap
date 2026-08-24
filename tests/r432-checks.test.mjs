/* ============================================================================
 *  IntMap · #R432 — the status ladder could name volcanoes this map cannot draw
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHAT WAS ACTUALLY WRONG. #R395 gave the ladder a fifth feed — USGS
 *  `volcano/getMonitoredVolcanoes`, the whole set of volcanoes an American observatory publishes a
 *  level for — so that «an observatory looked and says normal» could stop being drawn as «nobody
 *  publishes anything». Measured 2026-08-25, that feed answers 70 rows, and SIX of the keys it put
 *  into `statusIndex()` had no feature in the bundled catalog:
 *
 *      0        ← «Alaskan Volcanoes» (AVO) and «Cascade Range» (CVO), both `vnum: null`, both
 *                 observatory-wide bulletins rather than volcanoes; `+null` is 0
 *      311161   ← «Korovin», AVO's number for the active northern cone of GVP 311160 «Atka
 *                 Volcanic Complex». GVP has no 311161 in either catalog
 *      311370   ← Isanotski Peaks
 *      323180   ← Coso Volcanic Field
 *      323822   ← Long Valley
 *      325010   ← Yellowstone
 *
 *  The last four are real GVP volcanoes, filed under the PLEISTOCENE catalog because their youngest
 *  known eruption predates the Holocene — so the Holocene-only bundle could never hold them. Their
 *  status was fetched every session and thrown away: `volcApplyStatus` writes the rank ONTO the
 *  features, and there was no feature. Yellowstone, with its own USGS observatory, was not on
 *  IntMap's volcano layer at all.
 *
 *  The answer is not an exemption list (`CONSTITUTION.md` §5). A volcano the USGS publishes a
 *  current alert level for belongs on a volcano map, so the bundle is now the Holocene catalog PLUS
 *  whatever an observatory is speaking about — DERIVED at build time from the live feed, never
 *  listed by hand — and the two rows that name no volcano stop becoming a volcano numbered 0.
 *
 *  What these hold:
 *   ① the bundle says what it is made of, and the two files agree about it;
 *   ② the volcanoes beyond the Holocene list are real GVP records whose Holocene-only fields are
 *      ABSENT rather than guessed;
 *   ③ the shipped module, RUN: a row that names no volcano makes no key, AVO's number lands on the
 *      Smithsonian's volcano, and when two rows share one dot the more severe one is the answer;
 *   ④ the build derives that second set from the feed, reads the correspondence out of the running
 *      module instead of keeping a second copy, and refuses to drop what it cannot place;
 *   ⑤ the live spec watches EVERY feed the module has — it named four while the module had five,
 *      which is why the feed that broke it was the one nobody was watching settle;
 *   ⑥ no shipped string still calls the bundle the Holocene catalog, and the card branches on the
 *      epoch instead of asserting it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const rd = (p) => readLF(join(ROOT, p));
/* ⚠ an assertion about what the code DOES may not read the comments (#R427). */
const code = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const LAYER = JSON.parse(readFileSync(join(ROOT, 'data', 'volcanoes_gvp.json'), 'utf8'));
const DETAIL = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'volcano-detail.json.gz'))).toString('utf8'));
const EPOCH = DETAIL.vocab.epoch;
const epochOf = (v) => { const d = DETAIL.volcanoes[String(v)]; return (d && d.ep != null) ? EPOCH[d.ep] : null; };

test('① the bundle says what it is made of, and both files agree about it', () => {
  assert.ok(Number.isInteger(LAYER.holocene), 'the layer file does not carry its Holocene count');
  assert.ok(LAYER.holocene > 1000, `only ${LAYER.holocene} Holocene volcanoes`);
  assert.ok(LAYER.holocene <= LAYER.features.length, 'more Holocene volcanoes than volcanoes');
  /* ⚠ DERIVED FROM THE OTHER FILE, NOT FROM A NUMBER WRITTEN HERE. The detail record carries each
     volcano's geological epoch, so «how many are not Holocene» is a question the data answers. */
  const nonHolocene = LAYER.features.filter((f) => epochOf(f.properties.v) !== 'Holocene');
  assert.equal(LAYER.features.length - LAYER.holocene, nonHolocene.length,
    'the layer\'s Holocene count and the detail record\'s epochs disagree about the composition');
  assert.ok(EPOCH.length >= 1 && EPOCH.includes('Holocene'), 'the epoch vocabulary lost Holocene');
});

test('② the volcanoes beyond the Holocene list are real GVP records with nothing invented', () => {
  const extra = LAYER.features.filter((f) => epochOf(f.properties.v) !== 'Holocene');
  assert.ok(extra.length > 0,
    'nothing beyond the Holocene list — if USGS stopped monitoring every volcano GVP files elsewhere '
    + 'this is legitimate, but check the build before relaxing it');
  for (const f of extra) {
    const p = f.properties, d = DETAIL.volcanoes[String(p.v)];
    assert.ok(Number.isInteger(p.v) && p.v > 0, 'no GVP number');
    assert.ok(p.n && p.c && p.r, `${p.v} is missing name, country or region`);
    const [lon, lat] = f.geometry.coordinates;
    assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, `${p.v} is not on Earth`);
    /* ⚠ THE PLEISTOCENE FEATURE TYPE PUBLISHES NINE OF THE HOLOCENE ONE'S NINETEEN FIELDS, and the
       eruption list and the population layer are both Holocene-only. Every field that has no source
       is null — a guessed VEI or an invented last-eruption year would be worse than an empty row. */
    for (const k of ['y', 'k', 's', 'x', 'p']) {
      assert.equal(p[k], null, `${p.v} carries a ${k} the Pleistocene record cannot supply`);
    }
    assert.equal(p.q, 0, `${p.v} claims confirmed Holocene eruptions`);
    assert.ok(d, `${p.v} has no detail entry`);
    assert.deepEqual(d.er.length, 0, `${p.v} carries eruption rows it has no source for`);
    assert.equal(d.ev, null, `${p.v} carries an inclusion basis the Pleistocene record does not have`);
    assert.equal(d.ph, null, `${p.v} carries a photo the Pleistocene record does not have`);
    assert.equal(d.p.filter((x) => x != null).length, 0, `${p.v} carries population figures`);
    assert.ok(d.g && d.g.length > 40, `${p.v} has no geological summary`);
    assert.ok(EPOCH.includes(epochOf(p.v)), `${p.v} has an epoch outside the vocabulary`);
  }
});

/* ══ ⚠⚠⚠ ③ THE SHIPPED MODULE, RUN ═══════════════════════════════════════════════════════════
   Everything above reads files. The defect was in a coercion — `+r.vnum` on a row whose vnum is
   null — and a spelling check cannot see a coercion, so this boots js/volcano-intel.js in a sandbox
   with a stub `fetch` that serves USGS-shaped rows and asks the real `statusIndex()` what it made
   of them. The rows below are the shapes the live feed actually carries (measured 2026-08-25),
   not a paraphrase of them. */
function boot(usgsMonRows, elevatedRows) {
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Map, Set, Array, Object, String,
    Number, isFinite, URL, AbortController,
  });
  ctx.window = ctx;
  ctx.document = { baseURI: 'https://example.invalid/' };
  const pick = () => {
    const fn = function () { return arguments[0] == null ? '' : String(arguments[0]); };
    fn.arr = (a) => (Array.isArray(a) ? fn.apply(null, a) : (a == null ? '' : String(a)));
    return fn;
  };
  ctx.IntMapLang = { pick, pickArgs: () => function () { return Array.prototype.slice.call(arguments); },
    locale: () => 'en-GB' };
  ctx.IntMapSafe = { html: (v) => String(v) };
  ctx.__imVolcLayer = { data: () => LAYER, count: () => LAYER.features.length };
  const answer = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  ctx.fetch = (url) => {
    const u = String(url);
    if (u.includes('getMonitoredVolcanoes')) return answer(usgsMonRows);
    if (u.includes('getElevatedVolcanoes')) return answer(elevatedRows || []);
    if (u.includes('getVonasWithinLastYear')) return answer([]);
    if (u.includes('jma.go.jp')) return answer([]);
    return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) });
  };
  vm.runInContext(asClassicScript(rd('js/volcano-intel.js')), ctx);
  return ctx.window.IntMapModules.volcanoIntel({ lang: 'en' });
}

/* the two AVO/CVO bulletins, AVO's Korovin, GVP's Atka, and Yellowstone — the shapes measured live */
const BULLETIN_AVO = { volcano_name: 'Alaskan Volcanoes', vnum: null, alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1282336788 };
const BULLETIN_CVO = { volcano_name: 'Cascade Range', vnum: null, alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Cascades Volcano Observatory', sent_unixtime: 1787355763 };
const ATKA = { volcano_name: 'Atka volcanic complex', vnum: '311160', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1784664522 };
const KOROVIN = { volcano_name: 'Korovin', vnum: '311161', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Alaska Volcano Observatory', sent_unixtime: 1607113755 };
const YELLOWSTONE = { volcano_name: 'Yellowstone', vnum: '325010', alert_level: 'NORMAL', color_code: 'GREEN', obs_fullname: 'Yellowstone Volcano Observatory', sent_unixtime: 1785596723 };
const keys = (idx) => [...idx.keys()].sort((a, b) => a - b).join(',');

test('③ a row that names no volcano makes no key, and AVO’s number lands on the Smithsonian’s volcano', async () => {
  const V = boot([BULLETIN_AVO, BULLETIN_CVO, ATKA, KOROVIN, YELLOWSTONE]);
  await V.warm();
  const idx = V.statusIndex();

  /* ⚠ `+null` IS 0. Before this, five rows produced five keys and one of them was a volcano numbered
     zero — a key the catalog can never hold, and the sixth of the six that broke the live spec. */
  assert.equal(idx.has(0), false, 'a row with vnum: null became volcano number 0');
  assert.equal(keys(idx), '311160,325010', 'the index is not exactly the two volcanoes named');

  /* every key the ladder produced is a volcano this map can draw — the claim the live spec makes
     against the real feed, made here against the shapes that used to break it */
  const have = new Set(LAYER.features.map((f) => f.properties.v));
  for (const v of idx.keys()) assert.ok(have.has(v), `the ladder named ${v}, which the catalog does not have`);

  /* Yellowstone is IN the catalog now, and its rung is a statement rather than silence */
  const y = idx.get(325010);
  assert.equal(y.tier, 1, 'Yellowstone did not reach the United States rung');
  assert.equal(y.rank, 0, 'GREEN/NORMAL is rank 0 — «an observatory looked», not «nothing published»');
  assert.ok(y.source, 'a rung reported without naming its source');

  /* the monitored/unmonitored distinction follows the same correspondence: 311161 is not a GVP
     number, so nothing may claim USGS monitors it under that number */
  assert.equal(V.usgsMonitors(311160), true, 'Atka is monitored and the map does not know it');
  assert.equal(V.usgsMonitors(311161), false, 'AVO’s own number leaked out as a GVP number');
  assert.equal(V.usgsMonitors(0), false, 'volcano number 0 is monitored');
});

test('③b when two USGS rows share one GVP dot, the more severe one is the answer', async () => {
  /* Atka is watched as two units — the complex (ak17) and Korovin (ak171) — and the map has one dot
     for both. Returning whichever came first in the array would let an ORANGE cone hide behind a
     GREEN complex, which is a defect the reconciliation would otherwise have introduced. */
  const loud = { ...KOROVIN, alert_level: 'WATCH', color_code: 'ORANGE', sent_unixtime: 1800000000 };
  const V = boot([ATKA, loud]);
  await V.warm();
  const st = V.statusIndex().get(311160);
  assert.equal(st.rank, 3, 'the quiet row won: ' + JSON.stringify({ label: st.label, unit: st.unit }));
  assert.equal(st.unit, 'Korovin', 'the severe row’s own unit name is not what the card would print');

  /* …and the order in the array does not decide it */
  const W = boot([loud, ATKA]);
  await W.warm();
  assert.equal(W.statusIndex().get(311160).rank, 3, 'the answer depends on the order USGS listed them');
});

test('④ the build derives the second set from the feed and keeps ONE copy of the correspondence', () => {
  const b = code('scripts/build-volcanoes.mjs');
  assert.match(b, /getMonitoredVolcanoes/, 'the build does not read the monitored roster');
  assert.match(b, /Smithsonian_VOTW_Pleistocene_Volcanoes/, 'the build cannot reach the Pleistocene catalog');
  assert.match(b, /holocene:\s*V\.features\.length/, 'the build does not record what the Holocene half is');
  /* ⚠ LOUD, NOT SILENT: a monitored number GVP holds under neither catalog must stop the build. If
     it were dropped, the map would be back where this round found it — a status fetched and thrown
     away — and nothing would say so. */
  assert.match(b, /throw new Error\(`USGS monitors/, 'the build drops what it cannot place');
  /* the correspondence is read out of the running module, not copied into the build */
  assert.match(b, /volcano-intel\.js'\)/, 'the build does not read js/volcano-intel.js');
  assert.match(b, /USGS_TO_GVP/, 'the build does not look for the correspondence');
  const intel = code('js/volcano-intel.js');
  const m = /const\s+USGS_TO_GVP\s*=\s*\{([\s\S]*?)\}/.exec(intel);
  assert.ok(m, 'js/volcano-intel.js no longer declares USGS_TO_GVP — the build throws on this exact shape');
  assert.ok([...m[1].matchAll(/(\d+)\s*:\s*(\d+)/g)].length > 0, 'the correspondence parsed empty');
  /* and it is declared in exactly one place */
  assert.equal(/USGS_TO_GVP\s*=/.test(code('scripts/build-volcanoes.mjs')), false,
    'the build keeps its own copy of the correspondence');
});

test('⑤ the live spec watches every feed the module has', async () => {
  const V = boot([ATKA]);
  await V.warm();
  const declared = Object.keys(V.feeds());
  assert.ok(declared.length >= 5, 'the module lost a feed: ' + declared.join(', '));
  const spec = rd('tests/r353-live.spec.js');
  const loop = /for \(const k of \[([^\]]+)\]\)/.exec(spec);
  assert.ok(loop, 'tests/r353-live.spec.js no longer has a settle loop to check');
  const watched = [...loop[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  /* ⚠⚠⚠ DERIVED FROM THE MODULE, NOT FROM A LIST HERE. The loop named four feeds for 37 rounds
     after #R395 made it five, and the one it did not name is the one that produced every unplaced
     volcano. A hand-kept list cannot say what it is missing (#R335). */
  for (const k of declared) {
    assert.ok(watched.includes(k), `the live spec never checks that «${k}» settled`);
  }
});

/* ⚠ (#R432) ADDING A DOT CAN MAKE ANOTHER ANSWER WRONG. «Long Valley Volcanic Region» was placed on
   Mono-Inyo Craters because GVP's own «Long Valley» was not in this catalog. It is now — and if the
   zone stayed on one dot, the other would print «no hazard-zone GIS is published» about a zone USGS
   publishes under that exact name. The polygons cover both, so the entry names both. */
test('⑦ a USGS hazard zone can name more than one GVP volcano, and the lookup honours it', () => {
  const src = code('js/volcano-layers.js');
  const block = /const HAZ_TO_GVP=\{([\s\S]*?)\};/.exec(src);
  assert.ok(block, 'js/volcano-layers.js no longer declares HAZ_TO_GVP');
  const lv = /'Long Valley Volcanic Region':(\[[^\]]*\]|\d+)/.exec(block[1]);
  assert.ok(lv, 'the Long Valley zone is gone from the table');
  const nums = [...lv[1].matchAll(/\d+/g)].map((m) => +m[0]);
  const have = new Set(LAYER.features.map((f) => f.properties.v));
  assert.ok(nums.includes(323822) && nums.includes(323120),
    'the zone names ' + nums.join(', ') + ' — it covers the caldera (323822) and Mono-Inyo (323120)');
  for (const n of nums) assert.ok(have.has(n), `the zone names ${n}, which the catalog does not have`);
  /* …and the lookup reads a list, not a single number — otherwise the table would say two and the
     card would still answer for one */
  assert.match(src, /\[\]\.concat\(HAZ_TO_GVP\[k\]\)/, 'hazardFor still compares against one number');
});

test('⑥ no shipped string calls the bundle the Holocene catalog, and the card asks the epoch', () => {
  const beta = code('js/beta-overlays.js');
  assert.equal(/GVP Holocene/.test(beta), false, 'the layer label still names the epoch');
  assert.equal(/full Holocene catalog/.test(beta), false, 'the layer row still says «full Holocene catalog»');
  assert.equal(/in the Holocene catalog\./.test(code('js/atlas-controls.js')), false,
    'Atlas still tells the reader the miss means «not in the Holocene catalog»');
  /* the legend states the composition, and both halves come out of the file */
  assert.match(beta, /volcFC\.holocene/, 'the legend does not read the Holocene count from the file');
  assert.match(beta, /\{h\}[\s\S]{0,400}\{m\}/, 'the composition is not one string with placeholders (#R355)');
  /* ⚠ THE «no dated eruption» HINT ASSERTED THE HOLOCENE CATALOG AS THE REASON. For Yellowstone that
     is the wrong reason for an empty record, and it is the one field the reader is looking at. */
  const intel = code('js/volcano-intel.js');
  assert.match(intel, /epochName\s*&&\s*epochName\s*!==\s*'Holocene'/,
    'the empty-record hint does not branch on the epoch');
  assert.match(intel, /'Pleistocene'\s*:\s*LA\(/, 'the epoch vocabulary has no Pleistocene row');
});
