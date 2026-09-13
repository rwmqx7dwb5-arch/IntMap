/* R711: execute the shipped label definitions. A visible, uncollided name must remain
 * eligible when crossing the old country/province/county cutoffs. Geometry/placement
 * invariants are tested with real era bundles by r707-chronos-labelplacement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function definitions() {
 const result=[];
 const ctx=vm.createContext({GE:()=>({layers:{has:()=>false,add:x=>result.push(x)}}), window:{IntMapLabelScale:{place:()=>12}}, LS:{place:()=>12}, FONT:['Arial'], _ERAFONT:['Arial'], _ERAVAR:{'text-variable-anchor':['center','top','bottom','left','right']}, A1_TEXT:()=> '#fff', A1_RANK:true, before:undefined});
 for(const [file,id] of [['js/time-borders.js','imtb-lbl'],['js/time-borders.js','imtb-lbl2'],['js/place-labels.js','ofm-country']]) {
  const line=read(file).split('\n').find(l=>l.includes("has('"+id+"')")&&l.includes('layers.add('));
  assert.ok(line,'definition exists: '+id); vm.runInContext(line,ctx);
 }
 const modern=read('js/place-labels.js').match(/if\(!GE\(\)\.layers\.has\('ofm-admin1'\)\)[\s\S]*?\}\);/);
 assert.ok(modern); vm.runInContext(modern[0],ctx);
 const admin=read('js/time-admin1.js').match(/if \(!GE\(\)\.layers\.has\(cfg.lbl\)\) GE\(\)\.layers\.add\(\{[\s\S]*?\n          \}\);/);
 assert.ok(admin);
 Object.assign(ctx,{FONT:['Arial'],SIZE:12,COL:'#fff',DEEP_Z:6,SORT_PROP:'_sort'});
 for(const deep of [false,true]){ctx.cfg={lbl:deep?'imta2-lbl':'imta-lbl',src:'test',deep};vm.runInContext(admin[0],ctx);}
 return result;
}
const layers=definitions();
test('country and administrative names remain eligible above former zoom cutoffs',()=>{
 assert.equal(layers.length,6);
 for(const l of layers) for(const z of [7,9,12,18,22]) {
  if(z<(l.minzoom||0)) continue;
  assert.ok(l.maxzoom===undefined||z<l.maxzoom,`${l.id} disappeared solely at zoom ${z}`);
  assert.notEqual(l.layout['text-allow-overlap'],true,'normal collision placement retained');
  assert.notEqual(l.layout['text-ignore-placement'],true,'name must still participate in collision placement');
 }
});
test('computed administrative label anchors have alternate collision placements',()=>{
 for(const l of layers.filter(x=>/^imta2?-/.test(x.id))) {
  assert.ok(l.layout['text-variable-anchor'].length>1);
  assert.equal(l.layout['text-justify'],'auto');
  assert.equal(l.layout['text-optional'],true);
  assert.ok(l.layout['symbol-sort-key'],'area priority preserved');
 }
});
