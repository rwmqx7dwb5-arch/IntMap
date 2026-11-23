/* ============================================================================
 *  IntMap · THE DOCUMENT MODEL BEHIND EVERY FILE ATLAS WRITES   (js/file-doc.js)
 * ----------------------------------------------------------------------------
 *  Atlas used to be able to research and to write — and then to hand the reader a block of text and
 *  ask them to print it. A deliverable is a FILE, and every format (PDF, Word, PowerPoint, Excel,
 *  HTML, Markdown, CSV, JSON, text) is a different way of laying out THE SAME THING. So there is
 *  one model here and one writer per format in js/file-pdf.js, js/file-office.js and js/file-text.js;
 *  adding a format means adding a writer, never a second description of a document.
 *
 *    doc    { title, subtitle?, author?, date?, lang, blocks[], sources[] }
 *    block  { t:'h',     level:1|2|3, text }
 *           { t:'p',     text }
 *           { t:'ul'|'ol', items:[text] }
 *           { t:'table', columns:[text], rows:[[cell]], caption? }
 *           { t:'img',   image:{ bytes, mime:'image/png'|'image/jpeg', w, h }, caption? }
 *           { t:'quote', text }   { t:'code', text }   { t:'pb' }
 *    source { title, url?, note? }
 *
 *  ⚠ NOTHING HERE INVENTS CONTENT. A document with no block is refused (NO_CONTENT) rather than
 *  filled with a placeholder, a table cell keeps its type (a number stays a number until a writer
 *  that has no number type — CSV, PDF — must print it), and an image that cannot be decoded is
 *  refused BY NAME, never dropped. Pure functions, no DOM: tests/file-deliverables-checks.test.mjs
 *  runs this file under node.
 * ==========================================================================*/

export const FORMATS = Object.freeze(['pdf', 'docx', 'pptx', 'xlsx', 'html', 'md', 'txt', 'csv', 'json']);

/** what each format is, for the planner's catalogue and the reader's card — one place */
export const FORMAT_INFO = Object.freeze({
  pdf:  { ext: 'pdf',  mime: 'application/pdf', label: 'PDF' },
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  pptx: { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  html: { ext: 'html', mime: 'text/html;charset=utf-8', label: 'HTML' },
  md:   { ext: 'md',   mime: 'text/markdown;charset=utf-8', label: 'Markdown' },
  txt:  { ext: 'txt',  mime: 'text/plain;charset=utf-8', label: 'Text' },
  csv:  { ext: 'csv',  mime: 'text/csv;charset=utf-8', label: 'CSV' },
  json: { ext: 'json', mime: 'application/json', label: 'JSON' },
});

/** the spellings a reader or a model uses for a format — resolved once, here */
const FORMAT_WORDS = { word: 'docx', doc: 'docx', powerpoint: 'pptx', ppt: 'pptx', slides: 'pptx', slide: 'pptx', presentation: 'pptx', excel: 'xlsx', xls: 'xlsx',
  spreadsheet: 'xlsx', markdown: 'md', text: 'txt', plain: 'txt', webpage: 'html', htm: 'html' };
export function resolveFormat(x) {
  const s = String(x == null ? '' : x).trim().toLowerCase().replace(/^\./, '');
  if (FORMATS.includes(s)) return s;
  return FORMAT_WORDS[s] || null;
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;   /* control characters XML 1.0 and PDF text cannot carry */
const clean = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(CTRL, '');

/** inline markdown → plain text. Links keep their address in parentheses so the reader still has it on paper. */
function plainInline(s) {
  return clean(s)
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, t, u) => (t.trim() === u ? u : t + ' (' + u + ')'))
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1').replace(/~~([^~]+)~~/g, '$1');
}

/** a data: URL or base64 string → bytes (atob exists in every browser and in node ≥ 16) */
function b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** the pixel size of a PNG or a JPEG, read from its bytes — null when it is neither */
function imageInfo(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: 'image/png', w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { mime: 'image/jpeg', h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

/** an image argument (a data URL, or already bytes) → { bytes, mime, w, h } | { problem } */
export function readImage(src) {
  let bytes = null;
  if (src && src.bytes instanceof Uint8Array) bytes = src.bytes;
  else if (typeof src === 'string') {
    const m = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src.trim());
    if (!m) return { problem: 'unsupported-image' };
    try { bytes = b64ToBytes(m[1].replace(/\s/g, '')); } catch (_) { return { problem: 'bad-base64' }; }
  }
  if (!bytes) return { problem: 'unsupported-image' };
  const info = imageInfo(bytes);
  if (!info || !info.w || !info.h) return { problem: 'unsupported-image' };
  return { bytes, mime: info.mime, w: info.w, h: info.h };
}

/* ── markdown → blocks. Not a full CommonMark: the subset a written report uses, and each construct it
      does not read is kept as a paragraph (never dropped), so nothing the model wrote disappears. ── */
export function markdownToBlocks(md) {
  const lines = clean(md).split('\n'), out = [];
  let i = 0, para = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: plainInline(para.join(' ').replace(/\s+/g, ' ').trim()) }); para = []; } };
  const cells = (ln) => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => plainInline(c.replace(/\\\|/g, '|').trim()));
  while (i < lines.length) {
    const ln = lines[i];
    let m;
    if (/^\s*$/.test(ln)) { flush(); i++; continue; }
    if ((m = /^```/.exec(ln))) { flush(); const body = []; i++; while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]); i++; out.push({ t: 'code', text: body.join('\n') }); continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(ln))) { flush(); out.push({ t: 'h', level: Math.min(3, m[1].length), text: plainInline(m[2]) }); i++; continue; }
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(ln)) { flush(); out.push({ t: 'pb', rule: true }); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush(); const columns = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { const r = cells(lines[i++]); while (r.length < columns.length) r.push(''); rows.push(r.slice(0, Math.max(columns.length, r.length))); }
      out.push({ t: 'table', columns, rows }); continue;
    }
    if ((m = /^\s*>\s?(.*)$/.exec(ln))) { flush(); const q = [m[1]]; i++; while (i < lines.length && (m = /^\s*>\s?(.*)$/.exec(lines[i]))) { q.push(m[1]); i++; } out.push({ t: 'quote', text: plainInline(q.join(' ').trim()) }); continue; }
    if (/^\s*[-*+]\s+/.test(ln) || /^\s*\d+[.)]\s+/.test(ln)) {
      flush(); const ordered = /^\s*\d+[.)]\s+/.test(ln), items = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[i]) : /^\s*[-*+]\s+/.test(lines[i]))) {
        let item = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''); i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(plainInline(item.trim()));
      }
      out.push({ t: ordered ? 'ol' : 'ul', items }); continue;
    }
    para.push(ln.trim()); i++;
  }
  flush();
  return out;
}

const TEXTLIKE = (v) => (v == null ? '' : typeof v === 'string' ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : JSON.stringify(v));

/** the cell a writer without a number type prints */
export function cellText(v) { return typeof v === 'number' && !isFinite(v) ? '' : TEXTLIKE(v); }

/**
 * Atlas's arguments → the document. `a` carries EITHER `markdown` (the usual shape — it is how a model writes a report)
 * OR `blocks`, and `sources` / `tables` / `images` on top. Returns { doc } or { problem, detail }.
 * `images` have been decoded by the caller (the browser decodes charts and map frames; this file has no DOM).
 */
export function buildDoc(a) {
  a = a || {};
  const blocks = [];
  const title = plainInline(a.title || '').trim();
  if (typeof a.markdown === 'string' && a.markdown.trim()) blocks.push(...markdownToBlocks(a.markdown));
  for (const b of (Array.isArray(a.blocks) ? a.blocks : [])) {
    if (!b || typeof b !== 'object') continue;
    const t = String(b.t || b.type || '').toLowerCase();
    if (t === 'h' || t === 'heading') blocks.push({ t: 'h', level: Math.max(1, Math.min(3, +b.level || 1)), text: plainInline(b.text) });
    else if (t === 'p' || t === 'paragraph' || t === 'text') blocks.push({ t: 'p', text: plainInline(b.text) });
    else if (t === 'ul' || t === 'ol' || t === 'list') blocks.push({ t: (t === 'ol' || b.ordered) ? 'ol' : 'ul', items: (Array.isArray(b.items) ? b.items : []).map(plainInline) });
    else if (t === 'quote') blocks.push({ t: 'quote', text: plainInline(b.text) });
    else if (t === 'code') blocks.push({ t: 'code', text: clean(b.text) });
    else if (t === 'pb' || t === 'pagebreak') blocks.push({ t: 'pb' });
    else if (t === 'table') {
      const cols = (Array.isArray(b.columns) ? b.columns : []).map((c) => plainInline(c));
      const rows = (Array.isArray(b.rows) ? b.rows : []).map((r) => Array.isArray(r) ? r : cols.map((c) => (r || {})[c]));
      blocks.push({ t: 'table', columns: cols, rows: rows.map((r) => (r || []).map((v) => (typeof v === 'string' ? plainInline(v) : v))), caption: b.caption ? plainInline(b.caption) : undefined });
    } else if (t === 'img' || t === 'image') {
      const im = readImage(b.image || b.dataUrl || b.src);
      if (im.problem) return { problem: 'bad-image', detail: im.problem };
      blocks.push({ t: 'img', image: im, caption: b.caption ? plainInline(b.caption) : undefined });
    }
  }
  /* tables/images supplied beside the prose go after it, in order — a block list is how to interleave */
  for (const tb of (Array.isArray(a.tables) ? a.tables : [])) {
    if (!tb || !Array.isArray(tb.columns)) continue;
    blocks.push({ t: 'table', columns: tb.columns.map(plainInline), rows: (tb.rows || []).map((r) => (r || []).map((v) => (typeof v === 'string' ? plainInline(v) : v))), caption: tb.caption ? plainInline(tb.caption) : undefined });
  }
  for (const im of (Array.isArray(a.images) ? a.images : [])) {
    if (!im) continue;
    const r = im.image ? im.image : readImage(im.dataUrl || im.bytes || im);
    if (r.problem) return { problem: 'bad-image', detail: r.problem };
    blocks.push({ t: 'img', image: r, caption: im.caption ? plainInline(im.caption) : undefined });
  }
  const real = blocks.filter((b) => b.t !== 'pb' && (b.t === 'img' || b.t === 'table' ? true : (b.text || (b.items && b.items.length))));
  if (!real.length) return { problem: 'no-content', detail: 'markdown / blocks / tables / images all empty' };
  const sources = [];
  for (const s of (Array.isArray(a.sources) ? a.sources : [])) {
    if (!s) continue;
    if (typeof s === 'string') { sources.push(/^https?:\/\//i.test(s.trim()) ? { title: s.trim(), url: s.trim() } : { title: plainInline(s).trim() }); continue; }
    const url = typeof s.url === 'string' && /^https?:\/\//i.test(s.url.trim()) ? s.url.trim() : undefined;
    const ttl = plainInline(s.title || s.name || url || '').trim();
    if (ttl) sources.push({ title: ttl, url, note: s.note ? plainInline(s.note) : undefined });
  }
  const lang = /[぀-ヿ㐀-鿿]/.test(title + blocks.map((b) => b.text || '').join('')) ? 'ja' : 'en';
  return { doc: { title: title || firstHeading(blocks) || (lang === 'ja' ? '無題' : 'Untitled'), subtitle: a.subtitle ? plainInline(a.subtitle) : undefined,
    author: a.author ? plainInline(a.author) : undefined, date: String(a.date || '').trim() || undefined, lang, blocks, sources } };
}
function firstHeading(blocks) { const h = blocks.find((b) => b.t === 'h' && b.text); return h ? h.text : ''; }

/** every character of body text in reading order — what a verifier expects to find back in the file */
export function docText(doc, noUrls) {
  const out = [doc.title];
  if (doc.subtitle) out.push(doc.subtitle);
  for (const b of doc.blocks) {
    if (b.t === 'h' || b.t === 'p' || b.t === 'quote' || b.t === 'code') out.push(b.text);
    else if (b.t === 'ul' || b.t === 'ol') out.push(...b.items);
    else if (b.t === 'table') { if (b.caption) out.push(b.caption); out.push(...b.columns); b.rows.forEach((r) => r.forEach((c) => out.push(cellText(c)))); }
    else if (b.t === 'img' && b.caption) out.push(b.caption);
  }
  if (doc.sources.length) out.push(doc.lang === 'ja' ? '出典' : 'Sources');
  doc.sources.forEach((s) => { out.push(s.title); if (!noUrls && s.url && s.url !== s.title) out.push(s.url); if (s.note) out.push(s.note); });
  return out.filter((x) => x !== '' && x != null).join('\n');
}

/** the file name: the title, made safe for every filesystem, with the extension. Japanese stays Japanese. */
export function fileName(title, fmt) {
  const base = clean(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80).trim() || 'intmap';
  return base + '.' + (FORMAT_INFO[fmt] || { ext: fmt }).ext;
}
