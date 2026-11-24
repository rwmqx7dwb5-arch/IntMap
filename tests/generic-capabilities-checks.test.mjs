/* ============================================================================
 *  IntMap · the shipped data is askable as data — not through the one question it was built for
 * ----------------------------------------------------------------------------
 *  dev-notes/2026-11-25-generic-capabilities.md. Until this change the power plants, the ports, the
 *  rail access to ports and the Japanese prefecture indicators were readable only through capabilities
 *  built around one question each (research.portImpact «this port stops», siting.compare «compare
 *  prefectures for a plant»), and the power plants were cut down to that question's shape (1,028 fossil
 *  plants within 30 km of a port, of 34,936). Each data file now declares its own tables
 *  (`rowTables`), scripts/data-tables.mjs indexes them into js/data-tables.js, and js/atlas-query.js
 *  serves every declared table to data.query.
 *
 *  These checks run the SHIPPED engine on the SHIPPED files and ask it questions neither removed
 *  capability was built for, alongside the ones they were — the point is that both are the same mechanism.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readData = async (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function useWindow(t, win, doc) {
  const had = { w: Object.prototype.hasOwnProperty.call(globalThis, 'window'), wv: globalThis.window,
    d: Object.prototype.hasOwnProperty.call(globalThis, 'document'), dv: globalThis.document };
  globalThis.window = win;
  globalThis.document = doc;
  t.after(() => {
    if (had.w) globalThis.window = had.wv; else delete globalThis.window;
    if (had.d) globalThis.document = had.dv; else delete globalThis.document;
  });
}
async function engine(t) {
  useWindow(t, {}, { baseURI: 'http://localhost/' });
  const { atlasQuery } = await importModule('js/atlas-query.js');
  const API = atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn, loadData: readData, fetchJSON: async () => { throw new Error('no network in this test'); } });
  return API;
}

test('① the index is what the data files declare (scripts/data-tables.mjs --check)', async () => {
  const { discover, render } = await import('../scripts/data-tables.mjs');
  const idx = discover();
  assert.equal(fs.readFileSync(path.join(ROOT, 'js', 'data-tables.js'), 'utf8').replace(/\r\n/g, '\n'), render(idx));
  for (const id of ['power-plants', 'ports', 'rail-port-access', 'jp-prefecture-indicators', 'jp-industrial-land-prices']) {
    assert.ok(idx.some((x) => x.id === id), id + ' is declared');
  }
});

test('② every declared table is a data.query table, listed with its columns and source', async (t) => {
  const API = await engine(t);
  const { DATA_TABLES } = await importModule('js/data-tables.js');
  const ls = await API.tableListing();
  for (const d of DATA_TABLES) {
    const row = ls.find((x) => x.id === d.id);
    assert.ok(row, d.id + ' is listed');
    assert.equal(row.rows, d.count);
    for (const c of d.columns) assert.ok(row.columns.some((x) => x.id === c.key), d.id + ' lists ' + c.key);
  }
  const out = await API.answer({ list: true }, {});
  assert.equal(out.ok, true);
  assert.ok(out.result.tables.some((x) => x.id === 'power-plants'));
});

test('③ the power plants are the whole database, not one question\'s cut of it', async (t) => {
  const API = await engine(t);
  const hydro = await API.run({ from: 'power-plants', where: [{ col: 'fuel', op: '==', value: 'Hydro' }, { col: 'capacityMw', op: '>=', value: 10000 }], order: { col: 'capacityMw', dir: 'desc' }, limit: 5 });
  assert.equal(hydro.ok, true, JSON.stringify(hydro.error));
  assert.ok(hydro.rows.length >= 1, 'a hydro plant of 10 GW or more is in the table (e.g. the Three Gorges)');
  assert.ok(hydro.rows.every((r) => r.v.capacityMw >= 10000));
});

test('④ the same tables answer «fossil plants near a port» and «where a city\'s rail traffic goes if its port stops» — by query', async (t) => {
  const API = await engine(t);
  const near = await API.run({ from: 'power-plants', where: [{ col: 'fuel', op: 'in', values: ['Coal', 'Oil', 'Gas', 'Petcoke'] }],
    near: [{ of: 'ports', withinKm: 30, require: true, where: [{ col: 'locode', op: '==', value: 'NLRTM' }] }], limit: 50 });
  assert.equal(near.ok, true, JSON.stringify(near.error));
  assert.ok(near.matched >= 1, 'fossil plants stand within 30 km of Rotterdam');
  const hinter = await API.run({ from: 'rail-port-access', where: [{ col: 'port1Locode', op: '==', value: 'NLRTM' }], show: ['port2', 'port2RailKm'], limit: 200 });
  assert.equal(hinter.ok, true, JSON.stringify(hinter.error));
  assert.ok(hinter.matched >= 1, 'some places reach Rotterdam first by rail');
  assert.ok(hinter.rows.some((r) => typeof r.v.port2 === 'string' && r.v.port2.length), 'the next port is a NAME read through the ports table');
});

test('⑤ a table with no coordinates is ordered and filtered like any other', async (t) => {
  const API = await engine(t);
  const res = await API.run({ from: 'jp-prefecture-indicators', order: { col: 'labor_min_wage', dir: 'desc' }, show: ['labor_min_wage', 'land_ind_median'], limit: 3 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.rows.length, 3);
  assert.ok(res.rows[0].v.labor_min_wage >= res.rows[1].v.labor_min_wage);
});
