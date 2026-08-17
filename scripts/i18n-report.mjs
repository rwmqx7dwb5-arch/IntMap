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
import { parseAll, context, shapeOf } from './i18n-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const LOCALES = join(JS, 'locales');

/* ── the registry, read as source (it is a browser file, not a module) ───────────────────────── */
/* ⚠ (#R232) THE LANGUAGE LIST IS THE LOCALE DIRECTORY, not a literal in the registry. A language is
   ONE FILE in js/locales/ now, and the registry derives its label and tag from the code (see
   src/locale-boot.js). Reading the directory is exactly what the app does, so this report cannot
   disagree with the app — which is the class of defect #R231 spent a whole round on. Explicit labels
   are still read out of the registry for the rows that carry one. */
function langs() {
  const reg = readFileSync(join(JS, 'lang-registry.js'), 'utf8');
  const label = {};
  const re = /\{\s*code:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'/g;
  let g; while ((g = re.exec(reg))) label[g[1]] = g[2];
  const CORE = ['en', 'jp', 'de', 'ru', 'es'];
  const found = readdirSync(LOCALES)
    .map((f) => /^ui\.([A-Za-z0-9-]+)\.js$/.exec(f)).filter(Boolean).map((m) => m[1].toLowerCase());
  const rest = found.filter((c) => !CORE.includes(c)).sort();
  return CORE.filter((c) => found.includes(c)).concat(rest)
    .map((c) => ({ code: c, label: label[c] || c.toUpperCase() }));
}
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
  /* ⚠ (#R251) A MAP, NOT A SET — the caller needs the VALUE as well as the key, to say how many
     rows are still the English string.  reads the same on both, so nothing else changed. */
  const rows = new Map();
  if (!existsSync(p)) return rows;
  const src = readFileSync(p, 'utf8');
  const ast = parse(src, { ecmaVersion: 2022 });
  walk.simple(ast, {
    Property(n) {
      if (n.key && (n.key.name === 'inline' || n.key.value === 'inline') && n.value && n.value.type === 'ObjectExpression') {
        n.value.properties.forEach((pr) => {
          if (pr.type !== 'Property') return;
          const k = pr.key.value != null ? pr.key.value : pr.key.name;
          rows.set(k, pr.value && pr.value.type === 'Literal' ? pr.value.value : null);
        });
      }
    },
  });
  return rows;
}

/* ── ② the inline strings, from the source ──────────────────────────────────────────────────── */
function inlineStrings() {
  const out = new Map();                    /* English string → [file…] */
  /* ⚠⚠⚠ (#R251) WHICH CALLS ARE TRANSLATION CALLS IS NOT THIS FILE'S QUESTION ANY MORE.
     It used to be answered here, per file, and it was wrong in a way no percentage could show: a
     helper BOUND in js/app-body.js and handed to every submodule (`get _coL(){ return _coL; }`) is
     called in js/companies-ui.js as `HOST._coL('Market cap','時価総額','Marktkap.',…)`. That is a
     complete five-language call — and because `_coL` is not bound in the file being read, all 65
     such sites were outside this universe, so fr / ko / zh / zh-hans had no row to translate and
     rendered ENGLISH while this report printed 100 %. The resolution is repo-wide and lives in
     scripts/i18n-helpers.mjs, which scripts/i18n-positional-audit.mjs and scripts/i18n-pair-audit.mjs
     read too — one answer, so the three cannot disagree ([[intmap-recurring-lessons]] G). */
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const i = shapeOf(n, ctx);
        if (i < 0) return;
        const a = n.arguments[i];
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

  /* (#R231) `--missing <code>` prints exactly the inline strings that language has no entry for, as
     ready-to-paste table rows. Without it, closing a gap means diffing 2,000 keys by eye — which is
     why #R223/#R224's tables were never topped up as new strings landed. */
  /* (#R251)  prints the inline rows whose value IS still the English key —
     the work `--missing` cannot see, because those rows are PRESENT. A skeleton written by
     scripts/i18n-new-language.mjs is 100 % present and 0 % translated, and that was invisible.
     ⚠ Some of them are correct in that language (units, product names, cognates); this lists them
     so somebody decides, rather than a percentage deciding for them. */
  const wantIdent = process.argv.indexOf('--identical');
  if (wantIdent >= 0) {
    const code = process.argv[wantIdent + 1];
    const have = inlineTable(code);
    const rowsOut = [...inline.keys()].filter((sx) => have.get(sx) === sx).sort((a, b) => a.localeCompare(b));
    console.error(`${code}: ${rowsOut.length} of ${inline.size} inline rows are still the English string`);
    for (const sx of rowsOut) console.log(`    ${ESC(sx)}: ${ESC(sx)},   /* ${(inline.get(sx) || []).slice(0, 2).join(' ')} */`);
    return;
  }
  const wantMissing = process.argv.indexOf('--missing');
  if (wantMissing >= 0) {
    const code = process.argv[wantMissing + 1];
    const have = inlineTable(code);
    const gaps = [...inline.keys()].filter((s) => !have.has(s)).sort((a, b) => a.localeCompare(b));
    console.error(`${code}: ${gaps.length} of ${inline.size} inline strings have no entry`);
    for (const s of gaps) console.log(`    ${ESC(s)}: ${ESC(s)},   /* ${inline.get(s).slice(0, 2).join(' ')} */`);
    return;
  }

  /* ⚠ (#R239) …AND THE SAME TWO NUMBERS, FOR A MACHINE. `scripts/i18n-audit.mjs` is the ONE gate
     that every translatable surface answers to, and it must not carry a second copy of the parsers
     above — two copies of one measurement is [[intmap-recurring-lessons]] G, and the copy that
     drifts is always the one nobody runs. So the audit spawns this file with `--json` and reads
     these rows. The human table below stays exactly as it was. */
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      surface: 'app', keyedWant: en.size, inlineWant: inline.size,
      rows: rows.map((r, idx) => {
        const k = keyedTable(r.code); const i = inlineTable(r.code);
        return {
          code: r.code,
          keyed: r.code === 'en' ? en.size : (k ? [...k].filter((x) => en.has(x)).length : 0),
          positional: idx < 5,
          inline: idx < 5 ? null : [...inline.keys()].filter((s) => i.has(s)).length,
          /* ⚠⚠⚠ (#R251) …AND HOW MANY OF THOSE ROWS ARE STILL THE ENGLISH STRING. #R239 wrote the
             rule after an instrument it had just written called an English copy 100 % — 「被覆は
             『存在する』でなく『英語と違う』」 — and fixed it for the READING PAGES. The inline table
             still counted presence:  writes 3,576 rows whose
             value IS the key (deliberately — the language must be readable from the first commit),
             and this column then reported Italian at 100.0 %, so  named the 367 page
             strings and stayed silent about 3,576 untranslated ones. It is PRINTED rather than
             subtracted, because a row that equals its key is often correct — 「Satellite」, 「Zoom」,
             「Distance」 and 「Atlas」 are French, 「km」 and 「UTC」 are everybodys — and certifying
             217 of those as reviewed is a claim this file has not earned. The number is the signal. */
          identical: idx < 5 ? null : [...inline.keys()].filter((s) => i.get(s) === s).length,
        };
      }),
    }));
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
    /* ⚠⚠ (#R231) COVERAGE IS MEMBERSHIP, NOT A SIZE RATIO. This printed `i.size / inline.size`, so a
       table holding 2,068 entries against 2,038 live strings read "100 %" while five of those live
       strings had no entry at all — and thirty stale ones (for call sites since edited or deleted)
       padded the number that hid them. That is this round's own headline defect, one level down: an
       instrument reporting green for something it is not looking at. It counts the intersection now,
       which is the only number that answers "will a reader of this language see their own words". */
    const covered = [...inline.keys()].filter((s) => i.has(s)).length;
    const inTxt = positional ? 'n/a (positional)'
      : `${covered}/${inline.size}  ${(100 * covered / Math.max(1, inline.size)).toFixed(1)}%`;
    console.log(`${r.code.padEnd(6)} ${String(kn).padStart(4)}/${en.size}  ${((100 * kn) / en.size).toFixed(0).padStart(3)}%   ${inTxt}`);
  }
  console.log('\n"positional" = one of the first five languages, whose translations live as arguments');
  console.log('at each L(…) call site rather than in an inline table (see js/lang-registry.js).');
}

main();
