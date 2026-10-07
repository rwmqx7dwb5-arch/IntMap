#!/usr/bin/env node
/* R711. Same-source, geometry-only detail for the OHM fallback. Never downloads,
   invents missing boundaries, or replaces a corrected/non-reproducible outline.
   Spatial fragments share a 256 KiB target and split long lines at existing
   vertices, so a visible part of an empire never fetches its entire outline.
   (hist-coverage-depth) The surveyed gap records (HIST_ADMIN_GAPS (js/border-coast.js), derived:false) are sets too:
   their detail is the publisher's own geometry from its harvester's local cache, unsimplified, in
   fragment families of their own — see SURVEY_SETS below. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { readLF } from './eol.mjs';
import { detailPolys, sourcePolys } from './build-hist-admin1.mjs';
import { ringsOf, round } from './build-hist-borders.mjs';
import { loadGeom } from './histborders/fetch.mjs';
import { geometryOf } from './histborders/precision.mjs';
import { markRing, water, closedRing, INLAND_KM } from './build-border-coast.mjs';
import { requireData, placed, readManifest } from './data-assets.mjs';
import { OPENHISTORICALMAP } from './lib/upstream-cadence.mjs';
import { requireModule } from './lib/import-module.mjs';
import { simplifyGeoJSON } from './lib/elections-geo.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

/* ⚠ (upstream-liveness) 出自は値である。読むのは js/data-governance.js の read() と
   npm run check:datagov（scripts/data-governance.mjs）。この宣言は少なくとも「どの bundle を書くか」と
   「上流がどの周期で新しいものを出すか」（cadence と、その根拠 cadenceBasis）を述べる。
   ⚠ ここに無い facet は「述べていない」であって「無い」ではない——data/governance-ledger.json が数える。
   ⚠ (hist-coverage-depth) 調査記録の詳細（index-hist-admin-surveys*.json と、その断片）の出自は、その
   per-set 索引が値として持つ（sources の出版元とライセンス、NC は licence）。ここで
   scripts/build-hist-admin-surveys.mjs の GOVERNANCE を import して upstreams に足すと、check:datagov の
   静的読み取り（純データしか束縛しない）が「読めない宣言」と判定する——実測 2026-10-05:
   unreadableDeclaration 0→1・freshness-stated ✖。だから写しも import もせず、ここは OHM のまま。 */
export const GOVERNANCE = {
  'data/border-detail/index.json': {
    /* geometry-only detail for the OHM-derived bundles in this tree (it never downloads), so it
       follows their upstream */
    publisher: 'OpenHistoricalMap',
    ...OPENHISTORICALMAP,
    builtBy: 'scripts/build-border-detail.mjs',
  },
};


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/border-detail');
const read = file => { const w = {}; new Function('window', readFileSync(file, 'utf8'))(w); return Object.values(w)[0]; };
/* (module-graph) js/border-coast.js is an ES module: imported, not re-evaluated from its text */
const BC = requireModule('js/border-coast.js').IntMapBorderCoast;
const TOL = 0.0005, DEC = 5;
const fp = polys => BC.geometryKey(polys);
const OHM_SETS = [ ['hist-borders', '__HISTB', 'intmap-histb-cache'], ['hist-admin1', '__HISTADM1', 'ohm-adm34-cache'], ['hist-admin2', '__HISTADM2', 'ohm-adm56-cache'] ];
/* ══ (hist-coverage-depth) THE SURVEYED GAP RECORDS, DISCOVERED FROM THE ONE LIST ════════════════════
   HIST_ADMIN_GAPS (js/border-coast.js) marks as `derived: false` the records a publisher surveyed and dated
   (scripts/build-hist-admin-surveys.mjs). Their shipped rings are simplified to the first tier's
   overview tolerance (0.004°), while the publisher's own outline is far finer — so zoomed in, the
   reader saw a 400 m caricature of a surveyed boundary. Their detail is the PUBLISHER'S geometry as
   its harvester (scripts/histsurveys/<key>.mjs) returns it: NO tolerance, no rounding beyond the
   harvester's own. A derived record is not listed here — its overview IS its claim — except a reconstructed one (below).
   ⚠ Each record is its own set and its own fragment family (`<file>-<hash>.json`): the non-commercial
   record's geometry never shares a fragment with open geometry, and its fragments and its index entry
   state its licence (read from the bundle's own `licence`, not typed here). */
/* (hist-reconstruction) a RECONSTRUCTED record is derived, but its claim is the union of its atoms at the precision
   they were published in — its overview is simplified for the overview only — so its detail is served the same
   way, with the same proof (the union, simplified as the bundle was, reproduces the shipped row byte for byte). */
const SURVEY_SETS = HIST_ADMIN_GAPS.filter(g => g.derived === false || g.reconstructed).map(g => [basename(g.file, '.js'), g.global, null, g]);
const SETS = [...OHM_SETS, ...SURVEY_SETS];
const isSurvey = global => SURVEY_SETS.some(s => s[1] === global);
/* a fragment this builder owns: one of the sets' own families, by name */
const ownAsset = name => SETS.some(([file]) => new RegExp('^' + file + '-[a-f0-9]{16}\\.json$').test(name));
const metadata = () => ({ v: 1, source: 'OpenHistoricalMap (CC0), cached relation geometry matching the shipped coarse outline',
  targetTolerance: TOL, decimals: DEC, inlandKm: INLAND_KM });

/* A partial build keeps the other sets exactly as published. Shared precision
   and coast semantics must agree before any chunk is written: otherwise one
   manifest would make conflicting claims about the sets it combines. */
export function planDetailBuild(previous, names = null) {
  if (names === null) return { selected: SETS, index: { ...metadata(), sets: {}, stats: {}, publishers: {} } };
  if (!Array.isArray(names) || !names.length || names.some(name => !SETS.some(s => s[0] === name)))
    throw new Error('--sets requires known comma-separated set names: ' + SETS.map(s => s[0]).join(','));
  if (new Set(names).size !== names.length) throw new Error('--sets contains duplicate set names');
  if (!previous || typeof previous !== 'object') throw new Error('partial detail build requires an existing index');
  for (const [key, value] of Object.entries(metadata()))
    if (previous[key] !== value) throw new Error('partial detail build has incompatible ' + key + '; rebuild every set');
  /* ⚠ (hist-coverage-depth) a set may be ABSENT from the previous index only when this build writes it
     — the first build of a surveyed record onto an index that predates it. Every set this build does
     not write must already be there, so the manifest still describes every set it combines. */
  for (const group of ['sets', 'stats']) {
    if (!previous[group] || typeof previous[group] !== 'object' || Array.isArray(previous[group]))
      throw new Error('partial detail build has no ' + group);
    if (Object.keys(previous[group]).some(global => !SETS.some(s => s[1] === global)))
      throw new Error('partial detail build has an unknown ' + group + ' member');
    for (const [file, global] of SETS) {
      if (names.includes(file) && previous[group][global] === undefined) continue;
      if (!previous[group][global] || typeof previous[group][global] !== 'object' || Array.isArray(previous[group][global]))
        throw new Error('partial detail build has no ' + group + ' for ' + global);
    }
  }
  /* a surveyed set's provenance travels with it (check() requires it beside every surveyed set); here
     only a member naming no surveyed set is refused */
  const publishers = previous.publishers === undefined ? {} : previous.publishers;
  if (!publishers || typeof publishers !== 'object' || Array.isArray(publishers) || Object.keys(publishers).some(global => !isSurvey(global)))
    throw new Error('partial detail build has an unknown publishers member');
  return { selected: SETS.filter(s => names.includes(s[0])),
    index: { ...previous, sets: { ...previous.sets }, stats: { ...previous.stats }, publishers: { ...publishers } } };
}

/* ══ (hist-coverage-depth) A SURVEYED SET'S INDEX IS A FILE OF ITS OWN, POINTED TO FROM index.json ══════
   index.json is read by every zoomed-in view that draws any historical outline. The surveyed sets'
   entries (+121 KB measured 2026-10-05) would be paid by every one of those views, though only a view
   with a surveyed row in it can use them — so each surveyed set's entries, stats and provenance live in
   `index-<file>.json` and index.json carries only `external: { <global>: <that name> }` (js/border-coast.js
   fetches it the first time a row of that set needs detail). In memory the builder and the gate hold
   ONE merged view (loadIndex) and split it only when writing (writeIndex), so every invariant below is
   stated once, over all sets. */
export const externalName = file => 'index-' + file + '.json';
export function loadIndex(out) {
  const index = JSON.parse(readLF(join(out, 'index.json')));
  const external = index.external || {};
  delete index.external;
  if (Object.keys(external).length || SURVEY_SETS.length) index.publishers = {};
  for (const [global, name] of Object.entries(external)) {
    const set = SURVEY_SETS.find(s => s[1] === global);
    if (!set || name !== externalName(set[0])) throw new Error('index.json points ' + global + ' at ' + name + ', not a surveyed set\'s own index');
    const sub = JSON.parse(readLF(join(out, name)));
    if (sub.v !== 1 || sub.global !== global || !sub.sets || !sub.stats || Object.keys(sub.sets).join() !== global || Object.keys(sub.stats).join() !== global)
      throw new Error(name + ' is not the index of ' + global + ' alone');
    index.sets[global] = sub.sets[global]; index.stats[global] = sub.stats[global];
    const { v, global: g, sets, stats, ...provenance } = sub;
    index.publishers[global] = provenance;
  }
  return index;
}
export function writeIndex(out, index) {
  const { publishers = {}, ...top } = index;
  top.sets = { ...index.sets }; top.stats = { ...index.stats };
  const external = {};
  for (const [file, global] of SURVEY_SETS) {
    if (top.sets[global] === undefined) continue;
    writeFileSync(join(out, externalName(file)), JSON.stringify({ v: 1, global, ...publishers[global],
      sets: { [global]: top.sets[global] }, stats: { [global]: top.stats[global] } }) + '\n');
    delete top.sets[global]; delete top.stats[global];
    external[global] = externalName(file);
  }
  if (Object.keys(external).length) top.external = external;
  writeFileSync(join(out, 'index.json'), JSON.stringify(top) + '\n');
  /* a surveyed set's index nobody points to any more is removed, as an unused fragment is */
  for (const name of readdirSync(out)) if (/^index-.+\.json$/.test(name) && !Object.values(external).includes(name)) unlinkSync(join(out, name));
}

export function detailAssets(index) {
  return new Set(Object.values(index.sets).flatMap(set => Object.values(set).flatMap(entry => entry[1].map(part => part[0]))));
}

export function eligible(before, coarse, fine) {
  if (JSON.stringify(before) !== JSON.stringify(coarse)) return false;
  if (!fine.every(p => p.length && p.every(r => r.length >= 4))) return false;
  /* Both source simplifiers retain an endpoint. The country builder reverses
     open rings to normalize winding, moving that anchor to the LAST vertex.
     Four- vs five-digit
     rounding can move it by at most 0.000055 degrees on each axis. Match that
     source anchor per shell and per hole, consuming each match once: aggregate
     counts would let an extra island conceal a lost hole in another polygon. */
  const samePoint = (a,b) => Math.abs(a[0]-b[0])<=0.0000551 && Math.abs(a[1]-b[1])<=0.0000551;
  const sameStart = (a,b) => samePoint(a[0],b[0]) || samePoint(a.at(-1),b.at(-1));
  const unused = new Set(fine.map((_,i)=>i));
  for (const poly of before) {
    let found = -1;
    for (const i of unused) {
      if (!sameStart(poly[0],fine[i][0])) continue;
      const holes = new Set(fine[i].slice(1).map((_,j)=>j+1));
      let valid = true;
      for (const ring of poly.slice(1)) {
        const match = [...holes].find(j=>sameStart(ring,fine[i][j]));
        if(match===undefined){valid=false;break;}holes.delete(match);
      }
      if(valid){found=i;break;}
    }
    if(found<0)return false;unused.delete(found);
  }
  return true;
}

/* ── the surveyed records' source: the harvesters, discovered (scripts/build-hist-admin-surveys.mjs does
   the same; a harvester is a module that exports SOURCE and harvest()) ───────────────────────────── */
async function surveyHarvesters() {
  const dir = join(ROOT, 'scripts', 'histsurveys'), out = new Map();
  for (const f of readdirSync(dir).filter(n => n.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    if (mod.SOURCE && typeof mod.harvest === 'function') out.set(mod.SOURCE.key, mod);
  }
  return out;
}
/* the unit's polygons as scripts/build-hist-admin-surveys.mjs reads them (MultiPolygon coordinates or a
   GeoJSON geometry; rings of fewer than four points left out). ⚠ This is a second reading of the same
   coordinates, and it cannot disagree silently: a row is refined only if simplifying THIS reading the
   way that builder does reproduces the shipped geometry exactly (surveySimplify + the fingerprint). */
export function surveyPolys(c) {
  const m = Array.isArray(c) ? c : c && c.type === 'Polygon' ? [c.coordinates] : c && c.type === 'MultiPolygon' ? c.coordinates : [];
  return m.map(poly => poly.filter(r => r && r.length >= 4)).filter(p => p.length);
}
export function surveySimplify(polys, tolerance, decimals) {
  const g = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance, decimals }).features[0].geometry;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}
const decimalsOf = v => { const t = String(v), e = t.indexOf('e-'); if (e >= 0) return +t.slice(e + 2) + Math.max(0, t.slice(0, e).replace(/^-?\d+\.?/, '').length); const dot = t.indexOf('.'); return dot < 0 ? 0 : t.length - dot - 1; };

async function build(names = null) {
  const previous = names === null ? null : existsSync(join(OUT, 'index.json')) ? loadIndex(OUT) : null;
  const { index, selected } = planDetailBuild(previous, names);
  mkdirSync(OUT, { recursive: true });
  const W = water();
  for (const [file, global, cacheDir, gap] of selected) {
    const d = read(join(ROOT, 'data', file + '.js')), cache = cacheDir ? join(tmpdir(), cacheDir) : null;
    /* a surveyed record's fragments state the record's own licence when it has one (the non-commercial
       record: CC BY-NC-SA, read from the bundle) — and its index entry says the same */
    const licence = gap ? (d.licence || null) : null;
    if (gap && !!gap.nonCommercial !== !!licence) throw new Error(file + ': HIST_ADMIN_GAPS (js/border-coast.js) says nonCommercial=' + !!gap.nonCommercial + ' but the bundle states licence ' + licence);
    const wanted = new Map();
    const rowKeys = d.feats.map((f, i) => { const p = geometryOf(d, f), key = fp(p); if (!wanted.has(key)) wanted.set(key, { p, rows: [] }); wanted.get(key).rows.push(i); return key; });
    const entries = index.sets[global] = {}, stats = index.stats[global] = { records: d.feats.length, refined: 0, retained: 0, vertices: 0, bytes: 0, chunks: 0 };
    const buffers = new Map();
    function flush(cell) {
      const chunk = buffers.get(cell); if (!chunk) return; buffers.delete(cell);
      /* OHM fragments: { lines, relations } exactly as before. A surveyed record's: its licence (if any),
         the lines, and for each geometry the [publisher key, upstream id] it was taken from. */
      const body = JSON.stringify(gap ? { ...(licence ? { licence } : {}), lines: chunk.lines, records: chunk.relations } : { lines: chunk.lines, relations: chunk.relations }), name = file + '-' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '.json';
      writeFileSync(join(OUT, name), body + '\n');
      for (const [key, rows] of chunk.rows) for (const i of rows) entries[i][1].push([name, chunk.bounds[key]]);
      stats.bytes += Buffer.byteLength(body) + 1; stats.chunks++;
    }
    function fragment(cell, key, id, item, line) {
      const size = JSON.stringify(line).length;
      if (buffers.has(cell) && buffers.get(cell).bytes + size > 256 * 1024) flush(cell);
      if (!buffers.has(cell)) {
        if (buffers.size >= 64) flush(buffers.keys().next().value);
        buffers.set(cell, {lines:{},relations:{},rows:new Map(),bounds:{},bytes:0});
      }
      const c = buffers.get(cell);
      if (!c.lines[key]) { c.lines[key] = []; c.relations[key] = id; c.rows.set(key,item.rows); c.bounds[key] = [Infinity,Infinity,-Infinity,-Infinity]; }
      c.lines[key].push(line); c.bytes += size;
      for (const p of line) { const b = c.bounds[key]; b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]); }
      stats.vertices += line.length;
    }
    function accept(id, coarse, fine) {
      const key = fp(coarse), item = wanted.get(key);
      if (!item || !eligible(item.p, coarse, fine)) return;
      wanted.delete(key);
      const lines = [];
      for (const poly of fine) for (const ring of poly) {
        const mark = markRing(W, ring, INLAND_KM), closed = closedRing(ring);
        if (mark === 1) lines.push(closed);
        else if (Array.isArray(mark)) for (const run of mark) { const line = closed.slice(run[0], run[1] + 1); if (line.length > 1) lines.push(line); }
      }
      for (const i of item.rows) entries[i] = [key, []];
      /* Split at existing vertices; repeat the shared endpoint, never interpolate a
         new boundary. Five-degree bins improve locality; the independent byte cap
         limits transfer even for large empires and very detailed single rings. */
      const cellOf = p => Math.floor((p[0]+180)/5) + ':' + Math.floor((p[1]+90)/5);
      for (const line of lines) {
        let cell = cellOf(line[0]), part = [line[0]];
        for (let n=1;n<line.length;n++) {
          part.push(line[n]); const next = cellOf(line[n]);
          if (next !== cell || part.length >= 8192 || n === line.length-1) {
            fragment(cell,key,id,item,part); part=[line[n]];cell=next;
          }
        }
      }
      stats.refined += item.rows.length;
    }
    if (gap) {
      /* ══ THE PUBLISHER'S OUTLINE, PROVEN TO BE THE SOURCE OF THE SHIPPED ONE ═══════════════════════
         Each row names its publisher (col 10) and that publisher's own id for the unit (col 11). The
         harvester is asked again (it reads only its local cache) and the unit with that id is taken —
         and accepted only if simplifying it EXACTLY as scripts/build-hist-admin-surveys.mjs does (the
         bundle's own tolerance and decimals) reproduces the shipped geometry byte for byte. That is the
         proof that the fine outline is the one the coarse was made from; a unit that does not reproduce
         keeps its coarse line. The fine geometry is carried as the harvester returns it: no tolerance,
         no rounding coarser than the harvester's own. */
      const harvesters = await surveyHarvesters(), harvested = new Map();
      const unitsOf = async key => {
        if (!harvested.has(key)) {
          const byId = new Map();
          let units;
          if (key.startsWith('recon:')) units = await (await import('./build-hist-admin-recon.mjs')).fineUnits(key.slice(6));
          else { const h = harvesters.get(key); if (!h) throw new Error(file + ': no harvester in scripts/histsurveys/ declares SOURCE.key ' + key); units = (await h.harvest()).units; }
          for (const u of units) { if (!byId.has(u.id)) byId.set(u.id, []); byId.get(u.id).push(u); }
          harvested.set(key, byId);
        }
        return harvested.get(key);
      };
      let decimals = 0;
      for (let i = 0; i < d.feats.length; i++) {
        if (!wanted.has(rowKeys[i])) continue;
        const f = d.feats[i], src = f[10], uid = f[11];
        for (const u of ((await unitsOf(src)).get(uid) || [])) {
          const fine = surveyPolys(u.coords), coarse = surveySimplify(fine, d.tolerance, d.decimals);
          if (fp(coarse) !== rowKeys[i]) continue;
          for (const p of fine) for (const r of p) for (const c of r) for (const v of c) decimals = Math.max(decimals, decimalsOf(v));
          accept([src, uid], coarse, fine);
          break;
        }
      }
      index.publishers[global] = { file: 'data/' + file + '.js', licence,
        sources: Object.fromEntries(Object.entries(d.sources || {}).map(([k, v]) => [k, { publisher: v.publisher, licence: v.licence }])),
        targetTolerance: 0, decimals, inlandKm: INLAND_KM };
    } else if (file === 'hist-borders') {
      const ids = JSON.parse(readFileSync(join(cache, 'index.json'), 'utf8')).elements.map(el => el.id);
      for (let n = 0; n < ids.length; n++) {
        const id = ids[n], rel = loadGeom(cache, id); if (!rel) continue;
        const side = new Map(), get = i => { if (!side.has(i)) side.set(i, loadGeom(cache, i)); return side.get(i); };
        const coarse = ringsOf(rel, get, d.precision.targetTolerance).polys.map(p => p.map(r => round(r, d.precision.decimals)));
        if (wanted.has(fp(coarse))) accept(id, coarse, ringsOf(rel, get, TOL).polys.map(p => p.map(r => round(r, DEC))));
        if (n % 100 === 0) console.log(file, n, '/', ids.length, stats.refined, 'matched');
      }
    } else {
      for (let i = 0; i < d.feats.length; i++) {
        if (!wanted.has(rowKeys[i])) continue; // exact geometry already supplied for all rows sharing it
        const id = d.feats[i][10], path = join(cache, 'rel', id + '.json');
        if (!existsSync(path)) continue;
        const rel = JSON.parse(readFileSync(path, 'utf8')); if (!rel || rel.id !== id) continue;
        const raw = sourcePolys(rel), coarse = detailPolys(rel, d.tolerance, d.decimals, raw);
        if (wanted.has(fp(coarse))) accept(id, coarse, detailPolys(rel, TOL, DEC, raw));
        if (i % 500 === 0) console.log(file, i, '/', d.feats.length, stats.refined, 'matched');
      }
    }
    for (const cell of [...buffers.keys()]) flush(cell); stats.retained = stats.records - stats.refined;
    console.log(global, JSON.stringify(stats));
  }
  writeIndex(OUT, index);
  const used = detailAssets(index);
  for (const name of readdirSync(OUT)) if (ownAsset(name) && !used.has(name)) unlinkSync(join(OUT,name));
  console.log('detail index written', JSON.stringify(index.stats));
}

export function check(root = ROOT) {
  const out = join(root,'data/border-detail'), index = loadIndex(out);
  const pointed = new Set(Object.values(JSON.parse(readLF(join(out,'index.json'))).external || {}));
  const ok = (value, message) => { if (!value) throw new Error(message); };
  ok(index.v===1 && index.targetTolerance===TOL && index.decimals===DEC && index.inlandKm===INLAND_KM,'detail precision or coast provenance differs from builder');
  ok(/OpenHistoricalMap.*CC0/.test(index.source),'detail source attribution missing');
  const all = new Set();
  for (const [file,global,,gap] of SETS) {
    /* (hist-coverage-depth) a surveyed record is checked when it is built in this tree (as
       tests/hist-coverage-depth-checks.test.mjs ③ does) — and then its detail must be there */
    if (gap && !existsSync(join(root,'data',file+'.js'))) continue;
    const data = read(join(root,'data',file+'.js')), entries = index.sets[global];
    ok(entries && typeof entries==='object',global+' index missing');
    /* a surveyed record's entry states where its geometry comes from: no tolerance, its publishers,
       and the bundle's own licence — so the non-commercial record's index entry says CC BY-NC-SA */
    const pub = gap ? index.publishers && index.publishers[global] : null;
    if (gap) {
      ok(pub && pub.file==='data/'+file+'.js' && pub.targetTolerance===0 && pub.inlandKm===INLAND_KM && Number.isInteger(pub.decimals),global+' publisher provenance missing or not the publisher\'s precision');
      ok((pub.licence||null)===(data.licence||null) && !!gap.nonCommercial===!!pub.licence,global+' index licence «'+pub.licence+'» is not the record\'s own «'+data.licence+'»');
      for (const k of Object.keys(data.sources||{})) ok(pub.sources && pub.sources[k] && pub.sources[k].publisher===data.sources[k].publisher,global+' does not name publisher '+k);
    }
    const relOf = (row) => gap ? (row ? row[10]+'\u0001'+row[11] : undefined) : row?.[10];
    // Identical geometry may legitimately be shared by differently dated relations.
    // The source relation must belong to one of those exact-geometry records.
    const allowedRelations=new Map();
    if(file!=='hist-borders')for(const [i,e]of Object.entries(entries)) {
      if(!allowedRelations.has(e[0]))allowedRelations.set(e[0],new Set());
      allowedRelations.get(e[0]).add(relOf(data.feats[i]));
    }
    const chunks = new Map();
    for (const [i,entry] of Object.entries(entries)) {
      ok(data.feats[i] && entry[0]===fp(geometryOf(data,data.feats[i])),global+' stale geometry at '+i);
      ok(Array.isArray(entry[1]),global+' fragment list missing at '+i);
      for (const [path,bbox] of entry[1]) {
        ok(new RegExp('^'+file+'-[a-f0-9]{16}\\.json$').test(path),'invalid chunk path '+path);
        if (!chunks.has(path)) {
          // The manifest measures generated LF bytes; checkout CRLF is not payload growth.
          const body=readLF(join(out,path)), d=JSON.parse(body);
          ok(Buffer.byteLength(body)<=512*1024,'chunk exceeds 512 KiB: '+path);
          ok(path.includes(createHash('sha256').update(body.trimEnd()).digest('hex').slice(0,16)),'chunk content hash differs: '+path);
          let points=0;
          /* ⚠ a surveyed fragment carries its record's licence and nothing else's: the non-commercial
             record's geometry never sits in a fragment without CC BY-NC-SA, nor open geometry in one with it */
          if (gap) ok((d.licence||null)===(pub.licence||null) && !d.relations,'fragment licence «'+d.licence+'» is not its record\'s: '+path);
          else ok(d.licence===undefined && !d.records,'an OpenHistoricalMap fragment carries a survey record\'s fields: '+path);
          const refs = gap ? d.records||{} : d.relations;
          for (const [key,lines] of Object.entries(d.lines||{})) {
            if (gap) ok(Array.isArray(refs[key]) && refs[key].length===2 && data.sources?.[refs[key][0]],'source publisher and upstream id missing: '+path);
            else ok(Number.isSafeInteger(refs[key]),'source relation id missing: '+path);
            const ref = gap ? refs[key][0]+'\u0001'+refs[key][1] : refs[key];
            if(file!=='hist-borders')ok(allowedRelations.get(key)?.has(ref),'source relation does not belong to this exact geometry: '+path);
            ok(Array.isArray(lines),'invalid lines: '+path);
            for(const line of lines) { ok(Array.isArray(line)&&line.length>=2,'short line: '+path);for(const p of line){ok(p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90,'invalid coordinate: '+path);points++;} }
          }
          chunks.set(path,{d,bytes:Buffer.byteLength(body),points});
        }
        const lines=chunks.get(path).d.lines[entry[0]];
        ok(Array.isArray(lines),'chunk missing indexed geometry: '+path);
        ok(bbox.length===4&&bbox.every(Number.isFinite),'invalid fragment bounds: '+path);
        for(const line of lines)for(const p of line)ok(p[0]>=bbox[0]&&p[0]<=bbox[2]&&p[1]>=bbox[1]&&p[1]<=bbox[3],'fragment bounds omit a coordinate: '+path);
        all.add(path);
      }
    }
    const stats=index.stats[global], values=[...chunks.values()];
    ok(stats.records===data.feats.length && stats.refined===Object.keys(entries).length && stats.retained===data.feats.length-stats.refined,'record counts differ: '+global);
    ok(stats.refined>stats.records*0.9,'detail unexpectedly misses more than 10%: '+global);
    ok(stats.bytes===values.reduce((n,c)=>n+c.bytes,0) && stats.vertices===values.reduce((n,c)=>n+c.points,0) && stats.chunks===chunks.size,'chunk measurements differ: '+global);
    console.log(global,JSON.stringify({...stats,maxChunkBytes:Math.max(...values.map(c=>c.bytes))}));
  }
  for (const path of readdirSync(out)) if(path!=='index.json'&&!pointed.has(path))ok(all.has(path),'orphan detail asset: '+path);
  return index.stats;
}

/* ══ (hist-findings-sweep) ROWS A SET LOST AFTER ITS DETAIL WAS BUILT: `--reindex <set> --was <old bundle>` ══════════
   The index is keyed by ROW POSITION, so a reviewed verdict that takes a row out of a tier (data/hist-admin-edges.json
   `withdrawn`) shifts every later row, and a fragment may name the withdrawn relation as the source of a geometry other
   shipped rows still share. Rebuilding the set needs every relation's full geometry again (the OHM cache; the builder
   never downloads), while nothing about the detail itself changed. So, offline and exactly:
     · each row of the new bundle takes the entry of the row of the old bundle with the same relation, span and geometry
       key — a row with no such twin, or one whose geometry changed, fails (that is a rebuild, not a reindex);
     · a fragment whose source relation for a geometry is no longer shipped names, instead, a shipped relation with that
       exact geometry key (the detail is the same lines — it was accepted because the geometry reproduces), and the
       fragment is renamed by its new content hash; with no such relation the geometry's lines leave the fragment.
   The stats are recounted from the files, as retainUnsafe does. */
function reindexRemoved(file, wasFile) {
  const set = SETS.find((s) => s[0] === file);
  if (!set || set[3]) throw new Error('--reindex takes an OpenHistoricalMap set: ' + SETS.filter((s) => !s[3]).map((s) => s[0]).join(','));
  const global = set[1], index = loadIndex(OUT), now = read(join(ROOT, 'data', file + '.js')), was = read(wasFile);
  const old = index.sets[global] || {};
  const idOf = (f) => f[10] + '|' + f.slice(2, 8).join('.');
  const wasAt = new Map(was.feats.map((f, i) => [idOf(f), i]));
  const fresh = {}, shippedByKey = new Map();
  now.feats.forEach((f, i) => {
    const key = fp(geometryOf(now, f));
    if (!shippedByKey.has(key)) shippedByKey.set(key, new Set());
    shippedByKey.get(key).add(f[10]);
    const j = wasAt.get(idOf(f));
    if (j === undefined) throw new Error('--reindex: row ' + i + ' (' + idOf(f) + ') has no twin in ' + wasFile + ' — rebuild the set');
    const e = old[j]; if (!e) return;
    if (e[0] !== key) throw new Error('--reindex: row ' + i + ' changed geometry — rebuild the set');
    fresh[i] = [e[0], e[1].map((p) => p.slice())];
  });
  const renamed = new Map(), paths = new Set(Object.values(fresh).flatMap((e) => e[1].map((p) => p[0])));
  for (const path of paths) {
    const d = JSON.parse(readLF(join(OUT, path)));
    let changed = false;
    for (const key of Object.keys(d.relations)) {
      const ids = shippedByKey.get(key);
      if (ids && ids.has(d.relations[key])) continue;
      changed = true;
      if (ids && ids.size) d.relations[key] = Math.min(...ids);
      else { delete d.relations[key]; delete d.lines[key]; }
    }
    if (!changed) continue;
    const body = JSON.stringify(d), name = file + '-' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '.json';
    writeFileSync(join(OUT, name), body + '\n'); renamed.set(path, name);
  }
  for (const e of Object.values(fresh)) for (const p of e[1]) if (renamed.has(p[0])) p[0] = renamed.get(p[0]);
  index.sets[global] = fresh;
  const stats = index.stats[global]; stats.records = now.feats.length; stats.refined = Object.keys(fresh).length; stats.retained = stats.records - stats.refined;
  const used = new Set(Object.values(fresh).flatMap((e) => e[1].map((p) => p[0])));
  stats.bytes = 0; stats.vertices = 0; stats.chunks = used.size;
  for (const path of used) { const body = readFileSync(join(OUT, path), 'utf8'), d = JSON.parse(body); stats.bytes += Buffer.byteLength(body); for (const lines of Object.values(d.lines)) for (const line of lines) stats.vertices += line.length; }
  writeIndex(OUT, index);
  const all = detailAssets(index);
  for (const name of readdirSync(OUT)) if (ownAsset(name) && !all.has(name)) unlinkSync(join(OUT, name));
  console.log(global + ': reindexed ' + was.feats.length + ' → ' + now.feats.length + ' rows; ' + renamed.size + ' fragment(s) renamed for a source relation no longer shipped');
}

function retainUnsafe(index, rejected) {
  const changed=new Map();
  for(const [global,keys]of rejected) {
    const paths=new Set();
    for(const [i,e]of Object.entries(index.sets[global]))if(keys.has(e[0])) {
      for(const part of e[1])paths.add(part[0]);delete index.sets[global][i];
    }
    for(const path of paths) {
      const d=JSON.parse(readFileSync(join(OUT,path),'utf8'));
      for(const key of keys){delete d.lines[key];delete d.relations[key];}
      if(!Object.keys(d.lines).length){changed.set(path,null);continue;}
      const body=JSON.stringify(d),name=path.replace(/-[a-f0-9]{16}\.json$/,'')+'-'+createHash('sha256').update(body).digest('hex').slice(0,16)+'.json';
      writeFileSync(join(OUT,name),body+'\n');changed.set(path,name);
    }
  }
  const used=new Set();
  for(const [global,entries]of Object.entries(index.sets)) {
    const paths=new Set();
    for(const e of Object.values(entries))for(const part of e[1]) {
      if(changed.has(part[0]))part[0]=changed.get(part[0]);
      if(!part[0])throw new Error('a retained geometry unexpectedly references an empty chunk');
      paths.add(part[0]);used.add(part[0]);
    }
    const stats=index.stats[global];stats.refined=Object.keys(entries).length;stats.retained=stats.records-stats.refined;
    stats.bytes=0;stats.vertices=0;stats.chunks=paths.size;
    for(const path of paths) {
      const body=readFileSync(join(OUT,path),'utf8'),d=JSON.parse(body);stats.bytes+=Buffer.byteLength(body);
      for(const lines of Object.values(d.lines))for(const line of lines)stats.vertices+=line.length;
    }
  }
  writeIndex(OUT,index);
  for(const path of readdirSync(OUT))if(ownAsset(path)&&!used.has(path))unlinkSync(join(OUT,path));
  check();
}

async function checkSource(repair = false) {
  const index = loadIndex(OUT);
  const onlyAt=process.argv.indexOf('--only'),only=onlyAt>=0?process.argv[onlyAt+1]:null,rejected=new Map();
  if(only&&!OHM_SETS.some(s=>s[0]===only))throw new Error('unknown source set: '+only);
  for(const [file,global,cacheDir] of OHM_SETS) {
    if(only&&only!==file)continue;
    const data=read(join(ROOT,'data',file+'.js')), cache=join(tmpdir(),cacheDir), checked=new Set();let count=0;
    const coastIds=new Map();
    if(file==='hist-borders') {
      const empty=Object.entries(index.sets[global]).filter(([,e])=>!e[1].length), keys=new Set(empty.map(([,e])=>e[0]));
      const names=new Set(empty.map(([i])=>data.feats[i][0].en));
      for(const row of JSON.parse(readFileSync(join(cache,'index.json'),'utf8')).elements) {
        const tags=row.tags||{},name=String(tags['name:en']||tags.name||'').trim();if(!names.has(name))continue;
        const rel=loadGeom(cache,row.id);if(!rel)continue;
        const coarse=ringsOf(rel,id=>loadGeom(cache,id),data.precision.targetTolerance).polys.map(p=>p.map(r=>round(r,data.precision.decimals)));
        const key=fp(coarse);if(keys.has(key))coastIds.set(key,row.id);
      }
    }
    for(const [i,entry] of Object.entries(index.sets[global])) {
      if(checked.has(entry[0]))continue;checked.add(entry[0]);
      const chunk=entry[1].length?JSON.parse(readFileSync(join(OUT,entry[1][0][0]),'utf8')):null;
      const id=chunk?chunk.relations[entry[0]]:file==='hist-borders'?coastIds.get(entry[0]):data.feats[i][10];
      if(!id)throw new Error('source id could not be reproduced: '+file+' '+i);
      const rel=loadGeom(cache,id);if(!rel)throw new Error('cached source missing: '+id);
      let coarse,fine;
      if(file==='hist-borders') {
        const side=new Map(),get=id=>{if(!side.has(id))side.set(id,loadGeom(cache,id));return side.get(id);};
        coarse=ringsOf(rel,get,data.precision.targetTolerance).polys.map(p=>p.map(r=>round(r,data.precision.decimals)));
        fine=ringsOf(rel,get,TOL).polys.map(p=>p.map(r=>round(r,DEC)));
      }else{const raw=sourcePolys(rel);coarse=detailPolys(rel,data.tolerance,data.decimals,raw);fine=detailPolys(rel,TOL,DEC,raw);}
      if(!eligible(geometryOf(data,data.feats[i]),coarse,fine)) {
        if(!rejected.has(global))rejected.set(global,new Set());rejected.get(global).add(entry[0]);
        console.log('retain coarse topology:',file,i,'relation',id);continue;
      }
      count++;
    }
    console.log(file,count,'unique source geometries preserve every shell and hole');
  }
  if(rejected.size){if(repair)retainUnsafe(index,rejected);else throw new Error('source topology differs in '+[...rejected.values()].reduce((n,s)=>n+s.size,0)+' geometries; --repair-source retains their existing coarse outlines');}
}

/* (data-outside-git) data/border-detail/ lives outside git (data-assets.json). The gate REFUSES an absent or
   altered copy by name rather than reporting ENOENT — or, worse, judging whatever is there — and the
   build refuses to write through the link into the shared store: `materialize` first, then publish. */
const outsideGit = () => {
  const set = Object.values(readManifest(ROOT)?.sets || {}).find((s) => s.path === 'data/border-detail');
  if (set && placed(ROOT, set).state === 'link') throw new Error('data/border-detail is a link into the shared data store. Run `node scripts/data-assets.mjs materialize border-detail` first, then `npm run data:publish border-detail` after the build.');
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--reindex')){outsideGit();const a=process.argv.indexOf('--reindex'),w=process.argv.indexOf('--was');reindexRemoved(process.argv[a+1],process.argv[w+1]);}else if(process.argv.includes('--repair-source')){outsideGit();await checkSource(true);}else if(process.argv.includes('--check-source'))await checkSource();else if(process.argv.includes('--check')){requireData(ROOT,'data/border-detail');check();}else {
    outsideGit();
    const at = process.argv.indexOf('--sets');
    await build(at < 0 ? null : String(process.argv[at + 1] || '').split(',').map(s => s.trim()));
  }
}
