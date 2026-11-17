/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (geopolitics-layers) border control posts, who may cross and how, open or closed at the clock's instant in their own zone — scripts/build-border-crossings.mjs */
export default {
  id: 'dl-crossings',
  shelf: 'lyrGrpPolitics',
  order: 164,
  key: 'crossings',
  label: 'lyrCrossings',
  /* folded behind 「その他」 with the shelf's other rows — the reader's own ordered list of 政治・統治 (tests/layer-panel-taxonomy-checks #R469 ④) is not lengthened unasked */
  rest: true,
  share: true,
  sources: ['Border crossings — OpenStreetMap (barrier=border_control, Overpass API)','Time zone boundaries — timezone-boundary-builder (ODbL, built from OpenStreetMap)'],
  pkg: 'geopolitics',   // (layer-packages) implemented by js/layer-pkg-geopolitics.js
};
