/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-radobs',
  shelf: 'lyrGrpHazard',
  order: 60,
  key: 'radobs',
  rest: true,
  share: true,
  lazy: ['radiationLayer'],
  registry: ['radiation'],
  commands: ['radiation.observed', 'radiation.near'],
  atlas: ['map.radiation'],
};
