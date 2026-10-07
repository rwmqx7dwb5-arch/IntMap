/* tle-carry-forward — a run that CelesTrak did not answer must not shrink the bundled catalogue.
 *
 * #1025: CelesTrak answered HTTP 500, the old build took SatNOGS's ~1,700 objects instead, and the
 * bundle fell from 15,956 to 1,685 sets (the live layer then drew 1,408/1,685). The composition rule
 * is scripts/lib/tle-compose.mjs, shared by the build script and this file.
 * RUN: the composition functions are evaluated on real element sets built here; nothing reads source. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeCatalogue, composeGroups, lastCelestrakAt, parseTle, epochMs, idOf } from '../scripts/lib/tle-compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* a well-formed 69-column set with the given NORAD id and epoch field (YYDDD.DDDDDDDD) */
const set = (id, epoch, name = 'SAT ' + id) => {
  const n = String(id).padStart(5, '0');
  const l1 = ('1 ' + n + 'U 98067A   ' + epoch + '  .00000000  00000-0  00000-0 0  9990').padEnd(69, '0');
  const l2 = ('2 ' + n + '  51.6000 000.0000 0000000 000.0000 000.0000 15.50000000000000').padEnd(69, '0');
  return [name, l1, l2];
};
const OLD = '26270.50000000', NEW = '26280.50000000';
const ids = (r) => r.kept.map(o => +idOf(o.l1)).sort((a, b) => a - b);

test('CelesTrak down + a small SatNOGS set: the count never falls below the previous bundle', () => {
  const previous = [1, 2, 3, 4, 5, 6].map(i => set(i, OLD));
  const satnogs = [set(2, NEW), set(3, NEW)];
  const r = composeCatalogue({ celestrak: null, satnogs, previous });
  assert.equal(r.celestrakAnswered, false);
  assert.deepEqual(ids(r), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.counts, { celestrak: 0, satnogs: 2, carried: 4 });
});

test('CelesTrak down and nothing else answered: the previous bundle ships as it was', () => {
  const previous = [1, 2, 3].map(i => set(i, OLD));
  const r = composeCatalogue({ celestrak: [], satnogs: null, previous });
  assert.deepEqual(ids(r), [1, 2, 3]);
  assert.equal(r.counts.carried, 3);
});

test('CelesTrak down: an object only SatNOGS knows (a new launch) joins the carried set', () => {
  const r = composeCatalogue({ celestrak: null, satnogs: [set(9, NEW)], previous: [set(1, OLD)] });
  assert.deepEqual(ids(r), [1, 9]);
});

test('CelesTrak answered: it is the whole truth — ids absent from its active set are dropped', () => {
  const previous = [1, 2, 3, 4].map(i => set(i, OLD));
  const r = composeCatalogue({ celestrak: [set(1, NEW), set(2, NEW)], satnogs: null, previous });
  assert.equal(r.celestrakAnswered, true);
  assert.deepEqual(ids(r), [1, 2]);
  assert.deepEqual(r.counts, { celestrak: 2, satnogs: 0, carried: 0 });
});

test('the same id: the newer epoch wins, whichever source it came from', () => {
  const newer = set(7, NEW, 'FROM-SATNOGS');
  const r1 = composeCatalogue({ celestrak: null, satnogs: [newer], previous: [set(7, OLD, 'CARRIED')] });
  assert.equal(r1.kept[0].name, 'FROM-SATNOGS');
  const r2 = composeCatalogue({ celestrak: null, satnogs: [set(7, OLD, 'STALE')], previous: [set(7, NEW, 'CARRIED')] });
  assert.equal(r2.kept[0].name, 'CARRIED', 'a carried set newer than the upstream one is kept');
  /* two-digit years wrap at 57: 1975 must not beat 2026 */
  assert.ok(epochMs(set(1, '75042.00000000')[1]) < epochMs(set(1, '26212.00000000')[1]));
  const r3 = composeCatalogue({ celestrak: [set(7, '26212.00000000', 'A'), set(7, NEW, 'B')], previous: [] });
  assert.equal(r3.kept.length, 1);
  assert.equal(r3.kept[0].name, 'B');
});

test('lastCelestrakAt: now when it answered, otherwise the previous record states it', () => {
  const now = '2026-10-07T00:00:00.000Z';
  assert.equal(lastCelestrakAt({ celestrakAnswered: true, now, previousManifest: {} }), now);
  assert.equal(lastCelestrakAt({ celestrakAnswered: false, now, previousManifest: { lastCelestrakAt: 'X', source: 'SatNOGS', builtAt: 'Y' } }), 'X');
  assert.equal(lastCelestrakAt({ celestrakAnswered: false, now, previousManifest: { source: 'CelesTrak GP (active)', builtAt: 'Y' } }), 'Y');
  assert.equal(lastCelestrakAt({ celestrakAnswered: false, now, previousManifest: { source: 'SatNOGS DB', builtAt: 'Y' } }), null, 'a SatNOGS builtAt is not a CelesTrak answer');
  assert.equal(lastCelestrakAt({ celestrakAnswered: false, now, previousManifest: null }), null);
});

test('groups: a group that did not answer keeps previous members the catalogue still holds', () => {
  const have = new Set(['1', '2', '3']);
  const r = composeGroups({
    wanted: ['visual', 'stations', 'geo', 'weather'],
    fetched: { visual: [3, 1] },
    previous: { visual: [9], stations: [2, 3, 99], geo: [] },
    have,
  });
  assert.deepEqual(r.groups, { visual: [1, 3], stations: [2, 3] });
  assert.deepEqual(r.carried, ['stations']);
  assert.ok(!('geo' in r.groups) && !('weather' in r.groups), 'a group never known stays absent, not empty');
});

test('the shipped bundle is a real, internally consistent composition input', () => {
  const sets = parseTle(fs.readFileSync(path.join(ROOT, 'data/tle/catalogue.tle'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tle/catalogue.json'), 'utf8'));
  assert.equal(sets.length, manifest.objects, 'the manifest counts the file');
  const r = composeCatalogue({ celestrak: null, satnogs: null, previous: sets });
  assert.equal(r.kept.length, sets.length, 'carrying the shipped bundle alone loses nothing');
  const groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tle/groups.json'), 'utf8')).groups;
  const have = new Set(sets.map(s => idOf(s[1]).replace(/^0+/, '')));
  for (const [g, list] of Object.entries(groups)) for (const id of list) assert.ok(have.has(String(id)), g + ' lists ' + id + ' the catalogue lacks');
});
