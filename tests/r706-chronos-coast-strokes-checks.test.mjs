import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{},console});
for(const file of ['cesium-vector-tiles.js','cesium-style.js','cesium-layers.js'])
  vm.runInContext(fs.readFileSync(new URL('../js/'+file,import.meta.url),'utf8'),ctx);
const stroke=ctx.window.IntMapVectorTiles.polygonLineGeometry;
const polygon=coordinates=>({type:'Polygon',coordinates});
const buffered=[[-182.8125,-2.8113711933311265],[2.8125,-2.8113711933311265],[2.8125,85.287916121237],[-182.8125,85.287916121237],[-182.8125,-2.8113711933311265]];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
const near=(p,q)=>{close(p[0],q[0]);close(p[1],q[1]);};
const project=p=>[p[0]*Math.PI/180,Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))];
function originalEdges(g){
  const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  return polys.flatMap(p=>p.flatMap(r=>r.slice(1).map((v,i)=>[project(r[i]),project(v)])));
}
function assertOnlyOriginalEdges(input,output){
  const edges=originalEdges(input);
  for(const line of output.coordinates) for(let i=1;i<line.length;i++){
    const a=project(line[i-1]),b=project(line[i]),p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    assert.ok(edges.some(([s,e])=>{
      const dx=e[0]-s[0],dy=e[1]-s[1],cross=(p[0]-s[0])*dy-(p[1]-s[1])*dx;
      const dot=(p[0]-s[0])*dx+(p[1]-s[1])*dy;
      return Math.abs(cross)<1e-9&&dot>=-1e-9&&dot<=dx*dx+dy*dy+1e-9;
    }),'every stroke midpoint belongs to an original edge, never a clipping closure');
  }
}
test('the observed OFM z1 ocean buffer contributes no artificial tile outline',()=>{
  // Extents measured from all four live OFM z1 ocean features during R705/R706 diagnosis.
  const g=polygon([buffered]),before=JSON.stringify(g);
  assert.equal(stroke(g,0,0,1).coordinates.length,0);
  assert.equal(JSON.stringify(g),before);
});
test('coastlines crossing a tile are open chains with no joining edge along the tile',()=>{
  const g=polygon([[[-183,10],[-90,10],[-90,30],[-183,30],[-183,10]]]);
  const out=stroke(g,0,0,1);
  assert.equal(out.coordinates.length,1);
  near(out.coordinates[0][0],[-180,10]);near(out.coordinates[0].at(-1),[-180,30]);
  assertOnlyOriginalEdges(g,out);
  for(const line of out.coordinates) for(let i=1;i<line.length;i++)
    assert.ok(Math.abs(line[i][0]-line[i-1][0])<=1.000001,'long Mercator edges are sampled before spherical arcs');
});
test('holes, multiple polygons and genuine edges on the tile boundary remain',()=>{
  const hole=[[-160,10],[-150,10],[-150,20],[-160,20],[-160,10]];
  const edge=[[-180,40],[-170,40],[-170,50],[-180,50],[-180,40]];
  const g={type:'MultiPolygon',coordinates:[[buffered,hole],[edge]]};
  const out=stroke(g,0,0,1);
  assert.equal(out.coordinates.length,2);
  for(const line of out.coordinates) near(line[0],line.at(-1));
  assert.ok(out.coordinates.some(line=>line.some((p,i)=>i&&Math.abs(p[0]+180)<1e-9&&Math.abs(line[i-1][0]+180)<1e-9)),'a real coastline on the boundary is not discarded');
  assertOnlyOriginalEdges(g,out);
});
test('date-line and coarse tiles clip to their own coverage without joining distant edges',()=>{
  const g=polygon([[[175,-3],[183,-3],[183,20],[175,20],[175,-3]]]);
  const out=stroke(g,1,0,1);
  assert.equal(out.coordinates.length,1);assertOnlyOriginalEdges(g,out);
  for(const p of out.coordinates.flat()){assert.ok(p[0]>=0&&p[0]<=180+1e-9);assert.ok(p[1]>=-1e-9&&p[1]<=85.0511287798066);}
  const world=stroke(polygon([buffered]),0,0,0);assertOnlyOriginalEdges(polygon([buffered]),world);
  for(const g of [{type:'LineString',coordinates:[[-182,0],[182,1]]},{type:'Point',coordinates:[10,20]}]) assert.equal(stroke(g,0,0,0),g);
});
test('Cesium strokes lineGeometry while retaining fillGeometry and untiled GeoJSON behavior',async()=>{
  const C=await import('@cesium/engine');
  const r=ctx.window.IntMapCesiumLayers.makeVectorRenderer(C),env={zoom:1,maxFeatures:100};
  const g=polygon([buffered]);
  const f={type:'Feature',properties:{name:'ocean'},geometry:g,lineGeometry:stroke(g,0,0,1),fillGeometry:polygon([[[-170,5],[-160,5],[-160,10],[-170,10],[-170,5]]])};
  const line={id:'coast',type:'line',paint:{'line-color':'#ffffff'}};
  assert.equal(r.build(line,[f],env).entities.values.length,0,'the buffer is not stroked');
  assert.equal(r.build({id:'water',type:'fill',paint:{'fill-color':'#b7d0db'}},[f],env).entities.values.length,1,'the physical fill remains');
  const raw={type:'Feature',properties:{},geometry:f.fillGeometry};
  const ds=r.build(line,[raw],env);
  assert.equal(ds.entities.values.length,1);
  assert.equal(ds.entities.values[0].polyline.positions.getValue().length,5,'untiled GeoJSON keeps its original outline');
});
