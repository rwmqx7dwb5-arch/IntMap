/* ============================================================================
 *  IntMap · COMPOSE THE BUNDLED SATELLITE CATALOGUE  (scripts/build-tle-snapshot.mjs と
 *  tests/tle-carry-forward-checks.test.mjs の両方が使う、唯一の合成規則)
 * ----------------------------------------------------------------------------
 *  ⚠ 「CelesTrak が答えれば CelesTrak、答えなければ SatNOGS」の二者択一は、SatNOGS（約 1,700 件）の
 *  部分集合が直前の約 16,000 件の束を丸ごと上書きした（#1025 で 15,956 → 1,685・本番の「Live
 *  satellites」が 1,408/1,685 に）。選ぶのではなく合成する:
 *    - CelesTrak が答えた回: CelesTrak の active が母集合の正。そこに無い ID は落とす
 *      （減衰・再突入した物体を残さない）。
 *    - CelesTrak が答えなかった回: 直前の束の ID を母集合として持ち越し、今回答えた上流
 *      （SatNOGS）の要素で、より新しい epoch のものだけ更新する。
 *  どちらも NORAD ID ごとに epoch が新しい要素を採る。
 * ==========================================================================*/

/* A 3-line set is only usable if its two element lines are the right length and carry the right
   line numbers. Anything else is dropped rather than shipped. */
export const usable = (l1, l2) => typeof l1 === 'string' && typeof l2 === 'string'
  && l1.length >= 69 && l2.length >= 69 && l1[0] === '1' && l2[0] === '2'
  && l1.slice(2, 7).trim() === l2.slice(2, 7).trim();

export const parseTle = (txt) => {
  const lines = String(txt).split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = (lines[i] || '').trim(), l1 = lines[i + 1], l2 = lines[i + 2];
    if (!name || !usable(l1, l2)) continue;
    out.push([name, l1, l2]);
  }
  return out;
};
export const parseSatnogs = (arr) => {
  const out = [];
  for (const s of (Array.isArray(arr) ? arr : [])) {
    const name = String(s.tle0 || '').replace(/^0\s+/, '').trim();
    if (!name || !usable(s.tle1, s.tle2)) continue;
    out.push([name, s.tle1, s.tle2]);
  }
  return out;
};

/* ⚠ THE TLE EPOCH FIELD IS `YYDDD.DDDDDDDD`, AND IT DOES NOT SORT (two-digit year wraps at 57: 1975
   would sort after 2026). Convert to an absolute instant first. */
export const epochMs = (l1) => {
  const e = parseFloat(l1.slice(18, 32));
  if (!isFinite(e)) return 0;
  const yy = Math.floor(e / 1000), year = yy < 57 ? 2000 + yy : 1900 + yy, doy = e % 1000;
  return Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
};
export const idOf = (l1) => l1.slice(2, 7).trim();

/* sources, in the order they win a tie on epoch: a fresh upstream beats a carried set */
const RANK = { celestrak: 2, satnogs: 1, carried: 0 };

/* celestrak / satnogs: [[name,l1,l2]…] from the upstream that ANSWERED this run, or null/[] when it
   did not. previous: [[name,l1,l2]…] — the bundle that shipped before. Returns the kept sets (each
   with the source that supplied it) and the counts by source. */
export const composeCatalogue = ({ celestrak = null, satnogs = null, previous = [] } = {}) => {
  const cel = celestrak && celestrak.length ? celestrak : null;
  const byId = new Map();
  const offer = (sets, source, admit) => {
    for (const [name, l1, l2] of sets) {
      const id = idOf(l1);
      if (admit && !admit.has(id)) continue;
      const epoch = epochMs(l1), prev = byId.get(id);
      if (!prev || epoch > prev.epoch || (epoch === prev.epoch && RANK[source] > RANK[prev.source])) {
        byId.set(id, { name, l1, l2, epoch, source });
      }
    }
  };
  if (cel) {
    /* CelesTrak answered: it is the whole truth about which objects are active */
    offer(cel, 'celestrak');
    const universe = new Set(byId.keys());
    if (satnogs && satnogs.length) offer(satnogs, 'satnogs', universe);
  } else {
    /* CelesTrak did not answer: the previous bundle is the universe; what answered updates it, and
       an object only the answering upstream knows is real data and joins */
    offer(previous, 'carried');
    if (satnogs && satnogs.length) offer(satnogs, 'satnogs');
  }
  const kept = [...byId.values()];
  const counts = { celestrak: 0, satnogs: 0, carried: 0 };
  for (const o of kept) counts[o.source]++;
  return { kept, counts, celestrakAnswered: !!cel };
};

/* When CelesTrak last answered: now if it did this run, otherwise what the previous manifest says
   (its own `lastCelestrakAt`, or — for a bundle built before that field existed — its builtAt when
   CelesTrak was its source). null when no record states it. */
export const lastCelestrakAt = ({ celestrakAnswered, now, previousManifest }) => {
  if (celestrakAnswered) return now;
  const m = previousManifest || {};
  if (m.lastCelestrakAt) return m.lastCelestrakAt;
  if (/^CelesTrak/.test(String(m.source || '')) && m.builtAt) return m.builtAt;
  return null;
};

/* fetched: {group: [ids]} for the groups that answered; wanted: all group names; previous:
   {group: [ids]} from the shipped groups.json; have: Set of ids (digits, no leading zeros) the
   catalogue holds. A group that did not answer keeps its previous ids that the catalogue still
   holds, and is recorded as carried; a group neither answered nor previously known stays ABSENT
   (not empty — "not known here" is the truth). */
export const composeGroups = ({ wanted, fetched = {}, previous = {}, have }) => {
  const groups = {}, carried = [];
  for (const g of wanted) {
    if (fetched[g] && fetched[g].length) { groups[g] = [...fetched[g]].sort((a, b) => a - b); continue; }
    const prev = (previous[g] || []).filter(id => have.has(String(id)));
    if (prev.length) { groups[g] = [...prev].sort((a, b) => a - b); carried.push(g); }
  }
  return { groups, carried };
};
