/* ============================================================================
 *  IntMap · world-graph — run the PORT ingest from a terminal (the same code the Edge Function runs)
 * ----------------------------------------------------------------------------
 *  node scripts/world-graph/ingest-ports.mjs --dry [--out file.json]   fetch the three upstreams, build the rows, print the counts
 *  node scripts/world-graph/ingest-ports.mjs --invoke                 ask the deployed world-graph-ingest function to run now
 *                                                                      (needs WORLD_GRAPH_INGEST_SECRET in the environment)
 *  The weekly run is pg_cron → the Edge Function (supabase/migrations/20261120115000_world_graph_ingest.sql); this is for a
 *  person who wants to see what an upstream change would do before it lands, or to run it now.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchUpstreams, parseEurostat, parseLocode, build, UA } from '../../supabase/functions/_shared/world-graph-ports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

async function main() {
  if (arg('--invoke')) {
    const s = process.env.WORLD_GRAPH_INGEST_SECRET; if (!s) throw new Error('WORLD_GRAPH_INGEST_SECRET is not set');
    const r = await fetch('https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/world-graph-ingest', { method: 'POST', headers: { 'content-type': 'application/json', 'x-world-graph-secret': s }, body: '{}' });
    console.log(r.status, await r.text()); return;
  }
  const up = await fetchUpstreams(fetch, UA);
  const eurostat = parseEurostat(up.eurostat);
  const want = new Set(eurostat.map((r) => r.locode));
  up.wd.nodes.forEach((b) => { if (b.lo) want.add(b.lo.value.replace(/\s/g, '')); });
  const locode = parseLocode(up.locode, want);
  const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'index.json'), 'utf8')).companies;
  const lng = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'world-graph-lng.json'), 'utf8'));
  const g = build({ wd: up.wd, eurostat, locode, atlasByWd: new Map(atlas.filter((c) => c.wd).map((c) => [c.wd, c])), lngRefs: new Set(lng.nodes.map((n) => n.ref)), retrieved: new Date().toISOString().slice(0, 10) });
  const by = (k) => g.nodes.reduce((a, n) => { a[n[k]] = (a[n[k]] || 0) + 1; return a; }, {});
  console.log('upstream rows', Object.fromEntries(Object.entries(up.wd).map(([k, v]) => [k, v.length])), 'eurostat', eurostat.length, 'locode', locode.size);
  console.log('nodes', g.nodes.length, by('kind'), 'edges', g.edges.length, by.call ? '' : '', g.edges.reduce((a, e) => { a[e.rel] = (a[e.rel] || 0) + 1; return a; }, {}), 'claims', g.claims.length);
  console.log('with locode functions rail', g.nodes.filter((n) => (n.facts.unlocodeFunctions || []).includes('rail')).length, 'road', g.nodes.filter((n) => (n.facts.unlocodeFunctions || []).includes('road')).length, 'osm', g.nodes.filter((n) => n.ids.osm).length);
  if (typeof arg('--out') === 'string') fs.writeFileSync(arg('--out'), JSON.stringify({ up: { wd: up.wd }, g }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
