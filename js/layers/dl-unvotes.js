/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (geopolitics-layers) how every member voted on a recorded UN General Assembly vote, 1946–2023 — scripts/build-unga-votes.mjs */
export default {
  id: 'dl-unvotes',
  shelf: 'lyrGrpPolitics',
  order: 162,
  key: 'unvotes',
  label: 'lyrUnVotes',
  /* folded behind 「その他」 with the shelf's other rows — the reader's own ordered list of 政治・統治 (tests/layer-panel-taxonomy-checks #R469 ④) is not lengthened unasked */
  rest: true,
  share: true,
  sources: ['UN General Assembly voting data — Voeten, Strezhnev & Bailey (Harvard Dataverse, CC0 1.0)'],
  pkg: 'geopolitics',   // (layer-packages) implemented by js/layer-pkg-geopolitics.js
};
