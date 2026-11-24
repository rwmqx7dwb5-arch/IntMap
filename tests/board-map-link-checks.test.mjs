/* The board's link to IntMap's real map and master clock (js/board-link.js), the time window in the store,
   and the `board` block that puts a board declaration inside a ui.compose view. The engine and the clock are
   fakes: what is measured is the wiring (who writes the store, who reads it, what is left behind). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardState } from '../js/board-state.js';
import { normalise, yearOf, rowsToFeatures } from '../js/board-spec.js';
import { attachMap, followClock, toCollection, bboxOf } from '../js/board-link.js';
import { checkView, BLOCKS, KINDS, viewSchema } from '../js/atlas-ui-spec.js';

const rows = [
  { name: 'A', pop: 10, when: '1990-05-01', lng: 139, lat: 35 },
  { name: 'B', pop: 30, when: 2005, lng: 2, lat: 48 },
  { name: 'C', pop: 5, when: 'unknown', lng: 10, lat: 10 },
];
const feats = rowsToFeatures(rows, 'lng', 'lat');
const L = (en) => en;

function board(over) {
  const state = createBoardState(over && over.state);
  const B = { id: 'T', state, rows: feats, yearOf: (r) => yearOf(r.properties.when), vis() { return state.visible(B.rows, B.yearOf); } };
  return B;
}
function fakeEngine() {
  const sources = new Map(), layers = new Map(), handlers = new Map(), fits = [];
  return {
    sources, layers, handlers, fits,
    GE: {
      layers: {
        addSource: (id, d) => { sources.set(id, d.data); }, hasSource: (id) => sources.has(id), removeSource: (id) => { sources.delete(id); },
        setSourceData: (id, d) => { sources.set(id, d); },
        add: (d) => { layers.set(d.id, d); }, has: (id) => layers.has(id), remove: (id) => { layers.delete(id); },
      },
      onLayer: (e, l, cb) => { handlers.set(l, cb); }, offLayer: (e, l) => { handlers.delete(l); },
      fitBounds: (b) => { fits.push(b); },
    },
  };
}

test('yearOf reads years and leading ISO years, and nothing else', () => {
  assert.equal(yearOf(1999), 1999); assert.equal(yearOf('2011-03-11'), 2011); assert.equal(yearOf('-0322-01-01'), -322);
  assert.equal(yearOf(1.5e12), null); assert.equal(yearOf('unknown'), null); assert.equal(yearOf(null), null);
});

test('the time window counts unknown years OUT, and follows upto / at', () => {
  const B = board();
  assert.deepEqual(B.vis(), [0, 1, 2]);   /* no window: everything */
  B.state.setTime({ year: 2000, mode: 'upto' });
  assert.deepEqual(B.vis(), [0]);          /* 2005 is later; "unknown" is not inside */
  B.state.setTime({ year: 2005, mode: 'at' });
  assert.deepEqual(B.vis(), [1]);
  B.state.setTime(null);
  assert.equal(B.vis().length, 3);
  /* the window survives a snapshot */
  B.state.setTime({ year: 1990, mode: 'upto' });
  assert.deepEqual(createBoardState(B.state.snapshot()).get().time, { year: 1990, mode: 'upto' });
});

test('a time widget needs a real timeField column', () => {
  const base = { source: 's', data: { rows, lngField: 'lng', latField: 'lat' }, widgets: [{ kind: 'time' }] };
  assert.equal(normalise(base, null).issues[0].why, 'time-needs-data.timeField');
  assert.match(normalise({ ...base, data: { ...base.data, timeField: 'zzz' } }, null).issues[0].why, /unknown-column:zzz/);
  const ok = normalise({ ...base, data: { ...base.data, timeField: 'when' }, widgets: [{ kind: 'time', mode: 'at' }, { kind: 'map', link: true }] }, null);
  assert.ok(ok.ok); assert.equal(ok.spec.widgets[0].section, 'Time'); assert.equal(ok.spec.widgets[1].link, true);
});

test('attachMap: rows are drawn with their row index; a click on the real map selects; the store paints the overlay; detach leaves nothing', () => {
  const E = fakeEngine(), B = board();
  const h = attachMap(B, { GE: E.GE });
  assert.ok(h.attached);
  assert.deepEqual([...E.sources.keys()].sort(), ['bd-T', 'bd-T-sel']);
  assert.equal(E.sources.get('bd-T').features.length, 3);
  assert.deepEqual(E.sources.get('bd-T').features.map((f) => f.properties.__bdi), [0, 1, 2]);
  /* map → store */
  E.handlers.get('bd-T-pt')({ features: [{ properties: { __bdi: 1 } }] });
  assert.deepEqual(B.state.get().selection, [1]);
  assert.deepEqual(E.sources.get('bd-T-sel').features.map((f) => f.properties.__bdi), [1]);
  assert.equal(E.fits.length, 0, 'a click on the map does not re-aim the camera');
  /* store → map, from another element: highlights and fits */
  B.state.select([0], 'table');
  assert.deepEqual(E.sources.get('bd-T-sel').features.map((f) => f.properties.__bdi), [0]);
  assert.equal(E.fits.length, 1);
  /* a filter hides the row on the real map too, and a hidden row is not highlighted */
  B.state.setFilter('f', { field: 'pop', min: 20, max: 40 }, 'f');
  assert.deepEqual(E.sources.get('bd-T').features.map((f) => f.properties.__bdi), [1]);
  assert.equal(E.sources.get('bd-T-sel').features.length, 0);
  h.detach();
  assert.equal(E.sources.size, 0); assert.equal(E.layers.size, 0); assert.equal(E.handlers.size, 0);
  const n = E.fits.length; B.state.select([1], 'table'); assert.equal(E.fits.length, n, 'detached: no longer listening');
});

test('attachMap says why it could not attach', () => {
  assert.equal(attachMap(board(), { GE: null }).why, 'no-engine');
  const E = fakeEngine(); E.GE.layers.add = () => { throw new Error('no'); };
  const r = attachMap(board(), { GE: E.GE }); assert.equal(r.attached, false); assert.equal(r.why, 'draw-not-rendered'); assert.equal(E.sources.size, 0);
});

test('followClock: the clock writes the store, the widget writes the clock, and neither echoes', () => {
  const B = board(); let year = 1980; const subs = []; const sets = [];
  const Time = { year: () => year, on: (f) => { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); }, setYear: (y) => { sets.push(y); year = y; subs.forEach((f) => f({})); } };
  B.state.setTime({ year: 1980, mode: 'upto' }, 'link');
  const off = followClock(B, { Time });
  year = 2001; subs.forEach((f) => f({}));                    /* Chronos moves */
  assert.equal(B.state.get().time.year, 2001); assert.deepEqual(sets, [], 'a clock move is not sent back to the clock');
  B.state.setTime({ year: 1995, mode: 'upto' }, 'time1');     /* the widget moves */
  assert.deepEqual(sets, [1995]); assert.equal(B.state.get().time.year, 1995);
  off(); B.state.setTime({ year: 1900, mode: 'upto' }, 'time1'); assert.deepEqual(sets, [1995]);
  assert.equal(typeof followClock(B, {}), 'function');         /* no clock: a no-op, not a throw */
});

test('bbox and collection helpers skip rows with no position', () => {
  assert.equal(bboxOf(feats, [0, 1]).x0, 2);
  assert.equal(toCollection(rowsToFeatures([{ a: 1 }], 'x', 'y'), [0]).features.length, 0);
});

test('a ui.compose view can carry a board declaration, checked by the board gate', () => {
  assert.ok(KINDS.includes('board')); assert.ok(BLOCKS.board);
  const board = { source: 's', data: { rows, lngField: 'lng', latField: 'lat', timeField: 'when' }, widgets: [{ kind: 'table' }, { kind: 'time' }, { kind: 'map', link: true }] };
  assert.ok(checkView({ blocks: [{ kind: 'board', board }] }, L).ok);
  const bad = checkView({ blocks: [{ kind: 'board', board: { ...board, widgets: [{ kind: 'chart', x: 'name', y: 'nope' }] } }] }, L);
  assert.ok(!bad.ok); assert.ok(bad.problems.some((p) => p.at.startsWith('blocks[0].board') && /unknown-column:nope/.test(p.why)));
  assert.ok(!checkView({ blocks: [{ kind: 'board' }] }, L).ok);
  assert.ok(viewSchema().properties.blocks.items.properties.board);
});
