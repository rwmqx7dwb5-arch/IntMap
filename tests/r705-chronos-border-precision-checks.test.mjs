import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { validateStyleMin, createExpression } from '@maplibre/maplibre-gl-style-spec';
import { transformSync } from 'esbuild';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the nine positions the app resolves a tuple by, in the order js/time-admin1.js:112 records */
const SLOT = { en: 0, jp: 1, de: 2, ru: 3, es: 4, zh: 5, 'zh-hans': 6, fr: 7, ko: 8 };

/* the module, evaluated. The stubs are deliberately inert — anything the module asks of the
   renderer answers a proxy that records nothing, so nothing here can stand in for behaviour the
   module was supposed to have (#R585: a stub richer than the real thing repairs bugs in passing). */
function loadModule(lang = 'en') {
  const noop = () => {};
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  const win = {
    addEventListener: noop, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0,
    IntMapModules: {}, IntMapGeoEngine: chain, IntMapTime: { on: noop },
    /* ⚠ THE OTHER TWO BUNDLES ARE HONESTLY ABSENT HERE. data/cshapes.js and data/hist-borders.js
       are fetched with a <script> tag; this context has no loader, so every such tag fails, which
       is the real degraded path (#R518 demoted the snapshots to exactly that fallback). Nothing is
       faked into place: the snapshot tier answers because it is the tier that can. */
    document: {
      getElementById: () => null,
      createElement: () => { const el = {}; queueMicrotask(() => { try { el.onerror && el.onerror(); } catch (_) {} }); return el; },
      head: { appendChild: noop },
    },
    IntMapLang: {
      pickArgs: () => ((...a) => a),
      pick: (get) => ({ arr: (a) => a[SLOT[get()] ?? 0] }),
      htmlTag: (l) => (l === 'zh' ? 'zh-Hant' : l === 'jp' ? 'ja' : l === 'zh-hans' ? 'zh-Hans' : l),
      t: (_l, ...r) => r[0], index: () => ({}),
    },
    /* the era word is the platform's (js/hist-scale.js); this context has Intl, so use the owner */
    IntMapHistScale: null,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(rd('js/hist-scale.js'), ctx);
  vm.runInContext(rd('data/hist-eras.js'), ctx);
  vm.runInContext(rd('js/time-borders.js'), ctx);
  const HOST = { lang, canDraw: () => false, isMobile: () => false };
  return { mod: ctx.window.IntMapModules.timeBorders(HOST), bundle: ctx.window.__HISTERAS, HOST, win };
}


test('shipped era precision survives decoding into map and popup features', async () => {
  const { mod, bundle } = loadModule();
  const snap = bundle.snaps.find(s => s.y < 0 && s.feats.some(f => f[1].bp != null));
  await mod._go(snap.y);
  const fc = mod.currentFC();
  let checked = 0;
  for (const ft of snap.feats) {
    if (ft[1].bp == null) continue;
    const f = fc.features.find(f => f.properties.NAME === ft[0].en);
    assert.ok(f);
    assert.equal(f.properties.BORDERPRECISION, ft[1].bp);
    assert.ok(mod.typeNote(f).includes('approximate'));
    checked++;
  }
  assert.ok(checked > 0);
});
test('polygon to coast-trimmed lines preserves source properties', () => {
  const win = { __IMBCOAST: { sets: {} } }; win.window=win;
  vm.runInNewContext(rd('js/border-coast.js'), win);
  const properties = { NAME: 'source feature', BORDERPRECISION: 2, TYPE: 'region' };
  const f = { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } };
  const lines = win.IntMapBorderCoast.wholeLines({type:'FeatureCollection',features:[f]});
  assert.equal(lines.features.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(lines.features[0].properties)), properties);
  assert.notEqual(lines.features[0].properties, properties);
});
test('precision note uses source semantics and never invents a classification', () => {
  for (const lang of ['en','jp']) {
    const { mod }=loadModule(lang);
    const notes=[1,2,3].map(bp=>mod.typeNote({properties:{BORDERPRECISION:bp}}));
    assert.equal(new Set(notes).size,3);
    assert.ok(notes.every(Boolean));
    assert.match(notes[2],lang==='jp'?/国際法/:/international law/);
    assert.equal(mod.typeNote({properties:{BORDERPRECISION:99}}),'');
    assert.equal(mod.typeNote({properties:{}}),'');
  }
});

test('unnamed geometry retains its own source precision without gaining a name', async () => {
  const { mod, bundle } = loadModule();
  let checked = 0;
  for (const snap of bundle.snaps.filter(s => s.y < 0)) {
    assert.equal(snap.blankPrecision.length, snap.blank.length);
    await mod._go(snap.y);
    const blank = mod.currentFC().features.filter(f => f.properties.NAME === '');
    assert.equal(blank.length, snap.blank.length);
    for (let i=0;i<blank.length;i++) {
      assert.equal(blank[i].properties.BORDERPRECISION, snap.blankPrecision[i]);
      assert.equal(blank[i].properties.TYPE, undefined);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

async function borderLayer() {
  const {mod,bundle,HOST,win}=loadModule();
  const defs=new Map(), sources=new Map();
  const noop=()=>{};
  const chain=new Proxy(function(){},{get:()=>chain,apply:()=>chain});
  win.IntMapGeoEngine=new Proxy({layers:{has:id=>defs.has(id),hasSource:id=>sources.has(id),
    add:def=>defs.set(def.id,def),addSource:(id,def)=>sources.set(id,def),setSourceData:noop}},
    {get:(t,k)=>k in t?t[k]:chain});
  win._applyBorders=noop;HOST.canDraw=()=>true;
  await mod._go(bundle.snaps[0].y);
  assert.ok(defs.has('imtb-line'));
  return JSON.parse(JSON.stringify(defs.get('imtb-line')));
}
test('actual border style validates and distinguishes source precision with visible strokes',async()=>{
  const layer=await borderLayer();
  const errors=validateStyleMin({version:8,sources:{'imtb-ln-src':{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[layer]});
  assert.deepEqual(errors,[]);
  const expression=createExpression(layer.paint['line-dasharray']);
  assert.equal(expression.result,'success');
  const read=bp=>expression.value.evaluate({zoom:4},{properties:bp==null?{}:{BORDERPRECISION:bp}});
  assert.deepEqual(read(1),[2,2]);assert.deepEqual(read(2),[6,2]);
  assert.deepEqual(read(3),[1,0]);assert.deepEqual(read(null),[1,0]);
  assert.equal(layer.paint['line-opacity'],0.95);
});
test('historical theme updates choose a contrasting stroke and leave Now untouched',()=>{
  const win={};win.window=win;
  vm.runInNewContext(transformSync(rd('js/border-style.js'),{format:'iife'}).code,win);
  const borderColor=win.IntMapBorderStyle.colorFor;
  vm.runInNewContext(rd('js/historical-basemap.js'),win);
  const paint=[];
  const engine={layers:{hasSource:()=>true,has:()=>true,setPaint:(...a)=>paint.push(a),setLayout:()=>{}},scene:{getStyle:()=>({layers:[]})}};
  win.IntMapHistoricalBasemap.apply(engine,{active:true,sat:false,light:true});
  assert.equal(paint.find(a=>a[0]==='imtb-line')[2],borderColor(true));
  paint.length=0;win.IntMapHistoricalBasemap.apply(engine,{active:true,sat:false,light:false});
  assert.equal(paint.find(a=>a[0]==='imtb-line')[2],borderColor(false));
  assert.notEqual(borderColor(true),borderColor(false));
  assert.equal(borderColor(true,true),borderColor(false));
  paint.length=0;win.IntMapHistoricalBasemap.apply(engine,{active:false,sat:false,light:true});
  assert.equal(paint.length,0);
});
test('Cesium preserves dash ratios and represents zero gaps with solid material',async()=>{
  const win={};win.window=win;
  vm.runInNewContext(rd('js/cesium-style.js'),win);
  vm.runInNewContext(rd('js/cesium-layers.js'),win);
  class Color {constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
  class Dash {constructor(opts){Object.assign(this,opts);}}
  class Source {constructor(){this.entities={values:[],suspendEvents(){},resumeEvents(){},removeAll(){this.values=[];},add(e){this.values.push(e);return e;}};}}
  const C={Matrix4:class {},Cartesian4:class {},Cartesian2:class {},Color,PolylineDashMaterialProperty:Dash,CustomDataSource:Source,Cartesian3:{fromDegreesArray:a=>a},ArcType:{GEODESIC:1}};
  const renderer=win.IntMapCesiumLayers.makeVectorRenderer(C),layer=await borderLayer();
  const feature=bp=>({type:'Feature',properties:{BORDERPRECISION:bp},geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}});
  const ds=renderer.build(layer,[1,2,3].map(feature),{zoom:4,maxFeatures:10});
  const materials=ds.entities.values.map(e=>e.polyline.material);
  assert.equal(materials.length,3);
  assert.ok(materials[0] instanceof Dash);assert.ok(materials[1] instanceof Dash);assert.ok(materials[2] instanceof Color);
  assert.notEqual(materials[0].dashPattern,materials[1].dashPattern);
  assert.equal(materials[1].dashLength/materials[0].dashLength,2);
});
