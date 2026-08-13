#!/usr/bin/env node
/* ============================================================================
 *  IntMap · APPEND INLINE TRANSLATIONS TO ONE LOCALE FILE, IN PLACE   (#R235)
 * ----------------------------------------------------------------------------
 *  ⚠⚠ WHY THIS EXISTS AND WHY THE DOCUMENTED zh FLOW IS NOT USED FOR TOP-UPS.
 *  scripts/build-ui-zh.mjs documents `rm ui.zh.js` → `--template zh` → rebuild. That flow is
 *  LOSSY, and it was measured: running it to add eleven strings took ui.zh.js from 2,082 translated
 *  inline entries to 1,877 — 205 translations destroyed — because scripts/zh/*.json is NOT the
 *  complete source of that file (197 authored entries no longer match a key, and a large block of
 *  the file's translations exist only in the file). The regeneration was reverted.
 *
 *  So a top-up INSERTS into the existing `inline` object and never rewrites it. Keys already
 *  present are left alone; only genuinely new English keys are added. Nothing can be lost.
 *
 *      node scripts/i18n-append-inline.mjs js/locales/ui.fr.js additions.json
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const [, , target, jsonPath] = process.argv;
if (!target || !jsonPath) { console.error('usage: i18n-append-inline.mjs <ui.xx.js> <additions.json>'); process.exit(2); }

const src = readFileSync(target, 'utf8');
const add = JSON.parse(readFileSync(jsonPath, 'utf8'));
const ast = parse(src, { ecmaVersion: 2022 });

let node = null;
walk.simple(ast, {
  Property(n) {
    const k = n.key.type === 'Literal' ? n.key.value : n.key.name;
    if (k === 'inline' && n.value && n.value.type === 'ObjectExpression') node = n.value;
  },
});
if (!node) { console.error(target + ': no `inline` object'); process.exit(1); }

const have = new Set(node.properties.map((p) => (p.key.type === 'Literal' ? p.key.value : p.key.name)));
const fresh = Object.keys(add).filter((k) => !have.has(k));
if (!fresh.length) { console.log(target + ': nothing new'); process.exit(0); }

/* insert before the object's closing brace, preserving whatever line ending the file uses */
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const q = (s) => JSON.stringify(s);
const body = fresh.map((k) => `  ${q(k)}: ${q(add[k])},`).join(eol);
/* ⚠ THE INSERTION POINT IS *AFTER* ANY TRAILING COMMA, NOT BEFORE IT. acorn's `last.end` is the end
   of the last PROPERTY, and these files are written with a trailing comma — so inserting at
   `last.end` lands between `"Tsunami":"海嘯"` and its own comma and yields `"海嘯" "out of range":…`,
   which parses as nothing. Skip whitespace and comments to the first real character; if it is a
   comma, step past it and add none of our own. */
const last = node.properties.length ? node.properties[node.properties.length - 1] : null;
let at = last ? last.end : node.start + 1;
const skip = () => { for (;;) {
  const c = src.slice(at, node.end);
  const ws = /^\s+/.exec(c); if (ws) { at += ws[0].length; continue; }
  if (c.startsWith('//')) { const nl = c.indexOf('\n'); at += (nl < 0 ? c.length : nl + 1); continue; }
  if (c.startsWith('/*')) { const e = c.indexOf('*/'); at += (e < 0 ? c.length : e + 2); continue; }
  return c;
} };
let comma = ',';
if (last) { const rest = skip(); if (rest.startsWith(',')) { at += 1; comma = ''; } }
const out = src.slice(0, at) + comma + eol + body + src.slice(at);
writeFileSync(target, out);
console.log(target + ': +' + fresh.length + ' inline entries');
