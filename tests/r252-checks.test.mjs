/* ============================================================================
 *  IntMap · #R252 source checks
 * ----------------------------------------------------------------------------
 *  Seven reports, seven properties. Each one is written as «the defect cannot come back», not
 *  «the fix is still typed here», wherever the difference is expressible.
 *
 *  ① the WorldPop progress bar is anchored to the ACTION ROW, never to a cell inside it;
 *  ② the Active-layers bar reads the layer sidebar's OWN background variable;
 *  ③ the place layer asks for the classes OpenMapTiles actually ships — `neighbourhood`, not
 *     `neighborhood` — and the three tiers it drew before are still ungated;
 *  ④ the place popup's heading and the place's IDENTITY are different arguments;
 *  ⑤ the admin-1 label is painted from js/border-style.js, not from a second copy of the colour;
 *  ⑥ the search-pill watcher re-runs when the right panel has FINISHED moving;
 *  ⑦ the CJK face is settable at runtime and something asks for it on every language change.
 *
 *  ⚠ Every assertion that matches on TEXT reads the source with COMMENTS STRIPPED —
 *  [[intmap-recurring-lessons]] E has caught nine rounds writing a check that trips on its own
 *  explanation of the defect. (This file's own prose names `neighborhood` and `--card-bg`.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① THE PROGRESS BAR IS NOT A GRID CELL ───────────────────────────────────────────────────── */
test('#R252 ① the WorldPop progress bar is inserted after the action ROW, not inside it', () => {
  const tp = code(read('js/tool-panel.js'));

  /* the anchor must be the container, with the button only as the fallback for panels that have none */
  assert.match(tp, /closest\('\.rad-actions'\)\s*\)\s*\|\|\s*pb2/,
    'the progress box is anchored to #tp-pop-btn again — .rad-actions is display:grid, so it becomes a cell');
  assert.doesNotMatch(tp, /pb2\.parentNode\.insertBefore\(box/,
    'the box is inserted into the button’s parent, which is the three-column grid');

  /* the shape that made it a cell is still true of the markup, so the property above is load-bearing */
  assert.match(tp, /<div class="rad-actions">.*id="tp-pop-btn"/s,
    '#tp-pop-btn is expected to live inside .rad-actions — if that changed, re-derive this check');
  assert.match(code(read('css/intmap.css')), /\.rad-actions\{[^}]*display:grid/,
    '.rad-actions is no longer a grid — the reason the anchor matters is gone, re-read this check');

  /* a reused box starts from zero rather than showing the previous run’s full bar */
  assert.match(tp, /f\.style\.width='0%'/, 'a re-shown progress box keeps the last run’s fill width');
});

/* ── ② ONE BACKGROUND, TWO ELEMENTS ──────────────────────────────────────────────────────────── */
test('#R252 ② the Active-layers bar reads the layer sidebar’s own background variable', () => {
  const mu = code(read('js/map-ui.js'));

  const panel = /#layer-sidebar-r\{background:var\((--[a-z-]+),var\((--[a-z-]+)\)\)/.exec(
    mu.replace(/[\s\S]*?body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) /, ''));
  assert.ok(panel, 'the solid-mode rule that paints #layer-sidebar-r was not found — re-derive this check');

  const bar = /#layer-sidebar-r #layer-active-section\{[^}]*background:var\((--[a-z-]+),var\((--[a-z-]+)\)\)/.exec(mu);
  assert.ok(bar, 'the Active-layers bar does not paint itself from a variable PAIR — it is a single colour again');
  assert.equal(bar[1], panel[1], 'the bar and the panel read different primary background variables');
  assert.equal(bar[2], panel[2], 'the bar and the panel read different fallback background variables');

  /* #R115: opaque in the frosted modes too — the fallback is what keeps that true */
  assert.equal(bar[2], '--card-bg', 'the frosted-mode fallback must stay the opaque card colour (#R115)');
});

/* ── ③ THE CLASSES THE TILES ACTUALLY SHIP ───────────────────────────────────────────────────── */
test('#R252 ③ ofm-other asks for the sub-municipal classes OpenMapTiles really has', () => {
  const pl = code(read('js/place-labels.js'));
  const filt = /id:'ofm-other'[\s\S]*?filter:\[([\s\S]*?)\],\s*\n\s*layout:/.exec(pl);
  assert.ok(filt, 'the ofm-other filter was not found — re-derive this check');
  const f = filt[1];

  for (const c of ['village', 'suburb', 'hamlet', 'borough', 'quarter', 'neighbourhood', 'isolated_dwelling', 'farm']) {
    assert.ok(f.includes(`'${c}'`), `ofm-other no longer admits the «${c}» class`);
  }
  /* ⚠ the US spelling is not a class in this schema and never matched anything */
  assert.doesNotMatch(f, /'neighbor(hood)'/,
    'the US spelling is back in the filter — OpenMapTiles ships «neighbourhood» and the other branch matches nothing');

  /* the three tiers that were already drawn stay ungated: their tier is 1 and the ladder starts at 1 */
  assert.match(pl, /\['village','suburb','hamlet'\],1,/,
    'the classes this layer has always drawn are no longer tier 1 — they would disappear below the new stops');
  assert.match(pl, /\['step',\['zoom'\],1, 13,2, 14,3\]/,
    'the class ladder changed shape — it must start at 1 so today’s labels are unaffected');

  /* ⚠ INTEGER STOPS: `['zoom']` in a FILTER is only re-evaluated at integer zooms (#R198) */
  const gate = /const OTHER_GATE=(.*)/.exec(pl);
  assert.ok(gate, 'OTHER_GATE not found');
  for (const n of (gate[1].match(/\b\d+(\.\d+)?\b/g) || [])) {
    assert.ok(!n.includes('.'), `the class ladder has a fractional zoom stop (${n}) — a filter only sees integers`);
  }

  /* collision has to be resolved by tier, or 452 neighbourhoods in one Osaka tile win over the ward */
  assert.match(pl, /'symbol-sort-key':\['\+',\['\*',OTHER_TIER,1000\]/,
    'ofm-other has no tier-first sort key — the finest tier would out-compete the coarse one at random');
});

/* ── ④ THE HEADING IS NOT THE IDENTITY ───────────────────────────────────────────────────────── */
test('#R252 ④ the place popup shows both names, and still queries by the local one', () => {
  const mu = code(read('js/map-ui.js'));

  assert.match(mu, /safe=String\(opts\.title\|\|name\)/,
    'the popup heading is not taken from opts.title — the two-name caption cannot appear');
  /* …and everything that IDENTIFIES the place still uses `name`: a caption is not a query */
  assert.match(mu, /navigator\.clipboard\.writeText\(name\)/, 'Copy must write the place name, not the caption');
  assert.match(mu, /const wtitle=\(opts&&opts\.wiki\)\|\|name/, 'the Wikipedia probe must use the place name');
  assert.match(mu, /IntMapOutline\.show\(name,/, 'the boundary lookup must use the place name');

  /* the second name is resolved from the renderer’s own key list, never from a copy of it */
  assert.match(mu, /window\.IntMapOsmNameKeys&&window\.IntMapOsmNameKeys\(HOST\.lang\)/,
    'js/map-ui.js resolves the displayed name from its own list of languages instead of the exported one');
  assert.match(mu, /if\(local&&shown&&shown!==local\) return local\+' \('\+shown\+'\)'/,
    'the two names are printed even when they are the same string');
  /* ⚠ ALL THREE ROUTES INTO THE POPUP CARRY IT. #R210 records that the padded tap is a second door
     into the same popup and #R201 that admin-1 came in through a third; a caption on one of them is
     a caption a reader sees only sometimes. */
  assert.match(mu, /showPopup\(labelAnchor\(f,e\),name,isCountry,\{title:_bothNames\(p,name\)\}\)/,
    'the label click (ofm-country / admin1 / city / other) lost the two-name caption');
  assert.match(mu, /showPopup\(labelAnchor\(f,e\),name,false,\{noOutline:true,noAreaTools:true,title:both\}\)/,
    'the water / river / peak label lost the two-name caption');
  assert.match(mu, /showPopup\(labelAnchor\(near\[0\],e\),nm,lid==='ofm-country',geoLbl\?\{noOutline:true,noAreaTools:true,title:ttl\}:\{title:ttl\}\)/,
    'the padded (finger) tap lost the two-name caption');

  /* the exported key list is published before any label exists, not as a side effect of the sea gazetteer */
  assert.match(code(read('js/place-labels.js')), /function ensurePlaceLabels\(\)\{[\s\S]{0,400}?window\.IntMapOsmNameKeys=OSM_NAME_KEYS/,
    'OSM_NAME_KEYS is not published from ensurePlaceLabels — js/map-ui.js would fall back to English keys');
});

/* ── ⑤ ONE COLOUR FOR THE REGION AND ITS NAME ────────────────────────────────────────────────── */
test('#R252 ⑤ the admin-1 label is painted from js/border-style.js, not from a second copy', () => {
  const pl = code(read('js/place-labels.js'));
  assert.match(pl, /const A1_TEXT=\(\)=>\{[^}]*window\.IntMapBorderStyle\.admin1/,
    'the admin-1 label colour is not read from the border-style module');
  assert.match(pl, /'text-color':A1_TEXT\(\)/, 'the declared ofm-admin1 paint is not the border colour');
  assert.match(pl, /\(id==='ofm-admin1'\)\?A1_TEXT\(\)/,
    'applyLabelLang no longer repaints ofm-admin1 with the border colour — the light/dark pass would undo it');

  /* the colour lives in ONE place, and it is the same one the line reads */
  const bs = code(read('js/border-style.js'));
  const col = /ADMIN1_COLOR = '(#[0-9a-fA-F]{6})'/.exec(bs);
  assert.ok(col, 'ADMIN1_COLOR is no longer a literal in js/border-style.js — re-derive this check');
  assert.ok(code(read('js/app-body.js')).includes("'line-color':ADMIN1_COLOR"),
    'the province LINE stopped reading ADMIN1_COLOR — the label and the line could drift apart');
  /* the literal in place-labels is only the unreachable fallback, and it must agree with the real one */
  assert.ok(pl.includes(`'${col[1]}'`), `the fallback colour in js/place-labels.js disagrees with ADMIN1_COLOR (${col[1]})`);

  /* the halo carries that colour on BOTH basemaps — a light halo under #cba6f7 is ~1.4:1 */
  assert.match(pl, /\(id==='ofm-admin1'\|\|lightText\)\?'rgba\(0,0,0,0\.9\)'/,
    'the admin-1 halo follows the light/dark rule again — the violet would vanish on a light basemap');
});

/* ── ⑥ THE PILL IS LAID OUT AGAINST A GEOMETRY THAT HAS STOPPED MOVING ───────────────────────── */
test('#R252 ⑥ the search-pill watcher re-runs when the right panel has finished moving', () => {
  const mo = code(read('js/mobile-ui.js'));
  assert.match(mo, /\['transitionend','transitioncancel'\]\.forEach\(ev=>hud\.addEventListener\(ev,\(e\)=>\{ if\(!e\|\|e\.propertyName==='right'\) upd\(\); \}\)\)/,
    'the watcher does not re-run on the HUD’s own transition — the one recomputation it gets reads the pre-slide geometry');
  /* the early recomputation is KEPT: it is what moves the pill at the start of the animation */
  assert.match(mo, /window\.addEventListener\('intmap-sidebar-resize',upd\)/,
    'the immediate recomputation was removed — the pill would not move until the animation ended');

  /* the property this hangs on is the one the stylesheet animates */
  assert.match(code(read('css/intmap.css')), /\.map-controls-top[^{]*\{ *transition:right \.38s/,
    'the right-anchored HUD no longer transitions `right` — re-derive which event says «it has landed»');
  /* …and js/map-ui.js still fires the early one from BOTH doors of the right panel (the third
     dispatch in that file belongs to the panel's own drag-resizer, which resizes nothing else) */
  const mu = code(read('js/map-ui.js'));
  for (const fn of [/function open\(\)\{[\s\S]*?new Event\('intmap-sidebar-resize'\)/,
                    /function close\(\)\{[\s\S]*?new Event\('intmap-sidebar-resize'\)/]) {
    assert.match(mu, fn, 'the layer sidebar’s open() and close() must both announce the change');
  }
});

/* ── ⑧ THE SEISMIC PANEL OPENS CLEAR OF THE TWO THINGS THAT LIVE THERE ───────────────────────── */
test('#R252 ⑧ the seismic panel’s default box clears the coord readout and the sidebar handle', () => {
  const sq = code(read('js/seismic.js'));
  const m = /left:'\+\(_wide\?(\d+):(\d+)\)\+'px;top:'\+\(_wide\?(\d+):(\d+)\)\+'px;width:min\(360px,94vw\);max-height:calc\(100dvh - '\+\(_wide\?(\d+):(\d+)\)\+'px\)/.exec(sq);
  assert.ok(m, 'the seismic panel’s default geometry is no longer the desktop/phone pair — re-derive this check');
  const [, dLeft, mLeft, dTop, mTop, dCap, mCap] = m.map(Number);

  /* the two obstacles, as MEASURED at 1100×800 with the left sidebar collapsed */
  const css = code(read('css/intmap.css'));
  assert.match(css, /\.sidebar\.collapsed ~ \.map-container \.btn-toggle-sidebar \{ left:0; \}/,
    'the collapsed sidebar handle no longer sits at x=0 — re-derive the clearance below');
  assert.match(css, /\.btn-toggle-sidebar\{[^}]*width:22px/, 'the sidebar handle is no longer 22 px wide');
  assert.match(css, /\.coord-readout\{[^}]*bottom:9px; left:9px/, 'the coord readout moved — re-derive the clearance below');

  assert.ok(dLeft > 22 + 8, `the panel opens at x=${dLeft}, over the 0–22 px sidebar handle`);
  /* bottom = top + (100dvh − cap) = 100dvh − (cap − top); the readout's top edge is 100dvh − 40 */
  assert.ok(dCap - dTop > 40 + 20,
    `the panel’s bottom edge lands ${dCap - dTop} px above the window foot — the readout occupies the last 40`);
  assert.ok(dLeft > mLeft && dTop < mTop, 'the desktop default did not move up and to the right');
  /* ⚠ phones keep the old numbers: 94vw + a 36 px shift would run off the right edge */
  assert.deepEqual([mLeft, mTop, mCap], [16, 80, 96], 'the phone default changed — nothing about the report is a phone');
});

/* ── ⑦ THE MAP’S CJK FACE FOLLOWS THE LANGUAGE ─────────────────────────────────────────────── */
test('#R252 ⑦ the local-ideograph family is settable at runtime and is set on every language change', () => {
  const ge = code(read('js/geo-engine.js'));
  assert.match(ge, /setCjkFontFamily\(fam\)\{/, 'the adapter cannot change the CJK face');
  assert.match(ge, /gm\.localIdeographFontFamily=fam/, 'the glyph manager’s family is not written');
  /* the re-rasterisation goes through the public API, which is what empties the TinySDF built from
     the OLD family and reloads every tile that depends on glyphs */
  assert.match(ge, /m\.setGlyphs\(u\)/, 'the glyph cache is not invalidated — the old face stays in the atlas');
  assert.match(ge, /gm\.localIdeographFontFamily===fam\|\|/,
    'the setter is not idempotent — the boot language would pay for a glyph reload');
  assert.match(ge, /setCjkFontFamily:f=>A\(\)\.setCjkFontFamily\?A\(\)\.setCjkFontFamily\(f\):false/,
    'the contract does not expose setCjkFontFamily — no module outside the adapter can reach it');

  const mt = code(read('js/map-typography.js'));
  assert.match(mt, /window\.addEventListener\('intmap-lang', syncCjkFamily\)/,
    'nothing asks the renderer to follow the language — the face stays the one the map was built with');
  assert.match(mt, /GE\.scene\.setCjkFontFamily\(cjkFamily\(\)\)/,
    'the sync does not hand over cjkFamily() — a second answer to «which face» would drift from css/fonts.css');
  /* and the family it hands over is still per-language */
  assert.match(mt, /if \(l === 'zh-hans'\) return sc/, 'cjkFamily() no longer puts the Simplified face first for zh-hans');
});
