/* The board and the view are ONE screen-composer with two doors: a view (`ui.compose`) can carry a live board, the board
   shares the view's string rules, and the board's time / objects / metrics widgets read the shared store. Pure checks:
   the modules are evaluated, nothing is read from their source text. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardState } from '../js/board-state.js';
import { normalise, KINDS } from '../js/board-spec.js';
import { textProblems } from '../js/ui-text-rules.js';
import { checkView, BLOCKS, viewSchema } from '../js/atlas-ui-spec.js';
import { objectRows } from '../js/atlas-cap-board.js';
import { worldObjects } from '../js/atlas-world-objects.js';

const L = (en) => en;
const rows = [
  { name: 'A', pop: 10, at: '1990-01-01', lng: 139, lat: 35 },
  { name: 'B', pop: 30, at: '2005-06-01', lng: 2, lat: 48 },
  { name: 'C', pop: 5, at: '2020-03-01', lng: 10, lat: 50 },
];
const spec = (widgets, data) => ({ title: 'T', source: 'unit test', data: { rows, lngField: 'lng', latField: 'lat', timeField: 'at', ...(data || {}) }, widgets });

test('every board widget kind has a section, and Time and Objects now exist', () => {
  const r = normalise(spec([{ kind: 'time' }, { kind: 'objects', typeField: 'name', nameField: 'name' }, { kind: 'metrics', items: [{ label: 'n', agg: 'count' }] }]), null);
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.deepEqual(r.spec.widgets.map((w) => w.section), ['Time', 'Objects', 'Analysis']);
  assert.ok(['metrics', 'time', 'objects'].every((k) => KINDS.includes(k)));
});

test('metrics, time and objects are refused by name when they cannot work', () => {
  const why = (w, d) => normalise(spec(w, d), null).issues.map((i) => i.path + ' ' + i.why).join('|');
  assert.match(why([{ kind: 'metrics', items: [{ label: 'x', agg: 'sum', field: 'nope' }] }]), /unknown-column:nope/);
  assert.match(why([{ kind: 'metrics', items: [{ label: 'x', agg: 'median', field: 'pop' }] }]), /unknown-agg:median/);
  assert.match(why([{ kind: 'metrics' }]), /metrics-need-items/);
  /* a clock widget over data with no time column would be a slider that changes nothing */
  assert.match(why([{ kind: 'time' }], { timeField: '' }), /time-needs-data\.timeField/);
  assert.match(why([{ kind: 'table' }], { timeField: 'when' }), /unknown-column:when/);
});

test('a board shares the view\'s string rules: a URL or a tag in anything Atlas wrote is refused', () => {
  assert.equal(textProblems('plain text, a < b', L).length, 0);
  assert.deepEqual(textProblems('see https://x.example', L).map((p) => p.code), ['url']);
  assert.deepEqual(textProblems('<img src=x onerror=y>', L).map((p) => p.code), ['markup']);
  assert.match(normalise({ ...spec([{ kind: 'table' }]), title: '<b>hi</b>' }, null).issues[0].why, /markup/);
  assert.match(normalise({ ...spec([{ kind: 'table', title: 'go to www.example.com/x' }]) }, null).issues[0].why, /url/);
  /* and the view checker uses the very same function: its refusal sentence IS textProblems' */
  const v = checkView({ blocks: [{ kind: 'text', md: 'https://x.example' }] }, L);
  assert.equal(v.problems[0].why, textProblems('https://x.example', L)[0].why);
});

test('a view can carry a live board: the block is in the table, the schema and the check', () => {
  assert.equal(BLOCKS.board.via, 'board');
  assert.ok(viewSchema().properties.blocks.items.properties.kind.enum.includes('board'));
  assert.ok(checkView({ blocks: [{ kind: 'board', board: { source: 's', data: { rows: [{ a: 1 }] }, widgets: [{ kind: 'table' }] } }] }, L).ok);
  /* the delegated object's strings are judged like any other */
  assert.equal(checkView({ blocks: [{ kind: 'board', board: { source: 'https://x.example' } }] }, L).problems[0].code, 'url');
  assert.equal(checkView({ blocks: [{ kind: 'board' }] }, L).problems[0].code, 'missing');
});

test('the clock narrows what is visible, and a row with no readable moment is counted out', () => {
  const st = createBoardState();
  const feats = rows.map((r) => ({ properties: r })).concat([{ properties: { name: 'D', pop: 1, at: '' } }]);
  const timeOf = (r) => { const t = Date.parse(r.properties.at); return Number.isFinite(t) ? t : null; };
  assert.equal(st.visible(feats, timeOf).length, 4, 'no clock set: nothing is filtered by time');
  st.setTime(Date.parse('2006-01-01'), 'clock');
  assert.deepEqual(st.visible(feats, timeOf), [0, 1]);
  st.setTime(Date.parse('2030-01-01'), 'clock');
  assert.deepEqual(st.visible(feats, timeOf), [0, 1, 2], 'D has no moment');
  let heard = 0; st.subscribe((e) => { if (e.what === 'time') heard++; });
  st.setTime(Date.parse('2030-01-01'), 'clock');   /* the same instant again says nothing */
  st.setTime(null, 'clock'); assert.equal(heard, 1);
  assert.equal(st.visible(feats, timeOf).length, 4);
  /* the clock is a mirror, never saved */
  st.setTime(1, 'clock'); assert.equal('time' in st.snapshot(), false);
});

test('the session\'s world objects become rows the board can sort, locate and place in time', () => {
  worldObjects.clear();
  worldObjects.register([worldObjects.fromCity({ name: 'Osaka', lng: 135.5, lat: 34.7 })]);
  const r = objectRows({});
  assert.equal(r.length, 1);
  assert.equal(r[0].name, 'Osaka'); assert.equal(r[0].type, 'city'); assert.equal(r[0].lng, 135.5);
  assert.equal(typeof r[0].related, 'number');
  assert.equal(objectRows({ types: ['quake'] }).length, 0);
  worldObjects.clear();
});
