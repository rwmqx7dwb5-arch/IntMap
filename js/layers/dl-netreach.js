/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-netreach',
  shelf: 'lyrGrpTech',
  order: 40,
  key: 'netreach',
  rest: true,
  share: true,
  lazy: ['netHealthLive'],
};
