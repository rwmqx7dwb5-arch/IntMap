#!/usr/bin/env node
/* R711. Same-source, geometry-only detail for the OHM fallback. Never downloads,
   invents missing boundaries, or replaces a corrected/non-reproducible outline.
   Spatial fragments share a 256 KiB target and split long lines at existing
   vertices, so a visible part of an empire never fetches its entire outline. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { readLF } from './eol.mjs';
import { detailPolys, sourcePolys } from './build-hist-admin1.mjs';
import { ringsOf, round } from './build-hist-borders.mjs';
import { loadGeom } from './histborders/fetch.mjs';
import { geometryOf } from './histborders/precision.mjs';
import { markRing, water, closedRing, INLAND_KM } from './build-border-coast.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/border-detail');
const read = file => { const w = {}; new Function('window', readFileSync(file, 'utf8'))(w); return Object.values(w)[0]; };
const BC = read(join(ROOT, 'js/border-coast.js'));
const TOL = 0.0005, DEC = 5;
const fp = polys => BC.geometryKey(polys);
const SETS = [ ['hist-borders', '__HISTB', 'intmap-histb-cache'], ['hist-admin1', '__HISTADM1', 'ohm-adm34-cache'], ['hist-admin2', '__HISTADM2', 'ohm-adm56-cache'] ];
const metadata = () => ({ v: 1, source: 'OpenHistoricalMap (CC0), cached relation geometry matching the shipped coarse outline',
  targetTolerance: TOL, decimals: DEC, inlandKm: INLAND_KM });

/* A partial build keeps the other sets exactly as published. Shared precision
   and coast semantics must agree before any chunk is written: otherwise one
   manifest would make conflicting claims about the sets it combines. */
export function planDetailBuild(previous, names = null) {
  if (names === null) return { selected: SETS, index: { ...metadata(), sets: {}, stats: {} } };
  if (!Array.isArray(names) || !names.length || names.some(name => !SETS.some(s => s[0] === name)))
    throw new Error('--sets requires known comma-separated set names: ' + SETS.map(s => s[0]).join(','));
  if (new Set(names).size !== names.length) throw new Error('--sets contains duplicate set names');
  if (!previous || typeof previous !== 'object') throw new Error('partial detail build requires an existing index');
  for (const [key, value] of Object.entries(metadata()))
    if (previous[key] !== value) throw new Error('partial detail build has incompatible ' + key + '; rebuild every set');
  for (const group of ['sets', 'stats']) {
    if (!previous[group] || typeof previous[group] !== 'object' || Array.isArray(previous[group]))
      throw new Error('partial detail build has no ' + group);
    if (Object.keys(previous[group]).some(global => !SETS.some(s => s[1] === global)))
      throw new Error('partial detail build has an unknown ' + group + ' member');
    for (const [, global] of SETS)
      if (!previous[group][global] || typeof previous[group][global] !== 'object' || Array.isArray(previous[group][global]))
        throw new Error('partial detail build has no ' + group + ' for ' + global);
  }
  return { selected: SETS.filter(s => names.includes(s[0])),
    index: { ...previous, sets: { ...previous.sets }, stats: { ...previous.stats } } };
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

async function build(names = null) {
  const previous = names === null ? null : existsSync(join(OUT, 'index.json')) ? JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')) : null;
  const { index, selected } = planDetailBuild(previous, names);
  mkdirSync(OUT, { recursive: true });
  const W = water();
  for (const [file, global, cacheDir] of selected) {
    const d = read(join(ROOT, 'data', file + '.js')), cache = join(tmpdir(), cacheDir);
    const wanted = new Map();
    const rowKeys = d.feats.map((f, i) => { const p = geometryOf(d, f), key = fp(p); if (!wanted.has(key)) wanted.set(key, { p, rows: [] }); wanted.get(key).rows.push(i); return key; });
    const entries = index.sets[global] = {}, stats = index.stats[global] = { records: d.feats.length, refined: 0, retained: 0, vertices: 0, bytes: 0, chunks: 0 };
    const buffers = new Map();
    function flush(cell) {
      const chunk = buffers.get(cell); if (!chunk) return; buffers.delete(cell);
      const body = JSON.stringify({ lines: chunk.lines, relations: chunk.relations }), name = file + '-' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '.json';
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
    if (file === 'hist-borders') {
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
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index) + '\n');
  const used = detailAssets(index);
  for (const name of readdirSync(OUT)) if (/^hist-(?:borders|admin[12])-[a-f0-9]{16}\.json$/.test(name) && !used.has(name)) unlinkSync(join(OUT,name));
  console.log('detail index written', JSON.stringify(index.stats));
}

export function check(root = ROOT) {
  const out = join(root,'data/border-detail'), index = JSON.parse(readFileSync(join(out,'index.json'),'utf8'));
  const ok = (value, message) => { if (!value) throw new Error(message); };
  ok(index.v===1 && index.targetTolerance===TOL && index.decimals===DEC && index.inlandKm===INLAND_KM,'detail precision or coast provenance differs from builder');
  ok(/OpenHistoricalMap.*CC0/.test(index.source),'detail source attribution missing');
  const all = new Set();
  for (const [file,global] of SETS) {
    const data = read(join(root,'data',file+'.js')), entries = index.sets[global];
    ok(entries && typeof entries==='object',global+' index missing');
    // Identical geometry may legitimately be shared by differently dated relations.
    // The source relation must belong to one of those exact-geometry records.
    const allowedRelations=new Map();
    if(file!=='hist-borders')for(const [i,e]of Object.entries(entries)) {
      if(!allowedRelations.has(e[0]))allowedRelations.set(e[0],new Set());
      allowedRelations.get(e[0]).add(data.feats[i]?.[10]);
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
          for (const [key,lines] of Object.entries(d.lines||{})) {
            ok(Number.isSafeInteger(d.relations[key]),'source relation id missing: '+path);
            if(file!=='hist-borders')ok(allowedRelations.get(key)?.has(d.relations[key]),'source relation does not belong to this exact geometry: '+path);
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
  for (const path of readdirSync(out)) if(path!=='index.json')ok(all.has(path),'orphan detail asset: '+path);
  return index.stats;
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
  writeFileSync(join(OUT,'index.json'),JSON.stringify(index)+'\n');
  for(const path of readdirSync(OUT))if(/^hist-(?:borders|admin[12])-[a-f0-9]{16}\.json$/.test(path)&&!used.has(path))unlinkSync(join(OUT,path));
  check();
}

async function checkSource(repair = false) {
  const index = JSON.parse(readFileSync(join(OUT,'index.json'),'utf8'));
  const onlyAt=process.argv.indexOf('--only'),only=onlyAt>=0?process.argv[onlyAt+1]:null,rejected=new Map();
  if(only&&!SETS.some(s=>s[0]===only))throw new Error('unknown source set: '+only);
  for(const [file,global,cacheDir] of SETS) {
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if(process.argv.includes('--repair-source'))await checkSource(true);else if(process.argv.includes('--check-source'))await checkSource();else if(process.argv.includes('--check'))check();else {
    const at = process.argv.indexOf('--sets');
    await build(at < 0 ? null : String(process.argv[at + 1] || '').split(',').map(s => s.trim()));
  }
}
