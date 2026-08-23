#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE SUBMARINE-CABLE DATASET
 * ----------------------------------------------------------------------------
 *  「海底ケーブルレイヤーを『全ケーブル・実位置近似』へ全面改修してください」
 *
 *  What ships today as the cable layer is TeleGeography's SCHEMATIC geometry:
 *  702 cables in 1,933 rings and 14,103 vertices — a median of FOUR points per
 *  leg. It is an excellent inventory and a diagram, not a chart: legs cross land
 *  and legs cross oceans as straight lines. This pipeline keeps the inventory
 *  and replaces the geometry.
 *
 *      raw sources
 *        → normalisation          scripts/subcables/sources.mjs
 *        → connection topology    scripts/subcables/topology.mjs
 *        → cable identity match   scripts/subcables/match.mjs
 *        → verified segment merge (here)
 *        → route reconstruction   scripts/subcables/router.mjs + seafloor.mjs
 *        → QA                     scripts/subcables/qa.mjs
 *        → data/subcables.json, data/subcables-meta.json, data/subcables-lp.json
 *
 *  ── THE THREE QUALITIES, AND WHAT THEY MEAN ───────────────────────────────
 *    verified       the geometry IS a published surveyed position, from a named
 *                   government or hydrographic dataset, matched to this cable by
 *                   name AND place. Carries the source and the fit it was
 *                   accepted at.
 *    reconstructed  a least-cost path over the 1/12° sea floor between two
 *                   anchors that are themselves real (landing points, branching
 *                   units, the ends of verified pieces).
 *    estimated      the same, but the router could not find a way and the leg is
 *                   the geodesic. Every one of these is listed by the QA.
 *
 *  ⚠ NOTHING IS EVER "TeleGeography's line, kept". The schematic is used for the
 *  inventory, the metadata, the landing points, the connection graph, and as a
 *  LOCATOR when deciding which surveyed piece belongs to which leg. Its vertices
 *  never reach the output. (The brief's §8.)
 *
 *  ⚠ LAST-KNOWN-GOOD. The pipeline writes to a temporary path and only replaces
 *  data/subcables*.json once the QA has passed. A failed build leaves the
 *  shipped dataset exactly as it was (the brief's §3, §19).
 *
 *    node --max-old-space-size=6000 scripts/build-subcables.mjs [--refresh]
 *        [--only <cable-id,…>] [--no-write] [--report <path>]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSeafloor, buildSeafloor, ROOT } from './subcables/seafloor.mjs';
import { loadTeleGeography, loadNOAA, loadEMODnet, loadACMA, LICENCES } from './subcables/sources.mjs';
import { SeafloorRouter } from './subcables/router.mjs';
import { loadLakeMask, applyLakes, carveChannels, LAKE_LICENCE } from './subcables/water.mjs';
import { buildTopology, refPosition } from './subcables/topology.mjs';
import { nameKeys, matchPiece } from './subcables/match.mjs';
import { runQA } from './subcables/qa.mjs';
import {
  haversine, lineLength, unwrap, splitAntimeridian, simplify, dedupe, chaikin,
  corridorAxes, axisFit, densify, dLon,
} from './subcables/geo.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const log = (...a) => console.log(...a);
const REFRESH = flag('refresh');
const ONLY = arg('only', '') ? new Set(arg('only').split(',')) : null;

/* how far from the grid a reconstructed leg may be simplified — a quarter of a
   cell, so simplification can never move the line off the cells the router
   proved were passable */
const CELL_M = 360 / 4320 * 111319.49;
const SIMPLIFY_RECON_M = CELL_M * 0.25;
const SIMPLIFY_VERIFIED_M = 40;         /* well inside the 61 m median corridor width */
const CORRIDOR_FIT_M = 500;             /* a medial axis further than this from its own walls is refused */
const GAP_DIRECT_M = 2 * CELL_M;        /* a gap shorter than two cells is joined directly */

async function main() {
  const t0 = Date.now();
  const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'subcable-overrides.json'), 'utf8'));
  const aliasMap = overrides.nameAliases || {};
  const pieceCable = overrides.pieceCable || {};
  const excludeSources = new Set((overrides.excludeSources || []).map(s => s.toLowerCase()));

  /* ══ 1 · SOURCES ═══════════════════════════════════════════════════════════ */
  log('· sources');
  const tg = await loadTeleGeography({ refresh: REFRESH, log });
  const landingPoints = new Map();
  for (const f of tg.lpGeo.features) {
    const p = f.properties;
    landingPoints.set(p.id, { id: p.id, name: p.name, coord: f.geometry.coordinates.slice(0, 2), isTbd: !!p.is_tbd, country: null, cables: [] });
  }
  for (const id in tg.details) {
    for (const lp of tg.details[id].landing_points || []) {
      const rec = landingPoints.get(lp.id);
      if (rec && lp.country && !rec.country) rec.country = lp.country;
      if (rec && !rec.name && lp.name) rec.name = lp.name;
    }
  }

  /* the cables: one record per distinct id, rings merged across duplicate features */
  const cables = new Map();
  for (const f of tg.geo.features) {
    const p = f.properties;
    let c = cables.get(p.id);
    if (!c) {
      const d = tg.details[p.id] || {};
      c = {
        id: p.id, name: d.name || p.name, colour: p.color || '#30b0c7',
        details: d,
        landingPointIds: (d.landing_points || []).map(l => l.id).filter(id => landingPoints.has(id)),
        rings: [], keys: null, landingCoords: [],
      };
      cables.set(p.id, c);
    }
    const g = f.geometry;
    const parts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
    for (const r of parts) if (r.length >= 2) c.rings.push(r.map(q => [q[0], q[1]]));
  }
  for (const c of cables.values()) {
    c.keys = nameKeys(c.name, null, aliasMap);
    c.landingCoords = c.landingPointIds.map(id => landingPoints.get(id).coord);
    c.rings = c.rings.map(r => unwrap(r));
    for (const id of c.landingPointIds) landingPoints.get(id).cables.push(c.id);
  }
  log('  telegeography: ' + cables.size + ' cables, ' + tg.geo.features.length + ' features, ' + landingPoints.size + ' landing points');

  /* ══ 2 · VERIFIED PIECES ═══════════════════════════════════════════════════ */
  log('· verified route pieces');
  const pieces = [];
  const srcStats = {};
  const bump = (src, k, n = 1) => { (srcStats[src] ||= { features: 0, pieces: 0, refusedFit: 0, refusedName: 0, refusedPlace: 0, ambiguous: 0, matched: 0, km: 0 }); srcStats[src][k] += n; };

  const noaa = await loadNOAA({ refresh: REFRESH, log });
  for (const f of noaa) {
    const name = f.properties.cableSystem;
    if (!name || !f.geometry) continue;
    bump('noaa-mc', 'features');
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const poly of polys) {
      for (const limb of corridorAxes(poly[0])) {
        const fit = axisFit(limb.axis, limb.walls);
        if (!(fit <= Math.max(limb.width * 4, CORRIDOR_FIT_M))) { bump('noaa-mc', 'refusedFit'); continue; }
        pieces.push(makePiece('noaa-mc', name, null, f.properties.owner || '', limb.axis, { fitM: Math.round(fit), corridorWidthM: Math.round(limb.width), status: f.properties.status || null }));
        bump('noaa-mc', 'pieces');
      }
    }
  }
  for (const f of await loadEMODnet({ refresh: REFRESH, log })) {
    bump(f.src, 'features');
    for (const part of linesOf(f.geometry)) {
      pieces.push(makePiece(f.src, f.name, null, f.owner, part, { layer: f.layer }));
      bump(f.src, 'pieces');
    }
  }
  for (const f of await loadACMA({ refresh: REFRESH, log })) {
    bump('acma', 'features');
    for (const part of linesOf(f.geometry)) {
      pieces.push(makePiece('acma', f.name, f.abbrev, '', part, {}));
      bump('acma', 'pieces');
    }
  }
  log('  ' + pieces.length + ' candidate pieces from ' + Object.keys(srcStats).length + ' sources');

  /* ══ 3 · IDENTITY ══════════════════════════════════════════════════════════ */
  log('· identity matching');
  const cableList = [...cables.values()];
  const explicitRefusals = new Set();
  for (const p of pieces) {
    const key = p.src + '|' + p.name;
    if (excludeSources.has(p.name.toLowerCase())) { p.rejected = 'excluded'; continue; }
    if (Object.prototype.hasOwnProperty.call(pieceCable, key)) {
      const forced = pieceCable[key];
      if (forced === null) { p.rejected = 'override'; explicitRefusals.add(key); continue; }
      const c = cables.get(forced);
      if (!c) throw new Error('override pieceCable["' + key + '"] names cable "' + forced + '", which does not exist');
      p.cable = c; p.confidence = 1; p.nameScore = 1; p.placeDist = 0; p.via = 'override';
      bump(p.src, 'matched'); bump(p.src, 'km', p.lengthM / 1000);
      continue;
    }
    const r = matchPiece(p, cableList, aliasMap);
    if (!r.match) {
      p.rejected = r.ambiguous ? 'ambiguous' : (r.considered.length ? 'place' : 'name');
      bump(p.src, r.ambiguous ? 'ambiguous' : (r.considered.length ? 'refusedPlace' : 'refusedName'));
      continue;
    }
    p.cable = r.match; p.confidence = r.confidence; p.nameScore = r.nameScore; p.placeDist = r.placeDist; p.via = 'name+place';
    bump(p.src, 'matched'); bump(p.src, 'km', p.lengthM / 1000);
  }
  const matched = pieces.filter(p => p.cable);
  log('  ' + matched.length + '/' + pieces.length + ' pieces matched to ' + new Set(matched.map(p => p.cable.id)).size + ' cables');

  /* ══ 4 · TOPOLOGY ══════════════════════════════════════════════════════════ */
  log('· connection topology');
  let edgeCount = 0, orphanCount = 0;
  for (const c of cableList) {
    c.topo = buildTopology(c, landingPoints);
    edgeCount += c.topo.edges.length;
    orphanCount += c.topo.orphans.length;
  }
  log('  ' + edgeCount + ' legs, ' + orphanCount + ' landing points reconnected to their cable');

  /* attach matched pieces to legs */
  for (const p of matched) {
    const c = p.cable;
    let best = null, bd = Infinity;
    for (const e of c.topo.edges) {
      let d = 0;
      for (const q of p.sample) d = Math.max(d, refPosition(e.ref, q).dist);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { p.rejected = 'no-leg'; p.cable = null; continue; }
    p.edge = best; p.edgeDist = bd;
    (best.pieces ||= []).push(p);
  }

  /* ══ 5 · ROUTE RECONSTRUCTION ══════════════════════════════════════════════ */
  log('· sea floor');
  let grid = loadSeafloor();
  if (!grid) { log('  (no cached grid — building; this downloads ~4,096 terrarium tiles)'); grid = await buildSeafloor({ log }); }
  const router = new SeafloorRouter(grid);
  const lakeCells = applyLakes(router, await loadLakeMask(grid.w, grid.h, { refresh: REFRESH, log }));
  const channels = carveChannels(router, overrides.channels);
  log('  ' + grid.w + '×' + grid.h + ' (' + (360 / grid.w).toFixed(4) + '°), ' + router.passableCells.toLocaleString() + ' passable cells'
    + ' (+' + lakeCells.toLocaleString() + ' lake, ' + channels.map(c => c.name + ' +' + c.cellsOpened).join(', ') + ')');
  for (const c of channels) if (c.warning) log('  ⚠ channel "' + c.name + '" ' + c.warning);

  log('· reconstruction');
  const outFeatures = [];
  const perCable = [];
  let done = 0;
  for (const c of cableList) {
    if (ONLY && !ONLY.has(c.id)) continue;
    const segs = [];
    for (const e of c.topo.edges) segs.push(...buildLeg(c, e, router, overrides));
    /* a cable whose schematic had no usable leg at all still has landing points */
    if (!segs.length && c.landingCoords.length >= 2) {
      for (let i = 1; i < c.landingCoords.length; i++) {
        segs.push(...buildLeg(c, { a: { coord: c.landingCoords[i - 1], kind: 'landing' }, b: { coord: c.landingCoords[i], kind: 'landing' }, ref: [c.landingCoords[i - 1], c.landingCoords[i]] }, router, overrides));
      }
    }
    if (!segs.length && c.landingCoords.length === 1) {
      /* one known landing and nothing else: keep the cable with a zero-extent
         marker rather than dropping it — §1 says not one cable disappears */
      segs.push({ coords: [c.landingCoords[0], c.landingCoords[0]], quality: 'estimated', src: 'landing-only', note: 'single landing point' });
    }
    const stats = { verifiedM: 0, reconM: 0, estM: 0 };
    let n = 0;
    for (const s of segs) {
      const L = lineLength(s.coords);
      if (s.quality === 'verified') stats.verifiedM += L; else if (s.quality === 'reconstructed') stats.reconM += L; else stats.estM += L;
      for (const part of splitAntimeridian(s.coords)) {
        if (part.length < 2) continue;
        outFeatures.push({
          type: 'Feature',
          properties: {
            id: c.id, name: c.name, color: c.colour, feature_id: c.id + '-' + (n++),
            quality: s.quality, src: s.src, ...(s.fitM != null ? { fit_m: s.fitM } : {}), ...(s.note ? { note: s.note } : {}),
          },
          geometry: { type: 'LineString', coordinates: part.map(q => [round6(q[0]), round6(q[1])]) },
        });
      }
    }
    perCable.push({ id: c.id, name: c.name, segments: segs.length, ...stats,
      publishedKm: parseLengthKm(c.details.length), legs: c.topo.edges.length, orphans: c.topo.orphans.length });
    if (++done % 100 === 0) log('  ' + done + '/' + cableList.length + ' cables');
  }
  log('  ' + outFeatures.length + ' features for ' + perCable.length + ' cables · router ' + JSON.stringify(router.stats));

  /* ══ 6 · METADATA + LANDING POINTS ═════════════════════════════════════════ */
  const meta = { cables: {}, landingPoints: {} };
  for (const c of cableList) {
    const d = c.details || {};
    const pc = perCable.find(x => x.id === c.id);
    const srcs = [...new Set(outFeatures.filter(f => f.properties.id === c.id && f.properties.quality === 'verified').map(f => f.properties.src))];
    meta.cables[c.id] = {
      name: c.name,
      length: d.length || null,
      owners: d.owners || null,
      suppliers: d.suppliers || null,
      rfs: d.rfs || null,
      rfsYear: d.rfs_year ?? null,
      isPlanned: !!d.is_planned,
      url: d.url || null,
      notes: d.notes || null,
      landingPoints: c.landingPointIds,
      countries: [...new Set((d.landing_points || []).map(l => l.country).filter(Boolean))].sort(),
      quality: pc ? qualityLabel(pc) : 'estimated',
      routeKm: pc ? Math.round((pc.verifiedM + pc.reconM + pc.estM) / 1000) : 0,
      verifiedKm: pc ? Math.round(pc.verifiedM / 1000) : 0,
      sources: srcs,
    };
  }
  for (const [id, lp] of landingPoints) {
    meta.landingPoints[id] = { name: lp.name, country: lp.country || null, coord: [round6(lp.coord[0]), round6(lp.coord[1])], cables: lp.cables.slice().sort() };
  }

  const lpFC = {
    type: 'FeatureCollection',
    features: [...landingPoints.values()].map(lp => ({
      type: 'Feature',
      properties: { id: lp.id, name: lp.name, is_tbd: lp.isTbd },
      geometry: { type: 'Point', coordinates: [round6(lp.coord[0]), round6(lp.coord[1])] },
    })),
  };
  const routeFC = { type: 'FeatureCollection', features: outFeatures };

  /* ══ 7 · QA ════════════════════════════════════════════════════════════════ */
  log('· QA');
  const qa = runQA({ routeFC, lpFC, meta, cables: cableList, router, perCable });
  for (const line of qa.summary) log('  ' + line);

  /* ══ 8 · EMIT ══════════════════════════════════════════════════════════════ */
  const totals = perCable.reduce((a, p) => {
    a.verifiedM += p.verifiedM; a.reconM += p.reconM; a.estM += p.estM;
    a[qualityLabel(p)]++;
    return a;
  }, { verifiedM: 0, reconM: 0, estM: 0, verified: 0, reconstructed: 0, estimated: 0 });

  const build = {
    built: new Date().toISOString(),
    generator: 'scripts/build-subcables.mjs',
    grid: { width: grid.w, height: grid.h, degrees: 360 / grid.w, cellMetresAtEquator: Math.round(CELL_M), source: grid.meta.source, zoom: grid.meta.zoom },
    counts: {
      cables: perCable.length,
      features: outFeatures.length,
      landingPoints: lpFC.features.length,
      legs: edgeCount,
      verifiedPieces: matched.length,
      candidatePieces: pieces.length,
    },
    lengthKm: {
      total: Math.round((totals.verifiedM + totals.reconM + totals.estM) / 1000),
      verified: Math.round(totals.verifiedM / 1000),
      reconstructed: Math.round(totals.reconM / 1000),
      estimated: Math.round(totals.estM / 1000),
    },
    cablesByQuality: { verified: totals.verified, reconstructed: totals.reconstructed, estimated: totals.estimated },
    sources: Object.fromEntries(Object.entries(srcStats).map(([k, v]) => [k, { ...v, km: Math.round(v.km), ...LICENCES[k] }])),
    licences: { ...LICENCES, 'ne-lakes': LAKE_LICENCE },
    channels,
    lakeCells,
    router: router.stats,
    qa: qa.report,
  };

  const reportPath = arg('report', null);
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify({ build, perCable }, null, 2));

  if (qa.fatal.length) {
    log('\n✗ QA FAILED — the shipped dataset is left exactly as it was:');
    for (const f of qa.fatal) log('   ' + f);
    process.exitCode = 1;
    return;
  }
  if (flag('no-write')) { log('\n(--no-write) ' + JSON.stringify(build.lengthKm)); return; }

  const dataDir = path.join(ROOT, 'data');
  writeAtomic(path.join(dataDir, 'subcables.json'), JSON.stringify(routeFC));
  writeAtomic(path.join(dataDir, 'subcables-lp.json'), JSON.stringify(lpFC));
  writeAtomic(path.join(dataDir, 'subcables-meta.json'), JSON.stringify(meta));
  writeAtomic(path.join(dataDir, 'subcables.build.json'), JSON.stringify(build, null, 2));
  const sz = (f) => (fs.statSync(path.join(dataDir, f)).size / 1024 / 1024).toFixed(2) + ' MB';
  log('\n✓ data/subcables.json ' + sz('subcables.json') + ' · -lp ' + sz('subcables-lp.json') + ' · -meta ' + sz('subcables-meta.json'));
  log('  ' + build.counts.cables + ' cables · ' + build.counts.features + ' features · ' + build.lengthKm.total.toLocaleString() + ' km'
    + ' (' + build.lengthKm.verified.toLocaleString() + ' verified / ' + build.lengthKm.reconstructed.toLocaleString() + ' reconstructed / ' + build.lengthKm.estimated.toLocaleString() + ' estimated)');
  log('  ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
}

/* ── build one leg: anchors, surveyed pieces in order, reconstruction between ─ */
function buildLeg(cable, edge, router, overrides) {
  const A = edge.a.coord, B = edge.b.coord;
  const anchors = (overrides.anchors || {})[cable.id] || [];
  const pieces = (edge.pieces || []).slice();
  for (const p of pieces) {
    const s0 = refPosition(edge.ref, p.coords[0]).s;
    const s1 = refPosition(edge.ref, p.coords[p.coords.length - 1]).s;
    p._s0 = Math.min(s0, s1); p._s1 = Math.max(s0, s1); p._flip = s1 < s0;
  }
  pieces.sort((x, y) => x._s0 - y._s0);
  /* drop pieces that overlap one already taken — two datasets describing the
     same water is not two segments of cable */
  const taken = [];
  for (const p of pieces) {
    if (taken.some(q => p._s0 < q._s1 - 1000 && p._s1 > q._s0 + 1000)) { p.dropped = 'overlap'; continue; }
    taken.push(p);
  }

  const segs = [];
  let cursor = A;
  for (const p of taken) {
    const coords = p._flip ? p.coords.slice().reverse() : p.coords;
    const gapSeg = connect(cursor, coords[0], router, anchors, refSlice(edge.ref, cursor, coords[0]));
    if (gapSeg) segs.push(gapSeg);
    segs.push({ coords: simplifyVerified(coords), quality: 'verified', src: p.src, fitM: p.extra.fitM ?? null });
    cursor = coords[coords.length - 1];
  }
  const tail = connect(cursor, B, router, taken.length ? [] : anchors, refSlice(edge.ref, cursor, B));
  if (tail) segs.push(tail);
  if (!segs.length) {
    const direct = connect(A, B, router, anchors, edge.ref);
    if (direct) segs.push(direct);
  }
  return segs;
}

/* ══ THE RECONSTRUCTION BETWEEN TWO ANCHORS ══════════════════════════════════
   Three outcomes, in order of preference, and the caller is told which:

   · reconstructed      the least-cost path over the sea floor, smoothed to the
                        grid's own resolution.
   · estimated (guided) the router had no way through — a river, a strait
                        narrower than a cell, an island channel — so the leg is
                        rebuilt hop by hop along the schematic's own vertices,
                        routing each hop that CAN be routed. §1 forbids adopting
                        the schematic as the answer; this uses it as the only
                        available statement of where the cable goes, reconstructs
                        every part of it that the sea floor can carry, and says
                        `estimated` for the whole leg.
   · estimated (geodesic) nothing else is available.

   ⚠ THE DETOUR CAP IS PART OF THIS. A route that is many times its own straight
   line has not found a clever way round; it has found the wrong ocean, because
   the passage it should have used is narrower than a cell. Without the cap,
   Red2Med's 151 km leg came out at 25,141 km — the whole way round Africa — and
   the QA's length test is the only thing that would ever have noticed. */
const DETOUR_CAP = 5;

function connect(a, b, router, anchors, fallbackRef) {
  const d = haversine(a, b);
  if (d < GAP_DIRECT_M) {
    if (d < 1) return null;
    return { coords: [a, b], quality: 'reconstructed', src: 'recon' };
  }
  const waypoints = [a, ...anchors, b];
  const out = [];
  let failed = false;
  for (let i = 1; i < waypoints.length; i++) {
    const p = waypoints[i - 1], q = waypoints[i];
    const coords = routeHop(p, q, router, DETOUR_CAP);
    if (!coords) { failed = true; break; }
    out.push(...(out.length ? coords.slice(1) : coords));
  }
  /* ⚠ EACH HOP CAME BACK IN ITS OWN WRAPPED FRAME. Hop 1 may end at 187°E and
     hop 2 then starts at −173°, which is the same place and a 360° jump in the
     array — measured as one broken feature (`topaz-5`) straight across the map.
     The whole leg is re-unwrapped once, here, before anyone splits it. */
  if (!failed && out.length >= 2) return { coords: unwrapRun(out), quality: 'reconstructed', src: 'recon' };

  /* guided by the schematic's own vertices.
     ⚠ THE HOPS ARE SHORT AND THE SNAP IS TIGHT. A 250 km hop with a 60 km snap
     let a river route be dragged out to open sea and back at every step — the
     measured 5.6× over-length on Norte Conectado Infovia-05 and Projeto Amazônia
     Conectada. At 80 km with a 20 km snap, a hop that is not on water the grid
     holds simply fails and stays the schematic's own straight piece, which is
     the honest reading of "this cable is laid up a river the grid cannot see". */
  if (fallbackRef && fallbackRef.length >= 2) {
    const way = dedupe(densify(fallbackRef, 80e3), 5000);
    const guided = [];
    let routedM = 0, straightM = 0;
    for (let i = 1; i < way.length; i++) {
      const p = way[i - 1], q = way[i];
      const hop = routeHop(p, q, router, DETOUR_CAP, 20e3);
      if (hop) { routedM += lineLength(hop); guided.push(...(guided.length ? hop.slice(1) : hop)); }
      else { const seg = densify([p, q], CELL_M * 3); straightM += lineLength(seg); guided.push(...(guided.length ? seg.slice(1) : seg)); }
    }
    if (guided.length >= 2) {
      return { coords: unwrapRun(guided), quality: 'estimated',
        src: routedM > straightM ? 'schematic-guided' : 'telegeography-schematic',
        note: Math.round(100 * straightM / Math.max(1, routedM + straightM)) + '% unrouted' };
    }
  }
  const leg = densify([a, b], CELL_M * 3);
  return leg.length >= 2 ? { coords: leg, quality: 'estimated', src: 'geodesic' } : null;
}

function routeHop(p, q, router, cap, maxSnapM) {
  const gc = haversine(p, q);
  if (gc < GAP_DIRECT_M) return gc < 1 ? null : [p, q];
  const r = router.route(p, q, maxSnapM ? { maxSnapM } : undefined);
  if (!r) return null;
  let coords = router.toCoords(r.cells);
  coords = stitchEnds(p, q, coords, router);
  coords = simplify(chaikin(dedupe(unwrapRun(coords), 1), 2), SIMPLIFY_RECON_M);
  if (coords.length < 2) return null;
  if (lineLength(coords) > Math.max(cap * gc, gc + 1500e3)) return null;
  return coords;
}

/* the part of a schematic leg that lies between two points on it */
function refSlice(ref, a, b) {
  if (!ref || ref.length < 2) return null;
  const ra = refPosition(ref, a), rb = refPosition(ref, b);
  let s0 = Math.min(ra.s, rb.s), s1 = Math.max(ra.s, rb.s);
  if (!(s1 - s0 > 1000)) return [a, b];
  const out = [a];
  let cum = 0;
  for (let i = 1; i < ref.length; i++) {
    const seg = haversine(ref[i - 1], ref[i]);
    if (cum > s0 && cum < s1) out.push(ref[i - 1]);
    cum += seg;
  }
  out.push(b);
  return ra.s <= rb.s ? out : [a, ...out.slice(1, -1).reverse(), b];
}

/* the router works on cell centres; the leg must start and end at the ANCHOR.
   Trim the cells that are behind the anchor before splicing it on, so the line
   does not double back on itself at a landing. */
function stitchEnds(a, b, cells, router) {
  let s = 0, e = cells.length - 1;
  while (s + 1 < e && haversine(a, cells[s + 1]) < haversine(a, cells[s])) s++;
  while (e - 1 > s && haversine(b, cells[e - 1]) < haversine(b, cells[e])) e--;
  const mid = cells.slice(s, e + 1);
  const out = [a, ...mid, b];
  return dedupe(out, 50);
}

function unwrapRun(coords) {
  const out = [coords[0].slice()];
  for (let i = 1; i < coords.length; i++) out.push([out[i - 1][0] + dLon(out[i - 1][0], coords[i][0]), coords[i][1]]);
  return out;
}

function simplifyVerified(coords) {
  const u = unwrapRun(dedupe(coords, 1));
  return simplify(u, SIMPLIFY_VERIFIED_M);
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
function linesOf(g) {
  if (!g) return [];
  if (g.type === 'LineString') return g.coordinates.length >= 2 ? [g.coordinates.map(c => [c[0], c[1]])] : [];
  if (g.type === 'MultiLineString') return g.coordinates.filter(r => r.length >= 2).map(r => r.map(c => [c[0], c[1]]));
  return [];
}

function makePiece(src, name, abbrev, owner, coords, extra) {
  const c = dedupe(coords.map(q => [q[0], q[1]]), 1);
  const n = c.length;
  const sample = n <= 8 ? c : [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1].map(f => c[Math.min(n - 1, Math.round(f * (n - 1)))]);
  return { src, name, abbrev: abbrev || null, owner: owner || '', coords: c, sample, lengthM: lineLength(c), extra: extra || {} };
}

function parseLengthKm(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*km/i);
  return m ? Number(m[1]) : null;
}

function qualityLabel(pc) {
  const tot = pc.verifiedM + pc.reconM + pc.estM;
  if (!tot) return 'estimated';
  if (pc.verifiedM / tot >= 0.6) return 'verified';
  if (pc.estM / tot >= 0.5) return 'estimated';
  return 'reconstructed';
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
