/* ============================================================================
 *  IntMap · WAR GAZETTEER — the places the Vietnam War record is quoted through
 * ----------------------------------------------------------------------------
 *  The rules are the ones stated at the head of ./places.mjs, which imports this file and spreads it
 *  into PLACES: entries are [lon, lat, ISO2], the coordinate is THE PLACE and not the line, and
 *  scripts/build-wars.mjs cross-checks every name the bundled gazetteer also carries against that
 *  country's own row. Nothing here is a name the gazetteer knows as a different place, so no entry
 *  needs the '!' opt-out.
 *
 *  ⚠ TWO KINDS OF NAME LIVE HERE AND THEY ARE NOT INTERCHANGEABLE.
 *   · The ones the gazetteer carries — Đông Hà, Cam Lộ, Khe Sanh, Lao Bảo, A Lưới, An Khê, Kon Tum,
 *     Pleiku, Quy Nhơn, Nha Trang, Đà Lạt, Cam Ranh, Phan Thiết, Xuân Lộc, Tây Ninh, Lộc Ninh,
 *     Bến Cát, Biên Hòa, La Gi, Gio Linh, Mỹ Lai, Vinh, Vientiane, Phnom Penh, Udon Thani, Snuol,
 *     Memot — take ITS coordinates, so the 30 km cross-check proves them.
 *   · The rest are wartime names and places below the gazetteer's population floor: Saigon, Huế,
 *     Đà Nẵng, Hải Phòng, Quảng Trị, Ban Mê Thuột (the wartime spelling of Buôn Ma Thuột), Phan Rang,
 *     Khâm Đức, Khánh Dương, Chu Lai, An Lộc, Đắk Tô, Ia Drang, Ấp Bắc, Long Tân, Phước Long,
 *     Cửa Tùng, Cửa Việt, Mỹ Chánh, Hướng Lập, Tchepone. The build reports them as the ones it
 *     could not prove, which is the honest description of them.
 *
 *  ⚠ TWO OF THEM SIT A LITTLE INLAND OF THE CITY CENTRE, AND THE REASON IS THE COASTLINE. Đà Nẵng
 *  and Quy Nhơn both stand on ground that CShapes' generalized outline of South Vietnam draws as sea,
 *  and a point in the sea belongs to no country at all — the build's control checks resolve it to
 *  null rather than to the wrong side of a front. Both are moved eight kilometres west, into the
 *  landward half of their own city, which is well inside the 30 km the gazetteer cross-check allows
 *  and does not move either of them out of the place it names.
 *
 *  ⚠ AND ONE NAME IS A STRETCH OF WATER. «Gulf of Tonkin» is where the destroyers were on 2 August
 *  1964, not a settlement — the same licence ./places.mjs already takes for the Sunda Strait and
 *  Cape Matapan. It is carried with VN because that is the coast it belongs to.
 * ==========================================================================*/
export const PLACES_VIETNAM = {
  /* ── the Demarcation Line, and the ground the 1972 offensive was fought over ─────────────────
     The Geneva agreement of 21 July 1954 fixed the line on the Bến Hải river from its mouth at
     Cửa Tùng to the hamlet of Bồ Hồ Sự, and thence due west along the 17th parallel to the Laotian
     frontier. Hướng Lập is the commune at that frontier end; CShapes draws the same boundary from
     (107.13, 17.01) to (106.56, 16.94), which is the pair of anchors below. */
  'Cua Tung': [107.110, 17.000, 'VN'], 'Huong Lap': [106.590, 16.945, 'VN'],
  'Gio Linh': [107.084, 16.925, 'VN'], 'Cua Viet': [107.185, 16.898, 'VN'],
  'Dong Ha': [107.100, 16.816, 'VN'], 'Cam Lo': [106.994, 16.808, 'VN'],
  'Quang Tri': [107.190, 16.746, 'VN'], 'My Chanh': [107.380, 16.630, 'VN'],
  'Khe Sanh': [106.739, 16.628, 'VN'], 'Lao Bao': [106.601, 16.614, 'VN'],
  /* ── the coast and the mountain rim of I and II Corps ──────────────────────────────────────── */
  'Hue': [107.585, 16.463, 'VN'], 'A Luoi': [107.234, 16.272, 'VN'],
  'Da Nang': [108.150, 16.050, 'VN'], 'Chu Lai': [108.706, 15.406, 'VN'],
  'Kham Duc': [107.800, 15.420, 'VN'], 'My Lai': [108.889, 15.188, 'VN'],
  'Dak To': [107.833, 14.650, 'VN'], 'Kon Tum': [108.008, 14.355, 'VN'],
  'An Khe': [108.650, 13.950, 'VN'], 'Pleiku': [108.000, 13.983, 'VN'],
  'Qui Nhon': [109.150, 13.780, 'VN'], 'Ia Drang': [107.730, 13.570, 'VN'],
  'Khanh Duong': [108.750, 12.750, 'VN'], 'Ban Me Thuot': [108.038, 12.668, 'VN'],
  'Nha Trang': [109.194, 12.245, 'VN'], 'Cam Ranh': [109.159, 11.921, 'VN'],
  'Da Lat': [108.442, 11.947, 'VN'], 'Phan Rang': [108.989, 11.564, 'VN'],
  /* ── III and IV Corps, and the approaches to Saigon ────────────────────────────────────────── */
  'Loc Ninh': [106.591, 11.845, 'VN'], 'Phuoc Long': [106.977, 11.834, 'VN'],
  'An Loc': [106.606, 11.649, 'VN'], 'Tay Ninh': [106.098, 11.310, 'VN'],
  'Ben Cat': [106.600, 11.150, 'VN'], 'Bien Hoa': [106.824, 10.945, 'VN'],
  'Xuan Loc': [107.233, 10.933, 'VN'], 'Phan Thiet': [108.102, 10.929, 'VN'],
  'Saigon': [106.700, 10.776, 'VN'], 'La Gi': [107.772, 10.660, 'VN'],
  'Long Tan': [107.320, 10.515, 'VN'], 'Ap Bac': [106.250, 10.420, 'VN'],
  /* ── the North, and the water the war was declared over ────────────────────────────────────── */
  'Haiphong': [106.683, 20.865, 'VN'], 'Gulf of Tonkin': [107.400, 19.600, 'VN'],
  'Vinh': [105.692, 18.673, 'VN'],
  /* ── Laos, Cambodia and Thailand, where the war also was ───────────────────────────────────── */
  'Vientiane': [102.600, 17.967, 'LA'], 'Tchepone': [106.240, 16.660, 'LA'],
  'Udon Thani': [102.786, 17.416, 'TH'],
  'Snuol': [106.421, 12.072, 'KH'], 'Memot': [106.182, 11.829, 'KH'],
  'Phnom Penh': [104.916, 11.563, 'KH'],
};
