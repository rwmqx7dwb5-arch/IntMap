/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (news-intelligence) news EVENTS per country, first reported in the last 1 / 3 / 7 / 14 days, or their rise.
   The row and its name are js/news-pulse.js's; the body is js/news-intel.js (lazy). docs/NEWS-EVENTS.md §16. */
export default {
  id: 'dl-newspulse',
  shelf: 'lyrGrpPolitics',
  order: 75,
  key: 'newspulse',
  share: true,
  lazy: ['newsIntel'],
  commands: ['newspulse.toggle', 'newspulse.rank', 'newspulse.brief'],
};
