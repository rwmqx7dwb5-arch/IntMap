import assert from 'node:assert/strict';
import test from 'node:test';
import { makeGisCrs } from '../js/gis-crs.js';
import { mapRegistration, matchMapLandmarks, placeMapShapes, referenceLandmarks } from '../js/gis-map-registration.js';

const crs = makeGisCrs();
const viewport = { width:100, height:100 };
const controls = [[5,5],[95,5],[95,95],[5,95],[50,5],[5,50],[85,50],[50,90]];
const checkPixels = [[35,27],[65,73]];
const curved = ([x,y]) => [22 + x/100 + (y/120)**2/4, 28 - y/100 + x*y/50000];
const straight = ([x,y]) => [22+x/100+y/200, 28-y/100];
const ties = (pixels, ground) => pixels.map(pixel => ({ pixel, ground:ground(pixel) }));

test('quadratic correction succeeds on unseen held-out points on a distorted map', () => {
  const points = { control:ties(controls,curved), check:ties(checkPixels,curved) };
  const fit = mapRegistration(crs,viewport,{...points, transformModel:'auto', maxErrorM:1});
  assert.equal(fit.transform.model,'quadratic');
  assert.ok(fit.quality.independent.maxM < 0.001);
  const sample = [48,70];
  assert.ok(fit.locate(sample).every((value,i) => Math.abs(value-curved(sample)[i]) < 1e-10));
  const affine = mapRegistration(crs,viewport,{...points, maxErrorM:1});
  assert.equal(affine.why,'map-positional-tolerance-exceeded');
});

test('auto keeps affine when appropriate and rejects a nonlinear fold between controls', () => {
  const affine = mapRegistration(crs,viewport,{ control:ties(controls,straight), check:ties(checkPixels,straight), transformModel:'auto' });
  assert.equal(affine.transform.model,'affine');
  const folds = ([x,y]) => [22+((x-30)/100)**2, 28-y/100];
  const fold = mapRegistration(crs,viewport,{ control:ties(controls,folds), check:ties(checkPixels,folds), transformModel:'quadratic' });
  assert.equal(fold.why,'map-transform-folds');
  const underdetermined = mapRegistration(crs,viewport,{ control:ties(controls.slice(0,6),curved), check:[], transformModel:'quadratic' });
  assert.equal(underdetermined.why,'map-quadratic-points-required');
});

test('curved lines follow the warp and linework outside the observed envelope is refused', () => {
  const fit = mapRegistration(crs,viewport,{ control:ties(controls,curved), check:ties(checkPixels,curved), transformModel:'quadratic' });
  const makeLine = coordinates => ({ type:'LineString', classIndex:0, coordinates });
  const result = placeMapShapes({ validate:()=>({valid:true}) },fit,
    [makeLine([[10,10],[90,90]]),makeLine([[0,10],[90,90]])],[{label:'levee'}]);
  assert.equal(result.features.length,1);
  assert.ok(result.features[0].geometry.coordinates.length > 20);
  assert.equal(result.validation.issues['map-transform-extrapolation'],1);
});

test('unique landmark identities are grounded by the reference and some are held out', () => {
  const pixels = [...controls,...checkPixels];
  const names = pixels.map((_, i) => 'Station ' + (i+1));
  const features = pixels.map((pixel,i) => ({ geometry:{type:'Point',coordinates:curved(pixel)}, properties:{name:names[i]} }));
  features.push(
    {geometry:{type:'Point',coordinates:[4,5]},properties:{name:' Twin '}},
    {geometry:{type:'Point',coordinates:[5,6]},properties:{name:'TWIN'}});
  const dataset = { kind:'vector', fields:[{name:'name'}], features:()=>features };
  const {candidates} = referenceLandmarks(dataset,'name');
  assert.equal(candidates.length,10);
  const marks = pixels.map((pixel,i) => ({name:names[i].toUpperCase(),pixel,ground:[0,0]}));
  const match = matchMapLandmarks(candidates, marks.reverse(),viewport,{transformModel:'quadratic'});
  assert.equal(match.control.length,8);
  assert.equal(match.check.length,2);
  assert.ok(match.check.every(c => !match.control.some(p => p.name===c.name)));
  assert.deepEqual(match.control.find(p=>p.name===names[1]).ground,curved(pixels[1]));
  assert.equal(mapRegistration(crs,viewport,{...match,transformModel:'auto',maxErrorM:0.5}).transform.model,'quadratic');
  assert.equal(matchMapLandmarks(candidates,marks.slice(0,3),viewport,{}).why,'map-landmark-matches-insufficient');
  const duplicate = matchMapLandmarks(candidates,[...marks,{ name:names[1], pixel:[20,20] }],viewport,{});
  assert.ok([...duplicate.control,...duplicate.check].every(p=>p.name!==names[1]));
});
