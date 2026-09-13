import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { refineCShapes, cutCShapesRing } from '../scripts/build-cshapes.mjs';
import { geometryOf, repoolGeometry, previousPrecision, generatedPrecision } from '../scripts/histborders/precision.mjs';

const square = [[0,0],[1,0],[1,1],[0,1],[0,0]];
const detail = [[0,0],[0.5,0.0001],[1,0],[1,1],[0,1],[0,0]];
const row = (name, rings) => [name, 7, 1900,1,1,1910,1,1,rings,{jp:'出典名'},123];
const baseline = {v:2,src:'source and licence',window:[1900,1910],dates:{123:{source:'original'}},rings:[square],feats:[row('polity',[[0]])]};

test('precision replacement preserves every identity, date, label, and arbitrary source metadata', () => {
  const result = repoolGeometry(baseline, () => [[detail]]);
  assert.equal(result.refined, 1);
  assert.deepEqual({...result.data,rings:baseline.rings,feats:baseline.feats},baseline);
  assert.deepEqual(result.data.feats[0].filter((_,i)=>i!==8),baseline.feats[0].filter((_,i)=>i!==8));
  assert.deepEqual(geometryOf(result.data,result.data.feats[0]),[[detail]]);
  assert.deepEqual(repoolGeometry(result.data,()=>[[detail]]).data,result.data);
});

test('missing source, island loss and inner-ring loss keep the existing geometry', () => {
  const withParts = {...baseline, rings:[square,detail],feats:[row('polity',[[0,1],[1]])]};
  for(const next of [null,[],[[detail]],[[detail],[detail]]]) {
    const result=repoolGeometry(withParts,()=>next);
    assert.equal(result.retained,1);
    assert.deepEqual(geometryOf(result.data,result.data.feats[0]),geometryOf(withParts,withParts.feats[0]));
  }
});

test('an extra island cannot compensate for deleting an inner ring', () => {
  const withHole = {...baseline,rings:[square,detail],feats:[row('polity',[[0,1]])]};
  const result = repoolGeometry(withHole,()=>[[square],[detail]]);
  assert.equal(result.retained,1);
  assert.deepEqual(geometryOf(result.data,result.data.feats[0]),[[square,detail]]);
});

test('later refinement reproduces the previous target while preserving corrections', () => {
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

test('ordinary generation describes generated records rather than retained corrections', () => {
  const p=generatedPrecision(0.004,4,17);
  assert.equal(p.refined,17);assert.equal(p.retained,0);
  assert.equal(p.targetTolerance,0.004);assert.equal(p.decimals,4);
  assert.match(p.semantics,/every record generated from source/);
});

test('source-matching CShapes records improve, corrected geometry stays unchanged, and repeating is idempotent', () => {
  const corrected = [[0,0],[1.2,0],[1.2,1],[0,1],[0,0]];
  const have={...baseline,rings:[square,corrected],feats:[row('polity',[[0]]),row('corrected',[[1]])]};
  const old={...have,rings:[square,square]};
  const fine={...have,rings:[detail,detail]};
  const result=refineCShapes(have,old,fine);
  assert.equal(result.refined,1);assert.equal(result.retained,1);
  assert.deepEqual(geometryOf(result.data,result.data.feats[1]),[[corrected]]);
  assert.deepEqual(refineCShapes(result.data,old,fine),result);
});

test('the real CShapes simplifier retains sub-kilometre bends and four-digit coordinates', () => {
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

test('all shipped refined datasets state the build target separately from retained corrections', () => {
  for(const file of ['cshapes','hist-borders','hist-admin1','hist-admin2']){
    const win={};new Function('window',readFileSync(fileURLToPath(new URL('../data/'+file+'.js',import.meta.url)),'utf8'))(win);
    const data=Object.values(win)[0],p=data.precision;
    assert.ok(p,file+' missing precision provenance');
    assert.ok(p.targetTolerance<=0.004);assert.equal(p.decimals,4);
    assert.equal(p.refined+p.retained,data.feats.length);
    assert.ok(p.refined>data.feats.length*0.9,file+' most source shapes were not refined');
    assert.match(p.semantics,/retained/);
    for(const f of data.feats)for(const poly of f[8])for(const i of poly){
      const ring=data.rings[i];assert.ok(ring&&ring.length>=3);
      assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));
    }
  }
});
