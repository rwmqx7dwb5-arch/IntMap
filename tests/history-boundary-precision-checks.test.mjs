/* ============================================================================
 *  IntMap · the precision of the historical boundaries — refining a record without losing what it
 *  says, and the fine detail fetched only where a reader is looking
 *  (scripts/build-cshapes.mjs · scripts/histborders/precision.mjs · scripts/build-border-detail.mjs ·
 *   js/border-coast.js)
 *  (consolidated from tests/r710-boundary-precision, r711-boundary-quality, r711-boundary-quality-data
 *   and r712-historical-detail-refresh; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R710 — replacing a record's geometry with a finer cut must preserve every identity, date, label and
 *  source field, keep corrected geometry, and refuse a replacement that loses an island or a hole.
 *  #R711 — the finer detail lives in data/border-detail/ (409 MB) and is fetched per visible outline at
 *  high zoom, with the coarse line as a complete fallback; the offline gate rejects a missing or stale
 *  asset. ⚠ (#R716) THE WHOLE-BUNDLE PASS IS `npm run check:borderdetail` (41 s over 409 MB); what
 *  stays here are the REJECTION cases, which are what prove the gate can fail at all.
 *  #R712 — a partial admin refresh preserves the country manifest and its measurements.
 *  ⚠ Everything here RUNS the shipped builders and the shipped runtime reader.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refineCShapes, cutCShapesRing } from '../scripts/build-cshapes.mjs';
import { geometryOf, repoolGeometry, previousPrecision, generatedPrecision } from '../scripts/histborders/precision.mjs';
import { eligible, check, planDetailBuild, detailAssets } from '../scripts/build-border-detail.mjs';
import { detailPolys } from '../scripts/build-hist-admin1.mjs';
import { importModule } from './helpers/import-module.mjs';

/* ══ #R710 — precision replacement preserves what the record says ═══════════════════════════ */
const square = [[0,0],[1,0],[1,1],[0,1],[0,0]];
const detail = [[0,0],[0.5,0.0001],[1,0],[1,1],[0,1],[0,0]];
const row = (name, rings) => [name, 7, 1900,1,1,1910,1,1,rings,{jp:'出典名'},123];
const baseline = {v:2,src:'source and licence',window:[1900,1910],dates:{123:{source:'original'}},rings:[square],feats:[row('polity',[[0]])]};

test('#R710 precision replacement preserves every identity, date, label, and arbitrary source metadata', () => {
  const result = repoolGeometry(baseline, () => [[detail]]);
  assert.equal(result.refined, 1);
  assert.deepEqual({...result.data,rings:baseline.rings,feats:baseline.feats},baseline);
  assert.deepEqual(result.data.feats[0].filter((_,i)=>i!==8),baseline.feats[0].filter((_,i)=>i!==8));
  assert.deepEqual(geometryOf(result.data,result.data.feats[0]),[[detail]]);
  assert.deepEqual(repoolGeometry(result.data,()=>[[detail]]).data,result.data);
});

test('#R710 missing source, island loss and inner-ring loss keep the existing geometry', () => {
  const withParts = {...baseline, rings:[square,detail],feats:[row('polity',[[0,1],[1]])]};
  for(const next of [null,[],[[detail]],[[detail],[detail]]]) {
    const result=repoolGeometry(withParts,()=>next);
    assert.equal(result.retained,1);
    assert.deepEqual(geometryOf(result.data,result.data.feats[0]),geometryOf(withParts,withParts.feats[0]));
  }
});

test('#R710 an extra island cannot compensate for deleting an inner ring', () => {
  const withHole = {...baseline,rings:[square,detail],feats:[row('polity',[[0,1]])]};
  const result = repoolGeometry(withHole,()=>[[square],[detail]]);
  assert.equal(result.retained,1);
  assert.deepEqual(geometryOf(result.data,result.data.feats[0]),[[square,detail]]);
});

test('#R710 later refinement reproduces the previous target while preserving corrections', () => {
  const raw=[];
  for(let i=0;i<=100;i++)raw.push([i/100,0.0035*Math.sin(i*Math.PI/20)]);
  raw.push([1,1],[0,1],raw[0]);
  const currentRing=cutCShapesRing(raw,0.002,4);
  const corrected=square.map(p=>[p[0]+10,p[1]]);
  const have={...baseline,precision:generatedPrecision(0.002,4,2),rings:[currentRing,corrected],
    feats:[row('polity',[[0]]),row('corrected',[[1]])]};
  const prior=previousPrecision(have,0.008,3);
  assert.deepEqual(prior,{tolerance:0.002,decimals:4});
  const reproduced=cutCShapesRing(raw,prior.tolerance,prior.decimals);
  const fineRing=cutCShapesRing(raw,0.0001,4);
  const old={...have,rings:[reproduced,reproduced]};
  const fine={...have,rings:[fineRing,fineRing]};
  const result=refineCShapes(have,old,fine);
  assert.equal(result.refined,1);assert.equal(result.retained,1);
  assert.ok(fineRing.length>currentRing.length);
  assert.deepEqual(geometryOf(result.data,result.data.feats[1]),[[corrected]]);
  assert.deepEqual(previousPrecision({},0.012,3),{tolerance:0.012,decimals:3});
});

test('#R710 ordinary generation describes generated records rather than retained corrections', () => {
  const p=generatedPrecision(0.004,4,17);
  assert.equal(p.refined,17);assert.equal(p.retained,0);
  assert.equal(p.targetTolerance,0.004);assert.equal(p.decimals,4);
  assert.match(p.semantics,/every record generated from source/);
});

test('#R710 source-matching CShapes records improve, corrected geometry stays unchanged, and repeating is idempotent', () => {
  const corrected = [[0,0],[1.2,0],[1.2,1],[0,1],[0,0]];
  const have={...baseline,rings:[square,corrected],feats:[row('polity',[[0]]),row('corrected',[[1]])]};
  const old={...have,rings:[square,square]};
  const fine={...have,rings:[detail,detail]};
  const result=refineCShapes(have,old,fine);
  assert.equal(result.refined,1);assert.equal(result.retained,1);
  assert.deepEqual(geometryOf(result.data,result.data.feats[1]),[[corrected]]);
  assert.deepEqual(refineCShapes(result.data,old,fine),result);
});

test('#R710 the real CShapes simplifier retains sub-kilometre bends and four-digit coordinates', () => {
  const raw=[];
  for(let i=0;i<=100;i++)raw.push([i/100,0.0035*Math.sin(i*Math.PI/20)]);
  raw.push([1,1],[0,1],raw[0]);
  const old=cutCShapesRing(raw,0.008,3), fine=cutCShapesRing(raw);
  assert.ok(fine.length>old.length);
  assert.deepEqual(fine[0],fine.at(-1));
  assert.ok(fine.some(p=>p.some(v=>Math.abs(v*1000-Math.round(v*1000))>1e-6)));
  function error(ring){return Math.max(...raw.map(p=>Math.min(...ring.slice(1).map((b,i)=>{
    const a=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],px=p[0]-a[0],py=p[1]-a[1];
    const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy)||0));
    return Math.hypot(px-t*dx,py-t*dy);
  }))));}
  assert.ok(error(fine)<=0.0021);
  assert.ok(error(fine)<error(old)/2);
});

test('#R710 all shipped refined datasets state the build target separately from retained corrections', () => {
  for(const file of ['cshapes','hist-borders','hist-admin1','hist-admin2']){
    const win={};new Function('window',readFileSync(fileURLToPath(new URL('../data/'+file+'.js',import.meta.url)),'utf8'))(win);
    const data=Object.values(win)[0],p=data.precision;
    assert.ok(p,file+' missing precision provenance');
    assert.ok(p.targetTolerance<=0.004);assert.equal(p.decimals,file==='cshapes'?5:4);
    assert.equal(p.refined+p.retained,data.feats.length);
    assert.ok(p.refined>data.feats.length*0.9,file+' most source shapes were not refined');
    assert.match(p.semantics,/retained/);
    for(const f of data.feats)for(const poly of f[8])for(const i of poly){
      const ring=data.rings[i];assert.ok(ring&&ring.length>=3);
      assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));
    }
  }
});

/* ══ #R711 — the unsimplified source, the eligibility of detail, and the runtime reader ══════ */
const pause = ms => new Promise(r => setTimeout(r, ms));
const ring = [[0,0],[1,0],[1,1],[0,1],[0,0]];
const fine = [[0,0],[0.5,0.0001],[1,0],[1,1],[0,1],[0,0]];

/* (module-graph) js/border-coast.js is IMPORTED fresh per harness: the camera and the clock it imports
   are handed in at its own import edges, and `window`/`fetch` are the page it runs in. */
async function harness(count = 1, wrongKey = false) {
  let zoom = 9, bounds = [-2,-2,2,2], arrivals = 0;
  const listeners = {}, calls = [], waiting = [];
  const d = { rings: Array.from({length:count}, (_, i) => ring.map(p => [p[0] + i * 0.01,p[1]])),
    feats: Array.from({length:count}, (_, i) => ['unit',null,1800,1,1,1900,1,1,[[i]]]) };
  const w = { __TEST: d, __IMBCOAST: { sets: { test: { global: '__TEST', rings: count, draw: Array(count).fill(1) } } } };
  const engine = { camera: { getZoom: () => zoom, getBounds: () => ({ getWest:()=>bounds[0],getSouth:()=>bounds[1],getEast:()=>bounds[2],getNorth:()=>bounds[3] }) },
    events: { on: (name, cb) => { listeners[name] = cb; } } };
  const clock = { on: cb => { listeners.date = cb; } };
  let index;
  const fetch = async path => {
    calls.push(path);
    if (path.endsWith('index.json')) return { ok:true, json:async()=>index };
    return new Promise(resolve => waiting.push(resolve));
  };
  const { IntMapBorderCoast: bc } = await importModule('js/border-coast.js', {
    globals: { window: w, fetch },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engine }, 'js/chronos.js': { IntMapTime: clock } },
  });
  const keys = d.rings.map(r => bc.geometryKey([[r]]));
  index = {v:1,sets:{__TEST:Object.fromEntries(keys.map((key,i)=>[i,[wrongKey?'stale':key,[['chunk'+i+'.json',[-2,-2,2,2]]]]]))}};
  bc.onArrive(() => arrivals++);
  return { bc,d,keys,calls,waiting,listeners,index,arrivals:()=>arrivals,
    move(z,b=bounds){zoom=z;bounds=b;listeners.moveend?.();},
    respond(i,ok=true){waiting[i]({ok,json:async()=>({lines:{[keys[i]]:[fine]}})});} };
}

test('#R711 unsimplified CShapes keeps source bends below the former 0.002 degree cutoff', () => {
  const raw = [[0,0],[0.3,0.00013],[0.7,-0.00014],[1,0],[1,1],[0,1],[0,0]];
  assert.deepEqual(cutCShapesRing(raw),raw);
  assert.ok(cutCShapesRing(raw,0.002,4).length<raw.length);
  assert.deepEqual(previousPrecision({precision:{targetTolerance:0,decimals:5}},0.008,3),{tolerance:0,decimals:5});
});

test('#R711 detail builder rejects corrected geometry and any lost hole/island', () => {
  assert.equal(eligible([[ring]],[[ring]],[[fine]]),true);
  assert.equal(eligible([[fine]],[[ring]],[[fine]]),false);
  assert.equal(eligible([[ring,ring]],[[ring,ring]],[[fine]]),false);
  assert.equal(eligible([[ring],[ring]],[[ring],[ring]],[[fine]]),false);
  const shifted = ring.map(p=>[p[0]+10,p[1]]);
  assert.equal(eligible([[ring,ring],[shifted,shifted]],[[ring,ring],[shifted,shifted]],[[fine],[shifted,shifted,shifted]]),false);
});

test('#R711 the real Florida small hole cannot disappear behind an increased total hole count', () => {
  // CC0: cached OpenHistoricalMap relation 2777322. The old 0.004-degree
  // triangle inflates this hole above MIN_AREA; the finer cut falls below it.
  const hole=[[-80.6532777,28.3604896],[-80.6532777,28.3587896],[-80.6538777,28.3587896],[-80.6536777,28.3579896],[-80.6493777,28.3578896],[-80.6489777,28.3574896],[-80.6495777,28.3568896],[-80.6592757,28.3570886],[-80.6600757,28.3573886],[-80.6595757,28.3578886],[-80.6543777,28.3578896],[-80.6545777,28.3590896],[-80.6548777,28.3590896],[-80.6549777,28.3605896],[-80.6532777,28.3604896]];
  const shell=[[-81,28],[-80,28],[-80,29],[-81,29],[-81,28]], raw=[[shell,hole]];
  const coarse=detailPolys(null,0.004,4,raw),fine=detailPolys(null,0.0005,5,raw);
  assert.equal(coarse[0].length,2);assert.equal(fine[0].length,1);
  fine[0].push([[-80.8,28.8],[-80.79,28.8],[-80.79,28.81],[-80.8,28.81],[-80.8,28.8]]);
  assert.equal(coarse[0].length,fine[0].length);
  assert.equal(eligible(coarse,coarse,fine),false);
});

test('#R711 detail is fetched only for a visible high-zoom outline and replaces its line after arrival', async () => {
  const h=await harness();await h.bc.load();
  h.move(4);assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);assert.equal(h.calls.length,0);
  h.move(9,[20,20,21,21]);h.bc.lineGeom(h.d,0,[1]);await pause(0);assert.equal(h.calls.length,0);
  h.move(9,[-2,-2,2,2]);h.bc.lineGeom(h.d,0,[1]);await pause(0);
  assert.equal(h.calls.length,1);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);assert.equal(h.calls.length,2);
  h.respond(0);await pause(100);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[fine]);
  assert.ok(h.arrivals()>0);
  h.listeners.movestart();
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring],'complete coarse line restored before movement exposes new geography');
});

test('#R711 only intersecting spatial fragments are fetched, and partial arrival keeps a complete fallback', async () => {
  const h=await harness();await h.bc.load();
  h.index.sets.__TEST[0][1].push(['far.json',[30,30,35,35]],['near.json',[0,0,1,1]]);
  h.bc.lineGeom(h.d,0,[1]);await pause(0);h.bc.lineGeom(h.d,0,[1]);await pause(0);
  assert.equal(h.waiting.length,2);assert.ok(!h.calls.some(p=>p.endsWith('far.json')));
  h.respond(0);await pause(0);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);
  h.waiting[1]({ok:true,json:async()=>({lines:{[h.keys[0]]:[fine]}})});await pause(100);
  assert.equal(h.bc.lineGeom(h.d,0,[1]).coordinates.length,2);
});

test('#R711 stale detail index cannot override a corrected outline', async () => {
  const h=await harness(1,true);await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,1);
});

test('#R711 a hidden subdivision fallback does not fetch detail while live tiles supply its boundary', async () => {
  const h=await harness();await h.bc.load();
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1],false).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,0);
});

test('#R711 zero-tolerance source geometry does not download an irrelevant OHM detail index', async () => {
  const h=await harness();h.d.precision={targetTolerance:0};await h.bc.load();
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);assert.equal(h.calls.length,0);
});

for (const change of ['zoom out','date change']) test('#R711 '+change+' discards queued requests and late completion uses current view', async () => {
  const h=await harness(6);await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);
  for(let i=0;i<6;i++)h.bc.lineGeom(h.d,i,Array(6).fill(1));await pause(0);
  assert.equal(h.waiting.length,4);
  if(change==='zoom out')h.move(4);else h.listeners.date();
  for(let i=0;i<4;i++)h.respond(i);await pause(100);
  assert.equal(h.waiting.length,4,'old queued fifth and sixth requests never started');
  if(change==='zoom out')assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);
});

test('#R711 failed detail keeps the coarse line and is retried only on a new view', async () => {
  const h=await harness();await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);h.bc.lineGeom(h.d,0,[1]);await pause(0);
  h.respond(0,false);await pause(0);
  for(let i=0;i<3;i++)assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,2);
  h.move(9);h.bc.lineGeom(h.d,0,[1]);await pause(0);assert.equal(h.calls.length,3);
  h.respond(1,false);
});

/* ══ #R711 — the offline detail gate rejects what it must ═════════════════════════════════ */
/* ⚠ (#R716) THE WHOLE-BUNDLE PASS MOVED TO `npm run check:borderdetail`, which is the same check()
   under a DECLARED name. It is not lost and it is not run twice: reading 409 MB costs 41 s, and until
   this round that cost was paid here under a name no gate table, no CI step and none of the three
   rules that hunt for uncalled gates could see. What stays here is what this file was written for —
   the REJECTION cases, which are what prove the gate can fail at all. */

test('#R711 the offline gate rejects missing/stale assets rather than accepting an index alone', () => {
  const root=mkdtempSync(join(tmpdir(),'intmap-r711-detail-'));
  try {
    mkdirSync(join(root,'data/border-detail'),{recursive:true});
    writeFileSync(join(root,'data/border-detail/index.json'),JSON.stringify({v:1,targetTolerance:0.0005,decimals:5,inlandKm:6,
      source:'OpenHistoricalMap (CC0)',sets:{},stats:{}}));
    assert.throws(()=>check(root));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('#R711 LF and CRLF checkouts measure the same generated bytes without hiding manifest drift', async () => {
  const root=mkdtempSync(join(tmpdir(),'intmap-r712-detail-eol-'));
  try {
    const out=join(root,'data/border-detail');mkdirSync(out,{recursive:true});
    /* (module-graph) the key is the IMPORTED reader's, not one read off a window */
    const { IntMapBorderCoast } = await importModule('js/border-coast.js', { globals: { window: {} } });
    const ring=[[0,0],[1,0],[1,1],[0,1],[0,0]],key=IntMapBorderCoast.geometryKey([[ring]]);
    const index={v:1,targetTolerance:0.0005,decimals:5,inlandKm:6,source:'OpenHistoricalMap (CC0)',sets:{},stats:{}};
    const body=JSON.stringify({lines:{[key]:[ring]},relations:{[key]:1}});
    const hash=createHash('sha256').update(body).digest('hex').slice(0,16);
    const paths=[];
    for(const [name,global] of [['hist-borders','__HISTB'],['hist-admin1','__HISTADM1'],['hist-admin2','__HISTADM2']]) {
      const file=name+'-'+hash+'.json';paths.push(join(out,file));
      writeFileSync(join(root,'data',name+'.js'),'window.'+global+'='+JSON.stringify({rings:[ring],feats:[['unit',4,1800,1,1,1900,1,1,[[0]],{},1]]})+';\n');
      index.sets[global]={0:[key,[[file,[0,0,1,1]]]]};
      index.stats[global]={records:1,refined:1,retained:0,vertices:ring.length,bytes:Buffer.byteLength(body+'\n'),chunks:1};
    }
    const saveIndex=()=>writeFileSync(join(out,'index.json'),JSON.stringify(index)+'\n');saveIndex();
    for(const eol of ['\n','\r\n']) {
      for(const path of paths)writeFileSync(path,body+eol);
      assert.deepEqual(check(root),index.stats);
    }
    index.stats.__HISTB.bytes++;saveIndex();
    assert.throws(()=>check(root),/chunk measurements differ: __HISTB/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

/* ══ #R712 — a partial detail refresh ═════════════════════════════════════════════════════ */
function fixture() {
  const { index, selected } = planDetailBuild(null);
  for (const [file, global] of selected) {
    index.sets[global] = { 0: ['geometry-' + file, [[file + '-0123456789abcdef.json', [0, 0, 1, 1]]]] };
    index.stats[global] = { records: 1, refined: 1, retained: 0, vertices: 5, bytes: 20, chunks: 1 };
  }
  return index;
}

test('#R712 partial admin refresh preserves country manifest and measurements', () => {
  const before = fixture(), snapshot = JSON.stringify(before);
  const { index, selected } = planDetailBuild(before, ['hist-admin1', 'hist-admin2']);
  assert.deepEqual(selected.map(s => s[0]), ['hist-admin1', 'hist-admin2']);
  index.sets.__HISTADM1 = { 1: ['new', [['hist-admin1-fedcba9876543210.json', [1, 1, 2, 2]]]] };
  index.stats.__HISTADM1 = { records: 2, refined: 1, retained: 1, vertices: 8, bytes: 30, chunks: 1 };
  assert.deepEqual(index.sets.__HISTB, before.sets.__HISTB);
  assert.deepEqual(index.stats.__HISTB, before.stats.__HISTB);
  assert.equal(JSON.stringify(before), snapshot);
  const used = detailAssets(index);
  assert.ok(used.has('hist-borders-0123456789abcdef.json'), 'cleanup preserves the unselected country asset');
  assert.ok(used.has('hist-admin1-fedcba9876543210.json'));
  assert.ok(!used.has('hist-admin1-0123456789abcdef.json'), 'cleanup releases the replaced admin asset');
});

test('#R712 partial builds reject incompatible shared provenance before writing', () => {
  const before = fixture();
  for (const [key, value] of Object.entries({ v: 2, source: 'other', targetTolerance: 0.01, decimals: 4, inlandKm: -1 }))
    assert.throws(() => planDetailBuild({ ...before, [key]: value }, ['hist-admin1']), /incompatible/);
  for (const names of [[], ['unknown'], ['hist-admin1', 'hist-admin1'], ['']])
    assert.throws(() => planDetailBuild(before, names), /--sets/);
  assert.throws(() => planDetailBuild(null, ['hist-admin1']), /existing index/);
  assert.throws(() => planDetailBuild({ ...before, stats: {} }, ['hist-admin1']), /no stats/);
  assert.throws(() => planDetailBuild({ ...before, sets: { ...before.sets, __UNKNOWN: {} } }, ['hist-admin1']), /unknown/);
});

test('#R712 full rebuild starts every set fresh and does not inherit stale index metadata', () => {
  const { index, selected } = planDetailBuild({ broken: true });
  assert.equal(selected.length, 3);
  assert.deepEqual(index.sets, {});
  assert.deepEqual(index.stats, {});
  assert.equal(index.broken, undefined);
});
