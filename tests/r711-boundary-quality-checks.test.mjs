import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutCShapesRing } from '../scripts/build-cshapes.mjs';
import { previousPrecision } from '../scripts/histborders/precision.mjs';
import { eligible } from '../scripts/build-border-detail.mjs';
import { detailPolys } from '../scripts/build-hist-admin1.mjs';

const source = readFileSync(new URL('../js/border-coast.js', import.meta.url), 'utf8');
const pause = ms => new Promise(r => setTimeout(r, ms));
const ring = [[0,0],[1,0],[1,1],[0,1],[0,0]];
const fine = [[0,0],[0.5,0.0001],[1,0],[1,1],[0,1],[0,0]];

function harness(count = 1, wrongKey = false) {
  let zoom = 9, bounds = [-2,-2,2,2], arrivals = 0;
  const listeners = {}, calls = [], waiting = [];
  const d = { rings: Array.from({length:count}, (_, i) => ring.map(p => [p[0] + i * 0.01,p[1]])),
    feats: Array.from({length:count}, (_, i) => ['unit',null,1800,1,1,1900,1,1,[[i]]]) };
  const w = { __TEST: d, __IMBCOAST: { sets: { test: { global: '__TEST', rings: count, draw: Array(count).fill(1) } } },
    IntMapGeoEngine: { camera: { getZoom: () => zoom, getBounds: () => ({ getWest:()=>bounds[0],getSouth:()=>bounds[1],getEast:()=>bounds[2],getNorth:()=>bounds[3] }) },
      events: { on: (name, cb) => { listeners[name] = cb; } } }, IntMapTime: { on: cb => { listeners.date = cb; } } };
  let index;
  const fetch = async path => {
    calls.push(path);
    if (path.endsWith('index.json')) return { ok:true, json:async()=>index };
    return new Promise(resolve => waiting.push(resolve));
  };
  new Function('window','fetch','setTimeout','clearTimeout','AbortController',source)(w,fetch,setTimeout,clearTimeout,AbortController);
  const bc = w.IntMapBorderCoast;
  const keys = d.rings.map(r => bc.geometryKey([[r]]));
  index = {v:1,sets:{__TEST:Object.fromEntries(keys.map((key,i)=>[i,[wrongKey?'stale':key,[['chunk'+i+'.json',[-2,-2,2,2]]]]]))}};
  bc.onArrive(() => arrivals++);
  return { bc,d,keys,calls,waiting,listeners,index,arrivals:()=>arrivals,
    move(z,b=bounds){zoom=z;bounds=b;listeners.moveend?.();},
    respond(i,ok=true){waiting[i]({ok,json:async()=>({lines:{[keys[i]]:[fine]}})});} };
}

test('unsimplified CShapes keeps source bends below the former 0.002 degree cutoff', () => {
  const raw = [[0,0],[0.3,0.00013],[0.7,-0.00014],[1,0],[1,1],[0,1],[0,0]];
  assert.deepEqual(cutCShapesRing(raw),raw);
  assert.ok(cutCShapesRing(raw,0.002,4).length<raw.length);
  assert.deepEqual(previousPrecision({precision:{targetTolerance:0,decimals:5}},0.008,3),{tolerance:0,decimals:5});
});

test('detail builder rejects corrected geometry and any lost hole/island', () => {
  assert.equal(eligible([[ring]],[[ring]],[[fine]]),true);
  assert.equal(eligible([[fine]],[[ring]],[[fine]]),false);
  assert.equal(eligible([[ring,ring]],[[ring,ring]],[[fine]]),false);
  assert.equal(eligible([[ring],[ring]],[[ring],[ring]],[[fine]]),false);
  const shifted = ring.map(p=>[p[0]+10,p[1]]);
  assert.equal(eligible([[ring,ring],[shifted,shifted]],[[ring,ring],[shifted,shifted]],[[fine],[shifted,shifted,shifted]]),false);
});

test('the real Florida small hole cannot disappear behind an increased total hole count', () => {
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

test('detail is fetched only for a visible high-zoom outline and replaces its line after arrival', async () => {
  const h=harness();await h.bc.load();
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

test('only intersecting spatial fragments are fetched, and partial arrival keeps a complete fallback', async () => {
  const h=harness();await h.bc.load();
  h.index.sets.__TEST[0][1].push(['far.json',[30,30,35,35]],['near.json',[0,0,1,1]]);
  h.bc.lineGeom(h.d,0,[1]);await pause(0);h.bc.lineGeom(h.d,0,[1]);await pause(0);
  assert.equal(h.waiting.length,2);assert.ok(!h.calls.some(p=>p.endsWith('far.json')));
  h.respond(0);await pause(0);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);
  h.waiting[1]({ok:true,json:async()=>({lines:{[h.keys[0]]:[fine]}})});await pause(100);
  assert.equal(h.bc.lineGeom(h.d,0,[1]).coordinates.length,2);
});

test('stale detail index cannot override a corrected outline', async () => {
  const h=harness(1,true);await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,1);
});

test('a hidden subdivision fallback does not fetch detail while live tiles supply its boundary', async () => {
  const h=harness();await h.bc.load();
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1],false).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,0);
});

test('zero-tolerance source geometry does not download an irrelevant OHM detail index', async () => {
  const h=harness();h.d.precision={targetTolerance:0};await h.bc.load();
  assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);assert.equal(h.calls.length,0);
});

for (const change of ['zoom out','date change']) test(change+' discards queued requests and late completion uses current view', async () => {
  const h=harness(6);await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);
  for(let i=0;i<6;i++)h.bc.lineGeom(h.d,i,Array(6).fill(1));await pause(0);
  assert.equal(h.waiting.length,4);
  if(change==='zoom out')h.move(4);else h.listeners.date();
  for(let i=0;i<4;i++)h.respond(i);await pause(100);
  assert.equal(h.waiting.length,4,'old queued fifth and sixth requests never started');
  if(change==='zoom out')assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);
});

test('failed detail keeps the coarse line and is retried only on a new view', async () => {
  const h=harness();await h.bc.load();h.bc.lineGeom(h.d,0,[1]);await pause(0);h.bc.lineGeom(h.d,0,[1]);await pause(0);
  h.respond(0,false);await pause(0);
  for(let i=0;i<3;i++)assert.deepEqual(h.bc.lineGeom(h.d,0,[1]).coordinates,[ring]);await pause(0);
  assert.equal(h.calls.length,2);
  h.move(9);h.bc.lineGeom(h.d,0,[1]);await pause(0);assert.equal(h.calls.length,3);
  h.respond(1,false);
});
