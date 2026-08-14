#!/usr/bin/env node
/* ============================================================================
 *  IntMap · APPEND KEYED TRANSLATIONS TO ONE LOCALE FILE, IN PLACE   (#R239)
 * ----------------------------------------------------------------------------
 *  The `ui` half of what scripts/i18n-append-inline.mjs does for `inline`, and for the same reason:
 *  a top-up INSERTS and never rewrites, so a hand-written translation cannot be lost by a tool
 *  ([[intmap-recurring-lessons]] H — #R235's regeneration destroyed 205 of them).
 *  Keys already present are left exactly as they are.
 *
 *      node scripts/i18n-append-keyed.mjs js/locales/ui.fr.js additions.json
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const [, , target, jsonPath] = process.argv;
if (!target || !jsonPath) { console.error('usage: i18n-append-keyed.mjs <ui.xx.js> <additions.json>'); process.exit(2); }

const src = readFileSync(target, 'utf8');
const add = JSON.parse(readFileSync(jsonPath, 'utf8'));
const ast = parse(src, { ecmaVersion: 2022 });

let node = null;
walk.simple(ast, {
  Property(n) {
    const k = n.key.type === 'Literal' ? n.key.value : n.key.name;
    if (k === 'ui' && n.value && n.value.type === 'ObjectExpression') node = n.value;
  },
});
if (!node) { console.error(target + ': no `ui` object'); process.exit(1); }

const have = new Set(node.properties.map((p) => (p.key.type === 'Literal' ? p.key.value : p.key.name)));
const fresh = Object.keys(add).filter((k) => !have.has(k));
if (!fresh.length) { console.log(target + ': nothing new'); process.exit(0); }

const ESC = (s) => JSON.stringify(String(s));
const rows = fresh.map((k) => `      ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : ESC(k)}:${ESC(add[k])},`).join('\n');
const at = node.end - 1;
const before = src.slice(0, at);
const needComma = !/[,{]\s*$/.test(before);
writeFileSync(target, before + (needComma ? ',' : '') + '\n' + rows + '\n    ' + src.slice(at));
console.log(`${target}: +${fresh.length} keyed entries`);
