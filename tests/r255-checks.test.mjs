/* ============================================================================
 *  #R255 — source-level checks
 * ----------------------------------------------------------------------------
 *  Each test pins the CAUSE this round measured, not the symptom, so the next
 *  round cannot re-introduce the same shape somewhere else and pass.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/* comments carry the reasoning and quote the very strings under test — strip them first */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/* ── ① the trade arrowhead is sized FROM the shaft, and there is a terminal head ─────────────── */
test('#R255 ① trade arrows: the head is derived from the line width and every arc ends in one', () => {
  const wp = code(read('js/world-packs.js'));
  /* the whole defect was a head sized independently of the line it sits on.
     ⚠ (#R258) renamed `arrowSize` → `headBasePx`/`headSize`, because the head's BASE is now the
     number that matters (the shaft is trimmed by its length). Still a function of `w`. */
  assert.match(wp, /const headBasePx=\(w\)=>Math\.max\(10,2\.8\*w\);/, 'the arrowhead size is no longer a function of the line width');
  assert.ok(!/asz:Math\.max\(0\.34,Math\.min\(0\.92,0\.30\+0\.62\*Math\.sqrt/.test(wp),
    'the old independent icon-size formula is back — a 10 px head on a 13 px line of the same colour is invisible');
  assert.match(wp, /kind:'tip'/, 'the terminal arrowhead feature is gone');
  assert.match(wp, /'wp-trade-tip'/, 'the terminal arrowhead layer is gone');
  /* it must follow the arrows toggle, not the layer */
  assert.match(wp, /function applyVis\(\)\{ setVis\(LYR,on&&arrows\); \}/,
    'the terminal head does not follow the 「矢印の有無」 toggle');
  /* ⚠⚠ (#R258) THE OUTLINE IS DELIBERATELY GONE. #R255 added it so a head could be told apart from a
     stroke of its own colour it was lying ON TOP OF. The round that followed says the head must not
     look pasted on — so the shaft now STOPS at the head's base (trimEnd) and there is nothing to
     separate it from: one colour, one opacity, one object. An outline would put the seam back. */
  assert.doesNotMatch(wp, /strokeStyle='rgba\(4,10,22,0\.85\)'/, 'the outline is back, and with it the pasted-on look');
  assert.match(wp, /'line-cap':'butt'/, 'the shaft no longer ends flat against the head');
});

/* ── ② the crop layer is a TILE source, not one stretched image ──────────────────────────────── */
test('#R255 ② crops: a raster tile source bounded by the data, not a per-view image', () => {
  const wp = code(read('js/world-packs.js'));
  assert.match(wp, /addProtocol\(CROP_PROTO/, 'the crop tile protocol is gone');
  assert.match(wp, /type:'raster',tiles,tileSize:TILE_N/, 'the crop layer is not a raster tile source any more');
  /* the shapes that produced the black screen must not come back */
  /* ⚠ scoped to the crops IIFE: the TIDES layer legitimately paints its flood as an image source of
     its own, with an `IMG` constant of its own, and an unscoped test would fail on that. */
  const crops = wp.slice(wp.indexOf('(function crops()'));
  assert.ok(crops.length > 1000, 'the crops block could not be located');
  assert.ok(!/updateImage\(IMG/.test(crops), 'the crop layer is back to a single image source');
  assert.ok(!/function _cellBox\(/.test(wp), 'the per-view quadtree cell is back — that is what got stretched');
  /* maxzoom is set by the 5-arcminute grid, and the tile cache is what keeps FAO cheap */
  assert.match(wp, /TILE_N=512, TILE_MAXZ=4/, 'the tile size / maxzoom pair changed without a note');
  assert.match(wp, /_inflight=new Map\(\)/, 'concurrent asks for the same tile are no longer coalesced (measured: 98 requests for 11 tiles)');
});

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

/* ── ④ front-most follows any operation, and never marks the map shell ───────────────────────── */
test('#R255 ④ the raise fires on wheel and focus too, and cannot lift the map container', () => {
  const mu = code(read('js/map-ui.js'));
  assert.match(mu, /addEventListener\('wheel'/, 'scrolling inside a panel does not raise it');
  assert.match(mu, /addEventListener\('focusin'/, 'typing inside a panel does not raise it');
  assert.match(mu, /_NOT_PANEL=/, 'the map shell is not excluded from panelOf');
  ['#map', '#map-container', '.operation-room'].forEach((sel) =>
    assert.ok(new RegExp(sel.replace('.', '\\.').replace('#', '#')).test(mu.match(/_NOT_PANEL='([^']*)'/)[1]),
      `${sel} is a positioned ancestor and would be marked .im-front — lifting the whole map over the sidebar`));
});

/* ── ⑤ both layer-search boxes have a clear button ───────────────────────────────────────────── */
test('#R255 ⑤ the clear button exists on BOTH search inputs', () => {
  assert.match(code(read('js/map-extras.js')), /class="ls-clear"/, 'the classic panel search has no clear button');
  const mu = code(read('js/map-ui.js'));
  assert.match(mu, /function wireSearchClear\(/, 'the tile grid search has no clear button');
  /* every mount calls it — the sidebar and the phone sheet (#R239: one of two copies is the trap) */
  assert.equal((mu.match(/wireSearchClear\(/g) || []).length, 3,
    'wireSearchClear is defined but not called from every host that has a search box');
});

/* ── ⑥ one night-sky entry, both views ───────────────────────────────────────────────────────── */
test('#R255 ⑥ the two night-sky menu items became one, and the in-panel switch stays', () => {
  const tp = code(read('js/tool-panel.js'));
  assert.equal((tp.match(/IntMapNightSky&&window\.IntMapNightSky\.open/g) || []).length, 1,
    'there is still more than one night-sky entry in the context menu');
  assert.ok(!/mode:'stand'/.test(tp), 'the standing view is still a separate menu item');
  /* nothing was removed: the panel's own dome/stand switch and the API are untouched */
  const ns = code(read('js/night-sky.js'));
  assert.match(ns, /class="ns-mode" data-m="dome"/, 'the dome/stand switch left the panel');
  assert.match(ns, /class="ns-mode" data-m="stand"/, 'the dome/stand switch left the panel');
  assert.match(ns, /setMode, mode: \(\) => mode/, 'IntMapNightSky.setMode is gone — Atlas and the tests drive the view through it');
});

/* ── ⑦ terrain & water ───────────────────────────────────────────────────────────────────────── */
test('#R255 ⑦a the sculptor never flies the camera to the water', () => {
  const tw = code(read('js/terrain-water.js'));
  const m = /async function rebuildAround\(lng,lat\)\{([\s\S]*?)\n    \}/.exec(tw);
  assert.ok(m, 'rebuildAround is gone');
  assert.ok(!/easeTo|flyTo|jumpTo/.test(m[1]), 'placing water still moves the view');
  assert.match(tw, /async function build\(opt\)/, 'build() cannot be aimed without moving the camera');
});

test('#R255 ⑦b one routing, used by the working grid AND by every downstream window', () => {
  const tw = code(read('js/terrain-water.js'));
  assert.match(tw, /function routeWater\(surf,NX,NY,cellM,own\)/, 'the routing was not factored out');
  assert.match(tw, /const R=routeWater\(surf,NX,NY,G\.cellM,own\)/, 'the working grid does not use the shared routing');
  assert.match(tw, /function windowRoute\(W,k0,inM3\)/, 'the downstream window does not route a volume');
  assert.match(tw, /return routeWater\(W\.surf,W\.n,W\.n,W\.spacingM,own\)/, 'the window is not routed by the shared function');
  /* the drainage-area sweep the downstream half used to run must be gone */
  assert.ok(!/acc=new Float32Array\(N\)\.fill\(1\)/.test(tw),
    'the unit-contribution accumulation is back — that is drainage AREA, not the water the reader placed');
  /* both call sites take the routing (the wide look-ahead is the one that is easy to miss) */
  assert.equal((tw.match(/channelChain\(/g) || []).length, 3,
    'channelChain has a call site that was not updated with its signature');
});

test('#R255 ⑦c deselecting 「ここに水」 does not stop or reset the clock', () => {
  const tw = code(read('js/terrain-water.js'));
  const m = /function setMode\(m\)\{([\s\S]*?)syncMode\(\);/.exec(tw);
  assert.ok(m, 'setMode is gone');
  assert.ok(!/pourStop\(\)/.test(m[1]), 'switching tools still stops the pour');
  /* ⚠ (#R265) The guard grew a condition — a ONE-SHOT volume also starts the clock now, and it must
     not reset a run that is already going. The property is the same one #R255 pinned: a source added
     to a simulation in progress joins it at the time it is at. */
  assert.match(tw, /if\(pourMode==='cont'&&!pourT\) pourSimS=0;/,
    'only a fresh continuous pour starts from zero — a second inlet joins the clock where it is');
});

test('#R255 ⑦d the panel has a scrolling body and a sticky footer, as SIBLINGS', () => {
  const tw = code(read('js/terrain-water.js'));
  assert.match(tw, /class="tw-body"[^>]*overflow-y:auto/, 'the panel body does not scroll');
  assert.match(tw, /class="tw-foot"[^>]*position:sticky/, 'the shared controls are not pinned');
  /* ⚠ (#R245) the footer must not be nested INSIDE the scroller — one stray </div> is the whole bug */
  const body = tw.indexOf(`class="tw-body"`), foot = tw.indexOf(`class="tw-foot"`);
  assert.ok(body > 0 && foot > body, 'the footer is not after the body');
  const between = tw.slice(body, foot);
  const opens = (between.match(/<div|<label|<details/g) || []).length;
  const closes = (between.match(/<\/div>|<\/label>|<\/details>/g) || []).length;
  assert.equal(opens, closes, 'the body block is not balanced — the sticky footer would be re-parented inside the scroller');
  /* the clock the reader asked to keep in view is written into .tw-stat, which lives in the footer */
  assert.ok(tw.indexOf('class="tw-stat"') > foot, 'the status line (which carries the elapsed clock) left the pinned footer');
});

test('#R255 ⑦e sculpting reaches the real elevation and the 3-D terrain', () => {
  const tw = code(read('js/terrain-water.js'));
  assert.match(tw, /window\.IntMapElevEdit=/, 'the elevation hook is not published');
  assert.match(tw, /function editDeltaAt\(lng,lat\)/, 'there is no geographic read of the sculpted delta');
  assert.match(tw, /addProtocol\(DEM_PROTO/, 'the sculpted DEM tiles are gone');
  /* ⚠ (#R258) the local was `id`; the source is created ONCE now and kept in `_demSrcId`, because a
     new source per edit re-attached the terrain and that is what reset the 3-D view on every brush
     stroke. What this test is about — the terrain really is pointed at the sculpted DEM — is
     unchanged; tests/r256 ④ pins the once-only part. */
  assert.match(tw, /GE\(\)\.scene\.setTerrain\(\{source:_demSrcId/, 'the 3-D terrain is never pointed at the sculpted DEM');
  /* every mutation marks it — hanging this off the UI handlers left Atlas's brush() out (measured) */
  assert.match(tw, /function editDirty\(\)\{ editStamp\+\+; terrainSoon\(\); \}/, 'the re-mesh is not driven from the one place the ground changes');
  /* and the readout family consults it through the single function they all call */
  const mr = code(read('js/map-readout.js'));
  assert.match(mr, /function _edited\(lng,lat,v\)/, 'js/map-readout.js does not consult the sculpted delta');
  assert.equal((mr.match(/_edited\(/g) || []).length, 3, 'one of demElevAt / demElevBilinear does not go through the hook');
});

/* ── ⑧ the four new categories, their rows, and the layers that fill them ────────────────────── */
test('#R255 ⑧ four new categories exist, are filled, and are named in all nine languages', () => {
  const dl = code(read('js/data-layers.js'));
  const KEYS = ['lyrGrpPolitics', 'lyrGrpSecurity', 'lyrGrpHealth', 'lyrGrpTech'];
  const seen = new Map();
  for (const k of KEYS) {
    const m = new RegExp(String.raw`\['` + k + String.raw`',\[([^\]]*)\]\]`).exec(dl);
    assert.ok(m, `${k} is not built from a list`);
    const ids = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
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
  /* rowFor must know the prefix those rows are created with, or they fall to the beta sweep */
  assert.match(dl, /getElementById\('fac-dl-'\+id\)/, "rowFor does not know the 'fac-dl-' prefix");

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
