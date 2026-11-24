/* ============================================================================
 *  IntMap · Atlas — WORK PRODUCTS: what a job leaves behind, kept together   (atlas-os)   js/atlas-work-store.js
 * ----------------------------------------------------------------------------
 *  Atlas could already hand over a DATASET (js/gis-export.js), save a GIS chain (js/gis-project.js), draw a chart
 *  into a reply (js/atlas-chart.js) and run Python (js/compute-sandbox.js) — and every one of those ended where the
 *  reply ended: a table in a bubble, a script in a code block, a chart that was gone with the tab, a file that was
 *  downloaded and then belonged to nobody. A JOB — "compare these three PDFs", "make a briefing with charts from open
 *  data", "write code, compute, explain", "carry on tomorrow" — is not one reply. It leaves several different things
 *  that belong together, and the next turn needs to find them again.
 *
 *  THIS MODULE IS THE DATA AND THE RULES, NOTHING ELSE (no DOM, no map, no network):
 *    · PRODUCT_KINDS   — what a job can leave: dataset, table, code, image, document, chart, analysis, answer.
 *                        A DECLARATION; each kind says how its content is shaped, how big it may be and how
 *                        it leaves as a file. A new kind is one entry here and nothing else.
 *    · a WORK          — one job: a goal, the products it made (versioned by name), and the notebook turns it came from.
 *    · WORKSPACES      — where a job's code can run, declared with what each one can and cannot do, and
 *                        chooseWorkspace(): the choice made FROM THE JOB'S DECLARED NEEDS, with every refusal's reason.
 *    · compareProducts — two versions of one product, compared BY CODE (a table by row identity through the
 *                        notebook's diffResults; text by lines). A model is never asked whether something changed.
 *    · workToMarkdown / workToFile / workFromFile — the job as something a reader can hand to someone else.
 *    · makeWorkStore   — the device copy. NOT a second store: it is js/atlas-notebook-store.js's makeNotebookStore
 *                        (the cache, the change events, the IndexedDB/memory backends) given this module's normalizer —
 *                        the notebook stays the one persistence technique, and stays hidden (NOTEBOOK_SHOWN) on its own.
 *  js/atlas-cap-work.js is what Atlas can do with it (and where the existing exporters, the chart renderer, the attachment
 *  log and the GIS registry are called — none of them is reimplemented here).
 * ==========================================================================*/

import { diffResults, makeNotebookStore, memoryBackend, idbBackend } from './atlas-notebook-store.js';

const FORMAT = 'intmap-atlas-work';
const VERSION = 1;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : null;
const arr = (x) => Array.isArray(x) ? x : [];

/* ══ WHAT A JOB CAN LEAVE ═══════════════════════════════════════════════════════════════════════════
   `shape` names the content's fields. `file` is how the product leaves on its own (extension + media type), or null
   when its natural file is produced by an existing writer (a dataset: js/gis-export.js). `maxBytes` is the inline
   ceiling — IndexedDB holds more, but one product that fills a quota would take every other job's with it; a product
   over it is REFUSED BY NAME (`too-large`) and the job is told to export it as a file instead of being truncated.
   Observation: 4 MiB is the notebook's own order of magnitude (a notebook entry is at most 64,000 characters of answer
   plus its rows); expires when a measured quota says otherwise. */
export const PRODUCT_KINDS = Object.freeze({
  dataset:  { label: 'Dataset',  shape: 'format, features | columns+rows', file: null, maxBytes: 4 << 20 },
  table:    { label: 'Table',    shape: 'columns, rows', file: { ext: 'csv', mime: 'text/csv' }, maxBytes: 4 << 20 },
  code:     { label: 'Code',     shape: 'language, text', file: { ext: 'txt', mime: 'text/plain' }, maxBytes: 1 << 20 },
  image:    { label: 'Image',    shape: 'mime, dataUrl | svg', file: { ext: 'png', mime: 'image/png' }, maxBytes: 4 << 20 },
  document: { label: 'Document', shape: 'format, text', file: { ext: 'md', mime: 'text/markdown' }, maxBytes: 2 << 20 },
  chart:    { label: 'Chart',    shape: 'spec, svg', file: { ext: 'svg', mime: 'image/svg+xml' }, maxBytes: 1 << 20 },
  analysis: { label: 'Analysis', shape: 'projectId | recipe', file: null, maxBytes: 256 << 10 },
  answer:   { label: 'Answer',   shape: 'text', file: { ext: 'md', mime: 'text/markdown' }, maxBytes: 256 << 10 },
});
export const productKinds = () => Object.keys(PRODUCT_KINDS);

const EXT_FOR_CODE = { python: 'py', javascript: 'js', sql: 'sql', r: 'r', shell: 'sh', json: 'json' };
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

const sizeOf = (c) => { try { return JSON.stringify(c).length; } catch (_) { return Infinity; } };

/** the content of a product, cleaned to its kind's shape — or { problem } naming what is wrong */
function cleanContent(kind, c) {
  const K = PRODUCT_KINDS[kind]; if (!K) return { problem: 'unknown-kind' };
  const x = obj(c); if (!x) return { problem: 'no-content' };
  let out;
  if (kind === 'table') {
    const columns = arr(x.columns).map((v) => str(v && v.id != null ? v.id : v, 120)).filter(Boolean);
    const rows = arr(x.rows).map((r) => Array.isArray(r) ? r : columns.map((c2) => (obj(r) ? r[c2] : null)));
    if (!columns.length) return { problem: 'no-columns' };
    out = { columns, rows: rows.map((r) => columns.map((_, i) => (r[i] === undefined ? null : r[i]))) };
  } else if (kind === 'dataset') {
    const format = x.format === 'geojson' ? 'geojson' : 'table';
    if (format === 'geojson') { if (!Array.isArray(x.features)) return { problem: 'no-features' }; out = { format, features: x.features, fields: arr(x.fields).filter(obj), count: x.features.length }; }
    else { const t = cleanContent('table', x); if (t.problem) return t; out = Object.assign({ format, fields: arr(x.fields).filter(obj) }, t.content); }
    if (x.licence != null) out.licence = str(x.licence, 400);
  } else if (kind === 'code') {
    if (typeof x.text !== 'string' || !x.text.trim()) return { problem: 'no-text' };
    out = { language: str(x.language || 'python', 24).toLowerCase(), text: x.text };
    if (obj(x.result)) out.result = x.result;   /* what the run answered (datasets / values), kept next to the code that made it */
  } else if (kind === 'image') {
    const mime = str(x.mime || (/^data:([^;,]+)/.exec(String(x.dataUrl || '')) || [])[1] || (x.svg ? 'image/svg+xml' : ''), 60);
    if (!IMAGE_EXT[mime]) return { problem: 'image-type-not-kept' };
    if (x.svg != null) out = { mime, svg: String(x.svg) };
    else if (/^data:image\//.test(String(x.dataUrl || ''))) out = { mime, dataUrl: String(x.dataUrl) };
    else return { problem: 'no-image' };
  } else if (kind === 'document') {
    if (typeof x.text !== 'string' || !x.text.trim()) return { problem: 'no-text' };
    out = { format: str(x.format || 'markdown', 16), text: x.text };
  } else if (kind === 'chart') {
    if (typeof x.svg !== 'string' && !obj(x.spec)) return { problem: 'no-chart' };
    out = {}; if (obj(x.spec)) out.spec = x.spec; if (typeof x.svg === 'string') out.svg = x.svg;
  } else if (kind === 'analysis') {
    if (!x.projectId && !obj(x.recipe)) return { problem: 'no-analysis' };
    out = {}; if (x.projectId) out.projectId = str(x.projectId, 120); if (obj(x.recipe)) out.recipe = x.recipe;
  } else if (kind === 'answer') {
    if (typeof x.text !== 'string' || !x.text.trim()) return { problem: 'no-text' };
    out = { text: x.text };
  }
  if (sizeOf(out) > K.maxBytes) return { problem: 'too-large', maxBytes: K.maxBytes };
  return { content: out };
}

/** the file name a product leaves under, and what it is — null when the kind has no file of its own (a dataset is written by gis-export) */
export function fileOf(p) {
  const K = PRODUCT_KINDS[p.kind]; if (!K || !K.file) return null;
  const base = (str(p.name, 80).replace(/[^\w.\-぀-ヿ一-鿿]+/g, '_').replace(/^_+|_+$/g, '') || p.kind) + (p.version > 1 ? '-v' + p.version : '');
  const c = p.content || {};
  if (p.kind === 'table') return { filename: base + '.csv', mime: 'text/csv;charset=utf-8', text: tableCsv(c) };
  if (p.kind === 'code') return { filename: base + '.' + (EXT_FOR_CODE[c.language] || 'txt'), mime: 'text/plain;charset=utf-8', text: c.text };
  if (p.kind === 'document') return { filename: base + (c.format === 'markdown' ? '.md' : '.txt'), mime: 'text/markdown;charset=utf-8', text: c.text };
  if (p.kind === 'answer') return { filename: base + '.md', mime: 'text/markdown;charset=utf-8', text: c.text };
  if (p.kind === 'chart') return c.svg ? { filename: base + '.svg', mime: 'image/svg+xml', text: c.svg } : null;
  if (p.kind === 'image') {
    if (c.svg != null) return { filename: base + '.svg', mime: 'image/svg+xml', text: c.svg };
    const m = /^data:[^;,]+;base64,(.*)$/s.exec(c.dataUrl || ''); if (!m) return null;
    return { filename: base + '.' + IMAGE_EXT[c.mime], mime: c.mime, base64: m[1] };
  }
  return null;
}

/* RFC 4180, the same quoting js/gis-export.js's csv writer states (CRLF, a quote doubled, newlines kept) — written here
   only because a TABLE product is plain columns and rows, not a dataset in the GIS registry; a dataset is NEVER written here. */
function tableCsv(t) {
  const cell = (v) => { const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [t.columns.map(cell).join(',')].concat((t.rows || []).map((r) => r.map(cell).join(','))).join('\r\n') + '\r\n';
}

/* ══ A WORK, NORMALISED ═════════════════════════════════════════════════════════════════════════════
   `question` is the goal (makeNotebookStore's search and list read it). ids are `wk-…` so a work can never be taken for a
   notebook turn. A product is {id, name, kind, version, at, content, note, from, supersedes} — the same name and kind
   again is the next VERSION, never an overwrite (the earlier one stays comparable). */
export function newWorkId(now) {
  const t = Math.floor(+now || Date.now()).toString(36);
  let r = ''; try { const a = new Uint8Array(5); globalThis.crypto.getRandomValues(a); r = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); } catch (_) { r = Math.random().toString(16).slice(2, 12); }
  return 'wk-' + t + '-' + r;
}
function normalizeProduct(p) {
  const x = obj(p); if (!x || !PRODUCT_KINDS[x.kind]) return null;
  const name = str(x.name, 120).trim(); if (!name) return null;
  const c = cleanContent(x.kind, x.content); if (c.problem) return null;
  return { id: str(x.id, 80) || ('pr-' + newWorkId(x.at).slice(3)), name, kind: x.kind, version: Math.max(1, Math.floor(+x.version) || 1), at: +x.at || 0, content: c.content,
    note: str(x.note, 2000), from: obj(x.from) ? JSON.parse(JSON.stringify(x.from)) : null, supersedes: x.supersedes ? str(x.supersedes, 80) : null };
}
export function normalizeWork(w) {
  const x = obj(w); if (!x || !/^wk-[a-z0-9-]{4,64}$/.test(String(x.id || ''))) return null;
  const goal = str(x.goal || x.question, 8000).trim(); if (!goal) return null;
  const ws = obj(x.workspace);
  return { v: VERSION, id: String(x.id), at: +x.at || 0, updatedAt: +x.updatedAt || +x.at || 0, title: str(x.title || goal, 140), question: goal, goal,
    answer: str(x.summary || x.answer, 16000), summary: str(x.summary || x.answer, 16000), note: str(x.note, 8000), status: ['open', 'done', 'blocked'].includes(x.status) ? x.status : 'open',
    workspace: ws ? { id: str(ws.id, 40), needs: obj(ws.needs) || {}, reason: str(ws.reason, 600) } : null,
    products: arr(x.products).map(normalizeProduct).filter(Boolean),
    turns: arr(x.turns).map((t) => str(t, 80)).filter(Boolean).slice(-200),   /* the notebook turns this job came from (js/atlas-notebook-store.js entry ids), for replay */
    followOf: x.followOf ? str(x.followOf, 80) : null, pinned: !!x.pinned, syncedAt: 0 };
}

/** the work with `product` filed in: the same name+kind is the next version, and the earlier one is kept. Returns { work, product } or { problem } */
export function withProduct(work, p, now) {
  const kind = p && p.kind;
  if (!PRODUCT_KINDS[kind]) return { problem: 'unknown-kind' };
  const name = str(p.name, 120).trim(); if (!name) return { problem: 'no-name' };
  const c = cleanContent(kind, p.content); if (c.problem) return c;
  const same = arr(work.products).filter((q) => q.kind === kind && q.name === name);
  const prev = same.length ? same.reduce((a, b) => (b.version > a.version ? b : a)) : null;
  const t = +now || Date.now();
  const product = normalizeProduct({ id: 'pr-' + newWorkId(t).slice(3), name, kind, version: prev ? prev.version + 1 : 1, at: t, content: c.content, note: p.note, from: p.from, supersedes: prev ? prev.id : null });
  return { work: Object.assign({}, work, { products: arr(work.products).concat([product]), updatedAt: t }), product };
}
/** the newest version of each (kind, name) — what a reader means by "the table" */
export function currentProducts(work) {
  const m = new Map();
  arr(work && work.products).forEach((p) => { const k = p.kind + '\u0000' + p.name, c = m.get(k); if (!c || p.version > c.version) m.set(k, p); });
  return Array.from(m.values());
}
/** a product named by id, or by name (newest version), or by `name@version` */
export function findProduct(work, ref) {
  const r = String(ref == null ? '' : ref).trim(); if (!r) return null;
  const all = arr(work && work.products);
  const byId = all.find((p) => p.id === r); if (byId) return byId;
  const at = /^(.*)@(\d+)$/.exec(r), name = at ? at[1] : r, ver = at ? +at[2] : 0;
  const hits = all.filter((p) => p.name === name || p.name.toLowerCase() === name.toLowerCase());
  if (ver) return hits.find((p) => p.version === ver) || null;
  return hits.length ? hits.reduce((a, b) => (b.version > a.version ? b : a)) : null;
}

/* ══ TWO VERSIONS OF ONE PRODUCT, COMPARED BY CODE ══════════════════════════════════════════════════
   A table (and a tabular dataset) is matched ROW BY ROW through the notebook's diffResults — rows are matched by the
   first column's value (the key), never by position, so a re-sorted table is not "everything changed". Text kinds are
   compared by line. Everything else is compared by what it states (size, identity) and says it cannot say more. */
export function compareProducts(a, b) {
  if (!a || !b) return { ok: false, why: 'needs-two-versions' };
  if (a.kind !== b.kind) return { ok: false, why: 'kinds-differ', detail: a.kind + ' / ' + b.kind };
  const tab = (p) => { const c = p.content || {}; if (p.kind === 'table' || (p.kind === 'dataset' && c.format === 'table')) return c; return null; };
  const ta = tab(a), tb = tab(b);
  if (ta && tb) {
    const shape = (t) => ({ at: 0, rows: t.rows.map((r, i) => ({ id: String(r[0] == null ? '#' + i : r[0]), name: String(r[0] == null ? '' : r[0]), iso2: '', lat: null, lng: null,
      v: Object.fromEntries(t.columns.slice(1).map((cn, j) => [cn, r[j + 1]])) })), columns: t.columns.slice(1).map((cn) => ({ id: cn, label: cn, unit: '' })), matched: t.rows.length });
    const d = diffResults(shape(ta), shape(tb));
    const dup = (t) => new Set(t.rows.map((r) => String(r[0]))).size !== t.rows.length;
    return { ok: true, by: 'rows', key: ta.columns[0], keyUnique: !dup(ta) && !dup(tb), added: d.added.map((r) => r.id), removed: d.removed.map((r) => r.id), changed: d.changed.map((r) => ({ id: r.id, diffs: r.diffs.map((x) => ({ column: x.col, then: x.then, now: x.now })) })),
      unchanged: d.unchanged, sameColumns: d.sameColumns, from: a.version, to: b.version };
  }
  const text = (p) => { const c = p.content || {}; return typeof c.text === 'string' ? c.text : (typeof c.svg === 'string' ? c.svg : null); };
  const xa = text(a), xb = text(b);
  if (xa != null && xb != null) {
    const A = xa.split(/\r?\n/), B = xb.split(/\r?\n/), sa = new Map(), sb = new Map();
    A.forEach((l) => sa.set(l, (sa.get(l) || 0) + 1)); B.forEach((l) => sb.set(l, (sb.get(l) || 0) + 1));
    let added = 0, removed = 0;
    sb.forEach((n, l) => { added += Math.max(0, n - (sa.get(l) || 0)); }); sa.forEach((n, l) => { removed += Math.max(0, n - (sb.get(l) || 0)); });
    return { ok: true, by: 'lines', added, removed, linesThen: A.length, linesNow: B.length, identical: xa === xb, from: a.version, to: b.version };
  }
  return { ok: true, by: 'identity', identical: JSON.stringify(a.content) === JSON.stringify(b.content), bytesThen: sizeOf(a.content), bytesNow: sizeOf(b.content), from: a.version, to: b.version,
    note: 'this kind has no row or line structure to compare' };
}

/* ══ WHERE A JOB'S CODE RUNS ════════════════════════════════════════════════════════════════════════
   The choice is a function of the JOB'S DECLARED NEEDS — never of its words (a keyword list is the next phrase it
   misses) and never made by this module for a model that can read the refusals and decide. Every workspace states
   what it CAN do (`provides`); needs the workspace does not provide come back by name. A workspace the build does not
   have says so and why (`present:false`) instead of being left out, so "the server-side file sandbox" is a refusal a
   reader and Atlas can see, not a silence.
   `needs`: { language?: 'python'|'gis'|'none', binaryFiles?: bool (read PDF/xlsx/images as bytes in code), network?: bool,
              packages?: [names], geometry?: bool (spatial ops), persistFiles?: bool (files that outlive the tab, written by code) }
   Order is preference: the cheapest workspace that satisfies everything wins. */
export const WORKSPACES = Object.freeze([
  { id: 'reading', label: 'Read and write (no code)', present: true,
    provides: { language: ['none'], binaryFiles: false, network: false, geometry: false, persistFiles: false },
    detail: 'The model reads the reader\'s attachments (PDF, images, text) itself and files the result as a document or table product. Right for comparing documents and writing up.' },
  { id: 'gis', label: 'GIS kernel (browser)', present: true, probe: 'IntMapGis',
    provides: { language: ['none', 'gis'], binaryFiles: false, network: false, geometry: true, persistFiles: false },
    detail: 'The `gis` capability\'s operations over datasets in this session — checked against what the numbers mean. Right for buffers, joins, overlays.' },
  { id: 'pyodide', label: 'Python (Pyodide worker, browser)', present: true, probe: 'IntMapCompute',
    provides: { language: ['none', 'python'], binaryFiles: false, network: false, geometry: true, persistFiles: false, packages: 'the Pyodide distribution (numpy, pandas, scipy, statsmodels, scikit-learn, shapely …)' },
    detail: 'compute.run: Python in an isolated worker — no network, no page, no storage; inputs are datasets of this session, outputs become datasets and values. Right for statistics and custom analysis.' },
  { id: 'server-files', label: 'Server-side sandbox with real files', present: false,
    provides: { language: ['none', 'python', 'shell'], binaryFiles: true, network: false, geometry: true, persistFiles: true },
    detail: 'NOT IN THIS BUILD: nothing on the server runs a reader\'s code or keeps its files (supabase/functions has no such function). Declared so that a job that needs it — code that parses PDF/Excel bytes, files that outlive the tab — is told so by name instead of being given a workspace that cannot do it.' },
]);

const unmet = (ws, needs) => {
  const n = needs || {}, p = ws.provides, out = [];
  const lang = n.language || 'none';
  if (p.language.indexOf(lang) < 0) out.push('language:' + lang);
  if (n.binaryFiles && !p.binaryFiles) out.push('binaryFiles');
  if (n.network && !p.network) out.push('network');
  if (n.geometry && !p.geometry) out.push('geometry');
  if (n.persistFiles && !p.persistFiles) out.push('persistFiles');
  if (arr(n.packages).length && lang === 'python' && !p.packages) out.push('packages');
  return out;
};
/** `availability`: { <workspace id>: boolean } measured by the caller on the page (a probe the module cannot make). Returns { choice, considered[] } — choice is null when nothing satisfies. */
export function chooseWorkspace(needs, availability) {
  const av = availability || {};
  const considered = WORKSPACES.map((w) => {
    const reasons = unmet(w, needs);
    const here = w.present && (w.probe ? av[w.id] !== false : true);
    if (!w.present) reasons.push('not-in-this-build');
    else if (!here) reasons.push('not-loaded');
    return { id: w.id, label: w.label, ok: reasons.length === 0, unmet: reasons, detail: w.detail };
  });
  const hit = considered.find((c) => c.ok);
  return { choice: hit ? hit.id : null, needs: needs || {}, considered };
}

/* ══ HANDING A JOB ON ═══════════════════════════════════════════════════════════════════════════════ */
const mdCell = (v) => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const iso = (ms) => { try { return new Date(+ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; } catch (_) { return ''; } };
export function workToMarkdown(work) {
  const w = work, out = ['# ' + w.title, '', '*' + iso(w.at) + '*  ·  ' + w.id + '  ·  ' + w.status, ''];
  out.push('**Goal** — ' + w.goal.replace(/\n+/g, ' '), '');
  if (w.summary) out.push(w.summary.trim(), '');
  if (w.workspace && w.workspace.id) out.push('Workspace: ' + w.workspace.id + (w.workspace.reason ? ' — ' + w.workspace.reason : ''), '');
  currentProducts(w).forEach((p) => {
    out.push('## ' + p.name + ' · ' + PRODUCT_KINDS[p.kind].label + (p.version > 1 ? ' (v' + p.version + ')' : ''), '');
    const c = p.content;
    if (p.note) out.push(p.note, '');
    if (p.kind === 'table' || (p.kind === 'dataset' && c.format === 'table')) {
      out.push('| ' + c.columns.map(mdCell).join(' | ') + ' |', '|' + ' --- |'.repeat(c.columns.length));
      c.rows.slice(0, 200).forEach((r) => out.push('| ' + r.map(mdCell).join(' | ') + ' |'));
      if (c.rows.length > 200) out.push('', 'Shown: 200 / ' + c.rows.length);
    } else if (p.kind === 'code') { out.push('```' + c.language, c.text, '```'); if (c.result) out.push('', 'Result: `' + mdCell(JSON.stringify(c.result)).slice(0, 600) + '`'); }
    else if (p.kind === 'document' || p.kind === 'answer') out.push(c.text);
    else if (p.kind === 'chart') out.push(c.svg ? '(chart as SVG — in the .json bundle)' : '(chart spec — in the .json bundle)', c.spec && c.spec.source ? 'Source: ' + mdCell(c.spec.source) : '');
    else if (p.kind === 'image') out.push('(image ' + c.mime + ' — in the .json bundle)');
    else if (p.kind === 'dataset') out.push(c.count + ' features (' + c.format + ') — in the .json bundle');
    else out.push('(' + p.kind + ' — in the .json bundle)');
    if (p.from && (p.from.attachment || p.from.dataset || p.from.url)) out.push('', 'From: ' + mdCell(p.from.attachment || p.from.dataset || p.from.url));
    out.push('');
  });
  return out.join('\n');
}
export function workToFile(work) { const c = JSON.parse(JSON.stringify(work)); delete c.syncedAt; return { format: FORMAT, v: VERSION, exportedAt: Date.now(), works: [c] }; }
/** a file a reader chose → { works, rejected }. Throws only when it is not a work-products file at all. An imported work gets a NEW id (it is a copy, and the original may still exist here). */
export function workFromFile(o) {
  if (!obj(o) || o.format !== FORMAT || !Array.isArray(o.works)) throw new Error('not-a-work-file');
  const works = [], rejected = [];
  o.works.forEach((w) => { const n = normalizeWork(Object.assign({}, w, { id: newWorkId(w && w.at), followOf: w && w.id })); if (n) works.push(n); else rejected.push(String(w && w.id || '?')); });
  return { works, rejected };
}

/* ══ THE DEVICE COPY ════════════════════════════════════════════════════════════════════════════════
   makeNotebookStore with this module's normalizer — one persistence technique (cache, events, backends) for both. The IndexedDB
   database is its own, so the notebook's list and this one never see each other's entries. */
export function makeWorkStore(backend) {
  const S = makeNotebookStore(backend || memoryBackend(), normalizeWork);
  return S;
}
export function deviceWorkStore(idb) { let b = null; try { if (idb) b = idbBackend(idb, 'intmap-atlas-work'); } catch (_) { b = null; } return makeWorkStore(b); }
export { memoryBackend };

/* The capability module is built twice (kernel copy + real module), so its state lives HERE, in a module both import (scripts/atlas-caps-split.mjs). */
export const WORK_STATE = { store: null, current: null };
