/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-precip',
  shelf: 'lyrGrpOthers',
  order: 10,
  key: 'precip',
  label: 'lyrPrecip',
  share: true,
  registry: ['precip'],
  sources: ['Open-Meteo'],
};
