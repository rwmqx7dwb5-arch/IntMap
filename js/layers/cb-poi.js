/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (#R186) 「Base map & labelsに、地点の名前も追加して。（例：地名などではなく、店舗名や施設名など）」 —
     the POINTS OF INTEREST in OpenMapTiles' `poi` layer: shops, restaurants, stations, hospitals,
     museums, hotels… i.e. the names of PLACES YOU GO TO, which is a different set from the
     settlement names above it and from the water/terrain names beside it. Its own toggle, so it
     follows the same pattern as its two neighbours and can be switched off; it is dense by nature
     and only appears from z14, so it starts OFF like Grid and Countries do.  */
export default {
  id: 'cb-poi',
  shelf: 'base',
  order: 30,
  label: 'poiLabels',
  on: true,
  html: true,
};
