/* ============================================================================
 *  IntMap · THE KOREAN WAR — the curated record
 * ----------------------------------------------------------------------------
 *  The rules every row here obeys — what `control`, `fronts` and `events` are each allowed to
 *  claim, and why a day nobody wrote down gets no line — are stated once, in ./lang.mjs.
 *  The anchors are in ./places-korea.mjs, whose header carries the two things peculiar to this
 *  theatre: the romanisation collisions, and the fact that CShapes 2.0 draws the two Koreas with
 *  the armistice line of 1953 for the whole of 1948–2019.
 *
 *  ══ WHY THIS WAR IS THE ONE WHERE THE LINE IS THE STORY ═════════════════════════════════════
 *  In thirteen months the front crossed the whole peninsula four times — south to the Naktong,
 *  north to the Yalu, south again past Seoul, and back to within a few miles of where it started —
 *  and then did not move for two more years. Nothing else in the record here moves like that, and
 *  it is exactly the movement a date slider can show and a single map cannot.
 *
 *  ══ THE FOUR DAYS WITH AN EMPTY `cuts` ══════════════════════════════════════════════════════
 *  25 June 1950 and 1 October 1950 the front stood ON the 38th parallel; 27 November 1951 and
 *  27 July 1953 it stood on what became the armistice line. CShapes has no polygon for the first
 *  of those boundaries and its own boundary IS the second, so on those four days the line and the
 *  border make the same claim and `control` alone colours the two countries. The line is still
 *  drawn — an empty `cuts` stops the record claiming a division, not the layer drawing a position.
 *
 *  ══ AND THE FORTNIGHT WITH NO LINE AT ALL ═══════════════════════════════════════════════════
 *  Between the Inchon landing on 15 September 1950 and the front reaching the parallel at the end
 *  of that month, the landing force was fighting at Seoul, the Eighth Army was breaking out of the
 *  Pusan Perimeter two hundred and fifty kilometres to the south-east, and what lay between them
 *  was a collapsing army rather than a front. Those fifteen days are CONTESTED — one colour, one
 *  legend row, saying that control was divided and that this file will not pretend to know where.
 *
 *  ══ ONE THING THE MODEL GETS WRONG HERE, SAID OUT LOUD ══════════════════════════════════════
 *  ⚠ AN ISLAND NO LINE CROSSES TAKES THE SIDE OF THE LINE IT IS NEAREST. js/war-geom.js decides an
 *  uncrossed polygon by which side of the path it lies on, so while the Pusan Perimeter is drawn —
 *  4 August to 16 September 1950 — Jeju reads as North Korean, because it is 130 km off the south
 *  coast and everything outside the perimeter is outside it. The Korean People's Army never landed
 *  on Jeju; the island was the Republic's rear area and its refugee camp. This is a property of the
 *  cut and not of the record: the same arithmetic reads Sardinia and Corsica as Axis in March 1944,
 *  five months after the Germans left them. Naming it here is cheaper than a special case, and a
 *  special case in this file could not fix the other two.
 * ==========================================================================*/
import { L } from './lang.mjs';

/* ── the sides ──────────────────────────────────────────────────────────────────────────────
   The colours are the same four the two world wars use, in the same roles: blue for the side this
   record's `left` names, red for `right`, amber for a span with no quotable line, grey for a
   country that was not in it. ⚠ THE NAMES ARE NOT «the Allies» AND «the Axis» BECAUSE NEITHER
   SIDE HERE WAS ONE OF THOSE. Sixteen states fought under the United Nations flag and under a
   single command; on the other side the Korean People's Army was joined from October 1950 by the
   Chinese People's Volunteer Army, which was called a volunteer army precisely so that China and
   the United States would not be formally at war. */
const F_KOREA = {
  UN: { col: '#4a7fbd', name: L('United Nations Command', '国連軍', 'Kommando der Vereinten Nationen', 'Командование ООН', 'Mando de las Naciones Unidas', '聯合國軍', '联合国军', 'Commandement des Nations unies', '유엔군') },
  DPRK: { col: '#b4544a', name: L('Korean People’s Army and Chinese People’s Volunteers', '朝鮮人民軍・中国人民志願軍', 'Koreanische Volksarmee und Chinesische Volksfreiwillige', 'Корейская народная армия и китайские народные добровольцы', 'Ejército Popular de Corea y Voluntarios del Pueblo Chino', '朝鮮人民軍與中國人民志願軍', '朝鲜人民军与中国人民志愿军', 'Armée populaire de Corée et Volontaires du peuple chinois', '조선인민군·중국인민지원군') },
  CONTESTED: { col: '#c9963c', name: L('Contested — control divided', '争奪中（支配が分かれている）', 'Umkämpft — geteilte Kontrolle', 'Оспаривается — контроль разделён', 'En disputa: control dividido', '交戰中（控制權分裂）', '交战中（控制权分裂）', 'Disputé — contrôle partagé', '교전 중 — 지배 분할') },
  NEUTRAL: { col: '#9aa1a8', name: L('Neutral', '中立', 'Neutral', 'Нейтральные', 'Neutral', '中立', '中立', 'Neutre', '중립') },
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE KOREAN WAR · 25 June 1950 — 27 July 1953
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const KOREA = {
  id: 'korea',
  /* ⚠ THE NAME IS NOT THE SAME NAME IN EVERY LANGUAGE, AND THE DIFFERENCE IS NOT A TRANSLATION.
     Taiwan says 韓戰, the mainland says 朝鮮戰爭 for the war and 抗美援朝戰爭 for its own part in
     it, and South Korea says 6·25 전쟁. Each entry below is the term that language's own histories
     use for the whole war, not a rendering of the English one. */
  name: L('Korean War', '朝鮮戦争', 'Koreakrieg', 'Корейская война', 'Guerra de Corea', '韓戰', '朝鲜战争', 'Guerre de Corée', '6·25 전쟁'),
  from: '1950-06-25', to: '1953-07-27',
  factions: F_KOREA,

  /* ⚠ [date, place, the faction that held it] — THE ONLY CHECK THAT CAN TELL A FRONT DRAWN
     CORRECTLY FROM ONE DRAWN BACK TO FRONT. Every line below is quoted west to east (or, for the
     Pusan Perimeter, south to north to east) and the communist side is always the OUTSIDE of that
     path, so `left` is UN throughout. There is a pair for every dated position — one town from
     each side — and none of them is an anchor of the line it checks, because a town the line runs
     through lands on whichever side the arithmetic puts a town hall. ⚠ THAT AMBIGUITY IS VISIBLE
     IN TWO PLACES AND IS NOT A BUG TO PAPER OVER: Chuncheon is an anchor of the No Name Line and
     Cheorwon of Kansas–Wyoming, and both read as the far side for as long as those lines stand.
     Both towns were on the front line on those days — the Iron Triangle fighting was over Cheorwon
     itself — and moving the anchor to make the colour come out would move the line off the record.
     The rows dated 1952-06-01 check nothing geometric: they are there because from the day the
     line of contact was agreed no front cuts either country, and `control` alone decides the two
     colours for the last twenty months of the war. */
  checks: [
    /* the invasion, and the parallel it started on */
    ['1950-06-25', 'Seoul', 'UN'], ['1950-06-25', 'Pyongyang', 'DPRK'],
    /* the Han */
    ['1950-06-28', 'Seoul', 'DPRK'], ['1950-06-28', 'Chuncheon', 'DPRK'], ['1950-06-28', 'Suwon', 'UN'],
    /* the delaying action */
    ['1950-07-05', 'Suwon', 'DPRK'], ['1950-07-05', 'Daejeon', 'UN'],
    ['1950-07-20', 'Chungju', 'DPRK'], ['1950-07-20', 'Waegwan', 'UN'],
    /* the Pusan Perimeter — Pohang is still held on 4 August and gone by 5 September */
    ['1950-08-04', 'Jinju', 'DPRK'], ['1950-08-04', 'Busan', 'UN'],
    ['1950-08-04', 'Daegu', 'UN'], ['1950-08-04', 'Pohang', 'UN'],
    ['1950-09-05', 'Andong', 'DPRK'], ['1950-09-05', 'Daegu', 'UN'],
    ['1950-09-05', 'Masan', 'UN'], ['1950-09-05', 'Busan', 'UN'],
    /* the fortnight after Inchon, which has no line */
    ['1950-09-20', 'Daegu', 'CONTESTED'], ['1950-09-20', 'Pyongyang', 'DPRK'],
    /* the parallel again */
    ['1950-10-01', 'Seoul', 'UN'], ['1950-10-01', 'Pyongyang', 'DPRK'],
    /* into North Korea */
    ['1950-10-21', 'Wonsan', 'UN'], ['1950-10-21', 'Sinuiju', 'DPRK'],
    ['1950-10-21', 'Kanggye', 'DPRK'], ['1950-10-21', 'Chongjin', 'DPRK'],
    ['1950-11-25', 'Pyongyang', 'UN'], ['1950-11-25', 'Wonsan', 'UN'],
    ['1950-11-25', 'Chongjin', 'UN'], ['1950-11-25', 'Sinuiju', 'DPRK'],
    ['1950-11-25', 'Kanggye', 'DPRK'],
    /* back to the parallel, and past it */
    ['1950-12-15', 'Seoul', 'UN'], ['1950-12-15', 'Cheorwon', 'DPRK'], ['1950-12-15', 'Pyongyang', 'DPRK'],
    ['1951-01-07', 'Seoul', 'DPRK'], ['1951-01-07', 'Gangneung', 'DPRK'], ['1951-01-07', 'Daejeon', 'UN'],
    ['1951-02-10', 'Seoul', 'DPRK'], ['1951-02-10', 'Suwon', 'UN'], ['1951-02-10', 'Wonju', 'UN'],
    ['1951-03-20', 'Seoul', 'UN'], ['1951-03-20', 'Wonju', 'UN'],
    ['1951-03-20', 'Chuncheon', 'DPRK'], ['1951-03-20', 'Cheorwon', 'DPRK'],
    ['1951-04-09', 'Cheorwon', 'DPRK'], ['1951-04-09', 'Chuncheon', 'UN'], ['1951-04-09', 'Seoul', 'UN'],
    ['1951-04-30', 'Yeoncheon', 'DPRK'], ['1951-04-30', 'Seoul', 'UN'], ['1951-04-30', 'Wonju', 'UN'],
    ['1951-06-20', 'Chuncheon', 'UN'], ['1951-06-20', 'Gangneung', 'UN'], ['1951-06-20', 'Kaesong', 'DPRK'],
    /* the stalemate, where only `control` speaks */
    ['1952-06-01', 'Seoul', 'UN'], ['1952-06-01', 'Cheorwon', 'UN'],
    ['1952-06-01', 'Pyongyang', 'DPRK'], ['1952-06-01', 'Kaesong', 'DPRK'],
    ['1953-07-27', 'Seoul', 'UN'], ['1953-07-27', 'Pyongyang', 'DPRK'],
  ],

  /* gwcode → [[date, faction], …]. A country absent from this table is neutral for the whole war.
     ⚠ ONLY THE TWO KOREAS ARE EVER A BATTLEFIELD HERE. The other eighteen rows are the fact of
     belligerency and nothing more: they say which side a state was on and from what day, and no
     front line ever crosses them, so they are painted whole. The dates are the day each state's
     forces came under the United Nations Command in the theatre — the day the first contingent
     reached Korea or Japanese waters — rather than the day a parliament voted, because for most
     of the sixteen there was no vote to date. */
  control: {
    /* North Korea — the aggressor, and the only entity in this table whose own territory the front
       crosses in both directions. */
    731: [['1950-06-25', 'DPRK']],
    /* South Korea — invaded on day one; contested for the fortnight after Inchon (see the header);
       and from 1 October 1950 whatever the front says it is. */
    732: [['1950-06-25', 'UN'], ['1950-09-16', 'CONTESTED'], ['1950-10-01', 'UN']],
    /* the United Nations Command, in the order its contingents arrived */
    2: [['1950-06-27', 'UN']],      /* United States — Truman commits air and naval forces the day Resolution 83 passes */
    200: [['1950-06-29', 'UN']],    /* United Kingdom — the Far East Fleet placed at the disposal of the UN command; the 27th Brigade lands at Pusan on 29 August */
    900: [['1950-07-02', 'UN']],    /* Australia — No. 77 Squadron RAAF flies its first sorties over Korea */
    20: [['1950-07-30', 'UN']],     /* Canada — three destroyers reach Sasebo */
    920: [['1950-08-02', 'UN']],    /* New Zealand — two frigates join the Commonwealth force */
    840: [['1950-09-19', 'UN']],    /* Philippines — the 10th Battalion Combat Team lands at Pusan */
    640: [['1950-10-17', 'UN']],    /* Turkey — the Turkish Brigade lands at Pusan */
    800: [['1950-11-07', 'UN']],    /* Thailand */
    560: [['1950-11-19', 'UN']],    /* South Africa — 2 Squadron SAAF flies its first mission */
    210: [['1950-11-23', 'UN']],    /* Netherlands */
    220: [['1950-11-29', 'UN']],    /* France — the French Battalion lands at Pusan */
    350: [['1950-12-09', 'UN']],    /* Greece */
    211: [['1951-01-31', 'UN']],    /* Belgium — the Belgian United Nations Command */
    212: [['1951-01-31', 'UN']],    /* Luxembourg — one platoon, inside the Belgian battalion */
    530: [['1951-05-07', 'UN']],    /* Ethiopia — the Kagnew Battalion */
    100: [['1951-06-15', 'UN']],    /* Colombia — the only Latin American ground contingent */
    /* the other side. ⚠ NEITHER OF THESE TWO EVER DECLARED WAR, AND BOTH FOUGHT. China entered on
       25 October 1950 under the name «People's Volunteers», a fiction that let Peking put a million
       men into Korea without a state of war with the United States. The Soviet Union went further:
       the 64th Fighter Aviation Corps flew from Manchurian bases in Chinese markings and Korean
       call signs from November 1950 to the armistice, and the Soviet government denied it for
       forty years. The record says they were belligerents because they were; it does not say they
       declared it, because they did not. */
    710: [['1950-10-25', 'DPRK']],  /* China — the First Phase Offensive opens */
    365: [['1950-11-01', 'DPRK']],  /* Soviet Union — the 64th IAK's first combat sorties over the Yalu */
  },

  fronts: [
    {
      id: 'korea50',
      name: L('The front in Korea', '朝鮮半島の戦線', 'Die Front in Korea', 'Фронт в Корее', 'El frente en Corea', '朝鮮半島戰線', '朝鲜半岛战线', 'Le front de Corée', '한반도 전선'),
      /* ⚠ EVERY LINE BELOW IS LISTED WEST TO EAST and the communist side is the northern (for the
         Pusan Perimeter, the outer) one, so `left` — the southern/inner side for a path listed that
         way — is UN. Declared the other way round the map would put Pusan under the Korean People's
         Army in August 1950 and Pyongyang under the United Nations in June 1950, and neither is
         visible on a map: the shapes are identical, only the colours swap. The `checks` above are
         what proves it, one town from each side on every dated day. */
      left: 'UN', right: 'DPRK',
      dates: [
        /* ⚠ (#R519) THIS DAY CUTS BOTH KOREAS, AND IT HAS TO. CShapes carries one geometry for the
           peninsula from 1945 to 2019 and that geometry is the 1953 armistice line — its North Korean
           edge reaches down to 37.789°N and its South Korean edge up to 38.625°N. Drawing this day
           without cutting would hand the reader the line that ENDED the war as the border it BEGAN
           on: Ongjin and Kaesong, in the Republic of Korea until 1951, already northern. The parallel
           is not the border in the base map, so it has to be drawn as a front that divides both
           polygons. tests/r519-checks ⑥ is what asks. */
        { d: '1950-06-25', cuts: [731, 732],
          note: L('The 38th parallel — the four sectors the Korean People’s Army crossed at dawn', '38度線——朝鮮人民軍が未明に越えた四つの正面', 'Der 38. Breitengrad — die vier Abschnitte, an denen die Koreanische Volksarmee im Morgengrauen angriff', '38-я параллель — четыре участка, где Корейская народная армия перешла границу на рассвете', 'El paralelo 38: los cuatro sectores que el Ejército Popular de Corea cruzó al amanecer', '三八線——朝鮮人民軍拂曉越過的四個地段', '三八线——朝鲜人民军拂晓越过的四个地段', 'Le 38e parallèle — les quatre secteurs franchis à l’aube par l’Armée populaire de Corée', '38선 — 조선인민군이 새벽에 넘은 네 개의 정면'),
          pts: ['Ongjin', 'Kaesong', 'Pocheon', 'Chuncheon', 'Yangyang'] },
        { d: '1950-06-28', cuts: [732],
          note: L('Seoul has fallen on the fourth day; what is left of the ROK Army holds the south bank of the Han', '4日目にソウルが陥落。韓国軍の残存部隊が漢江南岸を保持している', 'Am vierten Tag fällt Seoul; was von der südkoreanischen Armee übrig ist, hält das Südufer des Han', 'На четвёртый день пал Сеул; остатки южнокорейской армии удерживают южный берег Ханган', 'Seúl ha caído al cuarto día; lo que queda del ejército surcoreano sostiene la orilla sur del Han', '第四天漢城陷落，韓國軍殘部固守漢江南岸', '第四天汉城陷落，韩国军残部固守汉江南岸', 'Séoul est tombée le quatrième jour ; ce qui reste de l’armée sud-coréenne tient la rive sud du Han', '나흘 만에 서울이 함락되고, 남은 국군이 한강 남안을 지키고 있다'),
          pts: ['Gimpo', 'Yeongdeungpo', 'Yangpyeong', 'Hongcheon', 'Gangneung'] },
        { d: '1950-07-05', cuts: [732],
          note: L('The first American ground troops meet the advance at Osan and are swept aside', '最初の米地上部隊が烏山で前進を迎え撃ち、押し流される', 'Die ersten amerikanischen Bodentruppen stellen sich bei Osan und werden beiseitegefegt', 'Первые американские сухопутные части встречают наступление у Осана и сметены', 'Las primeras tropas terrestres estadounidenses salen al paso en Osan y son arrolladas', '首批美軍地面部隊在烏山迎擊，隨即被沖散', '首批美军地面部队在乌山迎击，随即被冲散', 'Les premières troupes terrestres américaines affrontent l’avance à Osan et sont balayées', '최초의 미 지상군이 오산에서 맞섰다가 밀려난다'),
          pts: ['Pyeongtaek', 'Chungju', 'Samcheok'] },
        { d: '1950-07-20', cuts: [732],
          note: L('Taejon falls after four days of street fighting; the delaying action has bought three weeks', '4日間の市街戦のすえ大田が陥落。遅滞戦闘が三週間を稼いだ', 'Nach vier Tagen Straßenkampf fällt Daejeon; das Hinhaltegefecht hat drei Wochen erkauft', 'После четырёх дней уличных боёв пал Тэджон; сдерживающие бои выиграли три недели', 'Taejon cae tras cuatro días de combate urbano; la acción de contención ha ganado tres semanas', '經四日巷戰後大田陷落，遲滯作戰換來三週時間', '经四日巷战后大田陷落，迟滞作战换来三周时间', 'Taejon tombe après quatre jours de combats de rue ; l’action retardatrice a gagné trois semaines', '나흘간의 시가전 끝에 대전이 함락된다. 지연전이 3주를 벌었다'),
          pts: ['Gunsan', 'Daejeon', 'Andong', 'Yeongdeok'] },
        { d: '1950-08-04', cuts: [732],
          note: L('The Pusan Perimeter: the Naktong from the south coast to Waegwan, then the mountains east to Yongdok', '釜山橋頭堡——南岸から洛東江に沿って倭館へ、そこから山地を東へ盈徳まで', 'Der Pusan-Perimeter: der Naktong von der Südküste bis Waegwan, dann durch die Berge ostwärts nach Yongdok', 'Пусанский периметр: Нактонган от южного побережья до Вэгвана, затем горы на восток до Йондока', 'El perímetro de Pusan: el Naktong desde la costa sur hasta Waegwan y luego las montañas al este hasta Yongdok', '釜山環形防禦圈：自南岸沿洛東江至倭館，再經山地東抵盈德', '釜山环形防御圈：自南岸沿洛东江至倭馆，再经山地东抵盈德', 'Le périmètre de Pusan : le Naktong de la côte sud à Waegwan, puis la montagne vers l’est jusqu’à Yongdok', '부산 교두보 — 남해안에서 낙동강을 따라 왜관으로, 다시 산악을 넘어 동쪽 영덕까지'),
          pts: ['Chindong-ni', 'Namji', 'Waegwan', 'Andong', 'Yeongdeok'] },
        { d: '1950-09-05', cuts: [732],
          note: L('The perimeter at its smallest — Pohang is gone and the northern line stands a dozen kilometres from Taegu', '橋頭堡が最も縮んだ日——浦項は失われ、北面の線は大邱の十数キロ手前にある', 'Der Perimeter auf seiner kleinsten Ausdehnung — Pohang ist verloren, die Nordfront steht ein Dutzend Kilometer vor Daegu', 'Периметр в самой узкой точке — Пхохан потерян, северная линия в десятке километров от Тэгу', 'El perímetro en su mínima extensión: Pohang se ha perdido y la línea norte está a una docena de kilómetros de Taegu', '防禦圈收縮至最小——浦項失守，北面戰線距大邱僅十餘公里', '防御圈收缩至最小——浦项失守，北面战线距大邱仅十余公里', 'Le périmètre à son minimum — Pohang est perdue et la ligne nord passe à une douzaine de kilomètres de Taegu', '방어선이 가장 좁아진 날 — 포항을 잃고 북쪽 전선은 대구에서 십여 킬로미터 앞에 있다'),
          pts: ['Chindong-ni', 'Yongsan', 'Waegwan', 'Yeongcheon', 'Pohang'] },
        { d: '1950-09-16', cuts: [], pts: [],
          note: L('Inchon, and then a fortnight with no front: the landing force is fighting at Seoul, the Eighth Army is breaking out of the perimeter 250 km to the south-east, and between them there is an army coming apart rather than a line', '仁川上陸、そして戦線の無い二週間——上陸部隊はソウルで戦い、第8軍は250キロ南東で橋頭堡から突破し、その間にあるのは線ではなく崩れてゆく軍である', 'Incheon, und danach vierzehn Tage ohne Front: die Landungstruppe kämpft um Seoul, die 8. Armee bricht 250 km südöstlich aus dem Perimeter aus, und dazwischen liegt keine Linie, sondern eine zerfallende Armee', 'Инчхон, а затем две недели без фронта: десант дерётся за Сеул, 8-я армия прорывается из периметра в 250 км к юго-востоку, а между ними не линия, а разваливающаяся армия', 'Inchon, y después quince días sin frente: la fuerza de desembarco combate en Seúl, el VIII Ejército rompe el perímetro 250 km al sureste, y entre ambos no hay una línea sino un ejército deshaciéndose', '仁川登陸，隨後兩週沒有戰線：登陸部隊在漢城作戰，第八軍團在東南二百五十公里外突圍，兩者之間的不是一條線，而是一支正在瓦解的軍隊', '仁川登陆，随后两周没有战线：登陆部队在汉城作战，第八集团军在东南二百五十公里外突围，两者之间的不是一条线，而是一支正在瓦解的军队', 'Incheon, puis quinze jours sans front : la force de débarquement se bat à Séoul, la VIIIe armée perce le périmètre à 250 km au sud-est, et entre les deux il n’y a pas une ligne mais une armée qui se défait', '인천 상륙, 그리고 전선이 없는 보름 — 상륙부대는 서울에서 싸우고 8군은 250 km 남동쪽에서 방어선을 돌파하며, 그 사이에 있는 것은 선이 아니라 무너지는 군대다') },
        /* ⚠ (#R519) THIS DAY CUTS BOTH KOREAS, AND IT HAS TO. CShapes carries one geometry for the
           peninsula from 1945 to 2019 and that geometry is the 1953 armistice line — its North Korean
           edge reaches down to 37.789°N and its South Korean edge up to 38.625°N. Drawing this day
           without cutting would hand the reader the line that ENDED the war as the border it BEGAN
           on: Ongjin and Kaesong, in the Republic of Korea until 1951, already northern. The parallel
           is not the border in the base map, so it has to be drawn as a front that divides both
           polygons. tests/r519-checks ⑥ is what asks. */
        { d: '1950-10-01', cuts: [731, 732],
          note: L('The front is back where it began; the ROK 3rd Division crosses the parallel at Yangyang', '戦線は出発点に戻った。韓国軍第3師団が襄陽で38度線を越える', 'Die Front steht wieder am Ausgangspunkt; die 3. südkoreanische Division überschreitet bei Yangyang den Breitengrad', 'Фронт вернулся туда, откуда начался; 3-я южнокорейская дивизия переходит параллель у Янъяна', 'El frente ha vuelto a donde empezó; la 3.ª División surcoreana cruza el paralelo en Yangyang', '戰線回到起點；韓國軍第3師團在襄陽越過三八線', '战线回到起点；韩国军第3师团在襄阳越过三八线', 'Le front est revenu à son point de départ ; la 3e division sud-coréenne franchit le parallèle à Yangyang', '전선이 출발점으로 돌아왔다. 국군 제3사단이 양양에서 38선을 넘는다'),
          pts: ['Ongjin', 'Kaesong', 'Pocheon', 'Chuncheon', 'Yangyang'] },
        { d: '1950-10-21', cuts: [731],
          note: L('Pyongyang has fallen and ROK I Corps is past Hamhung on the east coast', '平壌が陥落し、東海岸では韓国軍第1軍団が咸興を越えている', 'Pjöngjang ist gefallen, und an der Ostküste steht das südkoreanische I. Korps jenseits von Hamhung', 'Пхеньян взят, а на восточном побережье южнокорейский 1-й корпус уже прошёл Хамхын', 'Pyongyang ha caído y el I Cuerpo surcoreano ha rebasado Hamhung en la costa oriental', '平壤陷落，東岸的韓國軍第1軍團已越過咸興', '平壤陷落，东岸的韩国军第1军团已越过咸兴', 'Pyongyang est tombée et le Ier corps sud-coréen a dépassé Hamhung sur la côte est', '평양이 함락되고, 동해안에서는 국군 제1군단이 함흥을 지났다'),
          pts: ['Nampo', 'Pyongyang', 'Yangdok', 'Hamhung', 'Hungnam'] },
        { d: '1950-11-25', cuts: [731],
          note: L('The furthest the United Nations Command ever stood: the Chongchon in the west, Changjin and the Yalu at Hyesan in the east — and the day the Chinese Second Phase Offensive opened behind it', '国連軍が到達した最北の線——西は清川江、東は長津から鴨緑江畔の恵山まで。そしてこの日、その背後で中国軍の第二次攻勢が始まった', 'Die weiteste Stellung, die das UN-Kommando je hielt: im Westen der Ch’ongch’on, im Osten Changjin und der Yalu bei Hyesan — und der Tag, an dem dahinter die zweite chinesische Offensive begann', 'Самый дальний рубеж, которого достигло Командование ООН: на западе Чхончхонган, на востоке Чанджин и Ялуцзян у Хесана — и день, когда в тылу началось второе китайское наступление', 'La posición más avanzada que alcanzó el Mando de la ONU: el Chongchon al oeste, Changjin y el Yalu en Hyesan al este, y el día en que a su espalda se abrió la segunda ofensiva china', '聯合國軍到達的最北戰線：西起清川江，東至長津與惠山的鴨綠江畔——也是中國軍第二次戰役在其背後打響的日子', '联合国军到达的最北战线：西起清川江，东至长津与惠山的鸭绿江畔——也是中国军第二次战役在其背后打响的日子', 'La position la plus avancée jamais tenue par le Commandement des Nations unies : le Ch’ongch’on à l’ouest, Changjin et le Yalu à Hyesan à l’est — et le jour où la deuxième offensive chinoise s’ouvre dans son dos', '유엔군이 도달한 최북단 전선 — 서쪽은 청천강, 동쪽은 장진과 혜산의 압록강변. 그리고 그 배후에서 중국군 2차 공세가 시작된 날'),
          pts: ['Chongju', 'Kujang', 'Tokchon', 'Changjin', 'Hyesan'] },
        { d: '1950-12-15', cuts: [732],
          note: L('Back on the parallel: the Eighth Army holds the Imjin line, and X Corps is being lifted out of Hungnam', '再び38度線へ。第8軍は臨津江線を保持し、第10軍団は興南から海上撤収の途上にある', 'Wieder am Breitengrad: die 8. Armee hält die Imjin-Linie, das X. Korps wird aus Hungnam ausgeschifft', 'Снова на параллели: 8-я армия удерживает рубеж Имджинган, 10-й корпус эвакуируется морем из Хыннама', 'De vuelta en el paralelo: el VIII Ejército sostiene la línea del Imjin y el X Cuerpo está siendo evacuado por mar desde Hungnam', '重回三八線：第八軍團固守臨津江線，第十軍正自興南海運撤離', '重回三八线：第八集团军固守临津江线，第十军正自兴南海运撤离', 'De retour sur le parallèle : la VIIIe armée tient la ligne de l’Imjin et le Xe corps est évacué par mer de Hungnam', '다시 38선으로. 8군은 임진강 선을 지키고, 10군단은 흥남에서 해상 철수 중이다'),
          pts: ['Munsan', 'Yeoncheon', 'Hwacheon', 'Yangyang'] },
        { d: '1951-01-07', cuts: [732],
          note: L('The southernmost line of the war — Pyongtaek in the west, Wonju in the centre, Samchok on the east coast. Seoul was abandoned on 4 January', '戦争を通じて最も南に下がった線——西は平沢、中央は原州、東海岸は三陟。ソウルは1月4日に放棄された', 'Die südlichste Linie des ganzen Krieges — Pyeongtaek im Westen, Wonju in der Mitte, Samcheok an der Ostküste. Seoul wurde am 4. Januar geräumt', 'Самый южный рубеж за всю войну — Пхёнтхэк на западе, Вонджу в центре, Самчхок на восточном побережье. Сеул оставлен 4 января', 'La línea más meridional de toda la guerra: Pyeongtaek al oeste, Wonju en el centro, Samcheok en la costa este. Seúl fue abandonada el 4 de enero', '整場戰爭中最南的戰線——西為平澤，中為原州，東岸為三陟。漢城已於1月4日棄守', '整场战争中最南的战线——西为平泽，中为原州，东岸为三陟。汉城已于1月4日弃守', 'La ligne la plus méridionale de toute la guerre — Pyeongtaek à l’ouest, Wonju au centre, Samcheok sur la côte est. Séoul a été abandonnée le 4 janvier', '전쟁 통틀어 가장 남쪽으로 내려간 선 — 서쪽 평택, 중부 원주, 동해안 삼척. 서울은 1월 4일에 포기되었다'),
          pts: ['Pyeongtaek', 'Wonju', 'Samcheok'] },
        { d: '1951-02-10', cuts: [732],
          note: L('Operation Thunderbolt: Inchon and Kimpo airfield are retaken and the Eighth Army closes to the Han south of Seoul', 'サンダーボルト作戦——仁川と金浦飛行場を奪回し、第8軍がソウル南方の漢江まで進出する', 'Operation Thunderbolt: Incheon und der Flugplatz Gimpo sind zurückerobert, die 8. Armee schließt südlich von Seoul zum Han auf', 'Операция «Тандерболт»: Инчхон и аэродром Кимпхо отбиты, 8-я армия выходит к Ханган южнее Сеула', 'Operación Thunderbolt: se recuperan Inchon y el aeródromo de Kimpo y el VIII Ejército alcanza el Han al sur de Seúl', '霹靂行動：收復仁川與金浦機場，第八軍團進抵漢城以南的漢江', '霹雳行动：收复仁川与金浦机场，第八集团军进抵汉城以南的汉江', 'Opération Thunderbolt : Incheon et l’aérodrome de Gimpo sont repris et la VIIIe armée atteint le Han au sud de Séoul', '선더볼트 작전 — 인천과 김포 비행장을 되찾고, 8군이 서울 남쪽 한강까지 진출한다'),
          pts: ['Gimpo', 'Yeongdeungpo', 'Yangpyeong', 'Samcheok'] },
        { d: '1951-03-20', cuts: [732],
          note: L('Seoul changed hands for the fourth and last time on 15 March; Operation Ripper is closing on Uijeongbu and Chuncheon', 'ソウルは3月15日、四度目にして最後の主人を変えた。リッパー作戦は議政府と春川に迫っている', 'Seoul wechselte am 15. März zum vierten und letzten Mal den Besitzer; die Operation Ripper greift nach Uijeongbu und Chuncheon', 'Сеул в четвёртый и последний раз перешёл из рук в руки 15 марта; операция «Потрошитель» подходит к Ыйджонбу и Чхунчхону', 'Seúl cambió de manos por cuarta y última vez el 15 de marzo; la operación Ripper se aproxima a Uijeongbu y Chuncheon', '漢城於3月15日第四次、也是最後一次易手；撕裂者行動正逼近議政府與春川', '汉城于3月15日第四次、也是最后一次易手；撕裂者行动正逼近议政府与春川', 'Séoul a changé de mains pour la quatrième et dernière fois le 15 mars ; l’opération Ripper approche d’Uijeongbu et de Chuncheon', '서울은 3월 15일 네 번째이자 마지막으로 주인이 바뀌었고, 리퍼 작전이 의정부와 춘천에 다가서고 있다'),
          pts: ['Gimpo', 'Uijeongbu', 'Hongcheon', 'Gangneung'] },
        { d: '1951-04-09', cuts: [732],
          note: L('Line Kansas — the Imjin in the west, then two to six miles above the parallel as far as the Hwachon reservoir, then south-east to the coast at Yangyang', 'カンザス線——西は臨津江、そこから華川貯水池までは38度線の3〜10キロ北、以東は南東に折れて襄陽で海に達する', 'Linie Kansas — im Westen der Imjin, dann drei bis zehn Kilometer nördlich des Breitengrads bis zum Hwacheon-Stausee, danach südostwärts zur Küste bei Yangyang', 'Рубеж «Канзас» — на западе Имджинган, далее в трёх–десяти километрах севернее параллели до водохранилища Хвачхон, затем на юго-восток к морю у Янъяна', 'Línea Kansas: el Imjin al oeste, luego de tres a diez kilómetros al norte del paralelo hasta el embalse de Hwacheon, y después al sureste hasta la costa en Yangyang', '堪薩斯線——西起臨津江，至華川水庫一段位於三八線以北三至十公里，其後折向東南，於襄陽入海', '堪萨斯线——西起临津江，至华川水库一段位于三八线以北三至十公里，其后折向东南，于襄阳入海', 'Ligne Kansas — l’Imjin à l’ouest, puis trois à dix kilomètres au nord du parallèle jusqu’au réservoir de Hwacheon, puis vers le sud-est jusqu’à la côte à Yangyang', '캔자스 선 — 서쪽은 임진강, 화천 저수지까지는 38선 북쪽 3~10 km, 그 동쪽은 남동으로 꺾여 양양에서 바다에 닿는다'),
          pts: ['Munsan', 'Yeoncheon', 'Hwacheon', 'Inje', 'Yangyang'] },
        { d: '1951-04-30', cuts: [732],
          note: L('The No Name Line halts the first phase of the Chinese spring offensive north of Seoul', '「ノーネーム線」が中国軍春季攻勢の第一段階をソウル北方で食い止める', 'Die „No Name Line“ bringt die erste Phase der chinesischen Frühjahrsoffensive nördlich von Seoul zum Stehen', 'Рубеж «Без имени» останавливает первый этап китайского весеннего наступления к северу от Сеула', 'La «No Name Line» detiene la primera fase de la ofensiva china de primavera al norte de Seúl', '「無名線」在漢城以北擋住中國軍春季攻勢的第一階段', '“无名线”在汉城以北挡住中国军春季攻势的第一阶段', 'La « No Name Line » arrête la première phase de l’offensive chinoise de printemps au nord de Séoul', '‘노네임 선’이 중국군 춘계 공세 1단계를 서울 북방에서 저지한다'),
          pts: ['Gimpo', 'Uijeongbu', 'Chuncheon', 'Yangyang'] },
        { d: '1951-06-20', cuts: [732],
          note: L('Line Kansas–Wyoming: the base of the Iron Triangle at Chorwon and Kumhwa in the west, the Punchbowl in the east. The front will not move appreciably again', 'カンザス＝ワイオミング線——西は鉄の三角地帯の底辺（鉄原・金化）、東はパンチボウル。以後、戦線が大きく動くことはない', 'Linie Kansas–Wyoming: im Westen die Basis des Eisernen Dreiecks bei Cheorwon und Kumhwa, im Osten die Punchbowl. Danach bewegt sich die Front nicht mehr nennenswert', 'Рубеж «Канзас — Вайоминг»: на западе основание Железного треугольника у Чхорвона и Кымхва, на востоке «Пуншевая чаша». Больше фронт заметно не сдвинется', 'Línea Kansas–Wyoming: la base del Triángulo de Hierro en Chorwon y Kumhwa al oeste, el Punchbowl al este. El frente ya no volverá a moverse de forma apreciable', '堪薩斯—懷俄明線：西為鐵三角底邊的鐵原與金化，東為「拳擊台」窪地。此後戰線不再有顯著移動', '堪萨斯—怀俄明线：西为铁三角底边的铁原与金化，东为“拳击台”洼地。此后战线不再有显著移动', 'Ligne Kansas–Wyoming : à l’ouest la base du Triangle de fer, Chorwon et Kumhwa ; à l’est le Punchbowl. Le front ne bougera plus sensiblement', '캔자스–와이오밍 선 — 서쪽은 철의 삼각지대 밑변인 철원과 금화, 동쪽은 펀치볼. 이후 전선은 크게 움직이지 않는다'),
          pts: ['Munsan', 'Cheorwon', 'Kumhwa', 'Hwacheon', 'Inje', 'Kosong'] },
        { d: '1951-11-27', cuts: [],
          note: L('The line of contact agreed at Panmunjom, to become the demarcation line if an armistice followed within thirty days. It did not; the shooting went on for twenty more months over ground the negotiators had already divided', '板門店で合意された接触線。30日以内に休戦が成れば、そのまま軍事境界線となるはずだった。休戦は成らず、交渉者がすでに分けた土地の上で、戦闘はさらに20か月続いた', 'Die in Panmunjom vereinbarte Kontaktlinie, die bei einem Waffenstillstand binnen dreißig Tagen zur Demarkationslinie werden sollte. Er kam nicht zustande; zwanzig weitere Monate wurde um Boden gekämpft, den die Unterhändler bereits geteilt hatten', 'Линия соприкосновения, согласованная в Пханмунджоме: она стала бы демаркационной, если бы перемирие заключили в тридцать дней. Его не заключили — бои шли ещё двадцать месяцев за землю, уже поделённую переговорщиками', 'La línea de contacto acordada en Panmunjom, que sería la de demarcación si el armisticio llegaba en treinta días. No llegó: se combatió veinte meses más por un terreno que los negociadores ya habían repartido', '板門店議定的接觸線：若三十日內達成停戰，即為軍事分界線。停戰未成，雙方又在談判桌上早已分好的土地上打了二十個月', '板门店议定的接触线：若三十日内达成停战，即为军事分界线。停战未成，双方又在谈判桌上早已分好的土地上打了二十个月', 'La ligne de contact convenue à Panmunjom, appelée à devenir la ligne de démarcation si un armistice suivait sous trente jours. Il ne vint pas : on se battit vingt mois de plus pour un terrain déjà partagé à la table', '판문점에서 합의된 접촉선. 30일 안에 휴전이 이루어지면 그대로 군사분계선이 될 예정이었다. 휴전은 오지 않았고, 협상자들이 이미 갈라놓은 땅 위에서 스무 달을 더 싸웠다'),
          pts: ['Panmunjom', 'Cheorwon', 'Kumsong', 'Yanggu', 'Kosong'] },
        { d: '1953-07-27', cuts: [],
          note: L('The Military Demarcation Line of the armistice. In twenty months of trench war the front moved less than these anchors can express; the one change that shows is the Kumsong salient, given up in the last offensive of the war two weeks before the signing', '休戦協定の軍事境界線。20か月の陣地戦で戦線が動いた幅は、この地名の列では表せないほど小さい。目に見える唯一の変化は金城突出部で、調印の2週間前、戦争最後の攻勢で失われた', 'Die militärische Demarkationslinie des Waffenstillstands. In zwanzig Monaten Stellungskrieg bewegte sich die Front weniger, als diese Ortsnamen ausdrücken können; die einzige sichtbare Änderung ist der Kumsong-Vorsprung, zwei Wochen vor der Unterzeichnung in der letzten Offensive des Krieges aufgegeben', 'Военная демаркационная линия перемирия. За двадцать месяцев позиционной войны фронт сдвинулся меньше, чем способен выразить этот перечень; единственное заметное изменение — Кымсонский выступ, отданный в последнем наступлении войны за две недели до подписания', 'La línea de demarcación militar del armisticio. En veinte meses de guerra de trincheras el frente se movió menos de lo que estos topónimos pueden expresar; el único cambio visible es el saliente de Kumsong, perdido en la última ofensiva de la guerra dos semanas antes de la firma', '停戰協定的軍事分界線。二十個月的陣地戰中，戰線移動之微，非這串地名所能表達；唯一看得見的變化是金城突出部——簽字前兩週，在戰爭最後一次攻勢中被放棄', '停战协定的军事分界线。二十个月的阵地战中，战线移动之微，非这串地名所能表达；唯一看得见的变化是金城突出部——签字前两周，在战争最后一次攻势中被放弃', 'La ligne de démarcation militaire de l’armistice. En vingt mois de guerre de tranchées, le front a moins bougé que ces ancrages ne peuvent le dire ; le seul changement visible est le saillant de Kumsong, abandonné lors de la dernière offensive de la guerre, deux semaines avant la signature', '휴전 협정의 군사분계선. 스무 달의 진지전 동안 전선이 움직인 폭은 이 지명들로는 표현할 수 없을 만큼 작다. 눈에 보이는 유일한 변화는 금성 돌출부로, 조인 2주 전 전쟁 마지막 공세에서 내주었다'),
          pts: ['Panmunjom', 'Cheorwon', 'Kumhwa', 'Yanggu', 'Kosong'] },
      ],
    },
  ],

  events: [
    { d: '1950-06-25', d2: '1950-06-28', at: 'Uijeongbu', wiki: 'Battle_of_Uijeongbu', kind: 'battle', name: L('Battle of Uijeongbu', '議政府の戦い', 'Schlacht um Uijeongbu', 'Битва за Ыйджонбу', 'Batalla de Uijeongbu', '議政府戰役', '议政府战役', 'Bataille d’Uijeongbu', '의정부 전투') },
    { d: '1950-06-25', d2: '1950-06-28', at: 'Seoul', wiki: 'First_Battle_of_Seoul', kind: 'battle', name: L('First Battle of Seoul', '第一次ソウルの戦い', 'Erste Schlacht um Seoul', 'Первая битва за Сеул', 'Primera batalla de Seúl', '第一次漢城戰役', '第一次汉城战役', 'Première bataille de Séoul', '제1차 서울 전투') },
    { d: '1950-06-27', at: 'Lake Success', wiki: 'United_Nations_Security_Council_Resolution_83', kind: 'political', name: L('United Nations Security Council Resolution 83', '国連安保理決議83', 'Resolution 83 des UN-Sicherheitsrats', 'Резолюция 83 Совета Безопасности ООН', 'Resolución 83 del Consejo de Seguridad de la ONU', '聯合國安理會第83號決議', '联合国安理会第83号决议', 'Résolution 83 du Conseil de sécurité des Nations unies', '유엔 안전보장이사회 결의 제83호') },
    { d: '1950-06-28', d2: '1950-09-30', at: 'Daejeon', wiki: 'Bodo_League_massacre', kind: 'atrocity', name: L('Bodo League massacre', '保導連盟事件', 'Bodo-Liga-Massaker', 'Резня членов Лиги Бодо', 'Masacre de la Liga Bodo', '保導聯盟事件', '保导联盟事件', 'Massacre de la ligue Bodo', '보도연맹 학살 사건') },
    { d: '1950-07-02', at: 'Jumunjin', wiki: 'Battle_of_Chumonchin_Chan', kind: 'naval', name: L('Battle of Chumonchin Chan', '注文津沖海戦', 'Seegefecht vor Chumunjin', 'Бой у Чумунджина', 'Combate naval de Chumonchin Chan', '注文津海戰', '注文津海战', 'Combat naval de Chumonchin Chan', '주문진 해전') },
    { d: '1950-07-05', at: 'Osan', wiki: 'Battle_of_Osan', kind: 'battle', name: L('Battle of Osan', '烏山の戦い', 'Gefecht bei Osan', 'Бой при Осане', 'Batalla de Osan', '烏山戰鬥', '乌山战斗', 'Bataille d’Osan', '오산 전투') },
    { d: '1950-07-06', at: 'Pyeongtaek', wiki: 'Battle_of_Pyongtaek', kind: 'battle', name: L('Battle of Pyongtaek', '平沢の戦い', 'Gefecht bei Pyeongtaek', 'Бой при Пхёнтхэке', 'Batalla de Pyongtaek', '平澤戰鬥', '平泽战斗', 'Bataille de Pyongtaek', '평택 전투') },
    { d: '1950-07-13', d2: '1950-07-16', at: 'Gongju', wiki: 'Battle_of_Kum_River', kind: 'battle', name: L('Battle of the Kum River', '錦江の戦い', 'Schlacht am Geum', 'Битва на реке Кымган', 'Batalla del río Kum', '錦江戰役', '锦江战役', 'Bataille de la rivière Kum', '금강 전투') },
    { d: '1950-07-16', d2: '1950-07-20', at: 'Daejeon', wiki: 'Battle_of_Taejon', kind: 'battle', name: L('Battle of Taejon', '大田の戦い', 'Schlacht um Daejeon', 'Битва за Тэджон', 'Batalla de Taejon', '大田戰役', '大田战役', 'Bataille de Taejon', '대전 전투') },
    { d: '1950-07-26', d2: '1950-07-29', at: 'Yeongdong', wiki: 'No_Gun_Ri_massacre', kind: 'atrocity', name: L('No Gun Ri massacre', '老斤里事件', 'Massaker von No Gun Ri', 'Резня в Ногылли', 'Masacre de No Gun Ri', '老斤里事件', '老斤里事件', 'Massacre de No Gun Ri', '노근리 양민 학살 사건') },
    { d: '1950-08-04', d2: '1950-09-18', at: 'Busan', wiki: 'Battle_of_Pusan_Perimeter', kind: 'siege', str: [230000, 260000], name: L('Battle of the Pusan Perimeter', '釜山橋頭堡の戦い', 'Schlacht um den Pusan-Perimeter', 'Битва за Пусанский периметр', 'Batalla del perímetro de Pusan', '釜山環形防禦圈戰役', '釜山环形防御圈战役', 'Bataille du périmètre de Pusan', '낙동강 방어선 전투') },
    { d: '1950-08-05', d2: '1950-08-19', at: 'Yongsan', wiki: 'First_Battle_of_Naktong_Bulge', kind: 'battle', name: L('First Battle of the Naktong Bulge', '第一次洛東江突出部の戦い', 'Erste Schlacht am Naktong-Bogen', 'Первое сражение у излучины Нактонган', 'Primera batalla del recodo del Naktong', '第一次洛東江突出部戰役', '第一次洛东江突出部战役', 'Première bataille du saillant du Naktong', '제1차 낙동강 돌출부 전투') },
    { d: '1950-09-01', d2: '1950-09-15', at: 'Waegwan', wiki: 'Great_Naktong_Offensive', kind: 'battle', name: L('Great Naktong Offensive', '洛東江大攻勢', 'Große Naktong-Offensive', 'Большое наступление на Нактонган', 'Gran ofensiva del Naktong', '洛東江大攻勢', '洛东江大攻势', 'Grande offensive du Naktong', '낙동강 대공세') },
    { d: '1950-09-15', d2: '1950-09-19', at: 'Incheon', wiki: 'Battle_of_Inchon', kind: 'landing', str: 75000, name: L('Battle of Inchon', '仁川上陸作戦', 'Landung bei Incheon', 'Инчхонская десантная операция', 'Desembarco de Inchon', '仁川登陸作戰', '仁川登陆作战', 'Débarquement d’Incheon', '인천 상륙 작전') },
    { d: '1950-09-22', d2: '1950-09-28', at: 'Seoul', wiki: 'Second_Battle_of_Seoul', kind: 'battle', name: L('Second Battle of Seoul', '第二次ソウルの戦い', 'Zweite Schlacht um Seoul', 'Вторая битва за Сеул', 'Segunda batalla de Seúl', '第二次漢城戰役', '第二次汉城战役', 'Deuxième bataille de Séoul', '제2차 서울 전투') },
    { d: '1950-10-15', at: 'Wake Island', wiki: 'Wake_Island_Conference', kind: 'conference', name: L('Wake Island Conference', 'ウェーク島会談', 'Konferenz von Wake Island', 'Встреча на острове Уэйк', 'Conferencia de la isla Wake', '威克島會談', '威克岛会谈', 'Conférence de Wake', '웨이크섬 회담') },
    { d: '1950-10-17', d2: '1950-12-07', at: 'Sinchon', wiki: 'Sinchon_Massacre', kind: 'atrocity', name: L('Sinchon massacre', '信川虐殺事件', 'Massaker von Sinchon', 'Резня в Синчхоне', 'Masacre de Sinchon', '信川大屠殺', '信川大屠杀', 'Massacre de Sinchon', '신천 학살 사건') },
    { d: '1950-11-01', d2: '1950-11-02', at: 'Unsan', wiki: 'Battle_of_Unsan', kind: 'battle', name: L('Battle of Unsan', '雲山の戦い', 'Schlacht bei Unsan', 'Битва при Унсане', 'Batalla de Unsan', '雲山戰役', '云山战役', 'Bataille d’Unsan', '운산 전투') },
    { d: '1950-11-01', d2: '1953-07-27', at: 'Sinuiju', wiki: 'MiG_Alley', kind: 'air', name: L('MiG Alley', 'ミグ回廊', 'MiG-Allee', '«Аллея МиГов»', 'Callejón de los MiG', '米格走廊', '米格走廊', 'Couloir des MiG', '미그 회랑') },
    { d: '1950-11-25', d2: '1950-12-02', at: 'Kujang', wiki: 'Battle_of_the_Ch%27ongch%27on_River', kind: 'battle', name: L('Battle of the Ch’ongch’on River', '清川江の戦い', 'Schlacht am Ch’ongch’on', 'Битва на реке Чхончхонган', 'Batalla del río Chongchon', '清川江戰役', '清川江战役', 'Bataille de la rivière Ch’ongch’on', '청천강 전투') },
    { d: '1950-11-27', d2: '1950-12-13', at: 'Changjin', wiki: 'Battle_of_Chosin_Reservoir', kind: 'siege', str: [150000, 180000], name: L('Battle of Chosin Reservoir', '長津湖の戦い', 'Schlacht am Chosin-Stausee', 'Битва при Чосинском водохранилище', 'Batalla del embalse de Chosin', '長津湖戰役', '长津湖战役', 'Bataille du réservoir de Chosin', '장진호 전투') },
    { d: '1950-12-11', d2: '1950-12-24', at: 'Hungnam', wiki: 'Hungnam_evacuation', kind: 'landing', name: L('Hungnam evacuation', '興南撤収作戦', 'Evakuierung von Hungnam', 'Эвакуация из Хыннама', 'Evacuación de Hungnam', '興南撤退', '兴南撤退', 'Évacuation de Hungnam', '흥남 철수 작전') },
    { d: '1950-12-31', d2: '1951-01-07', at: 'Seoul', wiki: 'Third_Battle_of_Seoul', kind: 'battle', name: L('Third Battle of Seoul', '第三次ソウルの戦い', 'Dritte Schlacht um Seoul', 'Третья битва за Сеул', 'Tercera batalla de Seúl', '第三次漢城戰役', '第三次汉城战役', 'Troisième bataille de Séoul', '1·4 후퇴(제3차 서울 전투)') },
    { d: '1951-02-13', d2: '1951-02-15', at: 'Chipyong-ni', wiki: 'Battle_of_Chipyong-ni', kind: 'battle', name: L('Battle of Chipyong-ni', '砥平里の戦い', 'Schlacht von Chipyong-ni', 'Битва при Чипхённи', 'Batalla de Chipyong-ni', '砥平里戰役', '砥平里战役', 'Bataille de Chipyong-ni', '지평리 전투') },
    { d: '1951-02-16', d2: '1953-07-27', at: 'Wonsan', wiki: 'Siege_of_Wonsan', kind: 'siege', name: L('Siege of Wonsan', '元山封鎖', 'Belagerung von Wonsan', 'Осада Вонсана', 'Sitio de Wonsan', '元山封鎖', '元山封锁', 'Siège de Wonsan', '원산 봉쇄') },
    { d: '1951-03-07', d2: '1951-04-04', at: 'Yangpyeong', wiki: 'Operation_Ripper', kind: 'battle', name: L('Operation Ripper', 'リッパー作戦', 'Operation Ripper', 'Операция «Потрошитель»', 'Operación Ripper', '撕裂者行動', '撕裂者行动', 'Opération Ripper', '리퍼 작전') },
    { d: '1951-04-22', d2: '1951-04-25', at: 'Munsan', wiki: 'Battle_of_the_Imjin_River', kind: 'battle', name: L('Battle of the Imjin River', '臨津江の戦い', 'Schlacht am Imjin', 'Битва на реке Имджинган', 'Batalla del río Imjin', '臨津江戰役', '临津江战役', 'Bataille de l’Imjin', '임진강 전투') },
    { d: '1951-04-22', d2: '1951-04-25', at: 'Gapyeong', wiki: 'Battle_of_Kapyong', kind: 'battle', name: L('Battle of Kapyong', '加平の戦い', 'Schlacht von Kapyong', 'Битва при Капхёне', 'Batalla de Kapyong', '加平戰役', '加平战役', 'Bataille de Kapyong', '가평 전투') },
    { d: '1951-05-16', d2: '1951-05-22', at: 'Inje', wiki: 'Battle_of_the_Soyang_River', kind: 'battle', name: L('Battle of the Soyang River', '昭陽江の戦い', 'Schlacht am Soyang', 'Битва на реке Соянган', 'Batalla del río Soyang', '昭陽江戰役', '昭阳江战役', 'Bataille de la rivière Soyang', '소양강 전투') },
    { d: '1951-07-10', at: 'Kaesong', wiki: 'Korean_Armistice_Agreement', kind: 'political', name: L('Armistice talks open at Kaesong', '開城で休戦会談が始まる', 'Beginn der Waffenstillstandsgespräche in Kaesong', 'Начало переговоров о перемирии в Кэсоне', 'Comienzan las conversaciones de armisticio en Kaesong', '開城停戰談判開始', '开城停战谈判开始', 'Ouverture des pourparlers d’armistice à Kaesong', '개성 휴전 회담 개시') },
    { d: '1951-08-18', d2: '1951-09-05', at: 'Yanggu', wiki: 'Battle_of_Bloody_Ridge', kind: 'battle', name: L('Battle of Bloody Ridge', '血の稜線の戦い', 'Schlacht um Bloody Ridge', 'Битва за Кровавый хребет', 'Batalla de Bloody Ridge', '血嶺戰役', '血岭战役', 'Bataille de Bloody Ridge', '피의 능선 전투') },
    { d: '1951-09-13', d2: '1951-10-15', at: 'Inje', wiki: 'Battle_of_Heartbreak_Ridge', kind: 'battle', name: L('Battle of Heartbreak Ridge', '断腸の稜線の戦い', 'Schlacht um Heartbreak Ridge', 'Битва за хребет Разбитых сердец', 'Batalla de Heartbreak Ridge', '傷心嶺戰役', '伤心岭战役', 'Bataille de Crèvecœur', '단장의 능선 전투') },
    { d: '1951-10-03', d2: '1951-10-19', at: 'Yeoncheon', wiki: 'Operation_Commando_(Korean_War)', kind: 'battle', name: L('Operation Commando', 'コマンド作戦', 'Operation Commando', 'Операция «Коммандо»', 'Operación Commando', '突擊隊行動', '突击队行动', 'Opération Commando', '코만도 작전') },
    { d: '1951-11-27', at: 'Panmunjom', wiki: 'Korean_Armistice_Agreement', kind: 'political', name: L('The line of contact is agreed at Panmunjom', '板門店で接触線が合意される', 'Vereinbarung der Kontaktlinie in Panmunjom', 'Согласование линии соприкосновения в Пханмунджоме', 'Se acuerda la línea de contacto en Panmunjom', '板門店議定接觸線', '板门店议定接触线', 'Accord sur la ligne de contact à Panmunjom', '판문점에서 접촉선이 합의되다') },
    { d: '1952-05-07', d2: '1952-06-10', at: 'Geoje', wiki: 'Koje-do_incident', kind: 'uprising', name: L('Koje-do prisoner-of-war camp uprising', '巨済島捕虜収容所暴動', 'Aufstand im Kriegsgefangenenlager Koje-do', 'Восстание в лагере военнопленных Кочжедо', 'Motín del campo de prisioneros de Koje-do', '巨濟島戰俘營暴動', '巨济岛战俘营暴动', 'Révolte du camp de prisonniers de Koje-do', '거제도 포로수용소 폭동') },
    { d: '1952-10-06', d2: '1952-10-15', at: 'Cheorwon', wiki: 'Battle_of_White_Horse', kind: 'battle', name: L('Battle of White Horse', '白馬高地の戦い', 'Schlacht um White Horse', 'Битва за высоту Белая Лошадь', 'Batalla de White Horse', '白馬山戰役', '白马山战役', 'Bataille de White Horse', '백마고지 전투') },
    { d: '1952-10-14', d2: '1952-11-25', at: 'Kumhwa', wiki: 'Battle_of_Triangle_Hill', kind: 'battle', name: L('Battle of Triangle Hill', '上甘嶺の戦い', 'Schlacht um Triangle Hill', 'Битва за высоту Треугольник', 'Batalla de Triangle Hill', '上甘嶺戰役', '上甘岭战役', 'Bataille de Triangle Hill', '삼각고지 전투') },
    { d: '1953-03-23', d2: '1953-07-16', at: 'Yeoncheon', wiki: 'Battle_of_Pork_Chop_Hill', kind: 'battle', name: L('Battle of Pork Chop Hill', 'ポークチョップヒルの戦い', 'Schlacht um Pork Chop Hill', 'Битва за высоту Порк-Чоп', 'Batalla de Pork Chop Hill', '豬排山戰役', '猪排山战役', 'Bataille de Pork Chop Hill', '폭찹힐 전투') },
    { d: '1953-07-13', d2: '1953-07-27', at: 'Kumsong', wiki: 'Battle_of_Kumsong', kind: 'battle', name: L('Battle of Kumsong', '金城の戦い', 'Schlacht um Kumsong', 'Битва при Кымсоне', 'Batalla de Kumsong', '金城戰役', '金城战役', 'Bataille de Kumsong', '금성 전투') },
    { d: '1953-07-27', at: 'Panmunjom', wiki: 'Korean_Armistice_Agreement', kind: 'political', name: L('Korean Armistice Agreement', '朝鮮戦争休戦協定', 'Waffenstillstandsabkommen von Panmunjom', 'Соглашение о перемирии в Корее', 'Acuerdo de Armisticio de Corea', '韓戰停戰協定', '朝鲜停战协定', 'Armistice de Panmunjom', '한국 휴전 협정') },
  ],
};

export { KOREA };
