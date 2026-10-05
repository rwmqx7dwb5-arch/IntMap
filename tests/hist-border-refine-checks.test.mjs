/* (hist-border-refine) a coarse historical boundary is redrawn along a river or wall ONLY where a reviewed
   fact says the boundary followed it — and the redraw changes the stroked line and nothing else.
   The builder (scripts/build-hist-courses.mjs) decides; js/border-coast.js only splices. Both are run here,
   the builder's rules on synthetic rings whose answer is known, the reader on the same substitutions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { substitutionsOf, pathAlong, factProblems, dayOf, check, derive, RECORDS, MIRRORS, OUT } from '../scripts/build-hist-courses.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* a river running due east along 45° N from 20° E to 22° E, with an OSM-like vertex every 0.01° */
const RIVER = Array.from({ length: 201 }, (_, i) => [20 + i * 0.01, 45]);
function ix(line) {
  /* the builder's own index, through its exported derivation (a course object as build() makes it) */
  const KM = 111.32, RAD = Math.PI / 180;
  const cum = [0]; for (let i = 1; i < line.length; i++) { const a = line[i - 1], b = line[i], k = Math.cos((a[1] + b[1]) / 2 * RAD); cum.push(cum[i - 1] + Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * KM); }
  const locate = (p) => { let best = { d: Infinity, at: 0 };
    for (let i = 0; i + 1 < line.length; i++) { const a = line[i], b = line[i + 1], k = Math.cos(p[1] * RAD);
      const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1], vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
      let t = L ? -(ax * vx + ay * vy) / L : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ax + t * vx, ay + t * vy) * KM;
      if (d < best.d) best = { d, at: cum[i] + t * (cum[i + 1] - cum[i]) }; }
    return best; };
  return { line, cum, locate, bbox: [20, 45, 22, 45] };
}
const IX = ix(RIVER), TOL = 13.5, never = () => false;
/* a coarse polygon north of the river: its south edge is a chord 5 km north of it, the rest well inland */
const NORTH = [[20.2, 45.045], [21.8, 45.045], [21.8, 46], [20.2, 46], [20.2, 45.045]];

test('a chord within the record\'s error of a documented river is redrawn along the river\'s own vertices', () => {
  const subs = substitutionsOf(NORTH, [[0, NORTH.length - 1]], 0, IX, TOL, never, []);
  assert.equal(subs.length, 1);
  const [a, b, ci, i0, i1] = subs[0];
  assert.deepEqual([a, b, ci], [0, 1, 0]);
  /* the course vertices between the projections of the chord's ends — nothing interpolated */
  assert.ok(RIVER[i0][0] >= 20.2 - 1e-9 && RIVER[i1][0] <= 21.8 + 1e-9 && i1 > i0);
});

test('nothing moves where the ring leaves the river by more than the record\'s error', () => {
  const far = [[20.2, 45.2], [21.8, 45.2], [21.8, 46], [20.2, 46], [20.2, 45.2]];   /* 22 km north */
  assert.deepEqual(substitutionsOf(far, [[0, far.length - 1]], 0, IX, TOL, never, []), []);
  /* a chord that leaves the river BETWEEN two vertices on it is caught by the walk along the edge */
  const bow = [[20.2, 45.01], [21, 45.4], [21.8, 45.01], [21.8, 46], [20.2, 46], [20.2, 45.01]];
  assert.deepEqual(substitutionsOf(bow, [[0, bow.length - 1]], 0, IX, TOL, never, []), []);
});

test('a stretch shorter than the record\'s own error is not one the record can be said to have drawn', () => {
  const short = [[20.2, 45.045], [20.3, 45.045], [20.3, 46], [20.2, 46], [20.2, 45.045]];   /* ~8 km */
  assert.deepEqual(substitutionsOf(short, [[0, short.length - 1]], 0, IX, TOL, never, []), []);
});

test('a vertex on a more precise record\'s line, or at a named exception, keeps the coarse line', () => {
  const onAbove = (p) => Math.abs(p[0] - 21.8) < 1e-9 && Math.abs(p[1] - 45.045) < 1e-9;
  const three = [[20.2, 45.045], [21.0, 45.045], [21.8, 45.045], [21.8, 46], [20.2, 46], [20.2, 45.045]];
  const s = substitutionsOf(three, [[0, three.length - 1]], 0, IX, TOL, onAbove, []);
  assert.deepEqual(s.map((x) => [x[0], x[1]]), [[0, 1]], 'the vertex on the record above was moved');
  /* an exception: the redraw runs along the course up to the exception's edge on either side, never over it,
     and the ring's own vertex at the exception stays where the record put it */
  const ex = [{ place: 'a bridgehead', lon: 21.0, lat: 45.0, km: 3 }];
  const sx = substitutionsOf(three, [[0, three.length - 1]], 0, IX, TOL, never, ex);
  assert.ok(!sx.some((x) => x[0] <= 1 && 1 <= x[1]), 'the vertex at the exception was moved');
  const drawn = sx.flatMap((x) => { const lo = Math.min(x[3], x[4]), hi = Math.max(x[3], x[4]); return RIVER.slice(lo, hi + 1); });
  const kmFrom = (p) => Math.hypot((p[0] - 21.0) * Math.cos(45 * Math.PI / 180), p[1] - 45.0) * 111.32;
  assert.ok(drawn.length && drawn.every((p) => kmFrom(p) >= 3 - 1e-6), 'the course was drawn over the exception');
  assert.ok(drawn.some((p) => kmFrom(p) < 4) , 'the redraw stopped short of the exception instead of running up to its edge');
});

test('only drawn runs are redrawn — a coast run the marks leave unstroked stays unstroked', () => {
  /* runs [2, 4] only: the south edge (0→1) is not drawn, so it is not redrawn */
  assert.deepEqual(substitutionsOf(NORTH, [[2, 4]], 0, IX, TOL, never, []), []);
});

test('the reader splices the course into the run, and the two sides of one boundary coincide', async () => {
  const SOUTH = [[20.2, 44.96], [20.2, 44], [21.8, 44], [21.8, 44.96], [20.2, 44.96]];
  const sN = substitutionsOf(NORTH, [[0, NORTH.length - 1]], 0, IX, TOL, never, []);
  const sS = substitutionsOf(SOUTH, [[0, SOUTH.length - 1]], 0, IX, TOL, never, []);
  const win = { __IMBCOURSE: { v: 1, courses: [{ line: RIVER, days: [1500101, 2500101] }], sets: { t: { global: '__T', rings: 2, sub: { 0: sN, 1: sS } } } },
    __T: { rings: [NORTH, SOUTH], feats: [] } };
  const doc = { createElement: () => ({}), head: { appendChild: () => {} } };
  const { IntMapBorderCoast: BC } = await importModule('js/border-coast.js', { globals: { window: win, document: doc } });
  await BC.loadCourses();
  const fc = { type: 'FeatureCollection', features: [NORTH, SOUTH].map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } })) };
  /* outside the fact's days, and with no clock at all, the ring is drawn as the record draws it */
  assert.deepEqual(BC.wholeLines(fc, 1000701).features[0].geometry.coordinates[0], NORTH, 'redrawn before the fact holds');
  assert.deepEqual(BC.wholeLines(fc).features[0].geometry.coordinates[0], NORTH, 'redrawn with no date');
  assert.ok(BC.courseEpoch(2000701) !== BC.courseEpoch(1000701) && BC.courseEpoch(2000701) === BC.courseEpoch(2400701));
  const [n, s] = BC.wholeLines(fc, 2000701).features.map((f) => f.geometry.coordinates[0]);
  /* both lines contain the river's vertices over the stretch both drew, and no vertex of the chord */
  const onRiver = (l) => l.filter((p) => p[1] === 45);
  assert.ok(onRiver(n).length > 100 && onRiver(s).length > 100);
  const key = (p) => p.join(',');
  const common = new Set(onRiver(n).map(key));
  assert.ok(onRiver(s).filter((p) => common.has(key(p))).length > 100, 'the two sides do not share the river\'s vertices');
  assert.ok(!n.some((p) => p[1] === 45.045 && p[0] > 20.2 && p[0] < 21.8));
  /* the line stays one continuous run: it ends where the ring's run ended */
  assert.deepEqual(n[n.length - 1], NORTH[NORTH.length - 1]);
  /* without the file, the ring is drawn exactly as before */
  const plain = await importModule('js/border-coast.js', { globals: { window: { __T: win.__T }, document: doc } });
  assert.deepEqual(plain.IntMapBorderCoast.wholeLines(fc).features[0].geometry.coordinates[0], NORTH);
});

test('the feature\'s path is the shortest walk along its own vertices', () => {
  const ways = [RIVER.slice(0, 101), RIVER.slice(100), [[21, 45], [21, 45.5], [21.5, 45.5]]];
  const p = pathAlong(ways, [20.3, 45.01], [21.7, 44.99]);
  assert.equal(p.line.length, 141);
  assert.ok(p.line.every((q) => RIVER.some((r) => r[0] === q[0] && r[1] === q[1])), 'a vertex was invented');
});

test('a course needs a named feature, a period, a polity and two sources before it can move a line', () => {
  const good = { id: 'x-y', feature: { kind: 'river', wikidata: 'Q1653', osm: { type: 'relation', ids: [89652] } }, from: [20, 45], to: [21, 45],
    span: ['-15', '602'], sides: [{ name: 'A', qid: 'Q2277' }], claim: 'The boundary followed the river on this stretch for the whole period.',
    sources: [{ cite: 'a', url: 'https://a.example', supports: 'x' }, { cite: 'b', url: 'https://b.example', supports: 'y' }] };
  assert.deepEqual(factProblems({ reviewed: [good] }), []);
  assert.ok(factProblems({ reviewed: [{ ...good, sources: good.sources.slice(0, 1) }] }).length);
  assert.ok(factProblems({ reviewed: [{ ...good, span: ['602', '-15'] }] }).length);
  assert.ok(factProblems({ reviewed: [{ ...good, sides: [{ name: 'A', qid: null }] }] }).length);
  assert.ok(factProblems({ notDrawn: [{ id: 'z', why: 'no' }] }).length, 'a claim not drawn must say why');
  /* historical years: 15 BC is astronomical −14 */
  assert.equal(dayOf('-15'), -14 * 10000 + 101);
  assert.equal(dayOf('1372-10-22'), 13721022);
});

test('only a coarse record is redrawn — never CShapes or OpenHistoricalMap', () => {
  assert.deepEqual(RECORDS.map((r) => r.global), ['__HISTCLIO']);
  /* the sheets are redrawn only where they carry Cliopatria's own edge (they were cut along it) */
  assert.deepEqual(MIRRORS.map((r) => r.global), ['__HISTERASREST']);
  if (!existsSync(OUT)) return;
  const w = {}; new Function('window', readFileSync(OUT, 'utf8'))(w);
  for (const s of Object.values(w.__IMBCOURSE.sets)) assert.ok([...RECORDS, ...MIRRORS].some((r) => r.global === s.global), s.global + ' is redrawn');
});

test('one boundary, one line: a neighbour that draws the same edge takes the same redraw', () => {
  /* two Cliopatria rows share the chord along the river: one is the polity the fact names, the other is not */
  const north = [[20.2, 45.045], [21.8, 45.045], [21.8, 46], [20.2, 46], [20.2, 45.045]];
  const south = [[20.2, 45.045], [20.2, 44], [21.8, 44], [21.8, 45.045], [20.2, 45.045]];
  const clio = { rings: [north, south], feats: [
    [{ en: 'A' }, 'Q1', 100, 1, 1, 300, 1, 1, [[0]]],
    [{ en: 'B' }, 'Q9', 50, 1, 1, 300, 1, 1, [[1]]],
  ] };
  const marks = { sets: { histclio: { rings: 2, draw: [1, 1] }, histerasrest: { rings: 0, draw: [] } } };
  const course = { id: 'x', sides: [{ name: 'A', qid: 'Q1' }], span: ['150', '250'], exceptions: [], ix: IX };
  const { sets } = derive([course], { bundles: { histclio: clio, histerasrest: { rings: [], snaps: [] } }, marks, onAboveOf: () => never });
  const sub = sets.histclio.sub;
  assert.ok(sub[0] && sub[1], 'the neighbour that draws the same edge was not redrawn with it');
  /* the course vertices each side draws (a closed ring repeats its first vertex, so a redraw may be split there) */
  const drawnBy = (l) => { const set = new Set(); for (const x of l) for (let i = Math.min(x[3], x[4]); i <= Math.max(x[3], x[4]); i++) set.add(i); return [...set].sort((p, q) => p - q); };
  assert.deepEqual(drawnBy(sub[0]), drawnBy(sub[1]), 'the two sides do not draw the same course vertices');
  assert.ok(drawnBy(sub[0]).length > 100);
  /* without the named polity drawing the edge, nothing moves */
  const lone = derive([course], { bundles: { histclio: { rings: [south], feats: [clio.feats[1].slice(0, 8).concat([[[0]]])] }, histerasrest: { rings: [], snaps: [] } },
    marks: { sets: { histclio: { rings: 1, draw: [1] }, histerasrest: { rings: 0, draw: [] } } }, onAboveOf: () => never });
  assert.deepEqual(lone.sets.histclio.sub, {});
});

test('the shipped data/hist-courses.js re-derives from the shipped files and the reviewed facts', () => {
  if (!existsSync(OUT)) return;
  assert.deepEqual(check(), []);
});
