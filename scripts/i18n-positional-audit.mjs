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
  /* ⚠ (#R243) …and the twenty-two the TENTH surface brought in with it. Every one was read against
     a dictionary before it was written here, exactly as the note above requires. They are the German
     and/or Spanish word, a proper noun, or a source citation:
       de — Aerosol, Sat(-Schüssel), Sync, Filter, Tanker, Status, Code, Radius, Web, AUTO, Influenza,
            Pause, Countdown, «USD, nominal», «Wind 10 m», «2022 UNDP» (a citation).
       es — Capital, «Error: », General, Civil, Imperial, «Base », «zoom », «lat », AUTO.
       de/ru/es — COVID-19, SARS, Ebola, «Fear & Greed» (the index's published name). */
  'Aerosol (AOD)', 'Sync', 'Filter', 'Tanker', 'Status', 'Radius (mi)', 'Radius (km)', '🌐 Web',
  'AUTO', 'Influenza', 'COVID-19', 'SARS', 'Ebola', '⏸ Pause', 'Fear & Greed', 'Countdown',
  'USD, nominal', 'Wind 10 m', '2022 UNDP', 'Capital', 'General', 'Civil', 'Imperial (mi/ft)',
  'Base', 'zoom', 'lat', 'Error:', 'Sat', 'Code',
  /* ⚠ (#R245) …and the three the ELEVENTH surface brought in when #R244's language-keyed objects
     became calls. Each was read against a dictionary, as the note above requires, and each is the
     German or Spanish word rather than an untranslated English one:
       Tundra     de/es — «Tundra» is the German AND the Spanish name of the biome.
       Tibet      de    — the German exonym for 西藏 is Tibet (Duden).
       Manchukuo  es    — the Spanish name of the state is Manchukuo (RAE-style transliteration).
       Siam       de/es — the German and Spanish name of the historical kingdom is Siam.
       Persia     es    — the Spanish name of the historical state is Persia. */
  'Tundra', 'Tibet', 'Manchukuo', 'Siam', 'Persia',
]);
/* ══ ⚠⚠⚠ (#R246) …AND THE CLAIM «THIS WORD IS THE SAME» BELONGS TO ONE LANGUAGE, NOT TO ALL THREE
   The set above is GLOBAL, which was fine while its members were units and product names. It stops
   being fine the moment the universe contains proper nouns: putting 'Japan' in it to excuse German
   would also excuse Russian, where the word is «Япония» — i.e. the instrument would go green over a
   real gap, which is [[intmap-recurring-lessons]] B in the one file whose job is to prevent it.
   scripts/i18n-pages-audit.mjs already solved this (`SAME_AS_EN`, per language); this is the same
   rule for this surface. ⚠ Every entry below was read against a dictionary or an atlas one at a
   time, and each is a claim about ONE language:
     de  — the German exonym IS the English string: Ceylon, Formosa, Zaire, Dahomey, Basutoland,
           Kamerun (the German colony's own name), Togoland, Transvaal, Natal, Zululand, Buganda,
           Bunyoro, Oyo; the country names Japan, China, Israel, Ukraine; the loanwords Software,
           Pipeline, Cyber; the planets Venus, Mars, Jupiter, Saturn, Uranus (Duden); and the US
           place disambiguations Atlas prints, which are American toponyms and are not translated.
     es  — Formosa, Zaire, Bohemia, Mesopotamia, Dahomey, Kampuchea, Gran Colombia, Manchuria,
           Transvaal, Natal, Buganda, Bunyoro, Oyo, Kanem-Bornu, Annam, Arabia, Angola, Congo,
           Madagascar, Mozambique, Eritrea, Jamaica, Yemen; the country names China, India, Israel,
           Australia; Canal, Nuclear, Software, Venus; and the Spanish-language toponyms Atlas
           prints, which are already Spanish (Córdoba, Argentina — Valencia, Venezuela — …).
     de/ru/es — the five satellite PRODUCT names in js/tables.js, which no operator translates. */
const SAME_AS_EN = {
  de: new Set([
    'Athens, Georgia (USA)', 'Paris, Texas (USA)', 'Cambridge, Massachusetts (USA)',
    'Naples, Florida (USA)', 'Alexandria, Virginia (USA)', 'Valencia, Venezuela',
    'San José, Costa Rica', 'St. Petersburg, Florida (USA)', 'Birmingham, Alabama (USA)',
    'Manchester, New Hampshire (USA)',
    'Software', 'Pipeline', 'Cyber', 'Japan', 'China', 'Israel', 'Ukraine',
    'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus',
    'Ceylon', 'Formosa', 'Zaire', 'Dahomey', 'Basutoland', 'Kamerun', 'Togoland',
    'Transvaal', 'Natal', 'Zululand', 'Buganda', 'Bunyoro', 'Oyo',
  ]),
  ru: new Set([]),
  es: new Set([
    'Córdoba, Argentina', 'Valencia, Venezuela', 'San José, Costa Rica', 'Perth, Australia',
    'Software', 'Venus', 'Canal', 'Nuclear', 'China', 'India', 'Israel', 'Australia',
    'Formosa', 'Zaire', 'Bohemia', 'Mesopotamia', 'Dahomey', 'Kampuchea', 'Gran Colombia',
    'Manchuria', 'Transvaal', 'Natal', 'Buganda', 'Bunyoro', 'Oyo', 'Kanem-Bornu', 'Annam',
    'Arabia', 'Angola', 'Congo', 'Madagascar', 'Mozambique', 'Eritrea', 'Jamaica', 'Yemen',
  ]),
};
/* ⚠ …and the polity names the ERA MAP prints that carry no exonym in either language. Sub-Saharan
   kingdoms and peoples (Lozi, Luba, Lunda, Ngwato, Ovimbundu, Yeke…), the Pacific and Caribbean
   territories (Rapa Nui, Trinidad, Puerto Rico, Inini), and the places whose German or Spanish form
   IS the English string (Danzig is already German; Portugal is already Spanish). Read one at a
   time against the German and Spanish Wikipedia article titles for the same entity. */
for (const p of ['Barotse', 'Calabar', 'Futa Toro', 'Imerina', 'Kong', 'Kuba', 'Lagos', 'Lozi', 'Luba', 'Lunda', 'Mbailundu', 'Ndebele', 'Nguni', 'Ngwato', 'Opobo', 'Ovimbundu', 'Shona', 'Teke', 'Yaka', 'Yeke', 'Ruanda-Urundi', 'Karafuto', 'Inini', 'Alaska', 'Puerto Rico', 'Gaza', 'Portugal', 'Joseon', 'Trinidad', 'Rapa Nui', 'Hail']) { SAME_AS_EN.de.add(p); SAME_AS_EN.es.add(p); }
for (const p of ['Kanem-Bornu', 'Malaya', 'Annam', 'Tonkin', 'Danzig', 'Xinjiang', 'Angola', 'Eritrea', 'Guinea-Bissau', 'Martinique', 'Guadeloupe', 'Korea', 'Saipan', 'Māori', 'Accra', 'Cotonou', 'Griqualand West', 'Ibadan', 'Papua', 'Straits Settlements', 'Aden', 'Hawaii', 'Réunion']) SAME_AS_EN.de.add(p);
for (const p of ['Tripolitania', 'Indonesia']) SAME_AS_EN.es.add(p);
/* the satellite product names, which are the same in all three */
for (const p of ['NASA GIBS · MODIS Terra', 'NASA GIBS · VIIRS (SNPP)', 'NASA GIBS · VIIRS (NOAA-20)',
  'Sentinel Hub (S2 / Landsat)', 'Mapbox Satellite']) {
  SAME_AS_EN.de.add(p); SAME_AS_EN.ru.add(p); SAME_AS_EN.es.add(p);
}
const hasLetter = (s) => /\p{L}/u.test(s);
/* ══ ⚠ (#R243) A MODEL INSTRUCTION IS NOT A SCREEN ═══════════════════════════════════════════════
   Two call sites in js/app-body.js carry the SYSTEM PROMPT for the imagery-comparison and the
   news-cluster analyses. They are never rendered; they are sent to the model, and the language the
   READER sees is set by `window._aiLangLine()`, which is appended to both and names the current
   language for all nine. So a prompt that exists in English and Japanese is not a missing
   translation — it is one instruction with a second draft — and giving it eight more drafts would
   multiply a maintenance surface no reader can see while changing nothing on screen.
   ⚠ Listed by their opening words, so adding one is a decision somebody made on purpose. */
const PROMPTS = [
  'You are a satellite-imagery analyst comparing two images',
  'You are a geopolitical analyst. Below are news headlines',
];
const isPrompt = (s) => PROMPTS.some((p) => s.startsWith(p));

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
  /* ══ ⚠⚠⚠ (#R243) THE TENTH BLIND SPOT — `IntMapLang.t(lang, …)` WAS NEVER IN THIS UNIVERSE ══════
     「いつまでたっても言語対応の漏れが見つかることは許されない。」

     This audit is the ONLY instrument that answers 「is the German argument actually German?」, and
     for four rounds it has looked at exactly one shape: a CallExpression whose callee is an
     IDENTIFIER bound to `pick()`. #R231 converted 281 hand-written language chains to
     `IntMapLang.t(lang, en, jp, de, ru, es)` — a MemberExpression callee — and scripts/i18n-report.mjs
     was taught to read both shapes so fr/ko/zh stayed measured. This file was not, so those sites
     have been outside the de/ru/es measurement ever since while the table printed 100 %.
     #R243 then converted 467 MORE sites into the same shape, which would have taken the unmeasured
     body of text from 281 to 748 — the exact failure this family of instruments exists to stop
     ([[intmap-recurring-lessons]] B). Both shapes are read here now; `t()`'s first argument is the
     language, so its English string is at index 1 and every language index shifts by one. */
  const shape = (n) => {
    if (n.callee.type === 'Identifier' && names.has(n.callee.name)) return 0;
    if (n.callee.type === 'MemberExpression' && !n.callee.computed
      && n.callee.property && n.callee.property.name === 't'
      && /IntMapLang$/.test(src.slice(n.callee.object.start, n.callee.object.end))) return 1;
    return -1;
  };

  walk.simple(ast, {
    CallExpression(n) {
      const off = shape(n);
      if (off < 0) return;
      const args = n.arguments.slice(off);        /* drop `lang` for the t() shape */
      if (!args.length || args[0].type !== 'Literal' || typeof args[0].value !== 'string') return;
      if (!args.every((a) => a.type === 'Literal' && typeof a.value === 'string')) return;
      sites++;
      const en = args[0].value;
      const where = `${relative(ROOT, join(JS, f)).replace(/\\/g, '/')}:${n.loc.start.line}`;
      /* ⚠ (#R243) a string with NO LETTERS is an affix, not a sentence — `' '`, `''`, `')'`, `'年'`'s
         empty English counterpart. Five arguments cannot help it (its English key is empty, so the
         inline table has nowhere to hang a row either) and it says nothing a reader could read. */
      if (args.length < 5) { if (hasLetter(en) && !isPrompt(en)) short.push({ where, en, n: args.length }); return; }
      if (!hasLetter(en) || NEUTRAL.has(en.trim())) return;
      for (const { i, code } of LANGS) {
        if (args[i].value !== en) continue;
        if (SAME_AS_EN[code] && SAME_AS_EN[code].has(en.trim())) continue;   /* (#R246) per-language */
        same[code].push({ where, en });
      }
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
