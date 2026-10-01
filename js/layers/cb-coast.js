/* (layer-descriptor) one layer, declared once — see scripts/lib/layer-descriptor.mjs for what each field means */
/* (#R289) 「海岸線も国境線が全く同じ手法で」 — js/coast-line.js.
     (#R476) 「Coastlines & shoresはデフォルトでオンにして」 — ships CHECKED. ⚠ The tick here and the id in
     window.IntMapDefaultOn (js/data-layers.js) are ONE edit: a tick without the id makes 基本表示 fall to
     「カスタム」 400 ms after boot, and an id without the tick paints nothing (#R34).  */
export default {
  id: 'cb-coast',
  shelf: 'base',
  order: 50,
  label: 'coastline',
  html: true,
};
