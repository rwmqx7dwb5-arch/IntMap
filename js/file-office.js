/* ============================================================================
 *  IntMap · THE OFFICE FORMATS   (js/file-office.js)   — docx · pptx · xlsx, and the ZIP under them
 * ----------------------------------------------------------------------------
 *  Writers over the document model of js/file-doc.js. An OOXML file is a ZIP of XML parts, so this file
 *  holds a STORED-method ZIP writer (valid everywhere; the parts are small and the images are already
 *  compressed) and `readZip`, which the verifier uses to open what was just written and check it
 *  independently of the code that wrote it: every part's CRC, every relationship's target, every part's
 *  content type, and — where the platform has DOMParser — that each XML part is well-formed.
 *  What a format cannot keep is returned in `stated[]` and printed on the card. Pure; no DOM.
 *  ⚠ #1330 (open, not on main when this was written) adds js/office-writer.js for a DATASET → xlsx. This file's
 *  xlsx is the DOCUMENT's tables; when both are on main the sheet writer should be one — recorded in dev-notes.
 * ==========================================================================*/
import { cellText } from './file-doc.js';
import { esc } from './file-text.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder('utf-8').decode(b);

/* ── ZIP ──────────────────────────────────────────────────────────────────── */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** parts: [{ name, data: string|Uint8Array }] → bytes of a ZIP (method 0). [Content_Types].xml first, as OPC wants. */
export function zip(parts, when) {
  const d = when instanceof Date ? when : new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = (((d.getFullYear() - 1980) & 0x7F) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [], central = []; let off = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const p of parts) {
    const name = enc(p.name), data = typeof p.data === 'string' ? enc(p.data) : p.data, crc = crc32(data);
    const lh = new Uint8Array([0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(lh, name, data);
    central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += lh.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(parts.length), ...u16(parts.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = chunks.concat(central, [eocd]), out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

/** open a ZIP written by `zip` (stored method only) → [{ name, data }] | null when it is not one. Checks every CRC. */
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054B50) e--;
  if (e < 0) return null;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014B50) return null;
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec(bytes.subarray(p + 46, p + 46 + nl));
    if (method !== 0 || dv.getUint32(lo, true) !== 0x04034B50) return null;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = bytes.subarray(start, start + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 46 + nl + el + cl;
  }
  return out;
}

/** OPC-level checks on an opened package → problems[] (empty = sound) */
export function checkPackage(entries, opts) {
  const problems = [], names = new Set(entries.map((x) => x.name));
  if (!entries.length) return ['empty-zip'];
  if (entries[0].name !== '[Content_Types].xml') problems.push('content-types-not-first');
  entries.forEach((x) => { if (!x.crcOk) problems.push('bad-crc:' + x.name); });
  const ct = entries.find((x) => x.name === '[Content_Types].xml');
  const ctxt = ct ? dec(ct.data) : '';
  const defaults = new Set([...ctxt.matchAll(/<Default Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase())), overrides = new Set([...ctxt.matchAll(/<Override PartName="([^"]+)"/g)].map((m) => m[1]));
  for (const x of entries) {
    if (x.name === '[Content_Types].xml' || x.name.endsWith('/')) continue;
    const ext = (x.name.split('.').pop() || '').toLowerCase();
    if (!overrides.has('/' + x.name) && !defaults.has(ext)) problems.push('no-content-type:' + x.name);
  }
  overrides.forEach((o) => { if (!names.has(o.slice(1))) problems.push('override-without-part:' + o); });
  for (const x of entries.filter((y) => /\.rels$/.test(y.name))) {
    const base = x.name.replace(/_rels\/[^/]*$/, '');
    for (const m of dec(x.data).matchAll(/<Relationship\b[^>]*>/g)) {
      if (/TargetMode="External"/.test(m[0])) continue;
      const t = /Target="([^"]*)"/.exec(m[0]); if (!t) { problems.push('rel-without-target:' + x.name); continue; }
      let path = t[1].startsWith('/') ? t[1].slice(1) : base + t[1];
      const seg = []; path.split('/').forEach((s) => { if (s === '..') seg.pop(); else if (s !== '.') seg.push(s); });
      path = seg.join('/');
      if (!names.has(path)) problems.push('dangling-rel:' + x.name + '→' + path);
    }
  }
  if (typeof DOMParser !== 'undefined') {
    for (const x of entries.filter((y) => /\.(xml|rels)$/.test(y.name))) {
      const doc = new DOMParser().parseFromString(dec(x.data), 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) problems.push('xml-not-well-formed:' + x.name);
    }
  }
  return problems;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CT_REL = 'application/vnd.openxmlformats-package.relationships+xml';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const rels = (items) => XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.map((r) => '<Relationship Id="' + r.id + '" Type="' + (r.type.startsWith('http') ? r.type : REL + r.type) + '" Target="' + esc(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>').join('') + '</Relationships>';
const ctypes = (defaults, overrides) => XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + defaults.map(([e, t]) => '<Default Extension="' + e + '" ContentType="' + t + '"/>').join('') + overrides.map(([p, t]) => '<Override PartName="' + p + '" ContentType="' + t + '"/>').join('') + '</Types>';
const iso = (d) => (d instanceof Date ? d : new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
const coreXml = (doc, when) => XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(doc.title) + '</dc:title><dc:creator>' + esc(doc.author || 'IntMap Atlas') + '</dc:creator><dc:language>' + doc.lang + '</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">' + iso(when) + '</dcterms:created></cp:coreProperties>';
const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg' };
const CORE_REL = { id: 'rIdCore', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' };
const CORE_CT = ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'];

/* ── DOCX ─────────────────────────────────────────────────────────────────── */
const wt = (s) => '<w:t xml:space="preserve">' + esc(s) + '</w:t>';
const wrun = (s, rpr) => '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + String(s).split('\n').map(wt).join('<w:br/>') + '</w:r>';
const wp = (inner, ppr) => '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + inner + '</w:p>';
const EMU_CM = 360000;

export function writeDocx(doc, opt) {
  const when = (opt && opt.when) || new Date(), ja = doc.lang === 'ja';
  const body = [], media = [], docRels = [], nums = [];
  let rid = 10, imgN = 0;
  const addRel = (type, target, external) => { const id = 'rId' + (rid++); docRels.push({ id, type, target, external }); return id; };
  body.push(wp(wrun(doc.title), '<w:pStyle w:val="Title"/>'));
  if (doc.subtitle) body.push(wp(wrun(doc.subtitle), '<w:pStyle w:val="Subtitle"/>'));
  if (doc.date || doc.author) body.push(wp(wrun([doc.author, doc.date].filter(Boolean).join(' · '), '<w:color w:val="6E6E73"/>')));
  for (const b of doc.blocks) {
    if (b.t === 'h') body.push(wp(wrun(b.text), '<w:pStyle w:val="Heading' + b.level + '"/>'));
    else if (b.t === 'p') body.push(wp(wrun(b.text)));
    else if (b.t === 'quote') body.push(wp(wrun(b.text), '<w:pStyle w:val="Quote"/>'));
    else if (b.t === 'code') body.push(wp(wrun(b.text, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="MS Gothic"/><w:sz w:val="19"/>'), '<w:pStyle w:val="Code"/>'));
    else if (b.t === 'pb') body.push(wp('<w:r><w:br w:type="page"/></w:r>'));
    else if (b.t === 'ul' || b.t === 'ol') {
      let numId = 1;
      if (b.t === 'ol') { numId = 2 + nums.length; nums.push(numId); }
      b.items.forEach((it) => body.push(wp(wrun(it), '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + numId + '"/></w:numPr>')));
    } else if (b.t === 'table') {
      if (b.caption) body.push(wp(wrun(b.caption, '<w:b/>'), '<w:keepNext/>'));
      const nc = Math.max(1, b.columns.length), total = 9000, cw = Math.floor(total / nc);
      const cell = (v, head) => '<w:tc><w:tcPr><w:tcW w:w="' + cw + '" w:type="dxa"/>' + (head ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F7"/>' : '') + '</w:tcPr>' + wp(wrun(cellText(v), head ? '<w:b/>' : ''), '<w:spacing w:before="40" w:after="40"/>') + '</w:tc>';
      body.push('<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + b.columns.map(() => '<w:gridCol w:w="' + cw + '"/>').join('') + '</w:tblGrid>'
        + '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + b.columns.map((c) => cell(c, true)).join('') + '</w:tr>'
        + b.rows.map((r) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + b.columns.map((c, i) => cell(r[i], false)).join('') + '</w:tr>').join('') + '</w:tbl>');
      body.push(wp(''));
    } else if (b.t === 'img') {
      const n = ++imgN, name = 'image' + n + '.' + IMG_EXT[b.image.mime], id = addRel('image', 'media/' + name);
      media.push({ name: 'word/media/' + name, data: b.image.bytes });
      let cx = 16 * EMU_CM, cy = Math.round(cx * b.image.h / b.image.w); const maxY = 20 * EMU_CM;
      if (cy > maxY) { cx = Math.round(cx * maxY / cy); cy = maxY; }
      body.push(wp('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + n + '" name="Picture ' + n + '" descr="' + esc(b.caption || '') + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + n + '" name="' + esc(name) + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>', '<w:keepNext/><w:jc w:val="center"/>'));
      if (b.caption) body.push(wp(wrun(b.caption, '<w:color w:val="6E6E73"/><w:sz w:val="18"/>'), '<w:jc w:val="center"/>'));
    }
  }
  if (doc.sources.length) {
    body.push(wp(wrun(ja ? '出典' : 'Sources'), '<w:pStyle w:val="Heading2"/>'));
    doc.sources.forEach((s, i) => {
      let inner = wrun((i + 1) + '. ');
      if (s.url) { const id = addRel('hyperlink', s.url, true); inner += '<w:hyperlink r:id="' + id + '">' + wrun(s.title, '<w:color w:val="0A64D6"/><w:u w:val="single"/>') + '</w:hyperlink>'; } else inner += wrun(s.title);
      if (s.note) inner += wrun(' — ' + s.note);
      body.push(wp(inner, '<w:spacing w:after="60"/>'));
    });
  }
  const footerId = addRel('footer', 'footer1.xml');
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="' + footerId + '"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="' + NS_R + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic" w:cs="Calibri"/>';
  const style = (id, name, ppr, rpr, extra) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/>' + (extra || '') + '<w:qFormat/><w:pPr>' + ppr + '</w:pPr><w:rPr>' + rpr + '</w:rPr></w:style>';
  const styles = XML + '<w:styles ' + W + '><w:docDefaults><w:rPrDefault><w:rPr>' + font + '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="' + (ja ? 'ja-JP' : 'en-US') + '" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + style('Title', 'Title', '<w:spacing w:after="80"/>', '<w:b/><w:sz w:val="48"/>') + style('Subtitle', 'Subtitle', '<w:spacing w:after="200"/>', '<w:color w:val="6E6E73"/><w:sz w:val="26"/>')
    + [1, 2, 3].map((l) => style('Heading' + l, 'heading ' + l, '<w:keepNext/><w:spacing w:before="' + (360 - l * 60) + '" w:after="100"/><w:outlineLvl w:val="' + (l - 1) + '"/>', '<w:b/><w:sz w:val="' + (36 - l * 4) + '"/>', '<w:next w:val="Normal"/>')).join('')
    + style('Quote', 'Quote', '<w:ind w:left="480"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C7C7CC"/></w:pBdr>', '<w:color w:val="48484A"/>') + style('Code', 'Code', '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F7"/><w:spacing w:line="260" w:lineRule="auto"/>', '')
    + style('ListParagraph', 'List Paragraph', '<w:spacing w:after="40"/><w:ind w:left="720"/>', '')
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="C7C7CC"/>').join('') + '</w:tblBorders></w:tblPr></w:style>'
    + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
  const numbering = XML + '<w:numbering ' + W + '><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
    + '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>'
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' + nums.map((n) => '<w:num w:numId="' + n + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>').join('') + '</w:numbering>';
  const footer = XML + '<w:ftr ' + W + '><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="8E8E93"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="8E8E93"/><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:color w:val="8E8E93"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="8E8E93"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="8E8E93"/><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
  const WCT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
  const parts = [
    { name: '[Content_Types].xml', data: ctypes([['rels', CT_REL], ['xml', 'application/xml'], ['png', 'image/png'], ['jpeg', 'image/jpeg']], [['/word/document.xml', WCT + 'document.main+xml'], ['/word/styles.xml', WCT + 'styles+xml'], ['/word/numbering.xml', WCT + 'numbering+xml'], ['/word/footer1.xml', WCT + 'footer+xml'], CORE_CT]) },
    { name: '_rels/.rels', data: rels([{ id: 'rId1', type: 'officeDocument', target: 'word/document.xml' }, CORE_REL]) },
    { name: 'docProps/core.xml', data: coreXml(doc, when) },
    { name: 'word/document.xml', data: XML + '<w:document ' + W + '><w:body>' + body.join('') + sect + '</w:body></w:document>' },
    { name: 'word/styles.xml', data: styles }, { name: 'word/numbering.xml', data: numbering }, { name: 'word/footer1.xml', data: footer },
    { name: 'word/_rels/document.xml.rels', data: rels([{ id: 'rId1', type: 'styles', target: 'styles.xml' }, { id: 'rId2', type: 'numbering', target: 'numbering.xml' }].concat(docRels)) },
  ].concat(media);
  return { bytes: zip(parts, when), stated: [], parts: parts.length };
}

/* ── XLSX ─────────────────────────────────────────────────────────────────── */
const colName = (i) => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const widthOf = (s) => { let w = 0; for (const ch of String(s)) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1; return w; };
const sheetName = (s, used) => {
  let n = String(s || 'Sheet').replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet', k = 2; const base = n;
  while (used.has(n.toLowerCase())) { const suf = '(' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase()); return n;
};

export function writeXlsx(doc, opt) {
  const when = (opt && opt.when) || new Date(), ja = doc.lang === 'ja', stated = [], used = new Set(), sheets = [];
  const tables = doc.blocks.filter((b) => b.t === 'table');
  const mk = (name, header, rows) => {
    const widths = header.map((h) => widthOf(h));
    rows.forEach((r) => header.forEach((_, i) => { widths[i] = Math.max(widths[i], widthOf(cellText(r[i]).split('\n')[0])); }));
    /* a table written in markdown holds its numbers as text; a plain decimal (no leading zero, so a code like 007 stays text) is a number in the sheet */
    const cell = (v, r, c, style) => {
      const ref = colName(c) + r;
      if (typeof v === 'string' && /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v.trim()) && style !== 1) v = Number(v);
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') + '><v>' + v + '</v></c>';
      if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      const s = cellText(v); if (s === '') return '';
      return '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : '') + '><is><t xml:space="preserve">' + esc(s) + '</t></is></c>';
    };
    const xml = XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">' + (header.length ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>'
      + '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(60, Math.max(8, w + 2)) + '" customWidth="1"/>').join('') + '</cols><sheetData>'
      + '<row r="1">' + header.map((h, c) => cell(h, 1, c, 1)).join('') + '</row>'
      + rows.map((r, ri) => '<row r="' + (ri + 2) + '">' + header.map((_, c) => cell(r[c], ri + 2, c, 0)).join('') + '</row>').join('') + '</sheetData></worksheet>';
    sheets.push({ name: sheetName(name, used), xml });
  };
  tables.forEach((t, i) => mk(t.caption || (ja ? '表' : 'Table') + (tables.length > 1 ? ' ' + (i + 1) : ''), t.columns, t.rows));
  if (!tables.length) {
    const lines = []; doc.blocks.forEach((b) => { if (b.t === 'h' || b.t === 'p' || b.t === 'quote' || b.t === 'code') lines.push([b.text]); else if (b.t === 'ul' || b.t === 'ol') b.items.forEach((x) => lines.push([x])); });
    mk(ja ? '本文' : 'Text', [doc.title], lines);
    stated.push(ja ? '表が無いため、本文を 1 列のシートに 1 段落 1 行で書きました' : 'no table in the document: the text is one paragraph per row on a single sheet');
  } else if (doc.blocks.some((b) => b.t !== 'table' && b.t !== 'pb')) stated.push(ja ? '本文・見出し・画像はシートに入りません（表だけを書きました）' : 'prose, headings and images are not on the sheets (tables only)');
  if (doc.sources.length) mk(ja ? '出典' : 'Sources', [ja ? '名称' : 'Title', 'URL', ja ? '備考' : 'Note'], doc.sources.map((s) => [s.title, s.url || '', s.note || '']));
  const SC = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
  const styles = XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
  const parts = [
    { name: '[Content_Types].xml', data: ctypes([['rels', CT_REL], ['xml', 'application/xml']], [['/xl/workbook.xml', SC + 'sheet.main+xml'], ['/xl/styles.xml', SC + 'styles+xml'], CORE_CT].concat(sheets.map((_, i) => ['/xl/worksheets/sheet' + (i + 1) + '.xml', SC + 'worksheet+xml']))) },
    { name: '_rels/.rels', data: rels([{ id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' }, CORE_REL]) },
    { name: 'docProps/core.xml', data: coreXml(doc, when) },
    { name: 'xl/workbook.xml', data: XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '"><sheets>' + sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: rels(sheets.map((_, i) => ({ id: 'rId' + (i + 1), type: 'worksheet', target: 'worksheets/sheet' + (i + 1) + '.xml' })).concat([{ id: 'rIdStyles', type: 'styles', target: 'styles.xml' }])) },
    { name: 'xl/styles.xml', data: styles },
  ].concat(sheets.map((s, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml })));
  return { bytes: zip(parts, when), stated, sheets: sheets.map((s) => s.name) };
}

/* ── PPTX ─────────────────────────────────────────────────────────────────── */
const SW = 12192000, SH = 6858000, IN = 914400;
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + NS_R + '" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const FONTS = '<a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Calibri"/>';
const apara = (text, o) => { o = o || {}; return '<a:p><a:pPr' + (o.bullet ? ' marL="342900" indent="-342900"' : ' marL="0" indent="0"') + '>' + (o.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>') + '<a:spcBef><a:spcPts val="' + (o.before == null ? 600 : o.before) + '"/></a:spcBef></a:pPr><a:r><a:rPr lang="' + (o.lang || 'ja-JP') + '" sz="' + (o.sz || 1800) + '"' + (o.b ? ' b="1"' : '') + ' dirty="0">' + (o.color ? '<a:solidFill><a:srgbClr val="' + o.color + '"/></a:solidFill>' : '') + FONTS + '</a:rPr><a:t>' + esc(text) + '</a:t></a:r></a:p>'; };
const xfrm = (x, y, w, h) => '<a:xfrm><a:off x="' + Math.round(x) + '" y="' + Math.round(y) + '"/><a:ext cx="' + Math.round(w) + '" cy="' + Math.round(h) + '"/></a:xfrm>';
const unitW = (s) => widthOf(s) / 2;   /* em units: a CJK character is 1, a Latin one 0.5 */
const wrapCount = (s, perLine) => String(s).split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(unitW(ln) / perLine)), 0);

function planSlides(doc) {
  const ja = doc.lang === 'ja', slides = [];
  slides.push({ kind: 'title', title: doc.title, sub: [doc.subtitle, doc.author, doc.date].filter(Boolean).join(' · ') });
  let cur = null, heading = ja ? '概要' : 'Overview';
  const open = (title, cont) => { cur = { kind: 'text', title: cont ? title + (ja ? '（続き）' : ' (cont.)') : title, paras: [], lines: 0 }; slides.push(cur); };
  const LINES = 11, PER = 30;
  const addPara = (text, o) => { const n = wrapCount(text, PER) * (o && o.sz ? 1 : 1); if (!cur) open(heading, false); else if (cur.lines + n > LINES && cur.lines > 0) open(heading, true); cur.paras.push(Object.assign({ text }, o)); cur.lines += n; };
  for (const b of doc.blocks) {
    if (b.t === 'h') { if (b.level <= 2 || !cur) { heading = b.text; cur = null; if (b.level <= 2) { open(heading, false); cur.empty = true; } else addPara(b.text, { b: true }); } else addPara(b.text, { b: true }); }
    else if (b.t === 'p' || b.t === 'quote') { if (cur && cur.empty) cur.empty = false; addPara(b.text, b.t === 'quote' ? { color: '6E6E73' } : {}); }
    else if (b.t === 'code') { if (cur && cur.empty) cur.empty = false; addPara(b.text, { sz: 1400 }); }
    else if (b.t === 'ul' || b.t === 'ol') { if (cur && cur.empty) cur.empty = false; b.items.forEach((it, i) => addPara(b.t === 'ol' ? (i + 1) + '. ' + it : it, { bullet: b.t === 'ul' })); }
    else if (b.t === 'table') { const per = 8; for (let i = 0; i < Math.max(1, b.rows.length); i += per) slides.push({ kind: 'table', title: b.caption || heading, columns: b.columns, rows: b.rows.slice(i, i + per), cont: i > 0 }); cur = null; }
    else if (b.t === 'img') { slides.push({ kind: 'image', title: b.caption || heading, image: b.image }); cur = null; }
    else if (b.t === 'pb') cur = null;
  }
  const emptied = slides.filter((s) => !(s.kind === 'text' && s.empty && !s.paras.length)); slides.length = 0; slides.push(...emptied);
  for (let i = 0; i < doc.sources.length; i += 7) slides.push({ kind: 'sources', title: (ja ? '出典' : 'Sources') + (i ? (ja ? '（続き）' : ' (cont.)') : ''), items: doc.sources.slice(i, i + 7), from: i });
  return slides;
}

export function writePptx(doc, opt) {
  const when = (opt && opt.when) || new Date(), ja = doc.lang === 'ja', lang = ja ? 'ja-JP' : 'en-US';
  const slides = planSlides(doc), parts = [], media = [], stated = [];
  let imgN = 0;
  const title = (t, y, sz) => '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>' + xfrm(0.6 * IN, y, SW - 1.2 * IN, 0.95 * IN) + '</p:spPr><p:txBody><a:bodyPr anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + apara(t, { sz: sz || 3000, b: true, before: 0, lang }) + '</p:txBody></p:sp>';
  const box = (id, name, x, y, w, h, paras) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(x, y, w, h) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paras + '</p:txBody></p:sp>';
  const slideXml = (shapes) => XML + '<p:sld ' + A + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  const slideParts = slides.map((s, i) => {
    const relList = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }];
    let shapes = '';
    const X = 0.6 * IN, W = SW - 1.2 * IN;
    if (s.kind === 'title') shapes = title(s.title, 2.1 * IN, 4000) + (s.sub ? box(3, 'Subtitle', X, 3.4 * IN, W, 1 * IN, apara(s.sub, { sz: 2000, color: '6E6E73', lang })) : '');
    else if (s.kind === 'text') shapes = title(s.title, 0.35 * IN) + box(3, 'Body', X, 1.5 * IN, W, 5 * IN, s.paras.map((p) => apara(p.text, Object.assign({ lang }, p))).join(''));
    else if (s.kind === 'sources') shapes = title(s.title, 0.35 * IN) + box(3, 'Sources', X, 1.5 * IN, W, 5 * IN, s.items.map((x, k) => apara((s.from + k + 1) + '. ' + x.title + (x.url && x.url !== x.title ? '  ' + x.url : ''), { sz: 1400, lang })).join(''));
    else if (s.kind === 'table') {
      const nc = Math.max(1, s.columns.length), cw = Math.floor(W / nc), rowH = 0.5 * IN;
      const tc = (v, head) => '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + apara(cellText(v), { sz: 1400, b: head, before: 0, lang }) + '</a:txBody><a:tcPr' + (head ? '' : '') + '>' + '<a:lnL w="6350"><a:solidFill><a:srgbClr val="C7C7CC"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="C7C7CC"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="C7C7CC"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="C7C7CC"/></a:solidFill></a:lnB>' + (head ? '<a:solidFill><a:srgbClr val="F2F2F7"/></a:solidFill>' : '') + '</a:tcPr></a:tc>';
      shapes = title((s.title || '') + (s.cont ? (ja ? '（続き）' : ' (cont.)') : ''), 0.35 * IN) + '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="3" name="Table"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="' + X + '" y="' + Math.round(1.5 * IN) + '"/><a:ext cx="' + (cw * nc) + '" cy="' + (rowH * (s.rows.length + 1)) + '"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>' + s.columns.map(() => '<a:gridCol w="' + cw + '"/>').join('') + '</a:tblGrid>'
        + '<a:tr h="' + rowH + '">' + s.columns.map((c) => tc(c, true)).join('') + '</a:tr>' + s.rows.map((r) => '<a:tr h="' + rowH + '">' + s.columns.map((c, k) => tc(r[k], false)).join('') + '</a:tr>').join('') + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
    } else if (s.kind === 'image') {
      const n = ++imgN, name = 'image' + n + '.' + IMG_EXT[s.image.mime]; media.push({ name: 'ppt/media/' + name, data: s.image.bytes });
      relList.push({ id: 'rId2', type: 'image', target: '../media/' + name });
      const maxW = W, maxH = 5 * IN; let w = maxW, h = w * s.image.h / s.image.w; if (h > maxH) { h = maxH; w = h * s.image.w / s.image.h; }
      shapes = title(s.title || '', 0.35 * IN) + '<p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture ' + n + '" descr="' + esc(s.title || '') + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + xfrm((SW - w) / 2, 1.5 * IN, w, h) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
    }
    return [{ name: 'ppt/slides/slide' + (i + 1) + '.xml', data: slideXml(shapes) }, { name: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', data: rels(relList) }];
  });
  const clr = '<a:clrScheme name="IntMap">' + [['dk1', '000000'], ['lt1', 'FFFFFF'], ['dk2', '1C1C1E'], ['lt2', 'F2F2F7'], ['accent1', '0A64D6'], ['accent2', '34C759'], ['accent3', 'FF9500'], ['accent4', 'AF52DE'], ['accent5', 'FF3B30'], ['accent6', '5AC8FA'], ['hlink', '0A64D6'], ['folHlink', '6E6E73']].map(([k, v]) => '<a:' + k + '><a:srgbClr val="' + v + '"/></a:' + k + '>').join('') + '</a:clrScheme>';
  const ln = '<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>', fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const theme = XML + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IntMap"><a:themeElements>' + clr + '<a:fontScheme name="IntMap"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="IntMap"><a:fillStyleLst>' + fill + fill + fill + '</a:fillStyleLst><a:lnStyleLst>' + ln + ln + ln + '</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>' + fill + fill + fill + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  const phTitle = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>' + xfrm(0.6 * IN, 0.35 * IN, SW - 1.2 * IN, 0.95 * IN) + '</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="' + lang + '"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>';
  const tree = (inner) => '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + inner + '</p:spTree></p:cSld>';
  const lvl = (sz) => '<a:lvl1pPr><a:defRPr sz="' + sz + '">' + '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>' + FONTS + '</a:defRPr></a:lvl1pPr>';
  const master = XML + '<p:sldMaster ' + A + '>' + tree(phTitle) + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>' + lvl(3000) + '</p:titleStyle><p:bodyStyle>' + lvl(1800) + '</p:bodyStyle><p:otherStyle>' + lvl(1800) + '</p:otherStyle></p:txStyles></p:sldMaster>';
  const layout = XML + '<p:sldLayout ' + A + ' type="titleOnly" preserve="1">' + tree(phTitle) + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  const pres = XML + '<p:presentation ' + A + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + slides.map((_, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') + '</p:sldIdLst><p:sldSz cx="' + SW + '" cy="' + SH + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const PC = 'application/vnd.openxmlformats-officedocument.presentationml.';
  parts.push(
    { name: '[Content_Types].xml', data: ctypes([['rels', CT_REL], ['xml', 'application/xml'], ['png', 'image/png'], ['jpeg', 'image/jpeg']], [['/ppt/presentation.xml', PC + 'presentation.main+xml'], ['/ppt/slideMasters/slideMaster1.xml', PC + 'slideMaster+xml'], ['/ppt/slideLayouts/slideLayout1.xml', PC + 'slideLayout+xml'], ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'], CORE_CT].concat(slides.map((_, i) => ['/ppt/slides/slide' + (i + 1) + '.xml', PC + 'slide+xml']))) },
    { name: '_rels/.rels', data: rels([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }, CORE_REL]) },
    { name: 'docProps/core.xml', data: coreXml(doc, when) },
    { name: 'ppt/presentation.xml', data: pres },
    { name: 'ppt/_rels/presentation.xml.rels', data: rels([{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }].concat(slides.map((_, i) => ({ id: 'rId' + (i + 2), type: 'slide', target: 'slides/slide' + (i + 1) + '.xml' })))) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master }, { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout }, { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]) },
    { name: 'ppt/theme/theme1.xml', data: theme });
  slideParts.forEach((sp) => parts.push(...sp)); parts.push(...media);
  if (doc.blocks.some((b) => b.t === 'quote' || b.t === 'code')) stated.push(ja ? '引用・コードはスライドでは通常の段落（色・小さい字）で書きました' : 'quotes and code are ordinary paragraphs (muted colour / smaller text) on a slide');
  stated.push(ja ? 'スライドは見出しごとに分割（長い節は「続き」へ）。PowerPoint で開いて配置を確認してください' : 'slides are split by heading (long sections continue on the next); check the layout in PowerPoint');
  return { bytes: zip(parts, when), stated, slides: slides.length };
}

/** every run of text in an OOXML package, in part order — what the verifier looks for the document's words in */
export function packageText(entries) {
  const out = [];
  for (const x of entries) {
    if (!/^(word\/document|ppt\/slides\/slide\d+|xl\/worksheets\/sheet\d+)\.xml$/.test(x.name)) continue;
    const s = dec(x.data);
    for (const m of s.matchAll(/<(?:w:t|a:t|t)(?:\s[^>]*)?>([^<]*)<\/(?:w:t|a:t|t)>/g)) out.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    for (const m of s.matchAll(/<v>([^<]*)<\/v>/g)) out.push(m[1]);
  }
  return out.join('\n');
}

export const OFFICE_WRITERS = { docx: writeDocx, pptx: writePptx, xlsx: writeXlsx };
