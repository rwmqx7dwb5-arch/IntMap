/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* ⚠ NO `time` HERE: the only contract a descriptor can state is `elements` (orbital elements, js/satellites-live.js).
   What this layer says about time — Launch Library 2 states each launch's NET, the layer draws the launches in
   [clock − 7 d, clock + 30 d] — is a `record` in js/layer-time-decl.js (see js/layer-pkg-launches.js, header). */
export default {
  id: 'dl-launches',
  shelf: 'lyrGrpOrbit',
  order: 22,
  key: 'launches',
  label: 'lyrLaunches',
  share: true,
  sources: ['Launch Library 2 (The Space Devs)'],
  pkg: 'launches',   // (layer-packages) implemented by js/layer-pkg-launches.js
};
