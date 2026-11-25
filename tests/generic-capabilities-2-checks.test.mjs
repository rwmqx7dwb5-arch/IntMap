/* ============================================================================
 *  IntMap · every bundle that holds rows is a table Atlas can ask (the second pass)
 * ----------------------------------------------------------------------------
 *  dev-notes/2026-11-26-generic-capabilities-2.md. The first pass (tests/generic-capabilities-checks.test.mjs)
 *  declared the power plants, ports and prefecture indicators. This pass declares the rest of the bundles
 *  whose rows have a meaning of their own (airports, sanctions, border crossings, World Heritage, US
 *  elections, embassies, space sites, nuclear plants, small bodies, deep-sky objects, health, country facts,
 *  renamed cities, ancient places) and lets a record keyed by code be rows (`$key`) and a row name the
 *  candidate that won (`[w]`). These checks run the SHIPPED engine on the SHIPPED files.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readData = async (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

async function engine(t) {
  const had = { w: Object.prototype.hasOwnProperty.call(globalThis, 'window'), wv: globalThis.window,
    d: Object.prototype.hasOwnProperty.call(globalThis, 'document'), dv: globalThis.document };
  globalThis.window = {}; globalThis.document = { baseURI: 'http://localhost/' };
  t.after(() => { if (had.w) globalThis.window = had.wv; else delete globalThis.window; if (had.d) globalThis.document = had.dv; else delete globalThis.document; });
  const { atlasQuery } = await importModule('js/atlas-query.js');
  const API = atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn, loadData: readData, fetchJSON: async () => { throw new Error('no network in this test'); } });
  return API;
}

test('① the bundles declare their tables and the index is what they declare', async () => {
  const { discover, render } = await import('../scripts/data-tables.mjs');
  const { ROW_TABLES } = await import('../scripts/lib/row-tables.mjs');
  const idx = discover();
  assert.equal(fs.readFileSync(path.join(ROOT, 'js', 'data-tables.js'), 'utf8').replace(/\r\n/g, '\n'), render(idx));
  for (const [name, decl] of Object.entries(ROW_TABLES)) for (const d of decl) {
    const got = idx.find((x) => x.id === d.id);
    assert.ok(got, d.id + ' is in the index');
    assert.equal(got.file, 'data/' + name + '.json', d.id + ' is declared where it is built');
  }
});

test('② a builder keeps its declaration: each bundle in the module is written through withRowTables', () => {
  const names = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const src = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => /^build-.*\.mjs$/.test(f)).map((f) => fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8')).join('\n');
  const mod = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'row-tables.mjs'), 'utf8');
  const declared = [...mod.matchAll(/^  '?([a-z-]+)'?: \[\{/gm)].map((m) => m[1]);
  assert.ok(declared.length >= 14, 'the module declares the bundles');
  for (const n of declared) {
    assert.ok(names.includes(n), n + ' is a bundle in data/');
    assert.ok(src.includes("withRowTables('" + n + "'") || (n.startsWith('osm-') && src.includes("withRowTables('osm-' + key")), n + ' is written by a builder through withRowTables');
  }
});

test('③ a record keyed by code is rows: the airports, health and country facts', async (t) => {
  const API = await engine(t);
  const a = await API.run({ from: 'airport-capacity-by-country', order: { col: 'capacity', dir: 'desc' }, limit: 3 });
  assert.equal(a.ok, true, JSON.stringify(a.error));
  assert.equal(a.rows[0].v.iso3, 'USA', 'the country with the most airport capacity is the United States');
  const j = await API.run({ from: 'country-facts', where: [{ col: 'code', op: '==', value: 'JPN' }], show: ['capital', 'currency'] });
  assert.equal(j.ok, true, JSON.stringify(j.error));
  assert.equal(j.rows[0].v.capital, 'Tokyo');
});

test('④ a row names the element that won: the winner of an election is the one the record marks, not the first listed', async (t) => {
  const API = await engine(t);
  const r = await API.run({ from: 'us-presidential-elections', where: [{ col: 'year', op: '==', value: 1824 }], show: ['winner', 'first'] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.rows[0].v.winner, 'John Quincy Adams');
  assert.equal(r.rows[0].v.first, 'Andrew Jackson', 'the record lists Jackson first (most electoral votes) and marks Adams as elected');
});

test('⑤ sanctions, border crossings and heritage are asked as tables, by condition and by distance', async (t) => {
  const API = await engine(t);
  const s = await API.run({ from: 'sanctions-by-authority-and-country', where: [{ col: 'country', op: '==', value: 'RUS' }], order: { col: 'listings', dir: 'desc' }, limit: 5 });
  assert.equal(s.ok, true, JSON.stringify(s.error));
  assert.ok(s.rows.length >= 2 && s.rows.every((x) => x.v.country === 'RUS'));
  const w = await API.run({ from: 'world-heritage-sites', where: [{ col: 'inscribed', op: '>=', value: 2020 }], limit: 5 });
  assert.equal(w.ok, true, JSON.stringify(w.error));
  assert.ok(w.matched >= 1);
  const b = await API.run({ from: 'border-crossings', where: [{ col: 'nameEn', op: 'contains', value: 'Checkpoint' }], limit: 3 });
  assert.equal(b.ok, true, JSON.stringify(b.error));
});

test('⑥ a question that joins two bundles needs no capability for its shape: nuclear plants within 20 km of a port, ordered by capacity', async (t) => {
  const API = await engine(t);
  const r = await API.run({ from: 'nuclear-power-plants', where: [{ col: 'status', op: '==', value: 'operational' }],
    near: [{ of: 'ports', withinKm: 20, require: true }], order: { col: 'netMW', dir: 'desc' }, show: ['country', 'netMW'], limit: 5 });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.matched >= 1, 'an operating nuclear plant stands within 20 km of a port');
  const d = await API.run({ from: 'dated-world-events', where: [{ col: 'kind', op: '==', value: 'space' }], order: { col: 'date', dir: 'asc' }, show: ['date', 'nameJa'], limit: 3 });
  assert.equal(d.ok, true, JSON.stringify(d.error));
  assert.ok(d.matched >= 1);
});
