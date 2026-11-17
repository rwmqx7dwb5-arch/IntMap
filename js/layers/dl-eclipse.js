/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* ⚠ NO `time` HERE for the reason given in js/layers/dl-launches.js: the clock contract of this layer (the next solar
   eclipse after the clock's instant, computed — an `instant` kind) is its row in js/layer-time-decl.js;
   js/layer-pkg-eclipse.js follows it. */
export default {
  id: 'dl-eclipse',
  shelf: 'lyrGrpOrbit',
  order: 60,
  key: 'eclipse',
  label: 'lyrEclipse',
  share: true,
  pkg: 'eclipse',   // (layer-packages) implemented by js/layer-pkg-eclipse.js
};
