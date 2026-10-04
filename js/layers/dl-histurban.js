/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-histurban',
  shelf: 'lyrGrpDemo',
  order: 130,
  key: 'histurban',
  label: 'lyrHistUrban',
  /* folded behind 「その他」 with the shelf's other rows — the reader's visible list (#R469) is not lengthened unasked */
  rest: true,
  share: true,
  sources: ['Reba, Reitsma & Seto (2016) — historical urban populations, 3700 BC – AD 2000 (CC BY 4.0)'],
  pkg: 'histurban',   // (layer-packages) implemented by js/layer-pkg-histurban.js
};
