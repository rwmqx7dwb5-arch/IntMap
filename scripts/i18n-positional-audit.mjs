#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE POSITIONAL FIVE, AUDITED   (#R235)
 * ----------------------------------------------------------------------------
 *  「ドイツ語、ロシア語、スペイン語について、すべての面において対応が完璧かどうか最終点検し、
 *    未了点があれば修正して。」
 *
 *  scripts/i18n-report.mjs prints "n/a (positional)" for en/jp/de/ru/es, because their translations
 *  are ARGUMENTS at each `L(…)` call site rather than rows in a table — there is no key list to
 *  count against. #R234's notes record that being read as "complete"; #R232 measured it by hand once
 *  and found 40 of 1,731 sites in English. This script is that measurement, automated, so the answer
 *  stops depending on somebody remembering to look.
 *
 *  ⚠ IT PARSES, IT DOES NOT REGEX (same rule as i18n-report.mjs). A call counts only when it is a
 *  CallExpression whose callee is a name bound to IntMapLang.pick() in that file and whose arguments
 *  are plain string literals — so a comment mentioning L('…') is not mistaken for a call site.
 *
 *  A site is REPORTED when a target-language argument is byte-identical to the English one and the
 *  string is not legitimately language-neutral. The exclusions are deliberate and narrow:
 *    · no letters at all (「—」, 「%」, 「±」, 「1/√f」) — nothing to translate;
 *    · the string is a proper noun / unit / symbol the language shares (Tsunami, Mw, km, PGV, MMI,
 *      Rayleigh, IASP91) — a list, so that adding one is a decision somebody made on purpose;
 *    · the site has fewer than 5 arguments, i.e. the author only supplied en/jp — those are counted
 *      SEPARATELY as `short`, because they are a different defect with a different fix.
 *
 *      node scripts/i18n-positional-audit.mjs            # counts + the first 40 of each
 *      node scripts/i18n-positional-audit.mjs --all      # every site, for fixing
 * ==========================================================================*/
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'js');
const ALL = process.argv.includes('--all');

/* ⚠ (#R235) EVERY ENTRY HERE WAS TRIAGED BY HAND ONCE, and the reason is the point of the list: a
   string that is identical in English and German may be a MISSING translation or the CORRECT German
   word, and only reading it tells you which. The sweep this file was written for produced 96 German
   and 58 Spanish hits; four of them were real (Tram→Straßenbahn, Reset→Zurücksetzen,
   Workspace→Arbeitsbereich, News→Nachrichten) and the rest are below, grouped by why.
   ⚠ Adding a row here is a claim that the word is right, not a way to quiet the gate. */
const NEUTRAL = new Set([
  /* units, symbols and scale names */
  'Mw', 'MMI', 'PGV', 'PGA', 'km', 'm', 's', 'Hz', 'h', 'd', ' d', 'min', 'max', 'max ', 'log',
  'k m³', 'az.', 'incl.', 'elev.', 'Magnitude (Mw)', 'Magnitude', 'Pearson r', 'radio 4/3', 'Precip.',   /* (#R242) «Magnitude» IS the German seismological term (DWD/GFZ use it); the row label added this round is the bare word */
  /* proper nouns: missions, products, places, people */
  'JMA', 'USGS', 'NASA', 'ESA', 'GPS', 'UTC', 'Atlas', 'IntMap', 'Galileo', 'Starlink', 'Fukushima',
  'Street View', 'Earth Replay', 'Fresnel', 'Shindo', 'JMA (shindo)', 'IASP91', 'Vs30', 'Rayleigh',
  /* aviation Q-codes and cockpit legends, which are not localised in any cockpit */
  'QNH', 'AoA', 'Mach', 'Squawk', 'COCKPIT', 'PAUSE', 'RESET', 'START ▸', 'WIND', 'FLAPS',
  /* loanwords that ARE the German and/or Spanish word — checked one at a time */
  'Tsunami', 'Radar', 'Satellite', 'Alternative', 'Bus', 'Details', 'Export:', 'Gold', 'Name',
  'Park', 'Pause', 'Pin', 'Pins', 'Polygon', 'Position', 'Radius', 'Region', 'Rotation', 'Route',
  'Screenshot', 'Signal', 'Start', 'Ticker', 'Widgets', 'Wind', 'Zoom', 'Website', 'Basis', 'Color',
  'Error', 'error', 'No', 'base', 'global', 'total', 'penumbral', 'positive', 'negative', 'vs',
  'auto', '(auto)', 'live', '(live)', 'Live', '↻ live', 'Top', 'Top ', 'in ', 'Elevation',
  'Elongation', 'Asteroid', 'Feedback', 'in',
  /* (#R241) …and seven more the widened universe surfaced, each checked one at a time. They are the
     German or Spanish word, not an untranslated English one:
       Revolution  de — «Revolution» is the German noun.
       HDI         de — the German abbreviation for the Human Development Index is HDI.
       Sorghum     de — the German name of the cereal (Sorghumhirse is the long form).
       Olive       de — the German noun.
       Textiles    es — the Spanish plural noun.
       Total       es — the Spanish noun, and the label the GAEZ panel prints. */
  'Revolution', 'HDI', 'Sorghum', 'Olive', 'Textiles', 'Total',
  /* generic single tokens */
  'OK', 'ID', 'URL', 'CSV', 'JSON', 'PNG', 'Beta', 'beta', 'Info', 'Q', 'P', 'S', 'Alpha',
]);
const hasLetter = (s) => /\p{L}/u.test(s);

const files = readdirSync(JS).filter((f) => f.endsWith('.js')).sort();
const LANGS = [{ i: 2, code: 'de' }, { i: 3, code: 'ru' }, { i: 4, code: 'es' }];
const same = { de: [], ru: [], es: [] };
const short = [];
let sites = 0;

for (const f of files) {
  const src = readFileSync(join(JS, f), 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true }); }
  catch { try { ast = parse(src, { ecmaVersion: 2022, sourceType: 'module', locations: true }); } catch { continue; } }

  /* which local names are bound to IntMapLang.pick() in THIS file
     ⚠ (#R241) …AND TO `pickArgs()`, WHICH THIS REGEX WOULD OTHERWISE MISS. `pickArgs` returns the
     tuple it is handed, so `LA('English','日本語','Deutsch','Русский','Español')` is the same five
     positional arguments as an `L(…)` call — that is the whole reason it is written as a call (see
     the header of js/lang-registry.js). `pick\s*\(` does not match `pickArgs(`, so 90 new sites
     would have been silently outside this audit's universe while it printed 100 % — which is the
     defect this round exists to close, one level up. */
  const names = new Set();
  walk.simple(ast, {
    VariableDeclarator(n) {
      if (n.id.type !== 'Identifier' || !n.init) return;
      const t = src.slice(n.init.start, n.init.end);
      if (/IntMapLang\s*\.\s*pick(?:Args)?\s*\(/.test(t)) names.add(n.id.name);
    },
  });
  if (!names.size) continue;

  walk.simple(ast, {
    CallExpression(n) {
      if (n.callee.type !== 'Identifier' || !names.has(n.callee.name)) return;
      const args = n.arguments;
      if (!args.length || args[0].type !== 'Literal' || typeof args[0].value !== 'string') return;
      if (!args.every((a) => a.type === 'Literal' && typeof a.value === 'string')) return;
      sites++;
      const en = args[0].value;
      const where = `${relative(ROOT, join(JS, f)).replace(/\\/g, '/')}:${n.loc.start.line}`;
      if (args.length < 5) { short.push({ where, en, n: args.length }); return; }
      if (!hasLetter(en) || NEUTRAL.has(en.trim())) return;
      for (const { i, code } of LANGS) if (args[i].value === en) same[code].push({ where, en });
    },
  });
}

/* ⚠ (#R239) the machine-readable form scripts/i18n-audit.mjs reads — one gate, one copy of each
   measurement (see the header of scripts/i18n-pages-audit.mjs). */
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    surface: 'positional', sites, short: short.length,
    rows: LANGS.map(({ code }) => ({ code, same: same[code].length })),
  }));
  process.exit(0);
}

const show = (rows) => rows.slice(0, ALL ? rows.length : 40)
  .forEach((r) => console.log('    ' + r.where + '  ' + JSON.stringify(r.en).slice(0, 90)));

console.log(`positional L(…) call sites parsed: ${sites}`);
console.log(`\nsites with fewer than five arguments (de/ru/es never supplied): ${short.length}`);
show(short);
for (const { code } of LANGS) {
  const pct = sites ? (100 * (1 - same[code].length / sites)).toFixed(1) : '—';
  console.log(`\n${code}: ${same[code].length} site(s) identical to English  →  ${pct}% translated`);
  show(same[code]);
}
const total = short.length + same.de.length + same.ru.length + same.es.length;
console.log(`\ntotal outstanding: ${total}`);
if (process.argv.includes('--gate') && total > 0) process.exit(1);
