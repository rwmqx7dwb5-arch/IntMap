/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-whs',
  shelf: 'lyrGrpSociety',
  order: 40,
  key: 'whs',
  rest: true,
  share: true,
  registry: ['heritage'],
  commands: ['heritage.open', 'heritage.filter'],
  atlas: ['map.heritageFilter'],
  sources: ['UNESCO World Heritage Centre'],
};
