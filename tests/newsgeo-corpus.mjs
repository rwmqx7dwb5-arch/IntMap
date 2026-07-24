/* ============================================================================
 *  IntMap · NewsGeo evaluation corpus  (#R161)
 * ----------------------------------------------------------------------------
 *  A LABELLED set of news headlines with the place each story is actually
 *  ABOUT, used to measure the deterministic (non-AI) locator instead of
 *  eyeballing it. Cases are grouped by the failure class they probe, so a
 *  regression tells you WHICH kind of reasoning broke.
 *
 *    at   : [lng, lat] of the correct subject location
 *    km   : accepted radius (a city needs ~150 km; a country/region is coarser
 *           because a "representative point" is legitimately fuzzy)
 *    at:null : the story is genuinely PLACELESS — pinning anything is an error
 *    tag  : failure class (basic / hierarchy / dateline / ambiguity / trap /
 *           weak / org / company / seat / feature / negative / lang)
 *
 *  Headlines are written in the style of the real Google-News WORLD/BUSINESS
 *  feeds this project consumes (topic + place + event), across the five UI
 *  languages (en / ja / de / ru / es).
 * ==========================================================================*/
export const CORPUS = [
  /* ---------- basic: the place is named plainly ---------- */
  { t: 'Israeli strikes hit Gaza as ceasefire talks stall', at: [34.47, 31.5], km: 120, tag: 'basic' },
  { t: 'Russia launches missile barrage on Kyiv overnight', at: [30.52, 50.45], km: 120, tag: 'basic' },
  { t: 'Suicide bombing kills 20 in Peshawar', at: [71.58, 34.02], km: 120, tag: 'basic' },
  { t: 'Flooding displaces thousands in Jakarta', at: [106.85, -6.21], km: 120, tag: 'basic' },
  { t: 'Wildfires force evacuations across Athens suburbs', at: [23.73, 37.98], km: 150, tag: 'basic' },
  { t: 'Protests erupt in Tbilisi over foreign agent law', at: [44.83, 41.72], km: 120, tag: 'basic' },
  { t: 'Anti-government demonstrations sweep Belgrade', at: [20.46, 44.79], km: 120, tag: 'basic' },
  { t: 'Deadly landslide buries village near Medellín', at: [-75.56, 6.25], km: 150, tag: 'basic' },
  { t: 'Court in Seoul sentences former minister', at: [126.98, 37.57], km: 120, tag: 'basic' },
  { t: 'Power blackout hits Havana for third night', at: [-82.38, 23.13], km: 150, tag: 'basic' },
  { t: 'Bomb blast rocks Mogadishu hotel', at: [45.34, 2.05], km: 120, tag: 'basic' },
  { t: 'Rescue teams search rubble in Antakya after quake', at: [36.16, 36.2], km: 300, tag: 'basic' },
  { t: 'Election officials in Caracas announce results', at: [-66.9, 10.49], km: 150, tag: 'basic' },
  { t: 'Fire guts market in Lagos', at: [3.38, 6.52], km: 120, tag: 'basic' },
  { t: 'Mass shooting reported in Memphis', at: [-90.05, 35.15], km: 120, tag: 'basic' },

  /* ---------- hierarchy: a city AND its country/state are both named ---------- */
  { t: 'Explosion rocks Kharkiv as Russia steps up strikes on Ukraine', at: [36.23, 49.99], km: 120, tag: 'hierarchy' },
  { t: 'Ukraine says Odesa port hit by drones', at: [30.73, 46.48], km: 120, tag: 'hierarchy' },
  { t: 'Israel orders evacuation of Rafah in southern Gaza', at: [34.25, 31.29], km: 80, tag: 'hierarchy' },
  { t: 'Death toll rises in Mariupol, Ukraine says', at: [37.54, 47.1], km: 120, tag: 'hierarchy' },
  { t: 'Nigeria: gunmen abduct students in Kaduna state', at: [8.1, 9.6], km: 700, tag: 'hierarchy' },
  { t: 'Storm batters Sendai in northern Japan', at: [140.87, 38.27], km: 150, tag: 'hierarchy' },
  { t: 'India: heatwave grips Delhi and northern states', at: [77.21, 28.61], km: 150, tag: 'hierarchy' },
  { t: 'Brazil floods devastate Porto Alegre', at: [-51.23, -30.03], km: 150, tag: 'hierarchy' },
  { t: 'China reports outbreak in Wuhan hospitals', at: [114.3, 30.59], km: 150, tag: 'hierarchy' },
  { t: 'Germany: far-right gains in Dresden local vote', at: [13.74, 51.05], km: 150, tag: 'hierarchy' },
  { t: 'Sudan war: RSF shells El Fasher in Darfur', at: [25.35, 13.63], km: 200, tag: 'hierarchy' },
  { t: 'Syria strikes reported near Aleppo airport', at: [37.16, 36.2], km: 150, tag: 'hierarchy' },

  /* ---------- dateline: somebody TALKED here, the event is elsewhere ---------- */
  { t: 'Blinken in Washington warns over Gaza ceasefire talks', at: [34.47, 31.5], km: 120, tag: 'dateline' },
  { t: 'White House says strikes on Yemen will continue', at: [47.5, 15.5], km: 800, tag: 'dateline' },
  { t: 'EU ministers meeting in Brussels condemn attacks on Kharkiv', at: [36.23, 49.99], km: 150, tag: 'dateline' },
  { t: 'Pentagon says Russian forces advance near Pokrovsk', at: [37.18, 48.28], km: 120, tag: 'dateline' },
  { t: 'UN chief in New York calls for ceasefire in Sudan', at: [30.0, 15.5], km: 900, tag: 'dateline' },
  { t: 'Moscow said its troops captured Avdiivka', at: [37.74, 48.14], km: 120, tag: 'dateline' },
  { t: 'Japan protests Chinese buoy near Senkaku Islands', at: [123.47, 25.74], km: 200, tag: 'dateline' },
  { t: 'Beijing warns Washington over Taiwan arms sale', at: [121.0, 23.7], km: 400, tag: 'dateline' },
  { t: 'Berlin announces new aid package for Kyiv', at: [30.52, 50.45], km: 150, tag: 'dateline' },
  { t: 'London summit discusses reconstruction of Mariupol', at: [37.54, 47.1], km: 150, tag: 'dateline' },

  /* ---------- ambiguity: the same name is many real places ---------- */
  { t: 'Tripoli clashes leave 12 dead in Libya', at: [13.19, 32.89], km: 120, tag: 'ambiguity' },
  { t: 'Army shells Tripoli in northern Lebanon', at: [35.85, 34.44], km: 120, tag: 'ambiguity' },
  { t: 'Cambridge scientists in England publish fusion result', at: [0.12, 52.21], km: 150, tag: 'ambiguity' },
  { t: 'Massachusetts: Cambridge council approves housing plan', at: [-71.11, 42.37], km: 150, tag: 'ambiguity' },
  { t: 'Springfield, Illinois braces for record storm', at: [-89.65, 39.8], km: 150, tag: 'ambiguity' },
  { t: 'Georgia protesters clash with police in Tbilisi', at: [44.83, 41.72], km: 150, tag: 'ambiguity' },
  { t: 'Vancouver housing costs surge in British Columbia', at: [-123.12, 49.28], km: 150, tag: 'ambiguity' },
  { t: 'Odesa strike damages grain terminal in Ukraine', at: [30.73, 46.48], km: 120, tag: 'ambiguity' },
  { t: 'Alexandria port in Egypt reopens after storm', at: [29.92, 31.2], km: 150, tag: 'ambiguity' },
  { t: 'Valencia flooding kills dozens in eastern Spain', at: [-0.38, 39.47], km: 200, tag: 'ambiguity' },
  { t: 'Naples earthquake swarm alarms residents in Italy', at: [14.27, 40.85], km: 150, tag: 'ambiguity' },
  { t: 'Birmingham City Council in England declares bankruptcy', at: [-1.9, 52.48], km: 150, tag: 'ambiguity' },
  { t: 'San José hosts Costa Rica summit', at: [-84.09, 9.93], km: 150, tag: 'ambiguity' },
  { t: 'Córdoba heatwave grips northern Argentina', at: [-64.18, -31.42], km: 250, tag: 'ambiguity' },

  /* ---------- traps: the name of a place inside something that is not one ---------- */
  { t: 'Paris Hilton testifies before Congress on youth care', at: null, tag: 'trap' },
  { t: 'New York Times sues OpenAI over copyright', at: [-122.42, 37.77], km: 200, tag: 'trap' },
  { t: 'Michael Jordan sells stake in NBA franchise', at: null, tag: 'trap' },
  { t: 'Bank of America posts record quarterly profit', at: null, tag: 'trap' },
  { t: 'Countries reaffirm Paris Agreement climate targets', at: null, tag: 'trap' },
  { t: 'Museum marks anniversary of the Berlin Wall', at: null, tag: 'trap' },
  { t: 'Geneva Convention obligations debated by lawyers', at: null, tag: 'trap' },
  { t: 'Washington Post publisher steps down', at: null, tag: 'trap' },
  { t: 'Cambridge Analytica files released by regulator', at: null, tag: 'trap' },
  { t: 'Boston Consulting Group cuts hiring targets', at: null, tag: 'trap' },

  /* ---------- weak words: a place name that is also an ordinary word ---------- */
  { t: 'Turkey and Greece agree new migration deal', at: [35.0, 39.0], km: 900, tag: 'weak' },
  { t: 'Turkey prices rise before Thanksgiving dinner', at: null, tag: 'weak' },
  { t: 'Jihadists attack army post in northern Mali', at: [-4.0, 17.6], km: 900, tag: 'weak' },
  { t: 'Chad closes border after clashes in the east', at: [18.7, 15.5], km: 900, tag: 'weak' },
  { t: 'Niger junta ends military accord with Washington', at: [9.4, 17.6], km: 900, tag: 'weak' },
  { t: 'Coup attempt reported in Guinea', at: [-10.9, 10.4], km: 900, tag: 'weak' },

  /* ---------- organisations, armed groups ---------- */
  { t: 'NATO agrees new eastern flank deployment', at: [4.35, 50.85], km: 150, tag: 'org' },
  { t: 'IAEA inspectors report enrichment increase', at: [16.37, 48.21], km: 150, tag: 'org' },
  { t: 'OPEC+ extends production cuts', at: [16.37, 48.21], km: 150, tag: 'org' },
  { t: 'Hamas rejects latest proposal', at: [34.47, 31.5], km: 150, tag: 'org' },
  { t: 'Houthis claim attack on commercial vessel', at: [44.21, 15.35], km: 300, tag: 'org' },
  { t: 'Hezbollah fires rockets across the border', at: [35.4, 33.2], km: 150, tag: 'org' },
  { t: 'Taliban ban women from university courses', at: [69.18, 34.53], km: 200, tag: 'org' },
  { t: 'Wagner fighters redeployed, report says', at: [37.62, 55.75], km: 200, tag: 'org' },
  { t: 'M23 rebels seize another town', at: [29.22, -1.68], km: 200, tag: 'org' },
  { t: 'ICC prosecutor requests arrest warrants', at: [4.3, 52.08], km: 150, tag: 'org' },

  /* ---------- companies → headquarters ---------- */
  { t: 'Toyota recalls one million vehicles over airbag fault', at: [136.91, 35.18], km: 200, tag: 'company' },
  { t: 'TSMC raises capital spending forecast', at: [120.97, 24.8], km: 200, tag: 'company' },
  { t: 'Nvidia results beat expectations again', at: [-121.96, 37.35], km: 200, tag: 'company' },
  { t: 'Gazprom halts flows on key pipeline', at: [30.36, 59.93], km: 250, tag: 'company' },
  { t: 'Aramco profit falls on lower crude prices', at: [50.15, 26.29], km: 250, tag: 'company' },
  { t: 'Rheinmetall wins new ammunition contract', at: [6.78, 51.23], km: 250, tag: 'company' },

  /* ---------- seats of power ---------- */
  { t: 'Kremlin dismisses reports of mobilisation', at: [37.62, 55.75], km: 100, tag: 'seat' },
  { t: 'Downing Street confirms date for election', at: [-0.13, 51.5], km: 100, tag: 'seat' },
  { t: 'White House unveils new sanctions package', at: [-77.04, 38.9], km: 100, tag: 'seat' },
  { t: 'Wall Street closes higher after inflation data', at: [-74.01, 40.71], km: 100, tag: 'seat' },
  { t: 'Vatican announces papal trip', at: [12.45, 41.9], km: 100, tag: 'seat' },

  /* ---------- geographic features / chokepoints ---------- */
  { t: 'Tanker attacked in the Red Sea', at: [38.0, 20.0], km: 900, tag: 'feature' },
  { t: 'Shipping reroutes away from Suez Canal', at: [32.35, 30.7], km: 200, tag: 'feature' },
  { t: 'Drought cuts traffic through the Panama Canal', at: [-79.68, 9.08], km: 200, tag: 'feature' },
  { t: 'Iran seizes vessel near the Strait of Hormuz', at: [56.5, 26.6], km: 400, tag: 'feature' },
  { t: 'Chinese coast guard shadows patrol in the South China Sea', at: [114.0, 14.0], km: 900, tag: 'feature' },
  { t: 'Undersea cable damaged in the Baltic Sea', at: [19.0, 58.0], km: 900, tag: 'feature' },

  /* ---------- genuinely placeless: pinning anything is wrong ---------- */
  { t: 'Global markets rally on rate cut hopes', at: null, tag: 'negative' },
  { t: 'What is quantum computing? A short explainer', at: null, tag: 'negative' },
  { t: 'AI ethics researchers publish new framework', at: null, tag: 'negative' },
  { t: 'Bitcoin slips below key level', at: null, tag: 'negative' },
  { t: 'Study links sleep to heart health', at: null, tag: 'negative' },
  { t: 'Five tips to cut your energy bill', at: null, tag: 'negative' },
  { t: 'Oil prices steady ahead of data', at: null, tag: 'negative' },
  { t: 'How to protect your passwords online', at: null, tag: 'negative' },

  /* ---------- Japanese ---------- */
  { t: 'ガザで停戦協議、イスラエル首相が表明', at: [34.47, 31.5], km: 150, tag: 'lang-ja' },
  { t: 'ロシア軍がハルキウを砲撃　ウクライナ東部', at: [36.23, 49.99], km: 150, tag: 'lang-ja' },
  { t: '能登半島で震度5強の地震', at: [136.9, 37.3], km: 150, tag: 'lang-ja' },
  { t: '台湾海峡で中国軍が演習', at: [119.5, 24.4], km: 300, tag: 'lang-ja' },
  { t: '沖縄県で米軍機が緊急着陸', at: [127.68, 26.21], km: 150, tag: 'lang-ja' },
  { t: '東京都心で記録的な大雨', at: [139.69, 35.69], km: 150, tag: 'lang-ja' },
  { t: 'ワシントンで米中外相が会談、南シナ海を協議', at: [114.0, 14.0], km: 900, tag: 'lang-ja' },
  { t: 'イスラエル軍がラファに空爆', at: [34.25, 31.29], km: 100, tag: 'lang-ja' },
  { t: 'スーダンのダルフールで戦闘激化', at: [24.0, 13.5], km: 300, tag: 'lang-ja' },
  { t: '北朝鮮が弾道ミサイル発射　日本海に落下', at: [125.76, 39.04], km: 700, tag: 'lang-ja' },
  { t: 'トヨタが100万台をリコール', at: [136.91, 35.18], km: 250, tag: 'lang-ja' },
  { t: '国連安保理が緊急会合', at: [-74.0, 40.71], km: 150, tag: 'lang-ja' },
  { t: '世界市場は上昇、金利観測で', at: null, tag: 'lang-ja' },
  { t: 'ドバイで国際会議が開幕', at: [55.27, 25.2], km: 150, tag: 'lang-ja' },
  { t: 'フクシマ第一原発の処理水を放出', at: [140.47, 37.75], km: 200, tag: 'lang-ja' },

  /* ---------- German ---------- */
  { t: 'Erdbeben erschüttert die Türkei', at: [35.0, 39.0], km: 900, tag: 'lang-de' },
  { t: 'Angriff auf Charkiw: mehrere Verletzte', at: [36.23, 49.99], km: 150, tag: 'lang-de' },
  { t: 'Bundestag beschließt neues Sicherheitspaket', at: [13.38, 52.52], km: 150, tag: 'lang-de' },
  { t: 'Proteste in Tiflis gegen neues Gesetz', at: [44.83, 41.72], km: 150, tag: 'lang-de' },
  { t: 'Schwere Überschwemmungen in München', at: [11.58, 48.14], km: 150, tag: 'lang-de' },
  { t: 'EU-Gipfel in Brüssel berät über Ukraine', at: [31.5, 49.0], km: 900, tag: 'lang-de' },

  /* ---------- Russian ---------- */
  { t: 'Взрыв прогремел в Белгороде', at: [36.59, 50.6], km: 150, tag: 'lang-ru' },
  { t: 'В Киеве объявлена воздушная тревога', at: [30.52, 50.45], km: 150, tag: 'lang-ru' },
  { t: 'Землетрясение произошло у берегов Японии', at: [138.0, 37.0], km: 900, tag: 'lang-ru' },
  { t: 'Наводнение в Германии: эвакуированы жители', at: [10.0, 51.0], km: 900, tag: 'lang-ru' },
  { t: 'Переговоры в Женеве завершились без результата', at: [6.14, 46.2], km: 150, tag: 'lang-ru' },
  { t: 'Обстрел Харькова повредил инфраструктуру', at: [36.23, 49.99], km: 150, tag: 'lang-ru' },

  /* ---------- Spanish ---------- */
  { t: 'Terremoto en el norte de Chile deja daños', at: [-71.3, -35.7], km: 900, tag: 'lang-es' },
  { t: 'Inundaciones en Valencia dejan decenas de muertos', at: [-0.38, 39.47], km: 200, tag: 'lang-es' },
  { t: 'Protestas en Buenos Aires contra el ajuste', at: [-58.38, -34.6], km: 150, tag: 'lang-es' },
  { t: 'Ataque israelí en Rafah deja víctimas', at: [34.25, 31.29], km: 100, tag: 'lang-es' },
  { t: 'La Habana sufre nuevo apagón general', at: [-82.38, 23.13], km: 150, tag: 'lang-es' },
  { t: 'Cumbre en Bruselas sobre la guerra en Ucrania', at: [31.5, 49.0], km: 900, tag: 'lang-es' },

  /* ---------- description carries the location, title does not ---------- */
  { t: 'Death toll rises after overnight strikes', d: 'Rescuers worked through the night in Kharkiv after a missile hit a residential block.', at: [36.23, 49.99], km: 150, tag: 'desc' },
  { t: 'Ceasefire talks resume', d: 'Negotiators met in Doha to discuss a truce in Gaza.', at: [34.47, 31.5], km: 200, tag: 'desc' },
  { t: 'Central bank holds rates', d: 'The decision by the Bank of Japan keeps policy unchanged in Tokyo.', at: [139.69, 35.69], km: 150, tag: 'desc' },

  /* ---------- publisher name must never geolocate the story ---------- */
  { t: 'Ceasefire talks continue', d: 'Officials met to discuss the truce.', pub: 'The Moscow Times', at: null, tag: 'publisher' },
  { t: 'Fighting intensifies around Goma', pub: 'Reuters', at: [29.22, -1.68], km: 150, tag: 'publisher' },
  { t: 'Markets steady after data', pub: 'Kyiv Post', at: null, tag: 'publisher' }
];

export const TAGS = [...new Set(CORPUS.map((c) => c.tag))];
