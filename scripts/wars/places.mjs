/* ============================================================================
 *  IntMap · WAR GAZETTEER — the places the front lines are quoted through   (#R349)
 * ----------------------------------------------------------------------------
 *  A front position in the historical record is a SENTENCE, not a polyline: «on 5 December 1941 the
 *  line ran from Leningrad through Tikhvin, Kalinin, Klin, Tula and Yelets to Rostov». This file is
 *  the only place that turns the names in such a sentence into coordinates, so a line is authored as
 *  the record states it and the geometry is looked up rather than invented.
 *
 *  ⚠ THE COORDINATE IS THE PLACE, NOT THE LINE. A front ran NEAR these towns, not through their town
 *  halls; the wars.json header says so and the layer repeats it. What this table buys is that two
 *  lines quoting «Kursk» cannot disagree about where Kursk is, and that a mistyped digit is a place
 *  in the wrong country rather than a silent kink in a front.
 *
 *  Entries are [lon, lat, ISO2] — plus a fourth field '!' on the six names the bundled gazetteer
 *  knows as a DIFFERENT place. Kalinin here is the wartime name of Tver; the gazetteer's Kalinin is a
 *  town a thousand kilometres away. Midway here is the atoll; the gazetteer's Midway is a town in the
 *  United States. Opting those six out by name is narrower than loosening the tolerance for all of
 *  them, and it leaves a written reason where the exception is.
 *
 *  The ISO2 is not decoration: scripts/build-wars.mjs cross-checks
 *  every name that also exists in data/gazetteer-world.json.gz against that country's own row and
 *  fails if the two are more than 30 km apart. The bundled gazetteer is a settlement list with a
 *  population floor, so it does not carry Ypres or Kursk — the check covers what it covers, and the
 *  build prints how many of the entries it was able to prove.
 * ==========================================================================*/
export const PLACES = {
  /* ── Western Front (both wars) ───────────────────────────────────────────────────────────── */
  'Nieuwpoort': [2.750, 51.130, 'BE'], 'Diksmuide': [2.862, 51.032, 'BE'], 'Ypres': [2.885, 50.851, 'BE'],
  'Bruges': [3.224, 51.209, 'BE'], 'Ghent': [3.717, 51.054, 'BE'], 'Antwerp': [4.402, 51.219, 'BE'],
  'Brussels': [4.352, 50.847, 'BE'], 'Namur': [4.867, 50.467, 'BE'], 'Liege': [5.577, 50.633, 'BE'],
  'Mons': [3.952, 50.454, 'BE'], 'Charleroi': [4.444, 50.411, 'BE'], 'Bastogne': [5.720, 50.000, 'BE'],
  'Armentieres': [2.881, 50.688, 'FR'], 'Lens': [2.832, 50.430, 'FR'], 'Arras': [2.777, 50.291, 'FR'],
  'Bapaume': [2.851, 50.103, 'FR'], 'Albert': [2.650, 50.001, 'FR'], 'Peronne': [2.933, 49.929, 'FR'],
  'Cambrai': [3.235, 50.176, 'FR'], 'Saint-Quentin': [3.287, 49.848, 'FR'], 'Noyon': [3.000, 49.583, 'FR'],
  'Montdidier': [2.567, 49.649, 'FR'], 'Compiegne': [2.826, 49.418, 'FR'], 'Soissons': [3.329, 49.382, 'FR'],
  'Laon': [3.624, 49.564, 'FR'], 'Reims': [4.033, 49.258, 'FR'], 'Chateau-Thierry': [3.404, 49.047, 'FR'],
  'Meaux': [2.888, 48.960, 'FR'], 'Vitry-le-Francois': [4.585, 48.724, 'FR'], 'Sedan': [4.943, 49.702, 'FR'],
  'Verdun': [5.383, 49.160, 'FR'], 'Saint-Mihiel': [5.545, 48.891, 'FR'], 'Pont-a-Mousson': [6.055, 48.905, 'FR'],
  'Metz': [6.176, 49.120, 'FR'], 'Thionville': [6.168, 49.359, 'FR'], 'Nancy': [6.184, 48.692, 'FR'],
  'Luneville': [6.495, 48.593, 'FR'], 'Saint-Die': [6.949, 48.284, 'FR'], 'Thann': [7.104, 47.813, 'FR'],
  'Pfetterhouse': [7.226, 47.514, 'FR'], 'Belfort': [6.864, 47.638, 'FR'], 'Amiens': [2.296, 49.894, 'FR'],
  'Dunkirk': [2.377, 51.034, 'FR'], 'Abbeville': [1.834, 50.106, 'FR'], 'Paris': [2.352, 48.857, 'FR'],
  'Orleans': [1.909, 47.902, 'FR'], 'Tours': [0.690, 47.394, 'FR'], 'Bordeaux': [-0.579, 44.838, 'FR'],
  'Vichy': [3.426, 46.128, 'FR'], 'Moulins': [3.334, 46.564, 'FR'], 'Chalon-sur-Saone': [4.854, 46.780, 'FR'],
  'Saint-Jean-Pied-de-Port': [-1.238, 43.163, 'FR'], 'Geneva': [6.143, 46.204, 'CH'],
  'Caen': [-0.370, 49.183, 'FR'], 'Saint-Lo': [-1.089, 49.116, 'FR'], 'Cherbourg': [-1.617, 49.639, 'FR'],
  'Avranches': [-1.357, 48.685, 'FR'], 'Falaise': [-0.196, 48.892, 'FR'], 'Bayeux': [-0.703, 49.277, 'FR'],
  'Le Havre': [0.107, 49.494, 'FR'], 'Rouen': [1.099, 49.443, 'FR'], 'Toulon': [5.930, 43.125, 'FR'],
  'Marseille': [5.370, 43.297, 'FR'], 'Lyon': [4.836, 45.764, 'FR'], 'Grenoble': [5.724, 45.189, 'FR'],
  'Strasbourg': [7.751, 48.573, 'FR'], 'Mulhouse': [7.340, 47.750, 'FR'], 'Colmar': [7.359, 48.079, 'FR'],
  'Aachen': [6.084, 50.775, 'DE'], 'Cologne': [6.960, 50.937, 'DE'], 'Remagen': [7.229, 50.579, 'DE'],
  'Kassel': [9.493, 51.312, 'DE'], 'Leipzig': [12.374, 51.340, 'DE'], 'Torgau': [13.006, 51.560, 'DE'],
  'Magdeburg': [11.628, 52.126, 'DE'], 'Hamburg': [9.994, 53.551, 'DE'], 'Lubeck': [10.686, 53.869, 'DE'],
  'Bremen': [8.808, 53.076, 'DE'], 'Munich': [11.582, 48.135, 'DE'], 'Nuremberg': [11.078, 49.454, 'DE'],
  'Stuttgart': [9.182, 48.776, 'DE'], 'Basel': [7.588, 47.560, 'CH'], 'Nijmegen': [5.852, 51.842, 'NL'],
  'Arnhem': [5.898, 51.985, 'NL'], 'Rotterdam': [4.478, 51.924, 'NL'], 'Amsterdam': [4.895, 52.370, 'NL'],
  'Groningen': [6.567, 53.219, 'NL'], 'Luxembourg': [6.130, 49.611, 'LU'],

  /* ── Eastern Front (both wars) ───────────────────────────────────────────────────────────── */
  'Memel': [21.135, 55.703, 'LT'], 'Kaunas': [23.904, 54.898, 'LT'], 'Vilnius': [25.280, 54.687, 'LT'],
  'Riga': [24.105, 56.946, 'LV'], 'Daugavpils': [26.536, 55.875, 'LV'], 'Tallinn': [24.754, 59.437, 'EE'],
  'Narva': [28.190, 59.377, 'EE'], 'Pskov': [28.336, 57.819, 'RU'], 'Novgorod': [31.270, 58.521, 'RU'],
  'Leningrad': [30.316, 59.939, 'RU'], 'Tikhvin': [33.539, 59.645, 'RU'], 'Staraya Russa': [31.360, 57.993, 'RU'],
  'Velikiye Luki': [30.517, 56.331, 'RU'], 'Rzhev': [34.329, 56.263, 'RU'], 'Kalinin': [35.912, 56.859, 'RU', '!'],
  'Klin': [36.728, 56.333, 'RU'], 'Istra': [36.869, 55.921, 'RU'], 'Moscow': [37.618, 55.756, 'RU'],
  'Tula': [37.618, 54.204, 'RU'], 'Yelets': [38.501, 52.622, 'RU'], 'Kursk': [36.187, 51.731, 'RU'],
  'Orel': [36.062, 52.967, 'RU'], 'Bryansk': [34.365, 53.244, 'RU'], 'Smolensk': [32.051, 54.778, 'RU'],
  'Voronezh': [39.200, 51.672, 'RU'], 'Stalingrad': [44.498, 48.714, 'RU'], 'Elista': [44.256, 46.308, 'RU'],
  'Mozdok': [44.660, 43.744, 'RU'], 'Novorossiysk': [37.768, 44.724, 'RU'], 'Rostov-on-Don': [39.720, 47.222, 'RU'],
  'Taganrog': [38.912, 47.236, 'RU'], 'Kalach': [43.529, 48.688, 'RU', '!'], 'Millerovo': [40.397, 48.923, 'RU'],
  'Kotelnikovo': [43.144, 47.632, 'RU'], 'Murmansk': [33.083, 68.970, 'RU'], 'Petsamo': [31.170, 69.550, 'RU'],
  'Kandalaksha': [32.412, 67.157, 'RU'], 'Kestenga': [31.780, 65.885, 'RU'],
  'Medvezhyegorsk': [34.464, 62.913, 'RU'], 'Lodeynoye Pole': [33.552, 60.727, 'RU'],
  'Vyborg': [28.752, 60.708, 'RU'], 'Konigsberg': [20.511, 54.710, 'RU'],
  'Vitebsk': [30.209, 55.184, 'BY'], 'Polotsk': [28.786, 55.487, 'BY'], 'Nevel': [29.926, 56.023, 'RU'],
  'Orsha': [30.421, 54.509, 'BY'], 'Mogilev': [30.334, 53.900, 'BY'], 'Gomel': [31.000, 52.442, 'BY'],
  'Minsk': [27.567, 53.902, 'BY'], 'Baranavichy': [26.019, 53.132, 'BY'], 'Pinsk': [26.096, 52.121, 'BY'],
  'Grodno': [23.830, 53.677, 'BY'], 'Brest': [23.734, 52.098, 'BY'],
  'Kyiv': [30.524, 50.450, 'UA'], 'Zhytomyr': [28.658, 50.255, 'UA'], 'Vinnytsia': [28.482, 49.233, 'UA'],
  'Uman': [30.221, 48.748, 'UA'], 'Kharkiv': [36.231, 49.988, 'UA'], 'Dnipro': [35.045, 48.465, 'UA'],
  'Zaporizhzhia': [35.139, 47.838, 'UA'], 'Melitopol': [35.365, 46.844, 'UA'], 'Kryvyi Rih': [33.391, 47.909, 'UA'],
  'Mykolaiv': [31.995, 46.975, 'UA'], 'Odesa': [30.733, 46.483, 'UA'], 'Kherson': [32.618, 46.635, 'UA'],
  'Sevastopol': [33.523, 44.616, 'UA'], 'Kerch': [36.470, 45.356, 'UA'], 'Perekop': [33.700, 46.160, 'UA'],
  'Kovel': [24.710, 51.217, 'UA'], 'Lutsk': [25.336, 50.747, 'UA'], 'Rivne': [26.251, 50.619, 'UA'],
  'Lviv': [24.032, 49.842, 'UA'], 'Ternopil': [25.595, 49.554, 'UA'], 'Chernivtsi': [25.935, 48.292, 'UA'],
  'Warsaw': [21.012, 52.230, 'PL'], 'Lodz': [19.457, 51.759, 'PL'], 'Lublin': [22.567, 51.247, 'PL'],
  'Deblin': [21.850, 51.559, 'PL'], 'Krakow': [19.945, 50.065, 'PL'], 'Tarnow': [20.986, 50.013, 'PL'],
  'Gorlice': [21.160, 49.657, 'PL'], 'Przemysl': [22.783, 49.784, 'PL'], 'Sandomierz': [21.749, 50.681, 'PL'],
  'Danzig': [18.646, 54.352, 'PL'], 'Poznan': [16.926, 52.407, 'PL'], 'Katowice': [19.024, 50.259, 'PL'],
  'Bydgoszcz': [18.008, 53.123, 'PL'], 'Olsztynek': [20.284, 53.585, 'PL'],
  'Kostrzyn': [14.649, 52.590, 'PL', '!'], 'Wroclaw': [17.038, 51.107, 'PL'], 'Szczecin': [14.552, 53.429, 'PL'],
  'Berlin': [13.405, 52.520, 'DE'], 'Dresden': [13.738, 51.050, 'DE'], 'Prague': [14.418, 50.088, 'CZ'],
  'Brno': [16.607, 49.195, 'CZ'], 'Vienna': [16.373, 48.208, 'AT'], 'Budapest': [19.040, 47.498, 'HU'],
  'Debrecen': [21.629, 47.532, 'HU'], 'Bratislava': [17.107, 48.149, 'SK'],
  'Bucharest': [26.103, 44.427, 'RO'], 'Iasi': [27.588, 47.157, 'RO'], 'Ploiesti': [26.023, 44.936, 'RO'],
  'Constanta': [28.635, 44.173, 'RO'], 'Chisinau': [28.858, 47.011, 'MD'], 'Braila': [27.960, 45.270, 'RO'],
  'Sofia': [23.322, 42.698, 'BG'], 'Belgrade': [20.457, 44.787, 'RS'], 'Nis': [21.896, 43.321, 'RS'],
  'Zagreb': [15.977, 45.815, 'HR'], 'Sarajevo': [18.413, 43.856, 'BA'], 'Skopje': [21.434, 41.998, 'MK'],

  /* ── Italian Front (both wars) ───────────────────────────────────────────────────────────── */
  'Stelvio Pass': [10.454, 46.529, 'IT'], 'Tonale Pass': [10.586, 46.257, 'IT'], 'Rovereto': [11.043, 45.890, 'IT'],
  'Asiago': [11.510, 45.877, 'IT'], 'Feltre': [11.905, 46.018, 'IT'], 'Cortina': [12.136, 46.537, 'IT'],
  'Tolmezzo': [13.017, 46.402, 'IT'], 'Kobarid': [13.579, 46.246, 'SI'], 'Gorizia': [13.622, 45.941, 'IT'],
  'Monfalcone': [13.533, 45.806, 'IT'], 'Trieste': [13.777, 45.649, 'IT'], 'Udine': [13.236, 46.063, 'IT'],
  'Cortellazzo': [12.635, 45.545, 'IT'], 'Montello': [12.128, 45.795, 'IT', '!'], 'Vittorio Veneto': [12.302, 45.977, 'IT'],
  'Trento': [11.122, 46.070, 'IT'], 'Salerno': [14.760, 40.681, 'IT'], 'Naples': [14.269, 40.851, 'IT'],
  'Cassino': [13.830, 41.489, 'IT'], 'Anzio': [12.622, 41.447, 'IT'], 'Rome': [12.496, 41.903, 'IT'],
  'Ancona': [13.518, 43.616, 'IT'], 'Florence': [11.256, 43.770, 'IT'], 'Rimini': [12.568, 44.061, 'IT'],
  'Bologna': [11.343, 44.494, 'IT'], 'Pisa': [10.401, 43.723, 'IT'], 'La Spezia': [9.827, 44.107, 'IT'],
  'Ravenna': [12.202, 44.418, 'IT'], 'Genoa': [8.947, 44.406, 'IT'], 'Venice': [12.327, 45.438, 'IT'],
  'Termoli': [14.995, 42.000, 'IT'], 'Vasto': [14.708, 42.112, 'IT'], 'Gaeta': [13.570, 41.213, 'IT'],
  'Palermo': [13.361, 38.116, 'IT'], 'Messina': [15.552, 38.194, 'IT'], 'Taranto': [17.230, 40.464, 'IT'],
  'Bari': [16.872, 41.118, 'IT'],

  /* ── Balkans & the Salonika front ────────────────────────────────────────────────────────── */
  'Bitola': [21.334, 41.031, 'MK'], 'Thessaloniki': [22.944, 40.640, 'GR'], 'Doiran': [22.750, 41.200, 'MK'],
  'Struma': [23.850, 40.750, 'GR'], 'Vlore': [19.487, 40.468, 'AL'], 'Athens': [23.728, 37.984, 'GR'],
  'Corinth': [22.933, 37.941, 'GR'], 'Larissa': [22.418, 39.639, 'GR'], 'Ioannina': [20.851, 39.665, 'GR'],
  'Tirana': [19.819, 41.328, 'AL'], 'Heraklion': [25.144, 35.339, 'GR'],

  /* ── Middle East ─────────────────────────────────────────────────────────────────────────── */
  'Cape Helles': [26.180, 40.045, 'TR'], 'Anzac Cove': [26.276, 40.238, 'TR'], 'Suvla': [26.290, 40.310, 'TR'],
  'Basra': [47.784, 30.508, 'IQ'], 'Kut': [45.818, 32.512, 'IQ'], 'Baghdad': [44.361, 33.312, 'IQ'],
  'Mosul': [43.119, 36.340, 'IQ'], 'Kirkuk': [44.392, 35.468, 'IQ'], 'Ramadi': [43.301, 33.421, 'IQ'],
  'Gaza': [34.466, 31.502, 'PS'], 'Beersheba': [34.790, 31.252, 'IL'], 'Jerusalem': [35.214, 31.768, 'IL'],
  'Jaffa': [34.755, 32.055, 'IL'], 'Megiddo': [35.184, 32.585, 'IL'], 'Damascus': [36.292, 33.513, 'SY'],
  'Aleppo': [37.161, 36.202, 'SY'], 'Beirut': [35.494, 33.888, 'LB'], 'Amman': [35.930, 31.955, 'JO'],
  'Aqaba': [35.006, 29.532, 'JO'], 'Suez': [32.530, 29.967, 'EG'], 'El Arish': [33.798, 31.132, 'EG'],
  'Rafah': [34.257, 31.288, 'PS'], 'Cairo': [31.236, 30.044, 'EG'], 'Alexandria': [29.919, 31.200, 'EG'],
  'Erzurum': [41.277, 39.904, 'TR'], 'Trabzon': [39.727, 41.005, 'TR'], 'Van': [43.380, 38.494, 'TR'],
  'Erzincan': [39.490, 39.746, 'TR'], 'Bitlis': [42.108, 38.401, 'TR'], 'Istanbul': [28.979, 41.008, 'TR'],
  'Tehran': [51.389, 35.689, 'IR'], 'Baku': [49.867, 40.409, 'AZ'], 'Tbilisi': [44.783, 41.716, 'GE'],
  'Batumi': [41.636, 41.643, 'GE'], 'Kars': [43.097, 40.602, 'TR'],

  /* ── North Africa ────────────────────────────────────────────────────────────────────────── */
  'Sidi Barrani': [25.923, 31.611, 'EG'], 'Sollum': [25.153, 31.567, 'EG'], 'Bardia': [25.089, 31.762, 'LY'],
  'Tobruk': [23.954, 32.090, 'LY'], 'Derna': [22.640, 32.766, 'LY'], 'Benghazi': [20.068, 32.119, 'LY'],
  'El Agheila': [19.222, 30.253, 'LY'], 'Sirte': [16.588, 31.205, 'LY'], 'Tripoli': [13.191, 32.887, 'LY'],
  'Mersa Matruh': [27.237, 31.353, 'EG'], 'El Alamein': [28.951, 30.831, 'EG'], 'Siwa': [25.519, 29.203, 'EG'],
  'Jaghbub': [24.520, 29.745, 'LY'], 'Kufra': [23.313, 24.203, 'LY'], 'Ghadames': [9.500, 30.133, 'LY'],
  'Mareth': [10.288, 33.643, 'TN'], 'Tunis': [10.181, 36.807, 'TN'], 'Bizerte': [9.873, 37.275, 'TN'],
  'Kasserine': [8.828, 35.181, 'TN'], 'Gabes': [10.098, 33.881, 'TN'], 'Algiers': [3.059, 36.754, 'DZ'],
  'Oran': [-0.642, 35.699, 'DZ'], 'Casablanca': [-7.589, 33.573, 'MA'], 'Addis Ababa': [38.757, 9.028, 'ET'],
  'Asmara': [38.933, 15.339, 'ER'], 'Mogadishu': [45.343, 2.047, 'SO'], 'Dakar': [-17.444, 14.693, 'SN'],

  /* ── East Asia & the Pacific ─────────────────────────────────────────────────────────────── */
  'Beijing': [116.407, 39.904, 'CN'], 'Tianjin': [117.201, 39.084, 'CN'], 'Taiyuan': [112.549, 37.857, 'CN'],
  'Baotou': [109.840, 40.658, 'CN'], 'Jinan': [117.000, 36.651, 'CN'], 'Xuzhou': [117.284, 34.205, 'CN'],
  'Kaifeng': [114.307, 34.797, 'CN'], 'Zhengzhou': [113.625, 34.747, 'CN'], 'Xian': [108.940, 34.341, 'CN'],
  'Shanghai': [121.474, 31.230, 'CN'], 'Nanjing': [118.797, 32.060, 'CN'], 'Wuhan': [114.305, 30.593, 'CN'],
  'Yichang': [111.291, 30.692, 'CN'], 'Changsha': [112.983, 28.194, 'CN'], 'Hengyang': [112.572, 26.894, 'CN'],
  'Guilin': [110.290, 25.274, 'CN'], 'Nanning': [108.367, 22.817, 'CN'], 'Guangzhou': [113.264, 23.129, 'CN'],
  'Fuzhou': [119.297, 26.074, 'CN'], 'Chongqing': [106.551, 29.563, 'CN'], 'Kunming': [102.833, 24.880, 'CN'],
  'Shenyang': [123.429, 41.796, 'CN'], 'Harbin': [126.535, 45.803, 'CN'], 'Hong Kong': [114.177, 22.302, 'HK'],
  'Singapore': [103.820, 1.352, 'SG'], 'Manila': [120.984, 14.599, 'PH'], 'Rangoon': [96.157, 16.841, 'MM'],
  'Mandalay': [96.084, 21.976, 'MM'], 'Imphal': [93.937, 24.817, 'IN'], 'Kohima': [94.111, 25.674, 'IN'],
  'Myitkyina': [97.395, 25.386, 'MM'], 'Bangkok': [100.502, 13.756, 'TH'], 'Hanoi': [105.834, 21.028, 'VN'],
  'Batavia': [106.845, -6.208, 'ID'], 'Port Moresby': [147.180, -9.478, 'PG'], 'Rabaul': [152.163, -4.196, 'PG'],
  'Guadalcanal': [160.150, -9.630, 'SB'], 'Tarawa': [172.977, 1.328, 'KI'], 'Saipan': [145.750, 15.180, 'MP'],
  'Guam': [144.794, 13.444, 'GU'], 'Peleliu': [134.244, 7.005, 'PW'], 'Leyte': [124.900, 10.900, 'PH', '!'],
  'Iwo Jima': [141.320, 24.780, 'JP'], 'Okinawa': [127.800, 26.340, 'JP'], 'Tokyo': [139.692, 35.690, 'JP'],
  'Hiroshima': [132.455, 34.385, 'JP'], 'Nagasaki': [129.874, 32.750, 'JP'], 'Pearl Harbor': [-157.950, 21.365, 'US'],
  'Midway': [-177.373, 28.208, 'US', '!'], 'Wake Island': [166.628, 19.280, 'UM'], 'Attu': [173.183, 52.913, 'US'],
  'Darwin': [130.842, -12.463, 'AU'], 'Kolkata': [88.363, 22.573, 'IN'], 'Colombo': [79.861, 6.927, 'LK'],
  'Nomonhan': [118.500, 47.700, 'CN'], 'Khalkhin Gol': [118.600, 47.750, 'MN'],

  /* ── Atlantic & Arctic ───────────────────────────────────────────────────────────────────── */
  'Narvik': [17.427, 68.438, 'NO'], 'Trondheim': [10.396, 63.430, 'NO'], 'Oslo': [10.752, 59.913, 'NO'],
  'Bergen': [5.325, 60.393, 'NO'], 'Copenhagen': [12.568, 55.676, 'DK'], 'Stockholm': [18.069, 59.329, 'SE'],
  'Helsinki': [24.938, 60.170, 'FI'], 'Reykjavik': [-21.940, 64.147, 'IS'], 'London': [-0.128, 51.507, 'GB'],
  'Scapa Flow': [-3.050, 58.900, 'GB'], 'Gibraltar': [-5.353, 36.141, 'GI'], 'Valletta': [14.514, 35.899, 'MT'],
  'Jutland': [7.500, 56.800, 'DK'], 'Coventry': [-1.510, 52.408, 'GB'], 'Dover': [1.313, 51.126, 'GB'],
  /* ── added for the WW2 lines: the Vichy demarcation, the desert flanks, Normandy, Karelia ── */
  'Mont-de-Marsan': [-0.500, 43.890, 'FR'], 'Libourne': [-0.243, 44.913, 'FR'], 'Confolens': [0.674, 46.013, 'FR'],
  'Vierzon': [2.070, 47.222, 'FR'], 'Angouleme': [0.156, 45.649, 'FR'], 'Barneville': [-1.760, 49.380, 'FR'],
  'Carentan': [-1.245, 49.303, 'FR'], 'Ouistreham': [-0.259, 49.279, 'FR'], 'Troyes': [4.075, 48.297, 'FR'],
  'Karlsruhe': [8.404, 49.007, 'DE'], 'Szczecin': [14.552, 53.429, 'PL'],
  'Qattara': [27.000, 29.600, 'EG'], 'Marada': [19.230, 29.230, 'LY'], 'Jalu': [21.550, 29.030, 'LY'],
  'Sumy': [34.800, 50.907, 'UA'],
  /* the two interlocking salients of July 1943: German at Orel (bulging east), Soviet at Kursk
     (bulging west). A line that misses them puts Orel under the wrong army. */
  'Bolkhov': [36.001, 53.443, 'RU'], 'Novosil': [37.045, 52.973, 'RU'],
  'Maloarkhangelsk': [36.463, 52.401, 'RU'], 'Sevsk': [34.491, 52.148, 'RU'],
  'Rylsk': [34.682, 51.566, 'RU'], 'Belgorod': [36.588, 50.596, 'RU'], 'Poltava': [34.551, 49.589, 'UA'], 'Izyum': [37.292, 49.185, 'UA'],
  /* the Verdun sector's front line ran through the fort, not through the town the town kept */
  'Douaumont': [5.437, 49.212, 'FR'], 'Sestroretsk': [29.966, 60.100, 'RU'], 'Litsa': [32.000, 69.400, 'RU'],
  'Pescara': [14.208, 42.464, 'IT'], 'Civitavecchia': [11.796, 42.094, 'IT'], 'Nanchang': [115.858, 28.683, 'CN'],
};
