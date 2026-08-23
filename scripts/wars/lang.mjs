/* ============================================================================
 *  IntMap · THE TWO WORLD WARS — the shared vocabulary   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 Scope confirmed with the reader: ALL theatres,
 *  and all three of area, front line and the battles themselves.
 *
 *  ══ WHY THIS FILE EXISTS AT ALL ═════════════════════════════════════════════════════════════
 *  There is no open dataset of dated world-war front lines. There are dated MAPS — thousands of them,
 *  most still in copyright — and there is the written record, which states front positions the way a
 *  historian states them: as a line THROUGH NAMED PLACES on a given day. So this file holds the
 *  written record, in the shape the record actually has, and scripts/build-wars.mjs turns it into
 *  geometry. Nothing here is traced off a picture and nothing here is interpolated.
 *
 *  ══ THE THREE KINDS OF FACT, AND WHAT EACH IS ALLOWED TO CLAIM ══════════════════════════════
 *   1. `control` — WHO HELD A COUNTRY, changing on the documented day. The countries are not ours:
 *      they are CShapes 2.0's own entities, keyed by its own gwcode, so «Poland» here means exactly
 *      the polygon that dataset carries for the date on screen. A capitulation, an occupation, a
 *      declaration of war and a liberation are all single dated facts and are stored as such.
 *   2. `fronts` — WHERE THE LINE RAN, on the days the record gives a position for. ⚠ THERE IS NO
 *      ENTRY FOR A DAY NOBODY WROTE DOWN. The layer shows the last dated position and NAMES ITS DATE,
 *      so a reader on 12 August 1943 is told they are looking at the line of 4 July 1943 — it never
 *      slides a line to a day to make the animation smooth, because that would be drawing a claim no
 *      source made.
 *   3. `events` — the operations and battles, with their real start and end dates and the place they
 *      are named after. These are what the reader clicks.
 *
 *  ══ AND ONE THING IT REFUSES TO DO ══════════════════════════════════════════════════════════
 *  ⚠ WHERE THE RECORD HAS NO LINE, THE ANSWER IS «CONTESTED», NOT A GUESS. The German sweep through
 *  Belgium in August 1914 and the Japanese advance through the Philippines have no quotable line for
 *  most of their days. Those spans are marked contested — one colour, one legend row, saying that
 *  control was divided and that this file will not pretend to know where. That is a smaller claim
 *  than a line, and it is a true one.
 *
 *  Dates are ISO and inclusive-from: a row takes effect at 00:00 on its day.
 *  gw = the CShapes gwcode. Every one is checked against data/cshapes.js for the date it is used on.
 * ==========================================================================*/

/* Nine languages, the same set as the rest of the app (CLAUDE.md §3.5).
   ⚠ THE KEYS ARE js/lang-registry.js's OWN CODES, not ISO tags — `jp`, `zh` (Traditional) and
   `zh-hans` are what that registry calls those three, and js/war-fronts.js looks a string up with
   `o[HOST.lang]`. A second spelling here would be a second list of languages, and the way it would
   fail is the quiet one: a reader in 日本語 silently getting English. */
const L = (en, ja, de, ru, es, zhHant, zhHans, fr, ko) => ({ en, jp: ja, de, ru, es, zh: zhHant, 'zh-hans': zhHans, fr, ko });

/* ── the sides ──────────────────────────────────────────────────────────────────────────────── */
const F_WW1 = {
  ALLIED: { col: '#4a7fbd', name: L('Allied Powers', '連合国', 'Entente-Mächte', 'Антанта', 'Aliados', '協約國', '协约国', 'Alliés', '협상국') },
  CENTRAL: { col: '#b4544a', name: L('Central Powers', '中央同盟国', 'Mittelmächte', 'Центральные державы', 'Imperios Centrales', '同盟國', '同盟国', 'Empires centraux', '동맹국') },
  CONTESTED: { col: '#c9963c', name: L('Contested — control divided', '争奪中（支配が分かれている）', 'Umkämpft — geteilte Kontrolle', 'Оспаривается — контроль разделён', 'En disputa: control dividido', '交戰中（控制權分裂）', '交战中（控制权分裂）', 'Disputé — contrôle partagé', '교전 중 — 지배 분할') },
  NEUTRAL: { col: '#9aa1a8', name: L('Neutral', '中立', 'Neutral', 'Нейтральные', 'Neutral', '中立', '中立', 'Neutre', '중립') },
};
const F_WW2 = {
  ALLIED: { col: '#4a7fbd', name: L('Allies', '連合国', 'Alliierte', 'Союзники', 'Aliados', '同盟國', '同盟国', 'Alliés', '연합국') },
  AXIS: { col: '#b4544a', name: L('Axis', '枢軸国', 'Achsenmächte', 'Страны Оси', 'Potencias del Eje', '軸心國', '轴心国', 'Axe', '추축국') },
  CONTESTED: { col: '#c9963c', name: F_WW1.CONTESTED.name },
  COBELL: { col: '#c97f6e', name: L('Co-belligerent with the Axis', '枢軸国の共同交戦国', 'Mitkriegführend an der Seite der Achse', 'Совоюющие со странами Оси', 'Cobeligerante del Eje', '軸心國的共同交戰國', '轴心国的共同交战国', 'Cobelligérant de l’Axe', '추축국의 공동 교전국') },
  NEUTRAL: { col: '#9aa1a8', name: F_WW1.NEUTRAL.name },
};

export { L, F_WW1, F_WW2 };
