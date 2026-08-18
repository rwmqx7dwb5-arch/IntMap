/* ============================================================================
 *  IntMap · #R254 source checks
 * ----------------------------------------------------------------------------
 *  Eleven reports. Each check is written as «the defect cannot come back», not «the fix is still
 *  typed here», wherever the difference is expressible in the source.
 *
 *  ① the population bar has NO UI of its own — no indeterminate class, no sweep, and the
 *     percentage is never blanked; the fraction that makes that possible is real, because every
 *     WorldPop sum is tiled;
 *  ② every country choropleth asks for the 10 m outline, not only the Countries tab;
 *  ③ the World-Bank choropleth family prints a colour scale, generated from its own ramp;
 *  ④ a GIBS layer with no time dimension is not given a date;
 *  ⑤ the trade arrowheads are registered through `scene`, and the country pins are gone, and the
 *     arrows have a switch;
 *  ⑥ the crop raster cannot lose a move that arrives during a fetch, and does not encode a
 *     650 kB data: URL on the main thread, and has no emoji;
 *  ⑦ "Others" is a real category holding the sixty-one World-Bank rows, "Beta" means beta, and the
 *     energy-mix row is promoted;
 *  ⑧ the panel under the pointer is NAMED, so a popup with no z-index of its own can come forward;
 *  ⑨ a fine place name that Nominatim's search cannot surface is asked of OpenStreetMap itself;
 *  ⑩ the data-center layer is its own module, with sources, and nothing invents a number;
 *  ⑪ the new data sources are declared on the Sources page.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught ten rounds writing a check that trips on its own
 *  explanation of the defect, and this round's own notes quote `.tp-prog.indet`, `wp-trade-pt`,
 *  `toDataURL` and `layers.hasImage` in prose.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① THE BAR LOOKS LIKE EVERY OTHER BAR ────────────────────────────────────────────────────── */
test('#R254 ① the population progress bar has no UI of its own, because its fraction is real', () => {
  const css = code(read('css/intmap.css'));
  assert.doesNotMatch(css, /\.tp-prog\.indet/, 'the indeterminate rule is back — this bar must look like every other bar');
  assert.doesNotMatch(css, /@keyframes\s+imProgSweep/, 'the sweep keyframes are back');
  assert.doesNotMatch(css, /--prog-sweep\s*:/, 'the sweep token is back; there is one progress-bar token because there is one bar');
  assert.match(css, /--prog-grad\s*:\s*var\(--primary-color\)/, 'the accent token every bar fills with is gone');

  const ob = code(read('js/onboarding.js'));
  assert.doesNotMatch(ob, /classList\.(add|remove)\('indet'\)/, 'the controller still toggles an indeterminate class');
  /* `busy()` is «nothing has finished yet» = 0 %, never a blank percentage */
  const busy = /busy\(\)\{([^}]*)\}/.exec(ob);
  assert.ok(busy, 'the controller no longer has a busy() — re-derive this check against whatever replaced it');
  assert.doesNotMatch(busy[1], /textContent\s*=\s*''/, 'busy() blanks the percentage again — that is what made the bar unreadable');

  /* THE REASON IT CAN BE DETERMINATE: every sum is tiled, so `done/total` exists for any area */
  const sims = code(read('js/sims.js'));
  assert.doesNotMatch(sims, /areaKm2\s*>\s*95000/,
    'the single-request branch is back — a sub-cap sum has no fraction, and the bar would need a fake one again');
  assert.match(sims, /Math\.sqrt\(\s*wSpan\s*\*\s*hSpan\s*\/\s*4\s*\)/,
    'the cell side is no longer capped to about a 2×2 grid, so a small area is one request and reports nothing');
});

/* ── ② THE BORDERS EVERY COUNTRY LAYER DRAWS ─────────────────────────────────────────────────── */
test('#R254 ② a country choropleth gets the 10 m outline without the Countries tab', () => {
  const dl = code(read('js/data-layers.js'));
  const w = /function withCountries\(cb\)\{([\s\S]*?)\n    \}/.exec(dl);
  assert.ok(w, 'withCountries is gone — re-derive this check against whatever gates the choropleths now');
  assert.match(w[1], /_imFlushCountryGeo\(true\)/,
    'withCountries does not force the fine geometry — every dl-* choropleth paints the 110 m stand-in');
  /* setSourceData clears feature state, so a LATE flush has to repaint */
  assert.match(dl, /_hiResCountries[\s\S]{0,600}_imReapplyChoros/,
    'a flush that lands after the colours are on does not repaint them — the layer would go blank');

  /* the World-Bank family builds its OWN copy of the borders and must follow the upgrade */
  const lp = code(read('js/layer-packs.js'));
  assert.match(lp, /geoOf\(\)\s*!==\s*usedGeo/,
    'wbToggle does not watch for the 10 m replacement — whichever outline was current at toggle time is kept for the session');
});

/* ── ③ THE LEGEND THAT WAS A BOX WITH NOTHING IN IT ──────────────────────────────────────────── */
test('#R254 ③ the World-Bank choropleths print a colour scale, built from their own ramp', () => {
  const lp = code(read('js/layer-packs.js'));
  assert.match(lp, /function rampKey\(\)/, 'the ramp key is gone — the legend is a title and a slider again');
  /* it must READ W.ramp, not carry a second table of colours */
  const rk = /function rampKey\(\)\{([\s\S]*?)\n      \}/.exec(lp);
  assert.ok(rk, 'rampKey changed shape');
  assert.match(rk[1], /W\.ramp\[i\]/, 'the scale is not derived from the layer ramp — the two can drift apart');
  assert.doesNotMatch(rk[1], /linear-gradient\(90deg,\s*#/, 'the gradient is built from typed colours instead of the layer ramp');
  assert.match(lp, /querySelector\('\.wb-key'\)/, 'the legend does not attach the key');
});

/* ── ④ THE PREVIEW THAT 403'd ────────────────────────────────────────────────────────────────── */
test('#R254 ④ a GIBS layer with no time dimension is not handed a date', () => {
  const lpv = code(read('js/layer-previews.js'));
  assert.match(lpv, /\(date\?\(date\+'\/'\):''\)/, 'the date segment is unconditional again — a static product 403s');
  const row = /'dl-popgrid':G\(([^)]*)\)/.exec(lpv);
  assert.ok(row, 'the population-density preview row is gone');
  assert.doesNotMatch(row[1], /\d{4}-\d{2}-\d{2}/, 'the population-density preview asks for a date again — GPW is static and answers 403');
});

/* ── ⑤ THE TRADE LAYER ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑤ the trade arrowheads exist, the pins do not, and the arrows have a switch', () => {
  const wp = code(read('js/world-packs.js'));
  /* the sprite atlas is `scene`, not `layers` — `layers.hasImage` is undefined and throws into a catch */
  assert.doesNotMatch(wp, /layers\.(has|add)Image\(/,
    'the arrow images are registered through layers.* again; that method does not exist, so the icons are never added');
  const ea = /function ensureArrows\(\)\{([\s\S]*?)\n      \}/.exec(wp);
  assert.ok(ea, 'ensureArrows is gone — re-derive this check against whatever registers the icons now');
  assert.match(ea[1], /scene\.hasImage\(/, 'the arrowheads are not asked of the scene');
  assert.match(ea[1], /scene\.addImage\(/, 'the arrowheads are not registered on the scene');

  assert.doesNotMatch(wp, /id:'wp-trade-pt'/, 'the country pins are back');
  assert.doesNotMatch(wp, /LYR=\[[^\]]*wp-trade-pt/, 'the pin layer is back in the visibility list');
  /* the name labels stay — the reader asked for the markers to go, not the names */
  assert.match(wp, /id:'wp-trade-lbl'/, 'the partner name labels were removed too; the instruction was about the pins');

  assert.match(wp, /class="wp-arr"/, 'the arrow switch is gone from the panel');
  assert.match(wp, /function applyVis\(\)/, 'nothing separates the arrow visibility from the rest of the layer');
  /* ⚠ (#R255) …AND SO DOES THE TERMINAL HEAD. #R254's arrowheads really were registered and really
     were drawn, and were still invisible — measured this round: a ≤10 px head in the LINE'S OWN
     COLOUR on a line up to 13 px wide. So the head is sized from the shaft now and every arc ends in
     one big head at its destination. Both symbol layers must follow the 「矢印の有無」 switch, which
     is what this assertion has always been for. */
  /* ⚠ (#R258) 「矢印だけオンオフしてどないすんねん線もやろがい。」 — the switch took the heads off and
     left the shafts standing, which is a picture of flows with no direction in it. It is over the
     WHOLE arrow now (shaft, head and the partner's name), which is what this assertion is for. */
  assert.match(wp, /function applyVis\(\)\{ setVis\(LYR,on&&arrows\); \}/, 'the arrow layers no longer follow the switch');
});

/* ── ⑥ THE CROP RASTER ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑥ a move during a crop fetch is not lost, the encode is a blob, and there is no emoji', () => {
  const wp = code(read('js/world-packs.js'));
  /* ══ ⚠⚠ (#R255) THE DEFECT THIS PINNED IS GONE WITH THE MECHANISM THAT COULD HAVE IT ═════════════
     #R254 measured a view-change dropped during a fetch and made the layer REMEMBER it (`_dirty`).
     That was the right fix for a layer that re-fetches ONE IMAGE PER VIEW. This round the reader
     reported the same layer going black and drawing at the wrong scale on every pan, and the cause
     was that shape itself: a single image source stretched over whichever cell was last fetched
     (measured — mean luminance 8.3 immediately after a wheel-zoom, correct only ~10 s later). It is
     a raster TILE source now, so there is no per-view fetch for a move to be lost during, and
     asserting `_dirty` still exists would pin the compensation and forbid the cure.
     What must not come back is the per-view image, and that is asserted directly — here, and in
     tests/r255-checks ②. */
  const cropsBlock = wp.slice(wp.indexOf('(function crops()'));
  assert.ok(cropsBlock.length > 1000, 'the crops block could not be located');
  assert.ok(!/type:'image',url/.test(cropsBlock),
    'the crop layer is a single stretched image again — see #R255 ② for what that looked like');

  assert.match(wp, /cv\.toBlob\(|_toBlob=/, 'the recolour encodes a data: URL on the main thread again (measured at 654,722 chars)');

  /* the emoji: the crop panel title and its legend name */
  const cropBlock = wp.slice(wp.indexOf("makePanel('wp-crop-panel'"), wp.indexOf("makePanel('wp-crop-panel'") + 400);
  assert.doesNotMatch(cropBlock, /🌾/, 'the crop panel has an emoji in its title again');
  assert.doesNotMatch(read('js/world-packs.js').slice(
    read('js/world-packs.js').indexOf("makePanel('wp-crop-panel'"),
    read('js/world-packs.js').indexOf("makePanel('wp-crop-panel'") + 700), /🌾\s*Crop cultivation/,
    'the crop legend name has an emoji again');
});

/* ── ⑦ THE TAXONOMY ──────────────────────────────────────────────────────────────────────────── */
test('#R254 ⑦ Others is a real category, Beta means beta, and energy mix is promoted', () => {
  const dl = code(read('js/data-layers.js'));
  const g = /\['lyrGrpOthersReal',\[([^\]]*)\]\]/.exec(dl);
  assert.ok(g, 'the Others group is gone');
  const ids = g[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  /* ⚠ (#R255) THIS WAS `assert.equal(ids.length, 61)`, AND THAT MADE THE NEXT INSTRUCTION LOOK LIKE
     A REGRESSION — the same trap #R254 itself removed from tests/r233 ⑤. 「政治、軍事、医療・衛生、
     IT・テックレイヤーカテゴリを追加し、レイヤーの再編や追加を行うように」 moved twenty-eight of the
     sixty-one World-Bank rows out of «Others» and into the four new categories, which is exactly
     what «Others» is for: the indicators that have no better shelf. So the assertion is now the
     PROPERTY #R254 was really asserting — Others holds World-Bank indicator rows and only those —
     plus a floor, so the group cannot be quietly emptied out. */
  /* ⚠⚠ (#R261) …AND THE FLOOR HAD TO GO, FOR THE SECOND TIME, FOR THE SAME REASON. #R255 already
     replaced «exactly 61» with «at least 25» after an instruction legitimately moved rows out; this
     round 「Others, Betaも含め既存レイヤーの再編」 named that shelf and moved ALL of them into named
     families (経済・貿易 / 社会・教育 / エネルギー・資源 / 気候 / 農業・食料). A count floor on a shelf
     whose whole purpose is «what is left over» will keep turning the next instruction into a red
     test — the thing worth asserting is not how full it is, it is that NOTHING WAS LOST.
     So: every id #R254 listed is still somewhere in GROUPS, and Others still holds only World-Bank
     rows if it holds any. */
  assert.ok(ids.every(i => /^wb/.test(i)), 'Others holds something that is not a World-Bank indicator row');
  const R254_OTHERS = ['wburb','wbelec','wbrenew','wbinfl','wbgdpgrow','wblit','wbpov','wbgini','wbtrade',
    'wbtax','wbschool','wbelecuse','wbrenelec','wbfdi','wbunemp','wbdebt','wbmanuf','wbpopgrow','wbenergy',
    'wbtour','wbref','wbco2t','wbflfp','wbtert','wbrural','wbgni','wbaging','wburban','wbtourism','wbremit',
    'wbdensity','wbedu','wbagremp'];
  const groups = dl.slice(dl.indexOf('const GROUPS=['), dl.indexOf("const OTHERS_IDS="));
  R254_OTHERS.forEach(k => assert.ok(groups.includes("'" + k + "'"),
    k + ' left Others and is on NO shelf — #R254 listed it and nothing may be lost'));
  /* the World-Bank rows that are NOT in Others are the ones filed in a real group */
  ['wbco2', 'wbforest', 'wbagri', 'wbhealth', 'wbnet', 'wbmilgdp', 'wbwomparl']
    .forEach(k => assert.ok(!ids.includes(k), `${k} is filed in a real group already and must not be duplicated into Others`));

  assert.match(dl, /\['lyrGrpDemo',\[[^\]]*'energy'/, 'the energy-mix row is not promoted into Population & economy');
  assert.match(dl, /getElementById\('wp-dl-'\+id\)/, 'rowFor cannot find a world-packs row, so the promotion resolves to nothing');

  /* every language says «beta» without «others», and every language has the new group */
  const LOCALES = ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans'];
  LOCALES.forEach(c => {
    const s = read(`js/locales/ui.${c}.js`);
    assert.match(s, /lyrGrpOthersReal["']?\s*:/, `ui.${c}.js has no label for the new Others group`);
    const beta = /["']?lyrGrpOthers["']?\s*:\s*"([^"]*)"/.exec(s);
    assert.ok(beta, `ui.${c}.js lost lyrGrpOthers`);
    assert.ok(!/other|weitere|autres|otras|прочее|기타|その他|其他/i.test(beta[1]),
      `ui.${c}.js still calls the beta group «${beta[1]}» — the instruction is that it is simply «beta»`);
  });
});

/* ── ⑧ WHO IS IN FRONT ───────────────────────────────────────────────────────────────────────── */
test('#R254 ⑧ the panel under the pointer is named, so a popup with no z-index can come forward', () => {
  const css = code(read('css/intmap.css'));
  const m = /\.im-front\{\s*z-index:(\d+)\s*!important/.exec(css);
  assert.ok(m, 'nothing raises the panel being used — a MapLibre popup has z-index:auto and can never beat the sidebar');
  const z = +m[1];
  assert.ok(z > 2600, `the raised panel is ${z}; the sidebar band is 2600 and would still cover it`);
  assert.ok(z < 9999, `the raised panel is ${z}; the modal overlay is 9999 and must stay on top`);
  { const at = css.indexOf('.im-front{'); const mq = css.lastIndexOf('@media(min-width:769px)', at);
    assert.ok(mq >= 0 && at - mq < 400,
      'the raise is not inside the desktop media block — on a phone the bottom sheet (1700) has to stay above the panel'); }

  const ui = code(read('js/map-ui.js'));
  assert.match(ui, /classList\.add\('im-front'\)/, 'nothing marks the panel');
  assert.match(ui, /querySelectorAll\('\.im-front'\)/, 'the previous panel is never un-marked — two panels would claim the front');
  assert.match(ui, /raise\(null\)/, 'a pointerdown in a sidebar does not drop the mark');
});

/* ── ⑨ THE FINE PLACE NAME ───────────────────────────────────────────────────────────────────── */
test('#R254 ⑨ a name the search cannot surface is asked of OpenStreetMap itself', () => {
  const mt = code(read('js/map-tools.js'));
  assert.match(mt, /async function _overpassArea\(/, 'the Overpass fallback is gone');
  assert.match(mt, /relation\["name"="/, 'the fallback does not look for a relation — a 丁目 boundary usually is one');
  assert.match(mt, /nominatim\.openstreetmap\.org\/lookup\?osm_ids=/,
    'the polygon is not fetched through the same geometry endpoint as every other outline');
  /* it must run ONLY after the tight search found nothing, or every click costs an Overpass query */
  const i = mt.indexOf('bounded=1'), j = mt.lastIndexOf('_overpassArea(q'), k = mt.indexOf('const d=8');
  assert.ok(i >= 0 && j > i && k > j, 'the Overpass pass is not between the tight search and the wide one');
});

/* ── ⑩ THE DATA-CENTER LAYER ─────────────────────────────────────────────────────────────────── */
test('#R254 ⑩ the data-center layer is its own module, sourced, and invents nothing', () => {
  const dc = read('js/datacenters.js');
  const dcc = code(dc);
  assert.match(dcc, /window\.IntMapDataCenters\s*=/, 'the module does not publish itself');

  /* the curated table: every row carries a source URL, and the count is worth stating */
  const rows = [...dcc.matchAll(/^\s{4}\[-?\d[\d.]*,\s*-?\d[\d.]*,'/gm)];
  assert.ok(rows.length >= 200, `the curated table has ${rows.length} rows; it replaced 73 and the instruction was 爆発的に`);
  const table = /const DC=\[([\s\S]*?)\n  \];/.exec(dcc);
  assert.ok(table, 'the curated table is gone');
  const lines = table[1].split('\n').filter(l => /^\s*\[-?\d/.test(l));
  lines.forEach(l => {
    assert.match(l, /(SRC_[A-Z0-9]+|'https?:\/\/[^']+')\]/, `a curated row has no source: ${l.trim().slice(0, 70)}`);
  });
  /* nothing may be filled in: capacity and year are null where unpublished, never a guess */
  assert.ok(lines.filter(l => /,null,/.test(l)).length > 100,
    'almost every row now carries a capacity — the sources do not publish one for most sites, so this would be invented');

  /* the other half — OpenStreetMap, raced mirrors, ODbL attribution */
  assert.match(dcc, /telecom"="data_center/, 'the OSM half is gone');
  assert.match(dcc, /overpass-api\.de[\s\S]{0,200}kumi\.systems/, 'the Overpass mirrors are not raced — one 504 would silence the layer');
  assert.match(dcc, /attribution:'[^']*OpenStreetMap[^']*ODbL/, 'the OSM half is not attributed');

  /* the click opens a real card, and every value is escaped */
  assert.match(dcc, /function openCard\(/, 'there is no detail card');
  assert.match(dcc, /onLayer\('click',PT/, 'the card is not wired to a click');
  assert.doesNotMatch(dcc, /innerHTML=[^;]*\$\{/, 'a template literal reaches innerHTML unescaped');

  /* the row in layer-packs delegates rather than keeping a second table */
  const lp = code(read('js/layer-packs.js'));
  assert.doesNotMatch(lp, /const DC=\[/, 'the old 73-entry table is back in layer-packs.js');
  assert.match(lp, /IntMapDataCenters/, 'the row does not delegate to the module');
  assert.match(lp, /DCM\.key\(\)/, 'the legend key is typed again instead of asked of the layer');

  /* it is loaded, and before the pack that delegates to it */
  /* ⚠ THE IMPORT AND THE CALL ARE IN DIFFERENT PLACES, ON PURPOSE. tests/r168 #8 budgets the shell
     (index.html + src/main.js + js/app-body.js + …) at 8,200 lines, and routing BOTH through it put
     it seven lines over — the tripwire doing its job. The dependency therefore sits beside its
     consumer (js/layer-packs.js, whose dcToggle delegates), and the factory CALL stays in
     js/app-body.js, where every factory call in this app is made and where tests/r168 #3 looks. */
  assert.match(code(read('js/layer-packs.js')), /^import '\.\/datacenters\.js';/m,
    'js/datacenters.js is not imported by the pack that delegates to it');
  assert.doesNotMatch(code(read('src/main.js')), /datacenters\.js/, 'the shell imports it again — that is what tripped the line budget');
  assert.match(code(read('js/app-body.js')), /IntMapModules\.dataCenters\(IM_HOST\)/, 'the module is never instantiated');
});

/* ── ⑪ THE SOURCES PAGE ──────────────────────────────────────────────────────────────────────── */
test('#R254 ⑪ the new data sources are declared', () => {
  const rd = read('js/reference-data.js');
  ['telecom%3Ddata_center', 'aws.amazon.com/about-aws/global-infrastructure', 'datacenters.microsoft.com',
    'cloud.google.com/about/locations', 'datacenters.atmeta.com', 'top500.org'].forEach(u => {
      assert.ok(rd.includes(u), `the Sources page does not declare ${u}`);
    });
});
