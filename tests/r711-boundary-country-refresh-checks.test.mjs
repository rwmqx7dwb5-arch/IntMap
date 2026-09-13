/* The actual country module must consume the detail loader's arrival notification.
 * A reader test calling lineGeom itself cannot catch a missing source repaint. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness(global,years){
 const sources=new Map(),layers=new Map(),writes=[],callbacks=[],detail=new Map();
 const rings=[0,10].map(x=>[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]);
 const d={rings,feats:years.map((y,i)=>[global==='__HISTB'?{en:'Unit '+i}:'Unit '+i,i+1,y,1,1,y+9,12,31,[[i]]])};
 const geometry=(idx)=>({type:'MultiLineString',coordinates:[detail.get(idx)||rings[idx]]});
 const bc={load:async()=>({}),marks:()=>[1,1],onArrive:cb=>callbacks.push(cb),lineGeom:(_d,i)=>geometry(i),wholeLines:fc=>({type:'FeatureCollection',features:fc.features.map(f=>({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:f.geometry.coordinates}}))})};
 const noop=()=>{};
 const w={window:null,[global]:d,IntMapModules:{},IntMapBorderCoast:bc,
  IntMapTime:{on:noop},addEventListener:noop,setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,
  _applyBorders:noop,navigator:{language:'en'},
  document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild:noop},documentElement:{setAttribute:noop}},
  IntMapGeoEngine:{hasRenderer:()=>true,ready:()=>true,
   layers:{hasSource:id=>sources.has(id),addSource:(id,s)=>sources.set(id,s.data),setSourceData:(id,s)=>{sources.set(id,s);writes.push(id);},has:id=>layers.has(id),get:id=>layers.get(id),add:l=>layers.set(l.id,l),setLayout:noop,setPaint:noop,getLayout:()=>undefined,move:noop},
   events:{on:noop,onLayer:noop,clickLayers:()=>[]},coords:{queryRenderedFeatures:()=>[]},render:{canvas:()=>({style:{}})}
  }
 };
 w.window=w;const ctx=vm.createContext(w);
 for(const p of ['js/locales/_langs.js','js/lang-registry.js','js/label-scale.js','js/hist-scale.js','js/time-borders.js'])vm.runInContext(read(p),ctx);
 const mod=w.IntMapModules.timeBorders({lang:'en',canDraw:()=>true,isMobile:()=>false});
 return {mod,sources,writes,rings, async arrive(idx){const r=rings[idx];detail.set(idx,[r[0],[r[0][0]+0.5,0.0002],...r.slice(1)]);await Promise.resolve();callbacks.forEach(cb=>cb());},fine:idx=>detail.get(idx)};
}
for(const [global,years] of [['__HISTB',[1840,1850]],['__CSHAPES',[1890,1900]]]){
 test(global+': arrival repaints current line without resetting territory, labels or clock',async()=>{
  const h=harness(global,years);await h.mod._go(years[0]+2);
  assert.ok(h.sources.get('imtb-ln-src')?.features.length,'country line was initially drawn');
  const territory=h.sources.get('imtb-src'),labels=h.sources.get('imtb-lbl-src'),current=h.mod.currentFC(),date=h.mod.current();
  h.writes.length=0;await h.arrive(0);
  assert.deepEqual(h.writes,['imtb-ln-src']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sources.get('imtb-ln-src').features[0].geometry.coordinates)),[h.fine(0)]);
  assert.equal(h.sources.get('imtb-src'),territory);assert.equal(h.sources.get('imtb-lbl-src'),labels);
  assert.equal(h.mod.currentFC(),current);assert.equal(h.mod.current(),date);
 });
 test(global+': a reply from the prior date never restores the prior territory',async()=>{
  const h=harness(global,years);await h.mod._go(years[0]+2);await h.mod._go(years[1]+2);
  const current=h.mod.currentFC(),territory=h.sources.get('imtb-src'),labels=h.sources.get('imtb-lbl-src');
  h.writes.length=0;await h.arrive(0);
  assert.deepEqual(h.writes,['imtb-ln-src']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sources.get('imtb-ln-src').features[0].geometry.coordinates)),[h.rings[1]]);
  assert.equal(h.mod.currentFC(),current);assert.equal(h.sources.get('imtb-src'),territory);assert.equal(h.sources.get('imtb-lbl-src'),labels);
  h.mod._clear();h.writes.length=0;await h.arrive(1);assert.deepEqual(h.writes,[],'Now remains empty after late arrival');
 });
}
