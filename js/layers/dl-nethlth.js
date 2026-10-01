/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
export default {
  id: 'dl-nethlth',
  shelf: 'lyrGrpTech',
  order: 30,
  key: 'nethlth',
  rest: true,
  share: true,
  lazy: ['netHealthLive'],
  commands: ['nethlth.report', 'nethlth.signals'],
};
