#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ⚠⚠⚠ ONE ENGLISH KEY, TWO MEANINGS — THE SEVENTEENTH SURFACE   (#R370)
 * ----------------------------------------------------------------------------
 *  ══ WHY THIS IS A SURFACE AND NOT A STYLE COMPLAINT ═══════════════════════════════════════════
 *  `js/lang-registry.js` `pick()` resolves en / ja / de / ru / es from the POSITIONAL arguments
 *  (index 0–4) and every language after them — fr / ko / zh-Hant / zh-Hans — from
 *
 *        inline[code][arguments[0]]          ← ONE ROW PER ENGLISH SOURCE STRING
 *
 *  so two call sites that share an English key share a row, whatever they mean. The positional
 *  five cannot collide (each site carries its own arguments); the inline four cannot help but
 *  collide. That asymmetry is invisible to every instrument we had: `i18n-report.mjs` counts the
 *  row as PRESENT, `i18n-positional-audit.mjs` sees five good arguments, and both print 100 %.
 *
 *  MEASURED when this file was written: `'Clear'` was one row serving FIVE meanings across ten
 *  sites — 快晴 (weather), 清浄 (clean air), 消去 (erase), クリア (clear a filter), 解除 (release).
 *  The row said «erase», so the weather widget announced «Effacer / 지우기 / 清除» for a clear sky
 *  in four languages, and the aerosol legend said «erase» where it meant «clean». Ten call sites,
 *  no gate red, no percentage below 100.
 *
 *  ══ HOW A COLLISION IS DETECTED — THE JAPANESE ARGUMENT IS THE DISCRIMINATOR ═══════════════════
 *  Argument 1 is Japanese and is written per site. If two sites give the same English and
 *  DIFFERENT Japanese, the author of each site was translating a different thing. That is the
 *  cheapest true signal available, and it needs no dictionary.
 *
 *  ⚠ IT OVER-APPROXIMATES, ON PURPOSE. 「比較」 and 「比較する」 are one French word; a single row
 *  serves both and nothing is wrong. So the finding is not «differs» but «differs AND one row
 *  cannot serve both», and only a reader can tell those apart. The reader's answer is recorded in
 *  BENIGN below, which is why this file gates on an ALLOWLIST rather than on a count.
 *
 *  ══ THE ALLOWLIST FAILS IN BOTH DIRECTIONS ════════════════════════════════════════════════════
 *  Like `PAIR_CEILING` in scripts/i18n-audit.mjs and scripts/test-budget.mjs: an entry that no
 *  longer collides is deleted, or the list stops asserting anything and quietly grows into a
 *  place where a real collision can hide. Removing the last duplicate site of a benign key is
 *  meant to cost one edit here — that edit is the record that it happened.
 *
 *      node scripts/i18n-key-collision-audit.mjs            # the matrix, for a reader
 *      node scripts/i18n-key-collision-audit.mjs --list     # every collision, with its sites
 *      node scripts/i18n-key-collision-audit.mjs --gate     # exit 1 on an unlisted or stale one
 * ==========================================================================*/

import * as walk from 'acorn-walk';
import { parseAll, context, shapeOf } from './i18n-helpers.mjs';

/* ⚠⚠⚠ EVERY KEY BELOW HAS BEEN READ AT EVERY ONE OF ITS SITES, and the judgement recorded is
   「one inline row serves all of them」. The Japanese differs for register, length or politeness
   («比較» / «比較する» / «国を比較»), for a counter that Japanese spells and English does not
   («件» / «記事»), or because the English source is itself the ambiguous one (« d» is a day
   whether it is 日前 or 日後, and English says « d» at both).
   ⚠ DO NOT ADD A KEY HERE TO MAKE THE GATE GREEN. The question is not «is the difference small»
   but «can ONE fr/ko/zh row be right at every site». If the answer is no, the fix is a distinct
   English key at the outlier site — see DEV-NOTES.md #R370 for the twenty-eight done that way. */
const BENIGN = new Set([
  /* (#R382) 'World' — 地球のウィジェット（世界）と、ニュースの節（国際）。fr『Monde』/ zh『世界』/ ko『세계』は**どちらの意味でも読める**ので、1 行で務まる。 ⚠ 同じ組の 'Business' / 'Latest' / 'Updated' / 'events' はここに入れていない——あれは一行では務まらないので、英語のほうを変えた。 */
  'World',

  ' d', ' h', ' min', ' s', ' yr', 'active', 'Address', 'Advisory', 'Aerosol / haze',
  'Agricultural land %', 'Aircraft', 'Aircraft at real altitude', 'Altitude', 'Area', 'articles',
  'Austria-Hungary', 'Azimuth', 'Back to now', 'Battery', 'briefing', 'British Guiana', 'Call sign',
  'Cancel', 'Caribbean', 'Chemicals', 'Clear', 'Clock', 'CO₂ per capita', 'Coins', 'Compare',
  'Continue', 'Copied', 'Corruption (control, WGI)', 'Countries', 'Country', 'Day', 'Details', 'Done',
  'Drag to resize', 'Draw / trace', 'Economy', 'Elapsed', 'Elevation', 'Error', 'Extreme',
  'FDI inflow % GDP', 'Fertility rate', 'Filter by value', 'flight path', 'From the map center',
  'GDP (nominal)', 'GDP growth %', 'Geolocation unavailable', 'Govt debt % GDP', 'Grid', 'HDI',
  'Heavy rain', 'High', 'High-tech exports %', 'highways', 'history', 'Homicide rate /100k', 'in ',
  'In service', 'Inclination', 'Income inequality (Gini)', 'Industry', 'Inflation % (CPI)',
  'Internet users', 'Internet users %', 'Isolate', 'Joseon', 'Large', 'launch', 'Length',
  'Limitations', 'Literacy rate %', 'live', 'Loading…', 'Low', 'Lowest', 'Manufacturing % GDP',
  'Markets', 'Medium', 'Mil. spending (% GDP)', 'Military', 'Military (% GDP)', 'moderate', 'Moderate',
  'Name', 'nearby', 'Need start & destination', 'Neutral', 'News', 'No dated eruption',
  'No layers are on', 'objects', 'Observatory', 'of the view', 'On this day', 'Operator',
  'Partly cloudy', 'Period', 'Pharmaceuticals', 'Play', 'Polygon', 'Population growth %', 'Pour',
  'Precipitation', 'Products', 'Rain', 'Reachable area', 'Recent earthquakes', 'Redraw',
  'Restricted areas', 'Result', 'Return to launch', 'Route', 'Rupture', 'Rural population %',
  'Satellite', 'Screenshot', 'Sea route', 'Secondary enrollment %', 'Selected', 'Share this view',
  'Shortest', 'Show it', 'Show the whole route', 'Small', 'Snow & ice', 'Source', 'Sources',
  'Soviet Union', 'Speed', 'spill points', 'Standing here', 'Start', 'Status', 'steps', 'stops', 'sun',
  'Sunlight hours & shade', 'sunlit', 'Thermal anomalies', 'Thunderstorm', 'Tides', 'Time',
  'Time-series', 'tolls', 'Track', 'Trade % of GDP', 'Try again', 'Tsunami propagation', 'Turn left',
  'Turn right', 'Type', 'unavailable', 'Under-5 mortality /1k', 'Unemployment %', 'United States',
  'Unknown color', 'Urban population %', 'valid', 'Very high', 'View', 'Volume', 'warning', 'Warning',
  'Warnings', 'Watching', 'Weather', 'Website', 'Week', 'Year', 'Years', 'You have arrived',
]);

/* ── collect every strict translation call site, grouped by English key ─────────────────────── */
export function collisions() {
  const byEn = new Map();                       /* english → Map(japanese → [site]) */
  for (const f of parseAll().keys()) {
    const ctx = context(f, 'strict');
    walk.simple(ctx.ast, {
      CallExpression(n) {
        const off = shapeOf(n, ctx);
        if (off < 0) return;
        const args = n.arguments.slice(off);    /* drop `lang` for the t() shape */
        if (args.length < 2) return;
        if (!args.every((a) => a.type === 'Literal' && typeof a.value === 'string')) return;
        const en = args[0].value, ja = args[1].value;
        /* a string with no letters is an affix, not a label — it has nowhere to hang a row */
        if (!/\p{L}/u.test(en)) return;
        if (!byEn.has(en)) byEn.set(en, new Map());
        const m = byEn.get(en);
        if (!m.has(ja)) m.set(ja, []);
        m.get(ja).push(`js/${f}:${n.loc.start.line}`);
      },
    });
  }
  const hits = [];
  for (const [en, m] of byEn) {
    if (m.size < 2) continue;
    hits.push({ en, meanings: [...m].map(([ja, sites]) => ({ ja, sites })) });
  }
  hits.sort((a, b) => b.meanings.length - a.meanings.length || a.en.localeCompare(b.en));
  return { keys: byEn.size, hits };
}

const { keys, hits } = collisions();
const unlisted = hits.filter((h) => !BENIGN.has(h.en));
const live = new Set(hits.map((h) => h.en));
const stale = [...BENIGN].filter((k) => !live.has(k)).sort();

/* ⚠ (#R239) the machine-readable form scripts/i18n-audit.mjs reads — one gate, one copy of each
   measurement (see the header of scripts/i18n-pages-audit.mjs). */
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    surface: 'key-collision', keys, total: hits.length,
    listed: hits.length - unlisted.length,
    unlisted: unlisted.map((h) => ({ en: h.en, meanings: h.meanings.map((m) => m.ja) })),
    stale,
  }));
  process.exit(0);
}

if (process.argv.includes('--list')) {
  for (const h of hits) {
    console.log(`${BENIGN.has(h.en) ? 'ok ' : '⚠  '} ${h.meanings.length}  ${JSON.stringify(h.en)}`);
    for (const m of h.meanings) console.log(`        ${JSON.stringify(m.ja).padEnd(26)} ${m.sites.join(' ')}`);
  }
}

console.log(`IntMap · one English key, two meanings — the inline table has ONE row per key  (#R370)\n`);
console.log(`  distinct English keys       ${keys}`);
console.log(`  keys with >1 Japanese       ${hits.length}`);
console.log(`  …judged benign (allowlist)  ${hits.length - unlisted.length}`);
console.log(`  …UNLISTED                   ${unlisted.length}`);
if (stale.length) console.log(`  …stale allowlist entries    ${stale.length}`);

if (process.argv.includes('--gate')) {
  const problems = [];
  if (unlisted.length) {
    problems.push(`${unlisted.length} English key(s) carry more than one meaning and are not in BENIGN: `
      + unlisted.map((h) => `${JSON.stringify(h.en)} (${h.meanings.map((m) => m.ja).join(' / ')})`).join(', '));
  }
  /* both directions — an entry that no longer collides has stopped asserting anything */
  if (stale.length) {
    problems.push(`${stale.length} BENIGN entr(ies) in scripts/i18n-key-collision-audit.mjs no longer collide `
      + `— delete them, or the allowlist becomes a place a real collision can hide: ${stale.map((s) => JSON.stringify(s)).join(', ')}`);
  }
  if (problems.length) {
    console.error('\n✖ key-collision gate: ' + problems.join('; '));
    console.error('  fr / ko / zh-Hant / zh-Hans resolve a call site by its ENGLISH string, so one key');
    console.error('  cannot carry two meanings. Give the outlier site its own English key (it is also');
    console.error('  what English readers see, so it must still read correctly), add the row to the four');
    console.error('  inline tables, and leave the old key for the sites that kept the original meaning.');
    console.error('  `node scripts/i18n-key-collision-audit.mjs --list` prints every site.');
    process.exit(1);
  }
  console.log('\n✓ key-collision gate: every English key carries one meaning, or is a judged-benign duplicate.');
}
