/* ============================================================================
 *  IntMap · NewsGeo HELD-OUT set  (#R161)
 * ----------------------------------------------------------------------------
 *  The corpus in newsgeo-corpus.mjs drove development, so its score is a
 *  training number. This file was written AFTERWARDS, against the finished
 *  engine, and is scored ONCE — no weight was tuned to it. It is the honest
 *  generalisation estimate, and the regression test asserts against it too.
 *  Same schema as the corpus.
 * ==========================================================================*/
export const HOLDOUT = [
  { t: 'At least 30 killed in bus crash near Nairobi', at: [36.82, -1.29], km: 150, tag: 'basic' },
  { t: 'Volcano erupts again on Iceland peninsula', at: [-19.0, 65.0], km: 900, tag: 'basic' },
  { t: 'Typhoon makes landfall in the Philippines', at: [122.0, 12.0], km: 900, tag: 'basic' },
  { t: 'Heavy snowfall paralyses Istanbul', at: [28.98, 41.01], km: 150, tag: 'basic' },
  { t: 'Prison break reported in Port-au-Prince', at: [-72.34, 18.54], km: 150, tag: 'basic' },
  { t: 'Train derails outside Prague', at: [14.42, 50.09], km: 150, tag: 'basic' },
  { t: 'Gunmen storm police station in Karachi', at: [67.01, 24.86], km: 150, tag: 'basic' },
  { t: 'Cyclone leaves trail of destruction in Mozambique', at: [35.5, -18.3], km: 900, tag: 'basic' },

  { t: 'Fighting spreads to Bukavu as Congo appeals for help', at: [28.85, -2.51], km: 200, tag: 'hierarchy' },
  { t: 'Poland scrambles jets after drone crosses into Lublin region', at: [19.5, 52.0], km: 900, tag: 'hierarchy' },
  { t: 'Iran executes protesters, rights groups say, as unrest hits Isfahan', at: [51.68, 32.66], km: 200, tag: 'hierarchy' },
  { t: 'Egypt reopens Alexandria terminal after weeks of closure', at: [29.92, 31.2], km: 200, tag: 'hierarchy' },
  { t: 'Deadly floods hit Rio de Janeiro state in Brazil', at: [-43.2, -22.91], km: 200, tag: 'hierarchy' },

  { t: 'Seoul says North Korea fired artillery near the border', at: [125.76, 39.04], km: 700, tag: 'dateline' },
  { t: 'Washington announces fresh sanctions on Belarus', at: [28.0, 53.7], km: 900, tag: 'dateline' },
  { t: 'Paris urges restraint after clashes in Bamako', at: [-8.0, 12.65], km: 200, tag: 'dateline' },
  { t: 'Downing Street comments on unrest in Nairobi', at: [36.82, -1.29], km: 200, tag: 'dateline' },
  { t: 'G7 meeting in Rome discusses reconstruction of Kharkiv', at: [36.23, 49.99], km: 200, tag: 'dateline' },
  { t: 'Tokyo protests Russian exercise near the Kuril Islands', at: [147.0, 45.5], km: 300, tag: 'dateline' },

  { t: 'Toledo cathedral restoration begins in central Spain', at: [-4.02, 39.86], km: 200, tag: 'ambiguity' },
  { t: 'Ohio: Toledo schools closed by winter storm', at: [-83.55, 41.65], km: 200, tag: 'ambiguity' },
  { t: 'Santiago protests grow across Chile', at: [-70.65, -33.45], km: 200, tag: 'ambiguity' },
  { t: 'Richmond, Virginia removes final monument', at: [-77.44, 37.54], km: 200, tag: 'ambiguity' },
  { t: 'Newcastle upon Tyne unveils regeneration plan', at: [-1.61, 54.98], km: 200, tag: 'ambiguity' },
  { t: 'Perth heatwave breaks records in Western Australia', at: [115.86, -31.95], km: 250, tag: 'ambiguity' },

  { t: 'Sydney Sweeney joins new drama series', at: null, tag: 'trap' },
  { t: 'Manchester United appoints new manager', at: [-2.24, 53.48], km: 150, tag: 'trap' },
  { t: 'Kyoto Protocol anniversary marked by climate groups', at: null, tag: 'trap' },
  { t: 'South China Morning Post names new editor', at: null, tag: 'trap' },
  { t: 'Vienna Convention cited in diplomatic row', at: null, tag: 'trap' },

  { t: 'Nice hosts European film festival in France', at: [7.27, 43.7], km: 200, tag: 'weak' },
  { t: 'Jordan reopens border crossing with Iraq', at: [36.5, 31.2], km: 900, tag: 'weak' },
  { t: 'Turkey inflation slows for a third month', at: null, tag: 'weak' },

  { t: 'IAEA warns over Zaporizhzhia plant safety', at: [35.14, 47.84], km: 200, tag: 'org' },
  { t: 'OPEC members meet to review output', at: [16.37, 48.21], km: 200, tag: 'org' },
  { t: 'Al-Shabaab claims responsibility for the attack', at: [45.34, 2.05], km: 300, tag: 'org' },
  { t: 'Islamic State claims bombing', at: [38.99, 35.95], km: 300, tag: 'org' },

  { t: 'Samsung unveils new chip roadmap', at: [126.98, 37.57], km: 250, tag: 'company' },
  { t: 'Airbus lifts delivery target', at: [1.44, 43.6], km: 250, tag: 'company' },
  { t: 'Huawei posts revenue rebound', at: [114.06, 22.54], km: 250, tag: 'company' },

  { t: 'Traffic through the Bosphorus suspended', at: [29.06, 41.12], km: 200, tag: 'feature' },
  { t: 'Migrant boat sinks in the Mediterranean', at: [16.0, 35.0], km: 900, tag: 'feature' },
  { t: 'Ships avoid Bab el-Mandeb after attacks', at: [43.33, 12.58], km: 300, tag: 'feature' },

  { t: 'Nobel prize awarded for medicine research', at: null, tag: 'negative' },
  { t: 'Ten ways to sleep better tonight', at: null, tag: 'negative' },
  { t: 'Stocks end mixed as investors weigh earnings', at: null, tag: 'negative' },
  { t: 'Scientists discover new exoplanet', at: null, tag: 'negative' },

  { t: 'イスラエル軍がヨルダン川西岸で作戦', at: [35.3, 31.95], km: 200, tag: 'lang-ja' },
  { t: '大阪で震度4の地震', at: [135.5, 34.69], km: 200, tag: 'lang-ja' },
  { t: 'スーダンの首都ハルツームで戦闘', at: [32.53, 15.5], km: 200, tag: 'lang-ja' },
  { t: '中国海警局が南シナ海で船を放水', at: [114.0, 14.0], km: 900, tag: 'lang-ja' },
  { t: 'ロンドンで大規模デモ', at: [-0.13, 51.51], km: 200, tag: 'lang-ja' },
  { t: '米連邦準備制度が利下げを決定', at: [-77.04, 38.9], km: 200, tag: 'lang-ja' },
  { t: 'ウクライナのゼレンスキー大統領がキーウで会見', at: [30.52, 50.45], km: 200, tag: 'lang-ja' },

  { t: 'Anschlag in Kabul: mehrere Tote', at: [69.18, 34.53], km: 200, tag: 'lang-de' },
  { t: 'Waldbrände wüten in Griechenland', at: [22.0, 39.0], km: 900, tag: 'lang-de' },
  { t: 'Streiks legen den Verkehr in Frankreich lahm', at: [2.2, 46.5], km: 900, tag: 'lang-de' },

  { t: 'Наводнение в Одессе повредило порт', at: [30.73, 46.48], km: 200, tag: 'lang-ru' },
  { t: 'Пожар в Стамбуле унёс жизни', at: [28.98, 41.01], km: 200, tag: 'lang-ru' },
  { t: 'Взрыв на заводе в Дагестане', at: [47.0, 42.8], km: 300, tag: 'lang-ru' },

  { t: 'Sismo de magnitud 6 sacude Perú', at: [-75.0, -9.2], km: 900, tag: 'lang-es' },
  { t: 'Incendio destruye mercado en Bogotá', at: [-74.07, 4.71], km: 200, tag: 'lang-es' },
  { t: 'Elecciones en México: resultados preliminares', at: [-102.0, 23.5], km: 900, tag: 'lang-es' }
];
