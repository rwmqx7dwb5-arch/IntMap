/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-wind',
  shelf: 'lyrGrpClimate',
  order: 20,
  key: 'wind',
  label: 'lyrWind',
  share: true,
  registry: ['wind'],
  atlas: ['layers.windParticles'],
};
