/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-rail',
  shelf: 'lyrGrpTransport',
  order: 20,
  key: 'rail',
  share: true,
  lazy: ['railways'],
  atlas: ['layers.railAxis'],
};
