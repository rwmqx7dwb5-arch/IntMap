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
 *  Entries are [lon, lat, ISO2] — plus a fourth field '!' on the seven names the bundled gazetteer
 *  knows as a DIFFERENT place. Kalinin here is the wartime name of Tver; the gazetteer's Kalinin is a
 *  town a thousand kilometres away. Midway here is the atoll; the gazetteer's Midway is a town in the
 *  United States. Zhijiang here is 芷江 in Hunan; the gazetteer's is 枝江 in Hubei. Opting those seven
 *  out by name is narrower than loosening the tolerance for all of them, and it leaves a written
 *  reason where the exception is.
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
  'Ghent': [3.717, 51.054, 'BE'], 'Antwerp': [4.402, 51.219, 'BE'],
  'Brussels': [4.352, 50.847, 'BE'], 'Namur': [4.867, 50.467, 'BE'], 'Liege': [5.577, 50.633, 'BE'],
  'Mons': [3.952, 50.454, 'BE'], 'Charleroi': [4.444, 50.411, 'BE'], 'Bastogne': [5.720, 50.000, 'BE'],
  'Armentieres': [2.881, 50.688, 'FR'], 'Lens': [2.832, 50.430, 'FR'], 'Arras': [2.777, 50.291, 'FR'],
  'Albert': [2.650, 50.001, 'FR'], 'Peronne': [2.933, 49.929, 'FR'],
  'Cambrai': [3.235, 50.176, 'FR'], 'Saint-Quentin': [3.287, 49.848, 'FR'], 'Noyon': [3.000, 49.583, 'FR'],
  'Montdidier': [2.567, 49.649, 'FR'], 'Compiegne': [2.826, 49.418, 'FR'], 'Soissons': [3.329, 49.382, 'FR'],
  'Laon': [3.624, 49.564, 'FR'], 'Reims': [4.033, 49.258, 'FR'], 'Chateau-Thierry': [3.404, 49.047, 'FR'],
  'Meaux': [2.888, 48.960, 'FR'], 'Vitry-le-Francois': [4.585, 48.724, 'FR'], 'Sedan': [4.943, 49.702, 'FR'],
  'Verdun': [5.383, 49.160, 'FR'], 'Saint-Mihiel': [5.545, 48.891, 'FR'], 'Pont-a-Mousson': [6.055, 48.905, 'FR'],
  'Metz': [6.176, 49.120, 'FR'], 'Nancy': [6.184, 48.692, 'FR'],
  'Luneville': [6.495, 48.593, 'FR'], 'Saint-Die': [6.949, 48.284, 'FR'], 'Thann': [7.104, 47.813, 'FR'],
  'Pfetterhouse': [7.226, 47.514, 'FR'], 'Belfort': [6.864, 47.638, 'FR'], 'Amiens': [2.296, 49.894, 'FR'],
  'Dunkirk': [2.377, 51.034, 'FR'], 'Abbeville': [1.834, 50.106, 'FR'], 'Paris': [2.352, 48.857, 'FR'],
  'Orleans': [1.909, 47.902, 'FR'], 'Tours': [0.690, 47.394, 'FR'], 'Bordeaux': [-0.579, 44.838, 'FR'],
  'Vichy': [3.426, 46.128, 'FR'], 'Moulins': [3.334, 46.564, 'FR'], 'Chalon-sur-Saone': [4.854, 46.780, 'FR'],
  'Saint-Jean-Pied-de-Port': [-1.238, 43.163, 'FR'], 'Geneva': [6.143, 46.204, 'CH'],
  'Caen': [-0.370, 49.183, 'FR'], 'Saint-Lo': [-1.089, 49.116, 'FR'], 'Falaise': [-0.196, 48.892, 'FR'], 'Bayeux': [-0.703, 49.277, 'FR'],
  'Le Havre': [0.107, 49.494, 'FR'], 'Rouen': [1.099, 49.443, 'FR'], 'Toulon': [5.930, 43.125, 'FR'],
  'Marseille': [5.370, 43.297, 'FR'], 'Lyon': [4.836, 45.764, 'FR'], 'Grenoble': [5.724, 45.189, 'FR'],
  'Strasbourg': [7.751, 48.573, 'FR'], 'Colmar': [7.359, 48.079, 'FR'],
  'Aachen': [6.084, 50.775, 'DE'], 'Cologne': [6.960, 50.937, 'DE'], 'Remagen': [7.229, 50.579, 'DE'],
  'Torgau': [13.006, 51.560, 'DE'],
  'Magdeburg': [11.628, 52.126, 'DE'], 'Hamburg': [9.994, 53.551, 'DE'], 'Bremen': [8.808, 53.076, 'DE'], 'Munich': [11.582, 48.135, 'DE'], 'Nuremberg': [11.078, 49.454, 'DE'],
  'Basel': [7.588, 47.560, 'CH'], 'Nijmegen': [5.852, 51.842, 'NL'],
  'Arnhem': [5.898, 51.985, 'NL'], 'Rotterdam': [4.478, 51.924, 'NL'], /* ── Eastern Front (both wars) ───────────────────────────────────────────────────────────── */
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
  'Vitebsk': [30.209, 55.184, 'BY'], 'Nevel': [29.926, 56.023, 'RU'],
  'Orsha': [30.421, 54.509, 'BY'], 'Mogilev': [30.334, 53.900, 'BY'], 'Gomel': [31.000, 52.442, 'BY'],
  'Minsk': [27.567, 53.902, 'BY'], 'Baranavichy': [26.019, 53.132, 'BY'], 'Pinsk': [26.096, 52.121, 'BY'],
  'Grodno': [23.830, 53.677, 'BY'], 'Brest': [23.734, 52.098, 'BY'],
  'Kyiv': [30.524, 50.450, 'UA'], 'Zhytomyr': [28.658, 50.255, 'UA'], 'Uman': [30.221, 48.748, 'UA'], 'Kharkiv': [36.231, 49.988, 'UA'], 'Dnipro': [35.045, 48.465, 'UA'],
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
  'Debrecen': [21.629, 47.532, 'HU'], 'Bucharest': [26.103, 44.427, 'RO'], 'Iasi': [27.588, 47.157, 'RO'], 'Ploiesti': [26.023, 44.936, 'RO'],
  'Chisinau': [28.858, 47.011, 'MD'], 'Braila': [27.960, 45.270, 'RO'],
  'Sofia': [23.322, 42.698, 'BG'], 'Belgrade': [20.457, 44.787, 'RS'], 'Nis': [21.896, 43.321, 'RS'],
  'Zagreb': [15.977, 45.815, 'HR'], 'Sarajevo': [18.413, 43.856, 'BA'], /* ── Italian Front (both wars) ───────────────────────────────────────────────────────────── */
  'Stelvio Pass': [10.454, 46.529, 'IT'], 'Tonale Pass': [10.586, 46.257, 'IT'], 'Rovereto': [11.043, 45.890, 'IT'],
  'Asiago': [11.510, 45.877, 'IT'], 'Feltre': [11.905, 46.018, 'IT'], 'Cortina': [12.136, 46.537, 'IT'],
  'Tolmezzo': [13.017, 46.402, 'IT'], 'Kobarid': [13.579, 46.246, 'SI'], 'Gorizia': [13.622, 45.941, 'IT'],
  'Monfalcone': [13.533, 45.806, 'IT'], 'Trieste': [13.777, 45.649, 'IT'], 'Udine': [13.236, 46.063, 'IT'],
  'Cortellazzo': [12.635, 45.545, 'IT'], 'Montello': [12.128, 45.795, 'IT', '!'], 'Trento': [11.122, 46.070, 'IT'], 'Salerno': [14.760, 40.681, 'IT'], 'Naples': [14.269, 40.851, 'IT'],
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
  'Larissa': [22.418, 39.639, 'GR'], 'Ioannina': [20.851, 39.665, 'GR'],
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
  'Tehran': [51.389, 35.689, 'IR'], 'Baku': [49.867, 40.409, 'AZ'], 'Batumi': [41.636, 41.643, 'GE'], 'Kars': [43.097, 40.602, 'TR'],

  /* ── North Africa ────────────────────────────────────────────────────────────────────────── */
  'Sidi Barrani': [25.923, 31.611, 'EG'], 'Sollum': [25.153, 31.567, 'EG'], 'Bardia': [25.089, 31.762, 'LY'],
  'Tobruk': [23.954, 32.090, 'LY'], 'Benghazi': [20.068, 32.119, 'LY'],
  'El Agheila': [19.222, 30.253, 'LY'], 'Tripoli': [13.191, 32.887, 'LY'],
  'Mersa Matruh': [27.237, 31.353, 'EG'], 'El Alamein': [28.951, 30.831, 'EG'], 'Siwa': [25.519, 29.203, 'EG'],
  'Jaghbub': [24.520, 29.745, 'LY'], 'Kufra': [23.313, 24.203, 'LY'], 'Ghadames': [9.500, 30.133, 'LY'],
  'Mareth': [10.288, 33.643, 'TN'], 'Tunis': [10.181, 36.807, 'TN'], 'Kasserine': [8.828, 35.181, 'TN'], 'Gabes': [10.098, 33.881, 'TN'], 'Algiers': [3.059, 36.754, 'DZ'],
  'Oran': [-0.642, 35.699, 'DZ'], 'Casablanca': [-7.589, 33.573, 'MA'], 'Addis Ababa': [38.757, 9.028, 'ET'],
  'Asmara': [38.933, 15.339, 'ER'], 'Mogadishu': [45.343, 2.047, 'SO'], 'Dakar': [-17.444, 14.693, 'SN'],

  /* ── East Asia & the Pacific ─────────────────────────────────────────────────────────────── */
  'Beijing': [116.407, 39.904, 'CN'], 'Taiyuan': [112.549, 37.857, 'CN'],
  'Baotou': [109.840, 40.658, 'CN'], 'Zhengzhou': [113.625, 34.747, 'CN'], 'Xian': [108.940, 34.341, 'CN'],
  'Wuhan': [114.305, 30.593, 'CN'],
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
  'Khalkhin Gol': [118.600, 47.750, 'MN'],

  /* ── Atlantic & Arctic ───────────────────────────────────────────────────────────────────── */
  'Narvik': [17.427, 68.438, 'NO'], 'Trondheim': [10.396, 63.430, 'NO'], 'Oslo': [10.752, 59.913, 'NO'],
  'Copenhagen': [12.568, 55.676, 'DK'], 'Helsinki': [24.938, 60.170, 'FI'], 'Reykjavik': [-21.940, 64.147, 'IS'], 'London': [-0.128, 51.507, 'GB'],
  'Scapa Flow': [-3.050, 58.900, 'GB'], 'Valletta': [14.514, 35.899, 'MT'],
  'Jutland': [7.500, 56.800, 'DK'], 'Coventry': [-1.510, 52.408, 'GB'], 'Dover': [1.313, 51.126, 'GB'],
  /* ── added for the WW2 lines: the Vichy demarcation, the desert flanks, Normandy, Karelia ── */
  'Mont-de-Marsan': [-0.500, 43.890, 'FR'], 'Libourne': [-0.243, 44.913, 'FR'], 'Confolens': [0.674, 46.013, 'FR'],
  'Vierzon': [2.070, 47.222, 'FR'], 'Barneville': [-1.760, 49.380, 'FR'],
  'Carentan': [-1.245, 49.303, 'FR'], 'Ouistreham': [-0.259, 49.279, 'FR'], 'Troyes': [4.075, 48.297, 'FR'],
  'Karlsruhe': [8.404, 49.007, 'DE'], 'Szczecin': [14.552, 53.429, 'PL'],
  'Qattara': [27.000, 29.600, 'EG'], 'Marada': [19.230, 29.230, 'LY'], 'Sumy': [34.800, 50.907, 'UA'],
  /* the two interlocking salients of July 1943: German at Orel (bulging east), Soviet at Kursk
     (bulging west). A line that misses them puts Orel under the wrong army. */
  'Bolkhov': [36.001, 53.443, 'RU'], 'Novosil': [37.045, 52.973, 'RU'],
  'Maloarkhangelsk': [36.463, 52.401, 'RU'], 'Sevsk': [34.491, 52.148, 'RU'],
  'Rylsk': [34.682, 51.566, 'RU'], 'Belgorod': [36.588, 50.596, 'RU'], 'Poltava': [34.551, 49.589, 'UA'], 'Izyum': [37.292, 49.185, 'UA'],
  /* the Verdun sector's front line ran through the fort, not through the town the town kept */
  'Douaumont': [5.437, 49.212, 'FR'], 'Sestroretsk': [29.966, 60.100, 'RU'], 'Litsa': [32.000, 69.400, 'RU'],
  'Pescara': [14.208, 42.464, 'IT'], 'Civitavecchia': [11.796, 42.094, 'IT'], /* ══ #R381 — the theatres #R349 left the gazetteer ready for and never wrote a line through ══
     Every name below was added because a dated front position or an operation in scripts/wars/
     quotes it. Nothing here is decoration: `npm run check:wars` fails on an anchor no line uses,
     because an unused anchor is exactly the shape the half-finished record had. */

  /* ── WW1 · the Western Front's 1918 positions ────────────────────────────────────────────── */
  'Ostend': [2.919, 51.216, 'BE'], 'Kortrijk': [3.264, 50.828, 'BE'], 'Hazebrouck': [2.539, 50.726, 'FR'],
  'Villers-Bretonneux': [2.512, 49.869, 'FR'], 'Valenciennes': [3.523, 50.358, 'FR'],
  'Guise': [3.628, 49.900, 'FR'], 'Rethel': [4.371, 49.508, 'FR'],
  /* ── WW1 · the Eastern Front's 1915–18 positions ─────────────────────────────────────────── */
  'Bialystok': [23.169, 53.132, 'PL'], 'Cesis': [25.271, 57.312, 'LV'],
  /* ── WW1 · Serbia, 1914 ──────────────────────────────────────────────────────────────────── */
  'Bogatic': [19.483, 44.838, 'RS'], 'Sabac': [19.694, 44.755, 'RS'], 'Loznica': [19.223, 44.533, 'RS'], 'Krupanj': [19.362, 44.366, 'RS'],
  'Ljubovija': [19.376, 44.187, 'RS'], 'Bajina Basta': [19.567, 43.972, 'RS'], 'Valjevo': [19.887, 44.267, 'RS'],
  'Lazarevac': [20.257, 44.383, 'RS'],
  'Gornji Milanovac': [20.459, 44.025, 'RS'], 'Uzice': [19.848, 43.859, 'RS'],
  'Kragujevac': [20.912, 44.013, 'RS'], /* ── WW1 · the Caucasus ──────────────────────────────────────────────────────────────────── */
  'Ardahan': [42.702, 41.111, 'TR'], 'Sarikamis': [42.588, 40.328, 'TR'], 'Hopa': [41.415, 41.400, 'TR'],
  'Of': [40.259, 40.947, 'TR'], 'Bayburt': [40.222, 40.259, 'TR'], 'Tirebolu': [38.818, 41.005, 'TR'],
  'Mus': [41.494, 38.734, 'TR'], 'Igdir': [44.045, 39.922, 'TR'],
  'Kagizman': [43.135, 40.146, 'TR'], 'Iskenderun': [36.174, 36.587, 'TR'],
  /* the southern end of the Caucasus front: Russian troops from Persia took Rowanduz in 1916, and
     it is what puts Mosul on the Ottoman side of that line rather than leaving it to a front in
     lower Mesopotamia four hundred kilometres away. */
  'Rowanduz': [44.530, 36.610, 'IQ'],
  /* ── WW1 · Mesopotamia ───────────────────────────────────────────────────────────────────── */
  'Qurna': [47.436, 31.006, 'IQ'], 'Zubayr': [47.708, 30.393, 'IQ'], 'Nasiriyah': [46.259, 31.054, 'IQ'],
  'Al Amarah': [47.145, 31.841, 'IQ'], 'Samarra': [43.886, 34.198, 'IQ'], 'Tikrit': [43.678, 34.607, 'IQ'],
  'Khanaqin': [45.386, 34.352, 'IQ'], 'Hit': [42.827, 33.638, 'IQ'], 'Sharqat': [43.263, 35.463, 'IQ'],
  /* ── WW1 · Romania ───────────────────────────────────────────────────────────────────────── */
  'Focsani': [27.186, 45.697, 'RO'], 'Marasesti': [27.233, 45.883, 'RO'], 'Oituz': [26.376, 46.190, 'RO'],
  'Cernavoda': [28.032, 44.339, 'RO'], 'Sibiu': [24.152, 45.798, 'RO'], 'Brasov': [25.601, 45.657, 'RO'],
  'Craiova': [23.800, 44.319, 'RO'], 'Galati': [28.032, 45.435, 'RO'],
  /* ── WW1 · Macedonia, Sinai and Palestine ────────────────────────────────────────────────── */
  'Florina': [21.409, 40.782, 'GR'], 'Romani': [32.611, 30.978, 'EG'], 'Haifa': [34.989, 32.794, 'IL'],
  'Mecca': [39.826, 21.423, 'SA'], 'Washington': [-77.037, 38.907, 'US'],
  'Tiberias': [35.531, 32.795, 'IL'], 'Deraa': [36.101, 32.618, 'SY'], 'Monte Grappa': [11.800, 45.873, 'IT'],

  /* ── WW2 · Norway, 1940 ──────────────────────────────────────────────────────────────────── */
  'Namsos': [11.500, 64.466, 'NO'], 'Andalsnes': [7.688, 62.567, 'NO'], 'Mo i Rana': [14.142, 66.313, 'NO'],
  'Bodo': [14.383, 67.280, 'NO'], 'Mosjoen': [13.192, 65.837, 'NO'], 'Lillehammer': [10.463, 61.115, 'NO'],
  /* ⚠ SWEDISH, AND DELIBERATELY SO. Norway is narrow and its border runs north–south, so a
     chord between two Norwegian towns runs along the country instead of across it. These three
     sit at the latitudes the front reached, on the far side of the border, so the cut crosses
     Norway's width and leaves it. Sweden was neutral throughout and is never cut. */
  'Ostersund': [14.636, 63.179, 'SE'], 'Storuman': [17.120, 65.100, 'SE'], 'Gallivare': [20.660, 67.130, 'SE'],
  /* ── WW2 · Albania and Greece, 1940–41 ───────────────────────────────────────────────────── */
  'Korce': [20.782, 40.618, 'AL'], 'Gjirokaster': [20.139, 40.075, 'AL'], 'Berat': [19.951, 40.705, 'AL'],
  'Pogradec': [20.653, 40.902, 'AL'], 'Himare': [19.745, 40.101, 'AL'], 'Sarande': [19.999, 39.875, 'AL'],
  'Katerini': [22.507, 40.271, 'GR'], 'Volos': [22.943, 39.362, 'GR'], 'Thermopylae': [22.536, 38.796, 'GR'], 'Metsovo': [21.181, 39.771, 'GR'], 'Edessa': [22.048, 40.802, 'GR'],
  /* ── WW2 · Burma and the road to India ───────────────────────────────────────────────────── */
  'Sittwe': [92.900, 20.148, 'MM'], 'Lashio': [97.754, 22.936, 'MM'], 'Bhamo': [97.234, 24.256, 'MM'],
  'Meiktila': [95.858, 20.878, 'MM'], 'Pyay': [95.222, 18.816, 'MM'], 'Taungoo': [96.435, 18.943, 'MM'],
  'Kalewa': [94.297, 23.199, 'MM'], 'Tamu': [94.406, 24.216, 'MM'], 'Mawlamyine': [97.628, 16.491, 'MM'],
  'Dimapur': [93.727, 25.906, 'IN'],
  /* ── WW2 · the Eastern Front's missing years ─────────────────────────────────────────────── */
  'Krasnodar': [38.976, 45.040, 'RU'], 'Maykop': [40.106, 44.609, 'RU'], 'Vladikavkaz': [44.682, 43.039, 'RU'], 'Cherkasy': [32.060, 49.444, 'UA'], 'Nikopol': [34.373, 47.577, 'UA'],
  'Sortavala': [30.692, 61.703, 'RU'], 'Petrozavodsk': [34.347, 61.789, 'RU'],
  /* the southern tip of Lake Onega. The Finnish front followed the lake, and a straight chord from
     Medvezhyegorsk to the Svir passes WEST of Petrozavodsk — which the Finns held for 33 months. */
  'Voznesenye': [35.483, 61.017, 'RU'],
  'Suomussalmi': [28.900, 64.883, 'FI'], 'Kolobrzeg': [15.577, 54.176, 'PL'], 'Gdynia': [18.531, 54.518, 'PL'], 'Torun': [18.598, 53.013, 'PL'],
  'Ostrava': [18.263, 49.834, 'CZ'], 'Cluj-Napoca': [23.600, 46.771, 'RO'], /* ── WW2 · from Normandy to the Elbe ─────────────────────────────────────────────────────── */
  'Trier': [6.641, 49.756, 'DE'], 'Wesel': [6.620, 51.665, 'DE'],
  'Duren': [6.483, 50.803, 'DE'], 'Monschau': [6.242, 50.556, 'DE'], 'Echternach': [6.418, 49.813, 'LU'], 'Dinant': [4.913, 50.259, 'BE'],
  'Celle': [10.081, 52.623, 'DE'], 'Epinal': [6.451, 48.174, 'FR'], 'Besancon': [6.024, 47.238, 'FR'], 'Dijon': [5.041, 47.322, 'FR'],
  'Nantes': [-1.553, 47.218, 'FR'], 'Lorient': [-3.366, 47.748, 'FR'], 'Montelimar': [4.750, 44.556, 'FR'],
  'Dieppe': [1.078, 49.925, 'FR'],
  /* ── WW2 · Italy from Sicily to the Po ───────────────────────────────────────────────────── */
  'Ortona': [14.404, 42.354, 'IT'], 'Massa': [10.142, 44.037, 'IT'], 'Livorno': [10.310, 43.548, 'IT'],
  'Faenza': [11.883, 44.286, 'IT'], 'Reggio Calabria': [15.651, 38.111, 'IT'], 'Gela': [14.250, 37.066, 'IT'],
  'Foggia': [15.550, 41.462, 'IT'], 'Verona': [10.993, 45.438, 'IT'],
  /* ── WW2 · the desert's own waypoints ────────────────────────────────────────────────────── */
  'Gazala': [20.011, 32.360, 'LY'], 'Bir Hakeim': [23.470, 31.593, 'LY'], 'Ajdabiya': [20.226, 30.759, 'LY'],
  'Msus': [21.450, 31.900, 'LY'], 'Buerat': [15.700, 31.400, 'LY'], 'Enfidaville': [10.383, 36.133, 'TN'],
  'Sfax': [10.760, 34.740, 'TN'], 'Sousse': [10.641, 35.825, 'TN'], 'Medenine': [10.505, 33.354, 'TN'],
  'Tebessa': [8.124, 35.404, 'DZ'], 'Beja': [9.181, 36.733, 'TN'],
  /* ── WW2 · China, Manchuria and Korea ────────────────────────────────────────────────────── */
  'Changde': [111.699, 29.031, 'CN'], 'Yueyang': [113.129, 29.357, 'CN'], 'Luoyang': [112.454, 34.619, 'CN'], 'Liuzhou': [109.428, 24.326, 'CN'], 'Wuzhou': [111.317, 23.476, 'CN'],
  /* ⚠ THE SEVENTH OPT-OUT. Zhijiang here is 芷江 in western Hunan — the airfield the last Japanese
     offensive of the war was aimed at, and where the surrender delegation landed. The gazetteer's
     Zhijiang is 枝江 in Hubei, 388 km away: same pinyin, different characters, different town. */
  'Zhijiang': [109.678, 27.442, 'CN', '!'],
  'Seoul': [126.978, 37.567, 'KR'], /* ── WW2 · the Pacific, where the record is places and days rather than a line ───────────── */
  'Corregidor': [120.575, 14.383, 'PH'], 'Bataan': [120.470, 14.640, 'PH'], 'Lingayen': [120.232, 16.021, 'PH'],
  'Kwajalein': [167.732, 8.720, 'MH'], 'Eniwetok': [162.337, 11.500, 'MH'], 'Truk': [151.850, 7.450, 'FM'],
  'Bougainville': [155.200, -6.200, 'PG'], 'Hollandia': [140.700, -2.533, 'ID'], 'Biak': [136.000, -1.000, 'ID'],
  'Tinian': [145.630, 15.000, 'MP'], 'Kiska': [177.539, 51.978, 'US'], 'Milne Bay': [150.480, -10.310, 'PG'],
  'Buna': [148.390, -8.650, 'PG'], 'Kokoda': [147.733, -8.883, 'PG'], 'Tulagi': [160.150, -9.100, 'SB'],
  'Balikpapan': [116.828, -1.268, 'ID'], 'Surabaya': [112.752, -7.258, 'ID'],
  'Kota Bharu': [102.243, 6.133, 'MY'], 'Ambon': [128.190, -3.695, 'ID'], 'Dili': [125.578, -8.556, 'TL'],

  /* ══ #R409 — WW1: the operations, the theatres and the dated positions the record reaches now ══
     Every name below is quoted by an operation, a dated front position or a control check in
     scripts/wars/ww1.mjs — check ⑦ in scripts/build-wars.mjs will not let an unused one stand. */
  /* ── WW1 · the Western Front's operations ────────────────────────────────────────────────── */
  'Mulhouse': [7.339, 47.750, 'FR'], 'Virton': [5.533, 49.567, 'BE'], 'Le Cateau': [3.545, 50.103, 'FR'],
  'Vimy': [2.808, 50.373, 'FR'], 'Fromelles': [2.856, 50.605, 'FR'], 'Doullens': [2.341, 50.158, 'FR'],
  'Chantilly': [2.470, 49.194, 'FR'], 'Versailles': [2.130, 48.804, 'FR'], 'Leuven': [4.700, 50.879, 'BE'],
  /* ── WW1 · the Eastern Front's operations ────────────────────────────────────────────────── */
  'Gizycko': [21.760, 54.038, 'PL'], 'Augustow': [22.980, 53.844, 'PL'], 'Modlin': [20.717, 52.437, 'PL'],
  'Naroch': [26.833, 54.867, 'BY'], 'Saaremaa': [22.700, 58.400, 'EE'],
  /* ── WW1 · the Italian Front ─────────────────────────────────────────────────────────────── */
  'Vittorio Veneto': [12.302, 45.977, 'IT'],
  /* ── WW1 · the Caucasus, Mesopotamia, Palestine and the death marches ────────────────────── */
  'Manzikert': [42.544, 39.148, 'TR'], 'Koprukoy': [41.850, 39.967, 'TR'],
  'Sardarabad': [43.946, 40.093, 'AM'], 'Karakilisa': [44.489, 40.812, 'AM'],
  'Ctesiphon': [44.581, 33.095, 'IQ'], 'Jericho': [35.462, 31.870, 'PS'], 'Nablus': [35.262, 32.221, 'PS'],
  'Deir ez-Zor': [40.150, 35.333, 'SY'],
  /* ── WW1 · Africa, where four German colonies were taken one at a time ───────────────────── */
  'Lome': [1.222, 6.131, 'TG'], 'Douala': [9.708, 4.051, 'CM'], 'Windhoek': [17.084, -22.560, 'NA'],
  'Sandfontein': [18.517, -28.685, 'NA'], 'Pretoria': [28.188, -25.746, 'ZA'],
  'Dar es Salaam': [39.283, -6.822, 'TZ'], 'Tanga': [39.100, -5.067, 'TZ'],
  'Kilimanjaro': [37.353, -3.076, 'TZ'], 'Taveta': [37.679, -3.400, 'KE'], 'Kigoma': [29.632, -4.877, 'TZ'],
  'Mahiwa': [39.267, -10.339, 'TZ'], 'Ngomano': [38.494, -11.428, 'MZ'],
  /* ── WW1 · East Asia and the Pacific ─────────────────────────────────────────────────────── */
  'Qingdao': [120.383, 36.067, 'CN'], 'Apia': [-171.760, -13.833, 'WS'],
  /* ── WW1 · the war at sea. Four of these are open water rather than a town, and the coordinate
     is the named sea area the record gives — the same licence «Jutland» above already takes. ── */
  'Heligoland': [7.885, 54.183, 'DE'], 'Dogger Bank': [3.000, 54.750, 'GB'], 'Scarborough': [-0.404, 54.283, 'GB'],
  'Kinsale': [-8.522, 51.706, 'IE'], 'Coronel': [-73.130, -37.017, 'CL'], 'Stanley': [-57.851, -51.694, 'FK'],
  'Penang': [100.329, 5.417, 'MY'], 'Cocos Islands': [96.834, -12.167, 'CC'], 'Otranto': [18.490, 40.145, 'IT'],
  'Imbros': [25.900, 40.170, 'TR'],
  /* ── WW1 · the risings and the revolutions ───────────────────────────────────────────────── */
  'Dublin': [-6.260, 53.350, 'IE'], 'Tashkent': [69.240, 41.311, 'UZ'], 'Kiel': [10.135, 54.323, 'DE'],
};
