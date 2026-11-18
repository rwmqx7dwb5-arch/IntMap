/* ============================================================================
 *  IntMap · the ±180° band in the night-lights strip (js/antimeridian-seam.js)
 *  「日付変更線のところだけ線上に暗くなってしまっている」 — #1210 stepped the globe's mosaic over GIBS's black
 *  edge band and left the raster layer (dl-nightsat) reading the same tiles untouched, so the built
 *  site still drew the stripe. The judgement now lives once; this RUNS it on tiles shaped like the
 *  measured ones (band width doubling with zoom: 1 col at z3 … 24 at z8, 23 = the unlit base).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { bandWidth, repairBand, edgeSides, seamlessTiles } from '../js/antimeridian-seam.js';

const W=256,H=256;
/* a tile whose base is `base`, with `band` opaque-black columns at the left and/or right edge and a lit
   city (bright block) beside the left edge to prove the repair is per row, not a flat fill */
function tile({ left=0, right=0, base=23, city=false }={}){
  const d=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const j=(y*W+x)*4; const v=base/3;
    d[j]=d[j+1]=d[j+2]=v; d[j+3]=255; }
  if(city) for(let y=100;y<110;y++) for(let x=left;x<left+10;x++){ const j=(y*W+x)*4; d[j]=d[j+1]=d[j+2]=200; }
  for(let y=0;y<H;y++){ for(let x=0;x<left;x++){ const j=(y*W+x)*4; d[j]=d[j+1]=d[j+2]=0; }
    for(let x=W-right;x<W;x++){ const j=(y*W+x)*4; d[j]=d[j+1]=d[j+2]=0; } }
  return d;
}
const colSum=(d,x,y)=>{ const j=(y*W+x)*4; return d[j]+d[j+1]+d[j+2]; };

test('the band is found at every width the upstream writes, from either edge', () => {
  for(const n of [1,2,3,6,12,24]){
    const d=tile({ left:n, right:n });
    assert.equal(bandWidth(d,W,H,1),n,'left '+n); assert.equal(bandWidth(d,W,H,-1),n,'right '+n);
  }
});

test('z8 shape: a lit outermost column, then the black — the band still ends where the black ends', () => {
  const d=tile({ left:24 });
  for(let y=0;y<H;y++){ const j=(y*W)*4; d[j]=d[j+1]=d[j+2]=9; }   /* column 0 reads 27, not 0 (measured: 28 against 0) */
  assert.equal(bandWidth(d,W,H,1),24);
});

test('a lit city or a brightness gradient is not a band', () => {
  const city=tile({ city:true });   /* bright block 10 rows tall beside the edge */
  assert.equal(bandWidth(city,W,H,1),0);
  const g=new Uint8ClampedArray(W*H*4);   /* a continent whose light falls off 1 % per column: gradient on every row */
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const j=(y*W+x)*4; g[j]=g[j+1]=g[j+2]=Math.round(120*Math.pow(0.99,x)); g[j+3]=255; }
  assert.equal(bandWidth(g,W,H,1),0);
});

test('repair replaces the band row by row with the first column outside it, and nothing else', () => {
  const d=tile({ left:24, right:24, city:true });
  const before=Uint8ClampedArray.from(d);
  const r=repairBand(d,W,H,{ left:true, right:true });
  assert.deepEqual(r,{ left:24, right:24 });
  for(let y=0;y<H;y++) for(let x=0;x<24;x++){
    assert.equal(colSum(d,x,y),colSum(before,24,y),'left x='+x+' y='+y);
    assert.equal(colSum(d,W-1-x,y),colSum(before,W-25,y),'right x='+x+' y='+y); }
  assert.equal(colSum(d,5,105),colSum(before,24,105),'the lit row stays lit');
  for(let y=0;y<H;y++) for(let x=24;x<W-24;x++) assert.equal(colSum(d,x,y),colSum(before,x,y),'inside is untouched');
});

test('a tile with no band comes back byte for byte — the upstream fixing itself switches this off', () => {
  const d=tile(), before=Uint8ClampedArray.from(d);
  assert.deepEqual(repairBand(d,W,H,{ left:true, right:true }),{ left:0, right:0 });
  assert.deepEqual(d,before);
  /* …and a tile that is dark all the way across (open ocean at a black base) has no reference to compare with */
  const z=tile({ base:0 }); assert.deepEqual(repairBand(z,W,H,{ left:true, right:true }),{ left:0, right:0 });
});

test('only the strip\'s end tiles are ever looked at', () => {
  assert.deepEqual(edgeSides(3,0),{ left:true, right:false });
  assert.deepEqual(edgeSides(3,7),{ left:false, right:true });
  assert.deepEqual(edgeSides(3,4),{ left:false, right:false });
  assert.deepEqual(edgeSides(0,0),{ left:true, right:true });
  const d=tile({ left:24 }), sides=edgeSides(8,100);
  assert.deepEqual(repairBand(d,W,H,sides),{ left:0, right:0 });
});

test('the layer asks for the repaired tiles through one protocol, and falls back to the plain URL if it cannot be registered', () => {
  const NL={ tileURL:(z,x,y,e)=>'https://x/'+e+'/'+z+'/'+y+'/'+x, tiles:()=>['https://x/plain/{z}/{y}/{x}'] };
  const ep={ id:'2016-01-01' };
  const seen=[];
  const engine={ scene:{ addProtocol:(n,f)=>{ seen.push(n); return typeof f==='function'; } } };
  assert.deepEqual(seamlessTiles(NL,ep,engine),['imnl://2016-01-01/{z}/{x}/{y}']);
  assert.deepEqual(seen,['imnl']);
  assert.deepEqual(seamlessTiles(NL,ep,engine),['imnl://2016-01-01/{z}/{x}/{y}']);
  assert.deepEqual(seen,['imnl'],'registered once');
  assert.deepEqual(seamlessTiles(NL,null,engine),[]);
});
