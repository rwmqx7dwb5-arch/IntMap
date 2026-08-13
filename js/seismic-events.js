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
export const QUAKE_EVENTS = [
  {
    id: 'tohoku2011',
    /* the name is a proper noun in every language that has one for it; L() takes the first five
       positionally and the registry's inline table answers for the rest (js/lang-registry.js). */
    name: ['2011 Tōhoku (Great East Japan)', '東日本大震災（2011 東北地方太平洋沖地震）', '2011 Tōhoku (Großes Ostjapan-Beben)', 'Тохоку 2011 (Великое восточнояпонское)', 'Tōhoku 2011 (Gran terremoto del este de Japón)'],
    when: '2011-03-11T05:46:24Z',
    lat: 38.297, lng: 142.373, depthKm: 29, mw: 9.1,
    strike: 203, dip: 10, rake: 88,
    lenKm: 500, widKm: 200, zTopKm: 5, nucAlong: 0.5,
    src: 'USGS NEIC / Global CMT; finite-fault dimensions after Ide et al. (2011) and Ozawa et al. (2011)',
    obs: {
      intensity: ['JMA 7 (Kurihara, Miyagi)', 'JMA震度7（宮城県栗原市）', 'JMA 7 (Kurihara)', 'JMA 7 (Курихара)', 'JMA 7 (Kurihara)'],
      slipM: 'peak ≈ 50 m near the trench; mean ≈ 10 m',
      tsunamiM: 'run-up to 40.1 m (Ōfunato); 9.3 m tide-gauge (Sōma)',
      deaths: '19,759 dead, 2,553 missing (NPA, 2021)',
      note: ['Moment magnitude 9.0 (JMA) to 9.1 (USGS).', '気象庁 Mw9.0、USGS Mw9.1。', 'Mw 9,0 (JMA) bis 9,1 (USGS).', 'Mw 9,0 (JMA) — 9,1 (USGS).', 'Mw 9,0 (JMA) a 9,1 (USGS).']
    }
  },
  {
    id: 'valdivia1960',
    name: ['1960 Valdivia (Great Chilean)', '1960年 チリ地震（バルディビア地震）', '1960 Valdivia (Großes Chile-Beben)', 'Вальдивия 1960 (Великое чилийское)', 'Valdivia 1960 (Gran terremoto de Chile)'],
    when: '1960-05-22T19:11:14Z',
    lat: -38.29, lng: -73.05, depthKm: 25, mw: 9.5,
    strike: 7, dip: 20, rake: 90,
    lenKm: 850, widKm: 200, zTopKm: 5, nucAlong: 0.15,
    src: 'Kanamori (1977) Mw 9.5; rupture extent after Plafker & Savage (1970) and Barrientos & Ward (1990)',
    obs: {
      intensity: ['MMI XI–XII (Valdivia · Puerto Montt)', '改正メルカリ XI〜XII（バルディビア／プエルトモント）', 'MMI XI–XII', 'MMI XI–XII', 'MMI XI–XII'],
      slipM: 'mean ≈ 20 m, peak ≈ 30–40 m',
      tsunamiM: '25 m locally; 10.7 m at Hilo, Hawaiʻi (15 h later); 6 m in Japan (22 h later)',
      deaths: '1,000–6,000 (estimates differ widely)',
      note: ['The largest earthquake ever instrumentally recorded.', '観測史上最大の地震。', 'Das stärkste je instrumentell gemessene Beben.', 'Сильнейшее землетрясение за всю историю наблюдений.', 'El mayor terremoto jamás registrado instrumentalmente.']
    }
  },
  {
    id: 'alaska1964',
    name: ['1964 Great Alaska (Prince William Sound)', '1964年 アラスカ地震（プリンスウィリアム湾）', '1964 Alaska (Prince-William-Sund)', 'Аляска 1964 (залив Принца Уильяма)', 'Alaska 1964 (Estrecho del Príncipe Guillermo)'],
    when: '1964-03-28T03:36:14Z',
    lat: 60.908, lng: -147.339, depthKm: 25, mw: 9.2,
    strike: 246, dip: 10, rake: 90,
    lenKm: 800, widKm: 250, zTopKm: 4, nucAlong: 0.2,
    src: 'USGS; rupture area and slip after Plafker (1969), Johnson et al. (1996)',
    obs: {
      intensity: ['MMI XI (Anchorage · Valdez · Seward)', '改正メルカリ XI（アンカレジ／バルディーズ／スワード）', 'MMI XI', 'MMI XI', 'MMI XI'],
      slipM: 'mean ≈ 18 m on the main asperity',
      tsunamiM: 'local wave to 67 m (Valdez Arm); 4.5 m at Crescent City, California',
      deaths: '131 (9 from shaking, 122 from the tsunami)',
      note: ['The second-largest earthquake ever instrumentally recorded.', '観測史上2番目に大きい地震。', 'Das zweitstärkste je gemessene Beben.', 'Второе по силе землетрясение за историю наблюдений.', 'El segundo mayor terremoto jamás registrado.']
    }
  },
  {
    id: 'sumatra2004',
    name: ['2004 Sumatra–Andaman (Indian Ocean)', '2004年 スマトラ島沖地震（インド洋大津波）', '2004 Sumatra–Andamanen', 'Суматра–Андаманы 2004', 'Sumatra–Andamán 2004'],
    when: '2004-12-26T00:58:53Z',
    lat: 3.316, lng: 95.854, depthKm: 30, mw: 9.1,
    strike: 329, dip: 8, rake: 110,
    lenKm: 1300, widKm: 170, zTopKm: 5, nucAlong: 0.05,
    src: 'USGS NEIC / Global CMT; rupture length after Ammon et al. (2005), Lay et al. (2005)',
    obs: {
      intensity: ['MMI IX (Banda Aceh)', '改正メルカリ IX（バンダ・アチェ）', 'MMI IX (Banda Aceh)', 'MMI IX (Банда-Ачех)', 'MMI IX (Banda Aceh)'],
      slipM: 'mean ≈ 5–10 m, peak ≈ 20 m',
      tsunamiM: 'run-up to 30–51 m (northern Sumatra); 2–10 m across the Indian Ocean',
      deaths: '≈ 227,900 dead or missing across 14 countries',
      note: ['Rupture ran roughly 1,300 km northward over about 10 minutes.', '破壊は約10分かけて北へ約1,300km進行。', 'Der Bruch lief in ~10 Minuten rund 1.300 km nach Norden.', 'Разрыв прошёл ~1 300 км на север примерно за 10 минут.', 'La ruptura avanzó ~1.300 km hacia el norte en unos 10 minutos.']
    }
  },
  {
    id: 'kobe1995',
    name: ['1995 Kobe (Great Hanshin-Awaji)', '阪神・淡路大震災（1995 兵庫県南部地震）', '1995 Kobe (Hanshin-Awaji)', 'Кобе 1995 (Хансин-Авадзи)', 'Kobe 1995 (Gran Hanshin-Awaji)'],
    when: '1995-01-17T05:46:52+09:00',
    lat: 34.59, lng: 135.07, depthKm: 16, mw: 6.9,
    strike: 233, dip: 85, rake: 168,
    lenKm: 60, widKm: 20, zTopKm: 1, nucAlong: 0.45,
    src: 'JMA Mj 7.3 / USGS Mw 6.9; Nojima-fault mechanism after Kikuchi & Kanamori (1996)',
    obs: {
      intensity: ['JMA 7 — the first time the class was ever assigned', 'JMA震度7（震度7が初めて適用された地震）', 'JMA 7 — erstmals vergeben', 'JMA 7 — впервые присвоена', 'JMA 7 — asignada por primera vez'],
      slipM: 'mean ≈ 1.5–2 m, right-lateral strike-slip',
      tsunamiM: 'none of consequence (inland strike-slip)',
      deaths: '6,434 dead, 43,792 injured',
      note: ['A shallow crustal strike-slip event directly beneath a city — small moment, extreme local intensity.', '都市直下の浅い横ずれ断層。規模は小さいが局所の震度は極めて大きい。', 'Flaches Blattverschiebungsbeben direkt unter einer Stadt.', 'Мелкофокусный сдвиг прямо под городом.', 'Falla de desgarre somera justo bajo una ciudad.']
    }
  },
  {
    id: 'kanto1923',
    name: ['1923 Great Kantō', '関東大震災（1923 関東地震）', '1923 Großes Kantō-Beben', 'Великое землетрясение Канто 1923', 'Gran terremoto de Kantō de 1923'],
    when: '1923-09-01T11:58:32+09:00',
    lat: 35.33, lng: 139.13, depthKm: 23, mw: 7.9,
    strike: 290, dip: 25, rake: 140,
    lenKm: 130, widKm: 70, zTopKm: 3, nucAlong: 0.35,
    src: 'JMA Mj 7.9; Sagami-trough rupture model after Kanamori (1971) and Matsu’ura et al. (2007)',
    obs: {
      intensity: ['JMA 6 on the scale of the day (Sagami Bay coast, Tokyo lowlands)', '当時の階級で震度6（相模湾岸・東京低地）', 'JMA 6 (Skala von 1923)', 'JMA 6 (по шкале того времени)', 'JMA 6 (escala de la época)'],
      slipM: 'mean ≈ 4–6 m on the Sagami trough',
      tsunamiM: 'up to 12 m at Atami; 6 m along the Bōsō coast',
      deaths: '≈ 105,000 dead or missing — most of them in the firestorms that followed',
      note: ['Most of the loss came from fire, not from shaking: the simulator models the shaking only.', '被害の大半は地震動ではなく火災による。本シミュレータが計算するのは揺れのみ。', 'Der Großteil der Opfer entstand durch Feuer, nicht durch Erschütterung.', 'Большая часть жертв — от пожаров, а не от сотрясений.', 'La mayoría de las víctimas se debió a los incendios, no al temblor.']
    }
  },
  {
    id: 'turkiye2023',
    name: ['2023 Kahramanmaraş (Türkiye–Syria)', '2023年 トルコ・シリア地震（カフラマンマラシュ）', '2023 Kahramanmaraş (Türkei–Syrien)', 'Кахраманмараш 2023 (Турция–Сирия)', 'Kahramanmaraş 2023 (Turquía–Siria)'],
    when: '2023-02-06T01:17:35Z',
    lat: 37.226, lng: 37.014, depthKm: 10, mw: 7.8,
    strike: 228, dip: 89, rake: 1,
    lenKm: 350, widKm: 20, zTopKm: 0, nucAlong: 0.45,
    src: 'USGS NEIC / Global CMT; East Anatolian Fault rupture length after Melgar et al. (2023)',
    obs: {
      intensity: ['MMI XI–XII (Antakya · Kahramanmaraş)', '改正メルカリ XI〜XII（アンタキヤ／カフラマンマラシュ）', 'MMI XI–XII', 'MMI XI–XII', 'MMI XI–XII'],
      slipM: 'peak ≈ 8 m left-lateral on the East Anatolian Fault',
      tsunamiM: 'minor (≈ 0.2 m, İskenderun)',
      deaths: '≈ 53,500 in Türkiye and ≈ 8,500 in Syria',
      note: ['A second Mw 7.5 event on the Çardak fault followed nine hours later; only the first is modelled here.', '9時間後にチャルダク断層でMw7.5が発生（本シミュレーションは第1震のみ）。', 'Neun Stunden später folgte ein Mw 7,5 auf der Çardak-Verwerfung.', 'Через девять часов последовало событие Mw 7,5 на разломе Чардак.', 'Nueve horas después siguió un Mw 7,5 en la falla de Çardak.']
    }
  },
  {
    id: 'wenchuan2008',
    name: ['2008 Wenchuan (Sichuan)', '四川大地震（2008 汶川地震）', '2008 Wenchuan (Sichuan)', 'Вэньчуань 2008 (Сычуань)', 'Wenchuan 2008 (Sichuan)'],
    when: '2008-05-12T06:28:01Z',
    lat: 31.002, lng: 103.322, depthKm: 19, mw: 7.9,
    strike: 229, dip: 33, rake: 141,
    lenKm: 300, widKm: 40, zTopKm: 0, nucAlong: 0.1,
    src: 'USGS NEIC / Global CMT; Longmenshan rupture after Shen et al. (2009), Xu et al. (2009)',
    obs: {
      intensity: ['CSIS XI (Yingxiu · Beichuan) ≈ MMI XI', '中国震度階 XI（映秀・北川）≒ 改正メルカリ XI', 'CSIS XI ≈ MMI XI', 'CSIS XI ≈ MMI XI', 'CSIS XI ≈ MMI XI'],
      slipM: 'peak ≈ 9 m, oblique thrust with a dextral component',
      tsunamiM: 'none (inland)',
      deaths: '69,227 dead, 17,923 missing, 374,643 injured',
      note: ['The rupture ran ~300 km northeast along the Longmenshan thrust — strongly unilateral.', '龍門山断層に沿って北東へ約300km、強い一方向性の破壊。', 'Der Bruch lief ~300 km nach Nordosten — stark unilateral.', 'Разрыв прошёл ~300 км на северо-восток — резко односторонний.', 'La ruptura avanzó ~300 km al noreste — marcadamente unilateral.']
    }
  },
  {
    id: 'haiti2010',
    name: ['2010 Haiti (Léogâne)', '2010年 ハイチ地震（レオガン）', '2010 Haiti (Léogâne)', 'Гаити 2010 (Леоган)', 'Haití 2010 (Léogâne)'],
    when: '2010-01-12T21:53:10Z',
    lat: 18.443, lng: -72.571, depthKm: 13, mw: 7.0,
    strike: 251, dip: 70, rake: 28,
    lenKm: 50, widKm: 15, zTopKm: 1, nucAlong: 0.5,
    src: 'USGS NEIC / Global CMT; Enriquillo–Plantain Garden / Léogâne fault geometry after Calais et al. (2010), Hayes et al. (2010)',
    obs: {
      intensity: ['MMI IX (Port-au-Prince · Léogâne)', '改正メルカリ IX（ポルトープランス／レオガン）', 'MMI IX', 'MMI IX', 'MMI IX'],
      slipM: 'mean ≈ 2–4 m, oblique left-lateral with a reverse component',
      tsunamiM: 'local waves to 3 m (Petit-Goâve, Jacmel)',
      deaths: '100,000 – 316,000 (published estimates differ by a factor of three)',
      note: ['Most of the slip was on a blind thrust beside the Enriquillo fault, not on the fault itself.', 'すべりの大半はエンリキヨ断層そのものではなく、隣接する伏在逆断層で起きた。', 'Der Großteil des Versatzes lag auf einer blinden Aufschiebung neben der Enriquillo-Störung.', 'Основная подвижка произошла на скрытом взбросе рядом с разломом Энрикильо.', 'La mayor parte del desplazamiento ocurrió en un cabalgamiento ciego junto a la falla de Enriquillo.']
    }
  }
];

/* ══ THE SURFACE PROJECTION OF THE RUPTURE PLANE ═══════════════════════════════════════════════
   The simulator takes a drawn RING and treats it as the fault's surface projection (#R224), so a
   published rectangle has to be turned into one: length L along strike, and a down-dip width W that
   projects to W·cos δ measured from the top edge in the DOWN-DIP direction (strike + 90°, the
   right-hand rule the strike convention implies).

   ⚠ `nucAlong` PLACES THE HYPOCENTRE ON THAT RECTANGLE, and it is not decoration: the directivity
   term in js/seismic.js measures how much of the fault runs TOWARD each site from exactly this
   point (Ben-Menahem 1961; Somerville et al. 1997's X·cos θ). A Sumatra that nucleated in the middle
   would be a different earthquake from the one that happened.

   Local equirectangular about the hypocentre — the largest rectangle here is 1,300 km, where the
   projection error is a few km against a 170 km width, i.e. below the model's own resolution. */
export function ruptureRing(ev) {
  const D = Math.PI / 180;
  const cosLat = Math.max(0.1, Math.cos(ev.lat * D));
  const kmPerLng = 111.32 * cosLat, kmPerLat = 110.574;
  const s = ev.strike * D;
  /* unit vectors in km: along strike, and down-dip (90° clockwise from strike) */
  const ax = Math.sin(s), ay = Math.cos(s);
  const bx = Math.sin(s + Math.PI / 2), by = Math.cos(s + Math.PI / 2);
  const along = Math.max(1, +ev.lenKm || 1);
  const wProj = Math.max(1, (+ev.widKm || 1) * Math.cos((+ev.dip || 0) * D));
  const f = Math.max(0, Math.min(1, ev.nucAlong == null ? 0.5 : +ev.nucAlong));
  const a0 = -along * f, a1 = along * (1 - f);            /* backward / forward of the hypocentre */
  const corners = [[a0, 0], [a1, 0], [a1, wProj], [a0, wProj]];
  return corners.map(([u, v]) => {
    const dx = ax * u + bx * v, dy = ay * u + by * v;      /* km east, km north */
    return [ev.lng + dx / kmPerLng, ev.lat + dy / kmPerLat];
  });
}

/* the published seismic moment, in N·m — Hanks & Kanamori (1979), the same relation the simulator
   inverts. Used to derive a mean slip that is consistent with the rupture area on the row. */
export function momentOf(mw) { return Math.pow(10, 1.5 * mw + 9.1); }
