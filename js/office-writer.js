/* ============================================================================
 *  IntMap · Office writer — a workbook as bytes, with no library   (js/office-writer.js)
 * ----------------------------------------------------------------------------
 *  WHY IT EXISTS. Atlas could READ .xlsx / .docx / .pptx (js/atlas-attach.js) but nothing in IntMap could WRITE one, so a job
 *  that began with a spreadsheet could not hand a spreadsheet back. This is the writer for the format a reader opens in Excel,
 *  Numbers and LibreOffice: SpreadsheetML in an OPC package (a ZIP). DOM-free, so a test runs it under node.
 *
 *  THE ONE SHEET WRITER. A document's tables (js/file-office.js → file.create "xlsx") and a dataset (js/gis-export.js) both
 *  become `sheets` and pass through THIS function; the ZIP under it is js/zip-store.js (the one the docx / pptx writers use).
 *  Options: `when` (the zip timestamp), `core` (an XML string for docProps/core.xml); per sheet `numericText` (a markdown table
 *  holds its numbers as text: a plain decimal with no leading zero becomes a number, "007" stays text). Every column is sized
 *  to its widest cell (East Asian wide characters count double), the header is bold on a light fill and frozen.
 *
 *  WHAT IT CLAIMS, AND WHAT IT DOES NOT.
 *    · the package is a STORED zip (method 0, a CRC-32 per entry): valid everywhere, no compressor to trust, and the
 *      size is the size of the text (a million-cell sheet is tens of MB; js/gis-export.js refuses above its own ceiling).
 *    · a number is a number (`<c><v>`), a boolean is a boolean, text is an inline string; a date is NOT guessed from text —
 *      a cell the table calls a string stays a string (the reader of "01100" must get "01100", intmap-ceiling-guards).
 *    · NaN / ±Infinity have no cell notation: the cell is empty and the count is returned (`nonFinite`), as the CSV writer does.
 *    · a sheet name is cut to Excel's 31 characters and its forbidden characters replaced; the answer says so (`renamed`).
 *    · a cell is cut at Excel's 32 767 characters; the count of cut cells is returned (`truncatedCells`). Nothing is cut silently.
 *    · a sheet holds at most 1 048 576 rows and 16 384 columns: more is REFUSED BY NAME (`xlsx-too-large`), not clipped.
 *    · No formulas, no styles beyond the header: this writes the DATA the job holds, not a workbook the reader designs.
 * ==========================================================================*/
import { zip } from './zip-store.js';

export const XLSX_LIMITS = Object.freeze({ rows: 1048576, cols: 16384, cell: 32767, sheetName: 31 });   /* the format's own limits (ECMA-376 / Excel) */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* XML 1.0 has no notation for most control characters: they are dropped (and counted by the caller through `cleaned`) */
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const PLAIN_DECIMAL = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
/* East Asian wide / fullwidth blocks, by code point (Hangul Jamo, CJK radicals..Yi, Hangul syllables, CJK compatibility ideographs,
   vertical/small forms, fullwidth forms). Written as escapes: a literal U+F900 normalises to U+8C48 in an editor and the ranges then overlap. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;
export const widthOf = (s) => { let n = 0; for (const ch of String(s)) n += WIDE.test(ch) ? 2 : 1; return n; };

function colName(i) { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

function sheetName(want, taken) {
  let n = String(want == null || want === '' ? 'Sheet' : want).replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '').slice(0, XLSX_LIMITS.sheetName) || 'Sheet';
  for (let i = 2; taken.some((t) => t.toLowerCase() === n.toLowerCase()); i++) n = n.slice(0, XLSX_LIMITS.sheetName - String(i).length - 1) + '_' + i;
  return n;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SC = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * sheets: [{name, columns:[str], rows:[[cell…]], numericText?}]   → { ok, bytes, stated } | { ok:false, why, detail }
 * cell: number | boolean | string | null | object (an object is written as its JSON text and counted as `complexCells`)
 * opt: { when?: Date, core?: string }
 */
export function writeXlsx(sheets, opt) {
  const o = opt || {};
  if (!Array.isArray(sheets) || !sheets.length) return { ok: false, why: 'xlsx-no-sheets', detail: {} };
  const names = [], stated = { sheets: [], renamed: [], nonFinite: 0, truncatedCells: 0, complexCells: 0, cleaned: 0 };
  const parts = [];
  for (let si = 0; si < sheets.length; si++) {
    const S = sheets[si], cols = (S.columns || []).map(String), rows = S.rows || [];
    if (cols.length > XLSX_LIMITS.cols || rows.length + 1 > XLSX_LIMITS.rows) return { ok: false, why: 'xlsx-too-large', detail: { sheet: S.name, rows: rows.length, columns: cols.length, limits: { rows: XLSX_LIMITS.rows - 1, columns: XLSX_LIMITS.cols } } };
    const nm = sheetName(S.name, names); names.push(nm);
    if (nm !== String(S.name == null ? '' : S.name)) stated.renamed.push({ from: S.name == null ? null : String(S.name), to: nm });
    const widths = cols.map(widthOf);
    const text = (v) => { let s = String(v).replace(BAD_XML, () => { stated.cleaned++; return ''; }); if (s.length > XLSX_LIMITS.cell) { s = s.slice(0, XLSX_LIMITS.cell); stated.truncatedCells++; } return esc(s); };
    const cell = (ref, v, bold) => {
      if (v == null) return '';
      if (S.numericText && !bold && typeof v === 'string' && PLAIN_DECIMAL.test(v.trim())) v = Number(v);
      if (typeof v === 'number') { if (!isFinite(v)) { stated.nonFinite++; return ''; } return '<c r="' + ref + '"><v>' + String(v) + '</v></c>'; }
      if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      let s;
      if (typeof v === 'object') { try { s = JSON.stringify(v); } catch (_) { s = String(v); } if (s === undefined) return ''; stated.complexCells++; } else s = String(v);
      if (s === '' && !bold) return '';
      return '<c r="' + ref + '"' + (bold ? ' s="1"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + text(s) + '</t></is></c>';
    };
    const body = ['<row r="1">' + cols.map((c, i) => cell(colName(i) + '1', c, true)).join('') + '</row>'];
    rows.forEach((r, ri) => {
      for (let i = 0; i < cols.length; i++) { const v = r[i]; if (v != null && typeof v !== 'object' && widths[i] < 60) widths[i] = Math.min(60, Math.max(widths[i], widthOf(String(v).split('\n')[0]))); }
      body.push('<row r="' + (ri + 2) + '">' + cols.map((_, i) => cell(colName(i) + (ri + 2), r[i], false)).join('') + '</row>');
    });
    const colsXml = cols.length ? '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.min(60, Math.max(8, w + 2)) + '" customWidth="1"/>').join('') + '</cols>' : '';
    parts.push({ name: nm, xml: XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' + colsXml + '<sheetData>' + body.join('') + '</sheetData></worksheet>' });
    stated.sheets.push({ name: nm, rows: rows.length, columns: cols.length });
  }
  const core = o.core ? String(o.core) : '';
  const files = [
    { name: '[Content_Types].xml', xml: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="' + SC + 'sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="' + SC + 'styles+xml"/>' + (core ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' : '') + parts.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + SC + 'worksheet+xml"/>').join('') + '</Types>' },
    { name: '_rels/.rels', xml: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/>' + (core ? '<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : '') + '</Relationships>' },
  ];
  if (core) files.push({ name: 'docProps/core.xml', xml: core });
  files.push(
    { name: 'xl/workbook.xml', xml: XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + REL + '"><sheets>' + parts.map((p, i) => '<sheet name="' + esc(p.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', xml: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + parts.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (parts.length + 1) + '" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', xml: XML + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>' },
  );
  parts.forEach((p, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', xml: p.xml }));
  return { ok: true, bytes: zip(files.map((f) => ({ name: f.name, data: f.xml })), o.when), stated };
}
