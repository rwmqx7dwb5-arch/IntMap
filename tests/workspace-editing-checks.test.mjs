/* workspace-editing — the rules of editing a board's table (js/board-edit.js), pure, plus that the two
   capabilities are declared with the schema the dispatch reads. The page-level behaviour is
   tests/workspace-editing.spec.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCell, columnUses, renameInSpec, snapshotRows, diffRows, deltaText, editRefusal } from '../js/board-edit.js';
import caps from '../js/atlas-cap-board.js';

const L = (en) => en;
const rows = (a) => a.map((p) => ({ properties: p }));

test('parseCell: a number column takes a number or refuses; text stays text; empty clears', () => {
  assert.deepEqual(parseCell('1,234.5', [1, 2]), { ok: true, value: 1234.5 });
  assert.equal(parseCell('lots', [1, 2]).ok, false);
  assert.deepEqual(parseCell('x', ['a', 'b']), { ok: true, value: 'x' });
  assert.deepEqual(parseCell('  ', [1]), { ok: true, value: null });
  assert.deepEqual(parseCell('7', []), { ok: true, value: '7' });   /* an empty column has no type to hold the reader to */
});

const spec = { data: { lngField: 'lng', timeField: 'at' }, widgets: [
  { id: 'c', kind: 'chart', x: 'name', y: 'pop' }, { id: 't', kind: 'table', columns: ['name', 'pop'] },
  { id: 'm', kind: 'metrics', items: [{ label: 'T', agg: 'sum', field: 'pop' }] }, { id: 'f', kind: 'filter', field: 'kind' } ] };

test('columnUses finds every reader of a column; renameInSpec carries all of them and does not mutate', () => {
  assert.deepEqual(columnUses(spec, 'pop').map((u) => u.widget + '.' + u.role).sort(), ['c.y', 'm.items[0].field', 't.columns']);
  assert.deepEqual(columnUses(spec, 'lng'), [{ widget: '', kind: 'data', role: 'lngField' }]);
  assert.equal(columnUses(spec, 'unused').length, 0);
  const n = renameInSpec(spec, 'pop', 'people');
  assert.equal(columnUses(n, 'pop').length, 0); assert.equal(columnUses(n, 'people').length, 3);
  assert.equal(columnUses(spec, 'pop').length, 3);
});

test('diffRows is computed from the rows: an edited-then-restored value is not in it; columns and rows appended are named', () => {
  const base = snapshotRows(rows([{ n: 'a', v: 1 }, { n: 'b', v: 2 }]));
  assert.equal(diffRows(base, rows([{ n: 'a', v: 1 }, { n: 'b', v: 2 }])).cells.length, 0);
  const d = diffRows(base, rows([{ n: 'a', v: 9, w: 0 }, { n: 'b', v: 2, w: 0 }, { n: 'c', v: 3, w: 0 }]));
  assert.deepEqual(d.cells, [{ index: 0, field: 'v', from: 1, to: 9 }]);
  assert.deepEqual(d.added, ['w']); assert.deepEqual(d.removed, []); assert.deepEqual(d.rows, { base: 2, now: 3 });
  assert.deepEqual(diffRows(base, rows([{ n: 'a' }, { n: 'b' }])).removed, ['v']);
});

test('diffRows follows a rename: an edit after it is still an edit of that column, and the rename is named, not a removal plus an addition', () => {
  const base = snapshotRows(rows([{ n: 'a', pop: 1 }]));
  const d = diffRows(base, rows([{ n: 'a', people: 5 }]), [{ from: 'pop', to: 'people' }]);
  assert.deepEqual(d.cells, [{ index: 0, field: 'people', from: 1, to: 5 }]);
  assert.deepEqual(d.renamed, [{ from: 'pop', to: 'people' }]); assert.deepEqual(d.added, []); assert.deepEqual(d.removed, []);
  const chain = diffRows(base, rows([{ n: 'a', z: 1 }]), [{ from: 'pop', to: 'y' }, { from: 'y', to: 'z' }]);
  assert.equal(chain.cells.length, 0); assert.deepEqual(chain.renamed, [{ from: 'pop', to: 'z' }]);
});

test('deltaText states edits, filters, selection, and how many it left out', () => {
  const delta = { cells: Array.from({ length: 35 }, (_, i) => ({ index: i, field: 'v', from: i, to: i + 1 })), added: ['w'], removed: [], rows: { base: 35, now: 35 } };
  const t = deltaText({ delta, state: { filters: { a: { field: 'kind', values: ['x'] } }, selection: [0], time: { year: 1990 } }, title: 'T', L });
  assert.match(t, /Edited values \(35\)/); assert.match(t, /… and 5 more/); assert.match(t, /Added columns: w/);
  assert.match(t, /kind ∈ \{x\}/); assert.match(t, /up to 1990/);
  assert.match(deltaText({ delta: { cells: [], added: [], removed: [] }, state: {}, title: 'T', L }), /No edits yet/);
});

test('editRefusal speaks for the data layer\'s codes and shows an unknown code as itself', () => {
  assert.match(editRefusal('edit-would-contradict-recipe', null, L), /GIS step/);
  assert.match(editRefusal('field-has-dependents', { dependents: ['ds-2'] }, L), /ds-2/);
  assert.equal(editRefusal('something-new', null, L), 'something-new');
});

test('board.edit and board.delta are declared capabilities with a schema', () => {
  for (const id of ['board.edit', 'board.delta']) {
    const e = caps.find((c) => c.row[0] === id); assert.ok(e, id);
    assert.equal(typeof e.run, 'function'); assert.equal(e.schema().type, 'object');
  }
  assert.deepEqual(caps.find((c) => c.row[0] === 'board.edit').schema().required, ['op']);
});
