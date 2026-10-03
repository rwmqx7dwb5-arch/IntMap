/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-milSpend',
  shelf: 'lyrGrpSecurity',
  order: 10,
  key: 'milSpend',
  label: 'lyrMilSpend',
  share: true,
  pkg: 'alliances',   // (layer-packages) implemented by js/layer-pkg-alliances.js
  measures: ['countrystats:milSpend'],
};
