/* ============================================================================
 *  IntMap · CITE THIS MAP — the share panel's Cite tab, and Atlas `cite`  (sales-pro-audiences)
 * ----------------------------------------------------------------------------
 *  「記者・研究者・開発者が IntMap を自分の仕事（記事・論文・アプリ）に組み込み、出典として引用する理由を製品の中に作る。」
 *  A reporter who put an IntMap view under a figure, a researcher who used one in a paper and a developer who built
 *  on one each had to write the reference themselves — the date the map shows, the address that reproduces it, the
 *  day it was read, and the credit every drawn source asks for, which the map printed in its corner and nowhere a
 *  reader could copy. This makes them, from the map as it is now:
 *    the credit line   to put under a figure: the map, its date, its link, and every drawn source's credit
 *                      (the same credits the map postcard burns in — js/map-recorder.js `mapCredits`)
 *    a reference       APA 7, Chicago, SIST 02 (the Japanese standard), BibTeX and RIS — the view as a map with no
 *                      publication date, the date it shows, the day it was accessed and the link that reproduces it
 *    the data to cite  the citation each drawn record's publisher asks for, from the open-data catalogue
 *    the borders       while the era borders are drawn: the shapes of that date as GeoJSON, each with its record,
 *                      row, dates and terms (js/border-extract.js)
 *  ⚠ THE REFERENCE NAMES THE MAP; THE DATA KEEP THEIR AUTHORS. A map view is cited as IntMap's, and every record it
 *  draws is credited and cited as its publisher's — the answer for-research.html gives to «how do we cite IntMap?».
 *  ⚠ NOTHING IS INVENTED: no publication year (a live map has none — APA's «n.d.»), no author beyond IntMap, no
 *  citation for a record whose publisher states none (its credit line and address are given instead).
 *  ⚠ NEW TEXT IS en + jp (CONSTITUTION §7). A reference is in its style's language: APA, Chicago, BibTeX and RIS in
 *  English, SIST 02 in Japanese; the credit line in the reader's.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { PROVENANCE_INDEX } from './border-provenance.js';
import { buildExtract, isoDay, CATALOG_PATH } from './border-extract.js';
import { mapCredits, clockLabel, clockReading } from './map-recorder.js';
import { iconNode } from './icons.js';

/** the reference styles the tab offers, in its menu's order */
export const CITE_FORMATS = Object.freeze(['apa', 'chicago', 'sist02', 'bibtex', 'ris']);
const FORMAT_LABEL = { apa: 'APA 7', chicago: 'Chicago', sist02: 'SIST 02', bibtex: 'BibTeX', ris: 'RIS' };

const pad = (n, w) => String(Math.abs(n)).padStart(w, '0');
/* 'YYYY-MM-DD' of a calendar date — the extract's own spelling of a day (js/border-extract.js isoDay), so the reference and
   the file it describes write one date one way */
const isoOf = (y, m, d) => isoDay([y, m, d]);
/* «October 8, 2026» — the access date as APA and Chicago write it */
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); if (!m) return String(iso || '');
  try { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (_) { return iso; }
}
/* ⚠ EACH OUTPUT IS ESCAPED FOR WHERE IT LANDS, IN ONE PASS. BibTeX text: every LaTeX special character by one table in a
   single replace — the chained form escaped the braces of its own `\textbackslash{}` a second time. BibTeX url: the field is
   verbatim, so only what would end it ({, } and the backslash) is percent-encoded. RIS: one tag per line, so a value never
   carries a line break. The tab shows every result as text (a textarea's value, textContent), never as markup. */
const BIB = { '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}' };
const bibEsc = (s) => String(s == null ? '' : s).replace(/[\\~^&%$#_{}]/g, (c) => BIB[c]);
const bibUrl = (s) => String(s == null ? '' : s).replace(/[{}\\]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const risLine = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');

/**
 * references({ link, title?, accessed:'YYYY-MM-DD', instant:{ iso, label:{en, jp} }, credits:[string] })
 * → { credit:{en, jp}, apa, chicago, sist02, bibtex, ris, title:{en, jp} }
 */
export function references(f) {
  const lab = (f.instant && f.instant.label) || {};
  const iso = (f.instant && f.instant.iso) || null;
  const title = {
    en: f.title || ('IntMap map view' + (lab.en ? ', ' + lab.en : '')),
    jp: f.title || ('IntMap の地図' + (lab.jp ? '（' + lab.jp + '）' : '')),
  };
  const credits = (f.credits || []).filter(Boolean);
  const link = f.link || '';
  const acc = f.accessed || '';
  const credit = {
    en: 'Map: IntMap' + (lab.en ? ', ' + lab.en : '') + ' (' + link + ').' + (credits.length ? ' Data: ' + credits.join('; ') + '.' : ''),
    jp: '地図: IntMap' + (lab.jp ? '（' + lab.jp + '）' : '') + ' ' + link + (credits.length ? '　データ: ' + credits.join('、') : ''),
  };
  const mapOf = lab.en ? 'Map of ' + lab.en : 'Map';
  const apa = 'IntMap. (n.d.). ' + title.en + ' [' + mapOf + ']. Retrieved ' + longDate(acc) + ', from ' + link;
  const chicago = 'IntMap. \u201c' + title.en + '.\u201d ' + mapOf + '. Accessed ' + longDate(acc) + '. ' + link + '.';
  const sist02 = 'IntMap. \u201c' + title.jp + '\u201d. IntMap. ' + link + ', (参照 ' + acc + ').';
  const key = 'intmap' + (iso ? '_' + iso.replace(/^-/, 'm').replace(/-/g, '') : '');
  const note = [lab.en ? 'Map of ' + lab.en + (iso ? ' (' + iso + ')' : '') : null, credits.length ? 'Data: ' + credits.join('; ') : null].filter(Boolean).join('. ');
  const bibtex = '@misc{' + key + ',\n'
    + '  author       = {{IntMap}},\n'
    + '  title        = {{' + bibEsc(title.en) + '}},\n'
    + '  howpublished = {Interactive map},\n'
    + '  url          = {' + bibUrl(link) + '},\n'
    + '  urldate      = {' + acc + '},\n'
    + (note ? '  note         = {' + bibEsc(note) + '},\n' : '')
    + '}';
  const ris = ['TY  - MAP', 'AU  - IntMap', 'TI  - ' + risLine(title.en), 'UR  - ' + risLine(link), 'Y2  - ' + risLine(acc).replace(/-/g, '/'),
    'DB  - IntMap', note ? 'N1  - ' + risLine(note) : null, 'ER  - '].filter((x) => x != null).join('\n');
  return { credit, apa, chicago, sist02, bibtex, ris, title };
}

/* ── the map as it is now ───────────────────────────────────────────────────── */
const TB = () => { try { return /** @type {any} */ (globalThis).IntMapTimeBorders || null; } catch (_) { return null; } };
/** is the era layer drawing (so there are borders of a date to take away)? */
function bordersDrawn() { const t = TB(); try { return !!(t && t.active && t.active() && t.currentFC && t.currentFC()); } catch (_) { return false; } }

/** the facts a citation is made of: { link, title, accessed, instant:{ iso, unit, live, label:{en, jp} }, credits } */
function mapFacts(link, caption) {
  const c = clockReading();
  const now = new Date();
  return {
    link, title: (caption && caption.title) || '',
    accessed: isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    instant: { iso: c.unit === 'year' ? String(c.y < 0 ? '-' + pad(c.y, 4) : pad(c.y, 4)) : isoOf(c.y, c.m, c.d), unit: c.unit, live: c.live,
      label: { en: clockLabel('en'), jp: clockLabel('jp') } },
    credits: mapCredits(),
  };
}

/* the catalogue and the provenance indexes — one flight each per session; a failed read is not remembered */
const _loads = new Map();
function once(key, url) {
  if (_loads.has(key)) return _loads.get(key);
  const p = Promise.resolve().then(() => jsonWithin(url, clockFor(url))).then((j) => j, () => null)
    .then((j) => { if (!j) _loads.delete(key); return j; });
  _loads.set(key, p); return p;
}
const catalogUrl = () => { try { return new URL(CATALOG_PATH, document.baseURI).href; } catch (_) { return CATALOG_PATH; } };

/**
 * The borders drawn now, as a file: { ok, error?, geojson, summary, name }. `view` keeps the shapes that reach into
 * the current view (whole); otherwise the world. Fails closed: with no catalogue, nothing is released.
 */
async function extractBorders(o) {
  o = o || {};
  const t = TB();
  if (!bordersDrawn()) return { ok: false, error: 'not-drawn' };
  const catalog = await once('catalog', catalogUrl());
  if (!catalog || !Array.isArray(catalog.datasets)) return { ok: false, error: 'no-catalogue' };
  const [ohm, clio] = await Promise.all([once('ohm', PROVENANCE_INDEX.ohm), once('clio', PROVENANCE_INDEX.clio)]);
  let bbox = null;
  if (o.view) { try { const b = IntMapGeoEngine.camera.getBounds(); if (b) bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; } catch (_) { bbox = null; } }
  const fc = t.currentFC(), at = t.drawnAt();
  const now = new Date();
  const { geojson, summary } = buildExtract({ features: (fc && fc.features) || [], sideOf: (f) => t.provenanceOf(f), catalog, at, bbox,
    link: o.link || null, generatedAt: now.toISOString(), site: catalog.site || null, indexes: { ohm, clio } });
  const name = 'intmap-borders-' + (summary.at || 'date') + (bbox ? '-view' : '') + '.geojson';
  return { ok: true, geojson, summary, name };
}

/** the data a drawn record's publisher asks to be cited for, from the catalogue: [{ credit, cite, url, licence }] */
async function dataCitations(summary) {
  const catalog = await once('catalog', catalogUrl());
  /* one entry per credit line; a credit several datasets share (Cliopatria is the record of data/hist-clio.js and of its
     provenance index) takes the citation from whichever states one, never the first one met */
  const by = new Map();
  for (const d of (catalog && catalog.datasets) || []) for (const u of d.upstreams || []) {
    const k = u.credit || u.publisher; if (!k) continue;
    if (!summary || !(summary.credits.includes(u.credit) || summary.blockedBy.some((b) => b.credit === u.credit))) continue;
    const e = by.get(k);
    if (!e) by.set(k, { credit: k, cite: u.cite || null, url: u.url || null, licence: u.licence });
    else if (!e.cite && u.cite) e.cite = u.cite;
  }
  const out = [...by.values()];
  return out;
}

/**
 * Everything at once, for Atlas and the tab: { facts, refs, borders: { summary, data } | null }.
 * `borders` is read only while the era layer draws; it does not make a file.
 */
export async function citeNow(link, caption) {
  const facts = mapFacts(link, caption);
  const refs = references(facts);
  let borders = null;
  if (bordersDrawn()) {
    const x = await extractBorders({ link });
    borders = x.ok ? { summary: x.summary, data: await dataCitations(x.summary) } : { error: x.error };
  }
  return { facts, refs, borders };
}

/* ══ THE TAB ═══════════════════════════════════════════════════════════════════════════════════════════
   js/map-ui.js `share` owns the panel and hands this its `link()`, `caption()`, the reader's language and its copy
   button, as it does the Image tab (js/map-recorder.js createPostcardTab). The pane is rebuilt when it is shown, so
   it always describes the map as it is at that moment. */
const CSS = '#share-panel .sh-cite h5{margin:12px 0 4px;font-size:12.5px;font-weight:700;}'
  + '#share-panel .sh-cite textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;border:1px solid var(--glass-border,rgba(128,128,128,0.25));border-radius:10px;background:var(--input-bg);color:var(--text-main);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:8px 10px;}'
  + '#share-panel .sh-cite select{height:32px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:12.5px;padding:0 8px;}'
  + '#share-panel .sh-cite .sh-cite-note{font-size:11.5px;color:var(--text-muted);line-height:1.45;margin-top:4px;}'
  + '#share-panel .sh-cite ul{margin:4px 0 0;padding-left:18px;font-size:11.5px;line-height:1.45;}'
  + '#share-panel .sh-cite .sh-row{margin-top:6px;flex-wrap:wrap;}'
  + '#share-panel .sh-pane[data-pane="cite"]{max-height:min(56vh,520px);overflow:auto;}';
let styled = false;

export function createCiteTab(ctx) {
  const T = (en, jp) => IntMapLang.t(ctx.lang(), en, jp);
  let host = null, fmt = 'apa', gen = 0;
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const area = (label, rows) => { const a = /** @type {HTMLTextAreaElement} */ (node('textarea')); a.readOnly = true; a.rows = rows; a.setAttribute('aria-label', label); a.spellcheck = false; return a; };
  const copyRow = (field, label) => { const r = node('div', 'sh-row'); const b = /** @type {HTMLButtonElement} */ (node('button', 'sh-btn sec')); b.type = 'button';
    b.append(iconNode('clipboard'), ' ' + label); b.onclick = ctx.copy(b, () => field.value, field, () => label); r.append(b); return r; };
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
  }
  function render(h) {
    if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
    host = h; refresh();
  }
  /* (re)build the pane for the map as it is now */
  function refresh() {
    if (!host) return;
    const my = ++gen;
    const facts = mapFacts(ctx.link(), ctx.caption());
    const refs = references(facts);
    const box = node('div', 'sh-cite');
    box.append(node('div', 'sh-cite-note', T('For an article, a paper or an app: the credit line to put under the map, a reference to the view, and the data to cite. Every source keeps its author — cite the data as well as the map.',
      '記事・論文・アプリのために: 地図の下に入れる出典表記、この表示の参考文献、引用するデータ。データの著作者はそれぞれの出典です——地図だけでなくデータも引用してください。')));
    /* the credit line */
    box.append(node('h5', null, T('Credit line for a figure', '図の下に入れる出典表記')));
    const cr = area(T('Credit line', '出典表記'), 3); cr.className = 'sh-cite-credit'; cr.value = ctx.lang() === 'jp' ? refs.credit.jp : refs.credit.en;
    box.append(cr, copyRow(cr, T('Copy', 'コピー')));
    if (!facts.credits.length) box.append(node('div', 'sh-cite-note', T('No data layer is drawn, so the line names the map only.', 'データのレイヤーが描かれていないので、地図だけを示しています。')));
    /* the reference */
    box.append(node('h5', null, T('Reference', '参考文献')));
    const sel = /** @type {HTMLSelectElement} */ (node('select', 'sh-cite-fmt')); sel.setAttribute('aria-label', T('Citation style', '引用の形式'));
    for (const k of CITE_FORMATS) { const op = /** @type {HTMLOptionElement} */ (node('option', null, FORMAT_LABEL[k])); op.value = k; sel.append(op); }
    sel.value = fmt;
    const ref = area(T('Reference', '参考文献'), 5); ref.className = 'sh-cite-ref';
    const dl = /** @type {HTMLButtonElement} */ (node('button', 'sh-btn sec sh-cite-file')); dl.type = 'button';
    const paintRef = () => { ref.value = refs[fmt]; dl.hidden = !(fmt === 'bibtex' || fmt === 'ris');
      dl.replaceChildren(iconNode('save'), ' ' + T('Save .' + (fmt === 'ris' ? 'ris' : 'bib'), '.' + (fmt === 'ris' ? 'ris' : 'bib') + ' を保存')); };
    sel.onchange = () => { fmt = sel.value; paintRef(); };
    dl.onclick = () => download(refs[fmt] + '\n', (fmt === 'ris' ? 'intmap.ris' : 'intmap.bib'), fmt === 'ris' ? 'application/x-research-info-systems' : 'application/x-bibtex');
    const r1 = node('div', 'sh-row'); r1.append(sel); box.append(r1, ref);
    const r2 = copyRow(ref, T('Copy', 'コピー')); r2.append(dl); box.append(r2);
    paintRef();
    box.append(node('div', 'sh-cite-note', T('The map has no publication date: the reference gives the date it shows, the day you read it and the link that opens this exact view.',
      '地図には発行日がありません。参考文献には、地図が示す日付・閲覧日・この表示をそのまま開くリンクを入れています。')));
    /* the borders of this date */
    if (bordersDrawn()) {
      box.append(node('h5', null, T('These borders, as data', 'この国境をデータで')));
      const st = node('div', 'sh-cite-note sh-cite-borders', T('Reading the records…', '記録を読んでいます…'));
      const dataList = node('ul', 'sh-cite-data');
      const r3 = node('div', 'sh-row');
      const bw = /** @type {HTMLButtonElement} */ (node('button', 'sh-btn sh-cite-world')); bw.type = 'button'; bw.append(iconNode('save'), ' ' + T('GeoJSON — the world', 'GeoJSON — 全世界'));
      const bv = /** @type {HTMLButtonElement} */ (node('button', 'sh-btn sec sh-cite-view')); bv.type = 'button'; bv.append(iconNode('save'), ' ' + T('GeoJSON — this view', 'GeoJSON — この表示範囲'));
      bw.disabled = bv.disabled = true;
      r3.append(bw, bv);
      box.append(st, r3, node('div', 'sh-cite-note', T('Each shape carries the record and row it came from, its dates and who stated them, its identifiers and its licence. A shape whose terms are non-commercial is not included; the file says which, and where to get it.',
        '形ごとに、どの記録のどの行か・日付とそれを誰が述べたか・識別子・ライセンスが入ります。非営利に限られた条件の形は含めず、何を除いたかと入手先をファイルに書きます。')));
      box.append(node('h5', null, T('Data to cite', '引用するデータ')), dataList);
      const take = async (view, btn) => { btn.disabled = true;
        const x = await extractBorders({ view, link: ctx.link() });
        btn.disabled = false;
        if (!x.ok) { st.textContent = x.error === 'no-catalogue' ? T('The terms of the records could not be read, so nothing was released. Try again.', '記録の利用条件を読めなかったため、何も出していません。もう一度お試しください。')
          : T('The borders are not drawn.', '国境が描かれていません。'); return; }
        download(JSON.stringify(x.geojson), x.name, 'application/geo+json');
        st.textContent = say(x.summary) + ' ' + T('Saved ' + x.name + '.', x.name + ' を保存しました。'); };
      bw.onclick = () => take(false, bw); bv.onclick = () => take(true, bv);
      extractBorders({ link: ctx.link() }).then(async (x) => {
        if (my !== gen) return;
        if (!x.ok) { st.textContent = x.error === 'no-catalogue' ? T('The terms of the records could not be read, so nothing can be released.', '記録の利用条件を読めなかったため、何も出せません。') : T('The borders are not drawn.', '国境が描かれていません。'); return; }
        st.textContent = say(x.summary); bw.disabled = bv.disabled = !(x.summary.released + x.summary.attributes);
        const data = await dataCitations(x.summary); if (my !== gen) return;
        dataList.replaceChildren(...data.map((d) => node('li', null, (d.cite || d.credit) + ' — ' + d.licence + (d.url ? ' — ' + d.url : ''))));
      });
    }
    host.replaceChildren(box);
  }
  /* the counts in words: how many shapes, how many go in the file, how many and why not */
  function say(s) {
    const blocked = s.blockedBy.map((b) => (b.credit || b.publisher) + ' (' + b.licence + ')').join('; ');
    const at = s.at || T('This date', 'この日付');
    return T(at + ': ' + s.shapes + ' shapes. ' + s.released + ' with their outlines, ' + s.attributes + ' with their record but not their outline, ' + s.withheld + ' not included' + (blocked ? ' — non-commercial terms: ' + blocked : '') + '.',
      at + ': 形 ' + s.shapes + ' 件。輪郭つき ' + s.released + ' 件、記録だけ（輪郭なし）' + s.attributes + ' 件、含めないもの ' + s.withheld + ' 件' + (blocked ? '（非営利の条件: ' + blocked + '）' : '') + '。');
  }
  return { render, refresh };
}
