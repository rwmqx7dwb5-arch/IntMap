/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'wp-dl-outbreaks',
  shelf: 'lyrGrpOthers',
  order: 100,
  share: true,
  registry: ['outbreaks'],
  state: 'outbreaks',
  commands: ['outbreaks.open', 'outbreaks.close'],
  atlas: ['map.outbreaks'],
  sources: ['WHO Disease Outbreak News'],
};
