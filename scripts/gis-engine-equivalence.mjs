/* ============================================================================
 *  gis-engine-equivalence — does a large-scale engine (DuckDB Spatial) return the SAME rows as this GIS?
 * ----------------------------------------------------------------------------
 *  node scripts/gis-engine-equivalence.mjs [--json]
 *  Needs @duckdb/node-api. It is NOT a dependency of the product: install it somewhere outside the repo and point
 *  DUCKDB_MODULE at its entry (e.g. DUCKDB_MODULE=C:/scratch/duck/node_modules/@duckdb/node-api/lib/index.js).
 *
 *  What it measures: every (left, right) pair of a case table goes through `relateBlock` (the one place this GIS writes
 *  the pair predicate) and through DuckDB's ST_Intersects / ST_Within / ST_Contains on the same coordinates. The cases are
 *  grouped by WHAT KIND OF INPUT they are, because equivalence is a property of the input class: a join over interior
 *  points is the same question for both; a polygon that crosses ±180° is not.
 *  The result — which classes agree and which do not — is the table `js/gis-engine-domain.js` is built from. Nothing in this
 *  file is a gate: a gate that needs a native binary would be red on every machine that has none.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const w = {}; globalThis.window = w;
new Function('window', read('js/geodesy.js'))(w);
const { makeGisDatasets } = await import('../js/gis-datasets.js');
const { makeGisGeometry } = await import('../js/gis-geometry.js');
const { makeGisOps } = await import('../js/gis-ops.js');
const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
await geometry.ready();
w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;

const modPath = process.env.DUCKDB_MODULE;
if (!modPath) { console.error('DUCKDB_MODULE is not set (see the header of this file).'); process.exit(2); }
const duck = await import(pathToFileURL(modPath).href);
const inst = await duck.DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run('INSTALL spatial'); await con.run('LOAD spatial');

/* ── geometry helpers ──────────────────────────────────────────────────────────────────────────────────── */
const P = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const poly = (...rings) => ({ type: 'Polygon', coordinates: rings });
const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const mp = (...polys) => ({ type: 'MultiPolygon', coordinates: polys });
const L = (...c) => ({ type: 'LineString', coordinates: c });
const ringWkt = (r) => '(' + r.map((c) => c[0] + ' ' + c[1]).join(',') + ')';
function wkt(g) {
  if (g.type === 'Point') return `POINT(${g.coordinates[0]} ${g.coordinates[1]})`;
  if (g.type === 'LineString') return 'LINESTRING' + ringWkt(g.coordinates);
  if (g.type === 'Polygon') return 'POLYGON(' + g.coordinates.map(ringWkt).join(',') + ')';
  if (g.type === 'MultiPolygon') return 'MULTIPOLYGON(' + g.coordinates.map((p) => '(' + p.map(ringWkt).join(',') + ')').join(',') + ')';
  throw new Error('no wkt for ' + g.type);
}
let seed = 20261121; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/* Each class: { rights: [geom], lefts: [geom] } — every left against every right. */
const classes = {
  'interior points / convex polygons': (() => {
    const R = [poly(sq(100, 10, 130, 40)), poly(sq(-10, -10, 10, 10)), poly(sq(0, 50, 20, 70))];
    const Ls = []; for (let i = 0; i < 300; i++) Ls.push(P(-20 + rnd() * 160, -20 + rnd() * 100));
    return { rights: R, lefts: Ls };
  })(),
  'points ON an edge / vertex': (() => {
    const R = [poly(sq(0, 0, 10, 10))];
    return { rights: R, lefts: [P(5, 0), P(10, 5), P(0, 0), P(10, 10), P(5, 10), P(0, 7), P(5, 5)] };
  })(),
  'polygon / polygon sharing an edge or equal': (() => {
    const a = poly(sq(0, 0, 10, 10));
    return { rights: [a, poly(sq(10, 0, 20, 10)), poly(sq(2, 2, 8, 8)), poly(sq(0, 0, 10, 10)), poly(sq(10, 10, 20, 20)), poly(sq(30, 30, 40, 40))], lefts: [a, poly(sq(2, 2, 8, 8)), poly(sq(5, 5, 15, 15)), poly(sq(10, 0, 20, 10))] };
  })(),
  'holes': (() => {
    const R = [poly(sq(0, 0, 20, 20), sq(5, 5, 15, 15))];
    return { rights: R, lefts: [P(10, 10), P(2, 2), P(5, 10), P(15, 15), poly(sq(7, 7, 8, 8)), poly(sq(1, 1, 3, 3)), poly(sq(4, 4, 16, 16))] };
  })(),
  'lines': (() => {
    const R = [poly(sq(0, 0, 10, 10))];
    return { rights: R, lefts: [L([1, 1], [9, 9]), L([-5, 5], [15, 5]), L([0, 0], [10, 0]), L([11, 11], [12, 12]), L([5, 5], [5, 20])] };
  })(),
  'crossing ±180° (lon beyond 180)': (() => {
    const R = [poly(sq(170, -10, 190, 10))];
    return { rights: R, lefts: [P(179.5, 0), P(-179.5, 0), P(-170.5, 0), P(175, 0), P(-165, 0), P(180, 0), P(-180, 0)] };
  })(),
  'crossing ±180° (split as MultiPolygon)': (() => {
    const R = [mp([sq(170, -10, 180, 10)], [sq(-180, -10, -170, 10)])];
    return { rights: R, lefts: [P(179.5, 0), P(-179.5, 0), P(175, 0), P(-175, 0), P(180, 0), P(-180, 0), P(0, 0)] };
  })(),
  'ring around a pole': (() => {
    const ring = []; for (let i = 0; i <= 12; i++) ring.push([i * 30 - 180, 85]); ring.push([180, 90], [-180, 90], [-180, 85]);
    const R = [poly(ring)];
    return { rights: R, lefts: [P(0, 89), P(100, 87), P(-170, 86), P(0, 80), P(0, 90), P(45, 85)] };
  })(),
  'long edges (great circle vs plane)': (() => {
    const R = [poly([[-60, 55], [60, 55], [60, 70], [-60, 70], [-60, 55]])];
    return { rights: R, lefts: [P(0, 55.5), P(0, 56.5), P(0, 58.5), P(0, 69), P(0, 71), P(30, 57)] };
  })()
};

const out = [];
for (const [name, c] of Object.entries(classes)) {
  const cands = c.lefts.map(() => c.rights.map((_, j) => j));
  await con.run('CREATE OR REPLACE TABLE l(i INTEGER, g GEOMETRY)'); await con.run('CREATE OR REPLACE TABLE r(j INTEGER, g GEOMETRY)');
  for (let i = 0; i < c.lefts.length; i++) await con.run(`INSERT INTO l VALUES (${i}, ST_GeomFromText('${wkt(c.lefts[i])}'))`);
  for (let j = 0; j < c.rights.length; j++) await con.run(`INSERT INTO r VALUES (${j}, ST_GeomFromText('${wkt(c.rights[j])}'))`);
  for (const [pred, fn] of [['intersects', 'ST_Intersects'], ['within', 'ST_Within'], ['contains', 'ST_Contains']]) {
    const here = geometry.relateBlock(c.rights, c.lefts, cands, pred, null);
    const mine = new Set(); here.hits.forEach((h, i) => h.forEach((j) => mine.add(i + ':' + j)));
    const rows = (await (await con.run(`SELECT l.i, r.j FROM l, r WHERE ${fn}(l.g, r.g)`)).getRows());
    const theirs = new Set(rows.map((r) => Number(r[0]) + ':' + Number(r[1])));
    const onlyMine = [...mine].filter((k) => !theirs.has(k)), onlyTheirs = [...theirs].filter((k) => !mine.has(k));
    out.push({ class: name, predicate: pred, pairs: c.lefts.length * c.rights.length, failed: here.failed, onlyIntMap: onlyMine.length, onlyDuckDB: onlyTheirs.length, sample: [...onlyMine, ...onlyTheirs].slice(0, 3) });
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else for (const o of out) console.log((o.onlyIntMap + o.onlyDuckDB === 0 ? 'SAME ' : 'DIFF ') + o.class.padEnd(44) + o.predicate.padEnd(11) + ` pairs=${o.pairs} failed=${o.failed} onlyIntMap=${o.onlyIntMap} onlyDuckDB=${o.onlyDuckDB} ${o.sample.join(' ')}`);
process.exit(0);
