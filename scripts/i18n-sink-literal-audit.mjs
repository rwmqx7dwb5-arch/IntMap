#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE NOTICE-SINK AUDIT — a bare literal handed straight to a toast
 * ----------------------------------------------------------------------------
 *  Every other surface in scripts/i18n-audit.mjs looks for a translation TUPLE in some shape (a call,
 *  a ternary, an array, an object, an attribute). A string that was never given a tuple of any shape
 *  is invisible to all of them, and the one place that happens is a notice written in a hurry:
 *
 *      imToast('Map not ready')          HOST.aiToast('Turf.js unavailable')
 *
 *  Measured 2026-09-27: four such calls (js/app-body.js, js/playground.js ×2, js/tool-panel.js) —
 *  English to a Japanese reader — while every percentage in the report read 100 % and the gate was
 *  green. The same files' other toasts all went through IntMapLang.
 *
 *  ⚠ THE SINKS ARE DISCOVERED, NOT LISTED (.agents/rules/no-ad-hoc-hardcoding.md §2.4). A sink is any
 *  function whose name ends in `toast`/`Toast` (imToast, aiToast, satToast, showToast, HOST.aiToast,
 *  window.imToast …); a new notice helper named that way is audited the day it is written.
 *  A literal is reported when a reader would READ it: it holds a CJK character, or two or more Latin
 *  letters. Codes and symbols (`'✓'`, `'—'`) are not prose. A template literal with `${…}` is not a
 *  bare literal — its words, if any, are checked by the surfaces that see calls.
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export function sinkLiterals(src) {
  const hits = [];
  const re = /(?<![\w$])((?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*[Tt]oast)\s*\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2\s*[,)]/g;
  let m;
  while ((m = re.exec(src))) {
    const [, sink, q, text] = m;
    if (q === '`' && /\$\{/.test(text)) continue;
    if (!/[぀-ヿ一-鿿]/.test(text) && !/[A-Za-z]{2}/.test(text)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    hits.push({ sink, text, line });
  }
  return hits;
}

export function audit(root = ROOT) {
  const files = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== 'locales' && n !== 'node_modules') walk(p); }
      else if (n.endsWith('.js')) files.push(p);
    }
  })(join(root, 'js'));
  const findings = [];
  for (const f of files) {
    const rel = f.slice(root.length).replace(/\\/g, '/').replace(/^\//, '');
    for (const h of sinkLiterals(readFileSync(f, 'utf8'))) findings.push({ file: rel, ...h });
  }
  return { files: files.length, total: findings.length, findings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = audit();
  if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(r)); }
  else {
    console.log(`notice sinks handed a bare literal: ${r.total} (across ${r.files} js files)`);
    for (const f of r.findings) console.log(`  ${f.file}:${f.line}  ${f.sink}(${JSON.stringify(f.text)})`);
  }
}
