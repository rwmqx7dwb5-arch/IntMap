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
import { parseAll, context, shapeOf } from './i18n-helpers.mjs';

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
  /* (#R248) three more the twelfth shape's conversion surfaced, each checked one at a time — the
     word really is the same, and a row here is a claim that it is right (see the ⚠ above):
       Islam       — German has no other word for it (Duden: «Islam»); the article differs, the noun does not.
       Melanesia   — Spanish spells the Oceanian subregion exactly so (RAE / DPD), as does English.
       Micronesia  — likewise, and it is also the country's Spanish short name. */
  'Islam', 'Melanesia', 'Micronesia',
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
    /* ⚠ (#R251) …and the eleven js/ocean-currents.js and js/atlas-sims.js brought in when the
       SIXTEENTH shape widened this audit's universe (see scripts/i18n-helpers.mjs — both files bind
       their helper as `const { …, L } = W` / `const L = CTX.L`, so neither had ever been measured
       here at all). Each was read against Duden one at a time:
         warm    — the German adjective is «warm».
         zonal   — the German adjective for a zonal (east–west) current is «zonal».
         Neutral — the legend word for a neutral state; German uses «neutral» / «Neutral».
         the months — German abbreviates Januar…Dezember as Jan Feb Mär Apr Mai Jun Jul Aug Sep Okt
         Nov Dez, so eight of the twelve ARE the English abbreviation. The four that are not (Mär,
         Mai, Okt, Dez) are translated at the same call sites, which is what makes this a claim
         about the word rather than about a forgotten argument. */
    'warm', 'zonal', 'Neutral', 'Jan', 'Feb', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Nov',
    /* …and the dwarf planet, surfaced when js/space.js's body names became calls: Duden spells it
       «Pluto», exactly as English does (the other ten differ, and are translated at the same site). */
    'Pluto',
    /* ⚠ (#R251) …and five more from js/world-packs.js and js/seismic-events.js, each read one at a
       time. `Solar` was NOT one of them — German prefers «Solarenergie» beside «Bioenergie», so the
       argument was changed rather than excused, which is what this list is for:
         Gas   — the German noun IS «Gas» (Duden); it labels the gas share of the energy mix.
         Frost — the German noun IS «Frost» (Duden); it is one of the JMA warning kinds.
         «MMI IX (Banda Aceh)», «2008 Wenchuan (Sichuan)», «2010 Haiti (Léogâne)» — an intensity
         scale designation and two place names, spelled identically in German. */
    'Gas', 'Frost', 'MMI IX (Banda Aceh)', '2008 Wenchuan (Sichuan)', '2010 Haiti (Léogâne)',
  ]),
  ru: new Set([]),
  es: new Set([
    'Córdoba, Argentina', 'Valencia, Venezuela', 'San José, Costa Rica', 'Perth, Australia',
    'Software', 'Venus', 'Canal', 'Nuclear', 'China', 'India', 'Israel', 'Australia',
    'Formosa', 'Zaire', 'Bohemia', 'Mesopotamia', 'Dahomey', 'Kampuchea', 'Gran Colombia',
    'Manchuria', 'Transvaal', 'Natal', 'Buganda', 'Bunyoro', 'Oyo', 'Kanem-Bornu', 'Annam',
    'Arabia', 'Angola', 'Congo', 'Madagascar', 'Mozambique', 'Eritrea', 'Jamaica', 'Yemen',
    /* ⚠ (#R251) …and the three the sixteenth shape's widened universe surfaced, read against the
       RAE one at a time:
         zonal  — the Spanish adjective is «zonal».
         Sector — the Spanish noun is «sector»; the label is capitalised, the word is not translated.
         alt    — the Spanish abbreviation of «altitud» is «alt.», i.e. the same three letters. It
                  labels the altitude axis of the flight-profile sketch in js/atlas-sims.js. */
    'zonal', 'Sector', 'alt',
    /* (#R251) …and three from the energy mix and the earthquake list: «gas» and «solar» are the
       Spanish words (RAE), capitalised here as chart labels, and «MMI IX (Banda Aceh)» is an
       intensity-scale designation with an Indonesian place name. */
    'Gas', 'Solar', 'MMI IX (Banda Aceh)',
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

const LANGS = [{ i: 2, code: 'de' }, { i: 3, code: 'ru' }, { i: 4, code: 'es' }];
const same = { de: [], ru: [], es: [] };
const short = [];
let sites = 0;

for (const f of parseAll().keys()) {
  /* ══ ⚠⚠⚠ (#R251) WHICH CALLS ARE TRANSLATION CALLS IS RESOLVED REPO-WIDE, NOT HERE ═════════════
     This audit is the ONLY instrument that answers 「is the German argument actually German?」, and
     for five rounds it resolved «is this name a helper?» from the file it was reading. #R243 added
     the `IntMapLang.t(lang, …)` shape here after that shape had been outside the measurement for
     four rounds. #R251 found the same defect one level further out: a helper BOUND in js/app-body.js
     and handed to submodules (`get _coL(){ return _coL; }`) is CALLED as `HOST._coL(…)`, and
     `_coL` is bound nowhere in the calling file — so 65 five-language call sites were never checked
     here either. The resolution now lives in scripts/i18n-helpers.mjs and is shared with
     scripts/i18n-report.mjs and scripts/i18n-pair-audit.mjs, so a seventeenth way of reaching the
     registry is one edit in one file and all three surfaces pick it up together. `t()`'s first
     argument is the language, so its English string is at index 1 — `shapeOf()` returns which. */
  const ctx = context(f, 'strict');
  const { src, ast } = ctx;
  const shape = (n) => shapeOf(n, ctx);

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
