/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-subcables',
  shelf: 'lyrGrpTech',
  order: 10,
  key: 'subcables',
  label: 'lyrSubcables',
  /* (basic-display-not-layers) not `on` any more: no layer is on for a first-time reader —「どちらも規定レイヤーは削除」
     (the reader, 2026-10-02, phone and desktop alike). On since #R186 until then. */
  share: true,
  pkg: 'subcables',   // (layer-packages) implemented by js/layer-pkg-subcables.js
};
