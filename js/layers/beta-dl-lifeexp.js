/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'beta-dl-lifeexp',
  shelf: 'lyrGrpHealth',
  order: 10,
  key: 'lifeexp',
  share: true,
  measures: ['worldbank:SP.DYN.LE00.IN'],
};
