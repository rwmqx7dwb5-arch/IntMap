/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-climate',
  shelf: 'lyrGrpClimate',
  order: 10,
  key: 'climate',
  label: 'lyrClimate',
  /* (basic-display-not-layers) not `on` any more: no layer is on for a first-time reader —「どちらも規定レイヤーは削除」
     (the reader, 2026-10-02, phone and desktop alike). On since #R186 until then. */
  share: true,
  registry: ['climate'],
};
