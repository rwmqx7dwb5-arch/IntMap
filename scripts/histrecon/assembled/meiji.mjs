/* ==========================================================================
 * scripts/histrecon/assembled/meiji.mjs   (hist-reconstruction · Japan, prefectures 1871-12 → 1890-12)
 *
 * The Meiji reconstruction approved as the pilot. It needs more than a union of atoms — a 1920 町村 that
 * only partly moved is cut with e-Stat 2020 ōaza — so it runs its own assembler and its own criteria
 * (scripts/histrecon/build-meiji-v2.mjs: membership vs the 1920 prefectures, vs the independent 旧国 outlines,
 * the prefecture counts the sources state, a partition at every interval, a citation per membership) and hands
 * the finished full-precision shapes to scripts/build-hist-admin-recon.mjs, which applies test 3 and test 4
 * like every other reconstruction.
 *
 * The assembler's output is cached by a hash of every input it reads, so a build that changed nothing
 * here does not spend the ~15 minutes the polygon unions take.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cacheDir } from '../atoms/ne-admin1.mjs';

export const KEY = 'JPN-meiji';
export const COUNTRY = 'JPN';
const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));     // scripts/histrecon
const ROOT = path.resolve(HERE, '..', '..');
const INPUTS = ['build-meiji-v2.mjs', 'build-meiji.mjs', 'blocks-n03-1920.mjs', 'munis-n03-1920.mjs', 'estat-koaza.mjs', 'locate-parts-v2.mjs',
  'meiji-prefectures.json', 'meiji-resolutions.json', 'meiji-v2-ops.json', 'meiji-v2-parts.json', 'meiji-v3-research.json'];

/** the units the facts table states and the span each holds territory — what a shipped row must lie inside (check:histrecon) */
export function statedSpans() {
  const F = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
  const end = new Date(Date.parse(F.scope.to + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  return { scopeEnd: end, units: new Map(F.prefectures.map((p) => [p.id, [{ from: p.start, to: p.end || null }]])) };
}

export async function candidates({ log = () => {} } = {}) {
  const h = crypto.createHash('sha256');
  for (const f of INPUTS) { const p = path.join(HERE, f); if (fs.existsSync(p)) h.update(f).update(fs.readFileSync(p)); }
  const hash = h.digest('hex').slice(0, 16);
  const out = path.join(cacheDir(), 'meiji-' + hash);
  const full = path.join(out, 'hist-admin-recon-meiji-v2.js');
  if (!fs.existsSync(full)) {
    log('meiji: assembling (inputs ' + hash + ') — about 15 minutes');
    fs.mkdirSync(out, { recursive: true });
    execFileSync(process.execPath, [path.join(HERE, 'build-meiji-v2.mjs'), '--out', out,
      '--blocks-cache', path.join(cacheDir(), 'meiji-blocks-cache.json'), '--munis-cache', path.join(cacheDir(), 'meiji-munis-cache.json'), '--no-images'],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT, maxBuffer: 1 << 30 });
  } else log('meiji: cached assembly ' + hash);
  const w = {}; vm.runInNewContext(fs.readFileSync(full, 'utf8'), { window: w });
  const d = w.__HISTADMRECONMEIJI;
  const F = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
  const pref = new Map(F.prefectures.map((p) => [p.id, p]));
  const report = JSON.parse(fs.readFileSync(path.join(out, 'meiji-report-v2.json'), 'utf8'));
  const iso = (y, m, dd) => String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  const list = d.feats.map((f, i) => {
    const P = pref.get(f[11]);
    const from = iso(f[2], f[3], f[4]), to = iso(f[5], f[6], f[7]);
    const dt = d.dates[i];
    return {
      unit: { id: f[11], names: { en: P?.names?.en || f[9].en, ja: P?.names?.ja || f[9].ja }, wikidata: P?.wikidata || null },
      span: { from, to: dt.end && dt.end.raw ? to : null, precision: 'day' }, k: i,
      from: f[2] * 10000 + f[3] * 100 + f[4], to: f[5] * 10000 + f[6] * 100 + f[7],
      polys: f[8].map((poly) => poly.map((ri) => d.rings[ri])),
      dates: dt,
    };
  });
  return { file: 'scripts/histrecon/meiji-prefectures.json', units: new Set(list.map((c) => c.unit.id)).size, unresolved: report.withheld?.runs ?? 0, list, report };
}
