#!/usr/bin/env node
/* ============================================================================
 *  place-history.mjs — «この場所の歴史» for one point, from the page's own modules   (place-through-time)
 * ----------------------------------------------------------------------------
 *  .agents/rules/historical-verification.md §2-1: a historical claim is checked by NAMING a place and reading what the
 *  map says there, not by a gate's aggregate. This prints, for a point, exactly the timeline the place card shows —
 *  js/time-borders.js `placeRecords` and js/time-admin1.js `placeRecords` evaluated over the shipped records (opened
 *  through js/hist-bundles.js, as the page opens them), composed by js/place-history.js `compose` / `composeAdmin`.
 *  Nothing here re-implements a rule: a harness that wrote its own «which polity held this» would be a second answer.
 *
 *    node scripts/place-history.mjs --at <lng>,<lat> [--lang jp|en] [--json]
 *    node scripts/place-history.mjs --sites          # the seven sites the development record checks
 *
 *  The seven sites are the ones dev-notes/2026-10-07-place-through-time.md compares with the founding and abolition of
 *  the institutions — the list is the record's, kept here so the comparison can be re-run as the records change.
 * ==========================================================================*/
import { timeBorders } from './histeras/time-borders.mjs';
import { repoFetch } from './hist-fidelity.mjs';
import { importModule, langRegistry } from './lib/import-module.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SITES = [
  { name: 'Kyoto', jp: '京都', at: [135.7681, 35.0116] },
  { name: 'Istanbul', jp: 'イスタンブール', at: [28.9760, 41.0122] },
  { name: 'Jerusalem', jp: 'エルサレム', at: [35.2316, 31.7767] },
  { name: 'Warsaw', jp: 'ワルシャワ', at: [21.0122, 52.2297] },
  { name: 'Shanghai', jp: '上海', at: [121.4737, 31.2304] },
  { name: 'Mexico City', jp: 'メキシコシティ', at: [-99.1332, 19.4326] },
  { name: 'Cairo', jp: 'カイロ', at: [31.2357, 30.0444] },
];

/* the two modules the page instantiates, over the repository's own files */
export async function harness(lang = 'jp') {
  const { api, window: w, host } = await timeBorders({ lang, fetch: repoFetch });
  langRegistry();
  const noop = () => {};
  const deep = () => new Proxy(function () {}, { get(_, k) { return (k === 'then' || typeof k === 'symbol') ? undefined : deep(); }, apply: () => deep() });
  const IntMapGeoEngine = new Proxy({ hasRenderer: () => true, ready: () => true, whenCanDraw: () => new Promise(() => {}) }, { get: (t, k) => ((k in t) ? t[k] : deep()) });
  const IntMapTime = { year: () => 1900, isLive: () => false, on: noop, when: () => null, min: -122999 };
  const TA = await importModule('js/time-admin1.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine }, 'js/chronos.js': { IntMapTime } } });
  const admin = TA.timeAdmin1({ canDraw: () => false, lang, isMobile: () => false });
  w.IntMapTimeBorders = api; w.IntMapTimeAdmin1 = admin;
  const PH = await importModule('js/place-history.js', { mocks: { 'js/chronos.js': { IntMapTime } } });
  return { borders: api, admin, PH, host, window: w };
}

export async function historyAt(H, lng, lat) { return H.PH.placeHistory({ lng, lat }); }

const k2s = (k) => { const y = Math.floor(k / 10000), r = k - y * 10000, m = Math.floor(r / 100); return y + '-' + String(m).padStart(2, '0') + '-' + String(r - m * 100).padStart(2, '0'); };
export function printable(rec) {
  const lines = [];
  for (const E of rec.nation.entries) {
    const nm = E.unnamed ? '(unnamed shape)' : E.withheld ? '(withheld: ' + E.withheld.name + ')' : E.labels.map((x) => x.label).join(' → ') || E.name;
    lines.push(`  ${k2s(E.from.k)} [${E.from.edge}${E.from.by ? ':' + E.from.by : ''}${E.from.sheet != null ? ':' + E.from.sheet : ''}] – ${k2s(E.to.k)} [${E.to.edge}${E.to.by ? ':' + E.to.by : ''}${E.to.sheet != null ? ':' + E.to.sheet : ''}]  ${nm}  {${E.tiers.join(',')}}${E.ids.map((x) => ' ' + JSON.stringify(x.id)).join('')}${E.life ? ' life ' + E.life.join('..') : ''}${E.realm ? ' REALM' : ''}`);
  }
  for (const g of rec.nation.gaps) lines.push(`  GAP ${k2s(g.from)} – ${k2s(g.to)}${g.toNow ? " (today)" : ""}`);
  if (rec.nation.missing.length) lines.push('  MISSING ' + JSON.stringify(rec.nation.missing));
  lines.push('  -- first-level --');
  for (const E of rec.admin.entries || []) lines.push(`  ${k2s(E.from.k)} [${E.from.edge}${E.from.dates && E.from.dates.raw ? ' raw ' + E.from.dates.raw : ''}] – ${k2s(E.to.k)} [${E.to.edge}${E.to.dates && E.to.dates.raw ? ' raw ' + E.to.dates.raw : ''}]  ${E.label}  ${E.file} ${JSON.stringify(E.id)}`);
  if (rec.admin.status !== 'ok') lines.push('  admin: ' + rec.admin.status + ' ' + (rec.admin.reason || ''));
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const lang = arg('--lang', 'en');
  const H = await harness(lang);
  const pts = process.argv.includes('--sites') ? SITES : [{ name: arg('--at'), at: String(arg('--at', '')).split(',').map(Number) }];
  for (const s of pts) {
    if (!(s.at.length === 2 && s.at.every(Number.isFinite))) { console.error('usage: --at <lng>,<lat> | --sites'); process.exit(2); }
    const rec = await historyAt(H, s.at[0], s.at[1]);
    if (process.argv.includes('--json')) console.log(JSON.stringify(rec));
    else console.log('== ' + s.name + ' (' + s.at.join(', ') + ')\n' + printable(rec));
  }
}
