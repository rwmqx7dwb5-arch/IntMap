/* ============================================================================
 *  IntMap · WAR GAZETTEER — the places the Yugoslav Wars are quoted through   (#R525)
 * ----------------------------------------------------------------------------
 *  The rules are ./places.mjs's own, and they are not repeated here: entries are [lon, lat, ISO2],
 *  the coordinate is THE PLACE and not the line, and scripts/build-wars.mjs cross-checks every name
 *  the bundled gazetteer also carries against that gazetteer's own row for the same country.
 *
 *  ⚠ ALMOST EVERY COORDINATE BELOW IS THE BUNDLED GAZETTEER'S OWN. That is deliberate rather than
 *  lazy: this war is quoted through small towns — Okučani, Ćelić, Ravno, Šipovo — whose position
 *  decides which side of a front line a city thirty kilometres away lands on, and a digit typed from
 *  memory is exactly the mistake nothing on a map would show. Two names the gazetteer does not
 *  carry — Đakovo and Ahmići — are written out in full here, and the build counts them among the
 *  ones it could not prove, which is the honest state to leave them in.
 *
 *  ⚠ ZADAR AND SPLIT ARE NOT IN THIS TABLE AS CHECK TOWNS, AND THE REASON IS THE COASTLINE. CShapes
 *  simplifies the Dalmatian shore, and both city coordinates fall a hair OUTSIDE the polygon the
 *  layer draws — the resolver answers «no entity», not «the wrong faction». Šibenik, Sinj, Trilj and
 *  Imotski, a few kilometres inland, are inside it and carry the same claim about the same front.
 *
 *  ⚠ THE ISO2 OF THE TWO KOSOVO NAMES IS `XK`. That is what data/gazetteer-world.json.gz calls the
 *  country the two towns are in today, and the ISO2 exists only so the cross-check can find the
 *  gazetteer's row. It is not a claim about who held Priština in 1998 — that claim is made by the
 *  front line and by `control`, where a reader can see its date.
 * ==========================================================================*/
export const PLACES_YUGOSLAVIA = {
  /* ── Croatia: the fronts of 1991–95 ──────────────────────────────────────────────────────── */
  'Kozarska Dubica': [16.809, 45.177, 'BA'],   /* on the Bosnian bank of the Sava — where two of the three Croatian lines below start, outside the country they cut */
  'Sisak': [16.378, 45.466, 'HR'],
  'Karlovac': [15.550, 45.492, 'HR'], 'Ogulin': [15.229, 45.266, 'HR'],
  'Otocac': [15.238, 44.869, 'HR'], 'Gospic': [15.375, 44.546, 'HR'],
  'Benkovac': [15.613, 44.034, 'HR'], 'Drnis': [16.156, 43.863, 'HR'], 'Vrlika': [16.398, 43.908, 'HR'],
  'Knin': [16.197, 44.041, 'HR'], 'Zadar': [15.225, 44.116, 'HR'], 'Sibenik': [15.894, 43.734, 'HR'],
  'Sinj': [16.639, 43.704, 'HR'], 'Dubrovnik': [18.109, 42.641, 'HR'], 'Pula': [13.848, 44.868, 'HR'],
  'Novska': [16.977, 45.341, 'HR'], 'Pakrac': [17.189, 45.436, 'HR'],
  'Nova Gradiska': [17.383, 45.255, 'HR'], 'Okucani': [17.199, 45.260, 'HR'],
  'Daruvar': [17.225, 45.591, 'HR'], 'Gradiska': [17.255, 45.145, 'BA'],
  'Donji Miholjac': [18.167, 45.761, 'HR'], 'Osijek': [18.694, 45.551, 'HR'],
  'Vukovar': [19.002, 45.352, 'HR'], 'Vinkovci': [18.805, 45.288, 'HR'],
  'Zupanja': [18.698, 45.078, 'HR'], 'Djakovo': [18.410, 45.309, 'HR'],
  'Dvor': [16.378, 45.070, 'HR'],
  'Ljubljana': [14.505, 46.051, 'SI'],

  /* ── Bosnia and Herzegovina: the Inter-Entity Boundary Line of Dayton Annex 2 ─────────────── */
  'Sanski Most': [16.667, 44.767, 'BA'], 'Kljuc': [16.777, 44.533, 'BA'], 'Sipovo': [17.086, 44.282, 'BA'],
  'Jajce': [17.271, 44.342, 'BA'], 'Travnik': [17.666, 44.226, 'BA'], 'Teslic': [17.860, 44.606, 'BA'],
  'Doboj': [18.087, 44.732, 'BA'], 'Gracanica': [18.310, 44.703, 'BA'], 'Gradacac': [18.428, 44.879, 'BA'],
  'Brcko': [18.816, 44.872, 'BA'], 'Celic': [18.815, 44.725, 'BA'], 'Kalesija': [18.907, 44.438, 'BA'],
  'Vlasenica': [18.941, 44.182, 'BA'], 'Sokolac': [18.801, 43.938, 'BA'], 'Pale': [18.570, 43.817, 'BA'],
  'Trnovo': [18.446, 43.666, 'BA'], 'Konjic': [17.961, 43.651, 'BA'], 'Nevesinje': [18.113, 43.259, 'BA'],
  'Stolac': [17.960, 43.084, 'BA'], 'Ravno': [17.966, 42.887, 'BA'], 'Livno': [17.008, 43.827, 'BA'],
  'Bihac': [15.871, 44.817, 'BA'], 'Banja Luka': [17.206, 44.779, 'BA'], 'Prijedor': [16.714, 44.980, 'BA'],
  'Tuzla': [18.667, 44.538, 'BA'], 'Zenica': [17.904, 44.202, 'BA'], 'Mostar': [17.808, 43.343, 'BA'],
  'Srebrenica': [19.297, 44.108, 'BA'], 'Bijeljina': [19.214, 44.759, 'BA'],
  'Ahmici': [17.888, 44.161, 'BA'],

  /* ── the Kosovo administrative boundary, and Macedonia in 2001 ───────────────────────────── */
  'Bajram Curri': [20.077, 42.357, 'AL'], 'Plav': [19.944, 42.597, 'ME'], 'Rozaje': [20.167, 42.833, 'ME'],
  'Novi Pazar': [20.512, 43.137, 'RS'], 'Kursumlija': [21.273, 43.138, 'RS'], 'Bujanovac': [21.767, 42.459, 'RS'],
  'Kumanovo': [21.716, 42.133, 'MK'],
  'Pristina': [21.167, 42.673, 'XK'], 'Prizren': [20.740, 42.214, 'XK'],
  'Podgorica': [19.263, 42.441, 'ME'],
  'Skopje': [21.431, 41.997, 'MK'], 'Tetovo': [20.971, 42.010, 'MK'], 'Ohrid': [20.802, 41.117, 'MK'],
};
