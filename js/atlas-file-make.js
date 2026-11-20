/* ============================================================================
 *  IntMap · Atlas — MAKING A FILE   (js/atlas-file-make.js)   (lazy: `atlasFile`)
 * ----------------------------------------------------------------------------
 *  Atlas could research and write, and then hand the reader a block of text and ask them to print it. A
 *  deliverable is a FILE. This is the browser half of `file.create` (js/atlas-cap-file.js): it turns Atlas's
 *  document into real bytes on the reader's own device — no server, no external service — and then READS THE
 *  FILE BACK before saying it exists.
 *    document model    js/file-doc.js     the one description every format is written from
 *    writers           js/file-pdf.js · js/file-office.js (docx pptx xlsx) · js/file-text.js (md txt html csv json)
 *    here              the parts that need a DOM — measuring and drawing text on a canvas (the PDF page images),
 *                      turning a chart's SVG and a captured map frame into pictures, the "no missing glyph" check,
 *                      and the card the reader saves from
 *  ⚠ A file is only reported as made when the read-back finds the right page count and the document's own
 *  characters in it (PDF/Word/PowerPoint) or a sound package (Excel); what a format could not keep is on the card.
 * ==========================================================================*/
import { buildDoc, docText, fileName, resolveFormat, readImage, FORMATS, FORMAT_INFO } from './file-doc.js';
import { TEXT_WRITERS } from './file-text.js';
import { OFFICE_WRITERS, readZip, checkPackage, packageText } from './file-office.js';
import { layoutDoc, buildPdf, verifyPdf, PAGE } from './file-pdf.js';

const FONT = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Yu Gothic",Meiryo,"Microsoft YaHei","Apple SD Gothic Neo","Noto Sans CJK JP",system-ui,sans-serif';
const MONO = 'ui-monospace,Consolas,"MS Gothic","Noto Sans Mono CJK JP",monospace';
const SCALE = 2;   /* 144 dpi: text stays crisp at a normal zoom and an A4 page stays a few hundred KB */
const MAX_BYTES = 40 * 1024 * 1024;


export function atlasFile() {
  const registry = new Map();   /* id → { name, mime, bytes, url } — what the card's buttons act on */
  let seq = 0;

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const blobOf = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));
  const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

  const mctx = canvas(8, 8).getContext('2d');
  const measure = (s, st) => { mctx.font = (st.b ? '700 ' : '400 ') + st.sz + 'px ' + (st.mono ? MONO : FONT); return mctx.measureText(s).width; };

  /* a glyph the system has no font for draws as the same «missing» box as a code point that is not assigned; compare to it */
  function missingGlyphs(text) {
    const chars = [...new Set([...text])].filter((ch) => ch.codePointAt(0) > 0x7E && !/\s/.test(ch)).slice(0, 4000);
    const c = canvas(48, 48), x = c.getContext('2d', { willReadFrequently: true });
    const draw = (ch) => { x.clearRect(0, 0, 48, 48); x.fillStyle = '#000'; x.font = '32px ' + FONT; x.textBaseline = 'top'; x.fillText(ch, 4, 4); return x.getImageData(0, 0, 48, 48).data; };
    const key = (d) => { let h = 0, ink = 0; for (let i = 3; i < d.length; i += 4) { h = (h * 31 + d[i]) | 0; if (d[i] > 40) ink++; } return h + ':' + ink; };
    const ref = draw('\u{10FFFE}'), refKey = key(ref);
    if (!/:[1-9]/.test(refKey)) return { checked: 0, missing: [], unchecked: true };   /* the reference box is blank here: the comparison would prove nothing */
    const missing = chars.filter((ch) => key(draw(ch)) === refKey);
    return { checked: chars.length, missing };
  }

  /* the pictures: a chart is an HTML figure (bars) or an inline SVG (lines) styled by the page's own CSS, so it is
     mounted off-screen in the page and photographed with html2canvas — the vendor the screenshot button already loads on demand */
  async function figureToPng(html) {
    const host = document.createElement('div'), bg = getComputedStyle(document.body).backgroundColor || '#fff';
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:680px;padding:12px;box-sizing:border-box;background:' + bg;
    host.innerHTML = html; document.body.appendChild(host);
    try {
      const V = window.IntMapVendor; if (V) await V.html2canvas();
      if (typeof html2canvas === 'undefined') return { problem: 'chart-raster:html2canvas-unavailable' };
      const c = await html2canvas(host, { backgroundColor: bg, scale: 2, logging: false });
      return readImage({ bytes: await bytesOf(await blobOf(c, 'image/png')) });
    } catch (e) { return { problem: 'chart-raster:' + ((e && e.message) || e) }; }
    finally { host.remove(); }
  }

  async function pageJpeg(page, bitmaps) {
    const c = canvas(PAGE.w * SCALE, PAGE.h * SCALE), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(SCALE, SCALE); x.textBaseline = 'alphabetic';
    for (const o of page.ops) {
      if (o.k === 'r') { x.fillStyle = o.fill; x.fillRect(o.x, o.y, o.w, o.h); }
      else if (o.k === 'l') { x.strokeStyle = o.c; x.lineWidth = o.w; x.beginPath(); x.moveTo(o.x1, o.y1); x.lineTo(o.x2, o.y2); x.stroke(); }
      else if (o.k === 't') { x.fillStyle = o.c; x.font = (o.b ? '700 ' : '400 ') + o.sz + 'px ' + (o.mono ? MONO : FONT); x.fillText(o.s, o.x, o.y); }
      else if (o.k === 'i') { let bm = bitmaps.get(o.img); if (!bm) { bm = await createImageBitmap(new Blob([o.img.bytes], { type: o.img.mime })); bitmaps.set(o.img, bm); } x.drawImage(bm, o.x, o.y, o.w, o.h); }
    }
    const blob = await blobOf(c, 'image/jpeg', 0.92); if (!blob) return null;
    const bytes = await bytesOf(blob); return { jpeg: bytes, w: c.width, h: c.height };
  }

  async function makePdf(doc) {
    await (document.fonts && document.fonts.ready);
    const laid = layoutDoc(doc, measure), bitmaps = new Map(), images = [];
    for (const p of laid.pages) { const im = await pageJpeg(p, bitmaps); if (!im) return { problem: 'raster-failed', detail: 'the page image could not be encoded' }; images.push(im); }
    bitmaps.forEach((b) => { try { b.close(); } catch (_) { /* already released */ } });
    const out = buildPdf(doc, laid, images, measure); if (out.problem) return out;
    const text = docText(doc), v = verifyPdf(out.bytes, text, laid.pages.length), glyphs = missingGlyphs(text);
    return { bytes: out.bytes, pages: out.pages, problems: v.problems.concat(glyphs.missing.length ? ['missing-glyphs:' + glyphs.missing.slice(0, 12).join('')] : []), verified: { pages: v.pages, glyphsChecked: glyphs.checked, glyphsUnchecked: !!glyphs.unchecked }, stated: [doc.lang === 'ja' ? 'ページの文字は画像として描いています。透明な文字を重ねてあるので、検索・選択・コピーはできます' : 'page text is drawn as an image; an invisible text layer on top keeps search, selection and copy working'] };
  }

  function makeOther(doc, fmt, a) {
    const w = OFFICE_WRITERS[fmt] || TEXT_WRITERS[fmt]; if (!w) return { problem: 'no-writer', detail: fmt };
    const r = w(doc, { table: a.table });
    if (r.problem) return r;
    const problems = [], info = {};
    if (OFFICE_WRITERS[fmt]) {
      const z = readZip(r.bytes); if (!z) problems.push('not-a-zip');
      else {
        problems.push(...checkPackage(z)); info.parts = z.length;
        if (fmt !== 'xlsx') {
          const have = new Set(packageText(z)), lost = [...new Set(docText(doc, fmt === 'docx'))].filter((ch) => !/\s/.test(ch) && !have.has(ch));
          if (lost.length) problems.push('text-missing:' + lost.slice(0, 12).join(''));
        }
      }
    } else if (fmt === 'csv' || fmt === 'md' || fmt === 'txt' || fmt === 'html' || fmt === 'json') {
      const back = new TextDecoder('utf-8', { fatal: true }); try { const t = back.decode(r.bytes); if (/�/.test(t)) problems.push('replacement-character'); if (fmt === 'json') JSON.parse(t); } catch (e) { problems.push('read-back:' + ((e && e.message) || e)); }
    }
    return { bytes: r.bytes, problems, stated: r.stated || [], pages: r.slides || (r.sheets && r.sheets.length) || undefined, unit: r.slides ? 'slides' : r.sheets ? 'sheets' : undefined, verified: info };
  }

  /** resolve the blocks Atlas gave as `chart` / `map` into pictures, in place */
  async function resolvePictures(a, K) {
    const blocks = [];
    for (const b of (Array.isArray(a.blocks) ? a.blocks : [])) {
      const t = String((b && (b.t || b.type)) || '').toLowerCase();
      if (t === 'chart') {
        const C = (await import('./atlas-chart.js')).atlasChart(null, K && K.L && K.esc ? { L: K.L, esc: K.esc } : undefined), r = C.render(b.spec || {});
        if (!r || !r.ok) return { problem: 'chart-refused', detail: r ? (r.reason || '') + ' ' + (r.detail || '') : 'the chart renderer could not be loaded' };
        const im = await figureToPng(r.html); if (im.problem) return { problem: 'chart-raster', detail: im.problem };
        blocks.push({ t: 'img', image: im, caption: b.caption || (b.spec && b.spec.title) });
      } else if (t === 'map') {
        const V = K && K.VFRAMES; if (!V) return { problem: 'map-unavailable', detail: 'the map capture is not reachable from here' };
        const f = await V.captureFrame({ include: b.include === 'screen' ? 'screen' : 'map', reason: 'a picture for the file being written' });
        if (!f.ok) return { problem: 'map-not-captured', detail: f.message };
        const urls = V.urls(), im = readImage(urls && urls[urls.length - 1]); if (im.problem) return { problem: 'map-not-captured', detail: im.problem };
        blocks.push({ t: 'img', image: im, caption: b.caption || '' });
      } else blocks.push(b);
    }
    return { blocks };
  }

  /** the whole act → { ok:true, id, name, bytes, size, pages, fmt, problems, stated, doc } | { ok:false, code, detail } */
  async function make(a, K) {
    const fmt = resolveFormat(a.format || 'pdf');
    if (!fmt) return { ok: false, code: 'unknown_format', detail: 'formats: ' + FORMATS.join(', ') };
    const pic = await resolvePictures(a, K); if (pic.problem) return { ok: false, code: pic.problem, detail: pic.detail };
    const built = buildDoc(Object.assign({}, a, { blocks: pic.blocks }));
    if (built.problem) return { ok: false, code: built.problem, detail: built.detail };
    const doc = built.doc; let r;
    try { r = fmt === 'pdf' ? await makePdf(doc) : makeOther(doc, fmt, a); } catch (e) { return { ok: false, code: 'write_failed', detail: String((e && e.message) || e) }; }
    if (r.problem) return { ok: false, code: r.problem, detail: r.detail || '' };
    if (r.bytes.length > MAX_BYTES) return { ok: false, code: 'too_large', detail: r.bytes.length + ' bytes' };
    const id = 'file-' + (++seq) + '-' + Date.now().toString(36), name = fileName(a.filename || doc.title, fmt), info = FORMAT_INFO[fmt];
    registry.set(id, { name, mime: info.mime, bytes: r.bytes });
    return { ok: !r.problems.length, code: r.problems.length ? 'verify_failed' : '', id, name, bytes: r.bytes, fmt, label: info.label, size: r.bytes.length, pages: r.pages, unit: r.unit || 'pages', problems: r.problems, stated: r.stated, verified: r.verified, doc, detail: r.problems.join(' / ') };
  }

  /** the reader's «save» / «open» buttons (delegated: the card is an HTML string in a reply) */
  function act(id, how) {
    const f = registry.get(id); if (!f) return false;
    const url = URL.createObjectURL(new Blob([f.bytes], { type: f.mime })), a = document.createElement('a');
    a.href = url; if (how === 'open') { a.target = '_blank'; a.rel = 'noopener'; } else a.download = f.name;
    a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
    return true;
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-atl-file]'); if (!b) return;
    ev.preventDefault(); const ok = act(b.getAttribute('data-atl-file'), b.getAttribute('data-atl-how'));
    if (!ok) b.textContent = (document.documentElement.lang || '').startsWith('ja') ? '期限切れ（作り直してください）' : 'Expired — ask Atlas to make it again';
  });

  return { make, act };
}
