/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-volc2',
  shelf: 'lyrGrpHazard',
  order: 30,
  key: 'volc2',
  share: true,
  registry: ['volcanoes'],
  commands: ['volcano.open', 'volcano.mode', 'volcano.filter', 'volcano.time'],
  atlas: ['map.volcanoFilter'],
  sources: ['Smithsonian GVP'],
};
