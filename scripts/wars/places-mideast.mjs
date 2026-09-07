/* ============================================================================
 *  IntMap · WAR GAZETTEER — the Arab–Israeli wars   (#R524)
 * ----------------------------------------------------------------------------
 *  The rules are the ones stated at the head of ./places.mjs, which spreads this table into its own:
 *  entries are [lon, lat, ISO2], the coordinate is THE PLACE and not the line, and every name that
 *  data/gazetteer-world.json.gz also carries is cross-checked against it by scripts/build-wars.mjs.
 *
 *  ⚠ WHY THIS IS A SEPARATE FILE AND NOT MORE ROWS IN ./places.mjs. The two world wars already put
 *  Cairo, Suez, Gaza, Jerusalem, Beersheba, El Arish, Romani, Rafah, Damascus, Beirut, Nablus, Amman,
 *  Deraa, Megiddo, Haifa, Tiberias and Alexandria in that table — the Sinai–Palestine front of 1916–18
 *  runs through half of them. Those are NOT repeated here: a second row for a name already in the
 *  table would be a second opinion about where the place is, and the spread would silently pick one.
 *  What is below is only what this record adds.
 *
 *  ⚠ AND THE ISO2 IS THE COUNTRY THE GAZETTEER FILES THE PLACE UNDER, not the country that held it in
 *  the year it is quoted. Hebron and Latrun are PS because that is how the settlement list carries
 *  them; the Golan villages are SY for the same reason. Which state held them on a given day is what
 *  `control` and `fronts` in ./mideast.mjs are for, and it changes four times in this record.
 * ==========================================================================*/
export const PLACES_MIDEAST = {
  /* ── 1948–49 · the coastal plain and the Negev ────────────────────────────────────────────── */
  'Tel Aviv': [34.781, 32.085, 'IL'], 'Petah Tikva': [34.887, 32.084, 'IL'],
  'Rehovot': [34.812, 31.894, 'IL'], 'Lod': [34.891, 31.951, 'IL'], 'Ramla': [34.866, 31.925, 'IL'],
  'Ashdod': [34.650, 31.802, 'IL'], 'Ashkelon': [34.572, 31.669, 'IL'],
  /* al-Faluja and Yad Mordechai are the two ends of the Egyptian expeditionary force’s reach: the
     village the encircled brigade held until the Rhodes armistice, and the kibbutz north of the Gaza
     Strip the coastal column had to take to get past it. */
  'Faluja': [34.749, 31.607, 'IL'], 'Yad Mordechai': [34.556, 31.591, 'IL'],
  'Bir Asluj': [34.700, 30.980, 'IL'], 'Auja al-Hafir': [34.430, 30.888, 'IL'],
  'Eilat': [34.952, 29.557, 'IL'], 'Hebron': [35.095, 31.530, 'PS'], 'Latrun': [34.985, 31.836, 'PS'],
  /* ── 1948–49 · the Galilee and the upper Jordan ───────────────────────────────────────────── */
  'Safed': [35.497, 32.965, 'IL'], 'Nazareth': [35.303, 32.702, 'IL'],
  'Mishmar HaYarden': [35.583, 33.006, 'IL'], 'Samakh': [35.585, 32.706, 'IL'],
  /* ── the Suez Canal, its two ends and the towns on it ─────────────────────────────────────── */
  'Port Said': [32.302, 31.265, 'EG'], 'Qantara': [32.317, 30.855, 'EG'],
  'Ismailia': [32.273, 30.591, 'EG'], 'Deversoir': [32.350, 30.420, 'EG'],
  /* ── the Sinai peninsula ──────────────────────────────────────────────────────────────────── */
  'Abu Ageila': [34.000, 30.917, 'EG'], 'Bir Gifgafa': [33.150, 30.400, 'EG'],
  'Mitla Pass': [32.900, 30.030, 'EG'], 'Baluza': [32.550, 31.040, 'EG'],
  'Tasa': [32.700, 30.550, 'EG'], 'Ayun Musa': [32.640, 29.870, 'EG'],
  'Sharm el-Sheikh': [34.330, 27.910, 'EG'],
  /* ── the Golan, and the Syrian ground beyond it the 1973 counter-offensive reached ─────────── */
  'Quneitra': [35.822, 33.126, 'SY'], 'Nafah': [35.770, 33.030, 'SY'], 'Rafid': [35.850, 32.930, 'SY'],
  'Sasa': [36.030, 33.270, 'SY'], 'Beit Jinn': [35.983, 33.400, 'SY'],
  /* ── the Jordan valley, and the two rooms the wars were ended in ──────────────────────────── */
  'Karameh': [35.600, 31.940, 'JO'], 'Rhodes': [28.222, 36.443, 'GR'],
  'New York': [-74.006, 40.713, 'US'],
};
