/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-dc',
  shelf: 'lyrGrpTech',
  order: 20,
  key: 'dc',
  rest: true,
  share: true,
  lazy: ['dataCenters'],
  registry: ['datacenters'],
};
