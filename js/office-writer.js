/* ============================================================================
 *  IntMap · Office writer — a workbook as bytes, with no library   (js/office-writer.js)
 * ----------------------------------------------------------------------------
 *  WHY IT EXISTS. Atlas could READ .xlsx / .docx / .pptx (js/atlas-attach.js) but nothing in IntMap could WRITE one, so a job
 *  that began with a spreadsheet could not hand a spreadsheet back. This is the writer for the format a reader opens in Excel,
 *  Numbers and LibreOffice: SpreadsheetML in an OPC package (a ZIP). DOM-free, so a test runs it under node.
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
 *    · No formulas, no styles beyond a bold header: this writes the DATA the job holds, not a workbook the reader designs.
 * ==========================================================================*/

export const XLSX_LIMITS = Object.freeze({ rows: 1048576, cols: 16384, cell: 32767, sheetName: 31 });   /* the format's own limits (ECMA-376 / Excel) */

const enc = new TextEncoder();

let CRC_TABLE = null;
function crc32(b) {
  if (!CRC_TABLE) { CRC_TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** files: [{name, bytes}] → Uint8Array of a ZIP (all entries stored). Names are UTF-8 (general-purpose flag bit 11). */
function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
    const local = Uint8Array.from([0x50, 0x4B, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0]);
    parts.push(local, name, data);
    central.push(Uint8Array.from([0x50, 0x4B, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset)]), name);
    offset += local.length + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = Uint8Array.from([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), 0, 0]);
  const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* XML 1.0 has no notation for most control characters: they are dropped (and counted by the caller through `cleaned`) */
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function colName(i) { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

function sheetName(want, taken) {
  let n = String(want == null || want === '' ? 'Sheet' : want).replace(/[\\/?*[\]:]/g, '_').replace(/^'+|'+$/g, '').slice(0, XLSX_LIMITS.sheetName) || 'Sheet';
  for (let i = 2; taken.some((t) => t.toLowerCase() === n.toLowerCase()); i++) n = n.slice(0, XLSX_LIMITS.sheetName - String(i).length - 1) + '_' + i;
  return n;
}

/**
 * sheets: [{name, columns:[str], rows:[[cell…]]}]   → { ok, bytes, stated } | { ok:false, why, detail }
 * cell: number | boolean | string | null | object (an object is written as its JSON text and counted as `complexCells`)
 */
export function writeXlsx(sheets) {
  if (!Array.isArray(sheets) || !sheets.length) return { ok: false, why: 'xlsx-no-sheets', detail: {} };
  const names = [], stated = { sheets: [], renamed: [], nonFinite: 0, truncatedCells: 0, complexCells: 0, cleaned: 0 };
  const parts = [];
  for (let si = 0; si < sheets.length; si++) {
    const S = sheets[si], cols = (S.columns || []).map(String), rows = S.rows || [];
    if (cols.length > XLSX_LIMITS.cols || rows.length + 1 > XLSX_LIMITS.rows) return { ok: false, why: 'xlsx-too-large', detail: { sheet: S.name, rows: rows.length, columns: cols.length, limits: { rows: XLSX_LIMITS.rows - 1, columns: XLSX_LIMITS.cols } } };
    const nm = sheetName(S.name, names); names.push(nm);
    if (nm !== String(S.name == null ? '' : S.name)) stated.renamed.push({ from: S.name == null ? null : String(S.name), to: nm });
    const text = (v) => { let s = String(v).replace(BAD_XML, () => { stated.cleaned++; return ''; }); if (s.length > XLSX_LIMITS.cell) { s = s.slice(0, XLSX_LIMITS.cell); stated.truncatedCells++; } return esc(s); };
    const cell = (ref, v, bold) => {
      if (v == null) return '';
      if (typeof v === 'number') { if (!isFinite(v)) { stated.nonFinite++; return ''; } return '<c r="' + ref + '"><v>' + String(v) + '</v></c>'; }
      if (typeof v === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      let s;
      if (typeof v === 'object') { try { s = JSON.stringify(v); } catch (_) { s = String(v); } if (s === undefined) return ''; stated.complexCells++; } else s = String(v);
      return '<c r="' + ref + '"' + (bold ? ' s="1"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + text(s) + '</t></is></c>';
    };
    const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'];
    out.push('<row r="1">' + cols.map((c, i) => cell(colName(i) + '1', c, true)).join('') + '</row>');
    rows.forEach((r, ri) => { out.push('<row r="' + (ri + 2) + '">' + cols.map((_, i) => cell(colName(i) + (ri + 2), r[i], false)).join('') + '</row>'); });
    out.push('</sheetData></worksheet>');
    parts.push({ name: nm, xml: out.join('') });
    stated.sheets.push({ name: nm, rows: rows.length, columns: cols.length });
  }
  const files = [
    { name: '[Content_Types].xml', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + parts.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { name: '_rels/.rels', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + parts.map((p, i) => '<sheet name="' + esc(p.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + parts.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (parts.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
  ].concat(parts.map((p, i) => ({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', xml: p.xml })));
  return { ok: true, bytes: zipStore(files.map((f) => ({ name: f.name, bytes: enc.encode(f.xml) }))), stated };
}
