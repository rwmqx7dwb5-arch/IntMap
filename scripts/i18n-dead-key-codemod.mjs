#!/usr/bin/env node
/* ============================================================================
 *  IntMap · DELETE THE ROWS NOTHING CAN ASK FOR   (#R450)
 * ----------------------------------------------------------------------------
 *  The companion to scripts/i18n-dead-key-audit.mjs, in the shape every gate in this family has:
 *  the check names the defect and a command closes it (`i18n-audit.mjs --todo`,
 *  helper-ternary-codemod.mjs, langmap-codemod.mjs). Without one, a gate that finds 413 rows in
 *  nine files is a red light in front of an afternoon of hand-editing, and the next round's answer
 *  to that is to raise a ceiling rather than delete a row.
 *
 *  ⚠ THE PREDICATE IS THE AUDIT'S OWN — `classifier()`, imported — so the tool that removes a row
 *  and the gate that forbids it cannot drift apart ([[intmap-recurring-lessons]] G).
 *
 *  ⚠ IT TOUCHES BOTH SIDES, because deleting the row is only half of it: scripts/i18n-apply-
 *  inline.mjs merges every scripts/i18n/r*.json and scripts/i18n-append-inline.mjs inserts EVERY
 *  key the locale does not already have (no filter, deliberately — its header records why a
 *  regeneration is lossy and a top-up is not). A row removed from a locale and left in a staging
 *  file is one manual command from being back.
 *
 *      node scripts/i18n-dead-key-codemod.mjs           # what it would remove
 *      node scripts/i18n-dead-key-codemod.mjs --write   # …remove it
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { classifier, tableOf, codes } from './i18n-dead-key-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'js', 'locales');
/* ⚠ BOTH staging directories: scripts/i18n/*.json feeds i18n-apply-inline.mjs, and
   scripts/zh/*.json is what scripts/build-ui-zh.mjs rebuilds js/locales/ui.zh.js from. The
   second keys its `ui` rows as «ui:<name>», so the prefix comes off before the question. */
const STAGING = [
  { dir: join(ROOT, 'scripts', 'i18n'), rel: 'scripts/i18n', strip: (k) => k },
  { dir: join(ROOT, 'scripts', 'zh'), rel: 'scripts/zh', strip: (k) => k.replace(/^ui:/, '') },
];
const WRITE = process.argv.includes('--write');
const { verdict } = classifier();

/* ── the locale tables ──────────────────────────────────────────────────────────────────────────
   ⚠ A ROW IS NOT A LINE. The four inline tables write one row per line, but the keyed `ui` tables
   in the five small files pack a dozen keys onto one — so a line-based cut would either leave the
   packed ones behind or take their neighbours with them. Rows that own their line(s) go by line;
   the rest go by character range, one comma with them. */
let rowsCut = 0, linesCut = 0;
for (const code of codes()) {
  const dead = new Set();
  for (const t of ['ui', 'inline']) for (const d of tableOf(code, t)) if (verdict(d.key) === 'dead') dead.add(d.key);
  if (!dead.size) continue;

  const p = join(LOCALES, `ui.${code}.js`);
  const src = readFileSync(p, 'utf8');
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const ast = parse(src, { ecmaVersion: 2022, locations: true });
  const drop = [];
  walk.simple(ast, {
    Property(n) {
      const t = n.key && (n.key.name || n.key.value);
      if ((t !== 'ui' && t !== 'inline') || !n.value || n.value.type !== 'ObjectExpression') return;
      for (const pr of n.value.properties) {
        if (pr.type !== 'Property') continue;
        if (dead.has(pr.key.value != null ? pr.key.value : pr.key.name)) drop.push(pr);
      }
    },
  });

  const lines0 = src.split(nl);
  const killLines = new Set();
  const ranges = [];
  for (const pr of drop) {
    const a = pr.loc.start.line, b = pr.loc.end.line;
    const before = lines0[a - 1].slice(0, pr.loc.start.column);
    const after = lines0[b - 1].slice(pr.loc.end.column);
    if (before.trim() === '' && /^,?[ \t]*$/.test(after)) { for (let i = a; i <= b; i++) killLines.add(i); continue; }
    let s = pr.start, e = pr.end;
    const m = /^[ \t]*,[ \t]*/.exec(src.slice(e));
    if (m) e += m[0].length;
    else { const m2 = /[ \t]*,[ \t]*$/.exec(src.slice(0, s)); if (m2) s -= m2[0].length; }
    ranges.push([s, e]);
  }
  /* the character ranges never contain a newline, so applying them first keeps the line numbers
     collected above valid; then the whole-line rows go, and then the lines a range emptied */
  let out = src;
  for (const [s, e] of ranges.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + out.slice(e);
  const lines1 = out.split(nl);
  if (lines1.length !== lines0.length) throw new Error(`ui.${code}.js: line count moved — a range spanned a newline`);
  const kept = lines1.filter((ln, i) => !killLines.has(i + 1) && !(ln.trim() === '' && lines0[i].trim() !== ''));
  const text = kept.join(nl);
  parse(text, { ecmaVersion: 2022 });                        /* it must still parse */
  rowsCut += drop.length; linesCut += lines0.length - kept.length;
  console.log(`  js/locales/ui.${code}.js  ${String(drop.length).padStart(4)} row(s)  ${String(lines0.length - kept.length).padStart(4)} line(s)  ${src.length} → ${text.length}`);
  if (WRITE) writeFileSync(p, text);
}

/* ── the staging files that would put them back ─────────────────────────────────────────────────
   ⚠ A ROW IS A SPAN HERE TOO — several of these wrap a six-language array over two lines. */
let stageRows = 0, stageFiles = 0;
for (const S of STAGING) {
  if (!existsSync(S.dir)) continue;
  for (const f of readdirSync(S.dir).filter((n) => n.endsWith('.json')).sort()) {
  const p = join(S.dir, f);
  const src = readFileSync(p, 'utf8');
  let obj; try { obj = JSON.parse(src); } catch { continue; }
  const dead = new Set(Object.keys(obj).filter((k) => k !== '_' && verdict(S.strip(k)) === 'dead'));
  if (!dead.size) continue;

  const spans = [];
  let i = src.indexOf('{') + 1, depth = 0, inStr = false, esc = false, keyAt = -1, key = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') {
      if (depth === 0 && key === null) {
        let j = i + 1, s = false, e = -1;
        for (; j < src.length; j++) { if (s) { s = false; continue; } if (src[j] === '\\') { s = true; continue; } if (src[j] === '"') { e = j; break; } }
        key = JSON.parse(src.slice(i, e + 1)); keyAt = i; i = e; continue;
      }
      inStr = true; continue;
    }
    if (c === '{' || c === '[') { depth++; continue; }
    if (c === '}' || c === ']') { if (depth === 0) { if (key !== null) spans.push([key, keyAt, i]); break; } depth--; continue; }
    if (c === ',' && depth === 0 && key !== null) { spans.push([key, keyAt, i + 1]); key = null; continue; }
  }
  const drop = spans.filter(([k]) => dead.has(k));
  let out = src;
  for (const [, a, b] of drop.sort((x, y) => y[1] - x[1])) {
    let s2 = a, e = b;
    const lead = /[ \t]*$/.exec(out.slice(0, s2));            /* the indent in front of the row */
    if (lead) s2 -= lead[0].length;
    const m = /^[ \t]*\r?\n/.exec(out.slice(e));              /* …and its own line break */
    if (m) e += m[0].length;
    out = out.slice(0, s2) + out.slice(e);
  }
  out = out.replace(/,(\s*)\}(\s*)$/, '$1}$2');               /* the last row's dangling comma */
  JSON.parse(out);                                            /* it must still be JSON */
  stageFiles++; stageRows += drop.length;
  console.log(`  ${S.rel}/${f}  ${String(drop.length).padStart(4)} row(s)`);
  if (WRITE) writeFileSync(p, out);
  }
}

console.log(`\n${WRITE ? '' : 'DRY RUN (pass --write) — '}${rowsCut} locale row(s) / ${linesCut} line(s), `
  + `${stageRows} staging row(s) in ${stageFiles} file(s)`);
if (!rowsCut && !stageRows) console.log('nothing to remove — `node scripts/i18n-dead-key-audit.mjs` agrees.');
