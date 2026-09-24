/* ============================================================================
 *  IntMap · what every old «the build stamp was bumped» test now asks
 * ----------------------------------------------------------------------------
 *  Twenty-four checks, written between #R169 and #R465, pinned the two stamps in index.html
 *  (`window.INTMAP_BUILD='YYYY-MM-DD-R<n>'`, `window.__imBuild='R<n>'`) to «the round being worked
 *  on», «the newest round in DEV-NOTES» or «not an older round than R<k>». Every one of them guarded
 *  the same defect in a different words: A STAMP A PERSON FORGOT TO MOVE — R171 through #R172/#R173,
 *  R196 through #R198, R205 on the R206 deploy, R755 on the R756 deploy — which makes a stale cached
 *  copy look current to the anti-stale guard (#R16) and a current one look stale.
 *
 *  Since 2026-09-25 the stamp is written by the build from the commit being built
 *  (scripts/build-stamp.mjs), so that defect can only come back in three ways, and this measures
 *  exactly those three — without spelling a value (a pinned value is the forgettable thing):
 *    1. a stamp is TYPED into index.html again (the source carries anything but the build's token);
 *    2. the two globals stop receiving the SAME value (the #R169 ⑧ invariant);
 *    3. the build stops filling it in (the plugin is not in vite.config.js's plugin list, or the value
 *       it writes is not the stamp of this checkout, or it cannot be ordered by time).
 * ==========================================================================*/
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { STAMP_TOKEN, buildStamp, buildStampPlugin, stampTime } from '../../scripts/build-stamp.mjs';

const assigned = (html, name) => {
  const m = new RegExp(`window\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*'([^']*)'`).exec(html);
  return m ? m[1] : null;
};

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let configPlugins = null;
async function vitePluginNames(root) {
  if (!configPlugins) {
    const cfg = (await import(pathToFileURL(join(root, 'vite.config.js')).href)).default;
    configPlugins = (cfg.plugins || []).flat(Infinity).filter(Boolean).map((p) => p.name);
  }
  return configPlugins;
}

/** Sentences describing how the stamp could go stale again (empty = it cannot). */
export async function generatedStampProblems(html, root = REPO) {
  const problems = [];
  const src = { im: assigned(html, '__imBuild'), ib: assigned(html, 'INTMAP_BUILD') };
  if (src.im == null || src.ib == null) return ['index.html no longer assigns both window.__imBuild and window.INTMAP_BUILD'];
  for (const [k, v] of Object.entries(src)) {
    if (v !== STAMP_TOKEN) problems.push(`${k === 'im' ? '__imBuild' : 'INTMAP_BUILD'} is typed by hand («${v}») — the build writes it (scripts/build-stamp.mjs); a typed stamp is the one a round forgets to move`);
  }
  const out = buildStampPlugin(root).transformIndexHtml.handler(html, { filename: join(root, 'index.html') });
  const built = { im: assigned(out, '__imBuild'), ib: assigned(out, 'INTMAP_BUILD') };
  if (built.im !== built.ib) problems.push(`the build gives the two stamps different values: ${built.im} vs ${built.ib}`);
  const want = buildStamp(root);
  if (built.ib !== want) problems.push(`the built stamp is «${built.ib}», not this checkout's «${want}»`);
  if (!Number.isFinite(stampTime(built.ib))) problems.push(`the built stamp «${built.ib}» carries no time the anti-stale guard can order`);
  const names = await vitePluginNames(root);
  if (!names.includes('intmap-build-stamp')) problems.push('vite.config.js does not run the build-stamp plugin — the token would ship unfilled');
  return problems;
}
