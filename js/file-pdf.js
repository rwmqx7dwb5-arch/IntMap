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
 *   WRITE   buildPdf(pages, …) → bytes. Each page is the page IMAGE (rasterised by the caller from the same
 *           operations) with the page's text laid over it INVISIBLY (render mode 3) in a Type0 font whose
 *           ToUnicode map is the document's own alphabet — so the file looks identical on every machine
 *           (no font has to be embedded or exist on the reader's) and its text can still be searched, selected
 *           and copied, in Japanese. Bookmarks come from the headings; each source URL is a link.
 *   VERIFY  verifyPdf(bytes, expected) reads the file BACK with its own small parser — header, cross-reference
 *           table (every offset must land on «n 0 obj»), page tree and page count, every image stream's length
 *           and JPEG markers, and the text layer decoded through the ToUnicode map — and compares the
 *           characters it finds with the characters the document holds. A mismatch is a defect, said by name.
 *
 *  ⚠ What this is not: the text on the page is a picture, not vector glyphs (the only way to put Japanese on
 *  a page in the browser without shipping a CJK font — there is none in the repository). The card says so.
 *  Pure apart from the `measure` / `rasterize` hooks, so tests/file-deliverables-checks.test.mjs runs it in node.
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
const utf16hex = (s) => { let h = ''; for (let i = 0; i < s.length; i++) h += hex4(s.charCodeAt(i)); return h; };
const pdfStr = (s) => '<FEFF' + utf16hex(s) + '>';
const num = (v) => (Math.round(v * 100) / 100).toString();
const urlStr = (u) => '(' + encodeURI(u).replace(/[()\\]/g, (c) => '\\' + c) + ')';
const pdfDate = (d) => 'D:' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';

/**
 * pages: from layoutDoc; `images[i]` is page i's raster — { jpeg: Uint8Array, w, h } or { rgb: Uint8Array, w, h };
 * `measure` is the same one layout used (it sets each text run's horizontal scaling so a selection box matches the picture).
 */
export function buildPdf(doc, laid, images, measure, when) {
  when = when instanceof Date ? when : new Date();
  const chunks = [], offsets = []; let size = 0;
  const put = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); size += u.length; };
  let nobj = 0; const ids = [];
  const reserve = () => { ids.push(++nobj); return nobj; };
  const obj = (id, body, stream) => {
    offsets[id] = size;
    put(id + ' 0 obj\n' + body);
    if (stream) { put('\nstream\n'); put(stream); put('\nendstream'); }
    put('\nendobj\n');
  };

  /* the alphabet: every character of the searchable text gets a 16-bit code, and the ToUnicode map says what it is */
  const cid = new Map(), chars = [];
  const code = (ch) => { let c = cid.get(ch); if (!c) { c = cid.size + 1; cid.set(ch, c); chars.push(ch); } return c; };
  const textOps = laid.pages.map((p) => p.ops.filter((o) => o.k === 't' && !o.deco && o.s.trim() !== ''));
  textOps.forEach((os) => os.forEach((o) => { for (const ch of o.s) code(ch); }));
  if (cid.size > 65000) return { problem: 'alphabet-too-large' };

  const catalog = reserve(), pagesId = reserve(), infoId = reserve(), fontId = reserve(), cidFont = reserve(), descId = reserve(), tuId = reserve();
  const pageIds = laid.pages.map(() => reserve());
  const contentIds = laid.pages.map(() => reserve()), imageIds = laid.pages.map(() => reserve());
  const annots = laid.pages.map((p) => p.ops.filter((o) => o.k === 'a').map((o) => ({ id: reserve(), o })));
  const outlineItems = laid.outline.map((o) => ({ o, id: reserve() })), outlineRoot = outlineItems.length ? reserve() : 0;

  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(catalog, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R /Lang (' + (doc.lang === 'ja' ? 'ja-JP' : 'en-US') + ') /ViewerPreferences << /DisplayDocTitle true >>' + (outlineRoot ? ' /Outlines ' + outlineRoot + ' 0 R /PageMode /UseOutlines' : '') + ' >>');
  obj(pagesId, '<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] >>');
  obj(infoId, '<< /Title ' + pdfStr(doc.title) + (doc.author ? ' /Author ' + pdfStr(doc.author) : '') + ' /Producer ' + pdfStr('IntMap Atlas') + ' /Creator ' + pdfStr('IntMap Atlas') + ' /CreationDate (' + pdfDate(when) + ') >>');
  obj(fontId, '<< /Type /Font /Subtype /Type0 /BaseFont /IntMapText /Encoding /Identity-H /DescendantFonts [' + cidFont + ' 0 R] /ToUnicode ' + tuId + ' 0 R >>');
  obj(cidFont, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /IntMapText /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + descId + ' 0 R /DW 1000 /CIDToGIDMap /Identity >>');
  obj(descId, '<< /Type /FontDescriptor /FontName /IntMapText /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>');
  let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for (let i = 0; i < chars.length; i += 100) {
    const part = chars.slice(i, i + 100);
    cm += part.length + ' beginbfchar\n' + part.map((ch, k) => '<' + hex4(i + k + 1) + '> <' + utf16hex(ch) + '>').join('\n') + '\nendbfchar\n';
  }
  cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
  const cmBytes = enc.encode(cm); obj(tuId, '<< /Length ' + cmBytes.length + ' >>', cmBytes);

  laid.pages.forEach((p, i) => {
    const img = images[i], X = (v) => num(v), Y = (v) => num(PAGE.h - v);
    let c = 'q ' + num(PAGE.w) + ' 0 0 ' + num(PAGE.h) + ' 0 0 cm /Im0 Do Q\n';
    textOps[i].forEach((o) => {
      const n = [...o.s].length, nat = n * o.sz, wdt = measure(o.s, { sz: o.sz, b: !!o.b, mono: !!o.mono });
      const tz = Math.max(10, Math.min(400, wdt / nat * 100));
      c += 'BT 3 Tr /F1 ' + num(o.sz) + ' Tf ' + num(tz) + ' Tz ' + X(o.x) + ' ' + Y(o.y) + ' Td <' + [...o.s].map((ch) => hex4(cid.get(ch))).join('') + '> Tj ET\n';
    });
    const cb = enc.encode(c);
    obj(contentIds[i], '<< /Length ' + cb.length + ' >>', cb);
    const data = img.jpeg || img.rgb;
    obj(imageIds[i], '<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + (img.jpeg ? ' /Filter /DCTDecode' : '') + ' /Length ' + data.length + ' >>', data);
    annots[i].forEach(({ id, o }) => obj(id, '<< /Type /Annot /Subtype /Link /Rect [' + [X(o.x), Y(o.y + o.h), X(o.x + o.w), Y(o.y)].join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + urlStr(o.url) + ' >> >>'));
    obj(pageIds[i], '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + PAGE.w + ' ' + PAGE.h + '] /Resources << /XObject << /Im0 ' + imageIds[i] + ' 0 R >> /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + contentIds[i] + ' 0 R' + (annots[i].length ? ' /Annots [' + annots[i].map((a) => a.id + ' 0 R').join(' ') + ']' : '') + ' >>');
  });
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
  return { bytes: out, pages: pageIds.length, chars: cid.size };
}

/* ── reading it back ─────────────────────────────────────────────────────── */
const latin = (b, s, e) => { let r = ''; for (let i = s; i < e; i++) r += String.fromCharCode(b[i]); return r; };

/**
 * Open a PDF this module wrote and report what is really in it. → { ok, pages, text, problems[] }.
 * `expectedText` (the document's own words) is compared character-for-character, whitespace aside;
 * `expectedPages` when the caller knows it.
 */
export function verifyPdf(bytes, expectedText, expectedPages) {
  const problems = [], s = latin(bytes, 0, bytes.length);
  if (!s.startsWith('%PDF-')) problems.push('no-pdf-header');
  if (!/%%EOF\s*$/.test(s)) problems.push('no-eof-marker');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  if (!sx) return { ok: false, pages: 0, text: '', problems: problems.concat('no-startxref') };
  const xo = +sx[1];
  if (s.slice(xo, xo + 4) !== 'xref') return { ok: false, pages: 0, text: '', problems: problems.concat('startxref-not-at-xref') };
  const head = /xref\s+0\s+(\d+)\s+/.exec(s.slice(xo, xo + 40)); const total = head ? +head[1] : 0;
  const entries = []; let p = xo + head[0].length;
  for (let i = 0; i < total; i++, p += 20) entries.push({ off: +s.slice(p, p + 10), kind: s[p + 17] });
  const objAt = (n) => {
    const e = entries[n]; if (!e || e.kind !== 'n') return null;
    if (s.slice(e.off, e.off + String(n).length + 7) !== n + ' 0 obj\n') { problems.push('xref-offset-wrong:' + n); return null; }
    const end = s.indexOf('endobj', e.off);
    const body = s.slice(e.off + String(n).length + 7, end), st = body.indexOf('\nstream\n');
    let stream = null, dict = body;
    if (st >= 0) { dict = body.slice(0, st); const len = +(/\/Length (\d+)/.exec(dict) || [])[1], a = e.off + String(n).length + 7 + st + 8; stream = bytes.subarray(a, a + len); if (latin(bytes, a + len, a + len + 10).indexOf('endstream') < 0) problems.push('stream-length-wrong:' + n); }
    return { dict, stream };
  };
  for (let i = 1; i < total; i++) objAt(i);
  const root = /\/Root (\d+) 0 R/.exec(s.slice(xo)); const cat = root && objAt(+root[1]);
  const pagesRef = cat && /\/Pages (\d+) 0 R/.exec(cat.dict); const pagesObj = pagesRef && objAt(+pagesRef[1]);
  if (!pagesObj) return { ok: false, pages: 0, text: '', problems: problems.concat('no-page-tree') };
  const count = +(/\/Count (\d+)/.exec(pagesObj.dict) || [])[1], kids = [...pagesObj.dict.matchAll(/(\d+) 0 R/g)].map((m) => +m[1]);
  if (count !== kids.length) problems.push('page-count-mismatch');
  if (expectedPages != null && expectedPages !== count) problems.push('expected-' + expectedPages + '-pages-found-' + count);
  /* ToUnicode: cid → text */
  const tu = (() => { const f = [...s.matchAll(/\/ToUnicode (\d+) 0 R/g)][0]; const o = f && objAt(+f[1]); if (!o || !o.stream) return null; const t = latin(o.stream, 0, o.stream.length), map = new Map();
    for (const blk of t.matchAll(/beginbfchar\n([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) { let str = ''; for (let i = 0; i < m[2].length; i += 4) str += String.fromCharCode(parseInt(m[2].slice(i, i + 4), 16)); map.set(parseInt(m[1], 16), str); }
    return map; })();
  if (!tu) problems.push('no-tounicode');
  let text = '';
  kids.forEach((pid, i) => {
    const pg = objAt(pid); if (!pg) return;
    const ci = /\/Contents (\d+) 0 R/.exec(pg.dict), ii = /\/Im0 (\d+) 0 R/.exec(pg.dict);
    const c = ci && objAt(+ci[1]), im = ii && objAt(+ii[1]);
    if (!c || !c.stream) { problems.push('page-' + (i + 1) + '-no-contents'); return; }
    if (!im || !im.stream) problems.push('page-' + (i + 1) + '-no-image');
    else if (/\/DCTDecode/.test(im.dict) && !(im.stream[0] === 0xFF && im.stream[1] === 0xD8 && im.stream[im.stream.length - 2] === 0xFF && im.stream[im.stream.length - 1] === 0xD9)) problems.push('page-' + (i + 1) + '-jpeg-markers');
    const cs = latin(c.stream, 0, c.stream.length);
    for (const m of cs.matchAll(/<([0-9A-F]+)> Tj/g)) { for (let k = 0; k < m[1].length; k += 4) text += (tu && tu.get(parseInt(m[1].slice(k, k + 4), 16))) || '�'; text += '\n'; }
  });
  if (text.indexOf('�') >= 0) problems.push('undecodable-text');
  if (expectedText != null) {
    const norm = (x) => [...String(x).replace(/\s+/g, '')].sort().join('');
    if (norm(text) !== norm(expectedText)) {
      const a = new Map(); for (const ch of String(expectedText).replace(/\s+/g, '')) a.set(ch, (a.get(ch) || 0) + 1);
      for (const ch of text.replace(/\s+/g, '')) a.set(ch, (a.get(ch) || 0) - 1);
      const diff = [...a].filter(([, v]) => v !== 0).slice(0, 8).map(([k, v]) => k + (v > 0 ? '-' : '+') + Math.abs(v)).join(' ');
      problems.push('text-differs:' + diff);
    }
  }
  return { ok: problems.length === 0, pages: count, text, problems };
}
