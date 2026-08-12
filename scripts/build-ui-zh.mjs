#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ASSEMBLE js/locales/ui.zh.js FROM THE AUTHORED TRANSLATIONS  (#R223)
 * ----------------------------------------------------------------------------
 *  「繁体を追加して。(beta)」 The translation itself lives in scripts/zh/*.json — small, reviewable
 *  files keyed by the ENGLISH STRING (or "ui:<key>" for the keyed table) — and this rebuilds the
 *  locale file from them plus a fresh template:
 *
 *      rm js/locales/ui.zh.js
 *      node scripts/i18n-report.mjs --template zh     # the template, with every string found today
 *      node scripts/build-ui-zh.mjs                   # …with the translations merged in
 *
 *  Keeping the translation separate from the generated file is what makes it possible to re-run the
 *  scanner after it learns about more strings (it did: #R223 removed a pre-filter that had been
 *  hiding a whole module) without hand-editing 2,000 lines.
 * ==========================================================================*/
/* Merge the authored zh-Hant translations into js/locales/ui.zh.js.
   Reads the generated template (which carries the English in both tables and the /* file *​/ notes)
   and replaces each value with the translation when one exists. Anything untranslated stays English,
   which is exactly what the runtime falls back to anyway. */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'js', 'locales', 'ui.zh.js');
const DIR = join(ROOT, 'scripts', 'zh');

const T = {};
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
  const o = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const k of Object.keys(o)) T[k] = o[k];
}

const src = readFileSync(SRC, 'utf8');
const ast = parse(src, { ecmaVersion: 2022 });

/* ⚠ EVERY KEY IS THE ENGLISH STRING ITSELF (or "ui:<key>" for the keyed table). An earlier version
   of this script also accepted "#<index>" into the template's inline order, which was a trap: the
   moment the scanner found 65 more strings, every index after the first new one pointed at a
   DIFFERENT string and the translations silently shifted. Positions are not identities. */
for (const k of Object.keys(T)) {
  if (k[0] === '#') { console.error('index keys are not accepted — key by the English string: ' + k); process.exit(1); }
}
const edits = [];
let uiN = 0, inN = 0, uiHit = 0, inHit = 0;
walk.simple(ast, {
  Property(n) {
    const k = n.key && (n.key.name || n.key.value);
    if ((k === 'ui' || k === 'inline') && n.value && n.value.type === 'ObjectExpression') {
      n.value.properties.forEach((pr) => {
        if (pr.type !== 'Property' || pr.value.type !== 'Literal') return;
        const key = pr.key.value != null ? pr.key.value : pr.key.name;
        const lookup = (k === 'ui') ? ('ui:' + key) : key;
        if (k === 'ui') uiN++; else inN++;
        const v = T[lookup];
        if (v == null) return;
        if (k === 'ui') uiHit++; else inHit++;
        edits.push([pr.value.start, pr.value.end, JSON.stringify(String(v))]);
      });
    }
  },
});
edits.sort((a, b) => b[0] - a[0]);
let out = src;
for (const [s, e, v] of edits) out = out.slice(0, s) + v + out.slice(e);
/* keys the template never had — the i18n entries modules register at RUN TIME with
   Object.assign(i18n.en, …), and inline strings in files the old scanner skipped. Appended to the
   right table rather than dropped, because "not in the template" is not "not on screen". */
const addUi = [], addIn = [];
const uiHas = new Set(), inHas = new Set();
walk.simple(ast, {
  Property(n) {
    const k = n.key && (n.key.name || n.key.value);
    if (k === 'ui' && n.value.type === 'ObjectExpression') n.value.properties.forEach((pr) => { if (pr.type === 'Property') uiHas.add(pr.key.name || pr.key.value); });
    if (k === 'inline' && n.value.type === 'ObjectExpression') n.value.properties.forEach((pr) => { if (pr.type === 'Property') inHas.add(pr.key.value != null ? pr.key.value : pr.key.name); });
  },
});
for (const k of Object.keys(T)) {
  if (k.startsWith('ui:')) { const kk = k.slice(3); if (!uiHas.has(kk)) addUi.push('    ' + JSON.stringify(kk) + ':' + JSON.stringify(String(T[k])) + ','); }
  else if (!inHas.has(k)) addIn.push('    ' + JSON.stringify(k) + ':' + JSON.stringify(String(T[k])) + ',');
}
function appendTo(text, marker, lines) {
  if (!lines.length) return text;
  const i = text.indexOf(marker); if (i < 0) throw new Error('marker not found: ' + marker);
  const j = text.indexOf('\n', i);
  return text.slice(0, j + 1) + lines.join('\n') + '\n' + text.slice(j + 1);
}
out = appendTo(out, '  ui: {', addUi);
out = appendTo(out, '  inline: {', addIn);
writeFileSync(SRC, out);
if (addUi.length || addIn.length) console.log(`appended: ui +${addUi.length}, inline +${addIn.length}`);
console.log(`ui ${uiHit}/${uiN}  inline ${inHit}/${inN}  (${((uiHit + inHit) / (uiN + inN) * 100).toFixed(1)}% translated)`);
const missing = Object.keys(T).length - (uiHit + inHit);
if (missing > 0) console.log(`⚠ ${missing} authored entries did not match a key in the template`);
