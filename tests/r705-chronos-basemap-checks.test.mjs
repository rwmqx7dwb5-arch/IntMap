import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{},console});
for(const file of ['js/historical-basemap.js','js/cesium-style.js']) vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),ctx);
const base=ctx.window.IntMapHistoricalBasemap, style=ctx.window.IntMapStyle;
function engine(){
  const defs=['layer-sat','layer-light','layer-light-nl','layer-dark','layer-dark-nl','imtb-fill','imtb-line'].map(id=>({id,type:id.startsWith('layer-')?'raster':'fill',layout:{visibility:'none'}}));
  defs.unshift({id:'world-floor',type:'raster',layout:{visibility:'none'}},{id:'polar-cap',type:'background',layout:{visibility:'visible'}});
  const get=id=>defs.find(d=>d.id===id);
  return {defs,scene:{getStyle:()=>({layers:defs})},layers:{hasSource:()=>true,has:id=>!!get(id),add:(d,b)=>defs.splice(b?defs.findIndex(x=>x.id===b):defs.length,0,d),setPaint:(id,k,v)=>{get(id).paint={...get(id).paint,[k]:v};},setLayout:(id,k,v)=>{get(id).layout[k]=v;}}};
}
test('Chronos replaces all baked political rasters and restores each current map / satellite choice',()=>{
  const e=engine();
  for(const light of [true,false]) for(const sat of [true,false]) for(const labels of [true,false]) for(const active of [true,false]){
    base.apply(e,{active,sat,light,labels});
    for(const d of e.defs.filter(d=>d.id.startsWith('layer-')&&d.id!=='layer-sat')) assert.equal(d.layout.visibility,(!active&&!sat&&d.id===`layer-${light?'light':'dark'}${labels?'':'-nl'}`)?'visible':'none');
    for(const d of e.defs.filter(d=>d.id.startsWith('imhb-'))) assert.equal(d.layout.visibility,active&&!sat?'visible':'none');
  }
  assert.equal(new Set(e.defs.map(d=>d.id)).size,e.defs.length);
  assert.ok(e.defs.findIndex(d=>d.id==='imhb-ground')>e.defs.findIndex(d=>d.id==='polar-cap'));
  assert.ok(e.defs.findIndex(d=>d.id==='imhb-water')<e.defs.findIndex(d=>d.id==='imtb-fill'));
});
test('physical geography excludes modern built land use and engineered waterways',()=>{
  for(const light of [true,false]){
    const defs=base.definitions(light);
    assert.ok(defs.every(d=>!['boundary','place','transportation','building','landuse','poi'].includes(d['source-layer'])));
    const cover=defs.find(d=>d['source-layer']==='landcover');
    for(const subclass of ['farmland','forest','garden','golf_course','park','village_green','allotments','flowerbed','residential','commercial']) assert.equal(style.evaluate(cover.filter,{properties:{subclass}}),false,subclass);
    assert.equal(style.evaluate(cover.filter,{properties:{subclass:'wood'}}),true);
    const water=defs.find(d=>d['source-layer']==='water');
    for(const cl of ['swimming_pool','dock','pond']) assert.equal(style.evaluate(water.filter,{properties:{class:cl}}),false);
    assert.equal(style.evaluate(water.filter,{properties:{class:'ocean'}}),true);
    const river=defs.find(d=>d['source-layer']==='waterway');
    for(const cl of ['canal','ditch','drain']) assert.equal(style.evaluate(river.filter,{properties:{class:cl}}),false);
    assert.equal(style.evaluate(river.filter,{properties:{class:'river'}}),true);
    assert.equal(style.evaluate(river.filter,{properties:{class:'river',brunnel:'tunnel'}}),false);
    for(const z of [0,5,12,18]) assert.ok(style.resolveNum(river.paint['line-width'],{zoom:z},NaN)>0);
  }
  assert.deepEqual(Array.from(style.gaps()),[]);
});
import {validateStyleMin} from '@maplibre/maplibre-gl-style-spec';
import {parse} from 'acorn';
import {simple} from 'acorn-walk';
test('both themes validate against the actual MapLibre style schema',()=>{
  for(const light of [true,false]) assert.deepEqual(validateStyleMin({version:8,sources:{ofm:{type:'vector',url:'https://tiles.openfreemap.org/planet'}},layers:base.definitions(light)}),[]);
});
test('Cesium background respects visibility, order, paint changes and restores its default',()=>{
  const source=fs.readFileSync(new URL('../js/cesium-engine.js',import.meta.url),'utf8');
  let cls;
  simple(parse(source,{ecmaVersion:'latest',sourceType:'module'}),{ClassDeclaration(n){if(n.id.name==='CesiumView') cls=n;}});
  const methods=['_applyBackground','_sameStyleValue','setVisible','setPaint','removeLayer','moveLayer'];
  const code=cls.body.body.filter(n=>methods.includes(n.key.name)).map(n=>source.slice(n.start,n.end)).join('\n');
  const proto=new Function('Cesium','S',`return class {${code}}.prototype;`)({Color:class {constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}},()=>style);
  const fallback={default:true};
  const mk=(id,color,visibility='visible')=>({kind:'background',def:{id,paint:{'background-color':color},layout:{visibility}}});
  const a=mk('a','#112233'),b=mk('b','#aabbcc','none');
  const view=Object.assign(Object.create(proto),{_layers:[a,b],_layerById:new Map([['a',a],['b',b]]),_globe:{},_defaultBaseColor:fallback,_scene:{requestRender(){}},getZoom:()=>4,_schedule(){},_teardownLayer(){},fire(){},_reorderImagery(){},_buildLayer(){this._applyBackground();}});
  view._applyBackground();assert.equal(view._globe.baseColor.r,17/255);
  view.setVisible('b',true);assert.equal(view._globe.baseColor.r,170/255);
  view.setPaint('a','background-color','#ff0000');assert.equal(view._globe.baseColor.r,170/255);
  view.moveLayer('b','a');assert.equal(view._globe.baseColor.r,1);
  view.setVisible('a',false);assert.equal(view._globe.baseColor.r,170/255);
  view.removeLayer('b');assert.equal(view._globe.baseColor,fallback);
});
test('visible credit follows historical physical base, satellite and return to Now',()=>{
  let active=false,sat=false;
  const el={innerHTML:''};
  const document={readyState:'complete',getElementById:id=>id==='map-credit'?el:{classList:{contains:()=>sat}}};
  const win={IntMapTimeBorders:{active:()=>active}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/carto-basemap.js',import.meta.url),'utf8'),{window:win,document});
  assert.match(el.innerHTML,/CARTO/);
  active=true;win.IntMapCartoCredit();assert.match(el.innerHTML,/OpenFreeMap/);assert.match(el.innerHTML,/OpenStreetMap/);assert.doesNotMatch(el.innerHTML,/CARTO/);
  sat=true;win.IntMapCartoCredit();assert.match(el.innerHTML,/Esri/);assert.doesNotMatch(el.innerHTML,/OpenFreeMap/);
  active=false;sat=false;win.IntMapCartoCredit();assert.match(el.innerHTML,/CARTO/);
});
test('Cesium partial imagery never owns the stretching base-layer role',async()=>{
  const C=await import('@cesium/engine');
  const source=fs.readFileSync(new URL('../js/cesium-engine.js',import.meta.url),'utf8');
  let method;
  simple(parse(source,{ecmaVersion:'latest',sourceType:'module'}),{MethodDefinition(n){if(n.key.name==='_installImageryFloor') method=n;}});
  const document={createElement:()=>({toDataURL:()=> 'data:image/png;base64,'})};
  const proto=new Function('Cesium','document',`return class {${source.slice(method.start,method.end)}}.prototype;`)(C,document);
  const coll=new C.ImageryLayerCollection();
  const view=Object.assign(Object.create(proto),{_scene:{imageryLayers:coll}});
  const cap=new C.ImageryLayer(new C.SingleTileImageryProvider({url:'data:image/png;base64,',tileWidth:1,tileHeight:1,rectangle:C.Rectangle.fromDegrees(-180,85,180,90)}));
  coll.add(cap);assert.equal(cap.isBaseLayer(),true,'reproduces Cesium stretching a partial cap');
  view._installImageryFloor();
  assert.equal(view._imageryFloor.isBaseLayer(),true);
  assert.equal(cap.isBaseLayer(),false);
  assert.equal(view._imageryFloor.imageryProvider.rectangle,C.Rectangle.MAX_VALUE);
  view._installImageryFloor();assert.equal(coll.length,2,'idempotent installation');
  cap.show=false;coll._update();cap.show=true;coll._update();
  assert.equal(cap.isBaseLayer(),false,'theme and satellite visibility cannot promote the cap');
  coll.destroy();
});
import polygonClipping from 'polygon-clipping';
vm.runInContext(fs.readFileSync(new URL('../js/cesium-vector-tiles.js',import.meta.url),'utf8'),ctx);
const projectPolygons=ctx.window.IntMapVectorTiles.polygonGeometry;
test('MVT polygon buffers are clipped before spherical rendering with holes and multiple pieces intact',()=>{
  const g={type:'MultiPolygon',coordinates:[[[[-182.8125,-2.8114],[2.8125,-2.8114],[2.8125,85.2879],[-182.8125,85.2879],[-182.8125,-2.8114]],[[-80,10],[-70,10],[-70,20],[-80,20],[-80,10]]]]};
  const original=JSON.stringify(g);
  const result=projectPolygons(g,0,0,1,polygonClipping);
  assert.equal(JSON.stringify(g),original,'source coordinates remain intact');
  assert.ok(result.coordinates.length>=4);
  assert.ok(result.coordinates.some(p=>p.length>1),'the island hole survives clipping');
  for(const poly of result.coordinates){
    const points=poly.flat();const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    assert.ok(Math.min(...xs)>=-180-1e-10&&Math.max(...xs)<=1e-10);
    assert.ok(Math.min(...ys)>=-1e-10&&Math.max(...ys)<=85.0511287798066+1e-10);
    assert.ok(Math.max(...xs)-Math.min(...xs)<=90+1e-10,'no hemisphere-spanning local triangulation');
    for(const ring of poly){assert.deepEqual(ring[0],ring.at(-1));for(let i=1;i<ring.length;i++) assert.ok(Math.abs(ring[i][0]-ring[i-1][0])<=1.000001);}
  }
});
test('world and date-line MVT polygons stay bounded; lines and labels remain unchanged',()=>{
  const g={type:'Polygon',coordinates:[[[-182,-86],[182,-86],[182,86],[-182,86],[-182,-86]]]};
  for(const [x,y,z] of [[0,0,0],[1,0,1],[3,1,2]]){
    const result=projectPolygons(g,x,y,z,polygonClipping);assert.ok(result.coordinates.length);
    const lo=-180+x*360/2**z,hi=-180+(x+1)*360/2**z;
    for(const p of result.coordinates){const xs=p.flat().map(c=>c[0]);assert.ok(Math.min(...xs)>=lo-1e-9&&Math.max(...xs)<=hi+1e-9);assert.ok(Math.max(...xs)-Math.min(...xs)<=90+1e-9);}
  }
  for(const g of [{type:'LineString',coordinates:[[-182,0],[182,0]]},{type:'Point',coordinates:[12,34]}]) assert.equal(projectPolygons(g,0,0,0,polygonClipping),g);
});
test('Cesium fills use clipped geometry but outlines keep original edges and fill alpha',async()=>{
  const C=await import('@cesium/engine');
  vm.runInContext(fs.readFileSync(new URL('../js/cesium-layers.js',import.meta.url),'utf8'),ctx);
  const r=ctx.window.IntMapCesiumLayers.makeVectorRenderer(C);
  const feature={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]},fillGeometry:{type:'MultiPolygon',coordinates:[[[[0,0],[5,0],[5,10],[0,10],[0,0]]],[[[5,0],[10,0],[10,10],[5,10],[5,0]]]]}};
  const env={zoom:2,maxFeatures:100};
  const fill=r.build({id:'fill',type:'fill',paint:{'fill-color':'#000000','fill-opacity':0.001}},[feature],env);
  const line=r.build({id:'line',type:'line',paint:{'line-color':'#ffffff'}},[feature],env);
  assert.equal(fill.entities.values.length,2,'two clipped fill pieces');
  assert.equal(line.entities.values.length,1,'one original outline without the artificial partition');
  assert.equal(line.entities.values[0].polyline.positions.getValue().length,5);
  assert.equal(fill.entities.values[0].polygon.material.color.getValue().alpha,0.001);
});
test('Cesium visualizers receive replacement entities rather than retaining a prior era',async()=>{
  const C=await import('@cesium/engine');
  vm.runInContext(fs.readFileSync(new URL('../js/cesium-layers.js',import.meta.url),'utf8'),ctx);
  const r=ctx.window.IntMapCesiumLayers.makeVectorRenderer(C);
  const def={id:'era',type:'line',paint:{'line-color':'#ffffff'}};
  const feature=x=>({type:'Feature',properties:{year:x},geometry:{type:'LineString',coordinates:[[x,0],[x+1,1]]}});
  const env={zoom:2,maxFeatures:100};
  const ds=r.build(def,[feature(0)],env), old=ds.entities.values[0], events=[];
  ds.entities.collectionChanged.addEventListener((s,a,d)=>events.push({added:[...a],removed:[...d]}));
  r.update(ds,def,[feature(30)],env);
  assert.equal(events.length,2);
  assert.equal(events[0].removed[0],old);
  assert.equal(events[1].added[0],ds.entities.values[0]);
  assert.notEqual(ds.entities.values[0],old);
  assert.equal(ds.entities.values[0].properties.year.getValue(),30);
  assert.ok(Math.abs(C.Cartographic.fromCartesian(ds.entities.values[0].polyline.positions.getValue()[0]).longitude-C.Math.toRadians(30))<1e-10);
  r.update(ds,def,[feature(0)],env);
  assert.equal(events.length,4,'return to the prior era also detaches stale geometry');
  assert.equal(ds.entities.values[0].properties.year.getValue(),0);
  ds.show=false;
  assert.equal(ds.entities.values[0].isShowing,false);
});
test('reasserting the same Cesium style does not continually replace pending primitives',()=>{
  const source=fs.readFileSync(new URL('../js/cesium-engine.js',import.meta.url),'utf8');
  let cls;simple(parse(source,{ecmaVersion:'latest',sourceType:'module'}),{ClassDeclaration(n){if(n.id.name==='CesiumView') cls=n;}});
  const names=['_sameStyleValue','setVisible','setPaint','setLayout','setFilter'];
  const code=cls.body.body.filter(n=>names.includes(n.key.name)).map(n=>source.slice(n.start,n.end)).join('\n');
  const proto=new Function(`return class {${code}}.prototype;`)();
  const rec={def:{layout:{visibility:'visible'},paint:{'line-width':['interpolate',['linear'],['zoom'],0,1,10,2]},filter:['==',['get','x'],1]},ds:{show:true}};
  let scheduled=0;
  const view=Object.assign(Object.create(proto),{_layerById:new Map([['x',rec]]),_dirty:new Set(),_schedule(){scheduled++;}});
  for(let i=0;i<5;i++){view.setVisible('x',true);view.setPaint('x','line-width',JSON.parse(JSON.stringify(rec.def.paint['line-width'])));view.setLayout('x','visibility','visible');view.setFilter('x',['==',['get','x'],1]);}
  assert.equal(scheduled,0);assert.equal(view._dirty.size,0);
  view.setPaint('x','line-width',2);assert.equal(scheduled,1);assert.ok(view._dirty.has('x'));
});
