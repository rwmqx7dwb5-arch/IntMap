/* ============================================================================
 *  era-names-by-day — an era name changes on the day the state changed, not on 1 January
 *  (js/history.js histId `at`, js/time-borders.js tagSame and the `_CS_ERA` rule of 365)
 * ----------------------------------------------------------------------------
 *  The era identities were written in years, compared as `year>=from&&year<=to`. Two states sharing a year
 *  gave the whole year to whichever was listed first (1870 Second Empire, 1912 Qing, 1939 Spanish Republic …),
 *  and where the map's record changes on a day the label disagreed with it: 1990-10-03 to 12-31 the unified
 *  Germany was labelled «West Germany» (dev-notes/2026-10-08-sales-schools.md §3, photographed), and the Soviet
 *  Union kept its name to 31 December 1991. The map is evaluated here (scripts/history-pages.mjs `mapReader`
 *  instantiates js/time-borders.js and js/history.js over the real bundles).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';

const { mapReader } = await import('../scripts/history-pages.mjs');
const R = await mapReader();
const day = (y, m, d) => new Date(y, m - 1, d, 12);
/* the label the map writes for the shape that carries a gwcode on a day */
async function labelOf(gw, when) {
  const r = await R.labelsAt(when);
  const i = r.fc.features.findIndex((f) => f.properties._gw === gw);
  assert.ok(i >= 0, `the record draws gwcode ${gw} on ${when.toDateString()}`);
  return r.labels.en[i];
}

test('① Germany: «West Germany» until the day before reunification, «Germany» from 3 October 1990', async () => {
  assert.equal(await labelOf(260, day(1990, 10, 2)), 'West Germany');
  assert.equal(await labelOf(260, day(1990, 10, 3)), 'Germany', 'the record changed on 1990-10-03 and so does the name');
  assert.equal(await labelOf(260, day(1990, 12, 1)), 'Germany', 'MEASURED before: «West Germany» to 31 December');
});

test('② the Soviet Union is named until 20 December 1991, Russia from the 21st (the Alma-Ata Protocol, the record\'s edge)', async () => {
  assert.equal(await labelOf(365, day(1991, 12, 20)), 'Soviet Union');
  assert.equal(await labelOf(365, day(1991, 12, 27)), 'Russia', 'MEASURED before: «Soviet Union» to 31 December');
});

test('③ histId answers by day: two states that shared a year each hold their own part of it', async () => {
  const { histId } = await importModule('js/history.js', { globals: { window: { IntMapHistName: (n, i) => n[i] } } });
  const H = histId({});
  const name = (code, w) => { const e = H.at(code, w); return e ? e.name[0] : null; };
  assert.equal(name('FRA', '1870-09-03'), 'Second French Empire');
  assert.equal(name('FRA', '1870-09-04'), 'French Third Republic');
  assert.equal(name('CHN', '1912-02-11'), 'Qing Empire');
  assert.equal(name('CHN', '1912-02-12'), 'Republic of China');
  assert.equal(name('ESP', '1939-03-31'), 'Spanish Republic');
  assert.equal(name('ESP', '1939-04-01'), 'Francoist Spain');
  assert.equal(name('KOR', '1897-10-12'), 'Joseon');
  assert.equal(name('KOR', '1897-10-13'), 'Korean Empire');
  assert.equal(name('DEU', '1990-10-02'), 'West Germany');
  assert.equal(name('DEU', '1990-10-03'), null, 'unified Germany has no era identity — the present-day name stands');
  /* a Date is read on the local calendar, like the map's own record keys */
  assert.equal(name('DEU', new Date(1990, 9, 3, 0, 30)), null, 'local 00:30 on 3 October is already the unified Germany');
  /* a bare year is still read at 1 July — the sample the labels use for a year */
  assert.equal(name('ESP', 1939), 'Francoist Spain', '1 July 1939: the war had ended on 1 April');
  assert.equal(name('DEU', 1916), 'German Empire');
});
