/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'bx-wbtrade',
  shelf: 'lyrGrpEconomy',
  order: 70,
  key: 'wbtrade',
  rest: true,
  measures: ['worldbank:NE.TRD.GNFS.ZS'],
};
