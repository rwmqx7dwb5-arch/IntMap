/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* ⚠ NO `time` HERE for the reason given in js/layers/dl-launches.js: the clock contract of this layer (a dated record,
   drawn up to the clock's instant) is the `record` row in js/layer-time-decl.js; js/layer-pkg-fireballs.js follows it. */
export default {
  id: 'dl-fireballs',
  shelf: 'lyrGrpOrbit',
  order: 24,
  key: 'fireballs',
  label: 'lyrFireballs',
  share: true,
  sources: ['NASA/JPL CNEOS Fireball Data (US Government sensor detections)'],
  pkg: 'fireballs',   // (layer-packages) implemented by js/layer-pkg-fireballs.js
};
