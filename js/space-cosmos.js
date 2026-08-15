/* ============================================================================
 *  IntMap · THE DISTANCE LADDER OUT OF THE SOLAR SYSTEM — window.IntMapCosmos  (#R219)
 * ----------------------------------------------------------------------------
 *  「宇宙を探索で、もっとズームして、もっと巨大な空間を見れるようにビッグバン級に拡張して。」
 *  （確認済：「観測可能な宇宙まで（実データ）」）
 *
 *  ══ WHY THE REACH WAS BOUNDED, AND WHAT UNBOUNDS IT HONESTLY ═════════════════════════════════════
 *  js/space.js has stopped the camera at «the furthest thing this scene actually draws» since #R208,
 *  and that rule is right: a view that keeps zooming out past the last measured object is showing an
 *  empty claim, not more universe. The ceiling was therefore the star catalogue (Hipparcos, ~48 pc)
 *  and then data/deep-sky.json (SIMBAD, out to 71.6 Mpc — Virgo and Coma). Past Coma there was
 *  nothing bundled, so the camera stopped.
 *
 *  This file supplies what is out there, and it supplies it as MEASUREMENTS rather than as scenery:
 *  a ladder of published distances, each with the survey or the paper that measured it, drawn as a
 *  labelled shell at its own radius. Nothing is invented and nothing is interpolated — between two
 *  rungs there is empty space, which is what is between them.
 *
 *  ⚠ COMOVING DISTANCE FOR THE COSMOLOGICAL RUNGS, and the table says so. The observable universe is
 *  46.5 Gly across in comoving radius while the light took 13.8 Gyr to arrive; quoting the light
 *  travel time as a radius is the classic error and would put the horizon 3.4× too close.
 *
 *  ⚠ THE RADII ARE THE DATA. Everything else — how a shell is drawn, when it is labelled — belongs to
 *  the caller. This file is pure arithmetic so `tests/r219-checks` can run it in Node.
 * ==========================================================================*/
(function (root) {
  'use strict';
  /* ⚠ (#R245) the rung labels are tuples held as data — see IntMapLang.pickArgs().
     This module is evaluated at import time, which in some entry orders is BEFORE
     js/lang-registry.js has run; `pickArgs()` only ever returns «the arguments as an array», so the
     fallback below is the same function rather than a stub, and the audits read the initialiser
     either way (they match the text `IntMapLang.pick…` in the declaration). */
  var LA = (root.IntMapLang && root.IntMapLang.pickArgs()) || function () { return Array.prototype.slice.call(arguments); };
  var AU_PER_LY = 63241.077;
  var AU_PER_PC = 206264.806;

  /* [key, radius in AU, {en,ja,de,ru,es}, source]  — ordered outward, and every number published. */
  var RUNGS = [
    ['kuiper', 50 * 1, LA('Kuiper belt — the outer edge of the classical belt','カイパーベルト — 古典的帯の外縁','Kuipergürtel — Außenrand','Пояс Койпера — внешний край','Cinturón de Kuiper — borde exterior'), '50 AU (the classical Kuiper cliff)'],
    ['heliopause', 123, LA('Heliopause — where Voyager 1 measured the solar wind stop','ヘリオポーズ — ボイジャー1号が太陽風の停止を実測した場所','Heliopause — von Voyager 1 gemessen','Гелиопауза — измерена «Вояджером-1»','Heliopausa — medida por la Voyager 1'), 'Voyager 1 crossing, 2012-08-25 (Gurnett et al. 2013)'],
    ['oort', 100000, LA('Oort cloud — the outer boundary inferred from long-period comets','オールトの雲 — 長周期彗星から推定される外縁','Oortsche Wolke — äußere Grenze','Облако Оорта — внешняя граница','Nube de Oort — límite exterior'), 'long-period comet aphelia, ~1.5 ly'],
    ['proxima', 4.2465 * AU_PER_LY, LA('Proxima Centauri — the nearest star','プロキシマ・ケンタウリ — 最も近い恒星','Proxima Centauri — nächster Stern','Проксима Центавра — ближайшая звезда','Próxima Centauri — la estrella más cercana'), 'Gaia DR3 parallax 768.07 mas'],
    ['sirius', 8.6 * AU_PER_LY, LA('Sirius — the brightest star in the sky','シリウス — 全天で最も明るい恒星','Sirius — hellster Stern am Himmel','Сириус — ярчайшая звезда неба','Sirio — la estrella más brillante del cielo'), 'Gaia/Hipparcos parallax, 8.60 ly'],
    ['pleiades', 136.2 * AU_PER_PC, LA('The Pleiades — the nearest bright open cluster','プレアデス星団（すばる） — 最も近い明るい散開星団','Plejaden — nächster heller offener Haufen','Плеяды — ближайшее яркое рассеянное скопление','Las Pléyades — el cúmulo abierto brillante más cercano'), 'Gaia DR2 VLBI-consistent distance, 136.2 pc'],
    ['orion', 412 * AU_PER_PC, LA('The Orion Nebula — the nearest region forming massive stars','オリオン大星雲 — 最も近い大質量星の形成領域','Orionnebel','Туманность Ориона','La Nebulosa de Orión'), 'VLBA parallax, 412 ± 12 pc (Reid et al. 2007)'],
    ['gc', 8178 * AU_PER_PC, LA('Centre of the Milky Way','天の川銀河の中心','Zentrum der Milchstraße','Центр Млечного Пути','Centro de la Vía Láctea'), 'GRAVITY Collaboration 2019: 8178 ± 26 pc'],
    ['mwedge', 26000 * AU_PER_PC, LA('Edge of the Milky Way’s stellar disc','天の川銀河の星円盤の外縁','Rand der Milchstraßenscheibe','Край звёздного диска Галактики','Borde del disco estelar de la Vía Láctea'), 'stellar disc radius ~26 kpc'],
    ['lmc', 49.97e3 * AU_PER_PC, LA('The Large Magellanic Cloud — a satellite galaxy','大マゼラン雲 — 銀河系の伴銀河','Große Magellansche Wolke','Большое Магелланово Облако','La Gran Nube de Magallanes'), 'eclipsing binaries, 49.97 ± 0.19 kpc (Pietrzynski et al. 2019)'],
    ['m31', 0.765e6 * AU_PER_PC, LA('Andromeda (M31) — the nearest large galaxy','アンドロメダ銀河（M31） — 最も近い大型銀河','Andromeda (M31)','Туманность Андромеды (M31)','Andrómeda (M31)'), '765 kpc (Cepheid + TRGB mean)'],
    ['virgo', 16.5e6 * AU_PER_PC, LA('Virgo cluster — the centre of our supercluster','おとめ座銀河団 — 所属する超銀河団の中心','Virgo-Haufen','Скопление Девы','Cúmulo de Virgo'), '16.5 Mpc (Mei et al. 2007)'],
    ['coma', 99e6 * AU_PER_PC, LA('The Coma cluster — a thousand galaxies bound together','かみのけ座銀河団 — 千個規模の銀河の集団','Coma-Haufen','Скопление Волос Вероники','El cúmulo de Coma'), '99 Mpc (SBF / Tully-Fisher mean)'],
    ['3c273', 749e6 * AU_PER_PC, LA('3C 273 — the first quasar ever identified','3C 273 — 最初に同定されたクエーサー','3C 273 — der erste identifizierte Quasar','3C 273 — первый отождествлённый квазар','3C 273 — el primer cuásar identificado'), 'z = 0.158, 749 Mpc comoving'],
    ['gnz11', 32e9 * AU_PER_LY, LA('GN-z11 — one of the most distant galaxies measured (z = 10.6), comoving','GN-z11 — 実測で最も遠い銀河のひとつ（z = 10.6、共動距離）','GN-z11 (z = 10,6), mitbewegt','GN-z11 (z = 10,6), сопутствующее расстояние','GN-z11 (z = 10,6), distancia comóvil'), 'z = 10.603 (JWST/NIRSpec 2023) → 32 Gly comoving'],
    ['cmb', 45.6e9 * AU_PER_LY, LA('The cosmic microwave background — the oldest light there is (z ≈ 1100)','宇宙マイクロ波背景放射 — 存在する最も古い光（z ≈ 1100）','Kosmischer Mikrowellenhintergrund (z ≈ 1100)','Реликтовое излучение (z ≈ 1100)','Fondo cósmico de microondas (z ≈ 1100)'), 'last-scattering surface, comoving 45.6 Gly (Planck 2018 parameters)'],
    ['horizon', 46.5e9 * AU_PER_LY, LA('The particle horizon — the edge of the observable universe','粒子的地平面 — 観測可能な宇宙の果て','Teilchenhorizont — Rand des beobachtbaren Universums','Горизонт частиц — край наблюдаемой Вселенной','Horizonte de partículas — el borde del universo observable'), 'comoving 46.5 Gly (Planck 2018 parameters)']
  ];

  /* A human distance, in the unit that fits it — AU inside the solar system, light years out to the
     galaxy, then Mly and Gly. ⚠ never «light years» for a cosmological radius without saying comoving:
     the rung labels carry that, this is only the magnitude. */
  function fmt(au, lang) {
    var ly = au / AU_PER_LY;
    if (au < 6e4) return Math.round(au).toLocaleString() + ' AU';
    if (ly < 1e3) return (ly < 10 ? ly.toFixed(2) : Math.round(ly).toLocaleString()) + ' ly';
    if (ly < 1e6) return (ly / 1e3).toFixed(ly < 1e4 ? 2 : 0) + ' kly';
    if (ly < 1e9) return (ly / 1e6).toFixed(ly < 1e7 ? 2 : 0) + ' Mly';
    return (ly / 1e9).toFixed(2) + ' Gly';
  }

  /* the rungs that are worth drawing at a camera distance of `au`: near enough to be inside the view
     and far enough not to be a dot at the centre. */
  function visible(au) {
    var out = [], i, r;
    for (i = 0; i < RUNGS.length; i++) {
      r = RUNGS[i][1];
      if (r <= au * 2.4 && r >= au * 0.02) out.push({ key: RUNGS[i][0], au: r, label: RUNGS[i][2], source: RUNGS[i][3] });
    }
    /* ⚠ NEVER EMPTY. The rungs are real distances, so their spacing is the universe's and not a
       designer's — between the Oort cloud and the Galactic centre there is a factor of 6,000 with
       nothing in it. A camera parked inside a gap would otherwise see no scale at all, so it gets the
       nearest rung in LOG space, which is the one it is on its way to. */
    if (!out.length) {
      var best = 0, bd = Infinity;
      for (i = 0; i < RUNGS.length; i++) {
        var d = Math.abs(Math.log(RUNGS[i][1] / au));
        if (d < bd) { bd = d; best = i; }
      }
      out.push({ key: RUNGS[best][0], au: RUNGS[best][1], label: RUNGS[best][2], source: RUNGS[best][3] });
    }
    /* and never a wall of them: keep the six closest to the camera's own scale */
    if (out.length > 6) {
      out.sort(function (a, b) { return Math.abs(Math.log(a.au / au)) - Math.abs(Math.log(b.au / au)); });
      out = out.slice(0, 6).sort(function (a, b) { return a.au - b.au; });
    }
    return out;
  }

  /* a circle of `n` points at radius `r`, in the ecliptic plane — the caller scales it */
  function ring(r, n) {
    n = n || 128;
    var out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      out[i * 3] = r * Math.cos(t); out[i * 3 + 1] = r * Math.sin(t); out[i * 3 + 2] = 0;
    }
    return out;
  }

  root.IntMapCosmos = {
    AU_PER_LY: AU_PER_LY, AU_PER_PC: AU_PER_PC,
    RUNGS: RUNGS,
    HORIZON_AU: RUNGS[RUNGS.length - 1][1],
    fmt: fmt, visible: visible, ring: ring,
    /* (#R245) the rung label is a tuple held as data; resolving it through `pick()` itself is what
       lets a language past the five positional slots reach its inline table keyed by the English. */
    label: function (rung, lang) {
      if (!rung || !rung.label) return '';
      return root.IntMapLang.pick(function () { return lang; }).arr(rung.label) || '';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
