/* ============================================================================
 *  IntMap · #R540 — what Atlas will take as an attachment              (checks)
 * ----------------------------------------------------------------------------
 *  「Atlasに添付できるファイルの種類が少なすぎる。」
 *
 *  The old answer was `atlFileKind`: a MIME prefix plus a hand-written regex of 75 extensions.
 *  Anything the list did not name was refused — every PDF, every Office document, every archive,
 *  and every text format nobody had thought of. .agents/rules/no-ad-hoc-hardcoding.md §1 names that
 *  exact shape: an embedded list of names for something that can be derived.
 *
 *  ⚠ AND THE SUITE THAT GUARDED IT COULD NOT SEE THE DEFECT. tests/r158 #4 asserted that the string
 *  `export function atlFileKind(f){` existed. It did. The list inside it was wrong in both
 *  directions — it refused readable files, and it called a HEIC an image that ai-proxy then dropped
 *  with `continue`, so the picture never reached the model and nothing was said. A check that reads
 *  a name is true of a broken implementation (#R488, #R505).
 *
 *  So every check below EVALUATES the classifier on real bytes — real ZIP central directories, real
 *  Shift_JIS, a real %PDF- header — and asks what comes out.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { ATL_FILE } from '../js/atlas-attach.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PROXY = read('supabase/functions/ai-proxy/index.ts');
const CONSOLE_SRC = read('js/atlas-console.js');

/* ── a real ZIP, built the way a word processor builds one ───────────────────────────────────
   Not a fixture checked into the tree: the reader below has to walk an actual end-of-central-
   directory record, an actual central directory and actual deflate streams, or it proves nothing. */
let TBL = null;
function crc32(b) {
  if (!TBL) { TBL = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TBL[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = TBL[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zip(entries) {
  const locals = [], dir = []; let off = 0;
  for (const [name, buf] of entries) {
    const nm = Buffer.from(name, 'utf8'), comp = deflateRawSync(buf), crc = crc32(buf);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(buf.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(buf.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    dir.push(ch, nm);
    off += lh.length + nm.length + comp.length;
  }
  const body = Buffer.concat(locals), cdir = Buffer.concat(dir), eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(entries.length, 8); eo.writeUInt16LE(entries.length, 10);
  eo.writeUInt32LE(cdir.length, 12); eo.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, cdir, eo]);
}
const file = (name, buf, type) => new File([buf], name, type ? { type } : undefined);
const RASTER = async () => 'data:image/jpeg;base64,AAAA';
const NOTHING = async () => null;

/* ══ ① AN IMAGE IS WHAT THE ENCODER CAN PRODUCE, NOT WHAT THE MIME TYPE CLAIMS ═════════════ */
test('R540 ①: an image the browser cannot decode is refused OUT LOUD, not dropped in silence', async () => {
  /* The bytes are a real ISO-BMFF `ftyp heic` header — the iPhone default, which Chrome on Windows
     cannot draw. Before this round `atlFileKind` said 'image' on the MIME prefix, compressImage's
     img.onerror resolved the ORIGINAL data URL, and ai-proxy's IMAGE_MIME (png/jpeg/webp/gif)
     dropped it with `continue`. Nothing was shown to the reader. */
  const heic = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
  const drawn = await ATL_FILE.read(file('IMG_0001.HEIC', heic, 'image/heic'), { encodeImage: RASTER });
  assert.equal(drawn.kind, 'image', 'a browser that CAN draw it sends a raster the providers accept');
  assert.match(drawn.dataUrl, /^data:image\/(png|jpeg|webp|gif);base64,/);
  const not = await ATL_FILE.read(file('IMG_0001.HEIC', heic, 'image/heic'), { encodeImage: NOTHING });
  assert.equal(not.kind, 'unsupported', 'a browser that cannot draw it must not pretend it sent a picture');
  assert.equal(not.why, 'image-undecodable', 'and the reason is the one the reader is told');
});

test('R540 ①b: an image the encoder refuses still reaches the model when it is also text', async () => {
  /* An SVG is a picture AND a document. Rasterising is preferred; when the canvas refuses (an SVG
     that pulls an external resource taints it), the source is worth more than a refusal. */
  const d = await ATL_FILE.read(file('map.svg', Buffer.from('<svg><text>Kyoto</text></svg>'), 'image/svg+xml'), { encodeImage: NOTHING });
  assert.equal(d.kind, 'text');
  assert.match(d.text, /Kyoto/);
});

/* ══ ② WHAT A FILE IS, ASKED OF THE BYTES ══════════════════════════════════════════════════ */
test('R540 ②: a PDF goes to the providers as a document, whatever it is called', async () => {
  /* ⚠ %PDF- NEED NOT BE AT BYTE 0 (ISO 32000-1 §7.5.2 allows leading bytes, and scanners emit them),
     and the name is not consulted at all — the second case has no extension. */
  const at0 = await ATL_FILE.read(file('report.pdf', Buffer.from('%PDF-1.7\n1 0 obj\n'), 'application/pdf'));
  assert.equal(at0.kind, 'doc');
  assert.equal(at0.mime, 'application/pdf');
  assert.equal(Buffer.from(at0.b64, 'base64').toString('utf8').slice(0, 5), '%PDF-', 'the bytes travel intact');
  const offset = await ATL_FILE.read(file('scan', Buffer.concat([Buffer.alloc(40, 0x20), Buffer.from('%PDF-1.4\n')])));
  assert.equal(offset.kind, 'doc', 'a PDF with leading junk and no extension is still a PDF');
});

test('R540 ②b: Office, OpenDocument, KMZ and a plain archive all give up their text', async () => {
  const docx = zip([
    ['[Content_Types].xml', Buffer.from('<Types/>')],
    ['word/document.xml', Buffer.from('<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:tab/><w:r><w:t>&#x4E16;界</w:t></w:r></w:p><w:p><w:r><w:t>second</w:t></w:r></w:p></w:body></w:document>', 'utf8')],
  ]);
  const d1 = await ATL_FILE.read(file('a.docx', docx));
  assert.equal(d1.kind, 'text'); assert.equal(d1.from, 'docx');
  assert.equal(d1.text, 'Hello\t世界\nsecond', 'paragraphs become lines, tabs stay tabs, entities are decoded');

  const xlsx = zip([
    ['xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="売上" sheetId="1" r:id="rId1"/></sheets></workbook>', 'utf8')],
    ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')],
    ['xl/sharedStrings.xml', Buffer.from('<sst><si><t>Tokyo</t></si><si><t>Osaka</t></si></sst>')],
    ['xl/worksheets/sheet1.xml', Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>12</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3.5</v></c></row></sheetData></worksheet>')],
  ]);
  const d2 = await ATL_FILE.read(file('b.xlsx', xlsx));
  assert.equal(d2.from, 'xlsx');
  /* ⚠ THE COLUMN A CELL IS EMPTY IN ROW 1 — a sheet read as a list of values loses which column a
     number was in, and a spreadsheet is nothing but that. `12` must land in the third column. */
  assert.equal(d2.text, '--- 売上 ---\nTokyo\t\t12\nOsaka\t3.5');

  const pptx = zip([
    ['ppt/presentation.xml', Buffer.from('<p/>')],
    ['ppt/slides/slide2.xml', Buffer.from('<p:sld><a:p><a:t>Second</a:t></a:p></p:sld>')],
    ['ppt/slides/slide1.xml', Buffer.from('<p:sld><a:p><a:t>First</a:t></a:p></p:sld>')],
  ]);
  const d3 = await ATL_FILE.read(file('c.pptx', pptx));
  assert.equal(d3.from, 'pptx');
  assert.match(d3.text, /slide 1[\s\S]*First[\s\S]*slide 2[\s\S]*Second/, 'slide 10 must not sort before slide 2');

  const odt = zip([['mimetype', Buffer.from('application/vnd.oasis.opendocument.text')],
    ['content.xml', Buffer.from('<office><text:p>Alpha</text:p><text:p>Beta</text:p></office>')]]);
  assert.equal((await ATL_FILE.read(file('d.odt', odt))).text, 'Alpha\nBeta');

  const kmz = zip([['doc.kml', Buffer.from('<kml><Placemark><name>P</name></Placemark></kml>')]]);
  assert.equal((await ATL_FILE.read(file('e.kmz', kmz))).from, 'kmz');

  /* An archive of nothing in particular: every part that decodes as text, named, and the binary
     part skipped. That is what makes .epub, a zipped export and a zip of sources all work without
     any of them being named anywhere. */
  const bag = zip([['src/a.py', Buffer.from('print(1)\n')], ['bin/x.dat', Buffer.from([0, 1, 2, 3, 0])]]);
  const d4 = await ATL_FILE.read(file('f.zip', bag));
  assert.equal(d4.from, 'zip');
  assert.match(d4.text, /src\/a\.py[\s\S]*print\(1\)/);
  assert.ok(!/x\.dat/.test(d4.text), 'a binary part is skipped, not pasted in as mojibake');
});

test('R540 ②b2: stripping markup runs to a fixed point — one pass puts the markup back', async () => {
  /* ⚠ REMOVING A MULTI-CHARACTER SEQUENCE ONCE CAN REASSEMBLE IT. `<<!--a-->!--b-->` loses the inner
     comment and the outer halves close up into a comment again; `<scr<b>ipt>` closes up into a tag.
     A single `.replace()` therefore leaves markup in what the reader is told is the document's text
     (CodeQL js/incomplete-multi-character-sanitization, raised on this file). Both shapes are fed
     through the real extractor here rather than asserted about its source.
     ⚠ RAW, NOT ENTITY-ENCODED: '&lt;' in the part means the document's text really contains a '<',
     and reproducing it is correct. What must not survive is markup that was markup. */
  const docx = zip([
    ['[Content_Types].xml', Buffer.from('<Types/>')],
    ['word/document.xml', Buffer.from('<w:document><w:body><w:p><w:r><w:t>A<<!--x-->!--y-->B<scr<b>ipt></w:t></w:r></w:p><w:p><w:r><w:t>C</w:t></w:r></w:p></w:body></w:document>')],
  ]);
  const d = await ATL_FILE.read(file('nested.docx', docx));
  assert.equal(d.kind, 'text');
  assert.ok(!/<!--/.test(d.text), 'no comment opener survives: ' + JSON.stringify(d.text));
  assert.ok(!/<[a-zA-Z!/]/.test(d.text), 'no tag survives: ' + JSON.stringify(d.text));
  assert.match(d.text, /A[\s\S]*B[\s\S]*C/, 'and the text around it is still there');
});

test('R540 ②c: a text file is text because it decodes, not because its extension was listed', async () => {
  /* Each of these was refused before this round: none of the three extensions is in the 75-name
     list #R158 wrote, and the first has no extension at all. */
  for (const [name, body] of [['LICENSE', 'MIT License\n'], ['readme.adoc', '= Title\n'], ['track.wkt', 'POINT(139 35)\n']]) {
    const d = await ATL_FILE.read(file(name, Buffer.from(body)));
    assert.equal(d.kind, 'text', name + ' is readable text');
    assert.equal(d.text, body);
  }
  /* ⚠ AND IT MUST NOT ARRIVE AS MOJIBAKE. `readAsText` assumed UTF-8, so a Shift_JIS CSV — the
     default of every Japanese spreadsheet export — reached the model as replacement characters. */
  const sjis = await ATL_FILE.read(file('売上.csv', Buffer.from([0x93, 0xFA, 0x96, 0x7B, 0x2C, 0x31, 0x0A])));
  assert.equal(sjis.text, '日本,1\n');
  assert.equal(sjis.encoding, 'shift_jis');
  const bom = await ATL_FILE.read(file('x.txt', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('ok\n', 'utf16le')])));
  assert.equal(bom.text, 'ok\n');
});

test('R540 ②d: what is refused is refused BY REASON — the reader is never left guessing', async () => {
  const cases = [
    ['legacy-office', file('old.doc', Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0]))],
    ['media', file('clip.mp4', Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), 'video/mp4')],
    ['binary', file('a.bin', Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]))],
    ['too-big', file('huge.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(ATL_FILE.LIMITS.docBytes, 0x20)]))],
  ];
  for (const [why, f] of cases) {
    const d = await ATL_FILE.read(f, { encodeImage: NOTHING });
    assert.equal(d.kind, 'unsupported', f.name);
    assert.equal(d.why, why, f.name + ' is refused as ' + why);
  }
  /* ⚠ AND A FILE TOO BIG TO READ IS REFUSED WITHOUT BEING READ. Every question above needs the
     whole file, so the size has to be asked before the bytes are: a dropped 4 GB film would
     otherwise be pulled into the tab before anything could say no. `arrayBuffer` is replaced with a
     throw here, so reaching it at all fails this test rather than passing quietly. */
  const huge = file('film.mkv', Buffer.alloc(16), 'video/x-matroska');
  Object.defineProperty(huge, 'size', { value: ATL_FILE.LIMITS.readBytes + 1 });
  huge.arrayBuffer = () => { throw new Error('the bytes must not be read'); };
  assert.equal((await ATL_FILE.read(huge)).why, 'media');
  const hugeText = file('server.log', Buffer.alloc(16));
  Object.defineProperty(hugeText, 'size', { value: ATL_FILE.LIMITS.readBytes + 1 });
  hugeText.arrayBuffer = () => { throw new Error('the bytes must not be read'); };
  assert.equal((await ATL_FILE.read(hugeText)).why, 'too-big');

  /* Every reason has a sentence, in the five positional languages; the other four resolve through
     the inline tables that npm run check:i18n holds complete. */
  for (const why of ['too-big', 'legacy-office', 'media', 'image-undecodable']) {
    assert.ok(CONSOLE_SRC.includes("if(w==='" + why + "')"), 'reason ' + why + ' has its own sentence');
  }
});

/* ══ ③ THE ATTACHMENT NO LONGER RIDES IN THE PROMPT ════════════════════════════════════════ */
test('R540 ③: the attached content has its own channel, with its own bound', () => {
  /* #R158 concatenated the files into `prompt`; ai-proxy slices `prompt` at MAX_PROMPT = 24,000
     while the client stacked four files of 60,000 characters. The overflow was thrown away with
     nothing said to the reader or the model — the #R285 failure, one channel over. */
  assert.ok(!/_fileBlock/.test(CONSOLE_SRC), 'the prompt-concatenation is gone');
  assert.match(CONSOLE_SRC, /files:_atts\.files,docs:_atts\.docs/, 'the agent turn carries both channels');
  assert.match(read('js/ai-core.js'), /body\.files=opts\.files/, 'and js/ai-core.js puts them on the wire');
  const promptCap = +(/const MAX_PROMPT = ([\d_]+)/.exec(PROXY) || [])[1].replace(/_/g, '');
  const filesCap = +(/const MAX_FILES_TEXT = ([\d_]+)/.exec(PROXY) || [])[1].replace(/_/g, '');
  assert.ok(filesCap > promptCap, 'the attachment channel is bounded on its own, not by the prompt cap');
});

test('R540 ③b: all three providers are given the documents and the attached text', () => {
  /* Which provider runs is a secret (AI_PROVIDER); a channel wired into one of the three is a
     channel that disappears the day the secret changes. */
  assert.match(PROXY, /type: "document"/, 'Anthropic document block');
  assert.match(PROXY, /type: "input_file"/, 'OpenAI input_file');
  assert.match(PROXY, /mime_type: dp\.mime/, 'Gemini inline_data carries the document mime');
  /* ⚠ THE STRING LITERAL, NOT THE COMMENT THAT EXPLAINS IT. Prose quoting a name is not a second
     copy of the thing (#R492) — counting raw occurrences would make the file's own explanation of
     itself look like the duplication this check exists to forbid. */
  const blocks = (PROXY.match(/"\[ATTACHED FILE/g) || []).length;
  assert.equal(blocks, 1, 'the attachment preamble is written once and used by all three, not copied three times');
});

/* ══ ④ THE TWO SIDES OF EVERY BOUND ARE EQUAL — CHECKED, NOT COPIED ════════════════════════ */
test('R540 ④: the client half and the server half of each attachment bound agree', () => {
  /* ⚠ "そろえた" IS NOT TWO PLACES HOLDING THE SAME NUMBER (#R504). The client must refuse before
     sending so the reader is told why; the server must refuse because it cannot trust the client.
     Two enforcement points are correct — two numbers that drift are not, so this asks them. */
  const num = (name) => {
    const m = new RegExp('const ' + name + ' = ([\\d_]+)(?:\\s*\\*\\s*([\\d_]+))?(?:\\s*\\*\\s*([\\d_]+))?').exec(PROXY);
    assert.ok(m, name + ' is declared in ai-proxy as a plain literal this check can read');
    return m.slice(1).filter(Boolean).map((x) => +x.replace(/_/g, '')).reduce((a, b) => a * b, 1);
  };
  const pairs = [['MAX_IMAGES', 'images'], ['MAX_FILES', 'files'], ['MAX_DOCS', 'docs'],
    ['MAX_FILE_TEXT', 'textPerFile'], ['MAX_FILES_TEXT', 'textTotal'],
    ['MAX_DOC_BYTES', 'docBytes'], ['MAX_DOCS_BYTES', 'docsBytes']];
  for (const [server, client] of pairs) {
    assert.equal(num(server), ATL_FILE.LIMITS[client], server + ' (server) === ATL_FILE.LIMITS.' + client + ' (client)');
  }
  /* …and the body must be able to hold what those bounds allow through, base64 included (4/3). */
  const body = num('MAX_BODY_BYTES');
  const carried = (ATL_FILE.LIMITS.docsBytes + 12 * 1024 * 1024) * 4 / 3;
  assert.ok(body >= carried, 'MAX_BODY_BYTES (' + body + ') must admit the documents and images the bounds allow (' + Math.ceil(carried) + ')');
});

/* ══ ⑤ AND THE SENTENCES SAY THE NUMBERS THAT ARE ENFORCED ═════════════════════════════════ */
test('R540 ⑤: the cap messages state the caps that actually apply', () => {
  /* A sentence carrying a number is a copy of that number (#R500). These are the only three the
     reader ever sees, and each must be the bound the code enforces. */
  for (const [n, word] of [[ATL_FILE.LIMITS.images, 'images'], [ATL_FILE.LIMITS.files, 'files'], [ATL_FILE.LIMITS.docs, 'documents']]) {
    assert.ok(CONSOLE_SRC.includes("L('Up to " + n + ' ' + word + " per message'"),
      'the "' + word + '" cap message says ' + n + ', which is what ATL_FILE.LIMITS enforces');
  }
});
