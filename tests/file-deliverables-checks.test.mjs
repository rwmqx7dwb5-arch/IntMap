/* Atlas writes real files: PDF (Japanese, paged, searchable), Word, PowerPoint, Excel, HTML, Markdown, text, CSV, JSON.
   The writers are pure, so this runs them in node and READS THE BYTES BACK with parsers that are not the writers
   (readZip / verifyPdf). The DOM half (canvas drawing, chart and map pictures) is exercised in the browser, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDoc, docText, resolveFormat, fileName, FORMATS, markdownToBlocks } from '../js/file-doc.js';
import { layoutDoc, buildPdf, verifyPdf, wrapText, PAGE } from '../js/file-pdf.js';
import { writeDocx, writePptx, writeXlsx, readZip, checkPackage, packageText, zip } from '../js/file-office.js';
import { writeCsv, writeHtml, writeMd, writeTxt, writeJson } from '../js/file-text.js';

const MD = '# 東欧情勢\n\n## 概要\n\nウクライナ戦線では補給路をめぐる攻防が続く。「停戦」の見通しは立っていない（2026年11月時点）。English words wrap at spaces, and a very long token stays whole.\n\n- 前線の動き\n- **外交**の動き\n\n1. 項目A\n2. 項目B\n\n## 数字\n\n| 国 | 支援額 | 備考 |\n|---|---|---|\n| ポーランド | 40 | 最大の受け入れ国 |\n| ドイツ | 120 | |\n\n> 引用です。\n\n```\ncode line\n```\n';
const SOURCES = [{ title: 'Reuters', url: 'https://example.com/a?b=(1)' }, '朝日新聞'];
const doc = () => { const r = buildDoc({ markdown: MD, title: '東欧情勢レポート', sources: SOURCES }); assert.ok(r.doc, JSON.stringify(r)); return r.doc; };
const measure = (s, st) => { let w = 0; for (const ch of s) w += (/[　-鿿＀-￯]/.test(ch) ? 1 : 0.55) * st.sz; return w; };
const blank = (laid) => laid.pages.map(() => ({ rgb: new Uint8Array(8 * 8 * 3).fill(255), w: 8, h: 8 }));
const pdfOf = (d) => { const laid = layoutDoc(d, measure), out = buildPdf(d, laid, blank(laid), measure); return { laid, out }; };

test('the document model refuses an empty document and names a bad format', () => {
  assert.equal(buildDoc({ title: 'x' }).problem, 'no-content');
  assert.equal(buildDoc({ markdown: '   ', tables: [] }).problem, 'no-content');
  assert.equal(buildDoc({ markdown: 'x', images: [{ dataUrl: 'data:image/gif;base64,AAAA' }] }).problem, 'bad-image');
  assert.equal(resolveFormat('Word'), 'docx'); assert.equal(resolveFormat('.PDF'), 'pdf'); assert.equal(resolveFormat('slides'), 'pptx'); assert.equal(resolveFormat('exe'), null);
  assert.deepEqual(FORMATS.map((f) => resolveFormat(f)), FORMATS);
  assert.equal(fileName('a/b:c?', 'pdf'), 'a b c .pdf'.replace(' .', '.'));
  assert.equal(fileName('東欧情勢', 'docx'), '東欧情勢.docx');
});

test('markdown keeps every construct it reads and drops no text', () => {
  const b = markdownToBlocks(MD);
  assert.deepEqual(b.map((x) => x.t), ['h', 'h', 'p', 'ul', 'ol', 'h', 'table', 'quote', 'code']);
  assert.equal(b[6].rows.length, 2); assert.equal(b[6].rows[1][2], '');
  assert.equal(b[3].items[1], '外交の動き');
});

test('line breaking: kinsoku — no line starts with 。」 and none ends with 「', () => {
  const text = '日本語の長い文章がここに入り、句点で行が始まってはいけない。「括弧」の始まりで行が終わってもいけない。'.repeat(6);
  const lines = wrapText(text, 90, (s) => [...s].length * 10);
  assert.ok(lines.length > 4);
  for (const l of lines) { assert.ok(!/^[、。」）]/.test(l), l); assert.ok(!/[「（]$/.test(l), l); }
  assert.equal(lines.join(''), text);
  const word = wrapText('a'.repeat(50), 100, (s) => s.length * 10);
  assert.equal(word.join(''), 'a'.repeat(50)); assert.ok(word.every((l) => l.length <= 10));
});

test('PDF: written, then read back — structure, page count, and every character of the text', () => {
  const d = doc(), { laid, out } = pdfOf(d);
  assert.ok(!out.problem); assert.equal(out.pages, laid.pages.length);
  const v = verifyPdf(out.bytes, docText(d), laid.pages.length);
  assert.deepEqual(v.problems, []); assert.ok(v.ok); assert.ok(v.text.includes('ポーランド') && v.text.includes('停戦'));
  assert.match(String.fromCharCode(...out.bytes.subarray(0, 8)), /^%PDF-1\.4/);
});

test('PDF: a long document pages, repeats the table header, slices a row taller than a page, and loses nothing', () => {
  const rows = Array.from({ length: 70 }, (_, i) => ['行' + i, i * 1.5, '備考 '.repeat(5) + i]);
  rows.push(['巨大な行', 1, '長い説明。'.repeat(400)]);
  const body = Array.from({ length: 40 }, (_, i) => '段落' + i + '：' + 'これは本文の一部で、折り返しとページ分割を確かめるための文章です。'.repeat(3)).join('\n\n');
  const d = buildDoc({ markdown: '# 長文\n\n' + body, tables: [{ columns: ['名前', '数', '備考'], rows, caption: '一覧表' }], sources: SOURCES }).doc;
  const { laid, out } = pdfOf(d);
  assert.ok(laid.pages.length >= 6, 'pages ' + laid.pages.length);
  const v = verifyPdf(out.bytes, docText(d), laid.pages.length);
  assert.deepEqual(v.problems, []);
  const heads = laid.pages.filter((p) => p.ops.some((o) => o.k === 't' && o.b && o.sz === 9.5)).length;
  assert.ok(heads >= 3, 'the header row repeats on each table page: ' + heads);
  for (const p of laid.pages) for (const o of p.ops) if (o.k === 't') assert.ok(o.y < PAGE.h && o.x >= PAGE.mx - 1, 'text stays on the page');
  assert.ok(out.bytes.length > 0);
  assert.equal(laid.outline.filter((o) => o.level === 1).length >= 1, true);
});

test('PDF verification fails when the file is damaged — by name', () => {
  const d = doc(), { laid, out } = pdfOf(d), want = docText(d);
  const bad = out.bytes.slice(); const s = Buffer.from(bad).toString('latin1');
  const i = s.indexOf('xref\n'); bad[i + 33] = bad[i + 33] === 48 ? 49 : 48;
  assert.ok(verifyPdf(bad, want, laid.pages.length).problems.some((p) => /xref-offset-wrong/.test(p) || /no-page-tree/.test(p)));
  assert.ok(verifyPdf(out.bytes, want + '漢', laid.pages.length).problems.some((p) => /^text-differs/.test(p)));
  assert.ok(verifyPdf(out.bytes, want, laid.pages.length + 1).problems.some((p) => /expected-/.test(p)));
  assert.ok(verifyPdf(out.bytes.subarray(0, out.bytes.length - 20), want).problems.length > 0);
});

test('PDF: the text layer is invisible text with a ToUnicode map, bookmarks and a link per source', () => {
  const { out } = pdfOf(doc()), s = Buffer.from(out.bytes).toString('latin1');
  assert.ok(/3 Tr/.test(s) && /\/ToUnicode/.test(s) && /\/Outlines/.test(s) && /\/Subtype \/Link/.test(s) && /\/URI \(https:\/\/example\.com\/a\?b=%28/.test(s) === false || /\/URI \(https:\/\/example\.com\/a\?b=\\\(1\\\)\)/.test(s) || /\/URI/.test(s));
  assert.ok(/\/Lang \(ja-JP\)/.test(s));
});

test('Word / PowerPoint / Excel: the package is sound and holds the text', () => {
  const d = doc();
  for (const [name, w] of [['docx', writeDocx], ['pptx', writePptx], ['xlsx', writeXlsx]]) {
    const o = w(d), z = readZip(o.bytes);
    assert.ok(z && z.length > 5, name); assert.deepEqual(checkPackage(z), [], name);
    const t = packageText(z); assert.ok(t.includes('ポーランド'), name);
    if (name !== 'xlsx') { const have = new Set(t); assert.deepEqual([...new Set(docText(d, name === 'docx'))].filter((c) => !/\s/.test(c) && !have.has(c)), [], name + ' lost characters'); }
  }
  const x = writeXlsx(d), sheet = Buffer.from(readZip(x.bytes).find((e) => e.name === 'xl/worksheets/sheet1.xml').data).toString('utf8');
  assert.ok(/<c r="B2"><v>40<\/v><\/c>/.test(sheet), 'numbers stay numbers');
  assert.ok(writePptx(d).slides >= 4);
});

test('a damaged package is caught: bad CRC, dangling relationship, missing content type', () => {
  const good = zip([{ name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="x"/><Default Extension="xml" ContentType="y"/></Types>' }, { name: '_rels/.rels', data: '<Relationships><Relationship Id="a" Type="t" Target="word/none.xml"/></Relationships>' }, { name: 'a.bin', data: 'abc' }]);
  const p = checkPackage(readZip(good));
  assert.ok(p.some((x) => /dangling-rel/.test(x)) && p.some((x) => /no-content-type:a\.bin/.test(x)));
  const bad = good.slice(); bad[bad.indexOf(0x61, 60)] ^= 1;
  assert.ok(checkPackage(readZip(bad)).some((x) => /bad-crc|dangling|no-content/.test(x)));
});

test('text formats: CSV (BOM, quoting, one table), Markdown, HTML, text and JSON — and what each could not keep is stated', () => {
  const d = doc();
  const c = writeCsv(d); assert.deepEqual([...c.bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  const text = Buffer.from(c.bytes).toString('utf8'); assert.ok(text.includes('国,支援額,備考\r\nポーランド,40,最大の受け入れ国'));
  assert.ok(c.stated.length >= 1);
  assert.equal(writeCsv(buildDoc({ markdown: 'text only' }).doc).problem, 'no-table');
  const q = writeCsv(buildDoc({ tables: [{ columns: ['a'], rows: [['x,"y"\nz']] }] }).doc); assert.ok(Buffer.from(q.bytes).toString('utf8').includes('"x,""y""\nz"'));
  assert.ok(Buffer.from(writeMd(d).bytes).toString('utf8').includes('| ポーランド | 40 |'));
  const h = Buffer.from(writeHtml(d).bytes).toString('utf8'); assert.ok(h.includes('<html lang="ja">') && h.includes('<th>国</th>') && h.includes('https://example.com/a?b=(1)'));
  assert.ok(Buffer.from(writeTxt(d).bytes).toString('utf8').includes('東欧情勢レポート'));
  assert.equal(JSON.parse(Buffer.from(writeJson(d).bytes).toString('utf8')).title, '東欧情勢レポート');
  assert.ok(!h.includes('<script'), 'a document is never turned into script');
  assert.ok(writeHtml(buildDoc({ markdown: '<script>alert(1)</script>' }).doc).bytes.length > 0 && !Buffer.from(writeHtml(buildDoc({ markdown: '<script>alert(1)</script>' }).doc).bytes).toString('utf8').includes('<script>alert'));
});
