#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/layer-packages.mjs — js/data-layers.js only gets SMALLER  (layer-packages)
 * ----------------------------------------------------------------------------
 *  Measured 2026-10-02 (a925952e): js/data-layers.js was 6,108 lines, made 119 assignments to a `window.*` property
 *  (parsed; 334 lines mention `window.`) and switched 29 rows by name in toggleLayer and setLayerOpacity — the conflict of choice of this
 *  repository (changed 128 times since August). A layer was a declaration (js/layers/<id>.js) PLUS a branch
 *  in that function, a slider case, legend tables and a block of closure code somewhere in 6,000 lines.
 *
 *  A LAYER PACKAGE is the other half of the declaration: js/layer-pkg-<pkg>.js, named by the declaration's
 *  `pkg`, implements every row that names it — switch, opacity and everything behind them — and
 *  js/data-layers.js reaches it through ONE path (`_pkgSwitch` / `_pkgOpacity`, loaded on first use). This
 *  file is the rule that makes that the only direction the code can move:
 *
 *    · THE ROWS js/data-layers.js STILL SWITCHES BY NAME are listed in tests/data-layers-baseline.json
 *      (`branches`: every `id === '<name>'` inside toggleLayer and setLayerOpacity). A name that is not on
 *      the list fails — a new row is a package, not a new branch — and so does a name whose declaration
 *      has a `pkg` (one row, two implementations).
 *    · THE SIZE — lines, and assignments to a property of `window` (parsed: `window.x = …`, `window.x ||= …`)
 *      — may only go down. More than the ledger fails; FEWER fails too until `--update` records it, because
 *      a ceiling that does not follow the floor asserts nothing (#R194, the rule every ledger here keeps).
 *    · `--update` lowers; it refuses to raise anything or to add a branch.
 *
 *      node scripts/layer-packages.mjs            report
 *      node scripts/layer-packages.mjs --check    compare with the ledger (exit 1 on any difference)
 *      node scripts/layer-packages.mjs --update   lower the ledger to the tree (never raises)
 *  scripts/static-checks.mjs runs the comparison as its `layer-packages` rule — a rule there and not a
 *  check:* of its own because the gate list in .agents/rules/execution-strategy.md has no room for another.
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const LEDGER_REL = 'tests/data-layers-baseline.json';
const TARGET_REL = 'js/data-layers.js';
/** the functions whose `id === '<name>'` tests ARE the per-row dispatch */
const DISPATCH = Object.freeze(['toggleLayer', 'setLayerOpacity']);

const SKIP = new Set(['type', 'start', 'end', 'loc', 'range']);
function walk(n, f, parent) {
  if (!n || typeof n.type !== 'string') return;
  f(n, parent);
  for (const k of Object.keys(n)) {
    if (SKIP.has(k)) continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, f, n)); else if (v && typeof v.type === 'string') walk(v, f, n);
  }
}

/** what js/data-layers.js is, measured: lines, window assignments, the row names its dispatch switches on */
export function measure(src) {
  const text = String(src).replace(/\r\n/g, '\n');
  const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  let windowAssignments = 0;
  const branches = new Set();
  walk(ast, (n) => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' && n.left.object.name === 'window') windowAssignments++;
    if (n.type === 'FunctionDeclaration' && n.id && DISPATCH.includes(n.id.name)) {
      const p = n.params[0] && n.params[0].type === 'Identifier' ? n.params[0].name : 'id';
      walk(n.body, (m) => {
        if (m.type !== 'BinaryExpression' || (m.operator !== '===' && m.operator !== '==')) return;
        const [a, b] = [m.left, m.right];
        const lit = (x) => x.type === 'Literal' && typeof x.value === 'string';
        if (a.type === 'Identifier' && a.name === p && lit(b)) branches.add(b.value);
        else if (b.type === 'Identifier' && b.name === p && lit(a)) branches.add(a.value);
      });
    }
  });
  return { lines, windowAssignments, branches: [...branches].sort() };
}

/** the short names (`key`) of every row whose declaration names a package */
export async function packagedKeys(root = DEFAULT_ROOT) {
  const dir = join(root, 'js', 'layers');
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('_')).sort()) {
    const d = (await import(pathToFileURL(join(dir, f)).href)).default;
    if (d && d.pkg) for (const k of [d.key, d.id && d.id.replace(/^dl-/, '')].filter(Boolean)) out.set(k, d);
  }
  return out;
}

/** every difference between the tree and the ledger, as sentences (empty = the rule holds) */
export async function check(root = DEFAULT_ROOT, ledgerPath) {
  const P = ledgerPath || join(root, LEDGER_REL);
  const out = [];
  if (!existsSync(P)) return [`no ledger at ${LEDGER_REL} — run: node scripts/layer-packages.mjs --update`];
  const L = JSON.parse(readFileSync(P, 'utf8'));
  const m = measure(readFileSync(join(root, TARGET_REL), 'utf8'));
  const up = 'node scripts/layer-packages.mjs --update';
  for (const [k, what] of [['lines', 'lines'], ['windowAssignments', 'assignments to window.*']]) {
    if (m[k] > L[k]) out.push(`${TARGET_REL}: ${m[k]} ${what}, the ledger allows ${L[k]} — it only gets smaller: put the new code in a layer package (js/layers/<id>.js \`pkg\` → js/layer-pkg-<pkg>.js) or take as much out`);
    else if (m[k] < L[k]) out.push(`${TARGET_REL}: ${m[k]} ${what}, the ledger still says ${L[k]} — lower it: ${up}`);
  }
  const known = new Set(L.branches || []);
  for (const b of m.branches) if (!known.has(b)) out.push(`${TARGET_REL}: toggleLayer / setLayerOpacity switch the row \`${b}\` by name, and no such branch is on the ledger — a row's implementation is a layer package now (js/layers/<id>.js \`pkg\`), not a new branch here`);
  for (const b of known) if (!m.branches.includes(b)) out.push(`${TARGET_REL}: the branch \`${b}\` is gone from toggleLayer / setLayerOpacity and is still on the ledger — lower it: ${up}`);
  const pk = await packagedKeys(root);
  for (const b of m.branches) if (pk.has(b)) out.push(`${TARGET_REL}: \`${b}\` is implemented by js/layer-pkg-${pk.get(b).pkg}.js (${pk.get(b).id} \`pkg\`) and STILL switched by name here — one row, two implementations`);
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const P = join(DEFAULT_ROOT, LEDGER_REL);
  const m = measure(readFileSync(join(DEFAULT_ROOT, TARGET_REL), 'utf8'));
  if (argv.includes('--update')) {
    const L = existsSync(P) ? JSON.parse(readFileSync(P, 'utf8')) : null;
    if (L) {
      const raised = ['lines', 'windowAssignments'].filter((k) => m[k] > L[k]);
      const added = m.branches.filter((b) => !(L.branches || []).includes(b));
      if (raised.length || added.length) {
        console.error('layer-packages: refusing to raise the ledger (' + raised.concat(added.map((b) => 'branch ' + b)).join(', ') + ') — it only goes down');
        process.exit(1);
      }
    }
    /* ⚠ UNLINK, THEN WRITE: in a scratch copy (tests/helpers/scratch-tree.mjs) every file is a hard link into the
       checkout, and an in-place write would lower the real ledger (docs/TESTING.md, the same rule the descriptor index keeps) */
    try { unlinkSync(P); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    writeFileSync(P, JSON.stringify({
      '//': 'written by scripts/layer-packages.mjs --update — the size of js/data-layers.js and the rows it still switches by name; only ever lowered (check:static `layer-packages`)',
      lines: m.lines, windowAssignments: m.windowAssignments, branches: m.branches,
    }, null, 2) + '\n');
    console.log('layer-packages: ledger at ' + m.lines + ' lines, ' + m.windowAssignments + ' window assignments, ' + m.branches.length + ' rows switched by name');
  } else if (argv.includes('--check')) {
    const p = await check();
    if (p.length) { for (const l of p) console.error('✗ ' + l); process.exit(1); }
    console.log('layer-packages: OK — ' + m.lines + ' lines, ' + m.windowAssignments + ' window assignments, ' + m.branches.length + ' rows switched by name');
  } else {
    console.log(JSON.stringify(m, null, 1));
  }
}
