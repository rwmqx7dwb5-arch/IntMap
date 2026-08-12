#!/usr/bin/env node
/* ============================================================================
 *  IntMap · TRANSLATION COVERAGE + NEW-LANGUAGE TEMPLATE   (#R221)
 * ----------------------------------------------------------------------------
 *  「今後、対応言語をさらに増やしていく方針です。容易に言語を追加できるように準備しておいて。」
 *
 *  There are TWO bodies of translatable text in this app and they have different shapes, so a
 *  translator needs both of them listed or the job is guesswork:
 *
 *    ① THE KEYED TABLE — js/locales/ui.<code>.js. Settings, tabs, layer names, the long tail of
 *       static UI. Missing keys fall back to English per key (js/i18n.js), so a translation can be
 *       delivered a screen at a time.
 *    ② THE INLINE STRINGS — the first argument of every `L(…)` call in js/*.js. Panels and legends
 *       write their translations at the point of use, which is why there are 2,000-odd of them. A
 *       language whose index is past the five positional arguments answers from the `inline` table
 *       in its locale file, KEYED BY THE ENGLISH STRING.
 *
 *      node scripts/i18n-report.mjs                 # coverage for every registered language
 *      node scripts/i18n-report.mjs --template zh   # write js/locales/ui.zh.js, ready to translate
 *
 *  ⚠ THE INLINE STRINGS ARE FOUND BY PARSING, NOT BY REGEX. A call is counted only when it is a
 *  CallExpression whose callee is one of the helper names bound to IntMapLang.pick() in that file
 *  and whose first argument is a plain string literal — so a comment that mentions L('…'), or a
 *  template literal with a runtime value in it, is not mistaken for a translatable string.
 * ==========================================================================*/
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const LOCALES = join(JS, 'locales');

/* ── the registry, read as source (it is a browser file, not a module) ───────────────────────── */
function langs() {
  const src = readFileSync(join(JS, 'lang-registry.js'), 'utf8');
  const m = src.match(/var LANGS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('LANGS not found in js/lang-registry.js');
  const out = [];
  const re = /\{\s*code:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'/g;
  let g; while ((g = re.exec(m[1]))) out.push({ code: g[1], label: g[2] });
  return out;
}

/* ── ① the keyed tables ─────────────────────────────────────────────────────────────────────── */
function keyedTable(code) {
  const p = join(LOCALES, `ui.${code}.js`);
  if (!existsSync(p)) return null;
  const src = readFileSync(p, 'utf8');
  const keys = new Set();
  /* the file is one call: IntMapLang.define('xx', { ui: { … } }). Parse it and read the ui object's
     property names — no eval, and a syntax error is reported rather than swallowed. */
  const ast = parse(src, { ecmaVersion: 2022 });
  walk.simple(ast, {
    Property(n) {
      if (n.key && (n.key.name === 'ui' || n.key.value === 'ui') && n.value && n.value.type === 'ObjectExpression') {
        n.value.properties.forEach((pr) => {
          if (pr.type !== 'Property') return;
          keys.add(pr.key.name || pr.key.value);
        });
      }
    },
  });
  return keys;
}
function inlineTable(code) {
  const p = join(LOCALES, `ui.${code}.js`);
  if (!existsSync(p)) return new Set();
  const src = readFileSync(p, 'utf8');
  const keys = new Set();
  const ast = parse(src, { ecmaVersion: 2022 });
  walk.simple(ast, {
    Property(n) {
      if (n.key && (n.key.name === 'inline' || n.key.value === 'inline') && n.value && n.value.type === 'ObjectExpression') {
        n.value.properties.forEach((pr) => {
          if (pr.type !== 'Property') return;
          keys.add(pr.key.value != null ? pr.key.value : pr.key.name);
        });
      }
    },
  });
  return keys;
}

/* ── ② the inline strings, from the source ──────────────────────────────────────────────────── */
function inlineStrings() {
  const out = new Map();                    /* English string → [file…] */
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(JS, f), 'utf8');
    /* ⚠ (#R223) NO SUBSTRING PRE-FILTER. It used to skip any file that did not contain one of four
       spellings, and js/ocean-currents.js spells it `const { …, onRestyle, L } = W;` — none of the
       four. The whole module was therefore invisible to this report AND to the template it writes,
       so a new language rendered every one of its strings in English while the report said 100 %.
       Parsing 130 files costs a fraction of a second; guessing costs a silent gap. */
    let ast;
    try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script' }); }
    catch (e) { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module' }); } catch (e2) { continue; } }
    /* which identifiers in THIS file are language helpers */
    const names = new Set(['L']);
    walk.simple(ast, {
      VariableDeclarator(n) {
        if (!n.id || n.id.type !== 'Identifier' || !n.init) return;
        const t = src.slice(n.init.start, n.init.end);
        if (t.indexOf('IntMapLang.pick') >= 0) names.add(n.id.name);
      },
      Property(n) {
        /* `const { L } = W;` style destructuring of the shared toolkit */
        if (n.key && n.key.name === 'L') names.add(n.value && n.value.name ? n.value.name : 'L');
      },
    });
    walk.simple(ast, {
      CallExpression(n) {
        if (!n.callee || n.callee.type !== 'Identifier' || !names.has(n.callee.name)) return;
        const a = n.arguments[0];
        if (!a || a.type !== 'Literal' || typeof a.value !== 'string' || !a.value.trim()) return;
        if (!out.has(a.value)) out.set(a.value, []);
        const arr = out.get(a.value); if (arr.indexOf(f) < 0) arr.push(f);
      },
    });
  }
  return out;
}

const ESC = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

function main() {
  const rows = langs();
  const en = keyedTable('en');
  const inline = inlineStrings();
  const wantTemplate = process.argv.indexOf('--template');

  if (wantTemplate >= 0) {
    const code = process.argv[wantTemplate + 1];
    if (!code || !/^[a-z]{2}(-[a-z]{2})?$/i.test(code)) { console.error('usage: --template <code>'); process.exit(1); }
    const p = join(LOCALES, `ui.${code}.js`);
    if (existsSync(p)) { console.error(`${p} already exists — refusing to overwrite a translation`); process.exit(1); }
    const enSrc = readFileSync(join(LOCALES, 'ui.en.js'), 'utf8');
    const uiBody = enSrc.slice(enSrc.indexOf('{ ui: {') + 7, enSrc.lastIndexOf('} });'));
    const lines = [];
    lines.push('/* ============================================================================');
    lines.push(` *  IntMap · UI STRINGS — ${code}   (generated by scripts/i18n-report.mjs)`);
    lines.push(' * ----------------------------------------------------------------------------');
    lines.push(' *  TRANSLATE THE VALUES, NOT THE KEYS. Anything left in English simply falls back to');
    lines.push(' *  English at runtime, per string, so this file can be delivered a section at a time.');
    lines.push(' *');
    lines.push(' *  Then two more edits and the language is live:');
    lines.push(` *    · js/lang-registry.js  — append { code: '${code}', label: '<its own name>', html: '${code}' } to LANGS`);
    lines.push(` *    · src/main.js          — import '../js/locales/ui.${code}.js'; beside the others`);
    lines.push(' * ========================================================================== */');
    lines.push(`window.IntMapLang.define('${code}', {`);
    lines.push('  /* ① the keyed table — Settings, tabs, layer names, the static UI */');
    lines.push('  ui: {' + uiBody + '},');
    lines.push('  /* ② the inline strings — every L(…) call site in js/*.js, keyed by its English text.');
    lines.push(`     ${inline.size} of them. A key left untranslated renders in English. */`);
    lines.push('  inline: {');
    for (const [s, files] of [...inline.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`    ${ESC(s)}: ${ESC(s)},   /* ${files.slice(0, 3).join(' ')} */`);
    }
    lines.push('  }');
    lines.push('});');
    writeFileSync(p, lines.join('\n') + '\n');
    console.log(`wrote ${p} — ${en.size} keyed strings + ${inline.size} inline strings to translate`);
    return;
  }

  console.log(`Inline L(…) strings in js/: ${inline.size}`);
  console.log(`Keyed UI strings (English): ${en.size}\n`);
  console.log('code   keyed          inline');
  for (const r of rows) {
    const k = keyedTable(r.code);
    const i = inlineTable(r.code);
    const kn = r.code === 'en' ? en.size : (k ? [...k].filter((x) => en.has(x)).length : 0);
    const positional = rows.findIndex((x) => x.code === r.code) < 5;
    const inTxt = positional ? 'n/a (positional)' : `${i.size}/${inline.size}  ${(100 * i.size / Math.max(1, inline.size)).toFixed(0)}%`;
    console.log(`${r.code.padEnd(6)} ${String(kn).padStart(4)}/${en.size}  ${((100 * kn) / en.size).toFixed(0).padStart(3)}%   ${inTxt}`);
  }
  console.log('\n"positional" = one of the first five languages, whose translations live as arguments');
  console.log('at each L(…) call site rather than in an inline table (see js/lang-registry.js).');
}

main();
