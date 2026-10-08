#!/usr/bin/env node
/* ============================================================================
 *  journey-through-time.mjs — «時をまたぐ道のり» for one line, from the page's own modules   (atlas-product)
 * ----------------------------------------------------------------------------
 *  .agents/rules/historical-verification.md §2-1: a historical claim is checked by NAMING a line and an instant and
 *  reading what the map would say, not by a gate's aggregate. This prints exactly what Atlas's `time.journey` and the
 *  route panel answer — js/journey-through-time.js `journeys` over js/time-borders.js `collectionAt` evaluated on the
 *  shipped records (opened as the page opens them) and today's Natural Earth outlines (data/ne-countries/, decoded by
 *  js/ne-countries.js). Nothing here re-implements a rule.
 *
 *    node scripts/journey-through-time.mjs --via <lng,lat;lng,lat;…> --at 1913,1925,now [--lang jp|en] [--json]
 *    node scripts/journey-through-time.mjs --sites     # the journeys the development record checks
 *
 *  The sites are the ones dev-notes/2026-10-08-atlas-product.md compares with the treaties that drew the borders.
 * ==========================================================================*/
import { harness } from './place-history.mjs';
import { importModule } from './lib/import-module.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SITES = [
  { name: 'Vienna → Istanbul', via: [[16.3738, 48.2082], [28.9760, 41.0122]], at: ['1913', '1913-08-15', '1925', 'now'] },
  { name: 'Paris → Moscow', via: [[2.3522, 48.8566], [37.6173, 55.7558]], at: ['1900', '1925', '1990', 'now'] },
  { name: 'Berlin → Warsaw', via: [[13.4050, 52.5200], [21.0122, 52.2297]], at: ['1900', '1925', '1950'] },
];

/** today's outlines as the page holds them (window.countryGeo), at the scale boot draws first */
export async function landNow(scale = '50m') {
  const NE = await importModule('js/ne-countries.js');
  const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, NE.neCountriesPath(scale)))).toString('utf8'));
  return NE.decodeNECountries(doc);
}

export async function journeyHarness(lang = 'jp') {
  const H = await harness(lang);
  const J = await import('../js/journey-through-time.js');
  const land = await landNow();
  return { J, deps: { borders: H.borders, land: () => land, lang } };
}

const instantSpec = (s) => (s === 'now' ? { now: true } : /^-?\d+$/.test(s) ? { year: +s } : { date: s });

export async function run(H, via, at) {
  const instants = at.map((s) => H.J.instantOf(instantSpec(s)));
  return H.J.journeys(H.J.lineOf(via), instants, H.deps);
}

export function printable(R, J, lang) {
  const lines = [];
  for (const j of R.journeys) {
    if (j.failed) { lines.push(`  ${J.instantLabel(j.instant, lang)}: FAILED ${j.failed}`); continue; }
    lines.push(`  ${J.instantLabel(j.instant, lang)} [${(j.record && (j.record.src || j.record.tier)) || ''}] ${j.crossings.length} crossings, step ${j.stepM} m`);
    for (const g of j.legs) { const P = j.polities.find((x) => x.key === g.key); lines.push(`    ${P.names.map((n) => n.local || n.en).join(' / ')}${P.kind !== 'polity' ? ' (' + P.kind + ')' : ''}${P.under ? ' under ' + P.under : ''} ${Math.round(g.km)} km`); }
    lines.push(`    sea ${Math.round(j.gapKm.sea)} km · no record ${Math.round(j.gapKm.norecord)} km · outside ${Math.round(j.gapKm.outside)} km`);
  }
  if (R.differs.length) lines.push('  only at some instants: ' + R.differs.map((e) => e.key + ' @' + e.at.join(',')).join(' · '));
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const lang = arg('--lang') || 'jp', json = process.argv.includes('--json');
  const H = await journeyHarness(lang);
  const jobs = process.argv.includes('--sites') ? SITES
    : [{ name: 'line', via: String(arg('--via') || '').split(';').map((s) => s.split(',').map(Number)), at: String(arg('--at') || 'now').split(',') }];
  for (const s of jobs) {
    const R = await run(H, s.via, s.at);
    if (json) console.log(JSON.stringify(Object.assign({ name: s.name }, H.J.forAtlas(R, lang))));
    else console.log(s.name + '\n' + printable(R, H.J, lang));
  }
}
