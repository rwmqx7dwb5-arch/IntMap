#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHAT THE CAPABILITY ENTRIES GENERATE   (js/atlas-cap-<namespace>.js)
 * ----------------------------------------------------------------------------
 *  A capability is ONE ENTRY in js/atlas-cap-<namespace>.js (js/atlas-caps.js says what an entry
 *  holds and what is derived from it). Two things cannot be derived at run time, and this writes them:
 *
 *    js/atlas-caps-modules.js  — the list of namespace files, imported by the Atlas kernel (lazy).
 *                                DISCOVERED from js/: every `atlas-cap-<namespace>.js`, so a new
 *                                namespace is a new file and nothing else.
 *    js/atlas-capabilities.js  — three regions, each between its GENERATED markers. That file is EAGER (a
 *      (three regions)         capability is discoverable before Atlas loads):
 *                                ROWS          the registry rows (each entry's `row`)
 *                                POLICY        withdrawn / rule-documented / fallback / forbidden / equivalents / answer
 *                                              (each entry's `policy`, js/atlas-caps.js capabilityPolicy)
 *                                CAMERA GOALS  each entry's `goal`, its source copied as written — so a goal may
 *                                              read only its own arguments, and a name it reads from anywhere
 *                                              else is refused here (it would mean something else in the copy)
 *                              They are copied rather than imported from the entries because the entries
 *                              carry the executors, which do not belong on the boot path — and copied INTO
 *                              the registry rather than into a module of their own, because a module of
 *                              their own is one more module every session loads at boot (check:perf).
 *
 *      node scripts/atlas-caps.mjs --write [--root DIR]   # rewrite both after adding/removing an entry
 *      node scripts/atlas-caps.mjs --check [--root DIR]   # exit 1 while either disagrees (check:capabilities runs it too)
 *
 *  ORDER. The registry's order is read (alias clashes, search ties, the catalogue), so an id keeps
 *  the place the region already gives it and a new id is appended in module order — see
 *  capabilityRows() in js/atlas-caps.js.
 *  ⚠ The comparison ignores CR: a Windows checkout writes CRLF and the verdict must not depend on
 *  the machine that ran it.
 *  ⚠ WHY TOP-LEVEL FILES AND NOT A DIRECTORY. The instruments that read js/ — the i18n audits, the
 *  source readers of the tests — walk js/*.js; a capability module in a subdirectory would put every
 *  translated sentence and every capability's code out of their sight at once.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSource } from '../tests/helpers/ast.mjs';

const LF = (s) => s.replace(/\r\n/g, '\n');
const HERE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** the prefix that makes a js/ file a capability namespace: js/atlas-cap-<namespace>.js */
export const NS_PREFIX = 'atlas-cap-';
export const KIT = 'js/atlas-caps.js';
export const GENERATED_FILES = ['js/atlas-caps-modules.js', 'js/atlas-capabilities.js'];
/* the regions of js/atlas-capabilities.js that are generated: each from the line after its BEGIN to the line before its END */
const ROWS_HOST = GENERATED_FILES[1];
const REGION_NAMES = ['ROWS', 'POLICY', 'CAMERA GOALS'];
function region(text, name) {
  const BEGIN = '/* ⚠ GENERATED ' + name + ' — BEGIN', END = '/* ⚠ GENERATED ' + name + ' — END */';
  const b = text.indexOf(BEGIN), e = text.indexOf(END);
  if (b < 0 || e < b || text.indexOf(BEGIN, b + 1) >= 0) return null;
  const from = text.indexOf('\n', b) + 1, to = text.lastIndexOf('\n', e) + 1;
  return { name, from, to, body: text.slice(from, to) };
}
const rowsRegion = (text) => region(text, 'ROWS');

/* the names a goal's source READS that it does not declare itself — anything here would resolve to whatever the
   eager registry happens to call that name, so the copy would not be the function the entry shows */
const GOAL_GLOBALS = new Set(['undefined', 'Math', 'Number', 'isFinite', 'Array', 'Object', 'String', 'Infinity', 'NaN', 'JSON']);
export function freeNames(fnNode) {
  const declared = new Set(), read = new Set();
  const decl = (pat) => { if (!pat) return; if (pat.type === 'Identifier') declared.add(pat.name); else if (pat.type === 'AssignmentPattern') decl(pat.left); else if (pat.type === 'RestElement') decl(pat.argument); else if (pat.type === 'ArrayPattern') pat.elements.forEach(decl); else if (pat.type === 'ObjectPattern') pat.properties.forEach((pp) => decl(pp.value || pp.argument)); };
  (function visit(n, parent, key) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') {
      if (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if (parent && parent.type === 'Property' && key === 'key' && !parent.computed) return;
      read.add(n.name); return;
    }
    if (/Function/.test(n.type)) { if (n.id) declared.add(n.id.name); n.params.forEach(decl); }
    if (n.type === 'VariableDeclarator') decl(n.id);
    if (n.type === 'CatchClause') decl(n.param);
    for (const k of Object.keys(n)) {
      if (k === 'params' || (k === 'id' && n.type !== 'MemberExpression')) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => visit(x, n, k)); else if (v && typeof v.type === 'string') visit(v, n, k);
    }
  })(fnNode, null, null);
  return [...read].filter((x) => !declared.has(x) && !GOAL_GLOBALS.has(x)).sort();
}
const GENERATED = '⚠ GENERATED by `node scripts/atlas-caps.mjs --write` from js/atlas-cap-<namespace>.js — DO NOT EDIT.';

/** the namespace files under `root`: js/atlas-cap-<namespace>.js, as repo-relative paths, sorted */
export function namespaceFiles(root = HERE_ROOT) {
  return fs.readdirSync(path.join(root, 'js')).filter((f) => f.startsWith(NS_PREFIX) && f.endsWith('.js')).sort().map((f) => 'js/' + f);
}
export const namespaceOfFile = (rel) => path.basename(rel, '.js').slice(NS_PREFIX.length);

function idsOfTable(text) {
  /* the ids the current region lists, in its order — read as data (each row is one line that opens with its id) */
  const ids = [];
  for (const m of String(text || '').matchAll(/^\s*\[\s*['"]([^'"]+)['"]/gm)) ids.push(m[1]);
  return ids;
}

/** the entries under `root`, validated (js/atlas-caps.js capabilityEntries) — what the audit reads its ledgers from */
export async function loadEntries(root = HERE_ROOT) {
  const modules = {};
  for (const f of namespaceFiles(root)) modules[namespaceOfFile(f)] = (await import(pathToFileURL(path.join(root, f)).href)).default;
  const kit = await import(pathToFileURL(path.join(root, KIT)).href);
  return kit.capabilityEntries(modules);
}

/** what the two files should hold, from the entries under `root` */
export async function expected(root = HERE_ROOT) {
  const files = namespaceFiles(root);
  const modules = {};
  for (const f of files) modules[namespaceOfFile(f)] = (await import(pathToFileURL(path.join(root, f)).href)).default;
  const kit = await import(pathToFileURL(path.join(root, KIT)).href);
  const host = LF(fs.readFileSync(path.join(root, ROWS_HOST), 'utf8'));
  const regions = REGION_NAMES.map((n) => region(host, n));
  regions.forEach((r, i) => { if (!r) throw new Error(ROWS_HOST + ' has no GENERATED ' + REGION_NAMES[i] + ' region (the markers are gone, or are there twice)'); });
  const prevIds = idsOfTable(regions[0].body);
  const rows = kit.capabilityRows(modules, prevIds);
  const order = rows.map((r) => r[0]);
  const P = kit.capabilityPolicy(modules, order);
  const goals = goalSources(root, order);
  const names = files.map(namespaceOfFile);
  const ident = (n) => 'caps_' + n.replace(/[^\w$]/g, '_');
  const modulesJs = `/* ${GENERATED}
   The capability namespaces, discovered from js/. Imported by the Atlas kernel only
   (js/atlas-console.js, js/atlas-schemas.js) — the on-demand chunk, never the boot path. */
${names.map((n) => `import ${ident(n)} from './${NS_PREFIX}${n}.js';`).join('\n')}

export const CAPABILITY_MODULES = {
${names.map((n) => `  ${JSON.stringify(n)}: ${ident(n)},`).join('\n')}
};
`;
  const table = (name, o) => '    var ' + name + ' = ' + JSON.stringify(o) + ';\n';
  const bodies = {
    ROWS: '    var T = [\n' + rows.map((r) => '      ' + JSON.stringify(r) + ',').join('\n') + '\n    ];\n',
    POLICY: table('WITHDRAWN', P.withdrawn) + table('RULE_DOCUMENTED', P.ruleDocumented) + table('FALLBACKS', P.fallbacks)
      + table('FORBIDDEN_SUBSTITUTES', P.forbidden) + table('EQUIVALENTS', P.equivalents) + table('ANSWERS', P.answers),
    'CAMERA GOALS': '    var CAMERA_GOAL = {\n' + goals.map((g) => '      ' + JSON.stringify(g.id) + ': ' + g.src + ',').join('\n') + (goals.length ? '\n' : '') + '    };\n',
  };
  let hostJs = host;
  regions.slice().sort((a, b) => b.from - a.from).forEach((r) => { hostJs = hostJs.slice(0, r.from) + bodies[r.name] + hostJs.slice(r.to); });
  return { [GENERATED_FILES[0]]: modulesJs, [ROWS_HOST]: hostJs, rows, modules };
}

/* ── where each entry is, for the checks that read source: the entry's text and the source of what the dispatch runs
   for it (for a run shared with another spelling, the function the entry names). Located with the parser, not by layout. */
const readRel = (root, rel) => LF(fs.readFileSync(path.join(root, rel), 'utf8'));
const _entries = new Map();
/** [{ file, id, spelling, line, text, row, schema, run, runFile }] — one per entry, in file and entry order; `row`, `schema`
    and `run` are the source of each part (`run` is the function the dispatch runs, wherever the entry names it from) */
export function entrySources(root = HERE_ROOT) {
  if (_entries.has(root)) return _entries.get(root);
  const out = [];
  for (const file of namespaceFiles(root)) {
    const text = readRel(root, file);
    const ast = parseSource(text, { sourceType: 'module' });
    const fns = new Map();
    ast.body.forEach((st) => { const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st; if (d && d.type === 'FunctionDeclaration') fns.set(d.id.name, d); });
    const def = ast.body.find((st) => st.type === 'ExportDefaultDeclaration');
    if (!def || def.declaration.type !== 'ArrayExpression') continue;
    def.declaration.elements.forEach((el) => {
      const prop = (k) => el.properties.find((p) => p.key && (p.key.name === k || p.key.value === k));
      const row = prop('row'), run = prop('run'), sch = prop('schema'), goal = prop('goal');
      if (!row || row.value.type !== 'ArrayExpression') return;
      const id = row.value.elements[0].value, spelling = row.value.elements[1].value;
      let runNode = run ? run.value : null, runFile = file, runText = '';
      if (runNode && runNode.type === 'Identifier') {
        /* a run shared with another spelling — the function the entry names, here or imported */
        const local = fns.get(runNode.name);
        if (local) runNode = local;
        else {
          const imp = ast.body.find((st) => st.type === 'ImportDeclaration' && st.specifiers.some((s) => s.local.name === runNode.name));
          runFile = 'js/' + path.basename(imp.source.value);
          const other = parseSource(readRel(root, runFile), { sourceType: 'module' });
          const nm = runNode.name; runNode = null;
          other.body.forEach((st) => { const d = st.type === 'ExportNamedDeclaration' ? st.declaration : st; if (d && d.type === 'FunctionDeclaration' && d.id.name === nm) runNode = d; });
          runText = runNode ? readRel(root, runFile).slice(runNode.start, runNode.end) : '';
        }
      }
      if (runNode && !runText) runText = text.slice(runNode.start, runNode.end);
      out.push({ file, id, spelling, line: el.loc.start.line, text: text.slice(el.start, el.end), row: text.slice(row.value.start, row.value.end),
        schema: sch ? text.slice(sch.value.start, sch.value.end) : '', run: runText, runStart: runNode ? runNode.start : -1, runFile,
        goalNode: goal ? { node: goal.value, method: !!goal.method, text: text.slice(goal.value.start, goal.value.end) } : null });
    });
  }
  _entries.set(root, out);
  return out;
}

/** every entry's `goal` as source, in registry `order`: [{ id, src }] — the function as written, re-indented to
    where it is copied. A goal that reads a name it does not declare is refused (see freeNames). */
export function goalSources(root = HERE_ROOT, order = null) {
  const out = [], bad = [];
  for (const e of entrySources(root)) {
    if (!e.goalNode) continue;
    const free = freeNames(e.goalNode.node);
    if (free.length) bad.push(e.file + ' ' + e.id + ': its goal reads ' + free.join(', ') + ' — a goal may read only its arguments (a, raw, h)');
    let src = e.goalNode.text;
    if (e.goalNode.method) src = 'function ' + src;
    /* the entry's goal sits at a 4-space property indent; the copy sits at 6 */
    src = src.split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
    out.push({ id: e.id, src });
  }
  if (bad.length) throw new Error(bad.join('; '));
  if (order) out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return out;
}

/** the generated files that disagree with the entries: [{ file, why }] */
export async function stale(root = HERE_ROOT) {
  let want;
  try { want = await expected(root); } catch (e) { return [{ file: KIT, why: e.message }]; }
  const out = [];
  for (const f of GENERATED_FILES) {
    const p = path.join(root, f);
    const have = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (have == null) out.push({ file: f, why: 'missing' });
    else if (LF(have) !== LF(want[f])) out.push({ file: f, why: 'differs from the entries in js/atlas-cap-<namespace>.js' });
  }
  return out;
}

export async function write(root = HERE_ROOT) {
  const want = await expected(root);
  for (const f of GENERATED_FILES) {
    /* keep the line endings the file has on disk (a Windows checkout is CRLF); the comparison ignores CR anyway */
    const p = path.join(root, f), crlf = fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('\r\n');
    fs.writeFileSync(p, crlf ? want[f].replace(/\n/g, '\r\n') : want[f]);
  }
  return want;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? path.resolve(args[ri + 1]) : HERE_ROOT;
  if (args.includes('--write')) {
    const w = await write(root);
    console.log(`atlas-caps: wrote ${GENERATED_FILES[0]} (${Object.keys(w.modules).length} namespaces) and ${GENERATED_FILES[1]} (${w.rows.length} rows)`);
  } else {
    const bad = await stale(root);
    if (bad.length) {
      bad.forEach((b) => console.error(`✗ ${b.file}: ${b.why}`));
      console.error('  → run `node scripts/atlas-caps.mjs --write` (both are generated from the entries)');
      process.exit(1);
    }
    console.log(`atlas-caps: ${GENERATED_FILES.join(' and ')} agree with the entries`);
  }
}
