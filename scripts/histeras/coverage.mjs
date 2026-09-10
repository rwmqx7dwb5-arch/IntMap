#!/usr/bin/env node
/* ============================================================================
 *  IntMap · who already answers an era name?                                (#R686)
 * ----------------------------------------------------------------------------
 *  Prints, for every app language, how many of data/hist-eras.js's distinct names the HAND-WRITTEN
 *  tables inside js/time-borders.js localize, how many data/histeras-names.json localizes, and —
 *  the number this round exists to keep at nothing surprising — how many BOTH answer.
 *
 *      node scripts/histeras/coverage.mjs
 * ==========================================================================*/
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, eraBundle } from './census.mjs';
import { timeBorders } from './time-borders.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rows = census(eraBundle(ROOT));
const langs = JSON.parse(/\[[^\]]*\]/.exec(readFileSync(join(ROOT, 'js', 'locales', '_langs.js'), 'utf8'))[0]);
const NAMES = join(ROOT, 'data', 'histeras-names.json');
const table = existsSync(NAMES) ? JSON.parse(readFileSync(NAMES, 'utf8')).names : {};

const total = rows.reduce((a, r) => a + r.n, 0);
console.log('data/hist-eras.js — ' + rows.length + ' distinct names over ' + total + ' drawn features\n');
console.log('lang   hand-table        bundled           both     neither');
for (const lg of langs) {
  if (lg === 'en') continue;
  const { api } = timeBorders({ lang: lg });
  let hand = 0, handF = 0, bun = 0, bunF = 0, both = 0, none = 0;
  for (const r of rows) {
    const h = !!api.eraLocName(r.name);
    const b = !!(table[r.name] && table[r.name].n && table[r.name].n[lg]);
    if (h) { hand++; handF += r.n; }
    if (b) { bun++; bunF += r.n; }
    if (h && b) both++;
    if (!h && !b) none++;
  }
  const pc = (a, b) => (100 * a / b).toFixed(1).padStart(5) + '%';
  console.log(lg.padEnd(7)
    + (String(hand) + ' ' + pc(handF, total) + ' drawn').padEnd(18)
    + (String(bun) + ' ' + pc(bunF, total) + ' drawn').padEnd(18)
    + String(both).padStart(5) + String(none).padStart(12));
}
