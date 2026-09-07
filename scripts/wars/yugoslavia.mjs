/* ============================================================================
 *  IntMap · THE YUGOSLAV WARS, 1991–2001 — the curated record   (#R525)
 * ----------------------------------------------------------------------------
 *  The rules every row here obeys — what `control`, `fronts` and `events` are each allowed to claim,
 *  and why a day nobody wrote down gets no line — are stated once, in ./lang.mjs. This header only
 *  records the three things that are peculiar to THIS war and that a later round must not undo.
 *
 *  ══ ① THE COUNTRIES ARRIVE LATE, AND THE FIRST TEN MONTHS HAPPEN ON ONE POLYGON ══════════════
 *  CShapes 2.0 gives the constituent republics outlines on the day they were RECOGNISED, not on the
 *  day they declared independence. Measured against data/cshapes.js:
 *      · Yugoslavia (345)  … 1991-11-19 │ 1991-11-20 … 1992-04-26 │ 1992-04-27 … 2006-06-02
 *      · Croatia (344), Bosnia-Herzegovina (346), Slovenia (349) … all from 1992-04-27
 *      · Macedonia (343) from 1991-11-20 · Kosovo (347) only from 2008-02-20
 *  So the Ten-Day War in Slovenia and the whole of the 1991 war in Croatia happen INSIDE the single
 *  polygon 345, and from 1992-04-27 that same gwcode is the rump Federal Republic of Yugoslavia —
 *  Serbia and Montenegro — while Croatia and Bosnia become polygons of their own.
 *
 *  ══ ② …AND THAT IS WHY 1991 IS CONTESTED RATHER THAN CUT ════════════════════════════════════
 *  ⚠ THE RECORD GIVES LINES FOR CROATIA IN 1991, AND THIS FILE STILL DOES NOT DRAW THEM, FOR A
 *  GEOMETRIC REASON RATHER THAN A HISTORICAL ONE. A front line cuts the WHOLE entity it is given,
 *  and until 27 April 1992 the entity containing the Croatian front is all of Yugoslavia. The
 *  Krajina front's inland end rests on the Bosnian border, which in 1991 is not a border at all but
 *  a line inside 345: extend the cut to where it has to reach and the far side of it is Bosnia,
 *  Serbia, Montenegro and Kosovo, all painted as one army's ground. That would be a much larger
 *  claim than the record makes — Bosnia in 1991 was at peace and governed from Sarajevo — so the
 *  ten months are stated the way ./lang.mjs says to state them: control divided, and this file does
 *  not pretend to know where. The fighting of those months is in `events`, with its real dates.
 *  From 27 April 1992 Croatia is its own polygon and the three UNPA sectors are drawn as lines.
 *
 *  ══ ③ WHAT MAY BE CALLED AN ATROCITY ════════════════════════════════════════════════════════
 *  ⚠ ONLY WHAT AN ICTY JUDGMENT ESTABLISHED, AND NEVER A CONTESTED ALLEGATION. Every `atrocity`
 *  row below names a fact a Trial or Appeals Chamber of the International Criminal Tribunal for the
 *  former Yugoslavia found proven: Srebrenica (Krstić, Popović et al. — genocide), Ovčara (Mrkšić
 *  et al.), the Prijedor camps (Tadić, Stakić, Kvočka et al.), Foča (Kunarac et al.), Ahmići
 *  (Blaškić, Kupreškić et al.) and the deportation of Kosovo Albanians (Šainović et al., Đorđević).
 *  ⚠ AND THE RULE CUTS BOTH WAYS, WHICH IS THE POINT OF HAVING IT. Operation Storm is recorded as a
 *  battle and NOT as an atrocity, because the ICTY Appeals Chamber acquitted Gotovina and Markač in
 *  2012; the killings that followed it are the subject of national proceedings, not of a Tribunal
 *  finding, and this file does not upgrade an allegation into a fact because it is widely believed.
 *
 *  ══ ④ THE NAMES ═════════════════════════════════════════════════════════════════════════════
 *  Where the parties use different names for the same war, the name used here is the one the
 *  scholarly literature uses in each of the nine languages — «the war in Croatia», not either
 *  side's own term for it. `wiki` is a link target and is spelled the way the English Wikipedia
 *  spells its article title; it is not the name the reader is shown.
 * ==========================================================================*/
import { L, F_WW1 } from './lang.mjs';

/* ── the sides ──────────────────────────────────────────────────────────────────────────────────
   ⚠ SIX ROWS, AND THE COLOURS CARRY NO VERDICT. This is not a war with two coalitions, so the
   palette cannot be read the way a two-sided war's is — and the app's own history is what makes
   that safe to say: #4a7fbd is the Allies in both world wars and #b4544a is the Central Powers in
   one and the Axis in the other, so neither colour is this application's «good» or «bad» side.
   The three belligerent colours are of comparable weight — a mid red, a mid blue and a mid green,
   all at similar saturation — and the two colours that DO carry a meaning are kept for what they
   mean everywhere else in this layer: amber is «control divided» and grey is «not a party to this
   war». ⚠ NO PARTY IS GIVEN GREY OR BLACK. The one deliberately unbright colour in the whole
   layer is `atrocity` in ./lang.mjs's KINDS table, and it marks an event, never a people.
   The violet of INTL is chosen against the other five rather than for its own sake: it is the one
   hue left that neither of the two neighbouring fills can be confused with where it actually
   appears — beside blue Croatia in eastern Slavonia, and beside red Serbia in Kosovo.
   ⚠ THE HVO IS NAMED IN TWO ROWS BECAUSE IT FOUGHT ON TWO SIDES. Croat forces in Bosnia were
   allied with the Bosnian government in 1992, at war with it through 1993, and inside the
   Federation with it from the Washington Agreement of 18 March 1994 onwards. A record that named
   it once would have to be wrong about one of those years. */
const F_YUGOSLAVIA = {
  SERB: { col: '#b4544a', name: L('Serb forces (JNA, RSK, VRS)', 'セルビア側部隊（JNA・RSK・VRS）', 'Serbische Verbände (JVA, RSK, VRS)', 'Сербские силы (ЮНА, РСК, ВРС)', 'Fuerzas serbias (JNA, RSK, VRS)', '塞爾維亞方部隊（南人民軍、克拉伊納、塞族共和國軍）', '塞尔维亚方部队（南人民军、克拉伊纳、塞族共和国军）', 'Forces serbes (JNA, RSK, VRS)', '세르비아계 부대(JNA·RSK·VRS)') },
  CROAT: { col: '#4a7fbd', name: L('Croatian forces (HV, HVO)', 'クロアチア側部隊（HV・HVO）', 'Kroatische Verbände (HV, HVO)', 'Хорватские силы (ХВ, ХВО)', 'Fuerzas croatas (HV, HVO)', '克羅埃西亞方部隊（HV、HVO）', '克罗地亚方部队（HV、HVO）', 'Forces croates (HV, HVO)', '크로아티아계 부대(HV·HVO)') },
  ARBIH: { col: '#4f9a6a', name: L('Bosnian government and the Federation (ARBiH, HVO)', 'ボスニア政府・ボスニア連邦（ARBiH／HVO）', 'Bosnische Regierung und die Föderation (ARBiH, HVO)', 'Правительство Боснии и Федерация (АРБиГ, ХВО)', 'Gobierno bosnio y la Federación (ARBiH, HVO)', '波士尼亞政府與聯邦（ARBiH、HVO）', '波斯尼亚政府与联邦（ARBiH、HVO）', 'Gouvernement bosnien et la Fédération (ARBiH, HVO)', '보스니아 정부와 연방(ARBiH·HVO)') },
  INTL: { col: '#7d63ab', name: L('UN and NATO administration (UNTAES, KFOR)', '国連・NATO の暫定統治（UNTAES／KFOR）', 'UN- und NATO-Verwaltung (UNTAES, KFOR)', 'Администрация ООН и НАТО (ВАООНВС, СДК)', 'Administración de la ONU y la OTAN (UNTAES, KFOR)', '聯合國與北約的過渡管理（UNTAES、KFOR）', '联合国与北约的过渡管理（UNTAES、KFOR）', 'Administration de l’ONU et de l’OTAN (ATNUSO, KFOR)', '유엔·NATO 과도 행정(UNTAES·KFOR)') },
  /* the two rows whose meaning is the same in every war this layer draws, taken from where they are
     already written rather than translated a third time */
  CONTESTED: { col: '#c9963c', name: F_WW1.CONTESTED.name },
  NEUTRAL: { col: '#9aa1a8', name: F_WW1.NEUTRAL.name },
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE YUGOSLAV WARS · 25 June 1991 — 13 August 2001
 * ════════════════════════════════════════════════════════════════════════════════════════════ */
const YUGOSLAVIA = {
  id: 'yugoslavia',
  name: L('Yugoslav Wars', 'ユーゴスラビア紛争', 'Jugoslawienkriege', 'Югославские войны', 'Guerras Yugoslavas', '南斯拉夫戰爭', '南斯拉夫战争', 'Guerres de Yougoslavie', '유고슬라비아 전쟁'),
  from: '1991-06-25', to: '2001-08-13',
  factions: F_YUGOSLAVIA,
  /* ⚠ [date, place, the faction that held it] — THE ONLY CHECK THAT CAN TELL A FRONT DRAWN
     CORRECTLY FROM ONE DRAWN BACK TO FRONT. Every dated line below carries a pair, one town from
     each side, and none of them is an anchor OF the line it checks: a cut passes exactly through
     its own anchors, so an anchor answers whichever side the arithmetic lands on.
     ⚠ AND WHERE THREE SIDES DIVIDE ONE COUNTRY, ALL THREE ARE NAMED. Croatia in 1993 is cut by
     three lines at once and Croatia in 1996 carries two factions plus the international
     administration; a check per line would have proved each line and still allowed the country as
     a whole to be wrong. */
  checks: [
    /* ── 1991: one polygon, and the claim is that the map does NOT divide it ─────────────────── */
    ['1991-10-01', 'Belgrade', 'CONTESTED'], ['1991-10-01', 'Zagreb', 'CONTESTED'],
    ['1991-10-01', 'Ljubljana', 'CONTESTED'],
    /* ── Croatia, 1992–95: three lines, and the country outside all of them ──────────────────── */
    /* ⚠ Šibenik and Sinj rather than Zadar and Split: CShapes' Dalmatian coastline is simplified
       and both of the bigger cities' own coordinates fall just outside the polygon, where the
       resolver answers «no entity» instead of a faction. These two are inland and say the same. */
    ['1993-06-01', 'Knin', 'SERB'], ['1993-06-01', 'Sibenik', 'CROAT'],
    ['1993-06-01', 'Sinj', 'CROAT'], ['1993-06-01', 'Zagreb', 'CROAT'],
    ['1993-06-01', 'Okucani', 'SERB'], ['1993-06-01', 'Daruvar', 'CROAT'],
    ['1993-06-01', 'Vukovar', 'SERB'], ['1993-06-01', 'Djakovo', 'CROAT'],
    /* Operation Flash takes Sector West on 1–2 May 1995: the same town, eight weeks later */
    ['1995-06-01', 'Okucani', 'CROAT'],
    /* Operation Storm takes Krajina on 4–7 August 1995; eastern Slavonia is still held */
    ['1995-09-01', 'Knin', 'CROAT'], ['1995-09-01', 'Vukovar', 'SERB'],
    /* UNTAES, 15 January 1996 — and Croatia whole again after 15 January 1998 */
    ['1996-06-01', 'Vukovar', 'INTL'], ['1996-06-01', 'Djakovo', 'CROAT'],
    ['1996-06-01', 'Zagreb', 'CROAT'],
    ['1999-01-01', 'Vukovar', 'CROAT'],
    /* ── Bosnia: contested until Dayton, divided by the IEBL after it ────────────────────────── */
    ['1993-06-01', 'Sarajevo', 'CONTESTED'], ['1993-06-01', 'Mostar', 'CONTESTED'],
    ['1994-06-01', 'Banja Luka', 'CONTESTED'],
    ['1996-06-01', 'Banja Luka', 'SERB'], ['1996-06-01', 'Prijedor', 'SERB'],
    ['1996-06-01', 'Bijeljina', 'SERB'], ['1996-06-01', 'Srebrenica', 'SERB'],
    ['1996-06-01', 'Sarajevo', 'ARBIH'], ['1996-06-01', 'Tuzla', 'ARBIH'],
    ['1996-06-01', 'Zenica', 'ARBIH'], ['1996-06-01', 'Bihac', 'ARBIH'],
    ['1996-06-01', 'Mostar', 'ARBIH'],
    /* ── Serbia and Montenegro, and the boundary of Kosovo ───────────────────────────────────── */
    ['1994-01-01', 'Belgrade', 'SERB'],
    ['1998-06-01', 'Pristina', 'CONTESTED'], ['1998-06-01', 'Prizren', 'CONTESTED'],
    ['1998-06-01', 'Belgrade', 'SERB'], ['1998-06-01', 'Podgorica', 'SERB'],
    ['2000-06-01', 'Pristina', 'INTL'], ['2000-06-01', 'Prizren', 'INTL'],
    ['2000-06-01', 'Nis', 'SERB'], ['2000-06-01', 'Podgorica', 'SERB'],
    /* ── the two republics that leave the war, and the one that has its own ──────────────────── */
    ['1996-06-01', 'Ljubljana', 'NEUTRAL'], ['2000-06-01', 'Ljubljana', 'NEUTRAL'],
    ['1996-06-01', 'Skopje', 'NEUTRAL'],
    ['2001-05-01', 'Skopje', 'CONTESTED'], ['2001-05-01', 'Tetovo', 'CONTESTED'],
  ],
  /* gwcode → [[date, faction], …]. A country absent from this table is neutral for the whole war. */
  control: {
    /* Yugoslavia — ⚠ THE TWO ROWS ARE TWO DIFFERENT COUNTRIES UNDER ONE GWCODE (see ② above).
       Until 26 April 1992 the polygon is the federation itself, and «control divided» is the whole
       of what this file will say about it: Slovenia fought for ten days and left, Croatia was at
       war from the summer, Bosnia was not yet, and no single line separates any of that. From
       27 April 1992 the same gwcode is the rump Federal Republic of Yugoslavia — Serbia and
       Montenegro — which is one state under one government, and the war it is in is fought inside
       Kosovo, where the line below puts it. */
    345: [['1991-06-25', 'CONTESTED'], ['1992-04-27', 'SERB']],
    /* Croatia — the republic whose government held Zagreb throughout. What the three fronts below
       take away from it is stated by the fronts; this row is what is left. */
    344: [['1992-04-27', 'CROAT']],
    /* Bosnia and Herzegovina — ⚠ CONTESTED FOR THREE YEARS AND EIGHT MONTHS, AND THAT IS THE
       FINDING, NOT A GAP IN THE READING. The spring of 1992 has no quotable line because the
       takeover came from every direction at once; 1993 has none because the Croat–Bosniak war ran
       through the middle of the ground the Bosnian government and the VRS were already dividing,
       and the confrontation line was a thousand kilometres of pockets, corridors and enclaves that
       moved every week. The maps that exist for those years are maps of PROPOSALS — Vance-Owen,
       the Contact Group plan — and a proposal is not control. The first line the record states as
       an agreed division of this country is Dayton's, and it is drawn from the day it was signed. */
    346: [['1992-04-27', 'CONTESTED']],
    /* Macedonia — the one conflict of these ten years that this file can only state as a whole
       country. The National Liberation Army held villages in the northwest from the attack on the
       Tearce police station on 22 January 2001; there was never a front between two armies, and
       nothing in the record draws one. The Ohrid Framework Agreement of 13 August 2001 ends it. */
    343: [['2001-01-22', 'CONTESTED'], ['2001-08-13', 'NEUTRAL']],
    /* ⚠ SLOVENIA (349) IS DELIBERATELY ABSENT, WHICH IS THE SAME AS NEUTRAL. It gets its own
       polygon on 27 April 1992, and by then it had been out of the fighting for nine months — the
       JNA's last soldier left on 26 October 1991. The ten days it did fight are inside 345 above,
       where they belong. */
  },
  fronts: [
    /* ── CROATIA, three lines, because the Serb-held ground was three separated blocks ─────────
       ⚠ ONE LINE COULD NOT HAVE DRAWN THIS AND THE FAILURE WOULD HAVE BEEN INVISIBLE. Croatia is a
       horseshoe around Bosnia and the UNPA sectors sat in three different parts of it: Krajina and
       Lika along the Bosnian border in the west, a small enclave in western Slavonia, and eastern
       Slavonia with Baranja in the far east. A single chord separating «Serb-held» from
       «Croat-held» would have put Split and Dubrovnik on the wrong side of itself. Each line below
       enters the country at one border and leaves it at another, and js/war-geom.js's rule — the
       NEAREST line decides a place's colour — is what keeps the three from contradicting one
       another a hundred kilometres away. */
    {
      id: 'hr-krajina',
      name: L('Croatia — Krajina and Lika (UNPA Sectors North and South)', 'クロアチア——クライナとリカ（UNPA 北・南セクター）', 'Kroatien — Krajina und Lika (UNPA-Sektoren Nord und Süd)', 'Хорватия — Краина и Лика (секторы ООН «Север» и «Юг»)', 'Croacia: Krajina y Lika (sectores Norte y Sur de las UNPA)', '克羅埃西亞——克拉伊納與利卡（聯合國保護區北區、南區）', '克罗地亚——克拉伊纳与利卡（联合国保护区北区、南区）', 'Croatie — Krajina et Lika (secteurs Nord et Sud des ZPNU)', '크로아티아 — 크라이나와 리카(UNPA 북부·남부 구역)'),
      left: 'CROAT', right: 'SERB',
      dates: [
        { d: '1992-04-27', cuts: [344],
          note: L('The line where the fighting stopped under the Sarajevo Agreement of 2 January 1992, held by UNPROFOR as Sectors North and South — drawn from the first day Croatia is a country of its own', '1992年1月2日のサラエヴォ協定で戦闘が止まった線。UNPROFOR が「北」「南」両セクターとして管理した——クロアチアが独立した国の輪郭を持つ最初の日から描く', 'Die Linie, an der die Kämpfe nach dem Abkommen von Sarajevo vom 2. Januar 1992 zum Stehen kamen, von der UNPROFOR als Sektoren Nord und Süd gehalten — gezeichnet ab dem ersten Tag, an dem Kroatien ein eigener Staat ist', 'Линия, на которой бои прекратились по Сараевскому соглашению от 2 января 1992 года; СООНО удерживали её как секторы «Север» и «Юг» — показана с первого дня, когда Хорватия существует как отдельное государство', 'La línea en la que se detuvieron los combates por el Acuerdo de Sarajevo del 2 de enero de 1992, mantenida por UNPROFOR como sectores Norte y Sur; se dibuja desde el primer día en que Croacia es un país propio', '依 1992 年 1 月 2 日《薩拉熱窩協定》停火所形成的界線，由聯合國保護部隊作為北區與南區看守——自克羅埃西亞成為獨立國家輪廓的第一天起繪出', '依 1992 年 1 月 2 日《萨拉热窝协定》停火所形成的界线，由联合国保护部队作为北区与南区看守——自克罗地亚成为独立国家轮廓的第一天起绘出', 'La ligne où les combats se sont arrêtés en vertu de l’accord de Sarajevo du 2 janvier 1992, tenue par la FORPRONU comme secteurs Nord et Sud — tracée dès le premier jour où la Croatie est un pays distinct', '1992년 1월 2일 사라예보 협정으로 전투가 멈춘 선. UNPROFOR가 북부·남부 구역으로 관리했다 — 크로아티아가 독자적인 국가 윤곽을 갖는 첫날부터 그린다'),
          pts: ['Kozarska Dubica', 'Sisak', 'Karlovac', 'Ogulin', 'Otocac', 'Gospic', 'Benkovac', 'Drnis', 'Vrlika', 'Livno'] },
        { d: '1995-08-07', cuts: [], pts: [],
          note: L('Operation Storm has ended: there is no longer a line here, and Croatia is whole from the Bosnian border to the sea', '「嵐作戦」が終わり、ここにはもう線が無い。クロアチアはボスニア国境から海まで一つに戻った', 'Die Operation Sturm ist beendet: hier verläuft keine Linie mehr, Kroatien ist von der bosnischen Grenze bis zum Meer wieder ganz', 'Операция «Буря» завершена: линии здесь больше нет, и Хорватия снова цела от боснийской границы до моря', 'La Operación Tormenta ha terminado: aquí ya no hay línea, y Croacia vuelve a ser una desde la frontera bosnia hasta el mar', '「風暴行動」結束，此處已無戰線，克羅埃西亞自波士尼亞邊界至海岸重歸完整', '“风暴行动”结束，此处已无战线，克罗地亚自波斯尼亚边界至海岸重归完整', 'L’opération Tempête est terminée : il n’y a plus de ligne ici, et la Croatie est d’un seul tenant de la frontière bosnienne à la mer', '‘폭풍 작전’이 끝나 이곳에는 더 이상 선이 없다. 크로아티아는 보스니아 국경에서 바다까지 다시 하나가 되었다') },
      ],
    },
    {
      id: 'hr-slavonia-west',
      name: L('Croatia — western Slavonia (UNPA Sector West)', 'クロアチア——西スラヴォニア（UNPA 西セクター）', 'Kroatien — Westslawonien (UNPA-Sektor West)', 'Хорватия — Западная Славония (сектор ООН «Запад»)', 'Croacia: Eslavonia occidental (sector Oeste de las UNPA)', '克羅埃西亞——西斯拉沃尼亞（聯合國保護區西區）', '克罗地亚——西斯拉沃尼亚（联合国保护区西区）', 'Croatie — Slavonie occidentale (secteur Ouest des ZPNU)', '크로아티아 — 서슬라보니아(UNPA 서부 구역)'),
      left: 'SERB', right: 'CROAT', until: '1995-05-03',
      dates: [
        { d: '1992-04-27', cuts: [344],
          note: L('The smallest of the four protected areas: an enclave on the Sava around Okučani, cut off from the others since the autumn of 1991', '四つの保護区域のうち最小のもの。1991年秋から他と切り離された、サヴァ川沿いオクチャニ周辺の飛び地', 'Das kleinste der vier Schutzgebiete: eine Enklave an der Save um Okučani, seit dem Herbst 1991 von den übrigen abgeschnitten', 'Наименьший из четырёх охраняемых районов: анклав на Саве вокруг Окучани, отрезанный от остальных с осени 1991 года', 'La menor de las cuatro zonas protegidas: un enclave junto al Sava en torno a Okučani, aislado de las demás desde el otoño de 1991', '四個保護區中最小者：薩瓦河畔奧庫查尼一帶的飛地，自 1991 年秋起與其餘各區隔絕', '四个保护区中最小者：萨瓦河畔奥库恰尼一带的飞地，自 1991 年秋起与其余各区隔绝', 'La plus petite des quatre zones protégées : une enclave sur la Save autour d’Okučani, coupée des autres depuis l’automne 1991', '네 보호구역 가운데 가장 작은 곳. 1991년 가을부터 나머지와 단절된 사바강변 오쿠차니 일대의 고립지'),
          pts: ['Kozarska Dubica', 'Jasenovac', 'Novska', 'Pakrac', 'Nova Gradiska', 'Gradiska'] },
      ],
    },
    {
      id: 'hr-slavonia-east',
      name: L('Croatia — eastern Slavonia, Baranja and western Syrmia (UNPA Sector East)', 'クロアチア——東スラヴォニア・バラニャ・西スレム（UNPA 東セクター）', 'Kroatien — Ostslawonien, Baranja und Westsyrmien (UNPA-Sektor Ost)', 'Хорватия — Восточная Славония, Баранья и Западный Срем (сектор ООН «Восток»)', 'Croacia: Eslavonia oriental, Baranya y Sirmia occidental (sector Este de las UNPA)', '克羅埃西亞——東斯拉沃尼亞、巴拉尼亞與西斯雷姆（聯合國保護區東區）', '克罗地亚——东斯拉沃尼亚、巴拉尼亚与西斯雷姆（联合国保护区东区）', 'Croatie — Slavonie orientale, Baranja et Syrmie occidentale (secteur Est des ZPNU)', '크로아티아 — 동슬라보니아·바라냐·서스렘(UNPA 동부 구역)'),
      left: 'CROAT', right: 'SERB', until: '1998-01-15',
      dates: [
        { d: '1992-04-27', cuts: [344],
          note: L('From the Hungarian border down the Drava and past Vukovar to the Sava — the sector that outlived the other three by two and a half years', 'ハンガリー国境からドラヴァ川を下り、ヴコヴァルの脇を通ってサヴァ川へ。他の三つより二年半長く残ったセクター', 'Von der ungarischen Grenze die Drau hinab und an Vukovar vorbei bis zur Save — der Sektor, der die anderen drei um zweieinhalb Jahre überdauerte', 'От венгерской границы вниз по Драве и мимо Вуковара к Саве — сектор, переживший остальные три на два с половиной года', 'Desde la frontera húngara, Drava abajo y pasando Vukovar hasta el Sava: el sector que sobrevivió dos años y medio a los otros tres', '自匈牙利邊界沿德拉瓦河南下，經武科瓦爾至薩瓦河——比其餘三區多存續兩年半的區域', '自匈牙利边界沿德拉瓦河南下，经武科瓦尔至萨瓦河——比其余三区多存续两年半的区域', 'De la frontière hongroise en descendant la Drave et en passant Vukovar jusqu’à la Save — le secteur qui a survécu deux ans et demi aux trois autres', '헝가리 국경에서 드라바강을 따라 내려와 부코바르를 지나 사바강까지 — 나머지 세 구역보다 2년 반을 더 존속한 구역'),
          pts: ['Donji Miholjac', 'Osijek', 'Vinkovci', 'Zupanja', 'Brcko'] },
        { d: '1996-01-15', cuts: [344], left: 'CROAT', right: 'INTL',
          note: L('The Erdut Agreement takes effect: the region passes to the United Nations Transitional Administration (UNTAES), which hands it to Croatia on 15 January 1998', 'エルドゥト合意が発効し、この地域は国連東スラヴォニア暫定統治機構（UNTAES）の下に入る。1998年1月15日にクロアチアへ引き渡される', 'Das Erdut-Abkommen tritt in Kraft: die Region geht an die Übergangsverwaltung der Vereinten Nationen (UNTAES), die sie am 15. Januar 1998 an Kroatien übergibt', 'Вступает в силу Эрдутское соглашение: район переходит к Временной администрации ООН (ВАООНВС), которая 15 января 1998 года передаёт его Хорватии', 'Entra en vigor el Acuerdo de Erdut: la región pasa a la Administración Transitoria de la ONU (UNTAES), que la entrega a Croacia el 15 de enero de 1998', '《埃爾杜特協定》生效，該地區移交聯合國過渡行政當局（UNTAES），並於 1998 年 1 月 15 日交還克羅埃西亞', '《埃尔杜特协定》生效，该地区移交联合国过渡行政当局（UNTAES），并于 1998 年 1 月 15 日交还克罗地亚', 'L’accord d’Erdut entre en vigueur : la région passe à l’Administration transitoire des Nations unies (ATNUSO), qui la remet à la Croatie le 15 janvier 1998', '에르두트 협정이 발효되어 이 지역은 유엔 과도행정기구(UNTAES) 관할로 넘어가고, 1998년 1월 15일 크로아티아에 이양된다'),
          pts: ['Donji Miholjac', 'Osijek', 'Vinkovci', 'Zupanja', 'Brcko'] },
      ],
    },
    /* ── BOSNIA: one line, and it is the only one the record states ────────────────────────── */
    {
      id: 'ba-iebl',
      name: L('Bosnia and Herzegovina — the Inter-Entity Boundary Line', 'ボスニア・ヘルツェゴビナ——両構成体境界線（IEBL）', 'Bosnien und Herzegowina — die Entitätengrenzlinie', 'Босния и Герцеговина — межэнтитетская линия разграничения', 'Bosnia y Herzegovina: la línea fronteriza interentidades', '波士尼亞與赫塞哥維納——兩實體分界線', '波斯尼亚与黑塞哥维那——两实体分界线', 'Bosnie-Herzégovine — la ligne de démarcation interentités', '보스니아 헤르체고비나 — 양 구성체 경계선'),
      left: 'ARBIH', right: 'SERB',
      dates: [
        { d: '1995-12-14', cuts: [346],
          /* ⚠ THE TWO PLACES THIS LINE IS KNOWN TO BE WRONG, WRITTEN DOWN RATHER THAN HIDDEN. The
             IEBL is 1,080 km long and in two places it is narrower than the distance between the
             towns a line here is quoted through: the corridor that joins Goražde to the rest of the
             Federation, and the Federation's finger of Posavina at Orašje. Both are a few kilometres
             wide, and a chord drawn between named towns cannot carry either without doubling back on
             itself. They are the price of quoting a line through places instead of tracing it off a
             picture, and they are stated here so that nobody later reads the map as the record. */
          note: L('The line of Annex 2 of the Dayton Agreement, signed in Paris on 14 December 1995 — 49 per cent of the country to the Republika Srpska, 51 to the Federation', '1995年12月14日にパリで署名されたデイトン合意・附属書2の線。国土の49％がスルプスカ共和国、51％が連邦へ', 'Die Linie aus Anhang 2 des Abkommens von Dayton, unterzeichnet am 14. Dezember 1995 in Paris — 49 Prozent des Landes an die Republika Srpska, 51 an die Föderation', 'Линия приложения 2 Дейтонского соглашения, подписанного в Париже 14 декабря 1995 года: 49 процентов страны — Республике Сербской, 51 — Федерации', 'La línea del Anexo 2 del Acuerdo de Dayton, firmado en París el 14 de diciembre de 1995: el 49 por ciento del país para la República Srpska y el 51 para la Federación', '1995 年 12 月 14 日於巴黎簽署的《岱頓協定》附件二所定之線——全國 49% 歸塞族共和國，51% 歸聯邦', '1995 年 12 月 14 日于巴黎签署的《代顿协定》附件二所定之线——全国 49% 归塞族共和国，51% 归联邦', 'La ligne de l’annexe 2 de l’accord de Dayton, signé à Paris le 14 décembre 1995 — 49 pour cent du pays à la Republika Srpska, 51 à la Fédération', '1995년 12월 14일 파리에서 서명된 데이턴 협정 부속서 2의 선 — 국토의 49%는 스릅스카 공화국, 51%는 연방으로'),
          pts: ['Dvor', 'Sanski Most', 'Kljuc', 'Sipovo', 'Jajce', 'Travnik', 'Teslic', 'Doboj', 'Gracanica', 'Gradacac', 'Brcko', 'Celic', 'Kalesija', 'Vlasenica', 'Sokolac', 'Pale', 'Trnovo', 'Konjic', 'Nevesinje', 'Stolac', 'Ravno', 'Dubrovnik'] },
      ],
    },
    /* ── KOSOVO ────────────────────────────────────────────────────────────────────────────────
       ⚠ THIS LINE IS A BOUNDARY, NOT A FRONT, AND IT IS QUOTED BECAUSE THE ALTERNATIVES ARE BOTH
       FALSE. Inside Kosovo in 1998 there was no line: the KLA held villages and valleys that
       changed hands within a week, and this file will not draw them. But the entity on the map is
       the Federal Republic of Yugoslavia, and to say «control divided» about that entity would
       paint Belgrade, Novi Sad and Podgorica amber — a far larger claim than the record supports.
       So what is drawn is the one line the record does state: the administrative boundary of
       Kosovo, unchanged since 1945, and the one the Kumanovo Military Technical Agreement of
       9 June 1999 used to define where the FRY's forces had to be by 20 June. What is claimed is
       therefore only this — inside that boundary control was divided, and outside it was not. */
    {
      id: 'rs-kosovo',
      name: L('Kosovo — the administrative boundary', 'コソボ——行政境界線', 'Kosovo — die Verwaltungsgrenze', 'Косово — административная граница', 'Kosovo: el límite administrativo', '科索沃——行政邊界', '科索沃——行政边界', 'Kosovo — la limite administrative', '코소보 — 행정 경계선'),
      left: 'CONTESTED', right: 'SERB',
      dates: [
        { d: '1998-02-28', cuts: [345],
          note: L('The Drenica operations open the war in Kosovo; inside this boundary control is divided, and where the division ran in any given week is what this file refuses to guess', 'ドレニツァでの作戦がコソボの戦争を開く。この境界の内側では支配が分かれており、その分かれ目が週ごとにどこを走ったかは、この記録が推測を拒むところである', 'Die Operationen in der Drenica eröffnen den Krieg im Kosovo; innerhalb dieser Grenze ist die Kontrolle geteilt, und wo die Teilung in einer bestimmten Woche verlief, ist genau das, was diese Datei nicht erraten will', 'Операции в Дренице открывают войну в Косове; внутри этой границы контроль разделён, а где именно проходило разделение в ту или иную неделю — как раз то, что этот файл отказывается угадывать', 'Las operaciones de Drenica abren la guerra de Kosovo; dentro de este límite el control está dividido, y por dónde pasaba esa división cada semana es justo lo que este archivo se niega a suponer', '德雷尼察一連串行動揭開科索沃戰爭；此界線之內控制權分裂，而每一週分界究竟落在何處，正是本記錄拒絕臆測之事', '德雷尼察一连串行动揭开科索沃战争；此界线之内控制权分裂，而每一周分界究竟落在何处，正是本记录拒绝臆测之事', 'Les opérations de la Drenica ouvrent la guerre du Kosovo ; à l’intérieur de cette limite le contrôle est partagé, et par où passait ce partage telle ou telle semaine est précisément ce que ce fichier refuse de deviner', '드레니차 작전이 코소보 전쟁을 연다. 이 경계선 안에서는 지배가 나뉘어 있었고, 그 경계가 매주 어디를 지났는지는 이 기록이 추측하기를 거부하는 지점이다'),
          pts: ['Bajram Curri', 'Plav', 'Rozaje', 'Novi Pazar', 'Kursumlija', 'Bujanovac', 'Kumanovo'] },
        { d: '1999-06-20', cuts: [345], left: 'INTL', right: 'SERB',
          note: L('The withdrawal required by the Kumanovo agreement is complete and KFOR is deployed; under Security Council resolution 1244 the territory passes to international administration', 'クマノヴォ協定が求めた撤退が完了し、KFOR が展開する。安保理決議1244により、この地域は国際的な統治の下に移る', 'Der im Abkommen von Kumanovo geforderte Abzug ist abgeschlossen und die KFOR ist stationiert; nach Resolution 1244 des Sicherheitsrats geht das Gebiet unter internationale Verwaltung', 'Отвод войск, предусмотренный Кумановским соглашением, завершён, развёрнуты силы КФОР; по резолюции 1244 Совета Безопасности территория переходит под международное управление', 'Se completa la retirada exigida por el acuerdo de Kumanovo y se despliega la KFOR; por la resolución 1244 del Consejo de Seguridad el territorio pasa a administración internacional', '《庫馬諾沃協定》要求的撤軍完成，駐科部隊進駐；依安理會第 1244 號決議，該地區轉入國際管理', '《库马诺沃协定》要求的撤军完成，驻科部队进驻；依安理会第 1244 号决议，该地区转入国际管理', 'Le retrait exigé par l’accord de Kumanovo est achevé et la KFOR est déployée ; en vertu de la résolution 1244 du Conseil de sécurité, le territoire passe sous administration internationale', '쿠마노보 협정이 요구한 철수가 완료되고 KFOR가 전개된다. 안보리 결의 1244에 따라 이 지역은 국제 관리 아래 놓인다'),
          pts: ['Bajram Curri', 'Plav', 'Rozaje', 'Novi Pazar', 'Kursumlija', 'Bujanovac', 'Kumanovo'] },
      ],
    },
  ],
  /* ── the operations, in the order they happened ────────────────────────────────────────────
     ⚠ `cas` AND `str` ARE WRITTEN ONLY WHERE A FIGURE IS ACTUALLY ESTABLISHED, AND THE PAIRS ARE
     RANGES BECAUSE THE SOURCES GIVE RANGES. Srebrenica is the ICTY's own finding; Ovčara is the
     number of identified victims in the Mrkšić judgment; the Sarajevo range is the span between
     the commonly cited counts for the siege; the Kosovo range runs from the lower estimates to the
     Humanitarian Law Centre's documented total for 1998–2000. Every other event here carries no
     number at all, which is the correct thing to carry when the sources do not agree on one. */
  events: [
    { d: '1991-06-25', at: 'Ljubljana', wiki: 'Breakup_of_Yugoslavia', kind: 'political', name: L('Slovenia and Croatia declare independence', 'スロベニアとクロアチアが独立を宣言', 'Slowenien und Kroatien erklären ihre Unabhängigkeit', 'Словения и Хорватия провозглашают независимость', 'Eslovenia y Croacia declaran la independencia', '斯洛維尼亞與克羅埃西亞宣布獨立', '斯洛文尼亚与克罗地亚宣布独立', 'La Slovénie et la Croatie déclarent leur indépendance', '슬로베니아와 크로아티아가 독립을 선언') },
    { d: '1991-06-27', d2: '1991-07-07', at: 'Ljubljana', wiki: 'Ten-Day_War', kind: 'battle', name: L('The Ten-Day War in Slovenia', 'スロベニア十日間戦争', 'Der Zehntagekrieg in Slowenien', 'Десятидневная война в Словении', 'La Guerra de los Diez Días en Eslovenia', '斯洛維尼亞十日戰爭', '斯洛文尼亚十日战争', 'La guerre des Dix Jours en Slovénie', '슬로베니아 10일 전쟁') },
    { d: '1991-07-07', at: 'Pula', wiki: 'Brioni_Agreement', kind: 'political', name: L('Brioni Agreement', 'ブリオニ合意', 'Abkommen von Brioni', 'Брионское соглашение', 'Acuerdo de Brioni', '布里俄尼協定', '布里俄尼协定', 'Accord de Brioni', '브리오니 협정') },
    { d: '1991-08-25', d2: '1991-11-18', at: 'Vukovar', wiki: 'Battle_of_Vukovar', kind: 'siege', name: L('The siege of Vukovar', 'ヴコヴァル包囲戦', 'Die Belagerung von Vukovar', 'Осада Вуковара', 'El sitio de Vukovar', '武科瓦爾圍城戰', '武科瓦尔围城战', 'Le siège de Vukovar', '부코바르 공방전') },
    { d: '1991-10-01', d2: '1992-05-31', at: 'Dubrovnik', wiki: 'Siege_of_Dubrovnik', kind: 'siege', name: L('The siege of Dubrovnik', 'ドゥブロヴニク包囲戦', 'Die Belagerung von Dubrovnik', 'Осада Дубровника', 'El sitio de Dubrovnik', '杜布羅夫尼克圍城戰', '杜布罗夫尼克围城战', 'Le siège de Dubrovnik', '두브로브니크 공방전') },
    { d: '1991-11-20', at: 'Vukovar', wiki: 'Vukovar_massacre', kind: 'atrocity', cas: 194, name: L('Ovčara: the killings of prisoners from Vukovar hospital', 'オヴチャラ——ヴコヴァル病院から連行された捕虜の殺害', 'Ovčara: die Tötung der Gefangenen aus dem Krankenhaus von Vukovar', 'Овчара: убийство пленных, вывезенных из вуковарской больницы', 'Ovčara: el asesinato de los prisioneros del hospital de Vukovar', '奧夫查拉——自武科瓦爾醫院擄走的俘虜遭殺害', '奥夫查拉——自武科瓦尔医院掳走的俘虏遭杀害', 'Ovčara : le meurtre des prisonniers de l’hôpital de Vukovar', '오브차라 — 부코바르 병원에서 끌려간 포로들의 살해') },
    { d: '1992-01-02', at: 'Sarajevo', wiki: 'Vance_plan', kind: 'political', name: L('The Sarajevo Agreement and the Vance plan', 'サラエヴォ協定とヴァンス案', 'Das Abkommen von Sarajevo und der Vance-Plan', 'Сараевское соглашение и план Вэнса', 'El Acuerdo de Sarajevo y el plan Vance', '《薩拉熱窩協定》與萬斯方案', '《萨拉热窝协定》与万斯方案', 'L’accord de Sarajevo et le plan Vance', '사라예보 협정과 밴스 계획') },
    { d: '1992-04-05', d2: '1996-02-29', at: 'Sarajevo', wiki: 'Siege_of_Sarajevo', kind: 'siege', cas: [11000, 14000], name: L('The siege of Sarajevo', 'サラエヴォ包囲', 'Die Belagerung von Sarajevo', 'Осада Сараева', 'El sitio de Sarajevo', '塞拉耶佛圍城', '萨拉热窝围城', 'Le siège de Sarajevo', '사라예보 포위') },
    { d: '1992-04-07', d2: '1993-02-28', at: 'Foca', wiki: 'Foča_ethnic_cleansing', kind: 'atrocity', name: L('Foča: the crimes established in the Kunarac judgment', 'フォチャ——クナラツ判決が認定した犯罪', 'Foča: die im Kunarac-Urteil festgestellten Verbrechen', 'Фоча: преступления, установленные приговором по делу Кунараца', 'Foča: los crímenes establecidos en la sentencia Kunarac', '福查——庫納拉茨案判決所認定之罪行', '福查——库纳拉茨案判决所认定之罪行', 'Foča : les crimes établis par le jugement Kunarac', '포차 — 쿠나라츠 판결이 인정한 범죄') },
    { d: '1992-05-25', d2: '1992-08-21', at: 'Prijedor', wiki: 'Omarska_camp', kind: 'atrocity', name: L('The camps of the Prijedor area', 'プリイェドル周辺の収容所', 'Die Lager im Raum Prijedor', 'Лагеря в районе Приедора', 'Los campos de la zona de Prijedor', '普里耶多爾一帶的集中營', '普里耶多尔一带的集中营', 'Les camps de la région de Prijedor', '프리예도르 일대의 수용소') },
    { d: '1992-06-10', d2: '1995-08-05', at: 'Bihac', wiki: 'Bihać_pocket', kind: 'siege', name: L('The Bihać pocket', 'ビハチ包囲地', 'Der Kessel von Bihać', 'Бихачский анклав', 'La bolsa de Bihać', '比哈奇口袋地帶', '比哈奇口袋地带', 'La poche de Bihać', '비하치 포켓') },
    { d: '1993-01-22', d2: '1993-02-01', at: 'Zadar', wiki: 'Operation_Maslenica', kind: 'battle', name: L('Operation Maslenica', 'マスレニツァ作戦', 'Operation Maslenica', 'Операция «Масленица»', 'Operación Maslenica', '馬斯萊尼察行動', '马斯莱尼察行动', 'Opération Maslenica', '마슬레니차 작전') },
    { d: '1993-04-16', at: 'Ahmici', wiki: 'Ahmići_massacre', kind: 'atrocity', cas: [103, 120], name: L('Ahmići', 'アフミチ', 'Ahmići', 'Ахмичи', 'Ahmići', '阿赫米奇', '阿赫米奇', 'Ahmići', '아흐미치') },
    { d: '1993-05-09', d2: '1994-02-23', at: 'Mostar', wiki: 'Croat–Bosniak_War', kind: 'siege', name: L('Mostar and the Croat–Bosniak war', 'モスタルとクロアチア＝ボシュニャク戦争', 'Mostar und der kroatisch-bosniakische Krieg', 'Мостар и хорватско-босняцкая война', 'Mostar y la guerra croato-bosnia', '莫斯塔爾與克羅埃西亞—波士尼亞克戰爭', '莫斯塔尔与克罗地亚—波什尼亚克战争', 'Mostar et la guerre croato-bosniaque', '모스타르와 크로아티아–보슈냐크 전쟁') },
    { d: '1994-03-18', at: 'Sarajevo', wiki: 'Washington_Agreement_(1994)', kind: 'political', name: L('The Washington Agreement creates the Federation', 'ワシントン合意によりボスニア連邦が成立', 'Das Washingtoner Abkommen schafft die Föderation', 'Вашингтонское соглашение создаёт Федерацию', 'El Acuerdo de Washington crea la Federación', '《華盛頓協定》成立聯邦', '《华盛顿协定》成立联邦', 'L’accord de Washington crée la Fédération', '워싱턴 협정으로 연방이 성립') },
    { d: '1995-05-01', d2: '1995-05-02', at: 'Okucani', wiki: 'Operation_Flash', kind: 'battle', name: L('Operation Flash', '「閃光作戦」', 'Operation Blitz', 'Операция «Молния»', 'Operación Relámpago', '「閃電行動」', '“闪电行动”', 'Opération Éclair', '‘섬광 작전’') },
    { d: '1995-07-11', d2: '1995-07-22', at: 'Srebrenica', wiki: 'Srebrenica_massacre', kind: 'atrocity', cas: [7000, 8000], name: L('Srebrenica', 'スレブレニツァ', 'Srebrenica', 'Сребреница', 'Srebrenica', '斯雷布雷尼察', '斯雷布雷尼察', 'Srebrenica', '스레브레니차') },
    { d: '1995-08-04', d2: '1995-08-07', at: 'Knin', wiki: 'Operation_Storm', kind: 'battle', name: L('Operation Storm', '「嵐作戦」', 'Operation Sturm', 'Операция «Буря»', 'Operación Tormenta', '「風暴行動」', '“风暴行动”', 'Opération Tempête', '‘폭풍 작전’') },
    { d: '1995-08-30', d2: '1995-09-20', at: 'Pale', wiki: 'Operation_Deliberate_Force', kind: 'air', name: L('Operation Deliberate Force', '「デリバレート・フォース作戦」', 'Operation Deliberate Force', 'Операция «Обдуманная сила»', 'Operación Fuerza Deliberada', '「慎重武力行動」', '“慎重武力行动”', 'Opération Deliberate Force', '‘신중한 무력 작전’') },
    { d: '1995-09-08', d2: '1995-09-20', at: 'Sanski Most', wiki: 'Operation_Mistral_2', kind: 'battle', name: L('The western Bosnia offensive', '西ボスニア攻勢', 'Die Offensive in Westbosnien', 'Наступление в Западной Боснии', 'La ofensiva en Bosnia occidental', '波士尼亞西部攻勢', '波斯尼亚西部攻势', 'L’offensive de Bosnie occidentale', '서보스니아 공세') },
    { d: '1995-11-12', at: 'Vukovar', wiki: 'Erdut_Agreement', kind: 'political', name: L('Erdut Agreement', 'エルドゥト合意', 'Erdut-Abkommen', 'Эрдутское соглашение', 'Acuerdo de Erdut', '《埃爾杜特協定》', '《埃尔杜特协定》', 'Accord d’Erdut', '에르두트 협정') },
    { d: '1995-12-14', at: 'Paris', wiki: 'Dayton_Agreement', kind: 'political', name: L('The Dayton Agreement is signed in Paris', 'デイトン合意がパリで署名される', 'Das Abkommen von Dayton wird in Paris unterzeichnet', 'Дейтонское соглашение подписано в Париже', 'El Acuerdo de Dayton se firma en París', '《岱頓協定》於巴黎簽署', '《代顿协定》于巴黎签署', 'L’accord de Dayton est signé à Paris', '데이턴 협정이 파리에서 서명되다') },
    { d: '1996-01-15', at: 'Vukovar', wiki: 'UNTAES', kind: 'political', name: L('UNTAES takes over eastern Slavonia', 'UNTAES が東スラヴォニアの統治を引き継ぐ', 'Die UNTAES übernimmt Ostslawonien', 'ВАООНВС принимает управление Восточной Славонией', 'La UNTAES asume Eslavonia oriental', 'UNTAES 接管東斯拉沃尼亞', 'UNTAES 接管东斯拉沃尼亚', 'L’ATNUSO prend en charge la Slavonie orientale', 'UNTAES가 동슬라보니아를 인수') },
    { d: '1998-02-28', d2: '1999-06-11', at: 'Pristina', wiki: 'Kosovo_War', kind: 'battle', name: L('The war in Kosovo', 'コソボ紛争', 'Der Kosovokrieg', 'Война в Косове', 'La guerra de Kosovo', '科索沃戰爭', '科索沃战争', 'La guerre du Kosovo', '코소보 전쟁') },
    { d: '1999-03-24', d2: '1999-06-10', at: 'Belgrade', wiki: 'NATO_bombing_of_Yugoslavia', kind: 'air', name: L('Operation Allied Force', '「アライド・フォース作戦」', 'Operation Allied Force', 'Операция «Союзная сила»', 'Operación Fuerza Aliada', '「盟軍行動」', '“盟军行动”', 'Opération Allied Force', '‘연합군 작전’') },
    { d: '1999-03-24', d2: '1999-06-10', at: 'Prizren', wiki: 'Kosovo_War', kind: 'atrocity', cas: [10000, 13500], name: L('The deportation of Kosovo Albanians', 'コソボ・アルバニア人の強制退去', 'Die Vertreibung der Kosovo-Albaner', 'Депортация косовских албанцев', 'La deportación de los albaneses de Kosovo', '科索沃阿爾巴尼亞人遭驅逐', '科索沃阿尔巴尼亚人遭驱逐', 'La déportation des Albanais du Kosovo', '코소보 알바니아인 강제 추방') },
    { d: '1999-06-09', at: 'Kumanovo', wiki: 'Kumanovo_Agreement', kind: 'political', name: L('The Kumanovo Military Technical Agreement', 'クマノヴォ軍事技術協定', 'Das Militärisch-Technische Abkommen von Kumanovo', 'Кумановское военно-техническое соглашение', 'El Acuerdo Técnico Militar de Kumanovo', '《庫馬諾沃軍事技術協定》', '《库马诺沃军事技术协定》', 'L’accord militaire technique de Kumanovo', '쿠마노보 군사기술협정') },
    { d: '1999-06-12', at: 'Pristina', wiki: 'Kosovo_Force', kind: 'political', name: L('Resolution 1244 and the deployment of KFOR', '決議1244と KFOR の展開', 'Resolution 1244 und die Entsendung der KFOR', 'Резолюция 1244 и развёртывание КФОР', 'La resolución 1244 y el despliegue de la KFOR', '第 1244 號決議與駐科部隊進駐', '第 1244 号决议与驻科部队进驻', 'La résolution 1244 et le déploiement de la KFOR', '결의 1244와 KFOR 전개') },
    { d: '2001-01-22', d2: '2001-08-13', at: 'Tetovo', wiki: '2001_insurgency_in_Macedonia', kind: 'uprising', name: L('The insurgency in Macedonia', 'マケドニア紛争', 'Der Aufstand in Mazedonien', 'Вооружённый конфликт в Македонии', 'La insurgencia en Macedonia', '馬其頓武裝衝突', '马其顿武装冲突', 'L’insurrection en Macédoine', '마케도니아 무장 분쟁') },
    { d: '2001-08-13', at: 'Ohrid', wiki: 'Ohrid_Agreement', kind: 'political', name: L('The Ohrid Framework Agreement', 'オフリド枠組み合意', 'Das Rahmenabkommen von Ohrid', 'Охридское рамочное соглашение', 'El Acuerdo Marco de Ohrid', '《奧赫里德框架協定》', '《奥赫里德框架协定》', 'L’accord-cadre d’Ohrid', '오흐리드 기본 협정') },
  ],
};

export { YUGOSLAVIA };
