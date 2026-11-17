/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'bx-wbprecip',
  shelf: 'lyrGrpClimate',
  order: 160,
  key: 'wbprecip',
  rest: true,
  share: true,
  measures: ['worldbank:AG.LND.PRCP.MM'],
  formerly: ['beta-dl-precip'],
};
