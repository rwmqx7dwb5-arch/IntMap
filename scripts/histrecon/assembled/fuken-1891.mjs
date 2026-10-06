/* ==========================================================================
 * scripts/histrecon/assembled/fuken-1891.mjs   (hist-reconstruction · Japan, prefectures 1891-01-01 → 1943-06-30)
 *
 * The prefectures between the end of the Meiji reconstruction (assembled/meiji.mjs, to 1890-12-31) and the
 * end of 東京府 (1943-07-01), as unions of the 1920 町村 of 国土数値情報 N03-1920 (munis-n03-1920.mjs —
 * the same parts, with the same rounding, the Meiji record is drawn from, so the two meet on one line).
 *
 * A 1920 町村 belongs to its 1920 prefecture on every day of the scope except where
 * scripts/histrecon/fuken1891-changes.json states otherwise:
 *   moves     a whole 1920 町村 on the other side of a dated change (三多摩 1893, 石井村 1896, 1899, 保谷 1907)
 *   mixed     a 1920 町村 holding land of two prefectures in a window — WITHHELD from both (no part finer
 *             than the 町村 is used here; the facts name the 大字 that would be needed)
 *   islands   a polygon of a 1920 町村 that was not Japanese territory before a date, or whose incorporation
 *             is not settled — left out (N03-1920 was compiled on the 1950 municipalities, so it carries
 *             islands incorporated after 1920 too: 沖ノ鳥島 1931)
 * Unit identity (id, names, wikidata) is read from meiji-prefectures.json — the unit with no end whose
 * names.ja is the 1920 prefecture (aliases in the facts file) — so a prefecture keeps its id across 1891-01-01.
 *
 * The unions are cached by a hash of every input, like meiji.mjs.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cacheDir } from '../atoms/ne-admin1.mjs';

export const KEY = 'JPN-fuken-1891';
export const COUNTRY = 'JPN';
const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));     // scripts/histrecon
const FACTS = 'fuken1891-changes.json';
const INPUTS = [FACTS, 'meiji-prefectures.json', 'munis-n03-1920.mjs', 'assembled/fuken-1891.mjs'];
const CENTROID_TOL = 0.001;  // degrees; the facts give each island's outer-ring vertex mean rounded to 4 decimals (observed 2026-10-06: 北小島 and 南小島 lie 0.011° apart)

const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const ymd = (iso) => Number(iso.replace(/-/g, ''));
const readFacts = () => JSON.parse(fs.readFileSync(path.join(HERE, FACTS), 'utf8'));

/** the 1920 prefecture name → the unit of meiji-prefectures.json in force on 1890-12-31 */
function unitTable(F) {
  const M = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
  const alive = M.prefectures.filter((p) => p.start <= F.scope.from && (!p.end || p.end > addDays(F.scope.from, -1)));
  const alias = new Map((F.aliases || []).map((a) => [a.pref1920, a.unit]));
  return (pref1920) => {
    const want = alias.get(pref1920) || pref1920;
    const c = alive.filter((p) => p.id === want || p.names.ja === want);
    if (c.length !== 1) throw new Error('fuken-1891: ' + c.length + ' meiji units in force on ' + F.scope.from + ' for the 1920 prefecture ' + pref1920);
    return c[0];
  };
}

/** every unit of meiji-prefectures.json in force at the scope start holds territory over the whole scope (no
    first-level unit was created or abolished 1891-01-01 → 1943-06-30: the counts in the facts file) — read
    without the 200 MB parts, which check:histrecon must not need */
export function statedSpans() {
  const F = readFacts();
  const M = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
  const alive = M.prefectures.filter((p) => p.start <= F.scope.from && (!p.end || p.end > addDays(F.scope.from, -1)));
  return { scopeEnd: addDays(F.scope.to, 1), units: new Map(alive.map((p) => [p.id, [{ from: F.scope.from, to: null }]])) };
}

async function loadMunis(log) {
  const f = path.join(cacheDir(), 'meiji-munis-cache.json');       // written by build-meiji-v2.mjs --munis-cache
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).munis;
  log('fuken-1891: building the 1920 町村 (munis-n03-1920.mjs)');
  const { munis } = await import('../munis-n03-1920.mjs');
  const m = await munis({ log });
  fs.writeFileSync(f, JSON.stringify({ munis: [...m.munis.values()], unionTrouble: m.unionTrouble }));
  return [...m.munis.values()];
}
/* the 1920 郡/市 blocks (blocks-n03-1920.mjs): unions of exactly the 町村 above, with the same rounding — a block all
   of whose 町村 sit wholly in one unit is taken whole, so a prefecture is a union of ~15 blocks, not ~300 町村
   (MEASURED 2026-10-06: polygon-clipping refused the one-call union of 東京府's 119 町村 even on snapped input) */
async function loadBlocks(log) {
  const f = path.join(cacheDir(), 'meiji-blocks-cache.json');      // written by build-meiji-v2.mjs --blocks-cache
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).blocks;
  log('fuken-1891: building the 1920 郡/市 blocks (blocks-n03-1920.mjs)');
  const { blocks } = await import('../blocks-n03-1920.mjs');
  const BL = await blocks({ log });
  fs.writeFileSync(f, JSON.stringify(BL));
  return BL.blocks;
}
/* build-meiji-v2.mjs unionAll(): one call, else fold piece by piece, a piece that will not merge kept beside the
   others and counted (the same rule, so the two records report seams alike) */
function unionAll(polys, label, clip, trouble) {
  if (polys.length < 2) return polys;
  try { return clip('union', polys[0], ...polys.slice(1)); } catch { /* fold */ }
  let acc = [polys[0]], seams = 0;
  for (const p of polys.slice(1)) { try { acc = clip('union', acc, [p]); } catch { acc = acc.concat([p]); seams++; } }
  if (seams) trouble.push(label + ' (' + seams + ' unmerged)');
  return acc;
}
const round6 = (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));

const centroid = (poly) => { let sx = 0, sy = 0; const r = poly[0]; for (const [x, y] of r) { sx += x; sy += y; } return [sx / r.length, sy / r.length]; };

/** the state of one island polygon on day t: 'in' | 'out' (not yet territory) | 'unresolved' */
function islandState(e, t) {
  if (e.from == null) return 'unresolved';
  if (e.unresolvedWindow && t >= e.unresolvedWindow[0] && t < e.unresolvedWindow[1]) return 'unresolved';
  return t >= e.from ? 'in' : 'out';
}

/** every fact applied to every 1920 町村: per unit, the maximal intervals with one membership, and what is withheld */
export function plan(F, munis) {
  const unitOf = unitTable(F);
  const byKey = new Map(munis.map((m) => [m.key, m]));
  const need = (k, why) => { if (!byKey.has(k)) throw new Error('fuken-1891: no 1920 町村 «' + k + '» (' + why + ')'); return byKey.get(k); };
  const scopeEnd = addDays(F.scope.to, 1);
  /* moves: key → [{date, from, to}] */
  const moves = new Map();
  for (const mv of F.moves) {
    let keys = mv.munis || [];
    if (mv.munisRule) {
      const r = mv.munisRule, ex = new Set(r.except || []);
      keys = munis.filter((m) => m.pref1920 === r.pref1920 && r.gun.includes(m.gun) && !ex.has(m.key)).map((m) => m.key);
      if (!keys.length) throw new Error('fuken-1891: move ' + mv.id + ' matched no 町村');
    }
    for (const k of keys) { need(k, 'move ' + mv.id); if (!moves.has(k)) moves.set(k, []); moves.get(k).push(mv); }
  }
  const mixed = new Map();
  for (const mx of F.mixed) for (const k of mx.munis) { need(k, 'mixed ' + mx.id); if (!mixed.has(k)) mixed.set(k, []); mixed.get(k).push(mx); }
  /* islands: (muni key, polygon index) → island fact */
  const isl = new Map();
  for (const e of F.islands) {
    const m = need(e.muni, 'island ' + e.id);
    const hit = (pi) => { const k = m.key + '#' + pi; if (isl.has(k)) throw new Error('fuken-1891: polygon ' + k + ' named by two island facts'); isl.set(k, e); };
    if (e.whole) m.coords.forEach((_, pi) => hit(pi));
    for (const c of e.centroids || []) {
      const hits = m.coords.map((p, pi) => [pi, centroid(p)]).filter(([, q]) => Math.abs(q[0] - c[0]) < CENTROID_TOL && Math.abs(q[1] - c[1]) < CENTROID_TOL);
      if (hits.length !== 1) throw new Error('fuken-1891: island ' + e.id + ' centroid ' + c + ' matches ' + hits.length + ' polygons of ' + m.key);
      hit(hits[0][0]);
    }
    if (e.alsoMuni) {
      const a = need(e.alsoMuni, 'island ' + e.id), [x0, y0, x1, y1] = e.alsoBox;
      let n = 0;
      a.coords.forEach((p, pi) => { const [x, y] = centroid(p); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { const k = a.key + '#' + pi; if (!isl.has(k)) { isl.set(k, e); n++; } } });
      if (!n) throw new Error('fuken-1891: island ' + e.id + ' box matched nothing in ' + a.key);
    }
  }
  /* breakpoints */
  const bp = new Set([F.scope.from, scopeEnd]);
  for (const mv of F.moves) bp.add(mv.date);
  for (const mx of F.mixed) { if (mx.until) bp.add(mx.until); if (mx.from) bp.add(mx.from); }
  for (const e of F.islands) { if (e.from) bp.add(e.from); for (const d of e.unresolvedWindow || []) bp.add(d); }
  const days = [...bp].filter((d) => d >= F.scope.from && d <= scopeEnd).sort();
  /* per interval: unit id → list of [muni key, polygon index | -1 for all] */
  const per = new Map(), withheld = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const a = days[i], b = days[i + 1];
    for (const m of munis) {
      const mx = (mixed.get(m.key) || []).find((x) => (x.until && a < x.until) || (x.from && a >= x.from));
      if (mx) { withheld.push({ muni: m.key, from: a, to: b, why: 'mixed ' + mx.id }); continue; }
      let pref = m.pref1920;
      for (const mv of moves.get(m.key) || []) if (a < mv.date) pref = mv.from;
      const u = unitOf(pref).id;
      const parts = [];
      let all = true;
      m.coords.forEach((_, pi) => {
        const e = isl.get(m.key + '#' + pi);
        if (!e) { parts.push(pi); return; }
        const s = islandState(e, a);
        if (s === 'in') parts.push(pi);
        else { all = false; if (s === 'unresolved') withheld.push({ muni: m.key + '#' + pi, from: a, to: b, why: 'island ' + e.id }); }
      });
      if (!parts.length) continue;
      if (!per.has(u)) per.set(u, new Map());
      const pu = per.get(u);
      if (!pu.has(a)) pu.set(a, { a, b, members: [] });
      pu.get(a).members.push(all ? m.key : m.key + '#' + parts.join(','));
    }
  }
  /* merge consecutive intervals with the same membership */
  const spans = [];
  for (const [u, pu] of per) {
    const iv = [...pu.values()].sort((p, q) => (p.a < q.a ? -1 : 1));
    for (const x of iv) { x.members.sort(); x.sig = x.members.join('|'); }
    let cur = null;
    for (const x of iv) {
      if (cur && cur.b === x.a && cur.sig === x.sig) cur.b = x.b;
      else { if (cur) spans.push(cur); cur = { unit: u, a: x.a, b: x.b, sig: x.sig, members: x.members }; }
    }
    if (cur) spans.push(cur);
  }
  return { spans, withheld, scopeEnd, unitOf };
}

function polysOf(member, byKey) {
  const [k, idx] = member.split('#');
  const m = byKey.get(k);
  return idx == null ? m.coords : idx.split(',').map((i) => m.coords[Number(i)]);
}

export async function candidates({ log = () => {} } = {}) {
  const F = readFacts();
  const h = crypto.createHash('sha256');
  for (const f of INPUTS) { const p = path.join(HERE, f); if (fs.existsSync(p)) h.update(f).update(fs.readFileSync(p)); }
  const hash = h.digest('hex').slice(0, 16);
  const cacheFile = path.join(cacheDir(), 'fuken1891-' + hash + '.json');
  const munis = await loadMunis(log);
  const P = plan(F, munis);
  let built;
  if (fs.existsSync(cacheFile)) { built = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); log('fuken-1891: cached assembly ' + hash); }
  else {
    const { clip } = await import('../estat-koaza.mjs');
    const byKey = new Map(munis.map((m) => [m.key, m]));
    const blocks = new Map((await loadBlocks(log)).map((b) => [b.id, b]));
    const munisOfBlock = new Map();
    for (const m of munis) { if (!munisOfBlock.has(m.blockId)) munisOfBlock.set(m.blockId, []); munisOfBlock.get(m.blockId).push(m.key); }
    const memo = new Map(), trouble = [];
    built = [];
    log('fuken-1891: ' + P.spans.length + ' spans to union');
    const t0 = Date.now();
    for (const s of P.spans) {
      if (!memo.has(s.sig)) {
        const whole = new Set(s.members.filter((x) => !x.includes('#')));
        const byBlock = new Map();
        for (const x of s.members) { const b = byKey.get(x.split('#')[0]).blockId; if (!byBlock.has(b)) byBlock.set(b, []); byBlock.get(b).push(x); }
        const polys = [];
        for (const [b, xs] of byBlock) {
          const all = munisOfBlock.get(b);
          if (blocks.has(b) && all.length === xs.length && all.every((k) => whole.has(k))) polys.push(...blocks.get(b).coords);
          else polys.push(...unionAll(xs.flatMap((x) => polysOf(x, byKey)), s.unit + ' ' + s.a + ' ' + b, clip, trouble));
        }
        memo.set(s.sig, round6(unionAll(polys, s.unit + ' ' + s.a, clip, trouble)));
        log('  ' + s.unit + ' ' + s.a + ' (' + byBlock.size + ' blocks) ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
      }
      built.push({ unit: s.unit, a: s.a, b: s.b, polys: memo.get(s.sig), members: s.members.length });
    }
    if (trouble.length) log('fuken-1891: unmerged pieces kept beside the union: ' + trouble.join('; '));
    fs.writeFileSync(cacheFile, JSON.stringify(built));
  }
  const unitById = new Map();
  for (const m of munis) { const u = P.unitOf(m.pref1920); unitById.set(u.id, u); }
  for (const mv of F.moves) { const u = P.unitOf(mv.from); unitById.set(u.id, u); }
  const list = built.map((s, k) => {
    const U = unitById.get(s.unit);
    const endsAtScope = s.b === P.scopeEnd;
    return {
      unit: { id: U.id, names: { en: U.names.en, ja: U.names.ja }, wikidata: U.wikidata || null },
      span: { from: s.a, to: endsAtScope ? null : s.b, precision: 'day' }, k,
      from: ymd(s.a), to: ymd(s.b), polys: s.polys,
    };
  });
  const unresolved = (F.unresolved || []).length + F.islands.filter((e) => e.unresolved).length;
  return { file: 'scripts/histrecon/' + FACTS, units: new Set(list.map((c) => c.unit.id)).size, unresolved, list, withheld: P.withheld };
}
