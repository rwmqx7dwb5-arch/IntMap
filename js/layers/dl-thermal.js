/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-thermal',
  shelf: 'lyrGrpHazard',
  order: 40,
  key: 'thermal',
  label: 'lyrThermal',
  rest: true,
  share: true,
  registry: ['thermal'],
  sources: ['NASA FIRMS'],
  pkg: 'thermal',   // (layer-packages) implemented by js/layer-pkg-thermal.js
};
