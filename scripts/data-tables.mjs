#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE SHIPPED TABLES, DISCOVERED — data/**.json `rowTables` → js/data-tables.js
 * ----------------------------------------------------------------------------
 *      node scripts/data-tables.mjs            print the index it would write
 *      node scripts/data-tables.mjs --write    write js/data-tables.js
 *      node scripts/data-tables.mjs --check    exit 1 when js/data-tables.js is not what the files declare
 *
 *  A data file that holds rows says so ITSELF: a top-level `rowTables` array, one entry per table —
 *      { id, title:{en,jp}, rows:<dot path to the array>, fields?:[…] (when each row is an array),
 *        key?, name?, lng?, lat?, columns:[{ key, from:<dot path in the row>, type:'number'|'text',
 *        unit?, label:{en,jp}, via?:{ rows:<dot path>, field } }] }
 *  This script finds those declarations, checks each against the rows it describes, and writes the
 *  index js/atlas-query.js reads — so a dataset becomes a table Atlas can ask (data.query) and hand on
 *  (data.gis, compute.run) by being DECLARED where it is built, not by a capability written for it.
 *
 *  ⚠ WHY THIS EXISTS (2026-11-25). data.query could read five tables. Every other shipped dataset was
 *    reachable only through the one capability built around one question — the power plants and the
 *    ports through «this port stops», the prefecture indicators through «compare prefectures for a
 *    plant». The data was there and Atlas could not ask it anything else.
 *    dev-notes/2026-11-25-generic-capabilities.md.
 *  ⚠ NOTHING HERE IS A LIST: the files are found by walking data/, and a file joins the index by
 *    carrying a declaration. The walk reads the first bytes of each file for the key before parsing.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'js', 'data-tables.js');

export const at = (o, p) => String(p).split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

/* the declaration is a top-level key; a file that does not carry the spelling is not parsed */
function declares(p) {
  const fd = fs.openSync(p, 'r');
  try {
    const size = fs.fstatSync(fd).size, n = Math.min(size, 1 << 20), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, 0);
    return buf.toString('utf8').indexOf('"rowTables":[{') >= 0;
  } finally { fs.closeSync(fd); }
}

/** every declared table, checked against its own rows → [{…index entry}], or throws naming what is wrong */
export function discover() {
  const files = walk(DATA, []).filter(declares).sort();
  const out = [], ids = new Map(), bad = [];
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (!Array.isArray(doc.rowTables)) continue;
    for (const t of doc.rowTables) {
      const where = rel + ' table ' + (t && t.id);
      if (!t || !/^[a-z][a-z0-9-]*$/.test(String(t.id || ''))) { bad.push(where + ': id must be lower-case words joined by hyphens'); continue; }
      if (ids.has(t.id)) { bad.push(where + ': id already declared by ' + ids.get(t.id)); continue; }
      ids.set(t.id, rel);
      if (!t.title || !t.title.en || !t.title.jp) bad.push(where + ': title needs en and jp');
      const rows = at(doc, t.rows);
      if (!Array.isArray(rows) || !rows.length) { bad.push(where + ': rows "' + t.rows + '" is not a non-empty array'); continue; }
      const asObj = (r) => (Array.isArray(r) && Array.isArray(t.fields)) ? Object.fromEntries(t.fields.map((f, i) => [f, r[i]])) : r;
      const sample = rows.map(asObj);
      const present = (p) => sample.some((r) => at(r, p) != null);
      for (const k of ['key', 'name', 'lng', 'lat']) if (t[k] && !present(t[k])) bad.push(where + ': ' + k + ' "' + t[k] + '" is in no row');
      if (!Array.isArray(t.columns) || !t.columns.length) bad.push(where + ': no columns');
      const seen = new Set();
      for (const c of t.columns || []) {
        if (seen.has(c.key)) bad.push(where + ': column ' + c.key + ' twice'); seen.add(c.key);
        if (!c.label || !c.label.en || !c.label.jp) bad.push(where + ': column ' + c.key + ' label needs en and jp');
        if (c.type !== 'number' && c.type !== 'text') bad.push(where + ': column ' + c.key + ' type must be number or text');
        if (!present(c.from)) bad.push(where + ': column ' + c.key + ' reads "' + c.from + '", which no row holds');
        if (c.via && !Array.isArray(at(doc, c.via.rows))) bad.push(where + ': column ' + c.key + ' via "' + c.via.rows + '" is not an array');
      }
      const pair = (o) => ({ __LA: [o.en, o.jp] });   /* written as LA(en, jp) by render() — the pickArgs form check:i18n reads */
      out.push({
        id: t.id, file: rel, title: pair(t.title), rows: t.rows, fields: t.fields || null,
        key: t.key || null, name: t.name || null, lng: t.lng || null, lat: t.lat || null,
        count: rows.length, columns: t.columns.map((c) => Object.assign({}, c, { label: pair(c.label) })),
        source: { publisher: doc.publisher || null, licence: doc.licence || null, url: doc.url || null, asOf: doc.asOf || null,
          completeness: (typeof doc.completeness === 'string' ? doc.completeness : null),
          gaps: Array.isArray(doc.gaps) ? doc.gaps.map((g) => (g.dimension ? g.dimension + ': ' : '') + (g.reason || '')) : null },
      });
    }
  }
  if (bad.length) throw new Error('data tables: ' + bad.join('\n  '));
  return out;
}

export function render(index) {
  return '/* ⚠ GENERATED by `node scripts/data-tables.mjs --write` from the `rowTables` declarations in data/ — DO NOT EDIT.\n'
    + '   The tables IntMap ships, as the files declare them; js/atlas-query.js imports this on the first query (its own chunk)\n'
    + '   and serves each to data.query.\n'
    + '   To add one, declare `rowTables` in the file where it is built (scripts/data-tables.mjs says how). */\n'
    + "import { IntMapLang } from './lang-registry.js';\n"
    + 'const LA = IntMapLang.pickArgs();\n'
    + 'export const DATA_TABLES = ' + JSON.stringify(index, (k, v) => (v && v.__LA ? '\u0000LA' + JSON.stringify(v.__LA) : v), 1)
      .replace(/"\\u0000LA(\[.*?\])"(?=,?\n)/g, (m, arr) => 'LA(' + JSON.parse(JSON.parse('"' + arr + '"')).map((x) => JSON.stringify(x)).join(', ') + ')') + ';\n';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let index;
  try { index = discover(); } catch (e) { console.error(e.message); process.exit(1); }
  const text = render(index);
  if (process.argv.includes('--write')) { fs.writeFileSync(OUT, text); console.log('wrote js/data-tables.js —', index.length, 'tables:', index.map((t) => t.id + ' (' + t.count + ')').join(', ')); }
  else if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== text) { console.error('data-tables: js/data-tables.js is not what data/ declares — run `node scripts/data-tables.mjs --write`'); process.exit(1); }
    console.log('data-tables: ' + index.length + ' declared tables, index current');
  } else console.log(index.map((t) => t.id + '  ' + t.file + '  ' + t.count + ' rows  ' + t.columns.length + ' columns').join('\n'));
}
