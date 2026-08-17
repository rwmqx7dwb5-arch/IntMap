/* ============================================================================
 *  IntMap · PAST EARTHQUAKES — the published source parameters   (#R232)
 * ----------------------------------------------------------------------------
 *  「地震シミュレータに、過去の地震を選べる機能を付け、選んだら当時と同じ条件や震源域を精密に入力し、
 *    その結果を出すように。最低でも東日本大震災、チリ地震、アラスカ地震、スマトラ島沖地震、阪神淡路
 *    大震災、関東大震災、トルコ・シリア地震、四川大地震、ハイチ地震は入れるように。」
 *
 *  ══ WHAT THIS FILE IS, AND WHAT IT IS NOT ═══════════════════════════════════════════════════
 *  It is a CATALOGUE OF PUBLISHED NUMBERS — the hypocentre, the moment magnitude, the focal
 *  mechanism (strike / dip / rake), the rupture dimensions and where on the fault the rupture
 *  nucleated — for each event, with the source of those numbers named on the row. It is NOT a
 *  record of what happened: the simulator computes that, from these inputs, with the same model it
 *  uses for anything the reader draws by hand. That separation is the whole point of the
 *  instruction — 「当時と同じ条件や震源域を精密に入力し、その結果を出す」.
 *
 *  ⚠ `obs` IS THE OTHER HALF, AND IT IS QUOTED, NOT COMPUTED. 「実測値も併記する」 — so each row
 *  also carries what was actually OBSERVED (peak intensity, tsunami height, deaths), attributed and
 *  with the real spread where the sources disagree. Haiti's death toll is the clearest case: the
 *  published figures run from 100,000 to 316,000 and this file says so rather than picking one.
 *  A modelled number and a measured number are never printed as if they were the same kind of thing.
 *
 *  ══ WHY THE SLIP IS DERIVED AND NOT QUOTED ══════════════════════════════════════════════════
 *  The simulator's chain is M₀ = μ·A₃D·D̄ → Mw (js/fault-geometry.js), so a quoted mean slip, a
 *  quoted area and a quoted Mw that disagree by 10 % would make the panel contradict its own header.
 *  D̄ is therefore computed from the PUBLISHED MOMENT and the rupture area on the row, which keeps
 *  the three consistent by construction and still puts the published moment on screen. Where a
 *  published mean slip exists it is in `obs.slipM` for comparison.
 *
 *  ⚠ DEPTH IS THE HYPOCENTRE'S; `zTopKm` IS THE TOP OF THE RUPTURE PLANE. They are different
 *  numbers and conflating them is what makes a subduction event look like a crustal one.
 * ==========================================================================*/
/* ⚠ (#R251) the ARRAY form of the language helper — see `pickArgs` in js/lang-registry.js. The
   event names below were bare five-element arrays: complete for the positional five and English for
   fr / ko / zh / zh-Hans for ever, because an array literal is not a call and no instrument could
   put the ten names into the inline universe.
   ⚠ WRAPPED IN AN IIFE, NOT DECLARED AT TOP LEVEL. tests/r175 ③ refuses an unexported top-level
   declaration in js/ — the module's surface is what it exports — so the helper lives inside the
   expression that needs it.
   ⚠ AND GUARDED, like js/space-cosmos.js's: this is an ES module that others import, so it can
   evaluate before js/lang-registry.js has run. `pickArgs()` only ever returns «the arguments as an
   array», so the fallback is the same function. */
export const QUAKE_EVENTS = (function () {
  const LA = (typeof window !== 'undefined' && window.IntMapLang && window.IntMapLang.pickArgs())
    || function () { return Array.prototype.slice.call(arguments); };
  return [

  {
    id: 'tohoku2011', usgs: 'official20110311054624120_30',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    /* the name is a proper noun in every language that has one for it; L() takes the first five
       positionally and the registry's inline table answers for the rest (js/lang-registry.js). */
    name: LA('2011 Tōhoku (Great East Japan)','東日本大震災（2011 東北地方太平洋沖地震）','2011 Tōhoku (Großes Ostjapan-Beben)','Тохоку 2011 (Великое восточнояпонское)','Tōhoku 2011 (Gran terremoto del este de Japón)'),
    when: '2011-03-11T05:46:24Z',
    lat: 38.297, lng: 142.373, depthKm: 29, mw: 9.1,
    strike: 203, dip: 10, rake: 88,
    lenKm: 500, widKm: 200, zTopKm: 5, nucAlong: 0.5,
    src: 'USGS NEIC / Global CMT; finite-fault dimensions after Ide et al. (2011) and Ozawa et al. (2011)',
    obs: {
      intensity: LA('JMA 7 (Kurihara, Miyagi)','JMA震度7（宮城県栗原市）','JMA 7 (Kurihara)','JMA 7 (Курихара)','JMA 7 (Kurihara)'),
      slipM: 'peak ≈ 50 m near the trench; mean ≈ 10 m',
      tsunamiM: 'run-up to 40.1 m (Ōfunato); 9.3 m tide-gauge (Sōma)',
      deaths: '19,759 dead, 2,553 missing (NPA, 2021)',
      note: LA('Moment magnitude 9.0 (JMA) to 9.1 (USGS).','気象庁 Mw9.0、USGS Mw9.1。','Mw 9,0 (JMA) bis 9,1 (USGS).','Mw 9,0 (JMA) — 9,1 (USGS).','Mw 9,0 (JMA) a 9,1 (USGS).')
    }
  },
  {
    id: 'valdivia1960', usgs: 'official19600522191120_30',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('1960 Valdivia (Great Chilean)','1960年 チリ地震（バルディビア地震）','1960 Valdivia (Großes Chile-Beben)','Вальдивия 1960 (Великое чилийское)','Valdivia 1960 (Gran terremoto de Chile)'),
    when: '1960-05-22T19:11:14Z',
    lat: -38.29, lng: -73.05, depthKm: 25, mw: 9.5,
    strike: 7, dip: 20, rake: 90,
    lenKm: 850, widKm: 200, zTopKm: 5, nucAlong: 0.15,
    src: 'Kanamori (1977) Mw 9.5; rupture extent after Plafker & Savage (1970) and Barrientos & Ward (1990)',
    obs: {
      intensity: LA('MMI XI–XII (Valdivia · Puerto Montt)','改正メルカリ XI〜XII（バルディビア／プエルトモント）','MMI XI–XII','MMI XI–XII','MMI XI–XII'),
      slipM: 'mean ≈ 20 m, peak ≈ 30–40 m',
      tsunamiM: '25 m locally; 10.7 m at Hilo, Hawaiʻi (15 h later); 6 m in Japan (22 h later)',
      deaths: '1,000–6,000 (estimates differ widely)',
      note: LA('The largest earthquake ever instrumentally recorded.','観測史上最大の地震。','Das stärkste je instrumentell gemessene Beben.','Сильнейшее землетрясение за всю историю наблюдений.','El mayor terremoto jamás registrado instrumentalmente.')
    }
  },
  {
    id: 'alaska1964', usgs: 'official19640328033616_30',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('1964 Great Alaska (Prince William Sound)','1964年 アラスカ地震（プリンスウィリアム湾）','1964 Alaska (Prince-William-Sund)','Аляска 1964 (залив Принца Уильяма)','Alaska 1964 (Estrecho del Príncipe Guillermo)'),
    when: '1964-03-28T03:36:14Z',
    lat: 60.908, lng: -147.339, depthKm: 25, mw: 9.2,
    strike: 246, dip: 10, rake: 90,
    lenKm: 800, widKm: 250, zTopKm: 4, nucAlong: 0.2,
    src: 'USGS; rupture area and slip after Plafker (1969), Johnson et al. (1996)',
    obs: {
      intensity: LA('MMI XI (Anchorage · Valdez · Seward)','改正メルカリ XI（アンカレジ／バルディーズ／スワード）','MMI XI','MMI XI','MMI XI'),
      slipM: 'mean ≈ 18 m on the main asperity',
      tsunamiM: 'local wave to 67 m (Valdez Arm); 4.5 m at Crescent City, California',
      deaths: '131 (9 from shaking, 122 from the tsunami)',
      note: LA('The second-largest earthquake ever instrumentally recorded.','観測史上2番目に大きい地震。','Das zweitstärkste je gemessene Beben.','Второе по силе землетрясение за историю наблюдений.','El segundo mayor terremoto jamás registrado.')
    }
  },
  {
    id: 'sumatra2004', usgs: 'official20041226005853450_30',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('2004 Sumatra–Andaman (Indian Ocean)','2004年 スマトラ島沖地震（インド洋大津波）','2004 Sumatra–Andamanen','Суматра–Андаманы 2004','Sumatra–Andamán 2004'),
    when: '2004-12-26T00:58:53Z',
    lat: 3.316, lng: 95.854, depthKm: 30, mw: 9.1,
    strike: 329, dip: 8, rake: 110,
    lenKm: 1300, widKm: 170, zTopKm: 5, nucAlong: 0.05,
    src: 'USGS NEIC / Global CMT; rupture length after Ammon et al. (2005), Lay et al. (2005)',
    obs: {
      intensity: LA('MMI IX (Banda Aceh)','改正メルカリ IX（バンダ・アチェ）','MMI IX (Banda Aceh)','MMI IX (Банда-Ачех)','MMI IX (Banda Aceh)'),
      slipM: 'mean ≈ 5–10 m, peak ≈ 20 m',
      tsunamiM: 'run-up to 30–51 m (northern Sumatra); 2–10 m across the Indian Ocean',
      deaths: '≈ 227,900 dead or missing across 14 countries',
      note: LA('Rupture ran roughly 1,300 km northward over about 10 minutes.','破壊は約10分かけて北へ約1,300km進行。','Der Bruch lief in ~10 Minuten rund 1.300 km nach Norden.','Разрыв прошёл ~1 300 км на север примерно за 10 минут.','La ruptura avanzó ~1.300 km hacia el norte en unos 10 minutos.')
    }
  },
  {
    id: 'kobe1995',
    name: LA('1995 Kobe (Great Hanshin-Awaji)','阪神・淡路大震災（1995 兵庫県南部地震）','1995 Kobe (Hanshin-Awaji)','Кобе 1995 (Хансин-Авадзи)','Kobe 1995 (Gran Hanshin-Awaji)'),
    when: '1995-01-17T05:46:52+09:00',
    lat: 34.59, lng: 135.07, depthKm: 16, mw: 6.9,
    strike: 233, dip: 85, rake: 168,
    lenKm: 60, widKm: 20, zTopKm: 1, nucAlong: 0.45,
    src: 'JMA Mj 7.3 / USGS Mw 6.9; Nojima-fault mechanism after Kikuchi & Kanamori (1996)',
    obs: {
      intensity: LA('JMA 7 — the first time the class was ever assigned','JMA震度7（震度7が初めて適用された地震）','JMA 7 — erstmals vergeben','JMA 7 — впервые присвоена','JMA 7 — asignada por primera vez'),
      slipM: 'mean ≈ 1.5–2 m, right-lateral strike-slip',
      tsunamiM: 'none of consequence (inland strike-slip)',
      deaths: '6,434 dead, 43,792 injured',
      note: LA('A shallow crustal strike-slip event directly beneath a city — small moment, extreme local intensity.','都市直下の浅い横ずれ断層。規模は小さいが局所の震度は極めて大きい。','Flaches Blattverschiebungsbeben direkt unter einer Stadt.','Мелкофокусный сдвиг прямо под городом.','Falla de desgarre somera justo bajo una ciudad.')
    }
  },
  {
    id: 'kanto1923', usgs: 'iscgem911526',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('1923 Great Kantō','関東大震災（1923 関東地震）','1923 Großes Kantō-Beben','Великое землетрясение Канто 1923','Gran terremoto de Kantō de 1923'),
    when: '1923-09-01T11:58:32+09:00',
    lat: 35.33, lng: 139.13, depthKm: 23, mw: 7.9,
    strike: 290, dip: 25, rake: 140,
    lenKm: 130, widKm: 70, zTopKm: 3, nucAlong: 0.35,
    src: 'JMA Mj 7.9; Sagami-trough rupture model after Kanamori (1971) and Matsu’ura et al. (2007)',
    obs: {
      intensity: LA('JMA 6 on the scale of the day (Sagami Bay coast, Tokyo lowlands)','当時の階級で震度6（相模湾岸・東京低地）','JMA 6 (Skala von 1923)','JMA 6 (по шкале того времени)','JMA 6 (escala de la época)'),
      slipM: 'mean ≈ 4–6 m on the Sagami trough',
      tsunamiM: 'up to 12 m at Atami; 6 m along the Bōsō coast',
      deaths: '≈ 105,000 dead or missing — most of them in the firestorms that followed',
      note: LA('Most of the loss came from fire, not from shaking: the simulator models the shaking only.','被害の大半は地震動ではなく火災による。本シミュレータが計算するのは揺れのみ。','Der Großteil der Opfer entstand durch Feuer, nicht durch Erschütterung.','Большая часть жертв — от пожаров, а не от сотрясений.','La mayoría de las víctimas se debió a los incendios, no al temblor.')
    }
  },
  {
    id: 'turkiye2023', usgs: 'us6000jllz',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('2023 Kahramanmaraş (Türkiye–Syria)','2023年 トルコ・シリア地震（カフラマンマラシュ）','2023 Kahramanmaraş (Türkei–Syrien)','Кахраманмараш 2023 (Турция–Сирия)','Kahramanmaraş 2023 (Turquía–Siria)'),
    when: '2023-02-06T01:17:35Z',
    lat: 37.226, lng: 37.014, depthKm: 10, mw: 7.8,
    strike: 228, dip: 89, rake: 1,
    lenKm: 350, widKm: 20, zTopKm: 0, nucAlong: 0.45,
    src: 'USGS NEIC / Global CMT; East Anatolian Fault rupture length after Melgar et al. (2023)',
    obs: {
      intensity: LA('MMI XI–XII (Antakya · Kahramanmaraş)','改正メルカリ XI〜XII（アンタキヤ／カフラマンマラシュ）','MMI XI–XII','MMI XI–XII','MMI XI–XII'),
      slipM: 'peak ≈ 8 m left-lateral on the East Anatolian Fault',
      tsunamiM: 'minor (≈ 0.2 m, İskenderun)',
      deaths: '≈ 53,500 in Türkiye and ≈ 8,500 in Syria',
      note: LA('A second Mw 7.5 event on the Çardak fault followed nine hours later; only the first is modelled here.','9時間後にチャルダク断層でMw7.5が発生（本シミュレーションは第1震のみ）。','Neun Stunden später folgte ein Mw 7,5 auf der Çardak-Verwerfung.','Через девять часов последовало событие Mw 7,5 на разломе Чардак.','Nueve horas después siguió un Mw 7,5 en la falla de Çardak.')
    }
  },
  {
    id: 'wenchuan2008', usgs: 'usp000g650',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('2008 Wenchuan (Sichuan)','四川大地震（2008 汶川地震）','2008 Wenchuan (Sichuan)','Вэньчуань 2008 (Сычуань)','Wenchuan 2008 (Sichuan)'),
    when: '2008-05-12T06:28:01Z',
    lat: 31.002, lng: 103.322, depthKm: 19, mw: 7.9,
    strike: 229, dip: 33, rake: 141,
    lenKm: 300, widKm: 40, zTopKm: 0, nucAlong: 0.1,
    src: 'USGS NEIC / Global CMT; Longmenshan rupture after Shen et al. (2009), Xu et al. (2009)',
    obs: {
      intensity: LA('CSIS XI (Yingxiu · Beichuan) ≈ MMI XI','中国震度階 XI（映秀・北川）≒ 改正メルカリ XI','CSIS XI ≈ MMI XI','CSIS XI ≈ MMI XI','CSIS XI ≈ MMI XI'),
      slipM: 'peak ≈ 9 m, oblique thrust with a dextral component',
      tsunamiM: 'none (inland)',
      deaths: '69,227 dead, 17,923 missing, 374,643 injured',
      note: LA('The rupture ran ~300 km northeast along the Longmenshan thrust — strongly unilateral.','龍門山断層に沿って北東へ約300km、強い一方向性の破壊。','Der Bruch lief ~300 km nach Nordosten — stark unilateral.','Разрыв прошёл ~300 км на северо-восток — резко односторонний.','La ruptura avanzó ~300 km al noreste — marcadamente unilateral.')
    }
  },
  {
    id: 'haiti2010', usgs: 'usp000h60h',   /* (#R235) ShakeMap rupture.json — the published finite-fault outline */
    name: LA('2010 Haiti (Léogâne)','2010年 ハイチ地震（レオガン）','2010 Haiti (Léogâne)','Гаити 2010 (Леоган)','Haití 2010 (Léogâne)'),
    when: '2010-01-12T21:53:10Z',
    lat: 18.443, lng: -72.571, depthKm: 13, mw: 7.0,
    strike: 251, dip: 70, rake: 28,
    lenKm: 50, widKm: 15, zTopKm: 1, nucAlong: 0.5,
    src: 'USGS NEIC / Global CMT; Enriquillo–Plantain Garden / Léogâne fault geometry after Calais et al. (2010), Hayes et al. (2010)',
    obs: {
      intensity: LA('MMI IX (Port-au-Prince · Léogâne)','改正メルカリ IX（ポルトープランス／レオガン）','MMI IX','MMI IX','MMI IX'),
      slipM: 'mean ≈ 2–4 m, oblique left-lateral with a reverse component',
      tsunamiM: 'local waves to 3 m (Petit-Goâve, Jacmel)',
      deaths: '100,000 – 316,000 (published estimates differ by a factor of three)',
      note: LA('Most of the slip was on a blind thrust beside the Enriquillo fault, not on the fault itself.','すべりの大半はエンリキヨ断層そのものではなく、隣接する伏在逆断層で起きた。','Der Großteil des Versatzes lag auf einer blinden Aufschiebung neben der Enriquillo-Störung.','Основная подвижка произошла на скрытом взбросе рядом с разломом Энрикильо.','La mayor parte del desplazamiento ocurrió en un cabalgamiento ciego junto a la falla de Enriquillo.')
    }
  },
  /* ══ (#R236) 「また、能登半島地震も追加して。」 ═══════════════════════════════════════════════════
     Every number on the first three lines is read off the USGS ShakeMap sheet the reader supplied
     (`USGS.能登.pdf` in the repo root — «43 km NE of Anamizu, Ishikawa, JP · Jan 01, 2024 07:10:09
     UTC · M7.5 · N37.49 E137.27 · Depth: 10.0km · ID:us6000m0xl», Version 10, processed
     2024-03-09T18:30:39Z), so the catalogue agrees with the sheet rather than with a memory of it.
     ⚠ That sheet's own intensity scale is Worden et al. (2012) — the same GMICE this simulator
     converts with, which is why its macroseismic map and this one are comparable at all.

     ⚠ THE SHAPE ON THE MAP IS NOT THE RECTANGLE BELOW. `usgs` makes fetchRuptureRing pull the
     published finite-fault outline for us6000m0xl at run time (#R235); L/W/strike/dip/rake are the
     FALLBACK for when that fetch fails, and they are the USGS Mww nodal plane plus the rupture
     extent the aftershock distribution and the GNSS/GSI coseismic field define — a ~150 km
     NE–SW rupture along the peninsula's north coast, which is why a peninsula that is 100 km long
     shook the way it did. `nucAlong` is 0.5 because the rupture was BILATERAL from a hypocentre
     near the middle of that trace; a unilateral value here would invent a directivity that the
     records do not show. */
  {
    id: 'noto2024', usgs: 'us6000m0xl',   /* ShakeMap rupture.json — the published finite-fault outline */
    name: LA('2024 Noto Peninsula','2024年 能登半島地震','2024 Noto-Halbinsel','Полуостров Ното, 2024','Península de Noto 2024'),
    when: '2024-01-01T07:10:09Z',
    lat: 37.49, lng: 137.27, depthKm: 10, mw: 7.5,
    strike: 55, dip: 28, rake: 102,
    lenKm: 150, widKm: 40, zTopKm: 1, nucAlong: 0.5,
    src: 'USGS ShakeMap us6000m0xl v10 (M7.5, 37.49°N 137.27°E, 10.0 km, 2024-01-01 07:10:09 UTC); JMA Mj 7.6, 最大震度7; rupture extent after the JMA aftershock distribution and the GSI GNSS/InSAR coseismic field',
    obs: {
      intensity: LA('JMA 7 (Shika, Ishikawa); MMI IX','JMA震度7（石川県志賀町）／改正メルカリ IX','JMA 7 (Shika); MMI IX','JMA 7 (Сика); MMI IX','JMA 7 (Shika); MMI IX'),
      slipM: 'peak ≈ 4–6 m on the shallow part of the plane; coastal uplift to ≈ 4 m near Wajima (GSI)',
      tsunamiM: 'run-up to ≈ 4–5 m on the peninsula (Suzu · Noto); ~80 cm at Toyama',
      deaths: '504 dead incl. disaster-related, 3 missing (Ishikawa Pref., 2024)',
      note: LA('A reverse-fault rupture on the peninsula’s north coast that lifted the coastline out of the sea — the ground itself rose, so several fishing harbours were left dry.','半島北岸の逆断層による破壊で、海岸線そのものが隆起した——地盤が持ち上がったため、いくつもの漁港が干上がった。','Ein Aufschiebungsbruch an der Nordküste hob die Küstenlinie aus dem Meer — mehrere Fischereihäfen fielen trocken.','Взбросовый разрыв у северного побережья поднял береговую линию из моря — несколько рыбацких портов осушились.','Una ruptura inversa en la costa norte levantó la línea de costa fuera del mar — varios puertos pesqueros quedaron en seco.')
    }
  }
  ];
})();

/* ══ THE SURFACE PROJECTION OF THE RUPTURE PLANE ═══════════════════════════════════════════════
   The simulator takes a drawn RING and treats it as the fault's surface projection (#R224), so a
   published rectangle has to be turned into one: length L along strike, and a down-dip width W that
   projects to W·cos δ measured from the top edge in the DOWN-DIP direction (strike + 90°, the
   right-hand rule the strike convention implies).

   ⚠ `nucAlong` PLACES THE HYPOCENTRE ON THAT RECTANGLE, and it is not decoration: the directivity
   term in js/seismic.js measures how much of the fault runs TOWARD each site from exactly this
   point (Ben-Menahem 1961; Somerville et al. 1997's X·cos θ). A Sumatra that nucleated in the middle
   would be a different earthquake from the one that happened.

   ══ ⚠⚠ (#R234) FOUR CORNERS ON A FLAT LOCAL PATCH IS NOT A 1,300 km RUPTURE ═══════════════════
   「地震シミュレータの過去の地震の震源域の描画が雑すぎる。（現状は単に長方形置くだけ。）」
   Two separate errors were adding up, and both of them are largest for exactly the events people
   come here to look at — the megathrusts:

    1. LOCAL EQUIRECTANGULAR. The old code laid a flat km grid on the hypocentre's own latitude and
       used it out to ±1,300 km. That grid is only right where it is anchored: for Valdivia (850 km
       along strike, from −38°) the far end of the rupture is at −45°, where a degree of longitude is
       11 % shorter than the constant it was divided by — tens of kilometres of error in the drawn
       position of the rupture's own end. Every vertex is a proper great-circle destination now
       (`_dest`, the standard spherical direct formula), computed from the hypocentre at a real
       bearing and a real distance, so the shape sits where the numbers on the row say it does.
    2. FOUR VERTICES. A polygon with four points has four straight edges, and the 1,300 km side of
       Sumatra–Andaman is not straight on a sphere — nor on the screen once the globe is drawn. The
       perimeter is now WALKED (24 samples along strike, 6 down-dip), so the drawn edge follows the
       fault instead of chording it.

   ⚠ THE DIMENSIONS AND THE AREA ARE THE PUBLISHED ONES, UNCHANGED. This does not re-draw the
   rupture as something else — L, W·cos δ and `nucAlong` are exactly as they were, and the ring is
   still the surface projection of the same plane. It is the same rectangle, put in the right place
   on a round Earth and drawn with enough points to be that shape. (`js/fault-geometry.js` measures
   its area from this ring, so its answer improves with it rather than drifting from it.) */
export function ruptureRing(ev) {
  const D = Math.PI / 180, RE = 6371.0088;
  /* the spherical direct problem: from a point, a bearing and a distance, where do you arrive */
  const _dest = (lng, lat, brgDeg, distKm) => {
    const d = distKm / RE, br = brgDeg * D, la1 = lat * D, lo1 = lng * D;
    const sla = Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br);
    const la2 = Math.asin(Math.max(-1, Math.min(1, sla)));
    const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1),
                                 Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return [((lo2 / D + 540) % 360) - 180, la2 / D];
  };
  /* a point of the fault plane's surface projection, in (along-strike, down-dip) kilometres from
     the hypocentre. Two great-circle hops — along strike, then down-dip from there — rather than
     one flat vector sum, because the down-dip direction rotates as you travel along the strike. */
  const at = (u, v) => {
    const p = _dest(ev.lng, ev.lat, ev.strike, u);
    return v === 0 ? p : _dest(p[0], p[1], ev.strike + 90, v);
  };
  const along = Math.max(1, +ev.lenKm || 1);
  const wProj = Math.max(1, (+ev.widKm || 1) * Math.cos((+ev.dip || 0) * D));
  const f = Math.max(0, Math.min(1, ev.nucAlong == null ? 0.5 : +ev.nucAlong));
  const a0 = -along * f, a1 = along * (1 - f);            /* backward / forward of the hypocentre */
  /* ⚠ THE SAMPLING IS PROPORTIONATE, because this ring is not only drawn — every cell of the
     intensity field measures its distance to it (js/seismic.js `faultDistKm`, O(vertices) per cell,
     up to 82,944 cells). One vertex per ~50 km of fault is below the model's own resolution
     everywhere and leaves the small crustal events at the four points they always had: Haiti
     (50 × 5 km projected) stays a quadrilateral, Tōhoku becomes 28 points, Sumatra 54. */
  const seg = (km) => Math.max(1, Math.min(24, Math.round(km / 50)));
  const NL = seg(along), NW = Math.min(4, seg(wProj));      /* samples along strike / down dip */
  const ring = [];
  for (let i = 0; i <= NL; i++) ring.push(at(a0 + (a1 - a0) * (i / NL), 0));           /* top edge */
  for (let j = 1; j <= NW; j++) ring.push(at(a1, wProj * (j / NW)));                   /* far end  */
  for (let i = NL - 1; i >= 0; i--) ring.push(at(a0 + (a1 - a0) * (i / NL), wProj));   /* bottom   */
  for (let j = NW - 1; j >= 1; j--) ring.push(at(a0, wProj * (j / NW)));               /* near end */
  return ring;
}

/* the published seismic moment, in N·m — Hanks & Kanamori (1979), the same relation the simulator
   inverts. Used to derive a mean slip that is consistent with the rupture area on the row. */
export function momentOf(mw) { return Math.pow(10, 1.5 * mw + 9.1); }

/* ══ ⚠⚠ (#R235) THE PUBLISHED RUPTURE, INSTEAD OF A RECTANGLE STANDING IN FOR IT ═══════════════
   「地震シミュレータの過去の地震の震源域の描画が雑すぎる。（現状は単に長方形置くだけ。）」
   That is exactly what it was, and `ruptureRing()` above says so in its own header — #R234 put the
   rectangle on a round Earth and walked its perimeter, which fixed the GEODESY and left the SHAPE
   a rectangle. Real ruptures are not rectangles: the 2023 Kahramanmaraş rupture is a bent
   multi-segment surface trace, Sumatra–Andaman follows the aftershock distribution up the Andaman
   arc, and Wenchuan and Alaska are 15-vertex outlines.

   So the outline is FETCHED, from the model the seismological community published for that event:
   USGS ShakeMap's `rupture.json`, which is the finite-fault surface projection ShakeMap itself ran
   on. Every row below carries the USGS event id; the reference string inside each file names the
   study (Suzuki et al. 2011 for Tōhoku, Wald & Somerville 1994 for Kantō, Barrientos for Valdivia,
   Hartzell for Wenchuan, Hayes 2011 for Haiti, NEIC's aftershock distribution for Sumatra) and is
   carried back so the panel can attribute what it drew.

   ⚠ THE FALLBACK IS THE OLD RECTANGLE, UNCHANGED. No network, an event with no published model
   (Kobe 1995 has no ShakeMap rupture) or a malformed file all end at `ruptureRing(ev)`, so this is
   additive: nothing that worked before can stop working because a fetch failed.
   ⚠ CORS WAS MEASURED FROM THE PAGE, NOT FROM NODE (#R212/#R216). earthquake.usgs.gov answers
   `Access-Control-Allow-Origin: *`; it is the same host the event picker already queries (#R234).
   ⚠ THE THIRD ORDINATE IS DEPTH, IN KILOMETRES, and it is the best part: the published corners
   carry the plane's own top and bottom, so `zTopKm`/`zBotKm` come off the model instead of being
   estimated from the outline. */
export function fetchRuptureRing(ev, fetchImpl) {
  /* ══ ⚠⚠ (#R244) THE PUBLISHED OUTLINE GETS THE SAME SAMPLING THE RECTANGLE ALREADY HAD ═══════════
     「過去の地震の震源域などの精度が落ちている。」 #R234 walked the fallback rectangle's perimeter at
     one vertex per ~50 km, for two reasons it wrote down: a 500 km edge is not straight on a sphere,
     and every cell of the intensity field measures its distance to THESE vertices. #R235 then made
     the published ShakeMap outline the answer — and handed it through verbatim. Measured on Tōhoku:
     the fallback rectangle is 29 points, the published model is FOUR, so the better data was drawn
     and measured more coarsely than the guess it replaced. Same rule, same reason, now applied to
     both: any edge longer than `maxKm` is walked along its great circle.
     ⚠ IT ADDS POINTS, IT NEVER MOVES ONE. Every original vertex survives at its own index, so the
     published corners — including their depth ordinates, which are read before this runs — are
     untouched, and a ring that is already fine (Kahramanmaraş's bent trace, Wenchuan's 15 points)
     passes through unchanged.
     ⚠ NESTED, not a module-level helper: tests/r175 ③ forbids an unexported top-level declaration
     and an export nothing imports, and this has exactly one caller. */
  const densifyRing = (ring, maxKm) => {
    const D = Math.PI / 180, RE = 6371.0088, lim = Math.max(5, +maxKm || 50);
    if (!Array.isArray(ring) || ring.length < 3) return ring;
    const gc = (a, b) => {
      const p1 = a[1] * D, p2 = b[1] * D, dp = (b[1] - a[1]) * D, dl = (b[0] - a[0]) * D;
      const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h)));
    };
    /* spherical linear interpolation — the point at fraction t along the great circle a→b */
    const slerp = (a, b, t) => {
      const toV = (p) => { const la = p[1] * D, lo = p[0] * D, c = Math.cos(la); return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)]; };
      const u = toV(a), v = toV(b);
      const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
      const om = Math.acos(dot);
      if (!(om > 1e-9)) return [a[0], a[1]];
      const s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om);
      const w = [u[0] * s1 + v[0] * s2, u[1] * s1 + v[1] * s2, u[2] * s1 + v[2] * s2];
      return [Math.atan2(w[1], w[0]) / D, Math.atan2(w[2], Math.hypot(w[0], w[1])) / D];
    };
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      out.push([+a[0], +a[1]]);
      const n = Math.min(24, Math.ceil(gc(a, b) / lim));
      for (let k = 1; k < n; k++) out.push(slerp(a, b, k / n));
    }
    return out;
  };
  /* ⚠ the memo hangs off the function, not off a module-level `const`: tests/r175 ③ forbids an
     UNEXPORTED top-level declaration in js/, and exporting a cache would be exporting an internal. */
  const cache = fetchRuptureRing._cache || (fetchRuptureRing._cache = Object.create(null));
  const id = ev && ev.usgs;
  if (!id) return Promise.resolve(null);
  if (cache[id]) return cache[id];
  const F = fetchImpl || ((typeof fetch === 'function') ? fetch : null);
  if (!F) return Promise.resolve(null);
  const J = (u) => F(u).then((r) => { if (!r || !r.ok) throw new Error('http ' + (r && r.status)); return r.json(); });
  const p = J('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=' + encodeURIComponent(id))
    .then((j) => {
      const prods = (j && j.properties && j.properties.products) || {};
      const sm = (prods.shakemap || [])[0];
      const url = sm && sm.contents && sm.contents['download/rupture.json'] && sm.contents['download/rupture.json'].url;
      if (!url) throw new Error('no rupture.json');
      return J(url);
    })
    .then((g) => {
      /* every Polygon / MultiPolygon ring in the file, flattened to a list of candidate rings */
      const rings = [];
      ((g && g.features) || []).forEach((f) => {
        const gm = f && f.geometry; if (!gm) return;
        const cs = gm.coordinates;
        if (gm.type === 'Polygon') rings.push(cs[0]);
        else if (gm.type === 'MultiPolygon') cs.forEach((poly) => rings.push(poly[0]));
      });
      if (!rings.length) throw new Error('no polygon');
      /* ⚠ ONE ring is what the model takes (js/seismic.js faultSet), so where a published model has
         several segments the LARGEST is used and the count is reported rather than silently dropped
         — a picture that quietly shows half a rupture is worse than one that says it did. */
      const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++)
        a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a); };
      rings.sort((a, b) => area(b) - area(a));
      const best = rings[0];
      let zTop = Infinity, zBot = -Infinity;
      const ring = [];
      for (const c of best) {
        const lo = +c[0], la = +c[1];
        if (!(isFinite(lo) && isFinite(la))) continue;
        const dz = +c[2];
        if (isFinite(dz)) { if (dz < zTop) zTop = dz; if (dz > zBot) zBot = dz; }
        /* the file closes the ring; faultSet does its own closing, so drop the repeat */
        if (ring.length && Math.abs(ring[ring.length - 1][0] - lo) < 1e-9 && Math.abs(ring[ring.length - 1][1] - la) < 1e-9) continue;
        ring.push([lo, la]);
      }
      if (ring.length > 2 && Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-9
          && Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-9) ring.pop();
      if (ring.length < 3) throw new Error('degenerate ring');
      /* (#R244) …and it is sampled like the rectangle it replaced — see densifyRing above. The depth
         ordinates were read from the ORIGINAL corners a few lines up, so nothing about the plane's
         top and bottom depends on this. */
      return { ring: densifyRing(ring, 50), segments: rings.length,
        zTopKm: isFinite(zTop) ? zTop : null, zBotKm: isFinite(zBot) ? zBot : null,
        ref: (g && g.metadata && g.metadata.reference) ? String(g.metadata.reference) : null };
    })
    .catch(() => null);
  cache[id] = p;
  return p;
}
