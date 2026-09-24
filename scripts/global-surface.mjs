/* ============================================================================
 *  IntMap · the global surface, measured  (#R795)
 * ----------------------------------------------------------------------------
 *  How much of the program reaches through one shared object. Two registers:
 *    · HOST     — the members of IM_HOST (js/app-body.js), the object every split-out module is
 *                 handed and reads its closure values through (274 getters at #R795, 52 of them
 *                 writable, plus three attached after the literal);
 *    · WINDOW   — every `window.NAME =` a js/ or src/ file performs (301 IntMap* names at #R795,
 *                 683 names in all).
 *  Neither is a line count. A feature that moves out of the shell but keeps every HOST getter it
 *  read and publishes one more window global has not become independent — it has moved. This is
 *  the instrument that says so, and it replaces the line ceilings tests/r168 #8 (and twenty copies)
 *  held from #R168 to #R795: those measured the shell's LENGTH and produced folded import lines;
 *  this measures the shell's REACH.
 *
 *  THE BASELINE (tests/global-surface-baseline.json) IS RATCHETED BOTH WAYS, like check:perf:
 *    · a name that appears and is not in the baseline FAILS — a new coupling has to be named
 *      (run `--update` and say why in DEV-NOTES), never slipped in;
 *    · a name in the baseline that is gone FAILS too — the baseline has stopped asserting what it
 *      says (#R194's rule: a ceiling raised once and never lowered asserts nothing). `--update`
 *      records the smaller surface, and that commit is the receipt for the migration.
 *  ⚠ The baseline holds NAMES, not counts, so the diff it prints is the exact member or global
 *  that changed — the thing a reviewer needs, rather than "277 → 278".
 *
 *      node scripts/global-surface.mjs            report
 *      node scripts/global-surface.mjs --check    compare with the baseline (exit 1 on any diff)
 *      node scripts/global-surface.mjs --update   rewrite the baseline from the tree
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const BASELINE = join(ROOT, 'tests', 'global-surface-baseline.json');

/* comments and string/template literals blanked, so that prose about `window.X =` is not a publication */
function codeOnly(src) {
  let out = '', i = 0, inBlock = false;
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** The members of IM_HOST, from the parser: literal properties (getter/setter/value, deduplicated)
    plus every later `IM_HOST.name =` in the same file. */
export function hostMembers(root) {
  const src = readFileSync(join(root || ROOT, 'js', 'app-body.js'), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const members = new Set();
  const writable = new Set();
  let found = false;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === 'IM_HOST' && n.init && n.init.type === 'ObjectExpression') {
      found = true;
      for (const p of n.init.properties) {
        if (!p.key) continue;
        const name = p.key.name || p.key.value;
        members.add(name);
        if (p.kind === 'set') writable.add(name);
      }
    }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
      && n.left.object.type === 'Identifier' && n.left.object.name === 'IM_HOST' && n.left.property.name) {
      members.add(n.left.property.name); writable.add(n.left.property.name);
    }
    for (const k of Object.keys(n)) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; walk(n[k]); }
  })(ast);
  if (!found) throw new Error('IM_HOST literal not found in js/app-body.js');
  return { members: Array.from(members).sort(), writable: Array.from(writable).sort() };
}

/** Every name js/ and src/ assign on window. */
export function windowPublications(root) {
  const R = root || ROOT;
  const names = new Map();   /* name → first file */
  for (const dir of ['js', 'src']) {
    const d = join(R, dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((x) => x.endsWith('.js')).sort()) {
      const raw = readFileSync(join(d, f), 'utf8');
      const src = codeOnly(raw);
      for (const m of src.matchAll(/(?<![\w$.])window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) if (!names.has(m[1])) names.set(m[1], dir + '/' + f);
      /* the bracket form names the global INSIDE a string literal, which codeOnly() blanked. The match
         is taken on the blanked text (so comments and prose cannot match) and the name is read back
         from the same offsets of the raw source. */
      for (const m of src.matchAll(/(?<![\w$.])window\[( +)\]\s*=(?!=)/g)) {
        const start = m.index + m[0].indexOf(m[1]);
        const name = raw.slice(start, start + m[1].length).trim().replace(/^['"`]|['"`]$/g, '');
        if (/^[A-Za-z_$][\w$]*$/.test(name) && !names.has(name)) names.set(name, dir + '/' + f);
      }
    }
  }
  return names;
}

export function measure(root) {
  const host = hostMembers(root);
  const win = windowPublications(root);
  return {
    host: host.members,
    hostWritable: host.writable,
    window: Array.from(win.keys()).sort(),
  };
}

function diff(label, before, after) {
  const b = new Set(before), a = new Set(after);
  const added = after.filter((x) => !b.has(x));
  const removed = before.filter((x) => !a.has(x));
  return { label, added, removed };
}

/** @returns {{ok:boolean, lines:string[]}} */
export function check(root) {
  const cur = measure(root);
  if (!existsSync(BASELINE)) return { ok: false, lines: ['no baseline at tests/global-surface-baseline.json — run `node scripts/global-surface.mjs --update`'] };
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const lines = [];
  let ok = true;
  for (const d of [diff('IM_HOST member', base.host || [], cur.host), diff('IM_HOST writable member', base.hostWritable || [], cur.hostWritable), diff('window global', base.window || [], cur.window)]) {
    for (const x of d.added) { ok = false; lines.push(`  + ${d.label} ${x}  — new coupling: name it (DEV-NOTES) and run --update, or route it through the module's own dependencies`); }
    for (const x of d.removed) { ok = false; lines.push(`  − ${d.label} ${x}  — gone: run --update so the baseline records the smaller surface`); }
  }
  lines.unshift(`global surface: IM_HOST ${cur.host.length} members (${cur.hostWritable.length} writable) · window ${cur.window.length} names` + (ok ? ' — matches the baseline' : ''));
  return { ok, lines };
}

if (process.argv[1] && process.argv[1].endsWith('global-surface.mjs')) {
  const arg = process.argv[2];
  if (arg === '--update') {
    const cur = measure();
    writeFileSync(BASELINE, JSON.stringify({ '//': 'written by scripts/global-surface.mjs --update — names, not counts, so a diff names the member that changed', ...cur }, null, 1) + '\n');
    console.log(`baseline written: IM_HOST ${cur.host.length} (${cur.hostWritable.length} writable) · window ${cur.window.length}`);
  } else if (arg === '--check') {
    const r = check();
    for (const l of r.lines) (r.ok ? console.log : console.error)(l);
    process.exit(r.ok ? 0 : 1);
  } else {
    const cur = measure();
    console.log(`IM_HOST: ${cur.host.length} members, ${cur.hostWritable.length} writable`);
    console.log(`window:  ${cur.window.length} names published by js/ and src/`);
    const im = cur.window.filter((n) => /^IntMap/.test(n)).length;
    console.log(`         ${im} of them IntMap*`);
  }
}
