#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE KEYED TABLE, WHEREVER IT IS WRITTEN   (#R239)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHY THIS IS NOT `scripts/i18n-report.mjs`'s KEYED COLUMN. That column counts each language
 *  against the keys `js/locales/ui.en.js` HAS — and the keyed table is not one file. Six other
 *  files add to it at run time, because a feature that arrives in a later round adds its strings
 *  beside itself:
 *
 *      js/i18n-late.js      92 keys   Settings: engine, tilt, day/night, ticker, accent, Support…
 *      js/data-layers.js    …         the layer panel's own labels
 *      js/wheel-zoom.js     …         the navigation-sensitivity settings
 *      js/workspace.js      …         workspace mode
 *      js/app-body.js  ·  js/premium-plan.js
 *
 *  Every one of them is `Object.assign(i18n.en,{…})` … `Object.assign(i18n.es,{…})` — FIVE
 *  languages by construction, written when there were five. js/i18n.js makes every other table
 *  `Object.create(en)`, so a key those files never gave to fr / ko / zh does not go `undefined`:
 *  it silently renders **in English**, for ever, and the keyed column reports 100 % because the
 *  key was never in ui.en.js to be counted.
 *
 *  Measured the first time this ran: **fr and ko had 5 of the 92 late keys; de / ru / es had 82.**
 *  The Support dialog, the data-source modal, the screenshot messages and most of the Settings
 *  panel have been shipping in English in four languages, invisibly, since the rounds that added
 *  them. That is [[intmap-recurring-lessons]] B — the instrument's 100 % was 100 % of what the
 *  instrument looked at.
 *
 *  ⚠ SO THE KEY UNIVERSE IS EVERY KEY ANY DECLARATION SITE MENTIONS, and a language covers it when
 *  IT declares the key anywhere — its own locale file being the one place a NEW language ever has
 *  to write (an own property beats the English prototype, js/i18n.js). Which is why the answer to
 *  「言語追加が完璧に100%になる仕組み」 is this measurement plus `scripts/i18n-new-language.mjs`,
 *  and NOT a migration of the six files: their English and Japanese belong beside their feature.
 *
 *      node scripts/i18n-keyed-audit.mjs                # per language
 *      node scripts/i18n-keyed-audit.mjs --missing ko   # the keys ko has no entry for, with English
 *      node scripts/i18n-keyed-audit.mjs --json         # for scripts/i18n-audit.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const LOCALES = join(JS, 'locales');

export function codes() {
  return JSON.parse(/window\.IntMapLangCodes\s*=\s*(\[[^\]]*\])/
    .exec(readFileSync(join(LOCALES, '_langs.js'), 'utf8'))[1]);
}

/* ── ① the locale files ─────────────────────────────────────────────────────────────────────── */
function localeKeys(code) {
  const p = join(LOCALES, `ui.${code}.js`);
  const out = new Map();
  if (!existsSync(p)) return out;
  const ast = parse(readFileSync(p, 'utf8'), { ecmaVersion: 2022 });
  const src = readFileSync(p, 'utf8');
  walk.simple(ast, {
    Property(n) {
      if (!(n.key && (n.key.name === 'ui' || n.key.value === 'ui') && n.value && n.value.type === 'ObjectExpression')) return;
      n.value.properties.forEach((pr) => {
        if (pr.type !== 'Property') return;
        out.set(pr.key.name != null ? pr.key.name : pr.key.value,
          pr.value.type === 'Literal' ? pr.value.value : src.slice(pr.value.start, pr.value.end));
      });
    },
  });
  return out;
}

/* ── ② every `Object.assign(i18n.<code>, { … })` anywhere under js/ ─────────────────────────── */
/* ⚠ PARSED, NOT GREPPED, for the same reason every other instrument here parses: `i18n.de` inside a
   comment or a string is not a declaration, and a round that adds a sixth site must be seen without
   anybody adding it to a list. The alias `jp` → `ja` is folded in because js/i18n.js resolves both. */
function assignedKeys() {
  const out = new Map();                       /* code -> Map(key -> value) */
  const put = (c, k, v) => { if (!out.has(c)) out.set(c, new Map()); out.get(c).set(k, v); };
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(JS, f), 'utf8');
    if (src.indexOf('i18n.') < 0) continue;
    let ast;
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' }); }
    catch (e) { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' }); } catch (e2) { continue; } }
    walk.simple(ast, {
      CallExpression(n) {
        if (!(n.callee.type === 'MemberExpression' && !n.callee.computed
          && n.callee.object.name === 'Object' && n.callee.property.name === 'assign')) return;
        const t = n.arguments[0], o = n.arguments[1];
        if (!t || t.type !== 'MemberExpression' || t.computed) return;
        if (!(t.object.name === 'i18n' || t.object.name === 'I18N')) return;
        if (!o || o.type !== 'ObjectExpression') return;
        const code = (t.property.name === 'ja' ? 'jp' : t.property.name);
        for (const pr of o.properties) {
          if (pr.type !== 'Property') continue;
          put(code, pr.key.name != null ? pr.key.name : pr.key.value,
            pr.value.type === 'Literal' ? pr.value.value : src.slice(pr.value.start, pr.value.end));
        }
      },
    });
  }
  return out;
}

/* ── ③ the keys the MARKUP asks for ─────────────────────────────────────────────────────────── */
export function htmlKeys() {
  const keys = new Set();
  for (const f of readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const re = /data-i18n(?:-(?:ph|title|html))?="([^"]+)"/g;
    let m; while ((m = re.exec(src))) keys.add(m[1]);
  }
  return keys;
}

export function survey() {
  const all = codes();
  const asg = assignedKeys();
  const table = new Map();                     /* code -> Map(key -> value) */
  for (const c of all) {
    const m = new Map(localeKeys(c));
    for (const [k, v] of (asg.get(c) || new Map())) if (!m.has(k)) m.set(k, v);
    table.set(c, m);
  }
  /* ⚠ THE UNIVERSE IS WHAT ENGLISH DECLARES, PLUS WHAT THE MARKUP ASKS FOR — NOT the union over
     every language. Measured on the first cut, which did take the union: it came to 464 keys, three
     of which (`lyrGrpGeo`, `lyrGrpStrat`, `lyrOceanCur`) exist ONLY in translations, because the
     layer groups they named were removed in #R225 and the German/Spanish/Russian rows outlived
     them. Counting those would make English 99.4 % «complete» against strings no screen can ask
     for — an instrument that reports work nobody should do is as useless as one that hides work
     somebody must. They are reported as STALE instead, which is what they are. */
  const english = table.get('en') || new Map();
  const html = htmlKeys();
  const universe = new Set(english.keys());
  const undeclared = [...html].filter((k) => !universe.has(k)).sort();
  for (const k of html) universe.add(k);
  const stale = {};
  for (const [c, m] of table) {
    const s = [...m.keys()].filter((k) => !universe.has(k)).sort();
    if (s.length) stale[c] = s;
  }
  return { all, table, universe: [...universe].sort(), undeclared, stale, english };
}

function main() {
  const { all, table, universe, undeclared, stale, english } = survey();

  const wantMissing = process.argv.indexOf('--missing');
  if (wantMissing >= 0) {
    const c = process.argv[wantMissing + 1];
    const have = table.get(c) || new Map();
    const gaps = universe.filter((k) => !have.has(k));
    console.error(`${c}: ${gaps.length} of ${universe.length} keyed strings have no entry`);
    for (const k of gaps) console.log(`${k}\t${JSON.stringify(english.get(k) ?? '')}`);
    return;
  }

  const rows = all.map((c) => {
    const have = table.get(c) || new Map();
    return { code: c, have: universe.filter((k) => have.has(k)).length, want: universe.length };
  });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ surface: 'keyed', want: universe.length, rows, undeclared, stale }));
    return;
  }
  console.log(`keyed UI strings declared anywhere in the app: ${universe.length}\n`);
  for (const r of rows) console.log(`${r.code.padEnd(9)}${String(r.have).padStart(5)}/${r.want}  ${(100 * r.have / r.want).toFixed(1)}%`);
  for (const [c, s] of Object.entries(stale)) console.log(`\n${c}: ${s.length} stale key(s) no screen asks for — ${s.join(' ')}`);
  if (undeclared.length) {
    console.log(`\n⚠ data-i18n keys in HTML that NO language declares (they render their hard-coded English): ${undeclared.length}`);
    for (const k of undeclared) console.log('    ' + k);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/i18n-keyed-audit.mjs')) main();
