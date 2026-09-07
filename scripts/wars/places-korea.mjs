/* ============================================================================
 *  IntMap · KOREA GAZETTEER — the places the Korean War front is quoted through
 * ----------------------------------------------------------------------------
 *  The rules are ./places.mjs's: entries are [lon, lat, ISO2] plus an optional fourth field '!' on
 *  a name the bundled gazetteer knows as a DIFFERENT place, and scripts/build-wars.mjs cross-checks
 *  every name the gazetteer does carry against that country's own row.
 *
 *  ⚠ TWO NAMES HERE ARE OPT-OUTS, AND BOTH ARE THE SAME KIND OF COLLISION. Korean place names
 *  romanise to a handful of syllables and the same three or four syllables recur all over the
 *  peninsula: the gazetteer's «Masan» is a village in South Jeolla, 157 km from the port city of
 *  마산 the Pusan Perimeter's southern flank rested on, and its «Yongsan» is a 용산 in North
 *  Chungcheong, 130 km from the 영산 on the Naktong bend the two Naktong Bulge battles are named
 *  after. Opting those two out by name is narrower than loosening the tolerance for all of them.
 *
 *  ⚠ AND ONE THING THE COORDINATES CANNOT FIX. CShapes 2.0 carries ONE polygon pair for the two
 *  Koreas over 1948–2019, and its boundary is the armistice line of 1953, not the 38th parallel of
 *  1945. So Kaesong is inside gw731 for the whole war even though it was South Korean territory
 *  until June 1950, and Cheorwon and Kosong are inside gw732 even though they were North Korean
 *  until 1951. The record in ./korea.mjs says so where it matters — it is why the two days when the
 *  front stood ON the parallel, and the two when it stood on the armistice line, are written with
 *  an empty `cuts`: on those days the line and the border are the same claim, and drawing the line
 *  is the whole of what the record has to say.
 * ==========================================================================*/

export const PLACES_KOREA = {
  /* ── the parallel, the corridor to Seoul, and the west ──────────────────────────────────── */
  'Ongjin': [125.362, 37.935, 'KP'], 'Kaesong': [126.554, 37.971, 'KP'],
  'Panmunjom': [126.677, 37.956, 'KP'],
  'Pocheon': [127.200, 37.895, 'KR'], 'Uijeongbu': [127.047, 37.742, 'KR'],
  'Gimpo': [126.714, 37.624, 'KR'], 'Yeongdeungpo': [126.907, 37.517, 'KR'],
  'Incheon': [126.705, 37.456, 'KR'], 'Suwon': [127.009, 37.291, 'KR'],
  'Munsan': [126.785, 37.859, 'KR'], 'Yeoncheon': [127.077, 38.101, 'KR'],
  'Cheorwon': [127.218, 38.209, 'KR'], 'Kumhwa': [127.401, 38.295, 'KR'],
  'Gapyeong': [127.511, 37.831, 'KR'], 'Chipyong-ni': [127.587, 37.436, 'KR'],
  'Yangpyeong': [127.491, 37.490, 'KR'],

  /* ── the centre and the east coast ──────────────────────────────────────────────────────── */
  'Chuncheon': [127.734, 37.875, 'KR'], 'Hwacheon': [127.706, 38.107, 'KR'],
  'Yanggu': [127.990, 38.107, 'KR'], 'Inje': [128.171, 38.070, 'KR'],
  'Yangyang': [128.619, 38.075, 'KR'], 'Kosong': [128.468, 38.379, 'KR'],
  'Gangneung': [128.872, 37.753, 'KR'], 'Jumunjin': [128.826, 37.891, 'KR'],
  'Hongcheon': [127.886, 37.692, 'KR'], 'Wonju': [127.945, 37.351, 'KR'],
  'Samcheok': [129.171, 37.441, 'KR'],

  /* ── the delaying action of July 1950 ───────────────────────────────────────────────────── */
  'Osan': [127.071, 37.152, 'KR'], 'Pyeongtaek': [127.089, 36.995, 'KR'],
  'Chungju': [127.929, 36.977, 'KR'], 'Gongju': [127.125, 36.456, 'KR'],
  'Daejeon': [127.385, 36.349, 'KR'], 'Gunsan': [126.711, 35.979, 'KR'],
  'Yeongdong': [127.776, 36.175, 'KR'],

  /* ── the Pusan Perimeter ────────────────────────────────────────────────────────────────── */
  /* Chindong-ni is the fishing village on the south coast west of Masan where the perimeter's
     southern flank met the sea; it is what the line is anchored on rather than Masan itself,
     because a line quoted from Masan runs east of Koje Island and would hand the island — and
     the largest prisoner-of-war camp of the war — to the side that never reached it. */
  'Chindong-ni': [128.475, 35.101, 'KR'], 'Namji': [128.478, 35.395, 'KR'],
  'Waegwan': [128.398, 35.993, 'KR'], 'Andong': [128.723, 36.566, 'KR'],
  'Yeongdeok': [129.370, 36.414, 'KR'], 'Pohang': [129.365, 36.029, 'KR'],
  'Yeongcheon': [128.938, 35.973, 'KR'], 'Daegu': [128.601, 35.871, 'KR'],
  'Busan': [129.076, 35.180, 'KR'], 'Jinju': [128.085, 35.193, 'KR'],
  'Geoje': [128.706, 34.814, 'KR'],
  /* ⚠ the two opt-outs — see the header */
  'Masan': [128.569, 35.193, 'KR', '!'], 'Yongsan': [128.522, 35.451, 'KR', '!'],

  /* ── North Korea, from the parallel to the Yalu ─────────────────────────────────────────── */
  'Pyongyang': [125.738, 39.019, 'KP'], 'Nampo': [125.408, 38.738, 'KP'],
  'Sinchon': [125.484, 38.353, 'KP'], 'Yangdok': [126.850, 39.168, 'KP'],
  'Wonsan': [127.444, 39.153, 'KP'], 'Hamhung': [127.536, 39.918, 'KP'],
  'Hungnam': [127.632, 39.842, 'KP'], 'Chongju': [125.210, 39.693, 'KP'],
  'Kujang': [126.030, 39.867, 'KP'], 'Tokchon': [126.258, 39.753, 'KP'],
  'Unsan': [125.785, 39.981, 'KP'], 'Changjin': [127.267, 40.365, 'KP'],
  'Hyesan': [128.178, 41.402, 'KP'], 'Sinuiju': [124.398, 40.101, 'KP'],
  'Kanggye': [126.585, 40.970, 'KP'], 'Chongjin': [129.776, 41.796, 'KP'],
  'Kumsong': [127.520, 38.430, 'KP'],

  /* ── the one place outside the theatre the record reaches ───────────────────────────────── */
  /* The Security Council sat at Lake Success, its temporary home on Long Island, until it moved to
     Manhattan in 1952; resolutions 82, 83 and 84 — the only time the Council has ever authorised a
     unified command under its own flag — were voted there. */
  'Lake Success': [-73.716, 40.770, 'US'],
};
