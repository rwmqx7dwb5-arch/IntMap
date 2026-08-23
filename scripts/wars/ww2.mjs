/* ============================================================================
 *  IntMap · WORLD WAR II — the curated record   (#R349)
 * ----------------------------------------------------------------------------
 *  The rules every row here obeys — what `control`, `fronts` and `events` are each allowed to claim,
 *  and why a day nobody wrote down gets no line — are stated once, in ./lang.mjs.
 *
 *  ⚠ TWO PLACES WHERE THIS FILE DELIBERATELY SAYS LESS THAN IT COULD ═════════════════════════
 *   · A POCKET IS NOT A LINE. Tobruk in 1941, Sevastopol in 1942, Courland in 1945, Bastogne in
 *     December 1944 — each was held by the side whose front was a hundred kilometres away, and a
 *     single line through a country cannot draw that. Each is an EVENT with its real dates instead,
 *     and the fill quietly gives the ground to the side that surrounded it. That is a known,
 *     bounded understatement; inventing a second polygon to carve out a siege is not.
 *   · THE PACIFIC HAS NO FRONT LINES HERE, because it did not have one. An island campaign is a
 *     sequence of places changing hands on documented days, which is exactly what `control` and
 *     `events` are, and drawing a line across the ocean would be an ornament, not a fact.
 * ==========================================================================*/
import { L, F_WW2 } from './lang.mjs';

export const WW2 = {
  id: 'ww2',
  name: L('World War II', '第二次世界大戦', 'Zweiter Weltkrieg', 'Вторая мировая война', 'Segunda Guerra Mundial', '第二次世界大戰', '第二次世界大战', 'Seconde Guerre mondiale', '제2차 세계 대전'),
  from: '1939-09-01', to: '1945-09-02',
  factions: F_WW2,
  control: {
    /* ── the Axis and the states it absorbed before the first shot ────────────────────────── */
    255: [['1939-09-01', 'AXIS']],                                       /* Germany — and the two fronts that were cutting it stop on the same day */
    305: [['1939-09-01', 'AXIS'], ['1945-05-08', 'ALLIED']],                                       /* Austria — annexed 12 Mar 1938; CShapes keeps it as its own polygon, so it can be shown held rather than erased */
    315: [['1939-09-01', 'AXIS'], ['1945-05-08', 'ALLIED']],             /* the rump of Czechoslovakia — occupied 15 Mar 1939 */
    /* ⚠ Japan is shown Axis from the first day of this window, and the window opens in Europe. Its
       war in China had been running since 7 Jul 1937; the Tripartite Pact (27 Sep 1940) is in the
       events below so the reader can see which fact is which. */
    740: [['1939-09-01', 'AXIS']],
    713: [['1939-09-01', 'AXIS']], 730: [['1939-09-01', 'AXIS']], 7351: [['1939-09-01', 'AXIS']],
    339: [['1939-09-01', 'AXIS'], ['1944-11-29', 'ALLIED']],             /* Albania — annexed by Italy 7 Apr 1939 */
    /* Italy — the armistice took the state out of the Axis on 8 Sep 1943, and Germany held the
       north the next morning. There is no line to quote for the three weeks between the armistice
       and the Volturno, so those weeks are CONTESTED rather than a country coloured all one way;
       from 1 Oct the front below says where the division ran. 2 May 1945 is the German surrender
       in Italy, and the front stops with it. */
    325: [['1940-06-10', 'AXIS'], ['1943-09-08', 'CONTESTED'], ['1945-05-02', 'ALLIED']],
    620: [['1940-06-10', 'AXIS'], ['1943-05-13', 'ALLIED']],             /* Libya */
    531: [['1940-06-10', 'AXIS'], ['1941-05-19', 'ALLIED']],             /* Eritrea */
    5200: [['1940-06-10', 'AXIS'], ['1941-03-20', 'ALLIED']],            /* Italian Somaliland */
    530: [['1939-09-01', 'AXIS'], ['1941-05-05', 'ALLIED']],             /* Ethiopia — under Italian rule since 1936; Haile Selassie returned to Addis Ababa 5 May 1941 */
    310: [['1940-11-20', 'AXIS'], ['1945-04-04', 'ALLIED']],             /* Hungary */
    360: [['1940-11-23', 'AXIS'], ['1944-08-23', 'ALLIED']],             /* Romania — the coup of 23 Aug 1944 */
    355: [['1941-03-01', 'AXIS'], ['1944-09-08', 'ALLIED']],             /* Bulgaria */
    375: [['1941-06-25', 'COBELL'], ['1944-09-19', 'NEUTRAL']],          /* Finland — co-belligerent, never an Axis member */
    800: [['1942-01-25', 'COBELL'], ['1945-08-16', 'NEUTRAL']],          /* Thailand */

    /* the two occupation zones CShapes puts in Germany's place on 1945-05-08 — the state ends there
       and these begin, so «who holds Berlin in August 1945» is answered by these rows, not by 255 */
    260: [['1945-05-08', 'ALLIED']], 265: [['1945-05-08', 'ALLIED']],

    /* ── the Allies ───────────────────────────────────────────────────────────────────────── */
    200: [['1939-09-01', 'ALLIED']], 220: [['1939-09-01', 'ALLIED']],
    20: [['1939-09-10', 'ALLIED']], 900: [['1939-09-03', 'ALLIED']], 920: [['1939-09-03', 'ALLIED']],
    560: [['1939-09-06', 'ALLIED']], 750: [['1939-09-03', 'ALLIED']], 710: [['1939-09-01', 'ALLIED']],
    2: [['1941-12-08', 'ALLIED']], 140: [['1942-08-22', 'ALLIED']], 70: [['1942-05-22', 'ALLIED']],
    365: [['1941-06-22', 'ALLIED']],                                     /* the USSR — neutral until Barbarossa */
    712: [['1941-06-22', 'ALLIED']],                                     /* Mongolia */
    /* — the British and French empires, entering with their metropole — */
    21: [['1939-09-03', 'ALLIED']], 31: [['1939-09-03', 'ALLIED']], 51: [['1939-09-03', 'ALLIED']],
    52: [['1939-09-03', 'ALLIED']], 53: [['1939-09-03', 'ALLIED']], 80: [['1939-09-03', 'ALLIED']],
    110: [['1939-09-03', 'ALLIED']], 338: [['1939-09-03', 'ALLIED']], 420: [['1939-09-03', 'ALLIED']],
    451: [['1939-09-03', 'ALLIED']], 452: [['1939-09-03', 'ALLIED']], 462: [['1939-09-03', 'ALLIED']],
    472: [['1939-09-03', 'ALLIED']], 475: [['1939-09-03', 'ALLIED']], 500: [['1939-09-03', 'ALLIED']],
    501: [['1939-09-03', 'ALLIED']], 511: [['1939-09-03', 'ALLIED']], 551: [['1939-09-03', 'ALLIED']],
    552: [['1939-09-03', 'ALLIED']], 553: [['1939-09-03', 'ALLIED']], 570: [['1939-09-03', 'ALLIED']],
    571: [['1939-09-03', 'ALLIED']], 572: [['1939-09-03', 'ALLIED']], 590: [['1939-09-03', 'ALLIED']],
    625: [['1939-09-03', 'ALLIED']], 651: [['1939-09-03', 'ALLIED']], 663: [['1939-09-03', 'ALLIED']],
    665: [['1939-09-03', 'ALLIED']], 645: [['1941-06-01', 'ALLIED']], 521: [['1939-09-03', 'ALLIED']],
    780: [['1939-09-03', 'ALLIED']], 781: [['1939-09-03', 'ALLIED']],
    /* — the ones that changed hands, each on its documented day — */
    290: [['1939-09-01', 'ALLIED'], ['1939-09-08', 'CONTESTED'], ['1941-06-30', 'AXIS'], ['1945-01-17', 'ALLIED']],
    390: [['1939-09-01', 'NEUTRAL'], ['1940-04-09', 'AXIS'], ['1945-05-05', 'ALLIED']],   /* Denmark */
    385: [['1939-09-01', 'NEUTRAL'], ['1940-04-09', 'CONTESTED'], ['1940-06-10', 'AXIS'], ['1945-05-08', 'ALLIED']],  /* Norway */
    210: [['1940-05-10', 'CONTESTED'], ['1940-05-15', 'AXIS'], ['1945-05-05', 'ALLIED']], /* Netherlands */
    211: [['1940-05-10', 'CONTESTED'], ['1940-05-28', 'AXIS'], ['1944-09-04', 'ALLIED']], /* Belgium */
    212: [['1940-05-10', 'AXIS'], ['1944-09-10', 'ALLIED']],             /* Luxembourg */
    345: [['1939-09-01', 'NEUTRAL'], ['1941-04-06', 'CONTESTED'], ['1941-04-17', 'AXIS'], ['1944-10-20', 'CONTESTED'], ['1945-05-15', 'ALLIED']],  /* Yugoslavia */
    350: [['1939-09-01', 'NEUTRAL'], ['1940-10-28', 'ALLIED'], ['1941-04-27', 'AXIS'], ['1944-10-14', 'ALLIED']],     /* Greece */
    /* — Vichy: France's own territory is cut by the demarcation line below; the empire followed Vichy
         until each piece was taken, and every one of those is a dated fact of its own — */
    615: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-08', 'ALLIED']],   /* Algeria */
    600: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-08', 'ALLIED']],   /* Morocco */
    616: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-09', 'AXIS'], ['1943-05-13', 'ALLIED']],  /* Tunisia */
    652: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1941-07-14', 'ALLIED']],   /* Syria */
    660: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1941-07-14', 'ALLIED']],   /* Lebanon */
    580: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-06', 'ALLIED']],   /* Madagascar */
    522: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-12-28', 'ALLIED']],   /* French Somaliland */
    433: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],   /* Senegal */
    432: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    435: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    436: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    437: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    438: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    434: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-23', 'ALLIED']],
    65: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1943-07-14', 'ALLIED']],
    66: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1943-07-14', 'ALLIED']],
    120: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1943-03-16', 'ALLIED']],
    585: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1942-11-30', 'ALLIED']],
    /* — Free French from the first months — */
    483: [['1939-09-03', 'ALLIED']], 482: [['1939-09-03', 'ALLIED']], 484: [['1939-09-03', 'ALLIED']],
    481: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1940-11-12', 'ALLIED']],
    471: [['1939-09-03', 'ALLIED']],
    930: [['1939-09-03', 'ALLIED']], 960: [['1939-09-03', 'ALLIED']],
    490: [['1940-05-10', 'ALLIED']],                                     /* Belgian Congo */
    /* — the Pacific and South-East Asia, each place on the day it fell and the day it was retaken — */
    815: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1941-07-28', 'AXIS'], ['1945-08-15', 'ALLIED']],  /* Indochina */
    811: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1941-07-28', 'AXIS'], ['1945-08-15', 'ALLIED']],
    812: [['1939-09-03', 'ALLIED'], ['1940-06-25', 'NEUTRAL'], ['1941-07-28', 'AXIS'], ['1945-08-15', 'ALLIED']],
    840: [['1939-09-01', 'ALLIED'], ['1941-12-08', 'CONTESTED'], ['1942-05-06', 'AXIS'], ['1944-10-20', 'CONTESTED'], ['1945-07-05', 'ALLIED']],  /* Philippines */
    821: [['1939-09-03', 'ALLIED'], ['1941-12-08', 'CONTESTED'], ['1942-01-31', 'AXIS'], ['1945-09-02', 'ALLIED']],
    822: [['1939-09-03', 'ALLIED'], ['1941-12-08', 'CONTESTED'], ['1942-01-31', 'AXIS'], ['1945-09-02', 'ALLIED']],
    827: [['1939-09-03', 'ALLIED'], ['1941-12-08', 'CONTESTED'], ['1942-02-15', 'AXIS'], ['1945-09-02', 'ALLIED']],  /* Straits Settlements — Singapore fell 15 Feb 1942 */
    823: [['1939-09-03', 'ALLIED'], ['1942-01-19', 'AXIS'], ['1945-09-02', 'ALLIED']],
    824: [['1939-09-03', 'ALLIED'], ['1941-12-24', 'AXIS'], ['1945-09-02', 'ALLIED']],
    850: [['1939-09-01', 'NEUTRAL'], ['1940-05-10', 'ALLIED'], ['1942-01-11', 'CONTESTED'], ['1942-03-09', 'AXIS'], ['1945-08-15', 'ALLIED']],  /* Dutch East Indies */
    775: [['1939-09-03', 'ALLIED'], ['1942-01-20', 'CONTESTED'], ['1942-05-20', 'AXIS'], ['1945-05-03', 'ALLIED']],  /* Burma */
    911: [['1939-09-03', 'ALLIED'], ['1942-03-08', 'CONTESTED'], ['1945-08-15', 'ALLIED']],   /* Papua */
    912: [['1939-09-03', 'ALLIED'], ['1942-01-23', 'AXIS'], ['1945-09-02', 'ALLIED']],        /* New Guinea */
    940: [['1939-09-03', 'ALLIED'], ['1942-05-03', 'CONTESTED'], ['1943-10-06', 'ALLIED']],   /* Solomon Islands */
    860: [['1939-09-01', 'NEUTRAL'], ['1942-02-20', 'AXIS'], ['1945-09-02', 'ALLIED']],       /* Portuguese Timor */
  },
  fronts: [
    {
      id: 'poland39',
      name: L('Invasion of Poland', 'ポーランド侵攻', 'Überfall auf Polen', 'Вторжение в Польшу', 'Invasión de Polonia', '波蘭戰役', '波兰战役', 'Invasion de la Pologne', '폴란드 침공'),
      left: 'AXIS', right: 'ALLIED', until: '1941-06-22',
      dates: [
        { d: '1939-09-14', cuts: [290], pts: ['Danzig', 'Bydgoszcz', 'Lodz', 'Krakow'] },
        { d: '1939-09-28', cuts: [290], left: 'AXIS', right: 'NEUTRAL',
          note: L('The German–Soviet demarcation line of 28 September 1939', '1939年9月28日の独ソ境界線', 'Die deutsch-sowjetische Demarkationslinie vom 28. September 1939', 'Германо-советская демаркационная линия 28 сентября 1939 года', 'La línea de demarcación germano-soviética del 28 de septiembre de 1939', '1939年9月28日的德蘇分界線', '1939年9月28日的德苏分界线', 'La ligne de démarcation germano-soviétique du 28 septembre 1939', '1939년 9월 28일 독소 경계선'),
          pts: ['Grodno', 'Brest', 'Lublin', 'Przemysl'] },
      ],
    },
    {
      id: 'west40',
      name: L('Battle of France', 'フランスの戦い', 'Westfeldzug 1940', 'Французская кампания', 'Batalla de Francia', '法國戰役', '法国战役', 'Bataille de France', '프랑스 전투'),
      left: 'AXIS', right: 'ALLIED', until: '1944-06-06',
      dates: [
        { d: '1940-05-21', cuts: [220], note: L('The panzers have reached the Channel at Abbeville', 'ドイツ装甲部隊がアブヴィルで英仏海峡に到達', 'Die Panzer haben bei Abbeville den Ärmelkanal erreicht', 'Танки вышли к Ла-Маншу у Абвиля', 'Los panzers han alcanzado el Canal en Abbeville', '德軍裝甲部隊在阿布維爾抵達英吉利海峽', '德军装甲部队在阿布维尔抵达英吉利海峡', 'Les panzers ont atteint la Manche à Abbeville', '독일 기갑부대가 아브빌에서 영불해협에 도달'),
          pts: ['Abbeville', 'Amiens', 'Sedan'] },
        { d: '1940-06-05', cuts: [220], pts: ['Abbeville', 'Amiens', 'Reims', 'Verdun'] },
        { d: '1940-06-14', cuts: [220], note: L('Paris has fallen', 'パリ陥落', 'Paris ist gefallen', 'Париж взят', 'París ha caído', '巴黎陷落', '巴黎陷落', 'Paris est tombée', '파리 함락'),
          pts: ['Le Havre', 'Paris', 'Troyes', 'Belfort'] },
        { d: '1940-06-25', cuts: [220], left: 'NEUTRAL', right: 'AXIS',
          note: L('The armistice demarcation line — the unoccupied zone is Vichy France', '休戦協定の境界線——南側が非占領地域（ヴィシー政権）', 'Die Demarkationslinie des Waffenstillstands — die unbesetzte Zone ist Vichy-Frankreich', 'Демаркационная линия перемирия — неоккупированная зона под властью Виши', 'La línea de demarcación del armisticio: la zona libre es la Francia de Vichy', '停戰協定分界線——南側為非佔領區（維希政權）', '停战协定分界线——南侧为非占领区（维希政权）', 'La ligne de démarcation de l’armistice — la zone libre est la France de Vichy', '휴전 협정 경계선 — 남쪽은 비점령 지역(비시 정권)'),
          pts: ['Saint-Jean-Pied-de-Port', 'Mont-de-Marsan', 'Libourne', 'Confolens', 'Vierzon', 'Moulins', 'Chalon-sur-Saone', 'Geneva'] },
        { d: '1942-11-11', cuts: [], note: L('Case Anton — Germany occupies the whole of France', 'アントン作戦——ドイツがフランス全土を占領', 'Unternehmen Anton — Deutschland besetzt ganz Frankreich', 'Операция «Антон» — Германия занимает всю Францию', 'Caso Antón: Alemania ocupa toda Francia', '安東行動——德國佔領法國全境', '安东行动——德国占领法国全境', 'Opération Anton — l’Allemagne occupe toute la France', '안톤 작전 — 독일이 프랑스 전역을 점령'),
          pts: [] },
      ],
    },
    {
      id: 'east2', until: '1945-05-09',
      name: L('Eastern Front', '東部戦線', 'Ostfront', 'Восточный фронт', 'Frente Oriental', '東方戰線', '东方战线', 'Front de l’Est', '동부 전선'),
      left: 'AXIS', right: 'ALLIED',
      dates: [
        { d: '1941-06-22', cuts: [365], note: L('Operation Barbarossa begins on the 1941 frontier', 'バルバロッサ作戦開始——1941年の国境線', 'Das Unternehmen Barbarossa beginnt an der Grenze von 1941', 'Начало операции «Барбаросса» на границе 1941 года', 'Comienza la Operación Barbarroja en la frontera de 1941', '巴巴羅薩行動在1941年國界線上開始', '巴巴罗萨行动在1941年国界线上开始', 'L’opération Barbarossa commence sur la frontière de 1941', '바르바로사 작전 개시 — 1941년 국경선'),
          pts: ['Memel', 'Grodno', 'Brest', 'Przemysl', 'Chernivtsi'] },
        { d: '1941-09-30', cuts: [365], note: L('Leningrad is encircled; Operation Typhoon opens', 'レニングラード包囲、タイフーン作戦開始', 'Leningrad ist eingeschlossen; das Unternehmen Taifun beginnt', 'Ленинград окружён, начинается операция «Тайфун»', 'Leningrado está cercada; comienza la Operación Tifón', '列寧格勒被圍，颱風行動展開', '列宁格勒被围，台风行动展开', 'Léningrad est encerclée ; l’opération Typhon commence', '레닌그라드 포위, 태풍 작전 개시'),
          pts: ['Leningrad', 'Novgorod', 'Staraya Russa', 'Velikiye Luki', 'Smolensk', 'Bryansk', 'Kharkiv', 'Zaporizhzhia', 'Melitopol', 'Perekop'] },
        { d: '1941-12-05', cuts: [365], note: L('The deepest German advance, on the day the Soviet counter-offensive at Moscow begins', 'ドイツ軍の最深進出——モスクワ反攻が始まった日', 'Der weiteste deutsche Vorstoß, am Tag der sowjetischen Gegenoffensive vor Moskau', 'Предел германского продвижения — в день начала советского контрнаступления под Москвой', 'El avance alemán más profundo, el día en que empieza la contraofensiva soviética ante Moscú', '德軍推進最深之日，也是莫斯科反攻開始之日', '德军推进最深之日，也是莫斯科反攻开始之日', 'L’avance allemande la plus profonde, le jour où débute la contre-offensive soviétique devant Moscou', '독일군 최심 진출 — 모스크바 반격이 시작된 날'),
          pts: ['Leningrad', 'Tikhvin', 'Staraya Russa', 'Velikiye Luki', 'Rzhev', 'Kalinin', 'Klin', 'Istra', 'Tula', 'Yelets', 'Kursk', 'Kharkiv', 'Taganrog'] },
        { d: '1942-11-19', cuts: [365], note: L('Operation Uranus begins at Stalingrad', 'スターリングラードでウラヌス作戦開始', 'Das Unternehmen Uranus beginnt bei Stalingrad', 'У Сталинграда начинается операция «Уран»', 'Comienza la Operación Urano en Stalingrado', '天王星行動在史達林格勒展開', '天王星行动在斯大林格勒展开', 'L’opération Uranus commence à Stalingrad', '스탈린그라드에서 천왕성 작전 개시'),
          pts: ['Leningrad', 'Staraya Russa', 'Velikiye Luki', 'Rzhev', 'Orel', 'Voronezh', 'Stalingrad', 'Elista', 'Mozdok', 'Novorossiysk'] },
        { d: '1943-07-04', cuts: [365], note: L('The eve of Kursk — the Soviet salient bulges west between Orel and Kharkov', 'クルスク前夜——オリョールとハリコフの間でソ連軍の突出部が西へ張り出す', 'Am Vorabend von Kursk — der sowjetische Frontbogen wölbt sich zwischen Orjol und Charkow nach Westen', 'Канун Курска — советский выступ вдаётся на запад между Орлом и Харьковом', 'La víspera de Kursk: el saliente soviético se abomba al oeste entre Oriol y Járkov', '庫爾斯克前夕——蘇軍突出部在奧廖爾與哈爾科夫之間西凸', '库尔斯克前夕——苏军突出部在奥廖尔与哈尔科夫之间西凸', 'La veille de Koursk — le saillant soviétique s’avance à l’ouest entre Orel et Kharkov', '쿠르스크 전야 — 오룔과 하리코프 사이에서 소련군 돌출부가 서쪽으로 돌출'),
          pts: ['Leningrad', 'Staraya Russa', 'Velikiye Luki', 'Smolensk', 'Bryansk', 'Bolkhov', 'Novosil',
            'Maloarkhangelsk', 'Sevsk', 'Rylsk', 'Belgorod', 'Izyum', 'Taganrog'] },
        { d: '1943-11-06', cuts: [365], note: L('Kiev is retaken', 'キエフ奪回', 'Kiew ist zurückerobert', 'Киев освобождён', 'Kiev es reconquistada', '基輔收復', '基辅收复', 'Kiev est reprise', '키예프 탈환'),
          pts: ['Leningrad', 'Novgorod', 'Nevel', 'Vitebsk', 'Orsha', 'Gomel', 'Kyiv', 'Kryvyi Rih', 'Melitopol', 'Perekop'] },
        { d: '1944-04-17', cuts: [365], note: L('The Dnieper–Carpathian offensive has reached the 1941 frontier in the south', 'ドニエプル・カルパチア攻勢が南部で1941年の国境に到達', 'Die Dnjepr-Karpaten-Operation hat im Süden die Grenze von 1941 erreicht', 'Днепровско-Карпатская операция вышла на границу 1941 года на юге', 'La ofensiva del Dniéper-Cárpatos ha alcanzado en el sur la frontera de 1941', '第聶伯河—喀爾巴阡攻勢在南線抵達1941年國界', '第聂伯河—喀尔巴阡攻势在南线抵达1941年国界', 'L’offensive Dniepr-Carpates a atteint au sud la frontière de 1941', '드네프르–카르파티아 공세가 남부에서 1941년 국경에 도달'),
          pts: ['Narva', 'Pskov', 'Vitebsk', 'Orsha', 'Mogilev', 'Kovel', 'Ternopil', 'Chernivtsi'] },
        { d: '1944-08-29', cuts: [365, 290], note: L('After Bagration and Jassy–Kishinev — the Red Army is on the Vistula', 'バグラチオン作戦とヤッシー＝キシニョフ攻勢の後——赤軍はヴィスワ川に到達', 'Nach Bagration und Jassy-Kischinew — die Rote Armee steht an der Weichsel', 'После «Багратиона» и Ясско-Кишинёвской операции Красная армия на Висле', 'Tras Bagration y Iasi-Chisinau: el Ejército Rojo está en el Vístula', '巴格拉基昂與雅西—基什尼奧夫攻勢之後——紅軍抵達維斯瓦河', '巴格拉基昂与雅西—基什尼奥夫攻势之后——红军抵达维斯瓦河', 'Après Bagration et Iassy-Kichinev — l’Armée rouge est sur la Vistule', '바그라티온과 야시–키시뇨프 공세 이후 — 붉은 군대가 비스와강에 도달'),
          pts: ['Riga', 'Kaunas', 'Deblin', 'Sandomierz', 'Gorlice'] },
        { d: '1945-02-01', cuts: [255], note: L('The Vistula–Oder offensive has carried the front to the Oder', 'ヴィスワ・オーデル攻勢で戦線はオーデル川へ', 'Die Weichsel-Oder-Operation hat die Front an die Oder getragen', 'Висло-Одерская операция вывела фронт на Одер', 'La ofensiva Vístula-Óder ha llevado el frente al Óder', '維斯瓦河—奧得河攻勢把戰線推到奧得河', '维斯瓦河—奥得河攻势把战线推到奥得河', 'L’offensive Vistule-Oder a porté le front sur l’Oder', '비스와–오데르 공세로 전선이 오데르강에 도달'),
          pts: ['Danzig', 'Kostrzyn', 'Wroclaw'] },
        { d: '1945-04-16', cuts: [255], note: L('The Berlin operation begins on the Oder–Neisse', 'オーデル・ナイセ線でベルリン攻防戦が始まる', 'Die Berliner Operation beginnt an Oder und Neiße', 'Берлинская операция начинается на Одере и Нейсе', 'La operación de Berlín comienza en el Óder-Neisse', '柏林戰役在奧得—尼斯河線展開', '柏林战役在奥得—尼斯河线展开', 'L’opération de Berlin commence sur l’Oder-Neisse', '오데르–나이세선에서 베를린 작전 개시'),
          pts: ['Szczecin', 'Kostrzyn', 'Dresden'] },
      ],
    },
    {
      id: 'finnish',
      name: L('Finnish Front', 'フィンランド戦線', 'Finnlandfront', 'Финский фронт', 'Frente finlandés', '芬蘭戰線', '芬兰战线', 'Front finlandais', '핀란드 전선'),
      left: 'AXIS', right: 'ALLIED', until: '1944-09-19',
      dates: [
        { d: '1941-12-06', cuts: [365], note: L('The Continuation War front, held almost unchanged until June 1944', '継続戦争の戦線。1944年6月までほぼ動かない', 'Die Front des Fortsetzungskrieges, bis Juni 1944 fast unverändert', 'Фронт Войны-продолжения, почти неизменный до июня 1944 года', 'El frente de la Guerra de Continuación, casi inmóvil hasta junio de 1944', '繼續戰爭的戰線，直到1944年6月幾乎未動', '继续战争的战线，直到1944年6月几乎未动', 'Le front de la guerre de Continuation, presque inchangé jusqu’en juin 1944', '계속 전쟁의 전선 — 1944년 6월까지 거의 그대로'),
          pts: ['Litsa', 'Kestenga', 'Medvezhyegorsk', 'Lodeynoye Pole', 'Sestroretsk'] },
      ],
    },
    {
      id: 'northafrica',
      name: L('North African Campaign', '北アフリカ戦線', 'Afrikafeldzug', 'Североафриканская кампания', 'Campaña del Norte de África', '北非戰役', '北非战役', 'Campagne d’Afrique du Nord', '북아프리카 전역'),
      left: 'AXIS', right: 'ALLIED', until: '1943-05-13',
      dates: [
        { d: '1940-09-16', cuts: [651], pts: ['Sidi Barrani', 'Siwa'] },
        { d: '1941-02-09', cuts: [620], note: L('Operation Compass has taken Cyrenaica', 'コンパス作戦でキレナイカを制圧', 'Die Operation Compass hat die Kyrenaika genommen', 'Операция «Компас» заняла Киренаику', 'La Operación Compass ha tomado la Cirenaica', '羅盤行動攻佔昔蘭尼加', '罗盘行动攻占昔兰尼加', 'L’opération Compass a pris la Cyrénaïque', '컴퍼스 작전으로 키레나이카 점령'),
          pts: ['El Agheila', 'Marada'] },
        { d: '1941-04-15', cuts: [620], note: L('Rommel is back at the Egyptian frontier; Tobruk holds out behind him', 'ロンメルはエジプト国境へ復帰。背後にトブルクが孤立して残る', 'Rommel steht wieder an der ägyptischen Grenze; Tobruk hält hinter ihm aus', 'Роммель снова у египетской границы; Тобрук держится у него в тылу', 'Rommel vuelve a la frontera egipcia; Tobruk resiste a su espalda', '隆美爾重回埃及邊界，托布魯克在其後方固守', '隆美尔重回埃及边界，托布鲁克在其后方固守', 'Rommel est de retour à la frontière égyptienne ; Tobrouk tient derrière lui', '롬멜이 이집트 국경으로 복귀 — 배후에 토브루크가 고립되어 버틴다'),
          pts: ['Sollum', 'Jaghbub'] },
        { d: '1942-07-01', cuts: [651], note: L('The El Alamein line — the deepest Axis advance into Egypt', 'エル・アラメイン線——枢軸軍のエジプト最深進出', 'Die Linie von El Alamein — der weiteste Vorstoß der Achse nach Ägypten', 'Линия Эль-Аламейна — предел продвижения Оси в Египте', 'La línea de El Alamein: el avance máximo del Eje en Egipto', '阿拉曼防線——軸心國深入埃及的極限', '阿拉曼防线——轴心国深入埃及的极限', 'La ligne d’El Alamein — l’avance maximale de l’Axe en Égypte', '엘 알라메인 선 — 추축군의 이집트 최심 진출'),
          pts: ['El Alamein', 'Qattara'] },
        { d: '1942-11-23', cuts: [620], pts: ['El Agheila', 'Marada'] },
        { d: '1943-01-23', cuts: [620], note: L('Tripoli has fallen', 'トリポリ陥落', 'Tripolis ist gefallen', 'Триполи взят', 'Trípoli ha caído', '的黎波里陷落', '的黎波里陷落', 'Tripoli est tombée', '트리폴리 함락'),
          pts: ['Tripoli', 'Ghadames'] },
        { d: '1943-03-20', cuts: [616], note: L('The Mareth Line in southern Tunisia', 'チュニジア南部のマレト線', 'Die Mareth-Linie in Südtunesien', 'Линия Марет на юге Туниса', 'La Línea Mareth en el sur de Túnez', '突尼西亞南部的馬雷特防線', '突尼斯南部的马雷特防线', 'La ligne Mareth dans le sud de la Tunisie', '튀니지 남부의 마레트 선'),
          pts: ['Mareth', 'Gabes'] },
      ],
    },
    {
      id: 'italy2',
      name: L('Italian Campaign', 'イタリア戦線', 'Italienfeldzug', 'Итальянская кампания', 'Campaña de Italia', '義大利戰役', '意大利战役', 'Campagne d’Italie', '이탈리아 전역'),
      left: 'ALLIED', right: 'AXIS', until: '1945-05-03',
      dates: [
        { d: '1943-10-01', cuts: [325], note: L('Naples is taken — the Volturno line', 'ナポリ占領——ヴォルトゥルノ線', 'Neapel ist genommen — die Volturno-Linie', 'Неаполь взят — линия Вольтурно', 'Nápoles es tomada: la línea del Volturno', '攻下那不勒斯——沃爾圖爾諾防線', '攻下那不勒斯——沃尔图尔诺防线', 'Naples est prise — la ligne du Volturno', '나폴리 점령 — 볼투르노 선'),
          pts: ['Naples', 'Termoli'] },
        { d: '1944-01-17', cuts: [325], note: L('The Gustav Line at Monte Cassino', 'モンテ・カッシーノのグスタフ線', 'Die Gustav-Linie bei Monte Cassino', 'Линия Густава у Монте-Кассино', 'La Línea Gustav en Montecassino', '卡西諾山的古斯塔夫防線', '卡西诺山的古斯塔夫防线', 'La ligne Gustave au Mont-Cassin', '몬테카시노의 구스타프 선'),
          pts: ['Gaeta', 'Cassino', 'Vasto'] },
        { d: '1944-06-05', cuts: [325], note: L('Rome has fallen', 'ローマ陥落', 'Rom ist gefallen', 'Рим взят', 'Roma ha caído', '羅馬陷落', '罗马陷落', 'Rome est tombée', '로마 함락'),
          pts: ['Civitavecchia', 'Rome', 'Pescara'] },
        { d: '1944-08-25', cuts: [325], note: L('The Gothic Line', 'ゴシック線', 'Die Gotenstellung', 'Готская линия', 'La Línea Gótica', '哥德防線', '哥特防线', 'La ligne gothique', '고딕 선'),
          pts: ['Pisa', 'Florence', 'Rimini'] },
        { d: '1945-04-21', cuts: [325], note: L('Bologna is taken; the German front in Italy collapses', 'ボローニャ占領——イタリアのドイツ軍戦線が崩壊', 'Bologna ist genommen; die deutsche Front in Italien bricht zusammen', 'Болонья взята, германский фронт в Италии рушится', 'Bolonia es tomada; el frente alemán en Italia se derrumba', '攻下波隆那，德軍在義大利的戰線崩潰', '攻下博洛尼亚，德军在意大利的战线崩溃', 'Bologne est prise ; le front allemand en Italie s’effondre', '볼로냐 점령 — 이탈리아 내 독일군 전선 붕괴'),
          pts: ['La Spezia', 'Bologna', 'Ravenna'] },
      ],
    },
    {
      id: 'west44', until: '1945-05-09',
      name: L('Western Front', '西部戦線', 'Westfront', 'Западный фронт', 'Frente Occidental', '西方戰線', '西方战线', 'Front de l’Ouest', '서부 전선'),
      left: 'ALLIED', right: 'AXIS',
      dates: [
        { d: '1944-06-30', cuts: [220], left: 'AXIS', right: 'ALLIED',
          note: L('The Normandy beachhead', 'ノルマンディーの橋頭堡', 'Der Brückenkopf in der Normandie', 'Нормандский плацдарм', 'La cabeza de playa de Normandía', '諾曼第灘頭堡', '诺曼底滩头堡', 'La tête de pont de Normandie', '노르망디 교두보'),
          pts: ['Barneville', 'Carentan', 'Saint-Lo', 'Bayeux', 'Caen', 'Ouistreham'] },
        { d: '1944-09-15', cuts: [220, 211], note: L('The Allies are at the German border after the pursuit across France', 'フランス追撃戦の後、連合軍はドイツ国境へ', 'Nach der Verfolgung quer durch Frankreich stehen die Alliierten an der deutschen Grenze', 'После преследования через всю Францию союзники у германской границы', 'Tras la persecución a través de Francia, los Aliados están en la frontera alemana', '橫貫法國的追擊之後，盟軍抵達德國邊界', '横贯法国的追击之后，盟军抵达德国边界', 'Après la poursuite à travers la France, les Alliés sont à la frontière allemande', '프랑스 추격전 이후 연합군이 독일 국경에 도달'),
          pts: ['Antwerp', 'Aachen', 'Metz', 'Belfort', 'Basel'] },
        { d: '1945-03-24', cuts: [255], note: L('The Rhine has been crossed', 'ライン川渡河', 'Der Rhein ist überschritten', 'Рейн форсирован', 'El Rin ha sido cruzado', '渡過萊茵河', '渡过莱茵河', 'Le Rhin est franchi', '라인강 도하'),
          pts: ['Nijmegen', 'Cologne', 'Karlsruhe'] },
        { d: '1945-04-25', cuts: [255], note: L('The Elbe — American and Soviet troops meet at Torgau', 'エルベ川——トルガウで米ソ両軍が握手', 'Die Elbe — amerikanische und sowjetische Truppen treffen sich bei Torgau', 'Эльба — американские и советские войска встречаются в Торгау', 'El Elba: las tropas estadounidenses y soviéticas se encuentran en Torgau', '易北河——美蘇兩軍在托爾高會師', '易北河——美苏两军在托尔高会师', 'L’Elbe — Américains et Soviétiques se rejoignent à Torgau', '엘베강 — 미군과 소련군이 토르가우에서 조우'),
          pts: ['Hamburg', 'Magdeburg', 'Torgau', 'Munich'] },
      ],
    },
    {
      id: 'china',
      name: L('Second Sino-Japanese War front', '日中戦争の戦線', 'Front des Zweiten Japanisch-Chinesischen Krieges', 'Фронт Японо-китайской войны', 'Frente de la Segunda Guerra Sino-Japonesa', '中國抗日戰爭戰線', '中国抗日战争战线', 'Front de la seconde guerre sino-japonaise', '중일 전쟁 전선'),
      left: 'ALLIED', right: 'AXIS',
      dates: [
        { d: '1939-09-01', cuts: [710], note: L('Japan holds the coast and the North China plain; the line has been broadly static since Wuhan fell in October 1938', '日本は沿岸部と華北平原を保持。1938年10月の武漢陥落以来、戦線はおおむね膠着', 'Japan hält die Küste und die nordchinesische Ebene; seit dem Fall von Wuhan im Oktober 1938 steht die Linie weitgehend still', 'Япония удерживает побережье и Великую Китайскую равнину; после падения Уханя в октябре 1938 года линия почти не менялась', 'Japón controla la costa y la llanura del norte de China; la línea está casi estática desde la caída de Wuhan en octubre de 1938', '日本控制沿海與華北平原；自1938年10月武漢失守以來戰線大致膠著', '日本控制沿海与华北平原；自1938年10月武汉失守以来战线大致胶着', 'Le Japon tient la côte et la plaine de Chine du Nord ; la ligne est globalement figée depuis la chute de Wuhan en octobre 1938', '일본이 연안과 화북 평원을 장악 — 1938년 10월 우한 함락 이후 전선은 대체로 교착'),
          pts: ['Baotou', 'Taiyuan', 'Zhengzhou', 'Yichang', 'Changsha', 'Guilin', 'Nanning'] },
        { d: '1944-12-10', cuts: [710], note: L('Operation Ichi-Go has opened the corridor to Indochina', '一号作戦（大陸打通作戦）で仏印までの回廊が開通', 'Die Operation Ichi-gō hat den Korridor nach Indochina geöffnet', 'Операция «Итиго» открыла коридор к Индокитаю', 'La Operación Ichi-Go ha abierto el corredor hacia Indochina', '一號作戰打通了通往印度支那的走廊', '一号作战打通了通往印度支那的走廊', 'L’opération Ichi-Go a ouvert le corridor vers l’Indochine', '이치고 작전으로 인도차이나까지 이어지는 회랑이 열림'),
          pts: ['Baotou', 'Xian', 'Yichang', 'Guilin', 'Nanning'] },
      ],
    },
  ],
  events: [
    { d: '1939-09-01', at: 'Danzig', wiki: 'Invasion_of_Poland', name: L('Invasion of Poland', 'ポーランド侵攻', 'Überfall auf Polen', 'Вторжение в Польшу', 'Invasión de Polonia', '波蘭戰役', '波兰战役', 'Invasion de la Pologne', '폴란드 침공') },
    { d: '1939-11-30', d2: '1940-03-13', at: 'Vyborg', wiki: 'Winter_War', name: L('Winter War', '冬戦争', 'Winterkrieg', 'Советско-финляндская война', 'Guerra de Invierno', '冬季戰爭', '冬季战争', 'Guerre d’Hiver', '겨울 전쟁') },
    { d: '1940-04-09', d2: '1940-06-10', at: 'Narvik', wiki: 'Norwegian_campaign', name: L('Norwegian campaign', 'ノルウェーの戦い', 'Unternehmen Weserübung', 'Норвежская кампания', 'Campaña de Noruega', '挪威戰役', '挪威战役', 'Campagne de Norvège', '노르웨이 전역') },
    { d: '1940-05-26', d2: '1940-06-04', at: 'Dunkirk', wiki: 'Dunkirk_evacuation', name: L('Dunkirk evacuation', 'ダンケルクの撤退', 'Schlacht von Dünkirchen', 'Дюнкеркская эвакуация', 'Evacuación de Dunkerque', '敦克爾克大撤退', '敦刻尔克大撤退', 'Bataille de Dunkerque', '됭케르크 철수') },
    { d: '1940-07-10', d2: '1940-10-31', at: 'London', wiki: 'Battle_of_Britain', name: L('Battle of Britain', 'バトル・オブ・ブリテン', 'Luftschlacht um England', 'Битва за Британию', 'Batalla de Inglaterra', '不列顛戰役', '不列颠战役', 'Bataille d’Angleterre', '영국 본토 항공전') },
    { d: '1940-09-27', at: 'Berlin', wiki: 'Tripartite_Pact', kind: 'political', name: L('Tripartite Pact', '日独伊三国同盟', 'Dreimächtepakt', 'Тройственный пакт', 'Pacto Tripartito', '三國同盟條約', '三国同盟条约', 'Pacte tripartite', '삼국 동맹 조약') },
    { d: '1941-04-06', d2: '1941-06-01', at: 'Heraklion', wiki: 'Battle_of_Greece', name: L('Balkan campaign and the fall of Crete', 'バルカン半島の戦いとクレタ島の戦い', 'Balkanfeldzug und Luftlandeschlacht um Kreta', 'Балканская кампания и битва за Крит', 'Campaña de los Balcanes y batalla de Creta', '巴爾幹戰役與克里特島戰役', '巴尔干战役与克里特岛战役', 'Campagne des Balkans et bataille de Crète', '발칸 전역과 크레타 전투') },
    { d: '1941-04-10', d2: '1941-11-27', at: 'Tobruk', wiki: 'Siege_of_Tobruk', name: L('Siege of Tobruk', 'トブルク包囲戦', 'Belagerung von Tobruk', 'Осада Тобрука', 'Sitio de Tobruk', '托布魯克圍城戰', '托布鲁克围城战', 'Siège de Tobrouk', '토브루크 공방전') },
    { d: '1941-06-22', d2: '1941-12-05', at: 'Minsk', wiki: 'Operation_Barbarossa', name: L('Operation Barbarossa', 'バルバロッサ作戦', 'Unternehmen Barbarossa', 'Операция «Барбаросса»', 'Operación Barbarroja', '巴巴羅薩行動', '巴巴罗萨行动', 'Opération Barbarossa', '바르바로사 작전') },
    { d: '1941-09-08', d2: '1944-01-27', at: 'Leningrad', wiki: 'Siege_of_Leningrad', name: L('Siege of Leningrad', 'レニングラード包囲戦', 'Leningrader Blockade', 'Блокада Ленинграда', 'Sitio de Leningrado', '列寧格勒圍城戰', '列宁格勒围城战', 'Siège de Léningrad', '레닌그라드 봉쇄') },
    { d: '1941-10-30', d2: '1942-07-04', at: 'Sevastopol', wiki: 'Siege_of_Sevastopol_(1941–1942)', name: L('Siege of Sevastopol', 'セヴァストポリ包囲戦', 'Schlacht um Sewastopol', 'Оборона Севастополя', 'Sitio de Sebastopol', '塞瓦斯托波爾圍城戰', '塞瓦斯托波尔围城战', 'Siège de Sébastopol', '세바스토폴 공방전') },
    { d: '1941-12-07', at: 'Pearl Harbor', wiki: 'Attack_on_Pearl_Harbor', name: L('Attack on Pearl Harbor', '真珠湾攻撃', 'Angriff auf Pearl Harbor', 'Нападение на Пёрл-Харбор', 'Ataque a Pearl Harbor', '珍珠港事件', '珍珠港事件', 'Attaque de Pearl Harbor', '진주만 공격') },
    { d: '1942-02-15', at: 'Singapore', wiki: 'Fall_of_Singapore', name: L('Fall of Singapore', 'シンガポールの戦い', 'Fall von Singapur', 'Падение Сингапура', 'Caída de Singapur', '新加坡戰役', '新加坡战役', 'Bataille de Singapour', '싱가포르 전투') },
    { d: '1942-06-04', d2: '1942-06-07', at: 'Midway', wiki: 'Battle_of_Midway', kind: 'naval', name: L('Battle of Midway', 'ミッドウェー海戦', 'Schlacht um Midway', 'Битва за Мидуэй', 'Batalla de Midway', '中途島海戰', '中途岛海战', 'Bataille de Midway', '미드웨이 해전') },
    { d: '1942-07-01', d2: '1942-11-11', at: 'El Alamein', wiki: 'Second_Battle_of_El_Alamein', name: L('The battles of El Alamein', 'エル・アラメインの戦い', 'Schlachten von El Alamein', 'Сражения при Эль-Аламейне', 'Batallas de El Alamein', '阿拉曼戰役', '阿拉曼战役', 'Batailles d’El Alamein', '엘 알라메인 전투') },
    { d: '1942-08-07', d2: '1943-02-09', at: 'Guadalcanal', wiki: 'Guadalcanal_campaign', name: L('Guadalcanal campaign', 'ガダルカナル島の戦い', 'Schlacht um Guadalcanal', 'Гуадалканальская кампания', 'Campaña de Guadalcanal', '瓜達康納爾島戰役', '瓜达尔卡纳尔岛战役', 'Campagne de Guadalcanal', '과달카날 전역') },
    { d: '1942-08-23', d2: '1943-02-02', at: 'Stalingrad', wiki: 'Battle_of_Stalingrad', name: L('Battle of Stalingrad', 'スターリングラード攻防戦', 'Schlacht von Stalingrad', 'Сталинградская битва', 'Batalla de Stalingrado', '史達林格勒戰役', '斯大林格勒战役', 'Bataille de Stalingrad', '스탈린그라드 전투') },
    { d: '1942-11-08', d2: '1942-11-16', at: 'Algiers', wiki: 'Operation_Torch', name: L('Operation Torch', 'トーチ作戦', 'Operation Torch', 'Операция «Факел»', 'Operación Torch', '火炬行動', '火炬行动', 'Opération Torch', '횃불 작전') },
    { d: '1943-07-05', d2: '1943-08-23', at: 'Kursk', wiki: 'Battle_of_Kursk', name: L('Battle of Kursk', 'クルスクの戦い', 'Schlacht bei Kursk', 'Курская битва', 'Batalla de Kursk', '庫爾斯克會戰', '库尔斯克会战', 'Bataille de Koursk', '쿠르스크 전투') },
    { d: '1943-07-09', d2: '1943-08-17', at: 'Palermo', wiki: 'Allied_invasion_of_Sicily', name: L('Allied invasion of Sicily', 'シチリア島の戦い', 'Alliierte Invasion Siziliens', 'Высадка союзников на Сицилии', 'Invasión aliada de Sicilia', '西西里島戰役', '西西里岛战役', 'Débarquement allié en Sicile', '연합군의 시칠리아 상륙') },
    { d: '1944-01-22', d2: '1944-06-05', at: 'Anzio', wiki: 'Battle_of_Anzio', name: L('Battle of Anzio', 'アンツィオの戦い', 'Schlacht um Anzio', 'Битва за Анцио', 'Batalla de Anzio', '安齊奧戰役', '安齐奥战役', 'Bataille d’Anzio', '안치오 전투') },
    { d: '1944-03-08', d2: '1944-07-03', at: 'Imphal', wiki: 'Battle_of_Imphal', name: L('Battles of Imphal and Kohima', 'インパール作戦', 'Schlachten von Imphal und Kohima', 'Битвы при Импхале и Кохиме', 'Batallas de Imfal y Kohima', '英帕爾戰役', '英帕尔战役', 'Batailles d’Imphal et de Kohima', '임팔 전투') },
    { d: '1944-06-06', d2: '1944-08-30', at: 'Bayeux', wiki: 'Normandy_landings', name: L('Normandy landings', 'ノルマンディー上陸作戦', 'Landung in der Normandie', 'Высадка в Нормандии', 'Desembarco de Normandía', '諾曼第登陸', '诺曼底登陆', 'Débarquement de Normandie', '노르망디 상륙 작전') },
    { d: '1944-06-22', d2: '1944-08-19', at: 'Minsk', wiki: 'Operation_Bagration', name: L('Operation Bagration', 'バグラチオン作戦', 'Operation Bagration', 'Операция «Багратион»', 'Operación Bagratión', '巴格拉基昂行動', '巴格拉基昂行动', 'Opération Bagration', '바그라티온 작전') },
    { d: '1944-08-15', at: 'Toulon', wiki: 'Operation_Dragoon', name: L('Operation Dragoon', 'ドラグーン作戦', 'Operation Dragoon', 'Операция «Драгун»', 'Operación Dragoon', '龍騎兵行動', '龙骑兵行动', 'Opération Dragoon', '드라군 작전') },
    { d: '1944-09-17', d2: '1944-09-25', at: 'Arnhem', wiki: 'Operation_Market_Garden', name: L('Operation Market Garden', 'マーケット・ガーデン作戦', 'Operation Market Garden', 'Операция «Маркет Гарден»', 'Operación Market Garden', '市場花園行動', '市场花园行动', 'Opération Market Garden', '마켓 가든 작전') },
    { d: '1944-10-23', d2: '1944-10-26', at: 'Leyte', wiki: 'Battle_of_Leyte_Gulf', kind: 'naval', name: L('Battle of Leyte Gulf', 'レイテ沖海戦', 'Schlacht im Golf von Leyte', 'Сражение в заливе Лейте', 'Batalla del golfo de Leyte', '雷伊泰灣海戰', '莱特湾海战', 'Bataille du golfe de Leyte', '레이테만 해전') },
    { d: '1944-12-16', d2: '1945-01-25', at: 'Bastogne', wiki: 'Battle_of_the_Bulge', name: L('Battle of the Bulge', 'バルジの戦い', 'Ardennenoffensive', 'Арденнская операция', 'Batalla de las Ardenas', '突出部之役', '突出部之役', 'Bataille des Ardennes', '벌지 전투') },
    { d: '1945-02-19', d2: '1945-03-26', at: 'Iwo Jima', wiki: 'Battle_of_Iwo_Jima', name: L('Battle of Iwo Jima', '硫黄島の戦い', 'Schlacht um Iwojima', 'Битва за Иводзиму', 'Batalla de Iwo Jima', '硫磺島戰役', '硫磺岛战役', 'Bataille d’Iwo Jima', '이오지마 전투') },
    { d: '1945-04-01', d2: '1945-06-22', at: 'Okinawa', wiki: 'Battle_of_Okinawa', name: L('Battle of Okinawa', '沖縄戦', 'Schlacht um Okinawa', 'Битва за Окинаву', 'Batalla de Okinawa', '沖繩島戰役', '冲绳岛战役', 'Bataille d’Okinawa', '오키나와 전투') },
    { d: '1945-04-16', d2: '1945-05-02', at: 'Berlin', wiki: 'Battle_of_Berlin', name: L('Battle of Berlin', 'ベルリンの戦い', 'Schlacht um Berlin', 'Берлинская операция', 'Batalla de Berlín', '柏林戰役', '柏林战役', 'Bataille de Berlin', '베를린 전투') },
    { d: '1945-05-08', at: 'Berlin', wiki: 'Victory_in_Europe_Day', kind: 'political', name: L('German surrender in Europe', 'ドイツの降伏', 'Bedingungslose Kapitulation der Wehrmacht', 'Капитуляция Германии', 'Rendición alemana', '德國投降', '德国投降', 'Capitulation allemande', '독일 항복') },
    { d: '1945-08-06', at: 'Hiroshima', wiki: 'Atomic_bombings_of_Hiroshima_and_Nagasaki', name: L('Atomic bombing of Hiroshima', '広島への原子爆弾投下', 'Atombombenabwurf auf Hiroshima', 'Атомная бомбардировка Хиросимы', 'Bombardeo atómico de Hiroshima', '廣島原子彈爆炸', '广岛原子弹爆炸', 'Bombardement atomique d’Hiroshima', '히로시마 원자폭탄 투하') },
    { d: '1945-08-09', at: 'Nagasaki', wiki: 'Atomic_bombings_of_Hiroshima_and_Nagasaki', name: L('Atomic bombing of Nagasaki', '長崎への原子爆弾投下', 'Atombombenabwurf auf Nagasaki', 'Атомная бомбардировка Нагасаки', 'Bombardeo atómico de Nagasaki', '長崎原子彈爆炸', '长崎原子弹爆炸', 'Bombardement atomique de Nagasaki', '나가사키 원자폭탄 투하') },
    { d: '1945-08-09', d2: '1945-09-02', at: 'Harbin', wiki: 'Soviet_invasion_of_Manchuria', name: L('Soviet invasion of Manchuria', 'ソ連対日参戦（満洲侵攻）', 'Sowjetische Invasion der Mandschurei', 'Маньчжурская операция', 'Invasión soviética de Manchuria', '蘇聯進攻滿洲', '苏联进攻满洲', 'Invasion soviétique de la Mandchourie', '소련의 만주 침공') },
    { d: '1945-09-02', at: 'Tokyo', wiki: 'Surrender_of_Japan', kind: 'political', name: L('Surrender of Japan', '日本の降伏', 'Kapitulation Japans', 'Капитуляция Японии', 'Rendición de Japón', '日本投降', '日本投降', 'Capitulation du Japon', '일본의 항복') },
  ],
};
