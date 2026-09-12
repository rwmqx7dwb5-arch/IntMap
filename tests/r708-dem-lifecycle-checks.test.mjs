import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url), 'utf8');
function harness() {
  const pending=[];
  const ctx=vm.createContext({ Float32Array, Map, Symbol, AbortController,
    fetch: () => new Promise(resolve=>pending.push(resolve)),
    createImageBitmap: async()=>({width:256,close(){}}),
    OffscreenCanvas: class {getContext(){return {drawImage(){},getImageData(){return {data:new Uint8Array(256*256*4)}}}}}
  });
  ctx.window=ctx; vm.runInContext(read('js/mem-budget.js'),ctx); vm.runInContext(read('js/cesium-layers.js'),ctx);
  const complete=()=>pending.shift()({ok:true,blob:async()=>({})});
  return {ctx,complete,make:()=>ctx.IntMapCesiumLayers.makeDemCache()};
}
test('independent DEM views are counted and releasing one preserves the other', async()=>{
  const h=harness(), a=h.make(), b=h.make();
  let p=a.get(1,0,0);h.complete();await p;
  p=b.get(1,1,0);h.complete();await p;
  assert.equal(h.ctx.IntMapMemBudget.heldBytes(), 2*262144);
  a.destroy(); assert.equal(h.ctx.IntMapMemBudget.heldBytes(),262144);
  b.destroy(); assert.equal(h.ctx.IntMapMemBudget.heldBytes(),0);
  assert.equal(h.ctx.IntMapMemBudget.stores().length,0);
});
test('a cleared DEM request cannot repopulate cache or erase its replacement',async()=>{
  const h=harness(), a=h.make(); const old=a.get(1,0,0); a.clear();
  const fresh=a.get(1,0,0); h.complete(); await old;
  assert.equal(a.size(),0);
  assert.equal(a.get(1,0,0),fresh);
  h.complete();const data=await fresh;assert.equal(data.length,65536);assert.equal(a.size(),1);
});
test('destroy rejects late DEM completions, unregisters, and cannot start new work',async()=>{
  const h=harness(), a=h.make();const pending=a.get(2,1,1);a.destroy();h.complete();
  assert.equal(await pending,null);assert.equal(a.size(),0);
  assert.equal(h.ctx.IntMapMemBudget.stores().length,0);
  assert.equal(await a.get(2,1,1),null);
});
test('destroyed view stops external timers, clock subscription and child resources once',()=>{
  const src=read('js/cesium-engine.js'),ast=parse(src,{ecmaVersion:'latest',sourceType:'module'});
  let cls; const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='ClassDeclaration'&&n.id.name==='CesiumView')cls=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)};walk(ast);
  const methods=cls.body.body.filter(n=>['destroy','_airHalt'].includes(n.key?.name)).map(n=>src.slice(n.start,n.end)).join(',');
  const stopped=[], released=[];const proto=vm.runInNewContext('({'+methods+'})',{stopTick:k=>stopped.push(k),clearTimeout(){}});
  const view=Object.assign(Object.create(proto),{_skyTick:'sky',_airTimer:'air',_timeOff:()=>released.push('clock'),_dem:{destroy:()=>released.push('dem')},_sources:new Map([['v',{vt:{destroy:()=>released.push('vector')}}]]),_dsDisplay:{destroy:()=>released.push('display')},_widget:{destroy:()=>released.push('widget')}});
  view.destroy(); view.destroy();
  assert.deepEqual(stopped.sort(),['air','sky']);assert.deepEqual(released.sort(),['clock','dem','display','vector','widget']);
});
function overlayHarness() {
  const src=read('js/cesium-engine.js');let fn;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='makeOverlay')fn=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}
  walk(parse(src,{ecmaVersion:'latest',sourceType:'module'}));
  function element(){return {style:{},children:[],listeners:new Map(),appendChild(c){this.children.push(c);c.parentNode=this},setAttribute(){},addEventListener(k,f){this.listeners.set(k,f)},remove(){this.parentNode=null}}}
  const frames=new Map();let next=0;
  const make=vm.runInNewContext('('+src.slice(fn.start,fn.end)+')',{
    document:{createElement:element,documentElement:{lang:'en'}},window:{IntMapLang:{t:()=>''}},
    normLngLat:ll=>ll,requestAnimationFrame:f=>{frames.set(++next,f);return next},cancelAnimationFrame:id=>frames.delete(id)
  });
  function view(){const events=new Map(),host=element();return {_widget:{},getContainer:()=>host,
    on(k,f){if(!events.has(k))events.set(k,[]);events.get(k).push(f)},
    off(k,f){events.set(k,(events.get(k)||[]).filter(x=>x!==f))},
    count:()=>[...events.values()].reduce((a,b)=>a+b.length,0),fire(k){for(const f of (events.get(k)||[]).slice())f()}}}
  return {make,frames,view};
}
test('removed overlays return all view listeners and queued frames after repeated reuse',()=>{
  const h=overlayHarness(),v=h.view(),p=h.make(()=>v,'popup',{});
  p.setLngLat([0,0]);assert.equal(h.frames.size,0);
  for(let i=0;i<100;i++){
    p.addTo(v).addTo(v);assert.equal(v.count(),4);assert.equal(h.frames.size,1);
    p.remove();assert.equal(v.count(),0);assert.equal(h.frames.size,0);
  }
});
test('overlay migration detaches previous view and preserves close-on-click options and button',()=>{
  const h=overlayHarness(),a=h.view(),b=h.view();let closes=0;
  const p=h.make(()=>a,'popup',{onClose:()=>closes++});
  p.addTo(a).addTo(b);assert.equal(a.count(),0);assert.equal(b.count(),4);
  a.fire('click');assert.equal(p.isOpen(),true);
  b.fire('click');assert.equal(p.isOpen(),false);assert.equal(closes,1);assert.equal(b.count(),0);
  const pinned=h.make(()=>a,'popup',{closeOnClick:false});pinned.addTo(a);
  assert.equal(a.count(),3);a.fire('click');assert.equal(pinned.isOpen(),true);
  const content=pinned.getElement().children[1],button=content.children[0];button.listeners.get('click')();
  assert.equal(pinned.isOpen(),false);assert.equal(a.count(),0);assert.equal(h.frames.size,0);
});
