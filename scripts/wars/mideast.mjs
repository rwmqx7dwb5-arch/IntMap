/* ============================================================================
 *  IntMap · THE ARAB–ISRAELI WARS — the curated record   (#R524)
 * ----------------------------------------------------------------------------
 *  The rules every row here obeys — what `control`, `fronts` and `events` are each allowed to claim,
 *  and why a day nobody wrote down gets no line — are stated once, in ./lang.mjs. This file adds
 *  nothing to them; what follows are the three things this particular war needs said out loud.
 *
 *  ══ ① NOTHING HERE IS TRACED OFF A MAP, AND FOR THIS WAR THAT IS ALSO A LEGAL FACT ══════════
 *  Dated front lines for 1948, 1956, 1967 and 1973 exist as PICTURES in quantity, and the ones that
 *  were checked before this record was written are not free to copy: the West Point atlas states that
 *  reproduction needs permission, the ACSS Dataverse armistice-line shapefile ships with an empty
 *  licence field, and the Library of Congress and Perry-Castañeda copies could not be reached to read
 *  their terms at all. None of that matters here, because IntMap does not need a picture. Where a
 *  line ran on a given day is a fact and facts are not copyrightable; a particular drawing of it is
 *  someone’s work. So every position below is quoted the way the written record states it — as a line
 *  THROUGH NAMED PLACES — and scripts/build-wars.mjs derives the geometry. Nothing is traced,
 *  nothing is interpolated, and no coordinate has been converted out of a Palestine Grid reference.
 *
 *  ══ ② THE BASE MAP ALREADY CONTAINS TWO OF THE ANSWERS ══════════════════════════════════════
 *  CShapes changes these borders on its own, twice, and both changes are results of wars in this
 *  record: on 1967-06-10 Israel’s polygon takes in Sinai, the Gaza Strip, the West Bank and the Golan
 *  — Egypt loses Sinai, Syria loses the Golan, and the separate West Bank (gw6631) and Gaza (gw6511)
 *  entities END — and on 1979-05-26 Sinai goes back to Egypt. Israel’s polygon for 1948-05-14 is
 *  ALREADY the 1949 armistice line. So what is written below is never the outcome of a war; it is
 *  only the line while it was being fought, and each front stops on the day the base map takes over.
 *
 *  ══ ③ WHAT THIS RECORD DOES NOT DRAW, NAMED ═════════════════════════════════════════════════
 *  A cut is a line with two sides. A POCKET is not, and this war produced five famous ones. They are
 *  listed here rather than approximated: the Arab Liberation Army’s central-Galilee holding around
 *  Nazareth (15 May – 16 July 1948); the Egyptian brigade encircled at al-Faluja (October 1948 –
 *  February 1949); the Syrian bridgehead at Mishmar HaYarden west of the Jordan (10 June 1948 – the
 *  armistice of 20 July 1949); the Anglo-French bridgehead from Port Said to al-Qantara (November –
 *  December 1956); and the Israeli bridgehead west of the Suez Canal with the Egyptian Third Army
 *  encircled behind it (16–24 October 1973). Each is reachable as an operation in `events`. None of
 *  them is a side of a line, and this file will not invent one to make them paintable.
 *  Three more limits, for the same reason. Port Fuad, the one piece of the canal's east bank Egypt
 *  held on to after 1967, is a sliver at the canal mouth narrower than the line that divides it,
 *  and reads Israeli here from 9 June 1967. CShapes puts the WHOLE of Jerusalem inside its West Bank
 *  polygon, so the city divided from 1949 to 1967 is below this record’s resolution too. And the West
 *  Bank and the Gaza Strip are described by `control` alone — no front cuts them — because a front
 *  that did would outlive the polygon it cuts and leave a span nothing could assert.
 * ==========================================================================*/
import { L } from './lang.mjs';

/* ── the sides ──────────────────────────────────────────────────────────────────────────────────
 *  ⚠ WHICH SIDE IS BLUE AND WHICH IS RED WAS NOT DECIDED ON THE HISTORY. In the two world-war layers
 *  #b4544a is worn by the Central Powers and by the Axis — the party that opened the war in each —
 *  and a reader who has looked at those layers has learned that association whether or not anybody
 *  meant to teach it. It cannot be carried over here, because no single party opened all four of
 *  these wars: the Arab states in 1948, Israel in 1956 and 1967, Egypt and Syria in 1973. Any
 *  substantive criterion for the assignment would therefore be a verdict, and this layer has no
 *  business delivering one.
 *  So the assignment is made on a rule that encodes NOTHING: the two faction keys in alphabetical
 *  order, ARAB then ISRAEL, take the two colours in the order the other layers list them, blue then
 *  red. It means exactly as much as the order of two names in an index, which is the point. The
 *  neutral colour keeps its usual role, and the CONTESTED colour of the other two layers is NOT
 *  declared here — not as an oversight but because this record never needs it. Every span below
 *  either carries a quotable line or has one documented holder; what remains genuinely uncertain
 *  in these four wars is pocket-shaped rather than country-shaped, and pockets are named in ③ of
 *  the header instead of painted. A legend row nothing on the map can ever match is the same
 *  half-written shape that check ⑦ exists to catch in the gazetteer.
 */
const F_MIDEAST = {
  ARAB: { col: '#4a7fbd', name: L('Arab states', 'アラブ諸国', 'Arabische Staaten', 'Арабские государства', 'Estados árabes', '阿拉伯國家', '阿拉伯国家', 'États arabes', '아랍 국가') },
  ISRAEL: { col: '#b4544a', name: L('Israel', 'イスラエル', 'Israel', 'Израиль', 'Israel', '以色列', '以色列', 'Israël', '이스라엘') },
  COBELL: { col: '#c97f6e', name: L('Co-belligerent with Israel', 'イスラエル側の共同交戦国', 'Mitkriegführend an der Seite Israels', 'Совоюющие с Израилем', 'Cobeligerante de Israel', '以色列一方的共同交戰國', '以色列一方的共同交战国', 'Cobelligérant d’Israël', '이스라엘 측 공동 교전국') },
  NEUTRAL: { col: '#9aa1a8', name: L('Neutral', '中立', 'Neutral', 'Нейтральные', 'Neutral', '中立', '中立', 'Neutre', '중립') },
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ARAB–ISRAELI WARS · 15 May 1948 — 31 May 1974
 *  One layer over twenty-six years, because the four wars are four campaigns of one conflict and the
 *  quiet years between them are part of what the reader came to see: the line of 1949 stands for
 *  seven years, the line of 1957 for ten, the line of 1967 for six. In those spans there is no front
 *  at all and `control` alone says who held what — which is exactly the shape #R409’s check ⑪ was
 *  written to police, so each of those spans carries its own control check below.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const MIDEAST = {
  id: 'mideast',
  /* ⚠ THE NAME IS THE ONE EACH LANGUAGE ACTUALLY USES, and where a language has two, the one that
     names neither a victor nor a cause. Japanese and Korean overwhelmingly say «the Middle East
     wars»; German, Russian, Spanish, French and Chinese name both parties. English «Arab–Israeli
     Wars» is the term the scholarship uses for the set; «War of Independence» and «al-Nakba» are
     each one side’s name for one of them and neither appears here. */
  name: L('Arab–Israeli Wars', '中東戦争', 'Arabisch-israelische Kriege', 'Арабо-израильские войны', 'Guerras árabe-israelíes', '阿以戰爭', '阿以战争', 'Guerres israélo-arabes', '중동 전쟁'),
  from: '1948-05-15', to: '1974-05-31',
  factions: F_MIDEAST,
  /* ⚠ [date, place, the faction that held it]. This is the ONLY check that can tell a front drawn
     correctly from one drawn back to front, so there is a pair for every dated position below — one
     town from each side of the line, and never the anchors the line itself is quoted through. The
     rows dated in the quiet years are the other kind: they assert what `control` alone is saying in
     a span no line crosses. */
  checks: [
    /* 1948 · the first truce, when all three fronts of that war are standing at once */
    ['1948-06-11', 'Tel Aviv', 'ISRAEL'], ['1948-06-11', 'Lod', 'ARAB'],
    ['1948-06-11', 'Ramla', 'ARAB'], ['1948-06-11', 'Haifa', 'ISRAEL'],
    ['1948-06-11', 'Beersheba', 'ARAB'], ['1948-06-11', 'Safed', 'ISRAEL'],
    ['1948-06-11', 'Tiberias', 'ISRAEL'], ['1948-06-11', 'Damascus', 'ARAB'],
    ['1948-06-11', 'Hebron', 'ARAB'], ['1948-06-11', 'Gaza', 'ARAB'],
    /* 1948 · Operation Danny takes Lydda and Ramle, and Operation Yoav takes Beersheba */
    ['1948-07-20', 'Lod', 'ISRAEL'], ['1948-07-20', 'Beersheba', 'ARAB'],
    ['1948-10-25', 'Beersheba', 'ISRAEL'], ['1948-10-25', 'Ashkelon', 'ARAB'],
    /* 1949 · Horev has cleared the Negev; only the Gaza Strip is left, and it is its own polygon */
    ['1949-01-10', 'Ashkelon', 'ISRAEL'], ['1949-01-10', 'Gaza', 'ARAB'],
    ['1949-05-01', 'Beersheba', 'ISRAEL'], ['1949-05-01', 'Damascus', 'ARAB'],
    /* the seven years the armistice lines stood, asserted where no line crosses the country */
    ['1952-01-01', 'Cairo', 'ARAB'], ['1952-01-01', 'Tel Aviv', 'ISRAEL'],
    ['1955-01-01', 'Tel Aviv', 'ISRAEL'], ['1955-01-01', 'Nablus', 'ARAB'],
    /* 1956 · the Sinai campaign, on the day the passes are through and on the day it is finished */
    ['1956-10-31', 'El Arish', 'ARAB'], ['1956-10-31', 'Bir Gifgafa', 'ARAB'],
    ['1956-11-04', 'El Arish', 'ISRAEL'], ['1956-11-04', 'Ismailia', 'ARAB'],
    ['1956-11-04', 'Bir Gifgafa', 'ISRAEL'], ['1956-11-04', 'Cairo', 'ARAB'],
    ['1956-12-01', 'Gaza', 'ISRAEL'],       /* the Strip is held from 2 Nov 1956 to 6 March 1957 */
    /* the ten years between the withdrawal and the next war */
    ['1960-06-01', 'Cairo', 'ARAB'], ['1960-06-01', 'Damascus', 'ARAB'],
    ['1960-06-01', 'Beersheba', 'ISRAEL'], ['1960-06-01', 'Gaza', 'ARAB'],
    ['1966-01-01', 'Haifa', 'ISRAEL'], ['1966-01-01', 'Quneitra', 'ARAB'],
    /* 1967 · the three days the Sinai front is quoted through */
    ['1967-06-05', 'Bir Gifgafa', 'ARAB'], ['1967-06-05', 'Suez', 'ARAB'],
    ['1967-06-07', 'El Arish', 'ISRAEL'], ['1967-06-07', 'Ismailia', 'ARAB'],
    ['1967-06-09', 'Bir Gifgafa', 'ISRAEL'], ['1967-06-09', 'Ismailia', 'ARAB'],
    ['1967-06-08', 'Nablus', 'ISRAEL'],     /* the West Bank fell on 7 June; `control` says so */
    ['1967-06-08', 'Amman', 'ARAB'],
    /* the six years after 1967, with the Golan and Sinai inside Israel’s own polygon */
    ['1970-01-01', 'Cairo', 'ARAB'], ['1970-01-01', 'Quneitra', 'ISRAEL'],
    ['1970-01-01', 'Bir Gifgafa', 'ISRAEL'], ['1970-01-01', 'Damascus', 'ARAB'],
    /* 1973 · the Egyptian bridgeheads east of the canal, and the Israeli salient beyond the Golan */
    ['1973-10-08', 'Damascus', 'ARAB'], ['1973-10-10', 'Nafah', 'ISRAEL'],
    ['1973-10-20', 'Bir Gifgafa', 'ISRAEL'], ['1973-10-20', 'Ismailia', 'ARAB'],
    ['1973-10-20', 'El Arish', 'ISRAEL'], ['1973-10-20', 'Cairo', 'ARAB'],
    ['1973-10-25', 'Damascus', 'ARAB'], ['1973-10-25', 'Deraa', 'ARAB'],
    ['1974-05-01', 'Bir Gifgafa', 'ISRAEL'], ['1974-05-01', 'Cairo', 'ARAB'],
  ],
  /* gwcode → [[date, faction], …]. A country absent from this table is neutral for the whole war.
     ⚠ THE WEST BANK (gw6631) AND THE GAZA STRIP (gw6511) ARE DESCRIBED HERE AND NOWHERE ELSE. Both
     are CShapes entities in their own right from 1948-05-14 to 1967-06-09, and no front below cuts
     either of them — so every change of hands they saw is a dated row here, and the day each of them
     stops existing is the day Israel’s polygon absorbs it. */
  control: {
    666: [['1948-05-15', 'ISRAEL']],
    651: [['1948-05-15', 'ARAB']],                                    /* Egypt */
    652: [['1948-05-15', 'ARAB']],                                    /* Syria */
    663: [['1948-05-15', 'ARAB']],                                    /* Jordan (Transjordan) */
    645: [['1948-05-15', 'ARAB']],                                    /* Iraq — the expeditionary force in the Triangle in 1948, and contingents in 1967 and 1973 */
    /* Lebanon — a belligerent for eight weeks in 1948 and a party to the armistice of 23 March 1949;
       it sent no army to any of the three later wars and the row is not a claim that it did. It stays
       on this side because it never left the state of war the armistice suspended. */
    660: [['1948-05-15', 'ARAB']],
    /* Saudi Arabia — a battalion under Egyptian command in 1948, and a brigade sent to Syria in 1973 */
    670: [['1948-05-15', 'ARAB']],
    /* the Gaza Strip — Egyptian-administered, held by Israel from the fall of Rafah in November 1956
       until UNEF took it over on 6 March 1957, and taken again on the second day of the 1967 war */
    6511: [['1948-05-15', 'ARAB'], ['1956-11-03', 'ISRAEL'], ['1957-03-07', 'ARAB'], ['1967-06-06', 'ISRAEL']],
    /* the West Bank — held by the Arab Legion from May 1948, annexed by Jordan in 1950, and lost in
       three days in June 1967. ⚠ THE POLYGON ENDS ON 1967-06-09 and Israel’s takes it in on the 10th,
       so the row for the 7th is the only way this record can say the day it actually changed hands. */
    6631: [['1948-05-15', 'ARAB'], ['1967-06-07', 'ISRAEL']],
    /* ⚠ BRITAIN AND FRANCE WERE BELLIGERENTS FOR SEVEN WEEKS AND NOTHING ELSE IN THIS RECORD SAYS SO.
       The Protocol of Sèvres of 22 October 1956 arranged an Israeli attack the two powers would then
       «separate»; their air campaign opened on 31 October, their paratroops landed at Port Said on
       5 November, and the last of them left on 22 December. The faction is the world-war layers’
       co-belligerent role, because that is what they were — allied in the fighting, not in the state.
       Their own polygons are what carry the colour; the bridgehead they held on the canal is one of
       the pockets this record does not draw (see ③ in the header). */
    200: [['1956-10-31', 'COBELL'], ['1956-12-23', 'NEUTRAL']],       /* United Kingdom */
    220: [['1956-10-31', 'COBELL'], ['1956-12-23', 'NEUTRAL']],       /* France */
  },
  fronts: [
    /* ══ 1948–49 ══════════════════════════════════════════════════════════════════════════════
       Three fronts, because on 15 May 1948 there were three, opened by different armies on the same
       morning and never joined into one. Each is quoted only where the record gives it a line. */
    {
      id: 'south48',
      name: L('Southern front (Egypt), 1948–49', '南部戦線（エジプト）1948–49', 'Südfront (Ägypten), 1948–49', 'Южный фронт (Египет), 1948–49', 'Frente sur (Egipto), 1948–49', '南部戰線（埃及）1948–49', '南部战线（埃及）1948–49', 'Front sud (Égypte), 1948–1949', '남부 전선(이집트), 1948–49'),
      left: 'ARAB', right: 'ISRAEL',   /* the lines run north-west → south-east, so «left» is the seaward, Egyptian side */
      until: '1949-02-25',             /* the Rhodes armistice of 24 February 1949; from the next day the border IS the line */
      dates: [
        { d: '1948-05-15', cuts: [666], note: L('The Egyptian expeditionary force crosses the frontier at Rafah and al-Auja on the day the mandate ends; the Negev, al-Majdal and the Hebron road are Arab ground and the settlements inside them are cut off', 'エジプト遠征軍が委任統治終了の日にラファとアル・アウジャで国境を越える。ネゲヴ・アル・マジダル・ヘブロン街道はアラブ側の地で、その中の入植地は孤立する', 'Das ägyptische Expeditionskorps überschreitet am Tag des Mandatsendes die Grenze bei Rafah und al-Audscha; der Negev, al-Madschdal und die Straße nach Hebron sind arabischer Boden, und die Siedlungen darin sind abgeschnitten', 'Египетский экспедиционный корпус переходит границу у Рафаха и Эль-Ауджи в день окончания мандата; Негев, аль-Мадждаль и дорога на Хеврон — арабская земля, а поселения в них отрезаны', 'El cuerpo expedicionario egipcio cruza la frontera por Rafah y al-Auya el día en que termina el mandato; el Néguev, al-Majdal y la carretera de Hebrón son terreno árabe y los asentamientos que hay en ellos quedan aislados', '埃及遠征軍在託管結束當日於拉法與奧賈越過邊界；內蓋夫、馬季達勒與希伯崙公路屬阿拉伯一方，其中的屯墊區遭到孤立', '埃及远征军在托管结束当日于拉法与奥贾越过边界；内盖夫、马季达勒与希伯伦公路属阿拉伯一方，其中的屯垦区遭到孤立', 'Le corps expéditionnaire égyptien franchit la frontière à Rafah et al-Auja le jour où le mandat prend fin ; le Néguev, al-Majdal et la route d’Hébron sont en terrain arabe et les implantations qui s’y trouvent sont isolées', '이집트 원정군이 위임통치 종료일에 라파와 알아우자에서 국경을 넘는다. 네게브와 알마즈달, 헤브론 가도는 아랍 측의 때이며 그 안의 정착촌은 고립된다'),
          pts: ['Ashkelon', 'Faluja', 'Hebron'] },
        { d: '1948-05-29', cuts: [666], note: L('The coastal column is stopped at the Ad Halom bridge north of Isdud — the furthest north an Egyptian army reaches in this war', '沿岸縦隊はイスドゥード北方のアド・ハロム橋で阻止される——この戦争でエジプト軍が到達した最北点', 'Die Küstenkolonne wird an der Ad-Halom-Brücke nördlich von Isdud gestoppt — der nördlichste Punkt, den eine ägyptische Armee in diesem Krieg erreicht', 'Прибрежная колонна остановлена у моста Ад-Халом севернее Исдуда — самая северная точка, куда дошла египетская армия в этой войне', 'La columna costera es detenida en el puente de Ad Halom, al norte de Isdud: el punto más septentrional que alcanza un ejército egipcio en esta guerra', '沿海縱隊在伊斯杜德以北的阿德哈隆橋被阻——這場戰爭中埃及軍隊到達的最北點', '沿海纵队在伊斯杜德以北的阿德哈隆桥被阻——这场战争中埃及军队到达的最北点', 'La colonne côtière est arrêtée au pont d’Ad Halom au nord d’Isdud — le point le plus septentrional atteint par une armée égyptienne dans cette guerre', '해안 종대가 이스두드 북쪽 아드할롬 다리에서 저지된다 — 이 전쟁에서 이집트군이 도달한 최북단'),
          pts: ['Ashdod', 'Faluja', 'Hebron'] },
        { d: '1948-06-11', cuts: [666], note: L('The first truce freezes the southern line where it stands', '第一次休戦が南部戦線をその場で凍結する', 'Der erste Waffenstillstand friert die Südfront dort ein, wo sie steht', 'Первое перемирие замораживает южную линию там, где она стоит', 'La primera tregua congela la línea del sur donde está', '第一次停火將南部戰線凍結在原地', '第一次停火将南部战线冻结在原地', 'La première trêve fige la ligne du sud là où elle se trouve', '제1차 정전이 남부 전선을 그 자리에 묶어 둔다'),
          pts: ['Ashdod', 'Faluja', 'Hebron'] },
        { d: '1948-07-18', cuts: [666], pts: ['Ashdod', 'Faluja', 'Hebron'] },
        { d: '1948-10-22', cuts: [666], note: L('Operation Yoav: Beersheba is taken and the road into the Negev opened, cutting the Egyptian coastal force off from the Hebron hills and leaving a brigade encircled at al-Faluja', 'ヨアヴ作戦——ベエルシェバ占領でネゲヴへの道が開き、エジプト軍の沿岸部隊はヘブロン丘陵から切り離され、1個旅団がアル・ファルージャに包囲される', 'Operation Joav: Beerscheba fällt und der Weg in den Negev ist offen; die ägyptische Küstengruppe wird vom Hebron-Bergland abgeschnitten, eine Brigade bleibt bei al-Falludscha eingeschlossen', 'Операция «Йоав»: взята Беэр-Шева, открыта дорога в Негев, египетская прибрежная группировка отрезана от Хевронского нагорья, бригада окружена у аль-Фалуджи', 'Operación Yoav: cae Beerseba y se abre el camino al Néguev; la fuerza costera egipcia queda separada de las colinas de Hebrón y una brigada cercada en al-Faluya', '約亞夫行動：攻下貝爾謝巴、打通內蓋夫通路，埃及沿海部隊與希伯崙山區被切斷，一個旅被圍於法魯賈', '约亚夫行动：攻下贝尔谢巴、打通内盖夫通路，埃及沿海部队与希伯伦山区被切断，一个旅被围于法鲁贾', 'Opération Yoav : Beersheba est prise et la route du Néguev ouverte ; la force côtière égyptienne est coupée des collines d’Hébron et une brigade reste encerclée à al-Faluja', '요아브 작전 — 베르셰바가 함락되고 네게브로 가는 길이 열리며, 이집트 해안 부대는 헤브론 산지와 단절되고 1개 여단이 알팔루자에 포위된다'),
          pts: ['Ashdod', 'Faluja', 'Bir Asluj'] },
        { d: '1948-12-28', cuts: [666], note: L('Operation Horev: al-Majdal and al-Auja are taken, the Egyptians are out of the Negev, and what is left of them in Palestine is the Gaza Strip', 'ホレヴ作戦——アル・マジダルとアル・アウジャを奪取。エジプト軍はネゲヴから排除され、パレスチナに残るのはガザ地区だけになる', 'Operation Chorew: al-Madschdal und al-Audscha fallen, die Ägypter sind aus dem Negev verdrängt, und was ihnen in Palästina bleibt, ist der Gazastreifen', 'Операция «Хорев»: взяты аль-Маджаль и Эль-Ауджа, египтяне вытеснены из Негева, и в Палестине у них остаётся только сектор Газа', 'Operación Horev: se toman al-Majdal y al-Auya, los egipcios quedan fuera del Néguev y lo que les queda en Palestina es la Franja de Gaza', '霍列夫行動：攻下馬季達勒與奧賈，埃及軍撤出內蓋夫，在巴勒斯坦僅餘加薩走廊', '霍列夫行动：攻下马季达勒与奥贾，埃及军撤出内盖夫，在巴勒斯坦仅余加沙地带', 'Opération Horev : al-Majdal et al-Auja sont prises, les Égyptiens sont chassés du Néguev et il ne leur reste en Palestine que la bande de Gaza', '호레브 작전 — 알마즈달과 알아우자를 점령하고 이집트군은 네게브에서 밀려나, 팔레스타인에 남은 것은 가자 지구뿐이다'),
          pts: ['Yad Mordechai', 'Auja al-Hafir'] },
      ],
    },
    {
      id: 'centre48',
      name: L('Central front (the Arab Legion), 1948', '中部戦線（アラブ軍団）1948', 'Mittelfront (Arabische Legion), 1948', 'Центральный фронт (Арабский легион), 1948', 'Frente central (Legión Árabe), 1948', '中部戰線（阿拉伯軍團）1948', '中部战线（阿拉伯军团）1948', 'Front central (Légion arabe), 1948', '중부 전선(아랍 군단), 1948'),
      left: 'ISRAEL', right: 'ARAB',   /* the line runs north → south down the coastal plain, so «left» is the seaward, Israeli side */
      until: '1948-07-13',             /* Operation Danny takes Lydda and Ramle on 11–12 July and the salient is gone */
      dates: [
        { d: '1948-05-15', cuts: [666], note: L('The Arab Legion crosses the Jordan; within ten days it holds Latrun and the road to Jerusalem is cut, and Lydda and Ramle stand as a salient in the coastal plain', 'アラブ軍団がヨルダン川を渡る。10日のうちにラトルンを押さえてエルサレムへの道は遮断され、リッダとラムラは沿岸平野に突出部として残る', 'Die Arabische Legion überschreitet den Jordan; binnen zehn Tagen hält sie Latrun, die Straße nach Jerusalem ist abgeschnitten, und Lydda und Ramle bilden einen Vorsprung in der Küstenebene', 'Арабский легион переходит Иордан; за десять дней он занимает Латрун, дорога на Иерусалим перерезана, а Лидда и Рамле остаются выступом в прибрежной равнине', 'La Legión Árabe cruza el Jordán; en diez días ocupa Latrun, la carretera a Jerusalén queda cortada y Lida y Ramla forman un saliente en la llanura costera', '阿拉伯軍團渡過約旦河；十天內佔領拉特倫，通往耶路撒冷的道路被切斷，盧德與拉姆拉在沿海平原形成突出部', '阿拉伯军团渡过约旦河；十天内占领拉特伦，通往耶路撒冷的道路被切断，卢德与拉姆拉在沿海平原形成突出部', 'La Légion arabe franchit le Jourdain ; en dix jours elle tient Latroun, la route de Jérusalem est coupée et Lydda et Ramleh forment un saillant dans la plaine côtière', '아랍 군단이 요르단강을 건넌다. 열흘 만에 라트룬을 장악해 예루살렘 가는 길이 끊기고, 리다와 람라는 해안 평야의 돌출부로 남는다'),
          pts: ['Petah Tikva', 'Rehovot'] },
        { d: '1948-06-11', cuts: [666], pts: ['Petah Tikva', 'Rehovot'] },
      ],
    },
    {
      id: 'north48',
      name: L('Northern front (Syria and Lebanon), 1948–49', '北部戦線（シリア・レバノン）1948–49', 'Nordfront (Syrien und Libanon), 1948–49', 'Северный фронт (Сирия и Ливан), 1948–49', 'Frente norte (Siria y Líbano), 1948–49', '北部戰線（敘利亞與黎巴嫩）1948–49', '北部战线（叙利亚与黎巴嫩）1948–49', 'Front nord (Syrie et Liban), 1948–1949', '북부 전선(시리아·레바논), 1948–49'),
      left: 'ISRAEL', right: 'ARAB',   /* the line runs north → south down the upper Jordan, so «left» is the western, Israeli side */
      until: '1949-07-21',             /* the Israeli–Syrian armistice of 20 July 1949, the last of the four */
      dates: [
        { d: '1948-05-15', cuts: [666], note: L('The Syrian army crosses the Jordan at Samakh and is stopped at Degania; the Lebanese take Malkiya in the far north', 'シリア軍がサマフでヨルダン川を渡り、デガニヤで阻止される。レバノン軍は最北のマルキヤを占領する', 'Die syrische Armee überschreitet den Jordan bei Samach und wird bei Degania gestoppt; die Libanesen nehmen Malkija im äußersten Norden', 'Сирийская армия переходит Иордан у Самаха и остановлена у Дегании; ливанцы занимают Малькию на крайнем севере', 'El ejército sirio cruza el Jordán en Samaj y es detenido en Deganya; los libaneses toman Malkiya en el extremo norte', '敘利亞軍在薩馬赫渡過約旦河，於德加尼亞被阻；黎巴嫩軍佔領最北端的馬爾基亞', '叙利亚军在萨马赫渡过约旦河，于德加尼亚被阻；黎巴嫩军占领最北端的马尔基亚', 'L’armée syrienne franchit le Jourdain à Samakh et est arrêtée à Deganya ; les Libanais prennent Malkiya à l’extrême nord', '시리아군이 사마흐에서 요르단강을 건너 데가니아에서 저지되고, 레바논군은 최북단 말키야를 점령한다'),
          pts: ['Mishmar HaYarden', 'Samakh'] },
        { d: '1948-06-11', cuts: [666], note: L('The first truce leaves the Syrians holding a bridgehead west of the Jordan at Mishmar HaYarden, which they keep until the armistice of July 1949', '第一次休戦の時点でシリア軍はミシュマル・ハヤルデンにヨルダン川西岸の橋頭堡を保持し、1949年7月の休戦協定までそこに留まる', 'Der erste Waffenstillstand lässt den Syrern einen Brückenkopf westlich des Jordans bei Mischmar HaJarden, den sie bis zum Waffenstillstand vom Juli 1949 halten', 'Первое перемирие оставляет сирийцам плацдарм западнее Иордана у Мишмар-ха-Ярдена, который они удерживают до перемирия июля 1949 года', 'La primera tregua deja a los sirios una cabeza de puente al oeste del Jordán en Mishmar HaYarden, que conservan hasta el armisticio de julio de 1949', '第一次停火使敘利亞軍在約旦河西岸的米什馬爾哈亞爾登保有橋頭堡，直至1949年7月的停戰協定', '第一次停火使叙利亚军在约旦河西岸的米什马尔哈亚尔登保有桥头堡，直至1949年7月的停战协定', 'La première trêve laisse aux Syriens une tête de pont à l’ouest du Jourdain, à Mishmar HaYarden, qu’ils conservent jusqu’à l’armistice de juillet 1949', '제1차 정전으로 시리아군은 요르단강 서안 미슈마르하야르덴의 교두보를 유지하며, 1949년 7월 정전협정까지 이를 지킨다'),
          pts: ['Mishmar HaYarden', 'Samakh'] },
      ],
    },
    /* ══ 1956 ═════════════════════════════════════════════════════════════════════════════════ */
    {
      id: 'sinai56',
      name: L('Sinai, 1956', 'シナイ半島 1956', 'Sinai, 1956', 'Синай, 1956', 'Sinaí, 1956', '西奈半島 1956', '西奈半岛 1956', 'Sinaï, 1956', '시나이반도, 1956'),
      left: 'ARAB', right: 'ISRAEL',   /* the lines have Egypt on the seaward and canal side throughout */
      until: '1957-03-09',             /* the Israeli withdrawal is completed on 8 March 1957 and UNEF takes over */
      dates: [
        { d: '1956-10-31', cuts: [651], note: L('The paratroops dropped at the Mitla Pass on 29 October have been reached overland and Abu Ageila has fallen; the coast road and El Arish are still Egyptian', '10月29日にミトラ峠へ降下した空挺部隊と地上部隊が合流し、アブ・アゲイラが陥落。沿岸道路とエル・アリーシュはなおエジプト側にある', 'Die am 29. Oktober am Mitla-Pass abgesetzten Fallschirmjäger sind auf dem Landweg erreicht und Abu Agheila ist gefallen; die Küstenstraße und al-Arisch sind noch ägyptisch', 'Десант, выброшенный 29 октября у перевала Митла, соединился с наземными войсками, Абу-Агейла взята; прибрежная дорога и Эль-Ариш ещё египетские', 'Los paracaidistas lanzados el 29 de octubre en el paso de Mitla han sido alcanzados por tierra y Abu Agueila ha caído; la carretera costera y El Arish siguen siendo egipcias', '10月29日空降米特拉山口的傘兵已與地面部隊會合，阿布阿格拉陷落；沿海公路與阿里什仍在埃及手中', '10月29日空降米特拉山口的伞兵已与地面部队会合，阿布阿格拉陷落；沿海公路与阿里什仍在埃及手中', 'Les parachutistes largués le 29 octobre au col de Mitla ont été rejoints par voie de terre et Abou Agueila est tombée ; la route côtière et El-Arich sont encore égyptiennes', '10월 29일 미틀라 고개에 강하한 공수부대가 지상 부대와 합류하고 아부아게일라가 함락된다. 해안 도로와 엘아리시는 아직 이집트가 쥐고 있다'),
          pts: ['Abu Ageila', 'Mitla Pass'] },
        { d: '1956-11-02', cuts: [651], note: L('El Arish is taken and the Israeli army stands along the canal; the Anglo-French air campaign has been running since 31 October', 'エル・アリーシュを占領し、イスラエル軍は運河沿いに立つ。英仏の航空作戦は10月31日から続いている', 'Al-Arisch ist genommen und die israelische Armee steht am Kanal; die britisch-französische Luftoffensive läuft seit dem 31. Oktober', 'Эль-Ариш взят, израильская армия стоит вдоль канала; англо-французская воздушная кампания идёт с 31 октября', 'El Arish es tomada y el ejército israelí llega al canal; la campaña aérea anglo-francesa dura desde el 31 de octubre', '攻下阿里什，以色列軍抵達運河沿線；英法空中作戰自10月31日起持續', '攻下阿里什，以色列军抵达运河沿线；英法空中作战自10月31日起持续', 'El-Arich est prise et l’armée israélienne se tient le long du canal ; la campagne aérienne franco-britannique dure depuis le 31 octobre', '엘아리시가 함락되고 이스라엘군이 운하 연변에 도달한다. 영·프 항공 작전은 10월 31일부터 계속되고 있다'),
          pts: ['Port Said', 'Qantara', 'Ayun Musa'] },
        { d: '1956-11-05', cuts: [651], note: L('Sharm el-Sheikh falls and the whole peninsula is held; the Anglo-French paratroops land at Port Said the same morning', 'シャルム・エル・シェイクが陥落し半島全域が制圧される。同じ朝、英仏空挺部隊がポートサイドに降下する', 'Scharm el-Scheich fällt und die ganze Halbinsel ist besetzt; am selben Morgen landen britisch-französische Fallschirmjäger in Port Said', 'Шарм-эш-Шейх взят, весь полуостров занят; тем же утром англо-французский десант высаживается в Порт-Саиде', 'Sharm el-Sheij cae y toda la península queda ocupada; esa misma mañana los paracaidistas anglo-franceses aterrizan en Puerto Saíd', '沙姆沙伊赫陷落，整個半島被佔領；同日清晨英法傘兵在塞得港降落', '沙姆沙伊赫陷落，整个半岛被占领；同日清晨英法伞兵在塞得港降落', 'Charm el-Cheikh tombe et toute la péninsule est tenue ; le même matin, les parachutistes franco-britanniques se posent à Port-Saïd', '샤름엘셰이크가 함락되어 반도 전체가 점령된다. 같은 날 아침 영·프 공수부대가 포트사이드에 강하한다'),
          pts: ['Port Said', 'Qantara', 'Ayun Musa'] },
      ],
    },
    /* ══ 1967 ═════════════════════════════════════════════════════════════════════════════════
       ⚠ ONLY SINAI IS QUOTED, AND ONLY FOR FIVE DAYS. The West Bank changed hands on 7 June and the
       Golan on the 10th, and both are said by `control` and by the base map instead — the polygons
       those two fronts would have to cut stop existing on 9 June, and a front that outlives the
       entity it divides leaves a span nothing in the build can assert (#R409’s check ⑪). */
    {
      id: 'sinai67',
      name: L('Sinai, 1967', 'シナイ半島 1967', 'Sinai, 1967', 'Синай, 1967', 'Sinaí, 1967', '西奈半島 1967', '西奈半岛 1967', 'Sinaï, 1967', '시나이반도, 1967'),
      left: 'ARAB', right: 'ISRAEL',
      until: '1967-06-10',             /* the day CShapes moves the border itself */
      dates: [
        { d: '1967-06-05', cuts: [651], note: L('The air forces of Egypt, Syria and Jordan are destroyed on the ground in the first hours; by nightfall the armour is through at Rafah and Abu Ageila and into El Arish', '開戦から数時間でエジプト・シリア・ヨルダンの空軍が地上で撃破される。日没までに機甲部隊はラファとアブ・アゲイラを突破しエル・アリーシュへ入る', 'Die Luftwaffen Ägyptens, Syriens und Jordaniens werden in den ersten Stunden am Boden vernichtet; bis zum Abend sind die Panzer bei Rafah und Abu Agheila durch und in al-Arisch', 'Военно-воздушные силы Египта, Сирии и Иордании уничтожены на земле в первые часы; к вечеру бронетанковые части прорвались у Рафаха и Абу-Агейлы и вошли в Эль-Ариш', 'Las fuerzas aéreas de Egipto, Siria y Jordania son destruidas en tierra en las primeras horas; al anochecer los blindados han pasado por Rafah y Abu Agueila y entran en El Arish', '開戰數小時內埃及、敘利亞、約旦空軍在地面被摧毀；入夜前裝甲部隊已突破拉法與阿布阿格拉並進入阿里什', '开战数小时内埃及、叙利亚、约旦空军在地面被摧毁；入夜前装甲部队已突破拉法与阿布阿格拉并进入阿里什', 'Les aviations égyptienne, syrienne et jordanienne sont détruites au sol dès les premières heures ; à la tombée du jour les blindés ont percé à Rafah et Abou Agueila et entrent dans El-Arich', '개전 몇 시간 만에 이집트·시리아·요르단 공군이 지상에서 파괴된다. 해질녘 기갑부대는 라파와 아부아게일라를 돌파해 엘아리시로 들어간다'),
          pts: ['El Arish', 'Abu Ageila'] },
        { d: '1967-06-07', cuts: [651], note: L('The Egyptian army is ordered back across the canal and the passes at Mitla and Gidi are held against it', 'エジプト軍に運河西岸への後退命令が出され、ミトラとギディの両峠はその退路の上で押さえられる', 'Die ägyptische Armee erhält den Befehl, hinter den Kanal zurückzugehen; die Pässe von Mitla und Gidi werden ihr davor gesperrt', 'Египетской армии приказано отойти за канал, а перевалы Митла и Гиди перехвачены на её пути', 'Se ordena al ejército egipcio replegarse tras el canal y los pasos de Mitla y Gidi son tomados en su camino', '埃及軍奉命撤回運河以西，米特拉與吉迪兩處山口在其退路上被封鎖', '埃及军奉命撤回运河以西，米特拉与吉迪两处山口在其退路上被封锁', 'L’armée égyptienne reçoit l’ordre de repasser le canal et les cols de Mitla et de Gidi sont tenus sur son chemin', '이집트군에 운하 서안으로 후퇴하라는 명령이 내려지고, 미틀라와 기디 고개가 그 퇴로 위에서 봉쇄된다'),
          pts: ['Bir Gifgafa', 'Mitla Pass'] },
        { d: '1967-06-09', cuts: [651], note: L('The whole east bank of the canal is held and the canal is closed; it will not reopen for eight years', '運河東岸全域が制圧され、運河は閉鎖される。再開まで8年かかる', 'Das gesamte Ostufer des Kanals ist besetzt und der Kanal gesperrt; er wird acht Jahre lang nicht wieder geöffnet', 'Весь восточный берег канала занят, канал закрыт; он не откроется восемь лет', 'Toda la orilla oriental del canal queda ocupada y el canal se cierra; no volverá a abrirse en ocho años', '運河東岸全線被佔領，運河關閉，八年後才重新開放', '运河东岸全线被占领，运河关闭，八年后才重新开放', 'Toute la rive est du canal est tenue et le canal est fermé ; il ne rouvrira pas avant huit ans', '운하 동안 전역이 점령되고 운하는 폐쇄된다. 다시 열리기까지 8년이 걸린다'),
          pts: ['Port Said', 'Qantara', 'Ayun Musa'] },
      ],
    },
    /* ══ 1973 ═════════════════════════════════════════════════════════════════════════════════ */
    {
      id: 'suez73',
      name: L('The Suez Canal front, 1973', 'スエズ運河戦線 1973', 'Sueskanalfront, 1973', 'Фронт на Суэцком канале, 1973', 'Frente del canal de Suez, 1973', '蘇伊士運河戰線 1973', '苏伊士运河战线 1973', 'Front du canal de Suez, 1973', '수에즈 운하 전선, 1973'),
      /* ⚠ THE LINE IS DRAWN INSIDE ISRAEL’S OWN POLYGON. Since 1967 Sinai has been part of gw666, so
         the ground the Egyptian armies took on 6 October is Israeli-held ground being divided, and
         what the cut separates is the bridgehead east of the canal from the peninsula behind it. */
      left: 'ARAB', right: 'ISRAEL',
      dates: [
        { d: '1973-10-08', cuts: [666], note: L('Operation Badr: five divisions crossed the canal on 6 October, the Bar-Lev line is gone, and the Second and Third Armies hold two bridgeheads ten to fifteen kilometres deep on the east bank', 'バドル作戦——10月6日に5個師団が運河を渡り、バーレヴ線は崩壊。第2軍と第3軍が東岸に深さ10〜15キロの橋頭堡2つを保持する', 'Operation Badr: Am 6. Oktober überquerten fünf Divisionen den Kanal, die Bar-Lew-Linie ist zerschlagen, und die 2. und 3. Armee halten zwei zehn bis fünfzehn Kilometer tiefe Brückenköpfe am Ostufer', 'Операция «Бадр»: 6 октября канал форсировали пять дивизий, линия Бар-Лева уничтожена, 2-я и 3-я армии удерживают на восточном берегу два плацдарма глубиной десять — пятнадцать километров', 'Operación Badr: cinco divisiones cruzaron el canal el 6 de octubre, la línea Bar-Lev ha caído y los ejércitos Segundo y Tercero mantienen dos cabezas de puente de diez a quince kilómetros en la orilla oriental', '巴德爾行動：10月6日五個師渡過運河，巴列夫防線瓦解，第二、第三軍團在東岸保有兩處縱深十至十五公里的橋頭堡', '巴德尔行动：10月6日五个师渡过运河，巴列夫防线瓦解，第二、第三军团在东岸保有两处纵深十至十五公里的桥头堡', 'Opération Badr : cinq divisions ont franchi le canal le 6 octobre, la ligne Bar-Lev est tombée et les IIe et IIIe armées tiennent deux têtes de pont de dix à quinze kilomètres sur la rive est', '바드르 작전 — 10월 6일 5개 사단이 운하를 건너 바르레브 선이 무너지고, 제2군과 제3군이 동안에 깊이 10~15킬로미터의 교두보 두 곳을 확보한다'),
          pts: ['Baluza', 'Tasa', 'Ayun Musa'] },
        { d: '1973-10-24', cuts: [666], note: L('The ceasefire finds the two armies interlocked: the Egyptian bridgeheads stand on the east bank, and behind them an Israeli force that crossed at Deversoir on 16 October holds the west bank and has the Third Army encircled', '停戦時、両軍は互いに食い込んでいた。エジプト軍の橋頭堡は東岸にあり、その背後では10月16日にデヴェルソワールで渡河したイスラエル軍が西岸を押さえ、第3軍を包囲している', 'Der Waffenstillstand trifft die beiden Armeen ineinander verhakt an: die ägyptischen Brückenköpfe stehen am Ostufer, dahinter hält eine am 16. Oktober bei Deversoir übergesetzte israelische Truppe das Westufer und hat die 3. Armee eingeschlossen', 'Прекращение огня застаёт армии сцепленными: египетские плацдармы стоят на восточном берегу, а за ними израильские войска, переправившиеся 16 октября у Девер­суара, удерживают западный берег и окружили 3-ю армию', 'El alto el fuego encuentra a los dos ejércitos trabados: las cabezas de puente egipcias siguen en la orilla oriental y, tras ellas, una fuerza israelí que cruzó en Deversoir el 16 de octubre domina la orilla occidental y tiene cercado al Tercer Ejército', '停火時兩軍相互交錯：埃及橋頭堡仍在東岸，其後方由10月16日於代弗索瓦渡河的以色列部隊控制西岸，並包圍第三軍團', '停火时两军相互交错：埃及桥头堡仍在东岸，其后方由10月16日于代弗索瓦渡河的以色列部队控制西岸，并包围第三军团', 'Le cessez-le-feu surprend les deux armées imbriquées : les têtes de pont égyptiennes tiennent la rive est et, derrière elles, une force israélienne passée à Deversoir le 16 octobre tient la rive ouest et encercle la IIIe armée', '정전 시점에 두 군대는 서로 맞물려 있었다. 이집트 교두보는 동안에 있고, 그 배후에서 10월 16일 데베르수아르에서 도하한 이스라엘군이 서안을 장악하고 제3군을 포위하고 있다'),
          pts: ['Baluza', 'Tasa', 'Ayun Musa'] },
        { d: '1974-03-05', cuts: [666], note: L('The disengagement agreement of 18 January 1974 is carried out: Egypt keeps a strip on the east bank, a United Nations buffer zone lies behind it, and the canal is Egyptian again along its whole length', '1974年1月18日の兵力引き離し協定が実施される。エジプトは東岸に帯状の地域を保持し、その背後に国連の緩衝地帯が置かれ、運河は全長にわたり再びエジプトのものとなる', 'Das Truppenentflechtungsabkommen vom 18. Januar 1974 wird umgesetzt: Ägypten behält einen Streifen am Ostufer, dahinter liegt eine UN-Pufferzone, und der Kanal ist auf ganzer Länge wieder ägyptisch', 'Соглашение о разъединении войск от 18 января 1974 года выполнено: Египет сохраняет полосу на восточном берегу, за ней — буферная зона ООН, и канал по всей длине снова египетский', 'Se ejecuta el acuerdo de separación de fuerzas del 18 de enero de 1974: Egipto conserva una franja en la orilla oriental, tras ella queda una zona de separación de la ONU y el canal vuelve a ser egipcio en toda su longitud', '1974年1月18日的兵力脫離協議付諸執行：埃及保有東岸一條地帶，其後為聯合國緩衝區，運河全線重歸埃及', '1974年1月18日的兵力脱离协议付诸执行：埃及保有东岸一条地带，其后为联合国缓冲区，运河全线重归埃及', 'L’accord de désengagement du 18 janvier 1974 est appliqué : l’Égypte conserve une bande sur la rive est, une zone tampon des Nations unies s’étend derrière, et le canal redevient égyptien sur toute sa longueur', '1974년 1월 18일 병력 분리 협정이 이행된다. 이집트는 동안에 띠 모양의 지역을 유지하고 그 뒤에 유엔 완충지대가 놓이며, 운하는 전 구간이 다시 이집트의 것이 된다'),
          pts: ['Baluza', 'Tasa', 'Ayun Musa'] },
      ],
    },
    {
      id: 'golan73',
      name: L('The Golan front, 1973', 'ゴラン高原戦線 1973', 'Golanfront, 1973', 'Голанский фронт, 1973', 'Frente del Golán, 1973', '戈蘭高地戰線 1973', '戈兰高地战线 1973', 'Front du Golan, 1973', '골란고원 전선, 1973'),
      /* ⚠ THIS FRONT CHANGES WHICH COUNTRY IT DIVIDES. For four days it cuts Israel’s polygon, because
         the Golan has been inside it since 1967 and the Syrian attack is inside it too; from 11
         October the counter-offensive is over the 1967 line and the line divides Syria instead. */
      left: 'ISRAEL', right: 'ARAB',
      dates: [
        { d: '1973-10-07', cuts: [666], note: L('Two Syrian armoured divisions are across the 1967 line and the southern Golan is lost as far as the escarpment above the Jordan; the brigade command post at Nafah holds through the night', 'シリア軍の機甲2個師団が1967年の線を越え、南部ゴランはヨルダン渓谷を見下ろす断崖まで失われる。ナファハの旅団指揮所は一夜を持ちこたえる', 'Zwei syrische Panzerdivisionen stehen jenseits der Linie von 1967, der südliche Golan ist bis zum Steilabfall über dem Jordan verloren; der Brigadegefechtsstand in Nafah hält die Nacht durch', 'Две сирийские танковые дивизии перешли линию 1967 года, южный Голан потерян до обрыва над Иорданом; командный пункт бригады в Нафахе держится всю ночь', 'Dos divisiones acorazadas sirias han cruzado la línea de 1967 y el Golán meridional se pierde hasta el escarpe sobre el Jordán; el puesto de mando de brigada en Nafaj aguanta toda la noche', '兩個敘利亞裝甲師越過1967年線，南戈蘭失守至俯瞰約旦河的斷崖；納法赫的旅指揮所徹夜堅守', '两个叙利亚装甲师越过1967年线，南戈兰失守至俯瞰约旦河的断崖；纳法赫的旅指挥所彻夜坚守', 'Deux divisions blindées syriennes ont franchi la ligne de 1967 et le Golan méridional est perdu jusqu’à l’escarpement dominant le Jourdain ; le poste de commandement de brigade de Nafah tient toute la nuit', '시리아 기갑 2개 사단이 1967년 선을 넘어 남부 골란이 요르단강을 내려다보는 절벽까지 상실된다. 나파의 여단 지휘소는 밤새 버틴다'),
          pts: ['Quneitra', 'Rafid'] },
        { d: '1973-10-11', cuts: [652], note: L('The Golan has been retaken and the counter-offensive is over the 1967 line into Syria itself', 'ゴラン高原を奪回し、反攻は1967年の線を越えてシリア領内に入る', 'Der Golan ist zurückerobert und die Gegenoffensive steht jenseits der Linie von 1967 auf syrischem Boden', 'Голан отбит, и контрнаступление перешло линию 1967 года на собственно сирийскую территорию', 'El Golán ha sido recuperado y la contraofensiva pasa la línea de 1967 hacia el interior de Siria', '戈蘭高地已被奪回，反攻越過1967年線進入敘利亞本土', '戈兰高地已被夺回，反攻越过1967年线进入叙利亚本土', 'Le Golan est repris et la contre-offensive franchit la ligne de 1967 pour entrer en Syrie même', '골란고원을 되찾고 반격이 1967년 선을 넘어 시리아 본토로 들어간다'),
          pts: ['Beit Jinn', 'Sasa', 'Rafid'] },
        { d: '1973-10-24', cuts: [652], note: L('The ceasefire leaves a salient held in the Bashan, within artillery range of the Damascus road; it is given back at the disengagement of 31 May 1974, together with Quneitra', '停戦により、ダマスカス街道を砲撃圏に収めるバシャンの突出部が残る。これは1974年5月31日の兵力引き離しでクネイトラとともに返還される', 'Der Waffenstillstand hinterlässt einen gehaltenen Vorsprung im Baschan, in Artilleriereichweite der Straße nach Damaskus; er wird bei der Truppenentflechtung vom 31. Mai 1974 zusammen mit Quneitra zurückgegeben', 'Прекращение огня оставляет удерживаемый выступ в Башане, в пределах досягаемости артиллерии от дороги на Дамаск; он возвращён при разъединении войск 31 мая 1974 года вместе с Эль-Кунейтрой', 'El alto el fuego deja un saliente ocupado en Basán, al alcance de la artillería de la carretera de Damasco; se devuelve en la separación de fuerzas del 31 de mayo de 1974, junto con Quneitra', '停火後留下巴珊地區的一處突出部，砲兵可及大馬士革公路；該地連同庫奈特拉於1974年5月31日的兵力脫離中歸還', '停火后留下巴珊地区的一处突出部，炮兵可及大马士革公路；该地连同库奈特拉于1974年5月31日的兵力脱离中归还', 'Le cessez-le-feu laisse un saillant tenu dans le Bashan, à portée d’artillerie de la route de Damas ; il est rendu lors du désengagement du 31 mai 1974, avec Quneitra', '정전으로 바산 지역에 다마스쿠스 도로를 포병 사거리에 두는 돌출부가 남는다. 이 지역은 1974년 5월 31일 병력 분리에서 쿠네이트라와 함께 반환된다'),
          pts: ['Beit Jinn', 'Sasa', 'Rafid'] },
      ],
    },
  ],
  /* ⚠ NO OPERATION BELOW CARRIES A STRENGTH OR CASUALTY FIGURE, AND THAT IS A DECISION RATHER THAN A
     GAP. The two world-war layers quote figures where the standard reference works agree on one; for
     these four wars the published totals are contested by the parties themselves — the 1948 and 1967
     Arab casualty figures differ by whole multiples between sources, and several of the 1973 numbers
     were still classified when the standard accounts were written. A number in this table would look
     exactly as authoritative as the ones in the other layers, and it would not be. */
  events: [
    { d: '1948-05-14', at: 'Tel Aviv', wiki: 'Israeli_Declaration_of_Independence', kind: 'political', name: L('Israeli Declaration of Independence', 'イスラエル独立宣言', 'Israelische Unabhängigkeitserklärung', 'Провозглашение независимости Израиля', 'Declaración de independencia de Israel', '以色列獨立宣言', '以色列独立宣言', 'Déclaration d’indépendance d’Israël', '이스라엘 독립 선언') },
    { d: '1948-05-19', d2: '1948-05-28', at: 'Jerusalem', wiki: 'Battle_for_Jerusalem', kind: 'siege', name: L('The battle for Jerusalem and the fall of the Jewish Quarter', 'エルサレム攻防戦とユダヤ人地区の陥落', 'Die Schlacht um Jerusalem und der Fall des Jüdischen Viertels', 'Битва за Иерусалим и падение Еврейского квартала', 'La batalla por Jerusalén y la caída del Barrio Judío', '耶路撒冷之戰與猶太區陷落', '耶路撒冷之战与犹太区陷落', 'La bataille de Jérusalem et la chute du quartier juif', '예루살렘 전투와 유대인 지구 함락') },
    { d: '1948-05-24', d2: '1948-07-18', at: 'Latrun', wiki: 'Battles_of_Latrun_(1948)', kind: 'battle', name: L('Battles of Latrun', 'ラトルンの戦い', 'Schlachten um Latrun', 'Бои за Латрун', 'Batallas de Latrun', '拉特倫戰役', '拉特伦战役', 'Batailles de Latroun', '라트룬 전투') },
    { d: '1948-05-29', d2: '1948-06-03', at: 'Ashdod', wiki: 'Operation_Pleshet', kind: 'battle', name: L('Operation Pleshet — the Egyptian advance is halted at Isdud', 'プレシェト作戦——イスドゥードでエジプト軍の進撃が止まる', 'Operation Pleschet — der ägyptische Vormarsch wird bei Isdud gestoppt', 'Операция «Плешет» — египетское наступление остановлено у Исдуда', 'Operación Pléshet: el avance egipcio se detiene en Isdud', '普列謝特行動——埃及軍推進在伊斯杜德被阻', '普列谢特行动——埃及军推进在伊斯杜德被阻', 'Opération Pleshet — l’avance égyptienne est stoppée à Isdud', '플레셰트 작전 — 이스두드에서 이집트군의 진격이 멈춘다') },
    { d: '1948-06-11', d2: '1948-07-08', at: 'Rhodes', wiki: 'Truce_of_the_1948_Arab–Israeli_War', kind: 'political', name: L('The first truce, under Count Bernadotte', 'ベルナドッテ伯爵の下での第一次休戦', 'Der erste Waffenstillstand unter Graf Bernadotte', 'Первое перемирие под эгидой графа Бернадота', 'La primera tregua, bajo el conde Bernadotte', '貝納多特伯爵斡旋下的第一次停火', '贝纳多特伯爵斡旋下的第一次停火', 'La première trêve, sous l’égide du comte Bernadotte', '베르나도테 백작 중재의 제1차 정전') },
    { d: '1948-07-08', d2: '1948-07-18', at: 'Nazareth', wiki: 'Operation_Dekel', kind: 'battle', name: L('Operation Dekel — Nazareth and the lower Galilee', 'デケル作戦——ナザレと下ガリラヤ', 'Operation Dekel — Nazareth und Untergaliläa', 'Операция «Декель» — Назарет и Нижняя Галилея', 'Operación Dekel: Nazaret y la Baja Galilea', '德凱勒行動——拿撒勒與下加利利', '德凯勒行动——拿撒勒与下加利利', 'Opération Dekel — Nazareth et la Basse-Galilée', '데켈 작전 — 나사렛과 하부 갈릴리') },
    { d: '1948-07-09', d2: '1948-07-18', at: 'Lod', wiki: 'Operation_Danny', kind: 'battle', name: L('Operation Danny — Lydda and Ramle', 'ダニー作戦——リッダとラムラ', 'Operation Dani — Lydda und Ramle', 'Операция «Дани» — Лидда и Рамле', 'Operación Danny: Lida y Ramla', '丹尼行動——盧德與拉姆拉', '丹尼行动——卢德与拉姆拉', 'Opération Danny — Lydda et Ramleh', '다니 작전 — 리다와 람라') },
    { d: '1948-10-15', d2: '1948-10-22', at: 'Beersheba', wiki: 'Operation_Yoav', kind: 'battle', name: L('Operation Yoav — the Negev is opened and Beersheba taken', 'ヨアヴ作戦——ネゲヴへの道が開かれベエルシェバを占領', 'Operation Joav — der Negev wird geöffnet und Beerscheba genommen', 'Операция «Йоав» — открыт Негев и взята Беэр-Шева', 'Operación Yoav: se abre el Néguev y se toma Beerseba', '約亞夫行動——打通內蓋夫並攻下貝爾謝巴', '约亚夫行动——打通内盖夫并攻下贝尔谢巴', 'Opération Yoav — le Néguev est ouvert et Beersheba prise', '요아브 작전 — 네게브가 열리고 베르셰바가 함락된다') },
    { d: '1948-10-28', d2: '1948-10-31', at: 'Safed', wiki: 'Operation_Hiram', kind: 'battle', name: L('Operation Hiram — the upper Galilee', 'ヒラム作戦——上ガリラヤ', 'Operation Hiram — Obergaliläa', 'Операция «Хирам» — Верхняя Галилея', 'Operación Hiram: la Alta Galilea', '希蘭行動——上加利利', '希兰行动——上加利利', 'Opération Hiram — la Haute-Galilée', '히람 작전 — 상부 갈릴리') },
    { d: '1948-12-22', d2: '1949-01-07', at: 'Auja al-Hafir', wiki: 'Operation_Horev', kind: 'battle', name: L('Operation Horev — the Egyptians are driven out of the Negev', 'ホレヴ作戦——エジプト軍をネゲヴから駆逐', 'Operation Chorew — die Ägypter werden aus dem Negev vertrieben', 'Операция «Хорев» — египтяне вытеснены из Негева', 'Operación Horev: los egipcios son expulsados del Néguev', '霍列夫行動——將埃及軍逐出內蓋夫', '霍列夫行动——将埃及军逐出内盖夫', 'Opération Horev — les Égyptiens sont chassés du Néguev', '호레브 작전 — 이집트군을 네게브에서 몰아낸다') },
    { d: '1949-02-24', d2: '1949-07-20', at: 'Rhodes', wiki: '1949_Armistice_Agreements', kind: 'political', name: L('The 1949 Armistice Agreements — the Green Line', '1949年休戦協定——グリーンライン', 'Die Waffenstillstandsabkommen von 1949 — die Grüne Linie', 'Соглашения о перемирии 1949 года — «зелёная линия»', 'Los acuerdos de armisticio de 1949: la Línea Verde', '1949年停戰協定——綠線', '1949年停战协定——绿线', 'Les accords d’armistice de 1949 — la Ligne verte', '1949년 정전 협정 — 그린라인') },
    { d: '1949-03-05', d2: '1949-03-10', at: 'Eilat', wiki: 'Operation_Uvda', kind: 'battle', name: L('Operation Uvda — the southern Negev and the Gulf of Aqaba', 'ウヴダ作戦——南ネゲヴとアカバ湾', 'Operation Uwda — der südliche Negev und der Golf von Akaba', 'Операция «Увда» — южный Негев и залив Акаба', 'Operación Uvda: el Néguev meridional y el golfo de Áqaba', '烏夫達行動——南內蓋夫與亞喀巴灣', '乌夫达行动——南内盖夫与亚喀巴湾', 'Opération Uvda — le Néguev méridional et le golfe d’Aqaba', '우브다 작전 — 남부 네게브와 아카바만') },
    { d: '1955-02-28', at: 'Gaza', wiki: 'Operation_Black_Arrow', kind: 'battle', name: L('The Gaza raid — the reprisal operations begin', 'ガザ襲撃——報復作戦の始まり', 'Der Überfall auf Gaza — der Beginn der Vergeltungsoperationen', 'Рейд на Газу — начало операций возмездия', 'La incursión de Gaza: comienzan las operaciones de represalia', '加薩突襲——報復行動的開端', '加沙突袭——报复行动的开端', 'Le raid de Gaza — le début des opérations de représailles', '가자 습격 — 보복 작전의 시작') },
    { d: '1956-07-26', at: 'Alexandria', wiki: 'Suez_Crisis', kind: 'political', name: L('Nationalisation of the Suez Canal Company', 'スエズ運河会社の国有化', 'Verstaatlichung der Sueskanal-Gesellschaft', 'Национализация Компании Суэцкого канала', 'Nacionalización de la Compañía del Canal de Suez', '蘇伊士運河公司國有化', '苏伊士运河公司国有化', 'Nationalisation de la Compagnie du canal de Suez', '수에즈 운하 회사 국유화') },
    { d: '1956-10-29', d2: '1956-11-05', at: 'Mitla Pass', wiki: 'Suez_Crisis', kind: 'battle', name: L('The Sinai campaign — from the Mitla drop to Sharm el-Sheikh', 'シナイ作戦——ミトラ峠への降下からシャルム・エル・シェイクまで', 'Der Sinai-Feldzug — vom Absprung am Mitla-Pass bis Scharm el-Scheich', 'Синайская кампания — от десанта у Митлы до Шарм-эш-Шейха', 'La campaña del Sinaí: del salto de Mitla a Sharm el-Sheij', '西奈戰役——自米特拉空降至沙姆沙伊赫', '西奈战役——自米特拉空降至沙姆沙伊赫', 'La campagne du Sinaï — du largage de Mitla à Charm el-Cheikh', '시나이 전역 — 미틀라 강하부터 샤름엘셰이크까지') },
    { d: '1956-11-05', d2: '1956-11-07', at: 'Port Said', wiki: 'Operation_Musketeer_(1956)', kind: 'landing', name: L('Operation Musketeer — the Anglo-French landing at Port Said', 'マスケット銃兵作戦——英仏軍のポートサイド上陸', 'Operation Musketeer — die britisch-französische Landung in Port Said', 'Операция «Мушкетёр» — англо-французский десант в Порт-Саиде', 'Operación Mosquetero: el desembarco anglo-francés en Puerto Saíd', '火槍手行動——英法軍在塞得港登陸', '火枪手行动——英法军在塞得港登陆', 'Opération Mousquetaire — le débarquement franco-britannique à Port-Saïd', '머스킷티어 작전 — 영·프군의 포트사이드 상륙') },
    { d: '1957-03-08', at: 'Gaza', wiki: 'United_Nations_Emergency_Force', kind: 'political', name: L('The withdrawal is completed and the United Nations Emergency Force takes over Gaza and Sharm el-Sheikh', '撤退が完了し、国連緊急軍がガザとシャルム・エル・シェイクを引き継ぐ', 'Der Rückzug ist abgeschlossen und die UN-Notstandstruppe übernimmt Gaza und Scharm el-Scheich', 'Вывод войск завершён, и Чрезвычайные вооружённые силы ООН принимают Газу и Шарм-эш-Шейх', 'Se completa la retirada y la Fuerza de Emergencia de las Naciones Unidas se hace cargo de Gaza y Sharm el-Sheij', '撤軍完成，聯合國緊急部隊接管加薩與沙姆沙伊赫', '撤军完成，联合国紧急部队接管加沙与沙姆沙伊赫', 'Le retrait est achevé et la Force d’urgence des Nations unies prend en charge Gaza et Charm el-Cheikh', '철수가 완료되고 유엔 긴급군이 가자와 샤름엘셰이크를 인수한다') },
    { d: '1967-05-22', at: 'Sharm el-Sheikh', wiki: 'Straits_of_Tiran', kind: 'political', name: L('The Straits of Tiran are closed to Israeli shipping', 'ティラン海峡がイスラエル船舶に対して封鎖される', 'Die Straße von Tiran wird für israelische Schiffe gesperrt', 'Тиранский пролив закрыт для израильского судоходства', 'Se cierra el estrecho de Tirán a la navegación israelí', '蒂朗海峽對以色列船運關閉', '蒂朗海峡对以色列船运关闭', 'Le détroit de Tiran est fermé à la navigation israélienne', '티란 해협이 이스라엘 선박에 봉쇄된다') },
    { d: '1967-06-05', at: 'Cairo', wiki: 'Operation_Focus', kind: 'air', name: L('Operation Focus — the Arab air forces are destroyed on the ground', 'フォーカス作戦——アラブ諸国空軍が地上で撃破される', 'Operation Fokus — die arabischen Luftwaffen werden am Boden vernichtet', 'Операция «Мокед» — арабские ВВС уничтожены на земле', 'Operación Foco: las fuerzas aéreas árabes son destruidas en tierra', '焦點行動——阿拉伯各國空軍在地面被摧毀', '焦点行动——阿拉伯各国空军在地面被摧毁', 'Opération Focus — les aviations arabes sont détruites au sol', '포커스 작전 — 아랍 공군이 지상에서 파괴된다') },
    { d: '1967-06-06', at: 'Jerusalem', wiki: 'Battle_of_Ammunition_Hill', kind: 'battle', name: L('The battle of Ammunition Hill and the taking of East Jerusalem', '弾薬庫の丘の戦いと東エルサレム占領', 'Die Schlacht um den Munitionshügel und die Einnahme Ostjerusalems', 'Бой на Оружейной высоте и взятие Восточного Иерусалима', 'La batalla de la Colina de las Municiones y la toma de Jerusalén Este', '彈藥山之戰與東耶路撒冷的攻佔', '弹药山之战与东耶路撒冷的攻占', 'La bataille de la colline des Munitions et la prise de Jérusalem-Est', '탄약고 언덕 전투와 동예루살렘 점령') },
    { d: '1967-06-08', at: 'El Arish', wiki: 'USS_Liberty_incident', kind: 'naval', name: L('The USS Liberty incident', 'リバティー号事件', 'Der Zwischenfall um die USS Liberty', 'Инцидент с «Либерти»', 'El incidente del USS Liberty', 'USS「自由號」事件', 'USS“自由号”事件', 'L’affaire de l’USS Liberty', 'USS 리버티호 사건') },
    { d: '1967-06-09', d2: '1967-06-10', at: 'Quneitra', wiki: 'Six-Day_War', kind: 'battle', name: L('The escarpment is climbed and the Golan Heights taken', '断崖を登攻してゴラン高原を占領', 'Der Steilhang wird erstürmt und die Golanhöhen genommen', 'Штурм обрыва и захват Голанских высот', 'Se asalta el escarpe y se toman los Altos del Golán', '攀上斷崖攻佔戈蘭高地', '攀上断崖攻占戈兰高地', 'L’escarpement est escaladé et le plateau du Golan est pris', '절벽을 올라 골란고원을 점령한다') },
    { d: '1967-11-22', at: 'New York', wiki: 'United_Nations_Security_Council_Resolution_242', kind: 'political', name: L('Security Council Resolution 242', '国連安保理決議242', 'Resolution 242 des UN-Sicherheitsrats', 'Резолюция Совета Безопасности ООН 242', 'Resolución 242 del Consejo de Seguridad', '聯合國安理會第242號決議', '联合国安理会第242号决议', 'Résolution 242 du Conseil de sécurité', '유엔 안보리 결의 242호') },
    { d: '1968-03-21', at: 'Karameh', wiki: 'Battle_of_Karameh', kind: 'battle', name: L('The battle of Karameh', 'カラメの戦い', 'Die Schlacht von Karama', 'Бой при Карама', 'La batalla de Karameh', '卡拉梅之戰', '卡拉梅之战', 'La bataille de Karameh', '카라메 전투') },
    { d: '1969-03-08', d2: '1970-08-07', at: 'Ismailia', wiki: 'War_of_Attrition', kind: 'battle', name: L('The War of Attrition along the canal', '運河沿いの消耗戦争', 'Der Abnutzungskrieg am Kanal', 'Война на истощение вдоль канала', 'La Guerra de Desgaste a lo largo del canal', '運河沿線的消耗戰爭', '运河沿线的消耗战争', 'La guerre d’usure le long du canal', '운하 연변의 소모 전쟁') },
    { d: '1973-10-06', d2: '1973-10-09', at: 'Qantara', wiki: 'Operation_Badr_(1973)', kind: 'battle', name: L('Operation Badr — the crossing of the Suez Canal', 'バドル作戦——スエズ運河渡河', 'Operation Badr — die Überquerung des Sueskanals', 'Операция «Бадр» — форсирование Суэцкого канала', 'Operación Badr: el cruce del canal de Suez', '巴德爾行動——強渡蘇伊士運河', '巴德尔行动——强渡苏伊士运河', 'Opération Badr — la traversée du canal de Suez', '바드르 작전 — 수에즈 운하 도하') },
    { d: '1973-10-06', d2: '1973-10-10', at: 'Nafah', wiki: 'Yom_Kippur_War', kind: 'battle', name: L('The Syrian offensive on the Golan and the counter-attack that retakes it', 'ゴラン高原へのシリア軍攻勢と、それを奪回する反撃', 'Die syrische Offensive auf dem Golan und der Gegenangriff, der ihn zurückgewinnt', 'Сирийское наступление на Голанах и контрудар, вернувший их', 'La ofensiva siria en el Golán y el contraataque que lo recupera', '敘利亞軍對戈蘭高地的攻勢與奪回該地的反擊', '叙利亚军对戈兰高地的攻势与夺回该地的反击', 'L’offensive syrienne sur le Golan et la contre-attaque qui le reprend', '골란고원에 대한 시리아군 공세와 이를 되찾은 반격') },
    { d: '1973-10-15', d2: '1973-10-17', at: 'Deversoir', wiki: 'Battle_of_the_Chinese_Farm', kind: 'battle', name: L('The battle of the Chinese Farm — the corridor to the canal crossing', '中国農場の戦い——運河渡河点への回廊', 'Die Schlacht um die Chinesische Farm — der Korridor zum Kanalübergang', 'Бой у «Китайской фермы» — коридор к месту переправы', 'La batalla de la Granja China: el corredor hacia el paso del canal', '中國農場之戰——通往渡河點的走廊', '中国农场之战——通往渡河点的走廊', 'La bataille de la Ferme chinoise — le corridor vers le point de franchissement', '중국 농장 전투 — 도하 지점으로 가는 회랑') },
    { d: '1973-10-22', at: 'New York', wiki: 'United_Nations_Security_Council_Resolution_338', kind: 'political', name: L('Security Council Resolution 338', '国連安保理決議338', 'Resolution 338 des UN-Sicherheitsrats', 'Резолюция Совета Безопасности ООН 338', 'Resolución 338 del Consejo de Seguridad', '聯合國安理會第338號決議', '联合国安理会第338号决议', 'Résolution 338 du Conseil de sécurité', '유엔 안보리 결의 338호') },
    { d: '1973-10-24', d2: '1973-10-25', at: 'Suez', wiki: 'Battle_of_Suez', kind: 'battle', name: L('The battle of Suez and the encirclement of the Third Army', 'スエズ市の戦いと第3軍の包囲', 'Die Schlacht um Sues und die Einkesselung der 3. Armee', 'Бой за Суэц и окружение 3-й армии', 'La batalla de Suez y el cerco del Tercer Ejército', '蘇伊士市之戰與第三軍團被圍', '苏伊士市之战与第三军团被围', 'La bataille de Suez et l’encerclement de la IIIe armée', '수에즈시 전투와 제3군 포위') },
    { d: '1973-12-21', at: 'Geneva', wiki: 'Geneva_Conference_(1973)', kind: 'conference', name: L('The Geneva Conference on the Middle East', '中東和平ジュネーヴ会議', 'Die Genfer Nahostkonferenz', 'Женевская конференция по Ближнему Востоку', 'La Conferencia de Ginebra sobre Oriente Medio', '中東問題日內瓦會議', '中东问题日内瓦会议', 'La conférence de Genève sur le Proche-Orient', '중동 문제 제네바 회의') },
    { d: '1974-01-18', at: 'Ismailia', wiki: 'Yom_Kippur_War', kind: 'political', name: L('The Sinai disengagement agreement', 'シナイ半島兵力引き離し協定', 'Das Truppenentflechtungsabkommen für den Sinai', 'Соглашение о разъединении войск на Синае', 'El acuerdo de separación de fuerzas en el Sinaí', '西奈兵力脫離協議', '西奈兵力脱离协议', 'L’accord de désengagement du Sinaï', '시나이 병력 분리 협정') },
    { d: '1974-05-31', at: 'Quneitra', wiki: 'Yom_Kippur_War', kind: 'political', name: L('The Golan disengagement agreement — Quneitra is returned to Syria', 'ゴラン高原兵力引き離し協定——クネイトラがシリアへ返還される', 'Das Truppenentflechtungsabkommen für den Golan — Quneitra wird an Syrien zurückgegeben', 'Соглашение о разъединении войск на Голанах — Эль-Кунейтра возвращена Сирии', 'El acuerdo de separación de fuerzas en el Golán: Quneitra vuelve a Siria', '戈蘭兵力脫離協議——庫奈特拉歸還敘利亞', '戈兰兵力脱离协议——库奈特拉归还叙利亚', 'L’accord de désengagement du Golan — Quneitra est rendue à la Syrie', '골란 병력 분리 협정 — 쿠네이트라가 시리아에 반환된다') },
  ],
};

export { MIDEAST };
