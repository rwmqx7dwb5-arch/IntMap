#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HOW WRONG IS THE EARTHQUAKE MODEL — THE REPORT CARD  (#R263)
 * ----------------------------------------------------------------------------
 *  「…世界各地の観測震度・PGA・PGVと自動比較するvalidationを作り、平均誤差・bias・±0.5震度以内率
 *    などを数値化する。」
 *
 *  This drives THE SHIPPED MODEL — the real js/seismic.js, in a real browser, through the same
 *  `at()` chain the panel's own table calls — over every instrumental station in
 *  tests/fixtures/seismic-observations.json, and prints what it got wrong.
 *
 *      node scripts/seismic-validate.mjs [--port 4263] [--json <file>] [--event <key>]
 *
 *  ══ WHAT IS REPORTED, AND WHY EACH ONE ══════════════════════════════════════════════════════════
 *  For PGA and PGV, in natural log units (which is how ground motion scatters — the distribution is
 *  log-normal, so a mean of the RATIO is the only mean that means anything):
 *      bias    mean ln(model/observed)   ·  positive = the model shakes too hard
 *      MAE     mean |ln(model/observed)| ·  reported as a FACTOR (e^MAE) as well, because «1.9×» is
 *                                           a sentence and «0.64 ln units» is not
 *      σ       standard deviation of the residual — the scatter a stochastic model cannot remove
 *  For intensity, in intensity units:
 *      bias · MAE · the share within ±0.5 and within ±1.0 of a unit
 *
 *  ⚠ THE INTENSITY COLUMN IS THE WEAKEST OF THE THREE AND IT IS LABELLED AS SUCH. ShakeMap derives a
 *  station's MMI from that station's own PGA/PGV through a GMICE, and for most stations that GMICE is
 *  Worden et al. (2012) — the same relation js/seismic.js converts with. So the intensity comparison
 *  is substantially a comparison of one conversion with itself, and a good score there means less
 *  than a good score on PGA. See scripts/build-seismic-observations.mjs.
 *  ⚠ AND IT IS A REPORT, NOT A GATE. Nothing here fails a build, and that is deliberate: a threshold
 *  on a validation score is an invitation to tune coefficients until the threshold passes, which is
 *  precisely what this round was told not to do. The numbers are printed and written down; deciding
 *  whether they are good enough is a person's job.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 4263));
const ONLY = arg('event', null);
const JSON_OUT = arg('json', null);
/* ⚠ --baseline IS THE POINT OF HAVING A HARNESS AT ALL. It deletes window.IntMapEarth before the
   model is asked anything, which removes BOTH of this round's ground-motion changes at once (no
   regime, so the active-crustal constants everywhere; and no crustal model, so `buildSiteBank`
   returns null and the site term is the old scalar). Everything else — the same page, the same
   stations, the same `at()` chain — is identical, so the difference between the two runs is this
   round and nothing else. A model change that cannot be A/B'd against what it replaced is a claim,
   not a measurement. */
const BASELINE = process.argv.includes('--baseline');

const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'seismic-observations.json'), 'utf8'));
const events = fx.data.filter((e) => !ONLY || e.key === ONLY);
if (!events.length) { console.error('no events selected'); process.exit(1); }

const base = 'http://127.0.0.1:' + PORT + '/';
const probe = await fetch(base).catch(() => null);
if (!probe || !probe.ok) {
  console.error('no server on ' + base + ' — run `npm run serve` (or the r263 preview) first');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  page error: ' + e.message));
await page.goto(base, { waitUntil: 'load' });
/* only the loader is eager — js/earth-structure.js arrives with the seismic chunk (see below) */
await page.waitForFunction(() => !!window.IntMapLazy, null, { timeout: 60000 });
await page.evaluate(() => window.IntMapLazy.need('seismic'));
await page.waitForFunction(() => !!window.IntMapSeismic, null, { timeout: 60000 });
/* ⚠ THE ORDER HERE IS LOAD-BEARING AND IT WAS WRONG ONCE. js/earth-structure.js is imported by
   js/seismic.js, not by src/main.js (the shell's line budget moved it there — see #R263), so it does
   not exist until the seismic chunk has loaded and it is RE-CREATED by that import. Deleting it
   before `need('seismic')` therefore did nothing at all, and --baseline silently measured the new
   model twice. It is deleted AFTER the module is in memory; `refreshRegime()` and `buildSiteBank()`
   both read `window.IntMapEarth` at CALL time, so removing it here is what the pre-#R263 model was. */
if (BASELINE) await page.evaluate(() => { try { delete window.IntMapEarth; } catch (_) { window.IntMapEarth = undefined; } });
await page.evaluate(() => JSON.stringify({ earth: typeof window.IntMapEarth }));

const rows = [];
for (const ev of events) {
  const res = await page.evaluate(async (e) => {
    window.IntMapSeismic.open({ lng: e.lng, lat: e.lat });
    return await window.IntMapSeismic.evaluate({
      lng: e.lng, lat: e.lat, depthKm: e.depthKm, mw: e.mw,
      sites: e.stations.map((s) => ({ lng: s.lng, lat: s.lat }))
    });
  }, ev);
  rows.push({ ev, res });
  process.stdout.write('  ran ' + ev.key.padEnd(18) + ' M' + ev.mw + '  '
    + ev.stations.length + ' stations  regime=' + (res.regime ? res.regime.id : '?') + '\n');
}
await browser.close();

/* ── the arithmetic ─────────────────────────────────────────────────────────────────────────────*/
const stat = (v) => {
  if (!v.length) return null;
  const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n;
  const mae = v.reduce((a, b) => a + Math.abs(b), 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
  return { n, bias: mean, mae, sd };
};
const within = (v, t) => v.filter((x) => Math.abs(x) <= t).length / Math.max(1, v.length);

function score(list) {
  const lnPga = [], lnPgv = [], dI = [];
  for (const { ev, res } of list) {
    ev.stations.forEach((obs, i) => {
      const mod = res.sites[i]; if (!mod || !mod.inRange) return;
      if (obs.pgaPctG > 0 && mod.pgaPctG > 0) lnPga.push(Math.log(mod.pgaPctG / obs.pgaPctG));
      if (obs.pgvCms > 0 && mod.pgvCms > 0) lnPgv.push(Math.log(mod.pgvCms / obs.pgvCms));
      if (obs.mmi > 0 && mod.mmi > 0) dI.push(mod.mmi - obs.mmi);
    });
  }
  return { pga: stat(lnPga), pgv: stat(lnPgv), mmi: stat(dI),
    mmiWithin05: within(dI, 0.5), mmiWithin10: within(dI, 1.0) };
}

const fmtLn = (s) => s ? (s.bias >= 0 ? '+' : '') + s.bias.toFixed(2) + '   ' + s.mae.toFixed(2)
  + ' (x' + Math.exp(s.mae).toFixed(2) + ')   ' + s.sd.toFixed(2) + '   ' + String(s.n).padStart(5) : '—';

process.stdout.write('\n══ per event ' + '═'.repeat(78) + '\n');
process.stdout.write('event               regime              M     n   lnPGA bias/MAE   lnPGV bias/MAE   MMI bias/MAE  ±0.5\n');
for (const r of rows) {
  const s = score([r]);
  const f = (x) => x ? ((x.bias >= 0 ? '+' : '') + x.bias.toFixed(2) + '/' + x.mae.toFixed(2)).padStart(13) : '            —';
  process.stdout.write(r.ev.key.padEnd(19) + (r.res.regime ? r.res.regime.id : '?').padEnd(19)
    + String(r.ev.mw).padStart(4) + String(r.ev.stations.length).padStart(6)
    + f(s.pga) + '  ' + f(s.pgv) + '  ' + f(s.mmi)
    + (100 * s.mmiWithin05).toFixed(0).padStart(5) + '%\n');
}

const all = score(rows);
process.stdout.write('\n══ overall ' + (BASELINE ? '(BASELINE — #R263 earth model disabled) ' : '(#R263 earth model live) ')
  + '═'.repeat(50) + '\n');
process.stdout.write('                     bias    MAE (factor)      sd       n\n');
process.stdout.write('ln PGA            ' + fmtLn(all.pga) + '\n');
process.stdout.write('ln PGV            ' + fmtLn(all.pgv) + '\n');
process.stdout.write('MMI               ' + (all.mmi ? (all.mmi.bias >= 0 ? '+' : '') + all.mmi.bias.toFixed(2)
  + '   ' + all.mmi.mae.toFixed(2) + '          ' + all.mmi.sd.toFixed(2) + '   ' + String(all.mmi.n).padStart(5) : '—') + '\n');
process.stdout.write('MMI within ±0.5   ' + (100 * all.mmiWithin05).toFixed(1) + ' %\n');
process.stdout.write('MMI within ±1.0   ' + (100 * all.mmiWithin10).toFixed(1) + ' %\n');
process.stdout.write('\n⚠ the MMI row is the weakest of the three — ShakeMap derives station intensity from the same\n'
  + '  PGA/PGV with (mostly) the same GMICE this model converts with. PGA and PGV are the real test.\n');
process.stdout.write('⚠ ' + fx.excluded.length + ' of the named earthquakes have no instrumental recordings and are not scored: '
  + fx.excluded.map((x) => x.key).join(', ') + '\n');

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    built: fx.built, source: fx.source, excluded: fx.excluded,
    overall: all,
    perEvent: rows.map((r) => ({ key: r.ev.key, mw: r.ev.mw, regime: r.res.regime, stations: r.ev.stations.length, score: score([r]) }))
  }, null, 1) + '\n');
  process.stdout.write('\nwrote ' + JSON_OUT + '\n');
}
