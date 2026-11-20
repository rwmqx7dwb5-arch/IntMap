/* ============================================================================
 *  IntMap · THE TEXT-SHAPED FORMATS   (js/file-text.js)   — txt · md · html · csv · json
 * ----------------------------------------------------------------------------
 *  Writers over the document model of js/file-doc.js. Each returns { bytes, stated[] } where `stated` is
 *  what the format could NOT keep, in words (a CSV has no headings; a text file has no table grid) — the
 *  card prints it, so a loss is said and never silent. Pure; no DOM.
 * ==========================================================================*/
import { cellText } from './file-doc.js';

const enc = (s) => new TextEncoder().encode(s);
export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdCell = (v) => cellText(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** bytes → base64 (chunked: String.fromCharCode.apply overflows the stack on a large array) */
function bytesToB64(bytes) {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

export function toMarkdown(doc) {
  const out = ['# ' + doc.title];
  if (doc.subtitle) out.push('', '*' + doc.subtitle + '*');
  if (doc.date || doc.author) out.push('', [doc.author, doc.date].filter(Boolean).join(' · '));
  for (const b of doc.blocks) {
    out.push('');
    if (b.t === 'h') out.push('#'.repeat(Math.min(6, b.level + 1)) + ' ' + b.text);
    else if (b.t === 'p') out.push(b.text);
    else if (b.t === 'ul') out.push(b.items.map((x) => '- ' + x).join('\n'));
    else if (b.t === 'ol') out.push(b.items.map((x, i) => (i + 1) + '. ' + x).join('\n'));
    else if (b.t === 'quote') out.push('> ' + b.text);
    else if (b.t === 'code') out.push('```\n' + b.text + '\n```');
    else if (b.t === 'pb') out.push('---');
    else if (b.t === 'table') {
      if (b.caption) out.push('**' + b.caption + '**', '');
      out.push('| ' + b.columns.map(mdCell).join(' | ') + ' |', '|' + b.columns.map(() => ' --- ').join('|') + '|');
      b.rows.forEach((r) => out.push('| ' + b.columns.map((c, i) => mdCell(r[i])).join(' | ') + ' |'));
    } else if (b.t === 'img') out.push('[' + (b.caption || 'image') + ']');
  }
  if (doc.sources.length) { out.push('', '## ' + (doc.lang === 'ja' ? '出典' : 'Sources'), ''); doc.sources.forEach((s, i) => out.push((i + 1) + '. ' + (s.url ? '[' + s.title + '](' + s.url + ')' : s.title) + (s.note ? ' — ' + s.note : ''))); }
  return out.join('\n') + '\n';
}

export function writeMd(doc) {
  const stated = [];
  const imgs = doc.blocks.filter((b) => b.t === 'img').length;
  if (imgs) stated.push(doc.lang === 'ja' ? '画像 ' + imgs + ' 点は Markdown に埋め込まず、キャプションだけを残しました' : imgs + ' image(s) are not embedded in Markdown; their captions are kept');
  return { bytes: enc(toMarkdown(doc)), stated };
}

export function writeTxt(doc) {
  const ja = doc.lang === 'ja', stated = [];
  const out = [doc.title, '='.repeat(Math.min(60, [...doc.title].length * (ja ? 2 : 1)))];
  if (doc.subtitle) out.push(doc.subtitle);
  for (const b of doc.blocks) {
    out.push('');
    if (b.t === 'h') out.push(b.text, (b.level === 1 ? '-' : '·').repeat(Math.min(40, [...b.text].length * (ja ? 2 : 1))));
    else if (b.t === 'p' || b.t === 'code') out.push(b.text);
    else if (b.t === 'quote') out.push('  | ' + b.text);
    else if (b.t === 'ul') out.push(b.items.map((x) => ' - ' + x).join('\n'));
    else if (b.t === 'ol') out.push(b.items.map((x, i) => ' ' + (i + 1) + '. ' + x).join('\n'));
    else if (b.t === 'pb') out.push('');
    else if (b.t === 'table') { if (b.caption) out.push(b.caption); out.push(b.columns.join('\t')); b.rows.forEach((r) => out.push(b.columns.map((c, i) => cellText(r[i])).join('\t'))); }
    else if (b.t === 'img') out.push('[' + (b.caption || (ja ? '画像' : 'image')) + ']');
  }
  if (doc.sources.length) { out.push('', ja ? '出典' : 'Sources'); doc.sources.forEach((s, i) => out.push(' ' + (i + 1) + '. ' + s.title + (s.url && s.url !== s.title ? ' <' + s.url + '>' : ''))); }
  if (doc.blocks.some((b) => b.t === 'table')) stated.push(ja ? '表はタブ区切りの行で書きました（罫線はありません）' : 'tables are tab-separated rows (no grid)');
  if (doc.blocks.some((b) => b.t === 'img')) stated.push(ja ? '画像はテキストに入らないためキャプションだけを残しました' : 'images are not in a text file; captions are kept');
  return { bytes: enc(out.join('\n') + '\n'), stated };
}

const CSS = 'body{font:15px/1.75 -apple-system,"Segoe UI","Hiragino Sans","Yu Gothic",Meiryo,"Noto Sans JP",sans-serif;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;color:#1c1c1e;background:#fff}'
  + 'h1{font-size:1.9rem;line-height:1.3;margin:0 0 .3rem}h2{font-size:1.35rem;margin:2rem 0 .5rem;border-bottom:1px solid #e5e5ea;padding-bottom:.25rem}h3{font-size:1.1rem;margin:1.5rem 0 .4rem}'
  + '.sub{color:#6e6e73;margin:0 0 1.5rem}table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}th,td{border:1px solid #d1d1d6;padding:.4rem .6rem;text-align:left;vertical-align:top}th{background:#f2f2f7}'
  + 'caption{caption-side:top;text-align:left;font-weight:600;padding:.2rem 0}figure{margin:1.2rem 0}figure img{max-width:100%;height:auto;border-radius:8px}figcaption{color:#6e6e73;font-size:.85rem}'
  + 'blockquote{margin:1rem 0;padding:.2rem 1rem;border-left:3px solid #c7c7cc;color:#48484a}pre{background:#f2f2f7;padding:.8rem;border-radius:8px;overflow:auto;font-size:.85rem}'
  + '.src{font-size:.85rem;color:#48484a}a{color:#0a64d6}@media(prefers-color-scheme:dark){body{background:#000;color:#f2f2f7}th{background:#1c1c1e}th,td{border-color:#3a3a3c}pre{background:#1c1c1e}h2{border-color:#3a3a3c}}'
  + '@media print{body{margin:0;max-width:none}h2,h3{break-after:avoid}table,figure{break-inside:avoid}}';

export function writeHtml(doc) {
  const ja = doc.lang === 'ja', h = ['<!doctype html><html lang="' + doc.lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(doc.title) + '</title><style>' + CSS + '</style></head><body><header><h1>' + esc(doc.title) + '</h1>'];
  if (doc.subtitle) h.push('<p class="sub">' + esc(doc.subtitle) + '</p>');
  if (doc.date || doc.author) h.push('<p class="sub">' + esc([doc.author, doc.date].filter(Boolean).join(' · ')) + '</p>');
  h.push('</header><main>');
  for (const b of doc.blocks) {
    if (b.t === 'h') h.push('<h' + (b.level + 1) + '>' + esc(b.text) + '</h' + (b.level + 1) + '>');
    else if (b.t === 'p') h.push('<p>' + esc(b.text).replace(/\n/g, '<br>') + '</p>');
    else if (b.t === 'ul' || b.t === 'ol') h.push('<' + b.t + '>' + b.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</' + b.t + '>');
    else if (b.t === 'quote') h.push('<blockquote>' + esc(b.text) + '</blockquote>');
    else if (b.t === 'code') h.push('<pre><code>' + esc(b.text) + '</code></pre>');
    else if (b.t === 'pb') h.push('<hr>');
    else if (b.t === 'table') h.push('<table>' + (b.caption ? '<caption>' + esc(b.caption) + '</caption>' : '') + '<thead><tr>' + b.columns.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>'
      + b.rows.map((r) => '<tr>' + b.columns.map((c, i) => '<td>' + esc(cellText(r[i])) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
    else if (b.t === 'img') h.push('<figure><img alt="' + esc(b.caption || '') + '" src="data:' + b.image.mime + ';base64,' + bytesToB64(b.image.bytes) + '">' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>');
  }
  h.push('</main>');
  if (doc.sources.length) h.push('<footer class="src"><h2>' + (ja ? '出典' : 'Sources') + '</h2><ol>' + doc.sources.map((s) => '<li>' + (s.url ? '<a href="' + esc(s.url) + '" rel="noopener">' + esc(s.title) + '</a>' : esc(s.title)) + (s.note ? ' — ' + esc(s.note) : '') + '</li>').join('') + '</ol></footer>');
  h.push('</body></html>');
  return { bytes: enc(h.join('\n')), stated: [] };
}

/** RFC 4180, with a UTF-8 BOM so Excel on Windows reads Japanese as Japanese. `table` picks one when the document has several. */
export function writeCsv(doc, opt) {
  const ja = doc.lang === 'ja', tables = doc.blocks.filter((b) => b.t === 'table');
  if (!tables.length) return { problem: 'no-table', detail: ja ? 'CSV にできる表がありません' : 'the document has no table to write as CSV' };
  const want = opt && opt.table != null ? opt.table : 0;
  const tb = typeof want === 'number' ? tables[want] : tables.find((t) => t.caption === want);
  if (!tb) return { problem: 'no-such-table', detail: 'table ' + want + ' of ' + tables.length };
  const q = (v) => { const s = cellText(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const body = [tb.columns.map(q).join(',')].concat(tb.rows.map((r) => tb.columns.map((c, i) => q(r[i])).join(','))).join('\r\n') + '\r\n';
  const stated = [];
  if (tables.length > 1) stated.push(ja ? '表が ' + tables.length + ' 個あるため ' + (tables.indexOf(tb) + 1) + ' 番目だけを書きました（CSV は 1 表）' : 'CSV holds one table; wrote table ' + (tables.indexOf(tb) + 1) + ' of ' + tables.length);
  const text = doc.blocks.filter((b) => b.t !== 'table').length;
  if (text) stated.push(ja ? '本文・見出し・画像は CSV に入りません' : 'prose, headings and images are not in a CSV');
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]), b = enc(body), out = new Uint8Array(bom.length + b.length);
  out.set(bom); out.set(b, bom.length);
  return { bytes: out, stated };
}

export function writeJson(doc) {
  const slim = { title: doc.title, subtitle: doc.subtitle, author: doc.author, date: doc.date, lang: doc.lang,
    blocks: doc.blocks.map((b) => (b.t === 'img' ? { t: 'img', caption: b.caption, mime: b.image.mime, width: b.image.w, height: b.image.h } : b)), sources: doc.sources };
  const stated = doc.blocks.some((b) => b.t === 'img') ? [doc.lang === 'ja' ? '画像のバイト列は JSON に入れず、大きさだけを残しました' : 'image bytes are not in the JSON; their size is'] : [];
  return { bytes: enc(JSON.stringify(slim, null, 2) + '\n'), stated };
}

export const TEXT_WRITERS = { md: writeMd, txt: writeTxt, html: writeHtml, csv: writeCsv, json: writeJson };
