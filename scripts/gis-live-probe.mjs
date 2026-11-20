/* IntMap — 実在の公開 STAC / OGC API Features / COG に、本番と同じ読み手で実接続して成功率と失敗理由を表にする。
 * 使い方: node scripts/gis-live-probe.mjs [--json] [--only <id>] [--relay <gis-fetch の URL>]   （ネットワーク要。CI では走らせない）
 *   --relay: 全部を Edge Function gis-fetch 経由で読む（ブラウザの CORS は Node に無いので、ページが中継を通る場面をここで再現する）。
 *   署名者は常に付く（js/gis-remote.js signHref: カタログが述べた署名の取り方）。
 * 供給元は scripts/gis-live-targets.json（データ）。ここに供給元ごとの分岐は無い——全部同じ道を通る。
 * 測るのは Node の fetch から。ブラウザの CORS はここでは測れない（tests/gis-live-cors.mjs の領分）。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const targets = JSON.parse(readFileSync(join(ROOT, 'scripts/gis-live-targets.json'), 'utf8')).targets;

const w = {}; globalThis.window = w;
new Function('window', readFileSync(join(ROOT, 'js/geodesy.js'), 'utf8'))(w);
const { makeGisRaster } = await import('../js/gis-raster.js');
const { makeGisCrs } = await import('../js/gis-crs.js');
const { makeGisWarp } = await import('../js/gis-warp.js');
const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
const { makeGisCog } = await import('../js/gis-cog.js');
const { makeGisOgcApi } = await import('../js/gis-ogcapi.js');
w.IntMapGisRaster = makeGisRaster(); w.IntMapGisCrs = makeGisCrs(); w.IntMapGisWarp = makeGisWarp();
await w.IntMapGisCrs.ready();
const cog = makeGisCog({ geotiff: makeGisGeotiff(), warp: w.IntMapGisWarp, crs: w.IntMapGisCrs });
const ogc = makeGisOgcApi();

const { makeGisFetch } = await import('../js/gis-fetch.js');
const { makeGisRemote } = await import('../js/gis-remote.js');
const relayBase = args.includes('--relay') ? args[args.indexOf('--relay') + 1] : '';
const remote = makeGisRemote({});
const gf = makeGisFetch({ base: relayBase, always: !!relayBase, caches: null, signer: (href) => remote.signHref(href) });
const timeout = (ms) => AbortSignal.timeout(ms);
const rows = [];
const rec = (t, stage, r, ms, extra) => rows.push(Object.assign({ id: t.id, stage, ok: !!(r && r.ok), why: r && !r.ok ? r.why : null, detail: r && !r.ok ? r.detail : undefined, ms }, extra || {}));

for (const t of targets) {
  if (only && t.id !== only) continue;
  const t0 = Date.now();
  if (t.kind === 'cog') {
    const r = await cog.readWindow(t.url, { bounds: t.bounds, width: t.size, height: t.size, signal: timeout(90000), fetch: gf.fetch });
    rec(t, 'cog-window', r, Date.now() - t0, r.ok ? { crs: r.source.crs, level: r.source.level, requests: r.source.requests, completeness: r.coverage.completeness, reason: r.coverage.reason, finite: countFinite(r.raster) } : {});
  } else if (t.kind === 'ogc' || t.kind === 'stac') {
    const r = await ogc.readItems(t.url, { search: t.kind === 'stac', bounds: t.bounds, limit: t.limit || 5, time: t.time, signal: timeout(90000), fetch: gf.fetch });
    rec(t, t.kind + '-items', r, Date.now() - t0, r.ok ? { count: r.coverage.count, completeness: r.coverage.completeness, reason: r.coverage.reason, matched: r.coverage.numberMatched, pages: r.coverage.pages } : {});
    if (r.ok && t.kind === 'stac' && t.assetKey) {
      /* 鎖の次: 選んだ行の asset を読む（発見→取得→分析） */
      const f = r.features.find((x) => x.properties && typeof x.properties['asset:' + t.assetKey] === 'string');
      if (!f) rec(t, 'asset-pick', { ok: false, why: 'no-asset-with-that-key' }, 0, { keys: r.features[0] ? Object.keys(r.features[0].properties).filter((k) => k.startsWith('asset:')).slice(0, 8) : [] });
      else {
        const href = f.properties['asset:' + t.assetKey];
        const t1 = Date.now();
        const c = await cog.readWindow(href, { bounds: t.readBounds || t.bounds, width: t.size || 64, height: t.size || 64, signal: timeout(90000), fetch: gf.fetch });
        rec(t, 'asset-read', c, Date.now() - t1, Object.assign({ href: href.slice(0, 110) }, c.ok ? { crs: c.source.crs, completeness: c.coverage.completeness, finite: countFinite(c.raster) } : {}));
      }
    }
  }
}
function countFinite(g) { try { const v = g.read ? g.read(0) : g.values; let n = 0; for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) n++; return n; } catch (_) { return null; } }

if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log([r.id.padEnd(22), r.stage.padEnd(11), r.ok ? 'OK  ' : 'FAIL', String(r.ms).padStart(6) + 'ms', r.ok ? [r.completeness, r.reason, r.count != null ? 'n=' + r.count : '', r.crs || '', r.finite != null ? 'finite=' + r.finite : ''].filter(Boolean).join(' ') : r.why + ' ' + JSON.stringify(r.detail || r.keys || '').slice(0, 160)].join(' '));
