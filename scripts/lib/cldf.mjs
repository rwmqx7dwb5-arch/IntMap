/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  IntMap · CLDF — read the linguistic datasets the language layer is built from   (#R538)
 *
 *  Every dataset the language engine uses (Glottolog, and later WALS / Grambank / PHOIBLE) is
 *  published as CLDF: a directory of CSVs whose rows are keyed by Glottocode. This module does the
 *  two things all of those builds need — fetch a file once and keep it, and parse RFC-4180 CSV — so
 *  the per-dataset builds hold nothing but the knowledge specific to their own dataset.
 *
 *  ⚠ THE CACHE IS NOT AN OPTIMISATION, IT IS WHAT MAKES THE BUILD RE-RUNNABLE. Glottolog's
 *  languages.csv is 2.4 MB and its values.csv is 21 MB; a build that re-downloads them on every run
 *  is a build nobody runs twice, and a build nobody re-runs is a build whose output quietly stops
 *  matching its inputs. The cache lives under .cache/ , which .gitignore already excludes.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

/* ── RFC-4180. Quoted fields carry commas, newlines and doubled quotes — Glottolog's names really
      do contain all three («Tonga (Tonga Islands)», «Hai//om-Akhoe»). ─────────────────────────── */
export function parseCSV(text) {
  const rows = []; let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* rows as objects, keyed by the header line */
export function parseTable(text) {
  const rows = parseCSV(text);
  const head = rows[0] || [];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => {
    const o = {}; for (let i = 0; i < head.length; i++) o[head[i]] = r[i]; return o;
  });
}

export function cacheDir(root) { return path.join(root, '.cache', 'cldf'); }

/* fetch-once. `slug` names the dataset directory, `file` the CSV inside it. */
export async function cldfFile(root, slug, url, file) {
  const dir = path.join(cacheDir(root), slug);
  const dest = path.join(dir, file);
  if (fs.existsSync(dest)) return fs.readFileSync(dest, 'utf8');
  fs.mkdirSync(dir, { recursive: true });
  process.stdout.write('  fetching ' + slug + '/' + file + ' … ');
  const r = await fetch(url, { headers: { 'user-agent': 'IntMap build-language' } });
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  const t = await r.text();
  fs.writeFileSync(dest, t);
  console.log((t.length / 1048576).toFixed(1) + ' MB');
  return t;
}

export async function cldfTable(root, slug, url, file) {
  return parseTable(await cldfFile(root, slug, url, file));
}
