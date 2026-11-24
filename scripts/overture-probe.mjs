#!/usr/bin/env node
/* ============================================================================
 *  scripts/overture-probe.mjs — the LIVE measurement of js/gis-overture.js against the real Overture release
 * ----------------------------------------------------------------------------
 *  node scripts/overture-probe.mjs                 the scenario below, against the latest release
 *  node scripts/overture-probe.mjs --json          the same, as one JSON object (for the dev-notes)
 *
 *  SCENARIO («港湾と半導体工場の 100 km 近接»): in a window over northern Kyushu,
 *      sites   = places whose name carries セミコン           (a NAME match — Overture's places have no semiconductor class)
 *      ports   = places classed `marina` whose name carries 港 (Overture's places have no `seaport` class either)
 *  both registered as datasets of the registry (window.IntMapData) and joined by the existing op
 *  `relate nearer-than maxKm:100` (js/gis-ops.js) — the point is that the rows of a release are an ordinary
 *  input of the next step, not that the two name heuristics are a port census.
 *
 *  It is a probe, not a gate: it needs the network and takes a minute, so nothing in CI runs it. What it is
 *  FOR is the one question a mocked test cannot answer — «does a release that is read by window still answer
 *  the way this module believes» — so run it when Overture's schema or its hosting changes.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');

const w = {};
globalThis.window = w;
new Function('window', fs.readFileSync(path.join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
const { makeGisDatasets } = await import('../js/gis-datasets.js');
const { makeGisGeometry } = await import('../js/gis-geometry.js');
const { makeGisRaster } = await import('../js/gis-raster.js');
const { makeGisExpr } = await import('../js/gis-expr.js');
const { makeGisOps } = await import('../js/gis-ops.js');
const { makeGisOverture } = await import('../js/gis-overture.js');
const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisRaster = makeGisRaster(); w.IntMapGisExpr = makeGisExpr();
await geometry.ready();
const O = makeGisOverture({ data });

const BBOX = [129.8, 32.3, 131.1, 34.0];
const log = asJson ? () => { } : (...a) => console.log(...a);
const out = { bbox: BBOX };

const rel = await O.release();
if (!rel.ok) { console.error('release', JSON.stringify(rel)); process.exit(1); }
out.release = rel.version; log('release', rel.version, '(releases listed:', rel.releases.join(', ') + ')');

const t0 = Date.now();
const sites = await O.acquire({ theme: 'places', type: 'place', bbox: BBOX, title: 'Semiconductor-named sites',
  where: [{ field: 'names.primary', op: 'contains', value: 'セミコン' }], columns: ['id', 'geometry', 'names', 'taxonomy', 'confidence', 'sources'] });
const t1 = Date.now();
const ports = await O.acquire({ theme: 'places', type: 'place', bbox: BBOX, title: 'Marinas named 港',
  where: [{ field: 'taxonomy.primary', op: '==', value: 'marina' }, { field: 'names.primary', op: 'contains', value: '港' }], columns: ['id', 'geometry', 'names', 'taxonomy', 'confidence', 'sources'] });
const t2 = Date.now();
for (const [k, r, ms] of [['sites', sites, t1 - t0], ['ports', ports, t2 - t1]]) {
  if (!r.ok) { console.error(k, JSON.stringify(r)); process.exit(1); }
  out[k] = { count: r.result.count, ms: ms, read: r.result.read, licences: r.result.licences, coverage: r.coverage && { completeness: r.coverage.completeness, reason: r.coverage.reason } };
  log(k, r.result.count, 'rows,', ms, 'ms ·', JSON.stringify(r.result.read), '·', r.result.licences.join('; '), '·', r.coverage && r.coverage.completeness);
}
const near = await ops.run({ op: 'relate', inputs: [sites.id, ports.id], params: { predicate: 'nearer-than', maxKm: 100 } });
if (!near.ok) { console.error('relate', JSON.stringify(near)); process.exit(1); }
const rows = near.dataset.features();
out.relate = { pairs: rows.length, ms: Date.now() - t2, coverage: near.dataset.provenance && near.dataset.provenance.coverage && near.dataset.provenance.coverage.completeness };
log('relate nearer-than 100 km →', rows.length, 'rows,', out.relate.ms, 'ms; first:', rows.slice(0, 3).map((f) => JSON.stringify(f.properties).slice(0, 220)).join(' | '));
if (asJson) console.log(JSON.stringify(out, null, 2));
