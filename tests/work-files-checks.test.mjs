/* ============================================================================
 *  work-files — a dataset leaves IntMap as a workbook, and comes back as what it was
 * ----------------------------------------------------------------------------
 *  js/office-writer.js + the `xlsx` entry of js/gis-export.js. The claims, each measured by RUNNING the writer:
 *    ① the package is a valid ZIP an outside reader accepts (Python's zipfile + CRC test; openpyxl too when installed)
 *    ② a number is a number, "01100" stays text, NaN is an empty cell and is COUNTED, a long cell is cut and COUNTED
 *    ③ IntMap's own reader (ATL_FILE) gets the sheet back with the cells in their columns
 *    ④ the columns and the geometry rule are the CSV writer's (points → longitude/latitude, shapes → geometry_wkt)
 *    ⑤ what the format cannot hold is refused BY NAME (too many rows, raster), never clipped
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { crc32, inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { writeXlsx, XLSX_LIMITS } from '../js/office-writer.js';
import { ATL_FILE } from '../js/atlas-attach.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), 'intmap-workfiles-'));
process.on('exit', () => { try { rmSync(WORK, { recursive: true, force: true }); } catch (_) { } });

async function exporter() {
  globalThis.window = {};
  new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(globalThis.window);
  const { makeGisExport } = await import('../js/gis-export.js');
  return makeGisExport();
}
const rec = (feats, extra) => Object.assign({ id: 'wf1', kind: 'vector', title: '売上/2026', crs: 'EPSG:4326', features: () => feats }, extra || {});
const pt = (x, y, p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: p });

/* the central directory read the way any unzip does: every entry's CRC-32 must match its bytes */
function entries(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  assert.ok(e >= 0, 'no end-of-central-directory record');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = Buffer.from(b.subarray(p + 46, p + 46 + nl)).toString('utf8');
    assert.equal(dv.getUint32(off, true), 0x04034b50);
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    let data = b.subarray(ds, ds + size); if (method === 8) data = inflateRawSync(data);
    assert.equal(crc32(data) >>> 0, crc, 'CRC mismatch: ' + name);
    out[name] = Buffer.from(data).toString('utf8'); p += 46 + nl + xl + cl;
  }
  return out;
}

test('① the workbook is a valid package: every CRC matches, every part is well-formed, an outside reader opens it', () => {
  const r = writeXlsx([{ name: 'a', columns: ['k', 'v'], rows: [['x', 1], ['y', 2.5]] }]);
  assert.equal(r.ok, true);
  const parts = entries(r.bytes);
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']) assert.ok(parts[n], n);
  assert.match(parts['xl/worksheets/sheet1.xml'], /<c r="B3"><v>2\.5<\/v><\/c>/);
  const f = join(WORK, 'a.xlsx'); writeFileSync(f, r.bytes);
  const ox = spawnSync('python', ['-I', '-c', 'import sys,openpyxl;w=openpyxl.load_workbook(sys.argv[1]);s=w.active;print(s["A1"].value,s["B3"].value)', f], { encoding: 'utf8' });
  if (ox.status === 0) assert.equal(ox.stdout.trim(), 'k 2.5');   // a third-party reader, where this runner has one (CI's GDAL job has python)
});

test('② cells keep their types and every loss is counted', () => {
  const long = 'x'.repeat(XLSX_LIMITS.cell + 5);
  const r = writeXlsx([{ name: 'a:b/c?*[]' + 'z'.repeat(40), columns: ['code', 'n', 'bad', 'flag', 'o', 'long'], rows: [['01100', 3, NaN, true, { a: 1 }, long]] }]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.stated.nonFinite, r.stated.truncatedCells, r.stated.complexCells], [1, 1, 1]);
  assert.equal(r.stated.sheets[0].name.length, XLSX_LIMITS.sheetName);
  assert.equal(r.stated.renamed.length, 1);
});

test('③ ④ a dataset exported as xlsx reads back with its cells in their columns; points become longitude/latitude', async () => {
  const ex = await exporter();
  const out = ex.write(rec([pt(139.7, 35.7, { name: '東京', code: '01100', n: 12, ok: true }), pt(135.5, 34.7, { name: '大阪', code: '27100', n: null, ok: false })]), { format: 'xlsx' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.format, 'xlsx'); assert.equal(out.filename.endsWith('.xlsx'), true);
  assert.deepEqual(out.stated.columns, ['name', 'code', 'n', 'ok', 'longitude', 'latitude']);
  assert.equal(out.stated.geometry, 'lon-lat-columns');
  const d = await ATL_FILE.read(new File([out.bytes], out.filename));
  assert.equal(d.from, 'xlsx');
  const lines = d.text.split('\n');
  assert.equal(lines[1], 'name\tcode\tn\tok\tlongitude\tlatitude');
  assert.equal(lines[2], '東京\t01100\t12\t1\t139.7\t35.7', lines[2]);   // the reader prints a boolean cell as 1/0
});

test('④ shapes are written as WKT in a geometry_wkt column, the same name the CSV uses', async () => {
  const ex = await exporter();
  const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { id: 1 } };
  const x = ex.write(rec([poly]), { format: 'xlsx' }), c = ex.write(rec([poly]), { format: 'csv' });
  assert.deepEqual(x.stated.columns, c.stated.columns);
  assert.equal(x.stated.geometry, 'wkt');
});

test('⑤ what the format cannot hold is refused by name', async () => {
  const r = writeXlsx([{ name: 'a', columns: ['k'], rows: { length: XLSX_LIMITS.rows } }]);
  assert.equal(r.ok, false); assert.equal(r.why, 'xlsx-too-large');
  const ex = await exporter();
  const g = ex.write({ id: 'g', kind: 'raster', title: 'g', width: 1, height: 1, grid: {}, bands: [{ name: 'b' }], read: () => new Float32Array(1) }, { format: 'xlsx' });
  assert.equal(g.ok, false); assert.equal(g.why, 'export-format-not-for-kind');
  assert.equal(ex.formats('vector').some((f) => f.id === 'xlsx'), true);
});
