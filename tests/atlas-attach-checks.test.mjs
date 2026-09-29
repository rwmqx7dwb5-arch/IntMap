/* ============================================================================
 *  js/atlas-attach.js — what Atlas takes as an attachment, and how it gets it back
 * ----------------------------------------------------------------------------
 *  What is accepted and refused by reason (#R540), recalling a past attachment by running it (#R783),
 *  the full text kept and paged (#R790), and the bounds on what a container may inflate into (#R801).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { zip } from './helpers/zip.mjs';
import { ATL_FILE } from '../js/atlas-attach.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';
import { gzipSync } from 'node:zlib';

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r540-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PROXY = read('supabase/functions/ai-proxy/index.ts');
const CONSOLE_SRC = read('js/atlas-console.js');

/* ⚠ (#R576) THE ZIP BUILDER MOVED TO tests/helpers/zip.mjs so there is one of it — the map's
   import path (js/geo-import.js) needs the same real archive to test KMZ and a zipped Shapefile,
   and a second copy is a second thing to fix. The archives below are byte-identical to before. */
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
     the inline tables that npm run check:i18n holds complete. (Read, not run: the sentences are built
     inside the Atlas kernel, which only a browser can build.) */
  for (const why of ['too-big', 'legacy-office', 'media', 'image-undecodable']) {
    assert.ok(CONSOLE_SRC.includes("if(w==='" + why + "')"), 'reason ' + why + ' has its own sentence');
  }
});

/* ══ ③ THE ATTACHMENT NO LONGER RIDES IN THE PROMPT ════════════════════════════════════════ */
test('R540 ③: the attached content has its own channel, with its own bound', () => {
  /* read, not run: the prompt assembly lives in the Atlas kernel (js/atlas-console.js), which only a
     browser can build, and the caps are constants of the Deno edge function, which node cannot import. */
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
  /* read, not run: the three provider branches are in the Deno edge function
     (supabase/functions/ai-proxy/index.ts), which node cannot import or reach without the providers. */
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
  /* read, not run: the client half is RUN (ATL_FILE.LIMITS); the server half is a constant of the Deno
     edge function, which node cannot import, so it is parsed from its declaration. */
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
  /* read, not run: the cap sentences are built inside the Atlas kernel, which only a browser can build;
     the numbers they must state are taken from the running ATL_FILE. */
  /* A sentence carrying a number is a copy of that number (#R500). These are the only three the
     reader ever sees, and each must be the bound the code enforces. */
  for (const [n, word] of [[ATL_FILE.LIMITS.images, 'images'], [ATL_FILE.LIMITS.files, 'files'], [ATL_FILE.LIMITS.docs, 'documents']]) {
    assert.ok(CONSOLE_SRC.includes("L('Up to " + n + ' ' + word + " per message'"),
      'the "' + word + '" cap message says ' + n + ', which is what ATL_FILE.LIMITS enforces');
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r783-attach-recall-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R783 — 添付の「取り寄せ」を、読んで確かめるのではなく**走らせて**確かめる
 * ----------------------------------------------------------------------------
 *  #R773 は台帳（js/atlas-attach-log.js）と能力 `attach.recall` を作り、テキストが
 *  ターンをまたいで残ることを実測した。残っていたのは**取り寄せの経路**で、そこは Atlas が
 *  必要と判断したときだけ通るので、本番では一度も通っていない（回答にはログインが要る）。
 *
 *  ⚠ だからここは綴りを読まない。**実バイト**（本物の %PDF- と本物の PNG）を
 *  `ATL_FILE.read` に食わせ、返った記録を台帳に載せ、`find` が返したものを**復号して
 *  元のバイトと突き合わせる**。「名前が残っている」と「中身が戻ってくる」は別の事実で、
 *  #R773 が測ったのは前者だけだった（memory: intmap-edge-function-must-be-evaluated —
 *  ソースを読む検査は評価順序も実際の答えも見られない）。
 *
 *  ⚠ ここが測れないのは 1 つだけ: **モデルが本当に取り寄せを選ぶか**。それは Atlas の判断で
 *  あり（CONSTITUTION.md §5）、判断を検査で固定してはならない。取り寄せ**が起きたとき**に
 *  中身が次の一手の目の前に載ることは tests/r783-attach-recall.spec.js が実物の経路で測る。
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const LIM = ATL_FILE.LIMITS;

/* ── 実バイト。どちらも「その形式である」ことを署名で名乗るものそのもの ────────────────── */
/* 最小の、構造として本物の PDF（ISO 32000-1 の骨格。%PDF- 署名と trailer と %%EOF を持つ） */
const PDF_BYTES = Buffer.from(
  '%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
/* 1×1 の本物の PNG（署名・IHDR・IDAT・IEND。canvas に描けるものでなければ #R540 は image と
   答えない——だから「画像として扱われるか」を綴りではなくバイトで訊ける） */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64');

const fileOf = (name, bytes, type) => new File([bytes], name, { type: type || '' });
/* ⚠ canvas はこのモジュールが自分で供給できない唯一の能力なので、呼び出し元が注入する契約
   （js/atlas-attach.js の read() の見出し）。ここが注入するのは**本物の PNG を返す符号化器**で、
   ブラウザの canvas が同じ場所でするのと同じこと——返り値の形は read() が検証する。 */
const encodeImage = async (f) => 'data:image/png;base64,' + Buffer.from(await f.arrayBuffer()).toString('base64');

const b64bytes = (s) => Buffer.from(String(s || ''), 'base64');
const dataUrlBytes = (u) => b64bytes(String(u || '').replace(/^data:[^,]*,/, ''));

test('#R783 ① PDF は取り寄せで**中身が戻る** — 名前ではなくバイトを突き合わせる', async () => {
  const rec = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  assert.equal(rec.kind, 'doc', '%PDF- 署名を持つバイトは文書チャネルのもの');
  assert.equal(rec.mime, ATL_FILE.DOC_MIME);

  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [rec]);
  /* 次のターン: 載っていないが、在ることは述べられている */
  ATTACH_LOG.carry(2, [], LIM);
  assert.match(ATTACH_LOG.declare(2, []), /paper\.pdf \(application\/pdf\)/);

  const got = ATTACH_LOG.find(2, 'paper.pdf');
  assert.ok(got, '述べた名前で取り寄せられなければ、述べたことに意味が無い');
  /* ⚠ ここが「中身が戻る」の全部。b64 が欠けていても truncate されていても declare は同じ文を書く */
  assert.ok(b64bytes(got.b64).equals(PDF_BYTES), '取り寄せた PDF が元のバイトと一致しない');
  /* そして次の一手が積む先（js/atlas-console.js の recallAttachment）が要求する欄が揃っている */
  assert.equal(typeof got.name, 'string');
  assert.equal(got.mime, 'application/pdf');
});

test('#R783 ② 画像も取り寄せで**中身が戻る** — data URL を復号して元の PNG と突き合わせる', async () => {
  const rec = await ATL_FILE.read(fileOf('shot.png', PNG_BYTES, 'image/png'), { encodeImage });
  assert.equal(rec.kind, 'image', '符号化器が raster を返したものだけが image');

  ATTACH_LOG.reset();
  /* js/atlas-console.js は画像を data URL の文字列でしか渡さない（台帳が最小の記録に包む） */
  ATTACH_LOG.remember(1, [rec.dataUrl], []);
  ATTACH_LOG.carry(2, [], LIM);
  const d = ATTACH_LOG.declare(2, []);
  assert.match(d, /image-1 \(image\)/, '画像は種別を名乗る（文書チャネルと別の道に載るから）');

  const got = ATTACH_LOG.find(2, 'image-1');
  assert.ok(got && got.kind === 'image');
  assert.ok(dataUrlBytes(got.dataUrl).equals(PNG_BYTES), '取り寄せた画像が元のバイトと一致しない');
});

test('#R783 ③ 取り寄せの失敗は失敗として返る — 別のものを黙って返さない', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [pdf]);

  /* ⚠ 「確認できなかった」を成功にしないための唯一の条件: 名前が違えば null であって、
     たまたま 1 件しか無いからそれを返す、ではない（memory: 推測は拒否より悪い）。 */
  assert.equal(ATTACH_LOG.find(2, 'nope.pdf'), null);
  assert.equal(ATTACH_LOG.find(2, 'report'), null);
  assert.equal(ATTACH_LOG.find(2, ''), null, '名前を渡し忘れた呼び出しは成功ではない');
  assert.equal(ATTACH_LOG.find(2, null), null);
  /* そして失敗のときに読み手（モデル）へ渡せる事実を台帳が持っている＝「在るのはこれ」 */
  assert.deepEqual(ATTACH_LOG.names(2), ['paper.pdf']);

  /* ⚠ 「台帳が空」と「その名前が無い」は違う失敗で、違う文になる（names が空か否か）。 */
  ATTACH_LOG.reset();
  assert.equal(ATTACH_LOG.find(2, 'paper.pdf'), null);
  assert.deepEqual(ATTACH_LOG.names(2), []);
});

test('#R783 ④ 二度目の取り寄せは同じ答えを返す（冪等）— 台帳は呼ばれて変わらない', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [pdf.b64 ? 'data:image/png;base64,' + PNG_BYTES.toString('base64') : ''], [pdf]);
  const a = ATTACH_LOG.find(2, 'paper.pdf'), b = ATTACH_LOG.find(2, 'paper.pdf');
  assert.equal(a, b, '同じ引数で違う記録が返るなら、二度目は一度目と違うことをしている');
  assert.deepEqual(ATTACH_LOG.names(2).slice().sort(), ['image-1', 'paper.pdf']);
  /* declare も冪等（取り寄せても台帳からは消えない——同じ会話で何度でも要求できる） */
  ATTACH_LOG.carry(2, [], LIM);
  assert.equal(ATTACH_LOG.declare(2, []), ATTACH_LOG.declare(2, []));
  /* ⚠ 「もう済んでいる」と述べるのはターンの層（js/atlas-agent.js の doneCalls）で、
     台帳の仕事は**二度目が一度目と違う結果にならないこと**。その宣言のほうは
     tests/r783-attach-recall.spec.js が実際のターンで測る（.agents/rules/one-pass-or-a-reason.md §2 の 3）。 */
});

test('#R783 ⑤ モデルに見せた名前で取り寄せられる — 台帳が自分で足した札を自分で外す', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'a.csv', text: 'x,y\n1,2' }]);
  const shown = ATTACH_LOG.carry(2, [], LIM)[0].name;
  assert.notEqual(shown, 'a.csv', 'いつ添付されたかを名前が述べる（#R773）');
  /* ⚠ 実測された欠陥: モデルがそのファイルについて知る唯一の名前がこれで、これを渡した
     取り寄せは null を返していた＝見せられた名前で頼むと必ず失敗する取り寄せだった。 */
  const got = ATTACH_LOG.find(2, shown);
  assert.ok(got, '台帳が見せた名前が、台帳の取り寄せに通らない');
  assert.equal(got.name, 'a.csv');
  /* 語として名前が現れる言い方も通る。⚠ ただし境界は元の文字列で見る——
     image-1 は image-12 の部分列だが別のファイルである。 */
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, ['data:image/png;base64,AAA'], []);
  for (let i = 0; i < 11; i++) ATTACH_LOG.remember(1, ['data:image/png;base64,BBB'], []);
  assert.equal(ATTACH_LOG.find(2, 'image-1').dataUrl, 'data:image/png;base64,AAA');
  assert.equal(ATTACH_LOG.find(2, 'image-12').dataUrl, 'data:image/png;base64,BBB');
  assert.equal(ATTACH_LOG.find(2, 'please reopen image-12').dataUrl, 'data:image/png;base64,BBB',
    '語として名前を含む問い合わせが外れる');
});

test('#R783 ⑥ 画像の名前は一意で、同名が 2 件できない（片方が取り寄せ不能になる）', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, ['data:image/png;base64,A', 'data:image/png;base64,B'], []);
  ATTACH_LOG.remember(2, ['data:image/png;base64,C'], []);
  const names = ATTACH_LOG.names(2);
  assert.equal(names.length, 3);
  assert.equal(new Set(names).size, 3, '同名が 2 件在ると、古いほうは永久に取り寄せられない');
  /* 実測されていた欠陥: 名前を `log.length + i + 1` で作っていたので 1 通 2 枚が image-1/image-3
     になり、次のターンの 1 枚目がまた image-3 になった。1 枚ずつ番号が進むのが名前の意味。 */
  assert.deepEqual(names.slice().sort(), ['image-1', 'image-2', 'image-3']);
  assert.equal(ATTACH_LOG.find(3, 'image-1').dataUrl, 'data:image/png;base64,A');
  assert.equal(ATTACH_LOG.find(3, 'image-3').dataUrl, 'data:image/png;base64,C');
});

test('#R783 ⑦ 台帳に在るものは、載るか述べられるかのどちらかである（黙って落ちない）', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  /* 混ぜて、枠を絞る。⚠ 実測: 以前のターンのテキスト 10 件のうち carry が載せたのは 8 件で、
     残る 2 件は carry も declare も述べなかった——読者が添付したものがモデルにとって存在しない
     という、#R773 が直したはずの形が枠の下に残っていた。 */
  for (let i = 0; i < 10; i++) ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 't' + i + '.txt', text: 'x'.repeat(50) }]);
  ATTACH_LOG.remember(1, ['data:image/png;base64,AAA'], [pdf]);
  const inLedger = ATTACH_LOG.names(1);
  assert.equal(inLedger.length, 12);

  const sent = ['now.txt'];
  const carried = ATTACH_LOG.carry(2, [{ kind: 'text', name: 'now.txt', text: 'n' }], { files: 8, textTotal: 400 });
  const declared = ATTACH_LOG.declare(2, sent);
  /* 載った名前（札を外して台帳の名前に戻す）と、述べられた名前の和集合 */
  const front = new Set(carried.map((f) => f.name.replace(/ \(attached earlier in this conversation\)$/, '')));
  const missing = inLedger.filter((n) => !front.has(n) && declared.indexOf(n) < 0 && sent.indexOf(n) < 0);
  assert.deepEqual(missing, [], '台帳に在るのに、載りもせず述べられもしないもの');
  /* 述べられたものは取り寄せられる（述べるだけで届かない道を作らない） */
  inLedger.filter((n) => declared.indexOf(n) >= 0).forEach((n) => {
    assert.ok(ATTACH_LOG.find(2, n), n + ' は述べられたのに取り寄せられない');
  });
  /* 枠で落ちたテキストは、落ちたことが分かる形で述べられる（画像・PDF と同じ顔にしない） */
  assert.match(declared, /\(text, not included in this request\)/);
});

test('#R783 ⑧ 枠の写しを持たない — 台帳が切るのは呼び出し元が渡した数そのもの', async () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'big.txt', text: 'z'.repeat(LIM.textPerFile) }]);
  /* 総字数の枠を 1 字下回らせると入らない＝比べているのは渡された数である */
  assert.equal(ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile - 1 }).length, 0);
  assert.equal(ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile }).length, 1);
  /* そして入らなかったターンでは述べられる */
  ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile - 1 });
  assert.match(ATTACH_LOG.declare(2, []), /big\.txt/);
});

/* ══ そして、扉に鍵が存在するか ════════════════════════════════════════════════════════
 *  ⚠⚠⚠ この検査を書いた理由は実測である。上の①〜⑧がすべて緑で、#R773 の ⑪
 *  「取り寄せは実装されている — 宣言だけして繋がっていない道具を作らない」も緑だったのに、
 *  **本物のターンで Atlas が `attach.recall` を呼ぶと dispatch に届かなかった**:
 *  `run_capability{id:'attach.recall', args:{name:'paper.pdf'}}` が `needs_input`
 *  （「これを実行するには、もう1つ必要です。使用する値を教えてください。」）で返る。
 *
 *  `resolveInputs` は**読者に何かを出してもらう**ための門（クリックする点・打ち込む語）で、
 *  能力が的（targetPolicy）を宣言していると、その的を「持っている」と認められる欄の一覧が
 *  `hasTarget` に書かれている。`attach.recall` の的は `'text'` で、その一覧は
 *  `query/text/question/value/place/term` ——この能力が持つ唯一の引数 `name` は無い。
 *  ⇒ **自分のスキーマが許すどの呼び出しでも、自分の的を満たせない能力**が在った。
 *
 *  だからここが測るのは事例ではなく構造: **スキーマが許す呼び出しの集合と、的が受け取る
 *  集合が交わること**。交わらない能力は、どんな正しい呼び出しでも読者への質問に落ちる
 *  （＝誰も開けられない扉。memory: intmap-door-in-a-container-no-reader-opens）。
 *  ⚠ 「スキーマの required だけで的が満たされること」を測ってはならない——`sim.pandemicRun`
 *  は `days` だけを required にしつつ場所を的にしており、場所を訊くのは正しい。測るのは
 *  「宣言された欄を**全部**埋めても満たせない」ことである。
 * ==========================================================================================*/
test('#R783 ⑨ 自分のスキーマが許す呼び出しで満たせない的を宣言した能力は無い（誰も開けられない扉）', () => {
  const CAPS = makeAtlasCapabilities({}), SCHEMAS = makeAtlasSchemas();
  /* 宣言された欄を、その型が許す最も素直な値で埋める（値の良さは問わない——`hasTarget` は
     「在るか」しか訊かないと自分で述べている）。 */
  const fill = (sc) => {
    const a = {};
    for (const k of Object.keys(sc.properties || {})) {
      const pr = sc.properties[k] || {};
      a[k] = pr.type === 'number' ? 1 : pr.type === 'boolean' ? true : pr.type === 'array' ? ['x']
        : pr.type === 'object' ? { x: 1 } : (Array.isArray(pr.enum) && pr.enum.length ? pr.enum[0] : 'x');
    }
    return a;
  };
  const unreachable = [], seen = [];
  for (const cap of CAPS.all()) {
    let sc = null;
    try { sc = SCHEMAS.schemaFor(cap.id); } catch (_) { sc = null; }
    if (!sc || !sc.properties || !Object.keys(sc.properties).length) continue;
    seen.push(cap.id);
    let need = null;
    try { need = cap.resolveInputs({}, fill(sc)); } catch (e) { need = { threw: (e && e.message) || 'threw' }; }
    if (need) unreachable.push(cap.id + ' (target «' + ((cap.targetPolicy && cap.targetPolicy.kind) || '?')
      + '» / schema declares ' + Object.keys(sc.properties).join(', ') + ')');
  }
  /* 母集合が縮んだら、この検査は何も見ていない（#R707 の床の分母） */
  assert.ok(seen.length > 120, '引数スキーマを持つ能力が ' + seen.length + ' 件しか見えていない');
  assert.deepEqual(unreachable, [],
    '自分のスキーマが許すどの呼び出しでも的を満たせない＝Atlas からは到達できない。'
    + '直すのは事例ではなく列: その能力のスキーマが既に的を required にしているなら、'
    + 'targetPolicy の列（js/atlas-capabilities.js の 10 列目）は空であるべきで、'
    + '門は js/atlas-schemas.js の required 1 つになる。'
    + '⚠ hasTarget の一覧に欄名を足して直してはならない——同じ的を持つ他の能力すべてで'
    + '「読者に出してもらう」の意味が緩む。');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r790-atlas-attach-full-text-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R790 — 添付ファイルは、長すぎても全文が Atlas に届く
 * ----------------------------------------------------------------------------
 *  利用者の実測:「Atlas に添付したファイルは、長すぎると先頭部分しか読み込んでくれない」。
 *
 *  ⚠ 原因は js/atlas-attach.js の textDesc() が、読み取った時点で LIMITS.textPerFile
 *  （120,000 字）を超える分をその場で `slice` して捨てていたこと。捨てた文字列はどこにも
 *  残らないので、#R773 が作った `attach.recall`（一度捨てたはずの添付を取り戻す道具）を
 *  呼んでも、台帳（js/atlas-attach-log.js）に載っていたのは同じ切り詰め済みの先頭だけだった
 *  ——取り寄せが「もう捨てたものを取り寄せる」という、届きようのない依頼になっていた。
 *
 *  直したのは 1 点: 読み取り時には切らず全文を保つ。切るのは送るとき（毎ターン自動で載る
 *  1 窓ぶん）だけにし、続きは `attach.recall` に offset を付けて呼ばせる——画像と PDF が
 *  「全部持っているが送るのは要求されたときだけ」なのと同じ形。
 * ==========================================================================*/

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const LIM = ATL_FILE.LIMITS;
const fileOf = (name, bytes, type) => new File([bytes], name, { type: type || '' });

/* ── 最小の ZIP を自分で組む（本物のバイト構造で「読み取りにくい形式」を作る #R505 の作法）。
   method=0（無圧縮）で足りる——zipOpen() は CRC を検証しないので、実物のバイトである必要は
   構造だけで、圧縮まで本物にする必要はない。 ─────────────────────────────────────────── */
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }
function buildZip(entries) {
  let offset = 0; const locals = [], centrals = [];
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const dataBuf = Buffer.from(e.data, 'utf8');
    const local = Buffer.concat([
      u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(dataBuf.length), u32(dataBuf.length),
      u16(nameBuf.length), u16(0), nameBuf, dataBuf,
    ]);
    centrals.push(Buffer.concat([
      u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(dataBuf.length), u32(dataBuf.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBuf,
    ]));
    locals.push(local);
    offset += local.length;
  }
  const localBuf = Buffer.concat(locals), centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054B50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBuf.length), u32(localBuf.length), u16(0),
  ]);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

test('#R790 ① ATL_FILE.read() は 1 ファイルの全文を保つ — 末尾は読み取り時に捨てない', async () => {
  const big = 'r790-full-text-'.repeat(12000);   /* LIM.textPerFile(120,000) を大きく超える */
  assert.ok(big.length > LIM.textPerFile);
  const rec = await ATL_FILE.read(fileOf('big.txt', Buffer.from(big, 'utf8'), 'text/plain'), {});
  assert.equal(rec.kind, 'text');
  assert.equal(rec.text.length, big.length, '読み取った時点で切られている＝取り寄せても戻らない');
  assert.equal(rec.text, big, '一部が入れ替わっていないか（slice の境界ミスの検出）');
  assert.equal(rec.truncated, true, '送るときには窓で切られることは、読者への表示のために引き続き分かる');
});

test('#R790 ② 120,000 字ちょうどの短いファイルは truncated を立てない（境界）', async () => {
  const exact = 'z'.repeat(LIM.textPerFile);
  const rec = await ATL_FILE.read(fileOf('exact.txt', Buffer.from(exact, 'utf8'), 'text/plain'), {});
  assert.equal(rec.text.length, LIM.textPerFile);
  assert.equal(rec.truncated, false);
});

test('#R790 ③ ATTACH_LOG.carry() は先頭 1 窓だけを送るが、台帳は全文を持ち続ける', async () => {
  const full = 'a'.repeat(LIM.textPerFile + 54321);
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'huge.txt', text: full }]);

  const carried = ATTACH_LOG.carry(2, [], LIM);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].text.length, LIM.textPerFile, '自動で送る量はこれまでどおり 1 窓ぶん');
  assert.equal(carried[0].text, full.slice(0, LIM.textPerFile));
  assert.equal(carried[0].truncated, true);

  /* ⚠ ここが直った点そのもの: 送った量とは別に、台帳自身は全文を持っている */
  const found = ATTACH_LOG.find(2, 'huge.txt');
  assert.ok(found, '台帳が名乗った名前で取り寄せられなければ、取り寄せに意味が無い');
  assert.equal(found.text.length, full.length, '台帳が保持する記録が既に切られていたら、recall は捨てたものを取り寄せることになる');
  assert.equal(found.text, full);
});

test('#R790 ④ ATTACH_LOG.page() の窓を offset で送り足すと、元の全文にちょうど戻る', () => {
  const full = Array.from({ length: 400 }, (_, i) => String(i).padStart(6, '0')).join('-');   /* 位置が分かる目印つきの文字列 */
  const rec = { kind: 'text', name: 'seq.txt', text: full };
  const per = 500;   /* 全文よりだいぶ小さい窓で、複数回の取り寄せを強制する */
  assert.ok(full.length > per * 3, 'この検査は複数回の取り寄せが要る長さで組まれている前提');

  let offset = 0, assembled = '', guard = 0;
  while (true) {
    const w = ATTACH_LOG.page(rec, offset, per);
    assert.ok(w.text.length <= per);
    assembled += w.text;
    assert.equal(w.total, full.length);
    if (!w.more) { assert.equal(w.next, full.length); break; }
    offset = w.next;
    if (++guard > 1000) throw new Error('page() が終端に達しない — more の判定を疑う');
  }
  assert.equal(assembled, full, '窓を順につなげると元の全文と一字も違わない');
});

test('#R790 ⑤ page() は範囲外・負の offset を全文の内側へ丸める（読者の入力を信じない）', () => {
  const rec = { kind: 'text', name: 'x.txt', text: 'abcdef' };
  assert.equal(ATTACH_LOG.page(rec, -50, 3).offset, 0);
  const past = ATTACH_LOG.page(rec, 999, 3);
  assert.equal(past.text, '');
  assert.equal(past.more, false);
});

test('#R790 ⑥ 汎用 ZIP コンテナは、旧・毎ターン予算（120,000 字）で抽出そのものを止めない', async () => {
  const per = LIM.textPerFile;
  const chunkLen = Math.floor(per * 0.7);   /* 2 件で per を確実に超える組み合わせ */
  const zipBytes = buildZip([
    { name: 'part-1.txt', data: 'A'.repeat(chunkLen) },
    { name: 'part-2.txt', data: 'B'.repeat(chunkLen) },
  ]);
  const rec = await ATL_FILE.read(fileOf('bundle.zip', zipBytes, 'application/zip'), {});
  assert.equal(rec.kind, 'text', '既知の拡張子を持たない ZIP も、部品がテキストなら text になる');
  assert.ok(rec.text.includes('A'.repeat(chunkLen)), '1 件目の部品は全量抽出される');
  assert.ok(rec.text.includes('B'.repeat(chunkLen)), '2 件目の部品も全量抽出される — 旧予算は 1 件目の途中で止めていた');
  assert.ok(rec.text.length > per, '抽出そのものは毎ターン送信予算より大きく行われている');
});

test('#R790 ⑦ attach.recall のスキーマは任意の offset を許す（無ければ拒否されて続きが読めない）', () => {
  const SCHEMAS = makeAtlasSchemas();
  const sc = SCHEMAS.schemaFor('attach.recall');
  assert.ok(sc && sc.properties && sc.properties.offset, 'offset が宣言されていないと、その引数を渡した呼び出しは拒否される');
  assert.deepEqual(sc.required, ['name'], 'offset は任意のまま — 先頭窓の取り寄せに offset は要らない');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r801-attach-bounds-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
}
