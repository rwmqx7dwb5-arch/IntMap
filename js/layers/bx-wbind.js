/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (map-layer-system) THE INDICATOR BROWSER — one row that paints any World Bank country indicator, chosen inside
   it by search and by subject (js/indicator-browser.js); the painting is js/wb-layers.js `choroOn`, the same as the
   row each indicator stands on. It claims no `measures`: it measures whichever series the reader picks. First on the
   population shelf because it opens every country statistic the panel files on eleven shelves. */
export default {
  id: 'bx-wbind',
  shelf: 'lyrGrpDemo',
  order: 1,
  key: 'wbind',
  share: true,
  state: 'wbind',
  atlas: ['layers.indicator'],
};
