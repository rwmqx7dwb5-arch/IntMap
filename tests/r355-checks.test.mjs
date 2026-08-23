/* ============================================================================
 *  R355 — the cable ROUTES changed; the cable GRAPHIC must not have
 * ----------------------------------------------------------------------------
 *  「経路精度を上げるために、見た目を勝手に作り直さないでください。」
 *
 *  This round replaces every metre of submarine-cable geometry and adds a click
 *  popup. The brief lists eighteen paint, layout and behaviour properties that
 *  must come out the other side untouched — and "I did not change it" is not a
 *  test. So ① freezes the three layers' declarations as EXACT SOURCE TEXT: any
 *  edit to a colour, a width, a blur, a radius, a stroke, a minzoom, the default
 *  opacity or the order the three are inserted in fails here, whoever makes it
 *  and whatever they meant.
 *
 *  ⚠ WHY SOURCE TEXT AND NOT A RENDERED SCREENSHOT. The geometry IS supposed to
 *  change this round, so a pixel comparison of the map cannot separate "the line
 *  goes somewhere else now" (wanted) from "the line is a different colour"
 *  (forbidden) — the brief's §17 says so in as many words. Style and geometry are
 *  checked apart: the style here, from the declaration; the geometry below, from
 *  the built dataset; and the two together in the browser (tests/r355.spec.js).
 *
 *  The rest checks the dataset the pipeline produced, not that the pipeline ran:
 *  every cable that existed still exists, every route is finite and on the
 *  planet, nothing breaks at the antimeridian, every quality is one of the three
 *  declared values, and the corridor-axis extractor is proved in BOTH directions
 *  — a real corridor comes out, a wide protection zone is refused.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { corridorAxes, axisFit, splitAntimeridian, unwrap, lineLength, haversine } from '../scripts/subcables/geo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(path.join(ROOT, p));
const DL = read('js/data-layers.js');

/* the whole `GE().layers.add({ … })` call that creates a layer, by its id */
function layerDecl(src, id) {
  const needle = "id:'" + id + "'";
  const at = src.indexOf(needle);
  assert.ok(at > 0, 'layer declaration for ' + id + ' not found in js/data-layers.js');
  const CALL = 'GE().layers.add(';
  const start = src.lastIndexOf(CALL, at);
  assert.ok(start > 0, 'no GE().layers.add( before ' + id);
  /* ⚠ the scan must start at the `(` of `.add(`, not at the first `(` in the
     slice — that one belongs to `GE()` and closes on the next character */
  let depth = 0, i = start + CALL.length - 1;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (!depth) break; }
  }
  return src.slice(start, i + 1).replace(/\s+/g, ' ');
}

/* ══ ① THE GRAPHIC, FROZEN ═════════════════════════════════════════════════ */
const FROZEN = {
  'lyr-subcables-glow': "GE().layers.add({id:'lyr-subcables-glow',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':3.2,'line-opacity':0.20,'line-blur':3}},beforeId)",
  'lyr-subcables': "GE().layers.add({id:'lyr-subcables',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':['interpolate',['linear'],['zoom'],0,0.6,4,1.1,8,2],'line-opacity':opacities.subcables}},beforeId)",
  'lyr-subcables-pts': "GE().layers.add({id:'lyr-subcables-pts',type:'circle',source:'src-subcables-lp',minzoom:3,layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,1.6,8,3.5],'circle-color':'#ffd23f','circle-stroke-color':'#1a1a1a','circle-stroke-width':0.6,'circle-opacity':0.9}},beforeId)",
};

test('① the three cable layers are declared exactly as they were', () => {
  for (const [id, frozen] of Object.entries(FROZEN)) {
    assert.equal(layerDecl(DL, id), frozen,
      'the ' + id + ' declaration changed. The brief\'s §2 forbids any change to the cable graphic — '
      + 'colour, width, opacity, blur, cap, join, radius, stroke, minzoom or z-order. '
      + 'If a change here is genuinely wanted, it is a separate, asked-for round.');
  }
});

test('① the three layers are inserted in the same order, at the same anchor', () => {
  const order = ['lyr-subcables-glow', 'lyr-subcables', 'lyr-subcables-pts']
    .map(id => DL.indexOf("id:'" + id + "'"));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'the insertion order of the cable layers changed (z-order)');
  for (const id of Object.keys(FROZEN)) assert.match(layerDecl(DL, id), /,beforeId\)$/, id + ' no longer goes in at `beforeId`');
});

test('① default opacity, default-ON state and the opacity control are unchanged', () => {
  assert.match(DL, /subcables:0\.95/, 'the cable layer\'s default opacity is no longer 0.95');
  assert.match(DL, /window\.IntMapDefaultLayers=\['dl-climate','dl-subcables'\];/, 'the cable layer is no longer default-ON');
  assert.match(DL, /else if\(id==='subcables'\)\{ if\(GE\(\)\.layers\.has\('lyr-subcables'\)\)GE\(\)\.layers\.setPaint\('lyr-subcables','line-opacity',v\); \}/,
    'the per-layer opacity control for the cables changed');
  assert.match(DL, /'dl-subcables':\['lyr-subcables','lyr-subcables-glow','lyr-subcables-pts'\]/,
    'the layer audit no longer knows all three cable sublayers');
  assert.match(DL, /\['lyrGrpTech',\['dc','subcables'/, 'the cable row moved out of Technology & infrastructure in the layer panel');
});

/* ══ ② THE POPUP MODULE TOUCHES NO PAINT ═══════════════════════════════════ */
test('② js/subcable-info.js never writes a paint or layout property', () => {
  const src = read('js/subcable-info.js');
  for (const forbidden of ['setPaint', 'setLayout', 'layers.add(', 'addSource', 'line-width', 'line-color', 'circle-radius', 'setPaintProperty']) {
    assert.ok(!src.includes(forbidden),
      'js/subcable-info.js contains `' + forbidden + '` — the info popup must not be able to reach the cable graphic (§2, §13)');
  }
  assert.ok(/queryRenderedFeatures\(box/.test(src), 'the hit test must use a BOX, not a point — that is how §13 is met without widening the line');
  assert.ok(/pointer: coarse/.test(src), 'the search radius must widen for a touch pointer (§13)');
});

/* ══ ② …AND IT NEVER LENDS ONE SEGMENT'S PROVENANCE TO ANOTHER ═════════════
   MEASURED ON PRODUCTION: a RECONSTRUCTED length of Havfrue/AEC-2 was captioned
   「経路の精度 再構築 / 経路の出典 NOAA Office for Coastal Management」. The cable
   does have a NOAA-surveyed stretch — elsewhere — and the row was borrowing it.
   Two true statements next to each other reading as one false one is precisely
   what §11 forbids. The cable-level list must carry its own label. */
test("② the popup never captions a reconstructed segment with another segment’s source", () => {
  const src = read('js/subcable-info.js');
  const i = src.indexOf('const srcName = SRC_NAME[props.src];');
  assert.ok(i > 0, 'the per-segment provenance lookup is gone');
  const block = src.slice(i, i + 500);
  assert.match(block, /if \(srcName\) body \+= row\(T\.routeSource\(\), esc\(srcName\)\);/,
    '"Route source" must name the provenance of the segment that was clicked');
  assert.match(block, /else if \(m && m\.sources/,
    'the cable-level list must be an ELSE — it may never stand under the same label');
  assert.match(block, /row\(T\.verifiedElsewhere\(\)/,
    'and it must use its own label');
  assert.ok(!/if \(names\.length && !srcName\) body \+= row\(T\.routeSource\(\)/.test(src),
    'the borrowed caption must be gone');
  /* the label exists in all five positional languages, and the audit covers the rest */
  assert.match(src, /verifiedElsewhere: \(\) => window\.IntMapLang\.t\(HOST\.lang, 'Surveyed sections', '[^']+', '[^']+', '[^']+', '[^']+'\)/,
    'the new label must be a five-argument call so the i18n audit can see it');
});

test('② the popup is dynamically imported, so it cannot enter the eager bundle', () => {
  assert.match(DL, /import\('\.\/subcable-info\.js'\)/, 'js/data-layers.js must reach the popup through a dynamic import');
  const main = read('src/main.js');
  assert.ok(!main.includes('subcable-info'), 'src/main.js must NOT import js/subcable-info.js — it would become eager weight for every session');
});

/* ══ ③ THE DATASET IS PREFERRED FROM THIS APP'S OWN ORIGIN ═════════════════ */
test('③ the local dataset is tried before any network source', () => {
  const at = (s) => { const i = DL.indexOf(s); assert.ok(i > 0, 'missing in js/data-layers.js: ' + s); return i; };
  const fn = DL.indexOf('async function fetchSubcables()');
  assert.ok(fn > 0);
  const body = DL.slice(fn, fn + 2600);
  const iLocal = body.indexOf('_cableLocal(CABLE_LOCAL_URL)');
  const iKept = body.indexOf('_cableCached(CABLE_LOCAL_URL)');
  const iTgCache = body.indexOf('_cableCached(CABLE_URL)');
  const iNet = body.indexOf('_cableNet(CABLE_URL)');
  assert.ok(iLocal > 0 && iKept > iLocal && iTgCache > iKept && iNet > iTgCache,
    'fetchSubcables must try: own origin → its kept copy → the kept TeleGeography copy → the relay chain, in that order (§3)');
  at('data/subcables.json'); at('data/subcables-lp.json');
  assert.match(DL, /if\(!j\|\|!Array\.isArray\(j\.features\)\|\|!j\.features\.length\) return null;/,
    'a truncated local answer must fall through rather than be drawn as if it were the world\'s cables');
});

/* ══ ④ THE BUILT DATASET ═══════════════════════════════════════════════════ */
const DATA = path.join(ROOT, 'data');
const hasData = fs.existsSync(path.join(DATA, 'subcables.json'));
const routes = hasData ? JSON.parse(fs.readFileSync(path.join(DATA, 'subcables.json'), 'utf8')) : null;
const meta = hasData ? JSON.parse(fs.readFileSync(path.join(DATA, 'subcables-meta.json'), 'utf8')) : null;
const lpFC = hasData ? JSON.parse(fs.readFileSync(path.join(DATA, 'subcables-lp.json'), 'utf8')) : null;

/* the inventory this round started from, measured 2026-08-23 from
   submarinecablemap.com: 724 GeoJSON features carrying 702 distinct cable ids
   and 1,922 landing points. Not one may be lost (§1). */
const BASE_CABLES = 702;
const BASE_LANDINGS = 1922;

test('④ the dataset is present and is a FeatureCollection of LineStrings', () => {
  assert.ok(hasData, 'data/subcables.json is missing — run `node scripts/build-subcables.mjs`');
  assert.equal(routes.type, 'FeatureCollection');
  assert.ok(routes.features.length > 0);
  for (const f of routes.features) assert.equal(f.geometry.type, 'LineString');
});

test('④ not one cable was lost, and every cable has geometry', { skip: !hasData }, () => {
  const ids = new Set(routes.features.map(f => f.properties.id));
  assert.ok(ids.size >= BASE_CABLES, 'the dataset has ' + ids.size + ' cables; the inventory it was built from had ' + BASE_CABLES + ' (§1: not one may disappear)');
  for (const id of Object.keys(meta.cables)) assert.ok(ids.has(id), 'cable ' + id + ' is in the metadata and has no geometry');
  for (const id of ids) assert.ok(meta.cables[id], 'cable ' + id + ' has geometry and no metadata');
});

test('④ every landing point survived, and every one a cable claims exists', { skip: !hasData }, () => {
  assert.ok(lpFC.features.length >= BASE_LANDINGS, 'landing points: ' + lpFC.features.length + ' < ' + BASE_LANDINGS);
  const inFC = new Set(lpFC.features.map(f => f.properties.id));
  for (const [cid, c] of Object.entries(meta.cables))
    for (const lp of c.landingPoints) assert.ok(inFC.has(lp), 'cable ' + cid + ' lands at ' + lp + ', which is not in data/subcables-lp.json');
  for (const id of inFC) assert.ok(meta.landingPoints[id], 'landing point ' + id + ' has no metadata entry');
});

test('④ every coordinate is finite, on the planet, and never jumps the seam', { skip: !hasData }, () => {
  let verts = 0;
  for (const f of routes.features) {
    const co = f.geometry.coordinates;
    assert.ok(co.length >= 2, f.properties.feature_id + ' has fewer than two points');
    let prev = null;
    for (const c of co) {
      verts++;
      assert.ok(Number.isFinite(c[0]) && Number.isFinite(c[1]), 'non-finite coordinate in ' + f.properties.feature_id);
      assert.ok(c[0] >= -180 && c[0] <= 180, 'longitude out of range in ' + f.properties.feature_id + ': ' + c[0]);
      assert.ok(c[1] >= -90 && c[1] <= 90, 'latitude out of range in ' + f.properties.feature_id + ': ' + c[1]);
      if (prev) assert.ok(Math.abs(c[0] - prev[0]) <= 180, f.properties.feature_id + ' jumps the antimeridian instead of being split at it');
      prev = c;
    }
  }
  assert.ok(verts > 20000, 'only ' + verts + ' vertices — that is not a reconstructed world');
});

test('④ every segment declares one of the three qualities, and a real source', { skip: !hasData }, () => {
  const OK = new Set(['verified', 'reconstructed', 'estimated']);
  const SRC = new Set(['noaa-mc', 'emodnet-bsh', 'emodnet-rws', 'emodnet-mt', 'emodnet-sig', 'acma', 'recon', 'geodesic', 'schematic-guided', 'telegeography-schematic', 'landing-only']);
  const seen = {};
  for (const f of routes.features) {
    const p = f.properties;
    assert.ok(OK.has(p.quality), 'unknown quality "' + p.quality + '" on ' + p.feature_id);
    assert.ok(SRC.has(p.src), 'unknown provenance "' + p.src + '" on ' + p.feature_id);
    assert.ok(p.color && /^#[0-9a-fA-F]{6}$/.test(p.color), 'feature ' + p.feature_id + ' lost its colour — the graphic reads `["coalesce",["get","color"],…]`');
    seen[p.quality] = (seen[p.quality] || 0) + 1;
  }
  assert.ok(seen.verified > 0, 'no segment came from a surveyed source at all');
  assert.ok(seen.reconstructed > seen.estimated, 'more of the world is a straight line than a reconstructed route');
});

test('④ feature ids are unique', { skip: !hasData }, () => {
  const ids = routes.features.map(f => f.properties.feature_id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate feature_id in data/subcables.json');
});

/* ══ ⑤ THE SCHEMATIC IS NOT THE ANSWER ═════════════════════════════════════
   §1 and §8: TeleGeography's own line may not be adopted wholesale as the final
   route. It survives ONLY where the sea floor cannot carry a route at all —
   rivers, and channels narrower than a grid cell — and the ceiling below is a
   ratchet: it may be lowered by a later round, never raised. */
const SCHEMATIC_CEILING = 0.03;

test('⑤ almost nothing is the schematic, and the ceiling is a ratchet', { skip: !hasData }, () => {
  let total = 0, schematic = 0;
  for (const f of routes.features) {
    const L = lineLength(f.geometry.coordinates);
    total += L;
    if (f.properties.src === 'telegeography-schematic') schematic += L;
  }
  const share = schematic / total;
  assert.ok(share <= SCHEMATIC_CEILING,
    (100 * share).toFixed(2) + '% of the built length is TeleGeography\'s own schematic line; the ceiling is '
    + (100 * SCHEMATIC_CEILING).toFixed(1) + '% (§1). Fix the routing, do not raise the ceiling.');
});

/* ══ ⑥ THE OVERRIDES ARE DATA, AND EVERY ONE OF THEM MEANS SOMETHING ═══════ */
test('⑥ every override names a cable that exists, and every channel says why', { skip: !hasData }, () => {
  const ov = JSON.parse(read('data/subcable-overrides.json'));
  for (const [key, id] of Object.entries(ov.pieceCable || {})) {
    if (id === null) continue;
    assert.ok(meta.cables[id], 'pieceCable["' + key + '"] names cable "' + id + '", which does not exist');
  }
  for (const ch of ov.channels || []) {
    assert.ok(ch.name && ch.why && ch.why.length > 40,
      'channel "' + ch.name + '" must say WHY it is there — a hand-placed coordinate with no reason is exactly what §20 forbids');
    assert.ok(Array.isArray(ch.points) && ch.points.length >= 2);
    for (const p of ch.points) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  }
  for (const [cid, pts] of Object.entries(ov.anchors || {})) {
    assert.ok(meta.cables[cid], 'anchors["' + cid + '"] names a cable that does not exist');
    for (const p of pts) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
});

/* ══ ⑦ THE CORRIDOR-AXIS EXTRACTOR, PROVED BOTH WAYS ═══════════════════════
   A synthetic corridor: a bent centreline, buffered by 61 m — the NOAA median —
   with the two walls described at DIFFERENT vertex densities, which is the shape
   that broke the arc-length version of this code (measured at 2.9 × the
   corridor's own half-width). And a synthetic protection zone 33 km across,
   which must be refused rather than turned into a "route".

   ⚠ THE WALLS ARE SAMPLED FINER THAN THE CORRIDOR IS WIDE, and that is a
   property of the algorithm, not a convenience of the test. A vertex finds its
   opposite number in a grid three corridor-widths across; walls sampled far
   more coarsely than that have no opposite number to find, and `corridorAxes`
   returns nothing rather than guessing. Every source it is applied to satisfies
   this — the NOAA rings' median segment is 2.7 m against a 61 m width — and
   densifying the ring first was MEASURED over all 431 NOAA rings: identical
   357 limbs accepted, 891 km LESS extracted, 2.4× the time. So the requirement
   stands and is written down instead of being papered over. */
function buildCorridor(centre, halfWidthDeg, denseSide) {
  const left = [], right = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(centre.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L * halfWidthDeg, ny = dx / L * halfWidthDeg;
    left.push([centre[i][0] + nx, centre[i][1] + ny]);
    right.push([centre[i][0] - nx, centre[i][1] - ny]);
  }
  const thin = (arr, keep) => arr.filter((_, i) => i === 0 || i === arr.length - 1 || i % keep === 0);
  const L2 = denseSide ? left : thin(left, 4);
  const R2 = denseSide ? thin(right, 4) : right;
  const ring = L2.concat(R2.slice().reverse());
  ring.push(ring[0].slice());
  return ring;
}

test('⑦ a real corridor yields its centreline; the walls sit half a width from it', () => {
  const centre = [];
  /* 900 points over 2.7° ≈ 260 m apart — four times finer than the 61 m×2 the
     corridor is wide, i.e. the sampling every real source has */
  for (let i = 0; i <= 900; i++) centre.push([-30 + i * 0.003, 40 + Math.sin(i / 130) * 0.4]);
  const ring = buildCorridor(centre, 0.00055, true);       /* ≈ 61 m half-width, the NOAA median */
  const limbs = corridorAxes(ring);
  assert.equal(limbs.length, 1, 'a simple corridor must give exactly one limb');
  const fit = axisFit(limbs[0].axis, limbs[0].walls);
  assert.ok(fit < 400, 'the extracted axis is ' + Math.round(fit) + ' m from its own walls');
  const got = lineLength(limbs[0].axis), want = lineLength(centre);
  assert.ok(Math.abs(got - want) / want < 0.08,
    'axis length ' + Math.round(got / 1000) + ' km against a true centreline of ' + Math.round(want / 1000) + ' km');
});

test('⑦ …and it is refused when the polygon is a protection zone, not a corridor', () => {
  const centre = [];
  for (let i = 0; i <= 400; i++) centre.push([10 + i * 0.01, 55]);
  const wide = buildCorridor(centre, 0.15, true);          /* ≈ 33 km across */
  assert.equal(corridorAxes(wide, { maxWidthM: 4000 }).length, 0,
    'a 33 km-wide cable AREA must not be turned into a "surveyed route"');
});

/* ══ ⑧ THE SEAM, PROVED BOTH WAYS ══════════════════════════════════════════ */
test('⑧ a route crossing ±180° is split there, and one that does not is left alone', () => {
  const across = unwrap([[170, 10], [178, 12], [186, 14], [193, 16]]);
  const parts = splitAntimeridian(across);
  assert.equal(parts.length, 2, 'a Pacific crossing must come out as two features');
  assert.equal(parts[0][parts[0].length - 1][0], 180);
  assert.equal(parts[1][0][0], -180);
  for (const p of parts) for (const c of p) assert.ok(c[0] >= -180 && c[0] <= 180);
  const near = splitAntimeridian([[170, 10], [176, 12], [179, 14]]);
  assert.equal(near.length, 1, 'a line that never reaches the seam must not be cut');
  const back = splitAntimeridian(unwrap([[-175, 10], [-179, 12], [176, 14]]));
  assert.equal(back.length, 2, 'a westward crossing must split too');
});

/* ══ ⑨ THE BUILD MANIFEST SAYS WHERE EVERY METRE CAME FROM ═════════════════ */
test('⑨ the build manifest records the sources, their licences and the QA', { skip: !hasData }, () => {
  const b = JSON.parse(read('data/subcables.build.json'));
  assert.ok(b.built && b.generator === 'scripts/build-subcables.mjs');
  for (const key of ['noaa-mc', 'acma', 'telegeography', 'terrarium']) {
    assert.ok(b.licences[key] && b.licences[key].licence, 'no licence recorded for source "' + key + '"');
  }
  assert.equal(b.qa.cablesOut, b.qa.cablesIn, 'the QA itself says cables were lost');
  assert.equal(b.qa.antimeridianBreaks, 0);
  assert.equal(b.qa.nonFinite, 0);
  assert.equal(b.qa.duplicateFeatureIds, 0);
  assert.ok(b.lengthKm.verified > 20000, 'only ' + b.lengthKm.verified + ' km came from surveyed sources');
  assert.ok(b.counts.cables >= BASE_CABLES);
});

/* ══ ⑩ THE DATASET IS NOT ALLOWED TO BALLOON ═══════════════════════════════
   §16: more vertices is not more truth, and the layer may not become heavy.
   Both ceilings are ratchets — lower them when a round makes the dataset
   smaller; never raise them. */
const MAX_ROUTE_BYTES = 6 * 1024 * 1024;
const MAX_VERTICES = 400000;

test('⑩ the shipped dataset stays inside its size and vertex ceilings', { skip: !hasData }, () => {
  const bytes = fs.statSync(path.join(DATA, 'subcables.json')).size;
  assert.ok(bytes <= MAX_ROUTE_BYTES, 'data/subcables.json is ' + (bytes / 1048576).toFixed(2) + ' MB, ceiling ' + (MAX_ROUTE_BYTES / 1048576) + ' MB');
  let verts = 0;
  for (const f of routes.features) verts += f.geometry.coordinates.length;
  assert.ok(verts <= MAX_VERTICES, verts + ' vertices, ceiling ' + MAX_VERTICES
    + ' — §21: a route does not become more accurate by being given more points');
  /* …and no single feature may be absurdly dense for its own length */
  for (const f of routes.features) {
    const co = f.geometry.coordinates;
    if (co.length < 50) continue;
    const perKm = co.length / Math.max(1, lineLength(co) / 1000);
    assert.ok(perKm < 60, f.properties.feature_id + ' carries ' + perKm.toFixed(1) + ' vertices per km');
  }
});

/* ══ ⑪ THE ROUTES REALLY REACH THEIR LANDING POINTS ════════════════════════ */
test('⑪ each cable\'s drawing touches the landing points it claims', { skip: !hasData }, () => {
  const byCable = new Map();
  for (const f of routes.features) {
    const a = byCable.get(f.properties.id) || []; a.push(f); byCable.set(f.properties.id, a);
  }
  let checked = 0, reached = 0;
  for (const [id, feats] of byCable) {
    const c = meta.cables[id];
    if (!c || !c.landingPoints.length) continue;
    const pts = [];
    for (const f of feats) { const co = f.geometry.coordinates; pts.push(co[0], co[co.length - 1]); }
    for (const lpId of c.landingPoints) {
      const lp = meta.landingPoints[lpId]; if (!lp) continue;
      checked++;
      let best = Infinity;
      for (const p of pts) { const d = haversine(p, lp.coord); if (d < best) best = d; }
      if (best <= 30000) reached++;
    }
  }
  assert.ok(checked > 1000, 'only ' + checked + ' landing points were checked');
  const share = reached / checked;
  assert.ok(share >= 0.97, (100 * share).toFixed(1) + '% of claimed landing points are actually reached by their cable\'s drawing (want ≥ 97%)');
});
