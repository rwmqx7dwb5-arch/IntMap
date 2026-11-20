/* ============================================================================
 *  IntMap · Atlas capabilities — the `file.*` namespace   (js/atlas-cap-file.js)
 * ----------------------------------------------------------------------------
 *  A DELIVERABLE IS A FILE. Atlas could research for four minutes, write the report, and then ask the reader to
 *  print it. `file.create` writes the file — PDF first, and Word / PowerPoint / Excel / HTML / Markdown / text / CSV /
 *  JSON from the same document — on the reader's own device, reads it back, and hands the reader a card to save or
 *  open. The writers are js/file-pdf.js, js/file-office.js and js/file-text.js over the model in js/file-doc.js; the
 *  DOM half (page drawing, chart and map pictures, the read-back, the card's buttons) is the lazy js/atlas-file-make.js.
 *  Nothing leaves the device and no external service is involved (risk `persist`: a file is written to the reader's
 *  downloads only when they press «save»; the card is the confirmation, so column 8 is `none`).
 * ==========================================================================*/
import { str, int, list, one, obj } from './atlas-caps.js';
import { FORMATS } from './file-doc.js';

/* the DOM half is its own on-demand chunk, reached by a literal dynamic import (no window global, no lazy-registry entry: nothing else needs it) and built once */
let maker = null;
const fileMaker = async () => maker || (maker = (await import('./atlas-file-make.js')).atlasFile());
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export default [
  {
    row: ['file.create',                'makeFile',       'createFile,makePdf,createPdf,exportPdf,saveAsPdf,makeDocument,createDocument,makeDocx,makeSlides,makeSpreadsheet,saveAsFile', 'research', 'none',    '',                       'explanation',         'persist', 'none',   '',         ''],
    ui: { none: '2026-11-21' },
    doc: [
      { in: 'file.create', text: '{"type":"makeFile","format"?:"pdf"|"docx"|"pptx"|"xlsx"|"html"|"md"|"txt"|"csv"|"json","title":str,"markdown"?:str,"blocks"?:[…],"tables"?:[{"columns":[str],"rows":[[…]],"caption"?:str}],"sources"?:[{"title":str,"url"?:str}],"subtitle"?:str,"author"?:str,"date"?:str,"filename"?:str} = MAKE THE FILE (PDF にして・Word で・スライドに・Excel に・ファイルで渡して・ダウンロードできる形に): writes a REAL file on the reader\'s device and answers with a card they press to SAVE or OPEN — so when the reader asks for a report, a briefing, a summary, a comparison or slides AS A FILE, you write the content and call this; NEVER tell them to print the page or to copy your text into another program. "format" defaults to "pdf" (Japanese text is laid out and searchable; headings become bookmarks; tables repeat their header row across pages; each source URL is a link); "docx" Word with real styles, lists and tables; "pptx" slides split by heading (a table or picture gets its own slide); "xlsx" the tables as sheets (numbers stay numbers); "html" one self-contained page; "md" / "txt" the text; "csv" ONE table ("table": 0-based index or its caption); "json" the structure. Give the body as "markdown" (# ## ### headings, paragraphs, - and 1. lists, | tables |, > quotes, ``` code ```) — or as "blocks" when order matters: {"t":"h","level":1-3,"text"} {"t":"p","text"} {"t":"ul"|"ol","items":[…]} {"t":"table","columns","rows","caption"?} {"t":"quote"} {"t":"code"} {"t":"pb"} {"t":"img","dataUrl":"data:image/png;base64,…","caption"?} and, to put a PICTURE in the file, {"t":"chart","spec":{…as for chart.compose, "source" required},"caption"?} (the chart is drawn into the file) or {"t":"map","include"?:"map"|"screen","caption"?} (the map as it is on screen NOW — set the map up first with the view/layer capabilities). "sources" lists where the content came from (the pages you read, the datasets); they are printed as a numbered list at the end and linked. After writing, IT READS THE FILE BACK and the answer says how many pages (slides, sheets) it found and whether every character of your text is in it: say "done" only when the card says it was verified; if it says a check failed, tell the reader plainly and offer to try again as another format. A format that cannot keep something (CSV has no headings; a text file has no table grid; Excel holds tables, not prose) says so on the card — pass it on. NEVER invent content to fill a file: an empty document is refused. Use it for 「PDF にして」「レポートをファイルで」「Word にして」「スライドにして」「Excel にまとめて」「ダウンロードできるように」, "make that a PDF", "export this as a Word document", "give me a slide deck", "save the table as CSV". Do NOT use it to export a DATASET with its geometry (gisExport) or to keep a whole job for later (work). ' },
    ],
    phrases: () => ['PDFにして', 'PDF化', 'ファイルにして', 'ファイルで出力', 'Wordにして', 'スライドにして', 'Excelにまとめて'].concat(['make a pdf', 'export as pdf', 'save as a file', 'create a word document', 'make slides']),
    schema: () => ({ type: 'object', required: ['title'], properties: {
      format: one.apply(null, FORMATS), title: str(), subtitle: str(), author: str(), date: str(), filename: str(), markdown: str(),
      blocks: list(obj()), tables: list(obj()), sources: list({}), table: {}, images: list(obj()) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const refuse = (code, text) => R(false, warn(esc(text) + ' (' + esc(code) + ')'), { meta: { file: { code } } });
      let F = null; try { F = await fileMaker(); } catch (_) { /* answered below */ }
      if (!F) return refuse('unavailable', L('The file writer could not be loaded.', 'ファイル作成モジュールを読み込めませんでした。'));
      const r = await F.make(a, K);
      if (!r.ok && !r.id) {
        const why = { unknown_format: L('Unknown format. Choose one of', '未対応の形式です。次から選んでください') + ': ' + FORMATS.join(', '), 'no-content': L('There is nothing to write: give "markdown", "blocks", "tables" or "images".', '書く内容がありません。markdown・blocks・tables・images のいずれかを渡してください。'),
          'no-table': L('That format needs a table and the document has none.', 'この形式には表が必要ですが、文書に表がありません。') }[r.code] || (L('The file could not be made', 'ファイルを作れませんでした') + ': ' + (r.detail || r.code));
        return refuse(r.code === 'no-content' ? 'needs_input' : r.code, why + (r.detail && why.indexOf(r.detail) < 0 && r.code !== 'unknown_format' ? ' — ' + r.detail : ''));
      }
      const ja = r.doc.lang === 'ja', unitTxt = r.unit === 'slides' ? (ja ? 'スライド' : 'slides') : r.unit === 'sheets' ? (ja ? 'シート' : 'sheets') : (ja ? 'ページ' : 'pages');
      const facts = [r.label, r.pages != null ? r.pages + ' ' + unitTxt : '', kb(r.size)].filter(Boolean).join(' · ');
      const status = r.ok ? '<span style="color:var(--ok,#248a3d)">✓ ' + esc(ja ? '書き出し後に開き直して確認しました（構造・ページ数・本文の全文字）' : 'read back after writing: structure, page count and every character of the text') + '</span>'
        : '<span style="color:var(--danger,#d70015)">' + esc(ja ? '確認に失敗しました: ' : 'Read-back failed: ') + esc(r.problems.join(' / ')) + '</span>';
      const btn = 'display:inline-block;border:0;border-radius:999px;padding:6px 14px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;';
      const canOpen = r.fmt === 'pdf' || r.fmt === 'html' || r.fmt === 'txt' || r.fmt === 'md' || r.fmt === 'json';
      const html = '<div class="atl-file" style="border:1px solid var(--border,#d1d1d6);border-radius:14px;padding:11px 13px;margin:6px 0;">'
        + '<div style="font-weight:600;overflow-wrap:anywhere;">' + esc(r.name) + '</div>'
        + '<div style="font-size:12px;color:var(--text-muted,#6e6e73);margin:2px 0 4px;">' + esc(facts) + '</div>'
        + '<div style="font-size:12px;margin-bottom:8px;">' + status + '</div>'
        + (r.stated.length ? '<ul style="margin:0 0 8px 18px;padding:0;font-size:11.5px;color:var(--text-muted,#6e6e73);">' + r.stated.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>' : '')
        + '<button type="button" data-atl-file="' + esc(r.id) + '" data-atl-how="save" style="' + btn + 'background:var(--accent,#0a64d6);color:#fff;">' + esc(ja ? '保存' : 'Save') + '</button>'
        + (canOpen ? ' <button type="button" data-atl-file="' + esc(r.id) + '" data-atl-how="open" style="' + btn + 'background:var(--surface-2,#f2f2f7);color:var(--text,#1c1c1e);">' + esc(ja ? '開く' : 'Open') + '</button>' : '') + '</div>';
      return R(r.ok, html, { meta: { file: { id: r.id, name: r.name, format: r.fmt, bytes: r.size, pages: r.pages, verified: r.ok, problems: r.problems, stated: r.stated.length } } });
    },
  },
];
