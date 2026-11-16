/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'bx-wblife',
  shelf: 'lyrGrpHealth',
  order: 10,
  key: 'wblife',
  share: true,
  measures: ['worldbank:SP.DYN.LE00.IN'],
  formerly: ['beta-dl-lifeexp'],
};
