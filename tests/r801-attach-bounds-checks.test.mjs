/* ============================================================================
 *  tests/r801-attach-bounds-checks.test.mjs — what a container may BECOME       (#R801)
 * ----------------------------------------------------------------------------
 *  LIMITS.readBytes bounded what a dropped file IS; nothing bounded what it
 *  became once inflated. `new Response(stream).arrayBuffer()` held the whole
 *  output of a deflate stream (up to 1032:1) before anyone could look at its
 *  size, the ZIP reader read `usize` but did not keep it, and a cell reference
 *  such as r="ZZZZZZ1" made sheetRows walk a 308-million-slot array.
 *
 *  ⚠ EVERY CHECK HERE EVALUATES ATL_FILE ON REAL BYTES (#R505 — a test that reads
 *  the source for a spelling proves the spelling). The decompressor is the real
 *  DecompressionStream, tapped so the test can count how many bytes it was
 *  actually asked to produce — that count, not a memory figure, is the
 *  observation: a reader that stops at the ceiling asks for the ceiling and a
 *  chunk; a reader that collects everything asks for all of it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { zip } from './helpers/zip.mjs';
import { ATL_FILE } from '../js/atlas-attach.js';

const LIM = ATL_FILE.LIMITS;
const MB = 1024 * 1024;
const file = (name, buf) => new File([buf], name);

/* Count what the real decompressor is asked to produce. The module looks DecompressionStream up
   on the global at call time, so a subclass installed for the duration of one read sees every
   stream it opens; the tap is a TransformStream on the readable side, which the reader's
   cancel() runs back through (pipeThrough without preventCancel), so what it counts is what was
   pulled plus at most the pipe's own look-ahead — a few chunks, never a ceiling's worth. */
async function tapped(fn) {
  const Orig = globalThis.DecompressionStream; const seen = { bytes: 0, streams: 0 };
  class Counting extends Orig {
    constructor(f) {
      super(f); seen.streams++;
      this._tap = super.readable.pipeThrough(new TransformStream({ transform(c, ctl) { seen.bytes += c.length; ctl.enqueue(c); } }));
    }
    get readable() { return this._tap; }
  }
  globalThis.DecompressionStream = Counting;
  try { seen.result = await fn(); } finally { globalThis.DecompressionStream = Orig; }
  return seen;
}

/* Rewrite the `usize` field of the first central-directory header for `name`. */
function lieAboutSize(zipBuf, name, usize) {
  const out = Buffer.from(zipBuf), nm = Buffer.from(name, 'utf8');
  for (let p = out.length - 22; p >= 0; p--) {
    if (out.readUInt32LE(p) === 0x02014b50 && out.subarray(p + 46, p + 46 + nm.length).equals(nm)) { out.writeUInt32LE(usize, p + 24); return out; }
  }
  throw new Error('central directory entry not found: ' + name);
}

/* ══ ① THE NUMBERS ARE HELD, NOT COPIED ══════════════════════════════════════════════════ */
test('R801 ①: the inflated ceilings and the sheet budget are equal to what they derive from', () => {
  assert.equal(LIM.inflatedPerEntry, LIM.readBytes, 'a part may become no more than an uncompressed drop may be');
  assert.equal(LIM.inflatedTotal, 2 * LIM.readBytes, 'a container: the shapefile set held at once, twice the part ceiling');
  assert.equal(LIM.sheetCells, LIM.textPerFile, 'cells past the text budget can never be shown');
  assert.equal(LIM.sheetCols, 16384, 'XFD — the widest column the format can write');
});

/* ══ ② gzip: THE PULL STOPS AT THE CEILING; THE OUTPUT IS NEVER HELD WHOLE ════════════════ */
test('R801 ②: a small gzip that inflates past inflatedPerEntry is refused at the ceiling, not after materialising', async () => {
  /* 4× the ceiling of zeros: a 256 MB output from a ~250 KB input. A reader that collects the
     whole output pulls all 256 MB; one that stops at the ceiling pulls ~64 MB. */
  const bomb = gzipSync(Buffer.alloc(4 * LIM.inflatedPerEntry, 0));
  assert.ok(bomb.length < LIM.readBytes, 'the input passes readBytes — that bound cannot see this');
  const t0 = Date.now();
  const seen = await tapped(() => ATL_FILE.read(file('zeros.gz', bomb)));
  assert.equal(seen.result.kind, 'unsupported', 'the reader says it could not read it');
  assert.equal(seen.result.why, 'archive', '…on the existing "archive" reason, no new sentence');
  assert.equal(seen.streams, 1);
  assert.ok(seen.bytes > LIM.inflatedPerEntry, 'the ceiling was actually reached (' + seen.bytes + ')');
  assert.ok(seen.bytes < 2 * LIM.inflatedPerEntry, 'and the pull stopped there rather than producing all 4× (' + seen.bytes + ' bytes pulled)');
  assert.ok(Date.now() - t0 < 20000, 'and it did so in bounded time');
});

test('R801 ②b: a gzip under the ceiling still reads as text — the bound refuses only what is over it', async () => {
  const seen = await tapped(() => ATL_FILE.read(file('note.txt.gz', gzipSync(Buffer.from('Kyoto 京都\n')))));
  assert.equal(seen.result.kind, 'text');
  assert.equal(seen.result.from, 'gzip');
  assert.match(seen.result.text, /京都/);
  assert.equal(seen.result.truncated, false);
});

/* ══ ③ ZIP: usize IS A CLAIM — READ IN ONE DIRECTION, MEASURED IN THE OTHER ═══════════════ */
test('R801 ③: an entry that declares itself over the ceiling is refused without opening a stream', async () => {
  const z = lieAboutSize(zip([['a.txt', Buffer.from('small\n')]]), 'a.txt', LIM.inflatedPerEntry + 1);
  const seen = await tapped(async () => {
    const zo = ATL_FILE.zipOpen(new Uint8Array(z));
    assert.deepEqual(zo.names, ['a.txt']);
    return zo.read('a.txt');
  });
  assert.equal(seen.result, null);
  assert.equal(seen.streams, 0, 'a declared over-ceiling part inflates nothing');
});

test('R801 ③b: an entry that declares itself SMALL and is actually large is refused on the real output', async () => {
  /* 2 MB of text behind a claim of 100 bytes. The claim is not the ceiling — the reader lets a
     part become at most what it declared, and measures. */
  const body = Buffer.alloc(2 * MB, 0x61);
  const honest = zip([['big.txt', body]]);
  const liar = lieAboutSize(honest, 'big.txt', 100);
  const seen = await tapped(() => ATL_FILE.read(file('liar.zip', liar)));
  assert.equal(seen.result.kind, 'unsupported');
  assert.equal(seen.result.why, 'archive');
  assert.equal(seen.streams, 1, 'the stream was opened…');
  assert.ok(seen.bytes < MB, '…and abandoned at the first chunk past the claim (' + seen.bytes + ' bytes), not read to the end');
  const ok = await tapped(() => ATL_FILE.read(file('honest.zip', honest)));
  assert.equal(ok.result.kind, 'text', 'the same bytes with an honest directory read fine');
  assert.ok(ok.bytes >= 2 * MB);
});

test('R801 ③c: a container is bounded as a whole — inflatedTotal stops the third full-size part', async () => {
  /* Three parts each exactly at the per-part ceiling (honest, 64 MB of zeros → ~64 KB each).
     Two fit under inflatedTotal; the third does not, and is refused before a byte is inflated. */
  const part = Buffer.alloc(LIM.inflatedPerEntry, 0);
  const z = new Uint8Array(zip([['p1.bin', part], ['p2.bin', part], ['p3.bin', part]]));
  const seen = await tapped(async () => {
    const zo = ATL_FILE.zipOpen(z);
    const a = await zo.read('p1.bin'), b = await zo.read('p2.bin'), c = await zo.read('p3.bin');
    return { a: a && a.length, b: b && b.length, c: c };
  });
  assert.equal(seen.result.a, LIM.inflatedPerEntry);
  assert.equal(seen.result.b, LIM.inflatedPerEntry);
  assert.equal(seen.result.c, null, 'the part that would carry the container past inflatedTotal is refused');
  assert.equal(seen.streams, 2, '…without opening a stream for it');
});

/* ══ ④ SHEETS: A COLUMN REFERENCE IS NOT A LENGTH TO WALK ═════════════════════════════════ */
const xlsx = (sheetXml) => zip([
  ['xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>')],
  ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>')],
  ['xl/worksheets/sheet1.xml', Buffer.from('<worksheet><sheetData>' + sheetXml + '</sheetData></worksheet>')],
]);
const cell = (ref, v) => '<c' + (ref ? ' r="' + ref + '"' : '') + ' t="inlineStr"><is><t>' + v + '</t></is></c>';

test('R801 ④: r="ZZZZZZ1" does not make the reader walk 308 million slots — the sheet is cut there and says so', async () => {
  const xml = '<row r="1">' + cell('A1', 'one') + cell('B1', 'two') + '</row>'
    + '<row r="2">' + cell('ZZZZZZ2', 'far') + '</row>'
    + '<row r="3">' + cell('A3', 'after') + '</row>';
  const t0 = Date.now();
  const d = await ATL_FILE.read(file('wide.xlsx', xlsx(xml)));
  const ms = Date.now() - t0;
  assert.equal(d.kind, 'text');
  assert.equal(d.from, 'xlsx');
  assert.match(d.text, /one\ttwo/, 'the rows before the impossible reference are kept');
  assert.doesNotMatch(d.text, /far|after/, 'the sheet stops at the reference the format cannot write');
  assert.equal(d.truncated, true, 'and the reader is told the file was longer, on the existing flag');
  assert.ok(d.text.length < 1000, 'no line the width of the bogus column (' + d.text.length + ' chars)');
  assert.ok(ms < 2000, 'bounded time (' + ms + ' ms)');
});

test('R801 ④b: the widest legal column still lays out as before — gaps are tabs, later cells win, blanks are skipped', async () => {
  const xml = '<row r="1">' + cell('A1', 'a') + cell('C1', 'c') + '</row>'
    + '<row r="2">' + cell('B2', 'x') + cell('B2', 'y') + '</row>'
    + '<row r="3">' + cell('', ' ') + '</row>'
    + '<row r="4">' + cell('XFD4', 'edge') + '</row>';
  const d = await ATL_FILE.read(file('ok.xlsx', xlsx(xml)));
  assert.equal(d.kind, 'text');
  const lines = d.text.split('\n').slice(1);
  assert.equal(lines[0], 'a\t\tc', 'a gap is an empty column');
  assert.equal(lines[1], '\ty', 'a repeated reference: the later cell wins, as the array assignment did');
  assert.equal(lines[2], '\t'.repeat(LIM.sheetCols - 1) + 'edge', 'XFD is legal and sits at the last column');
  assert.equal(lines.length, 3, 'a blank row is skipped');
  assert.equal(d.truncated, false);
});

test('R801 ④c: a sheet is cut after sheetCells cells, and after sheetCols auto-numbered cells in one row', async () => {
  /* Blank cells: they emit nothing, so the character budget never fires and only the cell
     budget can — which is the point: reading them is work whose product is nothing. */
  const many = '<row r="1">' + cell('A1', 'first') + '</row>'
    + Array.from({ length: LIM.sheetCells + 1 }, (_, i) => '<row r="' + (i + 2) + '">' + cell('', '') + '</row>').join('');
  const d = await ATL_FILE.read(file('long.xlsx', xlsx(many)));
  assert.equal(d.kind, 'text');
  assert.match(d.text, /first/);
  assert.equal(d.truncated, true, 'more cells than the text budget could ever show');
  const wide = '<row r="1">' + cell('', 'w').repeat(LIM.sheetCols + 1) + '</row>';
  const w = await ATL_FILE.read(file('wide2.xlsx', xlsx(wide)));
  assert.equal(w.kind, 'unsupported', 'a single row past XFD without a reference has nothing before it to keep');
  assert.equal(w.why, 'archive');
});
