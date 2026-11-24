/* ============================================================================
 *  IntMap · THE PDF WRITER   (js/file-pdf.js)
 * ----------------------------------------------------------------------------
 *  A real PDF, written here, with no library and no server. Two halves:
 *
 *   LAYOUT  layoutDoc(doc, measure) → pages of draw operations (text, rules, fills, images, links). It breaks
 *           lines the way Japanese is broken — at any character, except that 、。」）… never start a line and
 *           「（ never end one — keeps a heading with the lines after it, does not strand one line of a paragraph,
 *           repeats a table's header row on the next page, and slices a row taller than a page rather than
 *           losing it. `measure(text, style)` is the only thing it asks of the platform (points).
 *   WRITE   buildPdf(doc, laid, opts) → bytes. VECTOR: every character is a Type3 glyph whose procedure fills an outline
 *           (opts.glyphOf — in the browser js/file-glyph.js reads it off the reader's own font; there is no CJK font in
 *           the repository and none is shipped), rules and fills are path operators in the page's content stream, and only
 *           a picture (chart, map frame) is an image. Each font carries a ToUnicode map, so the text is searched, selected
 *           and copied in Japanese; furniture (bullets, numbers, footers) is marked /Artifact. Bookmarks come from the
 *           headings; each source URL is a link. The file looks the same on every machine and stays sharp at any zoom.
 *   VERIFY  verifyPdf(bytes, expected) reads the file BACK with its own small parser — header, cross-reference
 *           table (every offset must land on «n 0 obj»), page tree and page count, every Type3 font's glyph procedures,
 *           widths and ToUnicode, every image stream's length and JPEG markers, and the text each page draws, decoded
 *           through the font it names — and compares the characters it finds with the characters the document holds.
 *           A mismatch is a defect, said by name.
 *
 *  ⚠ A glyph is the outline of the reader's font as their device drew it (traced at 192 px, ~1/1000 em precision),
 *  not a font file. A character the device has no font for is caught by the caller (missingGlyphs), never drawn blank.
 *  Pure apart from the measure / glyphOf / imageOf / deflate hooks, so tests/file-deliverables-checks.test.mjs
 *  runs it in node with a deterministic glyph.
 * ==========================================================================*/
import { cellText } from './file-doc.js';

export const PAGE = Object.freeze({ w: 595.28, h: 841.89, mx: 56, top: 62, bottom: 62 });
const BODY = 10.5, LH = 1.7;
const NO_START = new Set([...`、。，．,.）」』】〕〉》］｝！？!?：；:;ゝゞ々ー〜～…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ・％%°′″)]}'’`]);
const NO_END = new Set([...'（「『【〔〈《［｛([{']);
const WORD = /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ'’.,;:!?()\-_/@#%&+=<>~*^\[\]{}|\\$"]+|\s+|[\s\S]/gu;

/** greedy line breaking by `measure(str) → width` into lines no wider than `max` */
export function wrapText(text, max, measure) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const toks = para.match(WORD) || [];
    let line = '', w = 0;
    const push = (force) => { const t = line.replace(/\s+$/, ''); if (t !== '' || force) out.push(t); line = ''; w = 0; };
    for (let tk of toks) {
      const isSp = /^\s+$/.test(tk);
      if (isSp && line === '') continue;
      let tw = measure(tk);
      if (w + tw > max && line !== '') {
        if (isSp) continue;                                     /* a space at the break is dropped */
        if (NO_START.has(tk[0]) && tk.length === 1) { line += tk; w += tw; continue; }   /* kinsoku: it hangs on the previous line */
        let carry = '';
        const last = [...line].pop();
        if (NO_END.has(last)) { line = line.slice(0, -last.length); carry = last; }
        push();
        line = carry; w = carry ? measure(carry) : 0;
      }
      if (tw > max) {                                            /* a single word wider than the line: break it by character */
        for (const ch of [...tk]) { const cw = measure(ch); if (w + cw > max && line !== '') push(); line += ch; w += cw; }
        continue;
      }
      line += tk; w += tw;
    }
    push(true);
  }
  return out;
}

const color = { text: '#1c1c1e', mute: '#6e6e73', link: '#0a64d6', rule: '#c7c7cc', head: '#f2f2f7', code: '#f2f2f7' };

/**
 * doc → { pages:[{ ops, }], outline:[{level,text,page,y}] }.
 * Ops are in points, origin top-left, y is the BASELINE for text:
 *   {k:'t',x,y,s,sz,b,mono,c,deco?}  {k:'r',x,y,w,h,fill}  {k:'l',x1,y1,x2,y2,w,c}  {k:'i',x,y,w,h,img}  {k:'a',x,y,w,h,url}
 * `deco` marks text that is page furniture (a bullet, a number, a footer): drawn, but not in the searchable layer.
 */
export function layoutDoc(doc, measureRaw) {
  const ja = doc.lang === 'ja', W = PAGE.w - PAGE.mx * 2, bottom = PAGE.h - PAGE.bottom;
  const pages = [], outline = [];
  let ops = null, y = 0;
  const m = (sz, b, mono) => (s) => measureRaw(s, { sz, b: !!b, mono: !!mono });
  const newPage = () => { ops = []; pages.push({ ops }); y = PAGE.top; };
  const ensure = (h) => { if (!ops) newPage(); else if (y + h > bottom && y > PAGE.top + 1) newPage(); };
  const text = (x, yy, s, sz, o) => { if (s !== '') ops.push(Object.assign({ k: 't', x, y: yy, s, sz, c: color.text }, o)); };

  /** lay lines out, breaking pages between lines; keeps ≥2 lines together at either end of a paragraph */
  const flow = (lines, x, sz, lh, o, indentFirst) => {
    const per = sz * lh, placed = [];
    let i = 0;
    if (!ops) newPage();
    while (i < lines.length) {
      let fit = Math.floor((bottom - y) / per);
      const left = lines.length - i;
      if (i === 0 && left >= 2 && fit < 2) { newPage(); fit = Math.floor((bottom - y) / per); }
      else if (fit < left && left - fit === 1 && left >= 3 && fit >= 3) fit -= 1;
      if (fit < 1) { newPage(); continue; }
      for (let k = 0; k < Math.min(fit, left); k++, i++) { const by = y + sz * 1.05 + (per - sz * 1.2) / 2; text(x, by, lines[i], sz, o); placed.push({ page: pages.length - 1, y: by }); y += per; }
      if (i < lines.length) newPage();
    }
    return placed;
  };

  const heading = (b) => {
    const sz = b.level === 1 ? 17 : b.level === 2 ? 13.5 : 11.5, lines = wrapText(b.text, W, m(sz, true));
    if (y > PAGE.top + 1) y += sz * (b.level === 1 ? 0.9 : 0.7);
    ensure(lines.length * sz * 1.45 + BODY * LH * 2);
    outline.push({ level: b.level, text: b.text, page: pages.length - 1, y });
    flow(lines, PAGE.mx, sz, 1.45, { b: true });
    if (b.level === 1) { ops.push({ k: 'l', x1: PAGE.mx, y1: y - 1, x2: PAGE.mx + W, y2: y - 1, w: 0.6, c: color.rule }); y += 3; }
    y += 3;
  };
  const paragraph = (s, o, x0, w) => { flow(wrapText(s, w == null ? W : w, m(BODY, o && o.b, o && o.mono)), x0 == null ? PAGE.mx : x0, BODY, LH, o || {}); y += 4; };

  const list = (b) => {
    const ind = 18;
    b.items.forEach((it, idx) => {
      const lines = wrapText(it, W - ind, m(BODY)), per = BODY * LH;
      ensure(Math.min(lines.length, 2) * per);
      const at = flow(lines, PAGE.mx + ind, BODY, LH, {})[0];
      pages[at.page].ops.push({ k: 't', x: PAGE.mx + 4, y: at.y, s: b.t === 'ol' ? (idx + 1) + '.' : '•', sz: BODY, c: color.mute, deco: true });
    });
    y += 4;
  };

  const quote = (b) => {
    const lines = wrapText(b.text, W - 18, m(BODY)), per = BODY * LH;
    ensure(Math.min(lines.length, 2) * per);
    const y0 = y, p0 = pages.length - 1;
    flow(lines, PAGE.mx + 14, BODY, LH, { c: color.mute });
    if (pages.length - 1 === p0) pages[p0].ops.push({ k: 'r', x: PAGE.mx + 3, y: y0 + 1, w: 2.4, h: y - y0 - 2, fill: color.rule });
    y += 4;
  };

  const code = (b) => {
    const sz = 9, lines = wrapText(b.text, W - 14, m(sz, false, true)), per = sz * 1.5;
    ensure(Math.min(lines.length, 3) * per + 8);
    let i = 0;
    while (i < lines.length) {
      const fit = Math.max(1, Math.floor((bottom - y - 8) / per)), take = lines.slice(i, i + fit), h = take.length * per + 8;
      ops.push({ k: 'r', x: PAGE.mx, y, w: W, h, fill: color.code });
      take.forEach((ln, k) => text(PAGE.mx + 7, y + 4 + sz * 1.05 + (per - sz * 1.2) / 2 + k * per, ln, sz, { mono: true }));
      y += h; i += take.length;
      if (i < lines.length) newPage();
    }
    y += 6;
  };

  const image = (b) => {
    const im = b.image; let w = Math.min(W, im.w * 0.75), h = w * im.h / im.w; const maxH = 330;
    if (h > maxH) { h = maxH; w = h * im.w / im.h; }
    const cap = b.caption ? wrapText(b.caption, W, m(9)) : [];
    ensure(h + cap.length * 9 * 1.5 + 8);
    ops.push({ k: 'i', x: PAGE.mx + (W - w) / 2, y, w, h, img: im }); y += h + 4;
    if (cap.length) { const xs = cap.map((c) => m(9)(c)); cap.forEach((c, k) => { text(PAGE.mx + (W - xs[k]) / 2, y + 9 * 1.05, c, 9, { c: color.mute }); y += 9 * 1.5; }); }
    y += 8;
  };

  const table = (b) => {
    const nc = Math.max(1, b.columns.length), pad = 4, sz = 9.5, per = sz * 1.55, meas = m(sz);
    const cellsOf = (r) => b.columns.map((_, i) => cellText(r[i]));
    const all = [b.columns.map((c) => c)].concat(b.rows.map(cellsOf));
    const nat = [], min = [];
    for (let c = 0; c < nc; c++) {
      let n = 0, mi = 0;
      all.forEach((r) => { const s = String(r[c] == null ? '' : r[c]); n = Math.max(n, ...s.split('\n').map((l) => meas(l))); (s.match(WORD) || []).forEach((t) => { mi = Math.max(mi, Math.min(meas(t.trim()), 90)); }); });
      nat.push(n + pad * 2); min.push(Math.min(mi + pad * 2, W / nc));
    }
    const sumN = nat.reduce((s, v) => s + v, 0); let cw;
    if (sumN <= W) cw = nat.map((v) => v + (W - sumN) * v / sumN);
    else { const sumM = min.reduce((s, v) => s + v, 0), extra = nat.map((v, i) => v - min[i]), sumE = extra.reduce((s, v) => s + v, 0) || 1; cw = min.map((v, i) => v + Math.max(0, W - sumM) * extra[i] / sumE); }
    const k = W / cw.reduce((s, v) => s + v, 0); cw = cw.map((v) => v * k);
    const xs = [PAGE.mx]; cw.forEach((v) => xs.push(xs[xs.length - 1] + v));
    const wrapRow = (r, bold) => r.map((s, c) => wrapText(String(s == null ? '' : s), cw[c] - pad * 2, m(sz, bold)));
    if (b.caption) { const cl = wrapText(b.caption, W, m(10.5, true)); ensure(cl.length * 10.5 * 1.5 + per * 3); flow(cl, PAGE.mx, 10.5, 1.5, { b: true }); }
    else ensure(per * 3 + 6);
    const header = wrapRow(b.columns, true);
    const drawRow = (cells, head, numeric, fromLine, maxH, deco) => {
      const total = Math.max(1, ...cells.map((c) => c.length)), avail = Math.max(1, Math.floor((maxH - pad * 2) / per)), n = Math.min(avail, total - fromLine);
      const h = n * per + pad * 2;
      if (head) ops.push({ k: 'r', x: PAGE.mx, y, w: W, h, fill: color.head });
      cells.forEach((lines, c) => {
        lines.slice(fromLine, fromLine + n).forEach((ln, i) => {
          const wdt = meas(ln), right = numeric && numeric[c] && !head;
          text(right ? xs[c + 1] - pad - wdt : xs[c] + pad, y + pad + sz * 1.05 + (per - sz * 1.2) / 2 + i * per, ln, sz, { b: head, deco: !!deco });
        });
      });
      ops.push({ k: 'l', x1: PAGE.mx, y1: y + h, x2: PAGE.mx + W, y2: y + h, w: 0.5, c: color.rule });
      xs.forEach((x) => ops.push({ k: 'l', x1: x, y1: y, x2: x, y2: y + h, w: 0.5, c: color.rule }));
      y += h; return { n, total };
    };
    const headerH = Math.max(1, ...header.map((c) => c.length)) * per + pad * 2;
    let firstHeader = true;
    const drawHeader = () => { ops.push({ k: 'l', x1: PAGE.mx, y1: y, x2: PAGE.mx + W, y2: y, w: 0.5, c: color.rule }); drawRow(header, true, null, 0, bottom - y, !firstHeader); firstHeader = false; };
    ensure(headerH + per + pad * 2); drawHeader();
    b.rows.forEach((raw) => {
      const r = cellsOf(raw), numeric = raw.map((v) => typeof v === 'number'), cells = wrapRow(r, false);
      const rowH = Math.max(1, ...cells.map((c) => c.length)) * per + pad * 2;
      if (y + rowH > bottom) { newPage(); drawHeader(); }
      if (rowH > bottom - y) {                                    /* taller than the page: slice by lines, never drop */
        let from = 0, total = Math.max(...cells.map((c) => c.length));
        while (from < total) { const { n } = drawRow(cells, false, numeric, from, bottom - y); from += n; if (from < total) { newPage(); drawHeader(); } }
      } else drawRow(cells, false, numeric, 0, bottom - y);
    });
    y += 10;
  };

  /* ── the document ── */
  newPage();
  { const tl = wrapText(doc.title, W, m(25, true)); flow(tl, PAGE.mx, 25, 1.35, { b: true }); y += 2;
    outline.push({ level: 1, text: doc.title, page: 0, y: PAGE.top });
    if (doc.subtitle) { flow(wrapText(doc.subtitle, W, m(12.5)), PAGE.mx, 12.5, 1.5, { c: color.mute }); }
    const meta = [doc.author, doc.date].filter(Boolean).join(' · '); if (meta) { flow([meta], PAGE.mx, 9.5, 1.6, { c: color.mute }); }
    ops.push({ k: 'l', x1: PAGE.mx, y1: y + 2, x2: PAGE.mx + W, y2: y + 2, w: 1, c: color.text }); y += 14; }
  for (const b of doc.blocks) {
    if (b.t === 'h') heading(b);
    else if (b.t === 'p') paragraph(b.text);
    else if (b.t === 'ul' || b.t === 'ol') list(b);
    else if (b.t === 'quote') quote(b);
    else if (b.t === 'code') code(b);
    else if (b.t === 'table') table(b);
    else if (b.t === 'img') image(b);
    else if (b.t === 'pb' && !b.rule) { if (y > PAGE.top + 1) newPage(); }
    else if (b.t === 'pb') { ensure(20); ops.push({ k: 'l', x1: PAGE.mx, y1: y + 6, x2: PAGE.mx + W, y2: y + 6, w: 0.6, c: color.rule }); y += 16; }
  }
  if (doc.sources.length) {
    heading({ level: 2, text: ja ? '出典' : 'Sources' });
    doc.sources.forEach((s, i) => {
      const per = BODY * 0.95 * 1.55, tl = wrapText(s.title + (s.note ? ' — ' + s.note : ''), W - 22, m(BODY * 0.95));
      ensure(tl.length * per + (s.url ? per : 0));
      const at = flow(tl, PAGE.mx + 22, BODY * 0.95, 1.55, {})[0];
      pages[at.page].ops.push({ k: 't', x: PAGE.mx + 2, y: at.y, s: (i + 1) + '.', sz: BODY * 0.95, c: color.mute, deco: true });
      if (s.url && s.url !== s.title) {
        const ul = wrapText(s.url, W - 22, m(8.5)); ul.forEach((ln) => { ensure(8.5 * 1.5); const yy = y + 8.5 * 1.05; text(PAGE.mx + 22, yy, ln, 8.5, { c: color.link }); ops.push({ k: 'a', x: PAGE.mx + 22, y: y, w: m(8.5)(ln), h: 8.5 * 1.45, url: s.url }); y += 8.5 * 1.5; });
      } else if (s.url) { const last = pages[pages.length - 1].ops.filter((o) => o.k === 't' && !o.deco).slice(-tl.length); last.forEach((o) => ops.push({ k: 'a', x: o.x, y: o.y - o.sz, w: m(o.sz)(o.s), h: o.sz * 1.4, url: s.url })); }
      y += 3;
    });
  }
  /* footers — title on the left, «n / N» on the right; furniture, so not in the text layer */
  const N = pages.length;
  pages.forEach((p, i) => {
    const fy = PAGE.h - 34, label = (i + 1) + ' / ' + N, lw = m(8.5)(label);
    const t = wrapText(doc.title, W - lw - 20, m(8.5))[0] || '';
    p.ops.push({ k: 't', x: PAGE.mx, y: fy, s: t + (t !== doc.title ? '…' : ''), sz: 8.5, c: color.mute, deco: true }, { k: 't', x: PAGE.mx + W - lw, y: fy, s: label, sz: 8.5, c: color.mute, deco: true });
  });
  return { pages, outline };
}

/* ── writing ──────────────────────────────────────────────────────────────── */
const enc = new TextEncoder();
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const utf16hex = (s) => { let h = ''; for (let i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i)); return h; };
const pdfStr = (s) => '<FEFF' + utf16hex(s) + '>';
const num = (v) => (Math.round(v * 100) / 100).toString();
const urlStr = (u) => '(' + encodeURI(u).replace(/[()\\]/g, (c) => '\\' + c) + ')';
const pdfDate = (d) => 'D:' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
const rgb = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); const k = m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255) : [0, 0, 0]; return k.map((v) => num(v)).join(' '); };
const styleOf = (o) => (o.mono ? 'm' : o.b ? 'b' : 'n');
const PER_FONT = 255;                 /* a Type3 font addresses its glyphs with one byte: codes 1..255 */

/**
 * The file. Text and figures are VECTORS in the page's own content stream: each character is a Type3 glyph whose
 * procedure fills the outline `glyphOf(ch, style)` returned (even-odd, 1000 units per em, d1 so the fill colour is
 * the page's), rules and rectangles are re / m l S, and only a picture (a chart, a map frame) is an image XObject.
 * Every font has a ToUnicode map so the text is searched, selected and copied; page furniture (bullet, number,
 * footer, a repeated table header) is marked /Artifact — readers that honour it leave it out of extraction, and verifyPdf compares only the rest (pdf.js, checked 2026-11-21, extracts it anyway: a bullet or «1 / 1» can appear in a copy, as in any word-processor PDF).
 *
 *  doc, laid     — from layoutDoc
 *  opts.glyphOf  — (ch, style 'n'|'b'|'m') → { adv (units/em), path:[[ [x,y],… ],…] }   (required)
 *  opts.measure  — the measure layout used: each run is set with the horizontal scaling that makes its width equal it
 *  opts.imageOf  — async (img) → { jpeg:Uint8Array, w, h } | { rgb:Uint8Array, w, h }; absent → pictures are refused
 *  opts.deflate  — async (Uint8Array) → zlib bytes (FlateDecode); absent → streams are written plain
 *  opts.when     — Date for the info dictionary
 */
export async function buildPdf(doc, laid, opts) {
  const { glyphOf, measure, imageOf, deflate } = opts, when = opts.when instanceof Date ? opts.when : new Date();
  const chunks = [], offsets = []; let size = 0;
  const put = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); size += u.length; };
  let nobj = 0;
  const reserve = () => ++nobj;
  const obj = (id, body, stream) => {
    offsets[id] = size;
    put(id + ' 0 obj\n' + body);
    if (stream) { put('\nstream\n'); put(stream); put('\nendstream'); }
    put('\nendobj\n');
  };
  const flate = async (bytes) => { if (!deflate || bytes.length < 64) return { data: bytes, f: '' }; const z = await deflate(bytes); return z && z.length < bytes.length ? { data: z, f: ' /Filter /FlateDecode' } : { data: bytes, f: '' }; };
  const sobj = async (id, dict, bytes) => { const z = await flate(bytes); obj(id, '<< ' + dict + z.f + ' /Length ' + z.data.length + ' >>', z.data); };

  /* the alphabet: per style, every character drawn gets (font, code); 255 per font */
  const fonts = [], where = { n: new Map(), b: new Map(), m: new Map() };
  const slot = (st, ch) => {
    let w = where[st].get(ch); if (w) return w;
    let f = fonts.filter((x) => x.style === st).pop();
    if (!f || f.chars.length >= PER_FONT) { f = { style: st, chars: [] }; fonts.push(f); }
    f.chars.push(ch); w = { f, code: f.chars.length }; where[st].set(ch, w); return w;
  };
  const glyphs = new Map();
  const glyph = (st, ch) => { const k = st + ch; let g = glyphs.get(k); if (!g) { g = glyphOf(ch, st) || { adv: 1000, path: [] }; glyphs.set(k, g); } return g; };
  laid.pages.forEach((p) => p.ops.forEach((o) => { if (o.k === 't') for (const ch of o.s) slot(styleOf(o), ch); }));
  if (fonts.length > 200) return { problem: 'alphabet-too-large' };

  /* pictures, once each */
  const picIds = new Map(), picOrder = [];
  for (const p of laid.pages) for (const o of p.ops) if (o.k === 'i' && !picIds.has(o.img.bytes)) {
    if (!imageOf) return { problem: 'no-image-encoder' };
    const im = await imageOf(o.img); if (!im || !(im.jpeg || im.rgb)) return { problem: 'image-failed' };
    picIds.set(o.img.bytes, { im, id: 0, name: 'Im' + (picOrder.length + 1) }); picOrder.push(o.img.bytes);
  }

  const catalog = reserve(), pagesId = reserve(), infoId = reserve();
  fonts.forEach((f, n) => { f.id = reserve(); f.tu = reserve(); f.enc = reserve(); f.procs = f.chars.map(() => reserve()); f.name = 'F' + (n + 1); });
  picOrder.forEach((k) => { picIds.get(k).id = reserve(); });
  const pageIds = laid.pages.map(() => reserve()), contentIds = laid.pages.map(() => reserve());
  const annots = laid.pages.map((p) => p.ops.filter((o) => o.k === 'a').map((o) => ({ id: reserve(), o })));
  const outlineItems = laid.outline.map((o) => ({ o, id: reserve() })), outlineRoot = outlineItems.length ? reserve() : 0;

  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(catalog, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R /Lang (' + (doc.lang === 'ja' ? 'ja-JP' : 'en-US') + ') /ViewerPreferences << /DisplayDocTitle true >>' + (outlineRoot ? ' /Outlines ' + outlineRoot + ' 0 R /PageMode /UseOutlines' : '') + ' >>');
  obj(pagesId, '<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] >>');
  obj(infoId, '<< /Title ' + pdfStr(doc.title) + (doc.author ? ' /Author ' + pdfStr(doc.author) : '') + ' /Producer ' + pdfStr('IntMap Atlas') + ' /Creator ' + pdfStr('IntMap Atlas') + ' /CreationDate (' + pdfDate(when) + ') >>');

  for (const f of fonts) {
    const glyphList = f.chars.map((ch) => glyph(f.style, ch));
    const names = f.chars.map((_, i) => '/g' + (i + 1));
    let bx0 = 0, by0 = -250, bx1 = 1000, by1 = 950;   /* the box every glyph fits in: only a hint to the reader */
    for (const g of glyphList) for (const c of g.path) for (const [x, y] of c) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    obj(f.id, '<< /Type /Font /Subtype /Type3 /Name /' + f.name + ' /FontBBox [' + [bx0, by0, bx1, by1].join(' ') + '] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ' + names.map((n, i) => n + ' ' + f.procs[i] + ' 0 R').join(' ') + ' >> /Encoding ' + f.enc + ' 0 R /FirstChar 1 /LastChar ' + f.chars.length + ' /Widths [' + glyphList.map((g) => num(g.adv)).join(' ') + '] /ToUnicode ' + f.tu + ' 0 R >>');
    obj(f.enc, '<< /Type /Encoding /Differences [1 ' + names.join(' ') + '] >>');
    let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n';
    for (let i = 0; i < f.chars.length; i += 100) {
      const part = f.chars.slice(i, i + 100);
      cm += part.length + ' beginbfchar\n' + part.map((ch, k) => '<' + hex2(i + k + 1) + '> <' + utf16hex(ch) + '>').join('\n') + '\nendbfchar\n';
    }
    cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    await sobj(f.tu, '', enc.encode(cm));
    for (let i = 0; i < f.chars.length; i++) {
      const g = glyphList[i]; let ink = [1e9, 1e9, -1e9, -1e9], d = '';
      for (const c of g.path) {
        c.forEach(([x, y], k) => { d += x + ' ' + y + (k ? ' l\n' : ' m\n'); if (x < ink[0]) ink[0] = x; if (y < ink[1]) ink[1] = y; if (x > ink[2]) ink[2] = x; if (y > ink[3]) ink[3] = y; });
        d += 'h\n';
      }
      if (!g.path.length) ink = [0, 0, 0, 0];
      await sobj(f.procs[i], '', enc.encode(num(g.adv) + ' 0 ' + ink.join(' ') + ' d1\n' + (d ? d + 'f*\n' : '')));
    }
  }
  for (const k of picOrder) {
    const { im, id } = picIds.get(k), data = im.jpeg || im.rgb;
    if (im.jpeg) obj(id, '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + data.length + ' >>', data);
    else await sobj(id, '/Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8', data);
  }

  let runs = 0, artifacts = 0;
  for (let i = 0; i < laid.pages.length; i++) {
    const p = laid.pages[i], X = (v) => num(v), Y = (v) => num(PAGE.h - v), used = new Set(), usedPics = new Set();
    let c = '';
    for (const o of p.ops) {
      if (o.k === 'r') c += rgb(o.fill) + ' rg ' + X(o.x) + ' ' + Y(o.y + o.h) + ' ' + num(o.w) + ' ' + num(o.h) + ' re f\n';
      else if (o.k === 'l') c += rgb(o.c) + ' RG ' + num(o.w) + ' w ' + X(o.x1) + ' ' + Y(o.y1) + ' m ' + X(o.x2) + ' ' + Y(o.y2) + ' l S\n';
      else if (o.k === 'i') { const pc = picIds.get(o.img.bytes); usedPics.add(pc); c += 'q ' + num(o.w) + ' 0 0 ' + num(o.h) + ' ' + X(o.x) + ' ' + Y(o.y + o.h) + ' cm /' + pc.name + ' Do Q\n'; }
      else if (o.k === 't' && o.s !== '') {
        const st = styleOf(o), chs = [...o.s], nat = chs.reduce((s, ch) => s + glyph(st, ch).adv, 0) * o.sz / 1000, wdt = measure(o.s, { sz: o.sz, b: !!o.b, mono: !!o.mono });
        const tz = nat > 0 ? Math.max(50, Math.min(200, wdt / nat * 100)) : 100;
        const segs = []; let cur = null;
        for (const ch of chs) { const w = slot(st, ch); if (!cur || cur.f !== w.f) { cur = { f: w.f, codes: '' }; segs.push(cur); } cur.codes += hex2(w.code); }
        if (o.deco) { c += '/Artifact BMC\n'; artifacts++; } else runs++;
        c += rgb(o.c) + ' rg BT ' + num(tz) + ' Tz ' + X(o.x) + ' ' + Y(o.y) + ' Td ' + segs.map((s) => { used.add(s.f); return '/' + s.f.name + ' ' + num(o.sz) + ' Tf <' + s.codes + '> Tj'; }).join(' ') + ' ET\n';
        if (o.deco) c += 'EMC\n';
      }
    }
    await sobj(contentIds[i], '', enc.encode(c));
    annots[i].forEach(({ id, o }) => obj(id, '<< /Type /Annot /Subtype /Link /Rect [' + [X(o.x), Y(o.y + o.h), X(o.x + o.w), Y(o.y)].join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + urlStr(o.url) + ' >> >>'));
    const res = '<< ' + (used.size ? '/Font << ' + [...used].map((f) => '/' + f.name + ' ' + f.id + ' 0 R').join(' ') + ' >> ' : '') + (usedPics.size ? '/XObject << ' + [...usedPics].map((pc) => '/' + pc.name + ' ' + pc.id + ' 0 R').join(' ') + ' >> ' : '') + '>>';
    obj(pageIds[i], '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + PAGE.w + ' ' + PAGE.h + '] /Resources ' + res + ' /Contents ' + contentIds[i] + ' 0 R' + (annots[i].length ? ' /Annots [' + annots[i].map((a) => a.id + ' 0 R').join(' ') + ']' : '') + ' >>');
  }
  if (outlineRoot) {
    /* level-1 entries are the top; deeper ones hang under the latest level-1 (a two-level tree is what a reader's sidebar shows well) */
    const tops = [];
    outlineItems.forEach((it) => { if (it.o.level <= 1 || !tops.length) tops.push({ it, kids: [] }); else tops[tops.length - 1].kids.push(it); });
    const dest = (it) => '/Dest [' + pageIds[it.o.page] + ' 0 R /XYZ 0 ' + num(PAGE.h - it.o.y + 12) + ' null]';
    const write = (list, parent) => list.forEach((t, i) => {
      const it = t.it || t, kids = t.kids || [];
      obj(it.id, '<< /Title ' + pdfStr(it.o.text) + ' /Parent ' + parent + ' 0 R' + (i ? ' /Prev ' + (list[i - 1].it || list[i - 1]).id + ' 0 R' : '') + (i < list.length - 1 ? ' /Next ' + (list[i + 1].it || list[i + 1]).id + ' 0 R' : '') + (kids.length ? ' /First ' + kids[0].id + ' 0 R /Last ' + kids[kids.length - 1].id + ' 0 R /Count ' + kids.length : '') + ' ' + dest(it) + ' >>');
      if (kids.length) write(kids, it.id);
    });
    obj(outlineRoot, '<< /Type /Outlines /First ' + tops[0].it.id + ' 0 R /Last ' + tops[tops.length - 1].it.id + ' 0 R /Count ' + outlineItems.length + ' >>');
    write(tops, outlineRoot);
  }
  const xref = size;
  put('xref\n0 ' + (nobj + 1) + '\n0000000000 65535 f \n');
  for (let i = 1; i <= nobj; i++) put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  put('trailer\n<< /Size ' + (nobj + 1) + ' /Root ' + catalog + ' 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  const out = new Uint8Array(size); let o = 0; for (const ch of chunks) { out.set(ch, o); o += ch.length; }
  return { bytes: out, pages: pageIds.length, fonts: fonts.length, glyphs: glyphs.size, runs, artifacts, images: picOrder.length };
}

/* ── reading it back ─────────────────────────────────────────────────────── */
const latin = (b, s, e) => { let r = ''; for (let i = s; i < e; i++) r += String.fromCharCode(b[i]); return r; };

/**
 * Open a PDF this module wrote and report what is really in it. → { ok, pages, text, fonts, glyphs, images, problems[] }.
 * Async only because content streams may be Flate-compressed: `inflate` (async bytes → bytes) is the reader's own.
 * `expectedText` (the document's own words) is compared character-for-character, whitespace aside — page furniture
 * (/Artifact) is not part of it; `expectedPages` / `expectedImages` when the caller knows them.
 * Checked from the file alone: header, EOF, every xref offset lands on «n 0 obj», stream lengths, the page tree, and for
 * every Type3 font its CharProcs (one per code, each a d1 procedure whose paths close and end in a fill), Widths and
 * ToUnicode; every image's markers; and the text each page draws, decoded through the font it names.
 */
export async function verifyPdf(bytes, expectedText, expectedPages, inflate, expectedImages) {
  const problems = [], s = latin(bytes, 0, bytes.length);
  const fail = (extra) => ({ ok: false, pages: 0, text: '', fonts: 0, glyphs: 0, images: 0, problems: problems.concat(extra) });
  if (!s.startsWith('%PDF-')) problems.push('no-pdf-header');
  if (!/%%EOF\s*$/.test(s)) problems.push('no-eof-marker');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  if (!sx) return fail('no-startxref');
  const xo = +sx[1];
  if (s.slice(xo, xo + 4) !== 'xref') return fail('startxref-not-at-xref');
  const head = /xref\s+0\s+(\d+)\s+/.exec(s.slice(xo, xo + 40)); const total = head ? +head[1] : 0;
  const entries = []; let p = xo + head[0].length;
  for (let i = 0; i < total; i++, p += 20) entries.push({ off: +s.slice(p, p + 10), kind: s[p + 17] });
  const cache = new Map();
  const objAt = async (n) => {
    if (cache.has(n)) return cache.get(n);
    const e = entries[n]; if (!e || e.kind !== 'n') return null;
    const hd = n + ' 0 obj\n';
    if (s.slice(e.off, e.off + hd.length) !== hd) { problems.push('xref-offset-wrong:' + n); return null; }
    const end = s.indexOf('endobj', e.off), body = s.slice(e.off + hd.length, end), st = body.indexOf('\nstream\n');
    let stream = null, dict = body;
    if (st >= 0) {
      dict = body.slice(0, st); const len = +(/\/Length (\d+)/.exec(dict) || [])[1], a = e.off + hd.length + st + 8;
      stream = bytes.subarray(a, a + len);
      if (latin(bytes, a + len, a + len + 10).indexOf('endstream') < 0) problems.push('stream-length-wrong:' + n);
      if (/\/FlateDecode/.test(dict)) {
        if (!inflate) { stream = null; problems.push('cannot-inflate:' + n); } else { try { stream = await inflate(stream); } catch (_) { stream = null; problems.push('inflate-failed:' + n); } }
      }
    }
    const r = { dict, stream }; cache.set(n, r); return r;
  };
  for (let i = 1; i < total; i++) await objAt(i);
  const root = /\/Root (\d+) 0 R/.exec(s.slice(xo)); const cat = root && await objAt(+root[1]);
  const pagesRef = cat && /\/Pages (\d+) 0 R/.exec(cat.dict); const pagesObj = pagesRef && await objAt(+pagesRef[1]);
  if (!pagesObj) return fail('no-page-tree');
  const count = +(/\/Count (\d+)/.exec(pagesObj.dict) || [])[1], kids = [...pagesObj.dict.matchAll(/(\d+) 0 R/g)].map((m) => +m[1]);
  if (count !== kids.length) problems.push('page-count-mismatch');
  if (expectedPages != null && expectedPages !== count) problems.push('expected-' + expectedPages + '-pages-found-' + count);

  /* a Type3 font: ToUnicode (code → text), and the soundness of its glyph procedures */
  const fontCache = new Map(); let glyphTotal = 0, fontTotal = 0;
  const readFont = async (id) => {
    if (fontCache.has(id)) return fontCache.get(id);
    const f = await objAt(id), res = { map: new Map() }; fontCache.set(id, res);
    if (!f || !/\/Subtype \/Type3/.test(f.dict)) { problems.push('font-' + id + '-not-type3'); return res; }
    fontTotal++;
    const tuRef = /\/ToUnicode (\d+) 0 R/.exec(f.dict), tu = tuRef && await objAt(+tuRef[1]);
    if (!tu || !tu.stream) problems.push('font-' + id + '-no-tounicode');
    else {
      const t = latin(tu.stream, 0, tu.stream.length);
      for (const blk of t.matchAll(/beginbfchar\n([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9A-F]{2})> <([0-9A-F]+)>/g)) { let str = ''; for (let i = 0; i < m[2].length; i += 4) str += String.fromCharCode(parseInt(m[2].slice(i, i + 4), 16)); res.map.set(parseInt(m[1], 16), str); }
    }
    const procs = [...(/\/CharProcs << ([^>]*) >>/.exec(f.dict) || [, ''])[1].matchAll(/\/(g\d+) (\d+) 0 R/g)];
    const last = +(/\/LastChar (\d+)/.exec(f.dict) || [])[1], widths = (/\/Widths \[([^\]]*)\]/.exec(f.dict) || [, ''])[1].trim().split(/\s+/).filter(Boolean);
    if (procs.length !== last || widths.length !== last || res.map.size !== last) problems.push('font-' + id + '-counts:' + procs.length + '/' + widths.length + '/' + res.map.size + '/' + last);
    for (const [, name, pid] of procs) {
      const pr = await objAt(+pid); if (!pr || !pr.stream) { problems.push('charproc-missing:' + name); continue; }
      glyphTotal++;
      const t = latin(pr.stream, 0, pr.stream.length);
      if (!/^-?[\d.]+ 0 (-?[\d.]+ ){3}-?[\d.]+ d1\n/.test(t)) problems.push('charproc-no-d1:' + name);
      else if (/ m\n/.test(t) && (!/f\*\n$/.test(t) || (t.match(/ m\n/g) || []).length !== (t.match(/\nh\n/g) || []).length)) problems.push('charproc-open-path:' + name);
    }
    return res;
  };

  let text = '', images = 0;
  for (let i = 0; i < kids.length; i++) {
    const pg = await objAt(kids[i]); if (!pg) continue;
    const ci = /\/Contents (\d+) 0 R/.exec(pg.dict), c = ci && await objAt(+ci[1]);
    if (!c || !c.stream) { problems.push('page-' + (i + 1) + '-no-contents'); continue; }
    const fonts = new Map([...pg.dict.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => [m[1], +m[2]]));
    for (const m of pg.dict.matchAll(/\/(Im\d+) (\d+) 0 R/g)) {
      const im = await objAt(+m[2]); images++;
      if (!im || !im.stream) problems.push('page-' + (i + 1) + '-no-image');
      else if (/\/DCTDecode/.test(im.dict) && !(im.stream[0] === 0xFF && im.stream[1] === 0xD8 && im.stream[im.stream.length - 2] === 0xFF && im.stream[im.stream.length - 1] === 0xD9)) problems.push('page-' + (i + 1) + '-jpeg-markers');
    }
    const cs = latin(c.stream, 0, c.stream.length);
    /* walk the stream: /Artifact BMC … EMC spans are furniture; each «/Fn sz Tf <hex> Tj» is decoded through the font it names */
    let inArt = false, line = '';
    for (const m of cs.matchAll(/\/Artifact BMC|\bEMC\b|\/(F\d+) [\d.]+ Tf <([0-9A-F]*)> Tj|ET\n/g)) {
      if (m[0] === '/Artifact BMC') inArt = true;
      else if (m[0] === 'EMC') inArt = false;
      else if (m[1]) {
        const fid = fonts.get(m[1]); if (!fid) { problems.push('page-' + (i + 1) + '-unknown-font:' + m[1]); continue; }
        const f = await readFont(fid);
        if (inArt) continue;
        for (let k = 0; k < m[2].length; k += 2) line += f.map.get(parseInt(m[2].slice(k, k + 2), 16)) || '�';
      } else if (m[0] === 'ET\n' && line !== '') { text += line + '\n'; line = ''; }
    }
  }
  if (text.indexOf('�') >= 0) problems.push('undecodable-text');
  if (expectedImages != null && expectedImages !== images) problems.push('expected-' + expectedImages + '-images-found-' + images);
  if (expectedText != null) {
    const norm = (x) => [...String(x).replace(/\s+/g, '')].sort().join('');
    if (norm(text) !== norm(expectedText)) {
      const a = new Map(); for (const ch of String(expectedText).replace(/\s+/g, '')) a.set(ch, (a.get(ch) || 0) + 1);
      for (const ch of text.replace(/\s+/g, '')) a.set(ch, (a.get(ch) || 0) - 1);
      const diff = [...a].filter(([, v]) => v !== 0).slice(0, 8).map(([k, v]) => k + (v > 0 ? '-' : '+') + Math.abs(v)).join(' ');
      problems.push('text-differs:' + diff);
    }
  }
  return { ok: problems.length === 0, pages: count, text, fonts: fontTotal, glyphs: glyphTotal, images, problems };
}
