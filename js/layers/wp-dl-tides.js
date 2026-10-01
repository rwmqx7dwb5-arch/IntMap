/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'wp-dl-tides',
  shelf: 'lyrGrpMaritime',
  order: 50,
  key: 'tides',
  rest: true,
  share: true,
  lazy: ['worldPacksBody'],
};
