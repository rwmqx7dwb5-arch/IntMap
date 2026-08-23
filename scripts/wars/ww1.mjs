/* ============================================================================
 *  IntMap · WORLD WAR I — the curated record   (#R349)
 * ----------------------------------------------------------------------------
 *  The rules every row here obeys — what `control`, `fronts` and `events` are each allowed to
 *  claim, and why a day nobody wrote down gets no line — are stated once, in ./lang.mjs.
 * ==========================================================================*/
import { L, F_WW1 } from './lang.mjs';

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  WORLD WAR I · 28 July 1914 — 11 November 1918
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const WW1 = {
  id: 'ww1',
  name: L('World War I', '第一次世界大戦', 'Erster Weltkrieg', 'Первая мировая война', 'Primera Guerra Mundial', '第一次世界大戰', '第一次世界大战', 'Première Guerre mondiale', '제1차 세계 대전'),
  from: '1914-07-28', to: '1918-11-11',
  factions: F_WW1,
  /* gwcode → [[date, faction], …]. A country absent from this table is neutral for the whole war. */
  control: {
    300: [['1914-07-28', 'CENTRAL']],                                    /* Austria-Hungary */
    340: [['1914-07-28', 'ALLIED'], ['1915-11-24', 'CENTRAL'], ['1918-11-01', 'ALLIED']],   /* Serbia — overrun in the Oct–Nov 1915 offensive; Belgrade retaken 1 Nov 1918 */
    341: [['1914-08-05', 'ALLIED'], ['1916-01-25', 'CENTRAL'], ['1918-11-01', 'ALLIED']],   /* Montenegro — capitulated 25 Jan 1916 */
    255: [['1914-08-01', 'CENTRAL']],                                    /* Germany */
    365: [['1914-08-01', 'ALLIED'], ['1918-03-03', 'NEUTRAL']],          /* Russia — out at Brest-Litovsk */
    220: [['1914-08-03', 'ALLIED']],                                     /* France */
    211: [['1914-08-04', 'ALLIED'], ['1914-08-20', 'CONTESTED']],        /* Belgium — Brussels fell 20 Aug; the front takes over from 20 Nov */
    212: [['1914-08-02', 'CENTRAL']],                                    /* Luxembourg — occupied on day one, never a battlefield */
    200: [['1914-08-04', 'ALLIED']],                                     /* United Kingdom */
    740: [['1914-08-23', 'ALLIED']],                                     /* Japan */
    640: [['1914-10-29', 'CENTRAL']],                                    /* Ottoman Empire */
    325: [['1915-05-23', 'ALLIED']],                                     /* Italy */
    355: [['1915-10-14', 'CENTRAL'], ['1918-09-29', 'NEUTRAL']],         /* Bulgaria — Armistice of Salonica */
    360: [['1916-08-27', 'ALLIED'], ['1916-12-06', 'CONTESTED'], ['1918-05-07', 'CENTRAL'], ['1918-11-10', 'ALLIED']], /* Rumania — Bucharest fell 6 Dec 1916; Treaty of Bucharest 7 May 1918; re-entered 10 Nov 1918 */
    235: [['1916-03-09', 'ALLIED']],                                     /* Portugal */
    2: [['1917-04-06', 'ALLIED']],                                       /* United States */
    350: [['1917-06-29', 'ALLIED']],                                     /* Greece — after the National Schism; the Salonika front stood on its soil from 1915 */
    800: [['1917-07-22', 'ALLIED']],                                     /* Siam */
    710: [['1917-08-14', 'ALLIED']],                                     /* China */
    450: [['1917-08-04', 'ALLIED']],                                     /* Liberia */
    140: [['1917-10-26', 'ALLIED']],                                     /* Brazil */
    40: [['1917-04-07', 'ALLIED']], 95: [['1917-04-07', 'ALLIED']],      /* Cuba · Panama */
    90: [['1918-04-23', 'ALLIED']], 93: [['1918-05-08', 'ALLIED']],      /* Guatemala · Nicaragua */
    41: [['1918-07-12', 'ALLIED']], 91: [['1918-07-19', 'ALLIED']],      /* Haiti · Honduras */
    /* — the empires' territories, which entered with their metropole — */
    20: [['1914-08-04', 'ALLIED']], 21: [['1914-08-04', 'ALLIED']], 900: [['1914-08-04', 'ALLIED']],
    920: [['1914-08-04', 'ALLIED']], 560: [['1914-08-04', 'ALLIED']], 750: [['1914-08-04', 'ALLIED']],
    338: [['1914-08-04', 'ALLIED']], 31: [['1914-08-04', 'ALLIED']], 51: [['1914-08-04', 'ALLIED']],
    52: [['1914-08-04', 'ALLIED']], 53: [['1914-08-04', 'ALLIED']], 80: [['1914-08-04', 'ALLIED']],
    110: [['1914-08-04', 'ALLIED']], 420: [['1914-08-04', 'ALLIED']], 451: [['1914-08-04', 'ALLIED']],
    452: [['1914-08-04', 'ALLIED']], 475: [['1914-08-04', 'ALLIED']], 500: [['1914-08-04', 'ALLIED']],
    501: [['1914-08-04', 'ALLIED']], 511: [['1914-08-04', 'ALLIED']], 521: [['1914-08-04', 'ALLIED']],
    551: [['1914-08-04', 'ALLIED']], 552: [['1914-08-04', 'ALLIED']], 553: [['1914-08-04', 'ALLIED']],
    570: [['1914-08-04', 'ALLIED']], 571: [['1914-08-04', 'ALLIED']], 572: [['1914-08-04', 'ALLIED']],
    590: [['1914-08-04', 'ALLIED']], 625: [['1914-08-04', 'ALLIED']], 651: [['1914-08-04', 'ALLIED']],
    780: [['1914-08-04', 'ALLIED']], 781: [['1914-08-04', 'ALLIED']], 821: [['1914-08-04', 'ALLIED']],
    822: [['1914-08-04', 'ALLIED']], 823: [['1914-08-04', 'ALLIED']], 824: [['1914-08-04', 'ALLIED']],
    827: [['1914-08-04', 'ALLIED']], 835: [['1914-08-04', 'ALLIED']], 911: [['1914-08-04', 'ALLIED']],
    940: [['1914-08-04', 'ALLIED']], 950: [['1914-08-04', 'ALLIED']],
    65: [['1914-08-03', 'ALLIED']], 66: [['1914-08-03', 'ALLIED']], 120: [['1914-08-03', 'ALLIED']],
    432: [['1914-08-03', 'ALLIED']], 433: [['1914-08-03', 'ALLIED']], 434: [['1914-08-03', 'ALLIED']],
    435: [['1914-08-03', 'ALLIED']], 436: [['1914-08-03', 'ALLIED']], 437: [['1914-08-03', 'ALLIED']],
    438: [['1914-08-03', 'ALLIED']], 481: [['1914-08-03', 'ALLIED']], 482: [['1914-08-03', 'ALLIED']],
    483: [['1914-08-03', 'ALLIED']], 484: [['1914-08-03', 'ALLIED']], 522: [['1914-08-03', 'ALLIED']],
    580: [['1914-08-03', 'ALLIED']], 585: [['1914-08-03', 'ALLIED']], 600: [['1914-08-03', 'ALLIED']],
    615: [['1914-08-03', 'ALLIED']], 616: [['1914-08-03', 'ALLIED']], 811: [['1914-08-03', 'ALLIED']],
    812: [['1914-08-03', 'ALLIED']], 815: [['1914-08-03', 'ALLIED']], 930: [['1914-08-03', 'ALLIED']],
    960: [['1914-08-03', 'ALLIED']],
    490: [['1914-08-04', 'ALLIED']],                                     /* Belgian Congo */
    402: [['1916-03-09', 'ALLIED']], 404: [['1916-03-09', 'ALLIED']], 540: [['1916-03-09', 'ALLIED']],
    541: [['1916-03-09', 'ALLIED']], 860: [['1916-03-09', 'ALLIED']],
    620: [['1915-05-23', 'ALLIED']], 531: [['1915-05-23', 'ALLIED']], 5200: [['1915-05-23', 'ALLIED']],
    713: [['1914-08-23', 'ALLIED']], 730: [['1914-08-23', 'ALLIED']], 7351: [['1914-08-23', 'ALLIED']],
    /* — the German colonies, each taken on its own documented day — */
    460: [['1914-08-01', 'CENTRAL'], ['1914-08-26', 'ALLIED']],          /* Togoland — surrendered 26 Aug 1914 */
    912: [['1914-08-01', 'CENTRAL'], ['1914-09-17', 'ALLIED']],          /* German New Guinea — 17 Sep 1914 */
    565: [['1914-08-01', 'CENTRAL'], ['1915-07-09', 'ALLIED']],          /* German South West Africa — 9 Jul 1915 */
    470: [['1914-08-01', 'CENTRAL'], ['1916-02-18', 'ALLIED']],          /* Kamerun — last garrison surrendered 18 Feb 1916 */
    510: [['1914-08-01', 'CENTRAL'], ['1916-09-04', 'CONTESTED']],   /* German East Africa — Dar es Salaam fell 4 Sep 1916, and the campaign was STILL RUNNING when the armistice closed this window: von Lettow-Vorbeck did not surrender until 25 Nov 1918, a fortnight past the last day this layer draws. Contested to the end is the true answer here. */
  },
  fronts: [
    {
      id: 'west',
      name: L('Western Front', '西部戦線', 'Westfront', 'Западный фронт', 'Frente Occidental', '西方戰線', '西方战线', 'Front de l’Ouest', '서부 전선'),
      left: 'ALLIED', right: 'CENTRAL',    /* the lines run north → south, so «left» is the western side */
      dates: [
        { d: '1914-09-05', cuts: [220], note: L('The German high-water mark on the eve of the Marne', 'マルヌ会戦前夜、ドイツ軍の最大進出線', 'Der weiteste deutsche Vormarsch am Vorabend der Marneschlacht', 'Предел германского продвижения накануне Марны', 'El avance máximo alemán en vísperas del Marne', '馬恩河戰役前夕德軍推進的最遠線', '马恩河战役前夕德军推进的最远线', 'L’avance allemande maximale à la veille de la Marne', '마른 전투 전야, 독일군 최대 진출선'),
          pts: ['Meaux', 'Chateau-Thierry', 'Vitry-le-Francois', 'Douaumont', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1914-09-13', cuts: [220], pts: ['Noyon', 'Soissons', 'Reims', 'Douaumont', 'Saint-Mihiel', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1914-11-20', cuts: [211, 220], note: L('The line after the Race to the Sea — it will barely move for three years', '「海への競争」後の戦線。以後3年間ほとんど動かない', 'Die Linie nach dem Wettlauf zum Meer — sie bewegt sich drei Jahre lang kaum', 'Линия после «бега к морю» — три года она почти не сдвинется', 'La línea tras la Carrera hacia el Mar: apenas se moverá en tres años', '「奔向大海」後的戰線，此後三年幾乎不動', '“奔向大海”后的战线，此后三年几乎不动', 'La ligne après la Course à la mer — elle ne bougera presque pas pendant trois ans', '“바다로의 경주” 이후의 전선 — 이후 3년간 거의 움직이지 않는다'),
          pts: ['Nieuwpoort', 'Diksmuide', 'Ypres', 'Armentieres', 'Lens', 'Arras', 'Albert', 'Peronne', 'Noyon', 'Soissons', 'Reims', 'Douaumont', 'Saint-Mihiel', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1916-07-01', cuts: [211, 220], pts: ['Nieuwpoort', 'Diksmuide', 'Ypres', 'Armentieres', 'Lens', 'Arras', 'Albert', 'Peronne', 'Noyon', 'Soissons', 'Reims', 'Douaumont', 'Saint-Mihiel', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1917-04-05', cuts: [211, 220], note: L('After the German withdrawal to the Hindenburg Line', 'ドイツ軍のヒンデンブルク線への後退後', 'Nach dem deutschen Rückzug auf die Siegfriedstellung', 'После отхода немцев на линию Гинденбурга', 'Tras la retirada alemana a la Línea Hindenburg', '德軍後撤至興登堡防線之後', '德军后撤至兴登堡防线之后', 'Après le repli allemand sur la ligne Hindenburg', '독일군이 힌덴부르크 선으로 후퇴한 뒤'),
          pts: ['Nieuwpoort', 'Diksmuide', 'Ypres', 'Armentieres', 'Lens', 'Arras', 'Cambrai', 'Saint-Quentin', 'Laon', 'Reims', 'Douaumont', 'Saint-Mihiel', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1918-06-06', cuts: [211, 220], note: L('The deepest point of the German spring offensives', 'ドイツ軍春季攻勢の最深到達点', 'Der tiefste Punkt der deutschen Frühjahrsoffensiven', 'Наибольшее продвижение германских весенних наступлений', 'El punto más profundo de las ofensivas alemanas de primavera', '德軍春季攻勢推進最深之處', '德军春季攻势推进最深之处', 'Le point le plus profond des offensives allemandes du printemps', '독일군 춘계 공세의 최심 진출점'),
          pts: ['Nieuwpoort', 'Ypres', 'Armentieres', 'Arras', 'Albert', 'Montdidier', 'Compiegne', 'Chateau-Thierry', 'Reims', 'Douaumont', 'Saint-Mihiel', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1918-09-26', cuts: [211, 220], pts: ['Nieuwpoort', 'Ypres', 'Armentieres', 'Lens', 'Cambrai', 'Saint-Quentin', 'Laon', 'Reims', 'Douaumont', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
        { d: '1918-11-11', cuts: [211, 220], note: L('The line at 11:00 on 11 November 1918', '1918年11月11日11時の戦線', 'Die Linie um 11:00 Uhr am 11. November 1918', 'Линия на 11:00 11 ноября 1918 года', 'La línea a las 11:00 del 11 de noviembre de 1918', '1918年11月11日11時的戰線', '1918年11月11日11时的战线', 'La ligne à 11 h le 11 novembre 1918', '1918년 11월 11일 11시의 전선'),
          pts: ['Ghent', 'Mons', 'Charleroi', 'Namur', 'Sedan', 'Douaumont', 'Pont-a-Mousson', 'Luneville', 'Saint-Die', 'Thann', 'Pfetterhouse'] },
      ],
    },
    {
      id: 'east1',
      name: L('Eastern Front', '東部戦線', 'Ostfront', 'Восточный фронт', 'Frente Oriental', '東方戰線', '东方战线', 'Front de l’Est', '동부 전선'),
      left: 'CENTRAL', right: 'ALLIED',
      dates: [
        { d: '1914-09-12', cuts: [365, 300], note: L('Russian Poland holds; the Russians are deep in Galicia after Lemberg', 'ロシア領ポーランドは保持され、レンベルク会戦後ガリツィア深部までロシア軍が進出', 'Russisch-Polen hält; nach Lemberg stehen die Russen tief in Galizien', 'Русская Польша держится; после Львова русские глубоко в Галиции', 'La Polonia rusa resiste; tras Lemberg los rusos están en el fondo de Galitzia', '俄屬波蘭仍在，倫貝格會戰後俄軍深入加利西亞', '俄属波兰仍在，伦贝格会战后俄军深入加利西亚', 'La Pologne russe tient ; après Lemberg les Russes sont au fond de la Galicie', '러시아령 폴란드는 유지되고, 렘베르크 전투 후 러시아군이 갈리치아 깊숙이 진출'),
          pts: ['Memel', 'Kaunas', 'Grodno', 'Warsaw', 'Krakow', 'Tarnow', 'Przemysl', 'Chernivtsi'] },
        { d: '1915-05-02', cuts: [365, 300], pts: ['Memel', 'Kaunas', 'Grodno', 'Warsaw', 'Krakow', 'Gorlice', 'Przemysl', 'Chernivtsi'] },
        { d: '1915-09-19', cuts: [365], note: L('After the Great Retreat — Russian Poland, Lithuania and Courland are lost', '大撤退の後——ロシア領ポーランド・リトアニア・クールラントを喪失', 'Nach dem Großen Rückzug — Russisch-Polen, Litauen und Kurland sind verloren', 'После Великого отступления — Русская Польша, Литва и Курляндия потеряны', 'Tras la Gran Retirada: se pierden la Polonia rusa, Lituania y Curlandia', '大撤退之後——俄屬波蘭、立陶宛與庫爾蘭喪失', '大撤退之后——俄属波兰、立陶宛与库尔兰丧失', 'Après la Grande Retraite — la Pologne russe, la Lituanie et la Courlande sont perdues', '대후퇴 이후 — 러시아령 폴란드·리투아니아·쿠를란트 상실'),
          pts: ['Riga', 'Daugavpils', 'Baranavichy', 'Pinsk', 'Rivne', 'Ternopil', 'Chernivtsi'] },
        { d: '1916-09-20', cuts: [365], note: L('After the Brusilov Offensive', 'ブルシーロフ攻勢の後', 'Nach der Brussilow-Offensive', 'После Брусиловского прорыва', 'Tras la Ofensiva Brusílov', '布魯西洛夫攻勢之後', '布鲁西洛夫攻势之后', 'Après l’offensive Broussilov', '브루실로프 공세 이후'),
          pts: ['Riga', 'Daugavpils', 'Baranavichy', 'Pinsk', 'Lutsk', 'Ternopil', 'Chernivtsi'] },
        { d: '1917-09-03', cuts: [365], pts: ['Riga', 'Daugavpils', 'Baranavichy', 'Pinsk', 'Rivne', 'Ternopil', 'Chernivtsi'] },
        { d: '1918-03-03', cuts: [365], right: 'NEUTRAL', note: L('The Brest-Litovsk line — Russia leaves the war', 'ブレスト＝リトフスク条約の線——ロシアが戦争から離脱', 'Die Linie von Brest-Litowsk — Russland scheidet aus dem Krieg aus', 'Линия Брест-Литовска — Россия выходит из войны', 'La línea de Brest-Litovsk: Rusia abandona la guerra', '布列斯特—立陶夫斯克線——俄國退出戰爭', '布列斯特—立托夫斯克线——俄国退出战争', 'La ligne de Brest-Litovsk — la Russie quitte la guerre', '브레스트-리토프스크 선 — 러시아가 전쟁에서 이탈'),
          pts: ['Narva', 'Pskov', 'Orsha', 'Mogilev', 'Gomel', 'Kyiv', 'Kherson'] },
      ],
    },
    {
      id: 'italian1',
      name: L('Italian Front', 'イタリア戦線', 'Italienfront', 'Итальянский фронт', 'Frente italiano', '義大利戰線', '意大利战线', 'Front italien', '이탈리아 전선'),
      left: 'ALLIED', right: 'CENTRAL',
      dates: [
        { d: '1915-06-23', cuts: [300], pts: ['Stelvio Pass', 'Tonale Pass', 'Asiago', 'Cortina', 'Tolmezzo', 'Kobarid', 'Gorizia', 'Monfalcone'] },
        { d: '1917-09-12', cuts: [300], pts: ['Stelvio Pass', 'Tonale Pass', 'Asiago', 'Cortina', 'Tolmezzo', 'Kobarid', 'Gorizia', 'Monfalcone'] },
        { d: '1917-11-12', cuts: [325], note: L('After Caporetto — the Italians hold on the Piave', 'カポレットの後——イタリア軍はピアーヴェ川で踏みとどまる', 'Nach Karfreit — die Italiener halten am Piave', 'После Капоретто — итальянцы держатся на Пьяве', 'Tras Caporetto: los italianos resisten en el Piave', '卡波雷托之後——義軍守住皮亞韋河', '卡波雷托之后——意军守住皮亚韦河', 'Après Caporetto — les Italiens tiennent sur la Piave', '카포레토 이후 — 이탈리아군이 피아베강에서 저지'),
          pts: ['Tonale Pass', 'Rovereto', 'Asiago', 'Feltre', 'Montello', 'Cortellazzo'] },
        { d: '1918-06-24', cuts: [325], pts: ['Tonale Pass', 'Rovereto', 'Asiago', 'Feltre', 'Montello', 'Cortellazzo'] },
        { d: '1918-11-02', cuts: [300], note: L('Vittorio Veneto — the Austro-Hungarian front has collapsed', 'ヴィットリオ・ヴェネト——オーストリア＝ハンガリー戦線の崩壊', 'Vittorio Veneto — die österreichisch-ungarische Front ist zusammengebrochen', 'Витторио-Венето — австро-венгерский фронт рухнул', 'Vittorio Veneto: el frente austrohúngaro se ha derrumbado', '維托里奧·韋內托——奧匈戰線崩潰', '维托里奥·韦内托——奥匈战线崩溃', 'Vittorio Veneto — le front austro-hongrois s’est effondré', '비토리오 베네토 — 오스트리아·헝가리 전선 붕괴'),
          pts: ['Tonale Pass', 'Trento', 'Cortina', 'Udine', 'Trieste'] },
      ],
    },
    {
      id: 'salonika',
      name: L('Macedonian (Salonika) Front', 'マケドニア（サロニカ）戦線', 'Mazedonienfront (Saloniki)', 'Македонский (Салоникский) фронт', 'Frente de Macedonia (Salónica)', '馬其頓（薩洛尼卡）戰線', '马其顿（萨洛尼卡）战线', 'Front de Macédoine (Salonique)', '마케도니아(살로니카) 전선'),
      left: 'ALLIED', right: 'CENTRAL',
      dates: [
        { d: '1916-11-19', cuts: [350], note: L('After the Allies retook Monastir', '連合国がモナスティルを奪回した後', 'Nachdem die Alliierten Monastir zurückerobert hatten', 'После взятия союзниками Монастира', 'Tras la reconquista aliada de Monastir', '協約國奪回莫納斯提爾之後', '协约国夺回莫纳斯提尔之后', 'Après la reprise de Monastir par les Alliés', '연합군이 모나스티르를 탈환한 뒤'),
          pts: ['Vlore', 'Bitola', 'Doiran', 'Struma'] },
        { d: '1918-09-29', cuts: [350], pts: ['Vlore', 'Bitola', 'Doiran', 'Struma'] },
      ],
    },
    {
      id: 'palestine',
      name: L('Sinai and Palestine Front', 'シナイ・パレスチナ戦線', 'Sinai- und Palästinafront', 'Синайско-Палестинский фронт', 'Frente del Sinaí y Palestina', '西奈與巴勒斯坦戰線', '西奈与巴勒斯坦战线', 'Front du Sinaï et de la Palestine', '시나이·팔레스타인 전선'),
      left: 'ALLIED', right: 'CENTRAL',
      dates: [
        { d: '1917-03-26', cuts: [640], note: L('The Gaza–Beersheba line', 'ガザ＝ベエルシェバ線', 'Die Linie Gaza–Beerscheba', 'Линия Газа — Беэр-Шева', 'La línea Gaza–Beerseba', '加薩—貝爾謝巴線', '加沙—贝尔谢巴线', 'La ligne Gaza–Bersabée', '가자–브엘셰바 선'),
          pts: ['Gaza', 'Beersheba'] },
        { d: '1917-12-11', cuts: [640], note: L('Jerusalem has fallen', 'エルサレム陥落', 'Jerusalem ist gefallen', 'Иерусалим взят', 'Jerusalén ha caído', '耶路撒冷陷落', '耶路撒冷陷落', 'Jérusalem est tombée', '예루살렘 함락'),
          pts: ['Jaffa', 'Jerusalem'] },
        { d: '1918-10-01', cuts: [640], note: L('After Megiddo — Damascus taken', 'メギドの後——ダマスカス占領', 'Nach Megiddo — Damaskus eingenommen', 'После Мегиддо — взят Дамаск', 'Tras Meguido: Damasco tomado', '米吉多之後——攻下大馬士革', '米吉多之后——攻下大马士革', 'Après Megiddo — Damas prise', '메기도 이후 — 다마스쿠스 점령'),
          pts: ['Beirut', 'Damascus'] },
      ],
    },
  ],
  events: [
    { d: '1914-06-28', at: 'Sarajevo', wiki: 'Assassination_of_Archduke_Franz_Ferdinand', kind: 'political', name: L('Assassination of Archduke Franz Ferdinand', 'サラエヴォ事件', 'Attentat von Sarajevo', 'Сараевское убийство', 'Atentado de Sarajevo', '塞拉耶佛事件', '萨拉热窝事件', 'Attentat de Sarajevo', '사라예보 사건') },
    { d: '1914-08-04', d2: '1914-08-16', at: 'Liege', wiki: 'Battle_of_Liège', name: L('Battle of Liège', 'リエージュ要塞攻防戦', 'Schlacht um Lüttich', 'Осада Льежа', 'Batalla de Lieja', '列日戰役', '列日战役', 'Bataille de Liège', '리에주 전투') },
    { d: '1914-08-26', d2: '1914-08-30', at: 'Olsztynek', wiki: 'Battle_of_Tannenberg', name: L('Battle of Tannenberg', 'タンネンベルクの戦い', 'Schlacht bei Tannenberg', 'Битва при Танненберге', 'Batalla de Tannenberg', '坦能堡戰役', '坦能堡战役', 'Bataille de Tannenberg', '타넨베르크 전투') },
    { d: '1914-09-06', d2: '1914-09-12', at: 'Meaux', wiki: 'First_Battle_of_the_Marne', name: L('First Battle of the Marne', '第一次マルヌ会戦', 'Erste Marneschlacht', 'Первая битва на Марне', 'Primera batalla del Marne', '第一次馬恩河戰役', '第一次马恩河战役', 'Première bataille de la Marne', '제1차 마른 전투') },
    { d: '1914-10-19', d2: '1914-11-22', at: 'Ypres', wiki: 'First_Battle_of_Ypres', name: L('First Battle of Ypres', '第一次イーペルの戦い', 'Erste Flandernschlacht', 'Первая битва при Ипре', 'Primera batalla de Ypres', '第一次伊珀爾戰役', '第一次伊普尔战役', 'Première bataille d’Ypres', '제1차 이프르 전투') },
    { d: '1915-04-25', d2: '1916-01-09', at: 'Cape Helles', wiki: 'Gallipoli_campaign', name: L('Gallipoli campaign', 'ガリポリの戦い', 'Schlacht von Gallipoli', 'Дарданелльская операция', 'Campaña de Galípoli', '加里波利之戰', '加里波利之战', 'Bataille des Dardanelles', '갈리폴리 전투') },
    { d: '1915-05-02', d2: '1915-09-19', at: 'Gorlice', wiki: 'Gorlice–Tarnów_offensive', name: L('Gorlice–Tarnów offensive', 'ゴルリツェ＝タルヌフ攻勢', 'Schlacht von Gorlice-Tarnów', 'Горлицкий прорыв', 'Ofensiva de Gorlice-Tarnów', '戈爾利采—塔爾努夫攻勢', '戈尔利采—塔尔努夫攻势', 'Offensive de Gorlice-Tarnów', '고를리체–타르누프 공세') },
    { d: '1916-02-21', d2: '1916-12-18', at: 'Verdun', wiki: 'Battle_of_Verdun', name: L('Battle of Verdun', 'ヴェルダンの戦い', 'Schlacht um Verdun', 'Верденская битва', 'Batalla de Verdún', '凡爾登戰役', '凡尔登战役', 'Bataille de Verdun', '베르됭 전투') },
    { d: '1916-05-31', d2: '1916-06-01', at: 'Jutland', wiki: 'Battle_of_Jutland', kind: 'naval', name: L('Battle of Jutland', 'ユトランド沖海戦', 'Skagerrakschlacht', 'Ютландское сражение', 'Batalla de Jutlandia', '日德蘭海戰', '日德兰海战', 'Bataille du Jutland', '유틀란트 해전') },
    { d: '1916-06-04', d2: '1916-09-20', at: 'Lutsk', wiki: 'Brusilov_offensive', name: L('Brusilov Offensive', 'ブルシーロフ攻勢', 'Brussilow-Offensive', 'Брусиловский прорыв', 'Ofensiva Brusílov', '布魯西洛夫攻勢', '布鲁西洛夫攻势', 'Offensive Broussilov', '브루실로프 공세') },
    { d: '1916-07-01', d2: '1916-11-18', at: 'Albert', wiki: 'Battle_of_the_Somme', name: L('Battle of the Somme', 'ソンムの戦い', 'Schlacht an der Somme', 'Битва на Сомме', 'Batalla del Somme', '索姆河戰役', '索姆河战役', 'Bataille de la Somme', '솜 전투') },
    { d: '1917-04-09', d2: '1917-05-16', at: 'Arras', wiki: 'Battle_of_Arras_(1917)', name: L('Battle of Arras', 'アラスの戦い', 'Schlacht bei Arras', 'Битва при Аррасе', 'Batalla de Arrás', '阿拉斯戰役', '阿拉斯战役', 'Bataille d’Arras', '아라스 전투') },
    { d: '1917-07-31', d2: '1917-11-10', at: 'Ypres', wiki: 'Battle_of_Passchendaele', name: L('Battle of Passchendaele', 'パッシェンデールの戦い', 'Dritte Flandernschlacht', 'Битва при Пашендейле', 'Batalla de Passchendaele', '帕森達勒戰役', '帕斯尚尔战役', 'Bataille de Passchendaele', '파스샹달 전투') },
    { d: '1917-10-24', d2: '1917-11-19', at: 'Kobarid', wiki: 'Battle_of_Caporetto', name: L('Battle of Caporetto', 'カポレットの戦い', 'Schlacht von Karfreit', 'Битва при Капоретто', 'Batalla de Caporetto', '卡波雷托戰役', '卡波雷托战役', 'Bataille de Caporetto', '카포레토 전투') },
    { d: '1918-03-21', d2: '1918-07-18', at: 'Saint-Quentin', wiki: 'German_spring_offensive', name: L('German spring offensive', 'ドイツ軍春季攻勢', 'Deutsche Frühjahrsoffensive', 'Весеннее наступление германской армии', 'Ofensiva alemana de primavera', '德軍春季攻勢', '德军春季攻势', 'Offensive allemande du printemps', '독일군 춘계 공세') },
    { d: '1918-08-08', d2: '1918-11-11', at: 'Amiens', wiki: 'Hundred_Days_Offensive', name: L('Hundred Days Offensive', '百日攻勢', 'Hundert-Tage-Offensive', 'Стодневное наступление', 'Ofensiva de los Cien Días', '百日攻勢', '百日攻势', 'Offensive des Cent-Jours', '백일 공세') },
    { d: '1918-09-19', d2: '1918-10-31', at: 'Megiddo', wiki: 'Battle_of_Megiddo_(1918)', name: L('Battle of Megiddo', 'メギドの戦い', 'Schlacht von Megiddo', 'Битва при Мегиддо', 'Batalla de Meguido', '米吉多戰役', '米吉多战役', 'Bataille de Megiddo', '메기도 전투') },
    { d: '1918-11-11', at: 'Compiegne', wiki: 'Armistice_of_11_November_1918', kind: 'political', name: L('Armistice of 11 November 1918', 'コンピエーニュ休戦協定', 'Waffenstillstand von Compiègne', 'Компьенское перемирие', 'Armisticio del 11 de noviembre de 1918', '康白尼停戰協定', '康边停战协定', 'Armistice du 11 novembre 1918', '콩피에뉴 휴전 협정') },
  ],
};

export { WW1 };
