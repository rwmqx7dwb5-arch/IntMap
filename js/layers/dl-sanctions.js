/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (geopolitics-layers) who designates parties under sanctions, where the lists place them, with which measures — scripts/build-sanctions.mjs */
export default {
  id: 'dl-sanctions',
  shelf: 'lyrGrpPolitics',
  order: 52,
  key: 'sanctions',
  label: 'lyrSanctions',
  share: true,
  sources: ['Sanctions — U.S. Treasury OFAC Specially Designated Nationals list (public domain)','UK Sanctions List — Foreign, Commonwealth & Development Office (Open Government Licence v3.0)','EU financial sanctions — European Commission consolidated list (FSF, Decision 2011/833/EU)'],
  pkg: 'geopolitics',   // (layer-packages) implemented by js/layer-pkg-geopolitics.js
};
