/* ============================================================================
 *  The Excel writer and the ZIP are each ONE implementation.   (js/zip-store.js · js/office-writer.js)
 *  Two branches wrote an .xlsx independently (file.create's document tables, and the dataset export). This holds the
 *  merge to its claim, each by RUNNING the code: a document and a dataset produce a workbook from the same engine
 *  (identical styles part, same header treatment), the ZIP the Office writers use is the one the verifier reads,
 *  and "007" stays text while "40" becomes a number only where a sheet says its numbers arrived as text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDoc } from '../js/file-doc.js';
import * as office from '../js/file-office.js';
import * as zipStore from '../js/zip-store.js';
import { writeXlsx as writeSheets, widthOf } from '../js/office-writer.js';

const part = (bytes, name) => Buffer.from(zipStore.readZip(bytes).find((e) => e.name === name).data).toString('utf8');

test('one ZIP: the Office writers re-export js/zip-store.js, they do not carry their own', () => {
  assert.equal(office.zip, zipStore.zip); assert.equal(office.readZip, zipStore.readZip); assert.equal(office.crc32, zipStore.crc32);
  for (const f of ['file-office.js', 'office-writer.js', 'gis-export.js', 'atlas-file-make.js']) {
    assert.ok(!/0xEDB88320/i.test(fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')), f + ' has its own CRC-32 table: use js/zip-store.js');
  }
});

test('one sheet writer: a document and a dataset come out of the same engine', () => {
  const d = buildDoc({ markdown: '# 表\n\n本文', tables: [{ columns: ['国', '人口', 'コード'], rows: [['日本', '125', '007'], ['ポーランド', '37.5', '010']] }], title: 'T' }).doc;
  const fromDoc = office.writeXlsx(d), fromData = writeSheets([{ name: 'a', columns: ['k'], rows: [['x']] }]);
  assert.ok(fromData.ok);
  for (const p of ['xl/styles.xml', 'xl/workbook.xml'])
    assert.equal(part(fromDoc.bytes, p).replace(/<sheets>.*<\/sheets>/, ''), part(fromData.bytes, p).replace(/<sheets>.*<\/sheets>/, ''), p);
  const sheet = part(fromDoc.bytes, 'xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="B2"><v>125<\/v><\/c>/, 'a number that arrived as text is a number on a numericText sheet');
  assert.match(sheet, /<c r="B3"><v>37\.5<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">007<\/t><\/is><\/c>/, 'a code with a leading zero stays text');
  const plain = writeSheets([{ name: 'a', columns: ['k'], rows: [['125']] }]);
  assert.match(part(plain.bytes, 'xl/worksheets/sheet1.xml'), /t="inlineStr"[^>]*><is><t xml:space="preserve">125</, 'a dataset string is never guessed into a number');
});

test('the document workbook still carries its core properties, and the sheet limits still refuse by name', () => {
  const d = buildDoc({ markdown: '本文', title: '題名' }).doc, r = office.writeXlsx(d);
  assert.match(part(r.bytes, 'docProps/core.xml'), /<dc:title>題名<\/dc:title>/);
  assert.match(part(r.bytes, '[Content_Types].xml'), /\/docProps\/core\.xml/);
  assert.match(part(r.bytes, '_rels/.rels'), /core-properties/);
  assert.equal(writeSheets([{ name: 'a', columns: ['k'], rows: { length: 1048576 } }]).why, 'xlsx-too-large');
});

test('columns are sized to their widest cell, East Asian characters counting double', () => {
  assert.equal(widthOf('abc'), 3); assert.equal(widthOf('日本語'), 6);
  const r = writeSheets([{ name: 'a', columns: ['k', 'v'], rows: [['x', '日本語の長い名前']] }]);
  const cols = part(r.bytes, 'xl/worksheets/sheet1.xml').match(/<col [^>]*width="([\d.]+)"/g).map((c) => +/width="([\d.]+)"/.exec(c)[1]);
  assert.ok(cols[1] > cols[0], 'the wide column is wider: ' + cols);
});
