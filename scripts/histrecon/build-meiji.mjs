#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/build-meiji.mjs   (hist-coverage-depth · PILOT — writes nothing into the repo)
 *
 * MEIJI PREFECTURES (1871-12 … 1890-12) RECONSTRUCTED FROM STATED FACTS ON 1920 BUILDING BLOCKS.
 *
 *   facts   scripts/histrecon/meiji-prefectures.json — «this 1920 郡/市 was in this 府県 from X to Y»,
 *           each row cited (Japanese Wikipedia revisions, verbatim quotes)
 *   blocks  scripts/histrecon/blocks-n03-1920.mjs    — the 1920 郡/市 polygons of 国土数値情報 N03-1920
 *
 * What this file claims, and what it refuses to claim (.agents/rules/historical-verification.md §0):
 *   a prefecture is drawn on an interval ONLY when every 1920 block it is drawn with is wholly its land
 *   on that interval, as far as the facts say. A prefecture is WITHHELD (not drawn) on an interval when
 *     R1  one of its rows there has `split` (part of the block only; extent not given village by village)
 *     R2  a block it is drawn with is held by another prefecture too on that interval, or a block that
 *         several 1920 units were joined to is only partly accounted for on that interval
 *     R3  an `unresolved` entry names one of its units (or the prefecture) inside the entry's dated window
 *     R4  a village moved between two 1920 blocks after that interval (and before the 1920 survey) while
 *         the two blocks were in different prefectures — the 1920 block holds the other prefecture's land.
 *         Sources: `villageTransfers` (all of them, re-checked here from the quote, not from the
 *         heuristic `prefectureBoundaryRisk`) and the dated annexations in `cities[].parents`.
 *     R5  one of its rows could not be joined to a block and its land is not inside a block drawn for it
 *   and in R1–R4 the OTHER prefecture(s) of the pair are withheld too.
 *   Nothing is simplified in the full bundle (6 decimals, N03's own vertices).
 *
 * Usage:
 *   node scripts/histrecon/build-meiji.mjs --out <dir> [--blocks-cache <file.json>]
 *     --blocks-cache: a JSON dump of blocks() (it takes ~90 s to recompute); written if absent.
 * Output (in <dir>, never in the repository):
 *   hist-admin-recon-meiji.js          full precision, gap-bundle shape (window.__HISTADMRECONMEIJI)
 *   hist-admin-recon-meiji-coarse.js   the same, simplified with data/hist-admin1.js's own tolerance
 *   meiji-report.json / meiji-report.md
 *   meiji-*.png                        maps rendered with playwright
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';
import turfArea from '@turf/area';
import { blocks as loadBlocks, SOURCE as N03 } from './blocks-n03-1920.mjs';
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = arg('--out');
if (!OUT) { console.error('usage: node scripts/histrecon/build-meiji.mjs --out <dir> [--blocks-cache <file>]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const log = (s) => console.error(s);

/* ── inputs ─────────────────────────────────────────────────────────────────────────────── */
const F = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
let BL;
{
  const cache = arg('--blocks-cache');
  if (cache && fs.existsSync(cache)) BL = JSON.parse(fs.readFileSync(cache, 'utf8'));
  else { BL = await loadBlocks({ log }); if (cache) fs.writeFileSync(cache, JSON.stringify(BL)); }
}
const BLOCKS = BL.blocks;
const BID = new Map(BLOCKS.map((b) => [b.id, b]));
const readWindow = (file, key) => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { window: w }); return w[key]; };

/* dates: ISO strings compare lexically; the record's scope ends 1890-12-31 inclusive -> exclusive end */
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const END = addDays(F.scope.to, 1);
const rowEnd = (r) => r.to || END;
const active = (r, t) => r.from <= t && rowEnd(r) > t;

/* ── prefecture identity: rows carry prefId, or only a name (cities) resolved by name + date ─── */
const PREF = new Map(F.prefectures.map((p) => [p.id, p]));
const unresolvedPrefRows = [];
for (const r of F.membership) {
  if (r.prefId) continue;
  const c = F.prefectures.filter((p) => p.names.ja === r.pref && p.start <= r.from && (!p.end || p.end > r.from));
  if (c.length === 1) r.prefId = c[0].id; else unresolvedPrefRows.push(r);
}

/* ══ 1. JOIN ══════════════════════════════════════════════════════════════════════════════
   Key = the 1920 name. Where a name repeats, the disambiguator in `gunTitle` («(愛知県)» / «(十勝国)»)
   and the places the same 国 is found by the rows whose names do NOT repeat decide. Everything else
   is reported. A second pass joins the leftover rows to leftover blocks only when one rule, stated in
   the report, gives exactly one candidate in the right place. */
/* innermost first: the facts nest them («多摩郡（一部（範囲不明））») */
const stripParen = (s) => { let t = String(s || ''), u; do { u = t; t = t.replace(/[（(][^（()）]*[）)]/g, ''); } while (t !== u); return t.trim(); };
const byName = new Map();
for (const b of BLOCKS) { if (!byName.has(b.name)) byName.set(b.name, []); byName.get(b.name).push(b); }
const loc = (b) => b.pref1920 + '/' + (b.id.split('/').length === 3 ? b.id.split('/')[1] : '');
const unitKey = (r) => r.kind + ':' + (r.gunTitle || r.gun);
const kuniList = (k) => String(k || '').split(/[・、]/).map((s) => s.trim()).filter(Boolean);

const rowsByUnit = new Map();
for (const r of F.membership) { const k = unitKey(r); if (!rowsByUnit.has(k)) rowsByUnit.set(k, []); rowsByUnit.get(k).push(r); }

const unitBlock = new Map();           // unitKey -> [blockId]
const joinHow = new Map();             // unitKey -> rule
// pass 0: names that occur once
const kuniPlaces = new Map(), kuniPrefs = new Map();
for (const [k, rs] of rowsByUnit) {
  const c = byName.get(rs[0].gun) || [];
  if (c.length === 1) {
    unitBlock.set(k, [c[0].id]); joinHow.set(k, 'name');
    for (const q of kuniList(rs[0].kuni)) {
      if (!kuniPlaces.has(q)) { kuniPlaces.set(q, new Set()); kuniPrefs.set(q, new Set()); }
      kuniPlaces.get(q).add(loc(c[0])); kuniPrefs.get(q).add(c[0].pref1920);
    }
  }
}
// pass 1: repeated names -> gunTitle disambiguator, then the 国's learned places
for (const [k, rs] of rowsByUnit) {
  if (unitBlock.has(k)) continue;
  const r = rs[0], c = byName.get(r.gun) || [];
  if (c.length < 2) continue;
  const dis = (/[（(]([^）)]+)[）)]/.exec(r.gunTitle || '') || [])[1];
  let pick = [];
  if (dis && /[都道府県]$/.test(dis)) { pick = c.filter((b) => b.pref1920 === dis); if (pick.length === 1) { unitBlock.set(k, [pick[0].id]); joinHow.set(k, 'name + title (' + dis + ')'); continue; } }
  const ks = dis && /国$/.test(dis) ? [dis] : kuniList(r.kuni);
  const places = new Set(ks.flatMap((q) => [...(kuniPlaces.get(q) || [])]));
  pick = c.filter((b) => places.has(loc(b)));
  if (pick.length !== 1) { const prefs = new Set(ks.flatMap((q) => [...(kuniPrefs.get(q) || [])])); const p2 = c.filter((b) => prefs.has(b.pref1920)); if (pick.length === 0 && p2.length === 1) pick = p2; }
  if (pick.length === 1) { unitBlock.set(k, [pick[0].id]); joinHow.set(k, 'name + 国 place (' + ks.join('・') + ')'); }
}
const used = () => new Set([...unitBlock.values()].flat());
const unjoinedUnits = () => [...rowsByUnit.keys()].filter((k) => !unitBlock.has(k));
const timeline = (k) => rowsByUnit.get(k).map((r) => r.prefId + '@' + r.from + '..' + (r.to || '') + (r.split ? '*' : '')).sort().join(';');
// pass 1b: units that share a name and cannot be told apart (N03 keys Hokkaido by 支庁+郡 and has no 国:
// 石狩国 and 天塩国 上川郡 are one block). When every such unit has the SAME prefecture timeline, the union
// of their blocks is exactly the union of their land on every interval — they are joined as a group.
const groupJoins = [];
{
  const groups = new Map();
  for (const k of rowsByUnit.keys()) { const n = rowsByUnit.get(k)[0].gun; if (!groups.has(n)) groups.set(n, []); groups.get(n).push(k); }
  for (const [n, ks] of groups) {
    if (ks.length < 2 || !ks.some((k) => !unitBlock.has(k))) continue;
    const prefs = new Set(ks.flatMap((k) => kuniList(rowsByUnit.get(k)[0].kuni)).flatMap((q) => [...(kuniPrefs.get(q) || [])]));
    const c = (byName.get(n) || []).filter((b) => prefs.has(b.pref1920));
    if (!c.length || new Set(ks.map(timeline)).size !== 1) continue;
    for (const k of ks) { unitBlock.set(k, c.map((b) => b.id)); joinHow.set(k, 'group: ' + ks.length + ' units named ' + n + ' with one prefecture timeline -> ' + c.map((b) => b.id).join(' + ')); }
    groupJoins.push({ name: n, units: ks, blocks: c.map((b) => b.id) });
  }
}
// pass 2: leftovers. Candidates are blocks that no unit joined, in the places (1920 prefecture/支庁) the 国 is found in.
const variantRules = [
  ['parenthetical disambiguator stripped', (a, b) => stripParen(a) === b],
  ['row name is the tail of the 1920 name (a prefixed 郡 such as 北/南/東/西)', (a, b) => b.length > a.length && b.endsWith(a) && /^[東西南北中上下]+$/.test(b.slice(0, b.length - a.length))],
  ['same length, one character differs (variant glyph)', (a, b) => a.length === b.length && a.length >= 3 && [...a].filter((ch, i) => ch !== [...b][i]).length === 1 && a.slice(-1) === b.slice(-1)],
  ['stem without 諸島/島庁/島司 equal', (a, b) => { const s = (x) => x.replace(/(諸島|島庁|島司)$/, ''); return /(諸島|島庁|島司)$/.test(a) && /(諸島|島庁|島司)$/.test(b) && s(a) === s(b); }],
];
for (const [rule, test] of variantRules) {
  for (const k of unjoinedUnits()) {
    const r = rowsByUnit.get(k)[0];
    const places = new Set(kuniList(r.kuni).flatMap((q) => [...(kuniPlaces.get(q) || [])]));
    const u = used();
    const c = BLOCKS.filter((b) => !u.has(b.id) && test(r.gun, b.name) && (places.size === 0 || places.has(loc(b))));
    if (c.length === 1) { unitBlock.set(k, [c[0].id]); joinHow.set(k, rule); }
  }
}

/* adjacency of blocks: shared vertices (N03 polygons of neighbouring 町村 share their vertices) */
const adj = new Map(BLOCKS.map((b) => [b.id, new Set()]));
{
  const vk = new Map();
  for (const b of BLOCKS) for (const p of b.coords) for (const ring of p) for (const [x, y] of ring) {
    const key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4);
    let s = vk.get(key); if (!s) vk.set(key, s = new Set()); s.add(b.id);
  }
  const cnt = new Map();
  for (const s of vk.values()) if (s.size > 1) { const a = [...s]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const k2 = a[i] < a[j] ? a[i] + '|' + a[j] : a[j] + '|' + a[i]; cnt.set(k2, (cnt.get(k2) || 0) + 1); } }
  for (const [k2, n] of cnt) if (n >= 2) { const [a, b] = k2.split('|'); adj.get(a).add(b); adj.get(b).add(a); }
}

// pass 3: a 市 row whose `then` 郡 is joined: the one leftover 市 block touching that 郡's block
for (const k of unjoinedUnits()) {
  const r = rowsByUnit.get(k)[0];
  if (r.kind !== 'shi') continue;
  const thenBlocks = r.then.map(stripParen).flatMap((t) => [...rowsByUnit.entries()].filter(([, rs]) => rs[0].gun === t && rs[0].kind === 'gun').flatMap(([kk]) => unitBlock.get(kk) || []));
  const u = used();
  const c = BLOCKS.filter((b) => b.kind === '市' && !u.has(b.id) && thenBlocks.some((t) => adj.get(t).has(b.id)));
  if (c.length === 1) { unitBlock.set(k, [c[0].id]); joinHow.set(k, 'leftover 市 block touching the block of its then-郡 ' + r.then.join('/')); }
}
// pass 4: a leftover block with the same name and 1920 prefecture as a joined 郡 = the same 郡, cut by a 支庁 line
for (const b of BLOCKS) {
  if (used().has(b.id)) continue;
  const hits = [...unitBlock.entries()].filter(([, ids]) => ids.some((id) => BID.get(id).name === b.name && BID.get(id).pref1920 === b.pref1920));
  if (hits.length === 1) { hits[0][1].push(b.id); joinHow.set(hits[0][0], joinHow.get(hits[0][0]) + ' + same 郡 in another 支庁 (' + b.id + ')'); }
}
for (const [k, rs] of rowsByUnit) for (const r of rs) r._blocks = unitBlock.get(k) || null;
const blockUnits = new Map();
for (const [k, ids] of unitBlock) for (const id of ids) { if (!blockUnits.has(id)) blockUnits.set(id, new Set()); blockUnits.get(id).add(k); }
const unjoined = unjoinedUnits().map((k) => ({ unit: k, rows: rowsByUnit.get(k).length, kuni: rowsByUnit.get(k)[0].kuni, then: rowsByUnit.get(k)[0].then, prefs: [...new Set(rowsByUnit.get(k).map((r) => r.pref))] }));
const rowless = BLOCKS.filter((b) => !blockUnits.has(b.id)).map((b) => ({ id: b.id, kind: b.kind, km2: +b.areaKm2.toFixed(1) }));
const variantJoins = [...joinHow].filter(([, h]) => h !== 'name' && !/^name \+/.test(h)).map(([k, h]) => ({ unit: k, blocks: unitBlock.get(k), rule: h }));
log('join: units ' + rowsByUnit.size + ', joined ' + unitBlock.size + ', unjoined ' + unjoined.length + ', blocks without rows ' + rowless.length);

/* ══ 2. BREAKPOINTS ══════════════════════════════════════════════════════════════════════ */
const bp = new Set([END]);
for (const r of F.membership) { bp.add(r.from); if (r.to) bp.add(r.to); }
for (const p of F.prefectures) { if (p.start) bp.add(p.start); if (p.end) bp.add(p.end); }
const BP = [...bp].filter((d) => d <= END).sort();
const INTERVALS = BP.slice(0, -1).map((a, i) => [a, BP[i + 1]]);
const intervalIndexAt = (t) => INTERVALS.findIndex(([a, b]) => a <= t && b > t);

/* ══ 3. WITHHOLDING ══════════════════════════════════════════════════════════════════════ */
const withheld = new Map();     // i -> Map(prefId -> Set(reason))
const hold = (i, pid, why) => { if (!withheld.has(i)) withheld.set(i, new Map()); const m = withheld.get(i); if (!m.has(pid)) m.set(pid, new Set()); m.get(pid).add(why); };
const activeRows = INTERVALS.map(([a]) => F.membership.filter((r) => r.prefId && active(r, a)));
const prefsOnBlock = (i, id) => [...new Set(activeRows[i].filter((r) => r._blocks && r._blocks.includes(id)).map((r) => r.prefId))];

const incomplete = [];          // i -> [[prefId, unit]] drawn without a unit nothing locates
// rows of units with no prefecture identity
for (const r of unresolvedPrefRows) log('row without prefecture identity: ' + r.gun + ' ' + r.pref + ' ' + r.from);

INTERVALS.forEach(([a], i) => {
  const rows = activeRows[i];
  // R1 split
  for (const r of rows) if (r.split) {
    hold(i, r.prefId, 'R1 split: ' + r.gun + ' — ' + r.split.slice(0, 80));
    for (const id of r._blocks || []) for (const p of prefsOnBlock(i, id)) if (p !== r.prefId) hold(i, p, 'R1 split (other side): ' + r.gun);
  }
  // R2 shared / partly accounted blocks
  const byBlock = new Map();
  for (const r of rows) for (const id of r._blocks || []) { if (!byBlock.has(id)) byBlock.set(id, []); byBlock.get(id).push(r); }
  for (const [id, rs] of byBlock) {
    const ps = [...new Set(rs.map((r) => r.prefId))];
    if (ps.length > 1) for (const p of ps) hold(i, p, 'R2 block held by ' + ps.length + ' prefectures: ' + id);
    const want = blockUnits.get(id), have = new Set(rs.map(unitKey));
    if (want && want.size > have.size) for (const p of ps) hold(i, p, 'R2 block partly accounted (' + have.size + '/' + want.size + ' units): ' + id);
  }
  // R5 unjoined rows. If its then-郡 is joined, its land lies inside that block: same prefecture -> drawn
  // correctly as part of it; another prefecture -> both withheld. If nothing locates it, the prefecture is
  // drawn WITHOUT that land (a gap, no false line) and the omission is listed (`incomplete`).
  for (const r of rows) if (!r._blocks) {
    const thenIds = r.then.map(stripParen).flatMap((t) => F.membership.filter((q) => q.gun === t && q._blocks && active(q, a)).map((q) => [q.prefId, q._blocks]));
    if (thenIds.length && thenIds.every(([p]) => p === r.prefId)) continue;
    if (!thenIds.length) { (incomplete[i] ||= []).push([r.prefId, r.gunTitle || r.gun]); continue; }
    hold(i, r.prefId, 'R5 unjoined row inside another prefecture\'s block: ' + (r.gunTitle || r.gun));
    for (const [p] of thenIds) if (p !== r.prefId) hold(i, p, 'R5 unjoined row (other side): ' + r.gun);
  }
});

/* R3 unresolved — the entry's own text decides what and when (no entry is named here) */
/* Years from the N03 vintage on (the «1920 郡» of the file's own vocabulary) are not events of the record. */
const SURVEY_YEAR = 1920;
const dateSpans = (text) => {
  const out = [];
  let t = text;
  /* a day is an instant: the state changes ON it, so as a window end it is exclusive at the day itself */
  for (const m of text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) out.push([m[0], m[0]]);
  for (const m of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) { const d = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); out.push([d, d]); }
  t = t.replace(/(\d{4})-(\d{2})-(\d{2})/g, ' ').replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, ' ');
  for (const m of t.matchAll(/(\d{4})年(\d{1,2})月/g)) { const a = m[1] + '-' + m[2].padStart(2, '0') + '-01'; const b = +m[2] === 12 ? (+m[1] + 1) + '-01-01' : m[1] + '-' + String(+m[2] + 1).padStart(2, '0') + '-01'; out.push([a, b]); }
  t = t.replace(/(\d{4})年(\d{1,2})月/g, ' ');
  for (const m of t.matchAll(/(?<![\d-])(1[89]\d\d)(?![\d-])/g)) { const y = +m[1]; if (y >= 1868 && y < SURVEY_YEAR) out.push([y + '-01-01', (y + 1) + '-01-01']); }
  return out;
};
/* The window of an entry, from the entry's own structure:
     its title states a span («A → B»)            -> [A, B]
     its title says the DATE is disputed         -> [earliest, latest] date the explanation gives
     otherwise (the extent is unknown)            -> from the start of the record to the latest date given */
const unresolvedApplied = [];
for (const u of F.unresolved) {
  const own = dateSpans(u.what), expl = dateSpans(u.why);
  let w0, w1, how;
  if (own.length >= 2) { w0 = own.map((s) => s[0]).sort()[0]; w1 = own.map((s) => s[1]).sort().slice(-1)[0]; how = 'span in the title'; }
  else if (/\bdate\b/i.test(u.what) && own.concat(expl).length) { const s = own.concat(expl); w0 = s.map((x) => x[0]).sort()[0]; w1 = s.map((x) => x[1]).sort().slice(-1)[0]; how = 'disputed date: earliest..latest stated'; }
  else if (own.concat(expl).length) { w0 = '0000-01-01'; w1 = own.concat(expl).map((x) => x[1]).sort().slice(-1)[0]; how = 'extent unknown: record start..latest date given'; }
  const toks = u.what.split(/[\s・、→()（）,]+/).filter(Boolean);
  const names = new Set(toks.flatMap((t) => [t, t + '郡']));
  const prefNames = new Set(toks.filter((t) => F.prefectures.some((p) => p.names.ja === t)));
  if (!w1) { unresolvedApplied.push({ what: u.what, applied: false, note: 'no date in the entry: a caveat, not tied to an interval' }); continue; }
  if (/^city\s/.test(u.what)) { unresolvedApplied.push({ what: u.what, applied: false, note: 'routed to R4 as a transfer into the city block with an unknown other side' }); continue; }
  const thenHit = (t) => { const s = stripParen(t); return [...names].some((n) => s === n || (s.startsWith(n) && /^の/.test(s.slice(n.length)))); };
  const kuniNamed = toks.filter((t) => F.membership.some((r) => kuniList(r.kuni).includes(t)));
  const inKuni = (r) => !kuniNamed.length || kuniList(r.kuni).some((q) => kuniNamed.includes(q));
  const hit = (r) => (inKuni(r) && (names.has(r.gun) || r.then.some(thenHit))) || kuniList(r.kuni).some((q) => names.has(q)) || prefNames.has(r.pref);
  let n = 0; const ps = new Set();
  INTERVALS.forEach(([a, b], i) => {
    if (!(a < w1 && b > w0)) return;
    const rs = activeRows[i].filter(hit);
    // the other side: every prefecture holding the same blocks on this interval
    const ids = new Set(rs.flatMap((r) => r._blocks || []));
    const all = new Set(rs.map((r) => r.prefId));
    for (const id of ids) for (const p of prefsOnBlock(i, id)) all.add(p);
    for (const p of all) { hold(i, p, 'R3 unresolved: ' + u.what); n++; ps.add(p); }
  });
  unresolvedApplied.push({ what: u.what, applied: n > 0, window: [w0, w1], how, prefectures: [...ps].map((p) => PREF.get(p).names.ja), intervals: n, note: n ? '' : 'no row of a unit the title names is in force inside the window' });
}

/* R4 village transfers. The involved 1920 blocks are read from the entry: its article's unit, fromGun,
   toGun, otherGunNamed, and every 郡 the quote names (with its «X県» prefix when it has one). A transfer
   matters for every interval that starts before it: the moved land sits in the destination's 1920 block
   but belonged, then, to whichever prefecture held the 郡 it came from. Year precision -> end of year. */
/* A village moves across a shared boundary, so the two blocks of one transfer are NEIGHBOURS: touching
   (shared vertices) or, for islands, within NEAR_DEG of each other. Of a name that several 1920 units
   carry, only the candidates that neighbour the transfer's home block are taken; a home that is itself
   ambiguous is evaluated candidate by candidate, each with its own neighbours. When no other 郡 can be
   identified, every neighbour of the home block is involved (the destination is unknown, not absent).
   NEAR_DEG: 0.05° ≈ 5 km — a strait between an island 郡 and its mainland neighbour (estimate, not a
   measurement; it only widens which named candidates count as neighbours). */
const NEAR_DEG = 0.05;
const bboxOf = new Map(BLOCKS.map((b) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of b.coords) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [b.id, [x0, y0, x1, y1]]; }));
const nearMemo = new Map();
const near = (a, b) => {
  if (a === b || adj.get(a).has(b)) return true;
  const k = a < b ? a + '|' + b : b + '|' + a; if (nearMemo.has(k)) return nearMemo.get(k);
  const [ax0, ay0, ax1, ay1] = bboxOf.get(a), [bx0, by0, bx1, by1] = bboxOf.get(b);
  let ok = false;
  if (!(ax0 - NEAR_DEG > bx1 || bx0 - NEAR_DEG > ax1 || ay0 - NEAR_DEG > by1 || by0 - NEAR_DEG > ay1)) {
    const pts = (id) => { const o = []; for (const p of BID.get(id).coords) { const r = p[0]; const st = Math.max(1, Math.floor(r.length / 1500)); for (let i = 0; i < r.length; i += st) o.push(r[i]); } return o; };
    const pa = pts(a), pb = pts(b);
    outer: for (const [x, y] of pa) for (const [u, v] of pb) if (Math.abs(x - u) < NEAR_DEG && Math.abs(y - v) < NEAR_DEG) { ok = true; break outer; }
  }
  nearMemo.set(k, ok); return ok;
};
/* a then-郡 name as the facts spell it: «X郡», «X郡のうち…», «Y郡（X郡に当たる部分）» */
const thenNames = (t) => { const s = String(t); const o = [stripParen(s).replace(/のうち.*$/, '')]; for (const m of s.matchAll(/[（(]([^）)]*?郡)に当たる/g)) o.push(m[1]); return o; };
const unitsCalled = (g) => [...rowsByUnit.values()].filter((rs) => rs[0]._blocks && (rs[0].gun === g || rs[0].then.some((t) => thenNames(t).includes(g))));
/* «肥後国球磨郡小川村» / «三重県桑名郡»: the longest tail that is a known 郡 name; a 国/県 just before it filters */
const candidatesOf = (name, kuniHint) => {
  const s = String(name);
  for (let k = Math.min(6, s.length - 1); k >= 1; k--) {
    const g = s.slice(-(k + 1));
    let us = unitsCalled(g);
    if (!us.length) continue;
    const pre = s.slice(0, -(k + 1));
    const kuni = (/(.{1,3}国)$/.exec(pre) || [])[1] || kuniHint, pref = (/(.{1,3}[都道府県])$/.exec(pre) || [])[1];
    if (us.length > 1 && kuni) { const f = us.filter((rs) => kuniList(rs[0].kuni).includes(kuni)); if (f.length) us = f; }
    let ids = [...new Set(us.flatMap((rs) => rs[0]._blocks))];
    if (ids.length > 1 && pref) { const f = ids.filter((id) => BID.get(id).pref1920 === pref); if (f.length) ids = f; }
    return { g, ids, qualified: !!(kuni && kuni !== kuniHint) || !!pref };
  }
  return { g: null, ids: [], qualified: false };
};
const transfers = [];
/* For each home candidate: the named 郡 that resolve to a neighbour of it; failing a neighbour, every
   candidate in the same 1920 prefecture (an exclave: 1920 lines differ from the old ones). A named 郡 that
   resolves to the home block itself makes the move INTERNAL to one 1920 block — no line is involved. */
function addTransfer(src, T, homeCands, names, ownName) {
  const groups = [];
  let internal = false;
  for (const h of homeCands) {
    const others = new Set();
    for (const nm of names) {
      const { g, ids, qualified } = candidatesOf(nm);
      if (!g || (g === ownName && !qualified)) continue;
      if (ids.includes(h)) { internal = true; continue; }
      let pick = ids.filter((id) => near(h, id));
      if (!pick.length) pick = ids.filter((id) => BID.get(id).pref1920 === BID.get(h).pref1920);
      for (const id of pick) others.add(id);
    }
    if (others.size) groups.push({ home: h, blocks: [h, ...others], unknownOther: false });
    else if (homeCands.length === 1 && !internal) groups.push({ home: h, blocks: [h, ...adj.get(h)], unknownOther: true });
  }
  transfers.push({ src, T, homeCands, groups, internal: internal && !groups.length });
}
for (const v of F.villageTransfers) {
  /* ⚠ every entry is taken: the sweep's `villages` is empty for real moves (川辺郡's ten islands to 大島郡 1897) */
  const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(v.date);
  if (!m) { transfers.push({ src: v, skipped: 'date not parsed: ' + v.date }); continue; }
  const T = m[2] ? v.date : (+m[1] + 1) + '-01-01';
  if (T > SURVEY_YEAR + '-01-01') { transfers.push({ src: v, skipped: 'after the 1920 survey' }); continue; }
  const art = stripParen(v.article);
  const dis = (/[（(]([^）)]*)[）)]/.exec(v.article) || [])[1];
  /* the article IS a unit when a unit carries that exact title («加茂郡» = 岐阜県's; Aichi's is «加茂郡 (愛知県)») */
  const titled = [...rowsByUnit.values()].find((rs) => (rs[0].gunTitle || rs[0].gun) === v.article && rs[0]._blocks);
  let { ids: home } = titled ? { ids: titled[0]._blocks } : candidatesOf(art, dis && /国$/.test(dis) ? dis : null);
  if (dis && /[都道府県]$/.test(dis) && home.length > 1) { const p = home.filter((id) => BID.get(id).pref1920 === dis); if (p.length) home = p; }
  if (!home.length) { transfers.push({ src: v, skipped: 'article unit not joined: ' + v.article }); continue; }
  const names = new Set([v.fromGun, v.toGun, ...(v.otherGunNamed || [])].filter(Boolean));
  for (const mm of (v.source.quote || '').matchAll(/([一-龥々]{1,8}郡)/g)) names.add(mm[1]);
  addTransfer(v, T, home, [...names], art);
}
for (const c of F.cities) for (const p of c.parents) {
  if (p.role === 'origin' || !p.date || p.date > SURVEY_YEAR + '-01-01') continue;
  const city = [...rowsByUnit.values()].find((rs) => stripParen(rs[0].gun) === stripParen(c.name) && rs[0]._blocks);
  const src = { article: c.name + ' annexes part of ' + (p.gun || '(郡 not stated)'), date: p.date, source: { url: (p.sources || [])[0]?.url } };
  if (!city) { transfers.push({ src, skipped: 'city not joined' }); continue; }
  addTransfer(src, p.date, city[0]._blocks, p.gun ? [p.gun] : [], null);
}
/* unresolved entries about a city (`city X`): land merged into the city whose 郡 nobody states — a
   transfer with an unknown other side, dated by the entry */
for (const u of F.unresolved) {
  const m = /^city\s+(.+)$/.exec(u.what); if (!m) continue;
  const city = [...rowsByUnit.values()].find((rs) => stripParen(rs[0].gun) === stripParen(m[1]) && rs[0]._blocks);
  const ds = dateSpans(u.why); if (!city || !ds.length) continue;
  addTransfer({ article: u.what + ' (unresolved: origin 郡 not stated)', date: ds.map((d) => d[1]).sort().slice(-1)[0] }, ds.map((d) => d[1]).sort().slice(-1)[0], city[0]._blocks, [], null);
  u._routed = true;
}
for (const t of transfers) for (const g of t.groups || []) {
  INTERVALS.forEach(([a], i) => {
    if (a >= t.T) return;
    const ps = new Set(g.blocks.flatMap((id) => prefsOnBlock(i, id)));
    if (ps.size > 1) { for (const p of ps) hold(i, p, 'R4 village transfer ' + t.src.date + ' ' + t.src.article + (g.unknownOther ? ' (other side unknown: all neighbours)' : '')); g.hit = (g.hit || 0) + 1; }
  });
}

/* ══ 4. UNIONS + BUNDLE ═══════════════════════════════════════════════════════════════════ */
const unionTrouble = [];
function unionAll(polys, label) {
  if (polys.length < 2) return polys;
  try { return pc.union(polys[0], ...polys.slice(1)); } catch { /* fold */ }
  let acc = [polys[0]], seams = 0;
  for (const p of polys.slice(1)) { try { acc = pc.union(acc, [p]); } catch { acc = acc.concat([p]); seams++; } }
  if (seams) unionTrouble.push(label + ' (' + seams + ' unmerged)');
  return acc;
}
const round6 = (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));
const unionMemo = new Map();
const unionBlocks = (ids, label) => {
  const key = [...ids].sort().join('|');
  if (!unionMemo.has(key)) unionMemo.set(key, round6(unionAll([...ids].flatMap((id) => BID.get(id).coords), label)));
  return unionMemo.get(key);
};
const areaOf = (ids) => [...ids].reduce((s, id) => s + BID.get(id).areaKm2, 0);

// per prefecture, runs of identical (blocks, drawn) across consecutive intervals
const runs = [];
const prefIds = [...new Set(F.membership.map((r) => r.prefId).filter(Boolean))];
for (const pid of prefIds) {
  let cur = null;
  INTERVALS.forEach(([a, b], i) => {
    const rs = activeRows[i].filter((r) => r.prefId === pid);
    if (!rs.length) { cur = null; return; }
    const ids = [...new Set(rs.flatMap((r) => r._blocks || []))].sort();
    const w = withheld.get(i)?.get(pid);
    const drawn = !w;
    const key = ids.join('|') + '#' + drawn;
    if (cur && cur.key === key && cur.b === a) { cur.b = b; cur.n++; if (w) for (const x of w) cur.why.add(x); return; }
    cur = { pid, a, b, ids, drawn, key, n: 1, why: new Set(w || []), rows: rs };
    runs.push(cur);
  });
}
const drawnRuns = runs.filter((r) => r.drawn && r.ids.length);
log('runs ' + runs.length + ', drawn ' + drawnRuns.length + ', distinct block sets ' + new Set(drawnRuns.map((r) => r.ids.join('|'))).size);
let t0 = Date.now();
drawnRuns.forEach((r, k) => { r.geom = unionBlocks(r.ids, r.pid + ' ' + r.a); if (k % 25 === 0) log('  union ' + k + '/' + drawnRuns.length + ' ' + ((Date.now() - t0) / 1000).toFixed(0) + 's'); });

const split = (iso) => iso.split('-').map(Number);
function writeBundle(file, rows, tol, dec, label) {
  const rings = [], ringKey = new Map(), feats = [], dates = {};
  const pool = (r) => { const k = JSON.stringify(r); let i = ringKey.get(k); if (i == null) { i = rings.push(r) - 1; ringKey.set(k, i); } return i; };
  rows.slice().sort((p, q) => (p.a < q.a ? -1 : p.a > q.a ? 1 : p.pid < q.pid ? -1 : 1)).forEach((r, i) => {
    let polys = r.geom;
    if (tol > 0) {
      const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: tol, decimals: dec });
      const g = fc.features[0].geometry; polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    }
    const P = PREF.get(r.pid);
    const [sy, sm, sd] = split(r.a), [ey, em, ed] = split(r.b);
    feats.push([P.names.ja, 4, sy, sm, sd, ey, em, ed, polys.map((p) => p.map(pool)), { ...(P.names.en ? { en: P.names.en } : { en: P.names.ja }), ja: P.names.ja }, 'meiji-recon', r.pid, null]);
    const startStated = r.a === P.start, endStated = r.b === P.end;
    dates[i] = {
      start: { raw: r.a, precision: 'day', ...(startStated ? {} : { derived: true, basis: 'membership of its 郡 changes on this day (rows cited in the facts file)' }) },
      end: r.b === END ? { raw: null, precision: null, derived: true, basis: 'the record ends 1890-12-31' }
        : { raw: r.b, precision: 'day', ...(endStated ? {} : { derived: true, basis: 'membership of its 郡 changes on this day' }) },
    };
  });
  const data = { v: 1, src: 'Reconstruction (pilot): prefecture membership of 1920 郡/市 from Japanese Wikipedia (CC BY-SA, facts extracted) on ' + N03.publisher + ' · ' + label,
    built: new Date().toISOString().slice(0, 10), tolerance: tol, decimals: dec, levels: [4], dateSemantics: 'exclusive-end',
    sources: { 'meiji-recon': { publisher: N03.publisher, licence: N03.licence, citation: N03.citation } }, dates, rings, feats };
  fs.writeFileSync(file, 'window.__HISTADMRECONMEIJI=' + JSON.stringify(data) + ';\n');
  return { file, bytes: fs.statSync(file).size, feats: feats.length, rings: rings.length, vertices: rings.reduce((s, r) => s + r.length, 0) };
}
const admin1Head = fs.readFileSync(path.join(ROOT, 'data', 'hist-admin1.js'), 'utf8').slice(0, 400000);
const ADM1_TOL = Number(/"tolerance":([0-9.]+)/.exec(admin1Head)[1]);
const ADM1_DEC = Math.max(...[...admin1Head.matchAll(/\[(-?\d+\.(\d+)),(-?\d+\.(\d+))\]/g)].slice(0, 2000).map((m) => Math.max(m[2].length, m[4].length)));
const sizes = {
  full: writeBundle(path.join(OUT, 'hist-admin-recon-meiji.js'), drawnRuns, 0, 6, 'full precision (6 decimals, not simplified)'),
  coarse: writeBundle(path.join(OUT, 'hist-admin-recon-meiji-coarse.js'), drawnRuns, ADM1_TOL, ADM1_DEC, 'simplified to data/hist-admin1.js tolerance ' + ADM1_TOL + ', ' + ADM1_DEC + ' decimals'),
};
log('bundle ' + JSON.stringify(sizes));

/* ══ MEASURE ══════════════════════════════════════════════════════════════════════════════ */
const report = { built: new Date().toISOString(), scope: F.scope, intervals: INTERVALS.length, sizes };
report.join = { units: rowsByUnit.size, joined: unitBlock.size, unjoined, rowless, variantJoins, unresolvedPrefRows: unresolvedPrefRows.length };

// A. membership vs the 1920 prefectures (block sets: IoU is an area sum, no geometry is involved)
report.A = {};
for (const d of ['1889-07-01', '1890-07-01']) {
  const i = intervalIndexAt(d);
  const mine = new Map();
  const shared = [];
  for (const b of BLOCKS) { const ps = prefsOnBlock(i, b.id); if (ps.length === 1) { if (!mine.has(ps[0])) mine.set(ps[0], new Set()); mine.get(ps[0]).add(b.id); } else if (ps.length > 1) shared.push(b.id + ' ' + ps.join('+')); }
  const truth = new Map();
  for (const b of BLOCKS) { if (b.name === '所属未定') continue; if (!truth.has(b.pref1920)) truth.set(b.pref1920, new Set()); truth.get(b.pref1920).add(b.id); }
  const rows = [];
  for (const [pid, ids] of mine) {
    let best = null;
    for (const [tp, tids] of truth) { const inter = [...ids].filter((x) => tids.has(x)); if (!inter.length) continue; const ia = areaOf(inter); const ua = areaOf(new Set([...ids, ...tids])); if (!best || ia / ua > best.iou) best = { tp, iou: ia / ua, inter }; }
    const diffs = best ? [...ids].filter((x) => !truth.get(best.tp).has(x)).concat([...truth.get(best.tp)].filter((x) => !ids.has(x)).map((x) => x + ' (1920 only)')) : [];
    rows.push({ pref: PREF.get(pid).names.ja, pref1920: best?.tp, iou: best ? +best.iou.toFixed(4) : 0, km2: +areaOf(ids).toFixed(0), different: diffs.map((x) => x + ' ' + (BID.get(x.replace(' (1920 only)', ''))?.areaKm2 || 0).toFixed(0) + 'km2') });
  }
  rows.sort((p, q) => p.iou - q.iou);
  const unassigned = BLOCKS.filter((b) => b.name !== '所属未定' && !prefsOnBlock(i, b.id).length).map((b) => b.id);
  report.A[d] = { prefectures: rows.length, iouMedian: rows.map((r) => r.iou).sort()[rows.length >> 1], below1: rows.filter((r) => r.iou < 0.9999), sharedBlocks: shared, blocksWithoutPrefecture: unassigned };
}

// B. 旧国 vs data/hist-kuni.js (Asukana/Ryoseikoku raster, CC0) — an independent outline
{
  const K = readWindow('data/hist-kuni.js', '__HISTKUNI');
  const older = new Map();   // 1869 split: the facts' own notes «1869年にX国から分割されたY国»
  for (const c of F.cities) for (const p of c.parents) { const m = /(.{2}国)から分割された(.{2,3}国)/.exec(p.kuniNote || ''); if (m) older.set(m[2], m[1]); }
  const kuniOfBlock = new Map();
  for (const b of BLOCKS) {
    const ks = new Set([...(blockUnits.get(b.id) || [])].flatMap((k) => rowsByUnit.get(k).flatMap((r) => kuniList(r.kuni))));
    if (ks.size === 1) kuniOfBlock.set(b.id, [...ks][0]);
  }
  const ring2line = (ring) => ring;
  const res = [];
  const theirsTol = K.tolerance;
  for (const f of K.feats) {
    const name = f[0];
    const theirs = f[8].map((p) => p.map((ri) => K.rings[ri]));
    const ids = [...kuniOfBlock].filter(([, k]) => k === name || older.get(k) === name).map(([id]) => id);
    const viaSplit = [...new Set([...kuniOfBlock].filter(([, k]) => older.get(k) === name).map(([, k]) => k))];
    if (!ids.length) { res.push({ kuni: name, blocks: 0 }); continue; }
    const ours = unionBlocks(ids, 'kuni ' + name);
    let inter, uni;
    try { inter = pc.intersection(ours, theirs); uni = pc.union(ours, theirs); } catch (e) { res.push({ kuni: name, blocks: ids.length, error: String(e.message || e) }); continue; }
    const A = (g) => turfArea({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: g } }) / 1e6;
    const ai = A(inter), au = A(uni);
    // boundary distance: sample our boundary every ~250 m, nearest segment of theirs
    const segs = []; const G = 0.05; const grid = new Map();
    for (const p of theirs) for (const r of p) for (let k = 0; k + 1 < r.length; k++) {
      const s = [r[k][0], r[k][1], r[k + 1][0], r[k + 1][1]]; const si = segs.push(s) - 1;
      const gx0 = Math.floor(Math.min(s[0], s[2]) / G), gx1 = Math.floor(Math.max(s[0], s[2]) / G), gy0 = Math.floor(Math.min(s[1], s[3]) / G), gy1 = Math.floor(Math.max(s[1], s[3]) / G);
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const kk = gx + ',' + gy; if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(si); }
    }
    const lat0 = theirs[0][0][0][1], kx = 111.32 * Math.cos(lat0 * Math.PI / 180), ky = 110.57;
    const dist = (x, y) => {
      let best = Infinity;
      for (let rad = 1; rad <= 40 && best > (rad - 1) * G * ky; rad++) {
        const gx = Math.floor(x / G), gy = Math.floor(y / G);
        for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad && rad > 1) continue;
          for (const si of grid.get((gx + dx) + ',' + (gy + dy)) || []) {
            const [ax, ay, bx, by] = segs[si];
            const px = (x - ax) * kx, py = (y - ay) * ky, vx = (bx - ax) * kx, vy = (by - ay) * ky;
            const L = vx * vx + vy * vy; const t = L ? Math.max(0, Math.min(1, (px * vx + py * vy) / L)) : 0;
            const d = Math.hypot(px - t * vx, py - t * vy); if (d < best) best = d;
          }
        }
      }
      return best;
    };
    const ds = [];
    for (const p of ours) for (const r of p) {
      let carry = 0;
      for (let k = 0; k + 1 < r.length; k++) {
        const L = Math.hypot((r[k + 1][0] - r[k][0]) * kx, (r[k + 1][1] - r[k][1]) * ky);
        let s = carry;
        while (s < L) { const t = s / L; ds.push(dist(r[k][0] + t * (r[k + 1][0] - r[k][0]), r[k][1] + t * (r[k + 1][1] - r[k][1]))); s += 0.25; }
        carry = s - L;
      }
    }
    ds.sort((p, q) => p - q);
    const q = (x) => ds[Math.min(ds.length - 1, Math.floor(x * ds.length))];
    res.push({ kuni: name, blocks: ids.length, viaSplit, iou: +(ai / au).toFixed(4), oursKm2: +A(ours).toFixed(0), theirsKm2: +A(theirs).toFixed(0), samples: ds.length, medKm: +q(0.5).toFixed(3), p95Km: +q(0.95).toFixed(3), maxKm: +ds[ds.length - 1].toFixed(2) });
    log('  kuni ' + name + ' IoU ' + (ai / au).toFixed(4));
  }
  const ok = res.filter((r) => r.iou != null).sort((p, q) => p.iou - q.iou);
  const straddle = BLOCKS.filter((b) => blockUnits.has(b.id) && !kuniOfBlock.has(b.id)).map((b) => b.id);
  report.B = { theirTolerance: theirsTol, rasterCell: 'hist-kuni rings step 0.00137° lon × 0.0011° lat (≈125 m) as vectorised', older: Object.fromEntries(older), perKuni: res, iouMedian: ok[ok.length >> 1]?.iou, worst10: ok.slice(0, 10), blocksStraddlingKuni: straddle };
}

// C. counts
report.C = [];
for (const [d, c] of Object.entries(F.counts)) {
  const i = intervalIndexAt(d); if (i < 0) continue;
  const inForce = [...new Set(activeRows[i].map((r) => r.prefId))].filter((p) => ['fu', 'ken'].includes(PREF.get(p).kind));
  const wh = inForce.filter((p) => withheld.get(i)?.has(p));
  report.C.push({ date: d, stated: c.stated, statedN: c.derived, inForceFuKen: inForce.length, drawn: inForce.length - wh.length, withheld: wh.length, withheldNames: wh.map((p) => PREF.get(p).names.ja) });
}
// withheld summary
const whList = [];
for (const r of runs.filter((x) => !x.drawn)) whList.push({ pref: PREF.get(r.pid).names.ja, pid: r.pid, from: r.a, to: r.b, reasons: [...r.why] });
const byRule = {};
for (const w of whList) for (const x of new Set(w.reasons.map((s) => s.slice(0, 2)))) byRule[x] = (byRule[x] || 0) + 1;
report.withheld = { runs: whList.length, prefectureIntervals: [...withheld.values()].reduce((s, m) => s + m.size, 0), byRule, list: whList };
report.unresolvedApplied = unresolvedApplied;
report.transfers = { total: transfers.length, located: transfers.filter((t) => t.groups && t.groups.length).length,
  internal: transfers.filter((t) => t.internal).map((t) => t.src.article + ' ' + t.src.date),
  notLocated: transfers.filter((t) => t.groups && !t.groups.length && !t.internal).map((t) => t.src.article + ' ' + t.src.date + ' (home candidates ' + t.homeCands.join(',') + '; no named 郡 neighbours any of them)'),
  withheldSomething: transfers.flatMap((t) => (t.groups || []).filter((g) => g.hit).map((g) => ({ date: t.src.date, article: t.src.article, intervals: g.hit, blocks: g.blocks.length > 6 ? g.blocks.slice(0, 6).concat(['…+' + (g.blocks.length - 6)]) : g.blocks, unknownOther: g.unknownOther }))),
  skipped: transfers.filter((t) => t.skipped).map((t) => t.src.article + ' ' + t.src.date + ': ' + t.skipped) };
report.groupJoins = groupJoins;
report.incomplete = Object.entries(incomplete).map(([i, l]) => ({ interval: INTERVALS[i], drawnWithout: l.map(([p, u]) => PREF.get(p).names.ja + ' w/o ' + u) }));

// D. coverage (1920 blocks, lakes «所属未定» excluded from the denominator)
const LAND = BLOCKS.filter((b) => b.name !== '所属未定').reduce((s, b) => s + b.areaKm2, 0);
report.D = { landKm2: +LAND.toFixed(0), at: {} };
const drawnAt = (d) => drawnRuns.filter((r) => r.a <= d && r.b > d);
for (const d of ['1872-07-01', '1876-12-01', '1883-07-01', '1890-07-01']) {
  const rs = drawnAt(d); const km = rs.reduce((s, r) => s + areaOf(r.ids), 0);
  const i = intervalIndexAt(d);
  const withheldKm = [...(withheld.get(i)?.keys() || [])].reduce((s, p) => s + areaOf(new Set(activeRows[i].filter((r) => r.prefId === p).flatMap((r) => r._blocks || []))), 0);
  report.D.at[d] = { drawn: rs.length, km2: +km.toFixed(0), share: +(km / LAND).toFixed(4), withheldKm2: +withheldKm.toFixed(0) };
}
report.unionTrouble = unionTrouble;
fs.writeFileSync(path.join(OUT, 'meiji-report.json'), JSON.stringify(report, null, 1));

/* ══ IMAGES ═══════════════════════════════════════════════════════════════════════════════ */
const PALETTE = ['#f8c8c8', '#c8e0f8', '#cdeccd', '#f8e4b8', '#e0cdf3', '#f6d0e8', '#c8efe8', '#ecefc0', '#f3d6c2', '#d2d8f6'];
function simplifyPolys(polys, tol) {
  const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: tol, decimals: 6 });
  const g = fc.features[0].geometry; return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}
function labelPoint(polys) {
  // largest part; grid search for the inside point farthest from its outer ring
  const A = (p) => Math.abs(p[0].reduce((s, [x, y], i, r) => s + (i ? (r[i - 1][0] * y - x * r[i - 1][1]) : 0), 0));
  const p = polys.slice().sort((a, b) => A(b) - A(a))[0];
  const xs = p[0].map((c) => c[0]), ys = p[0].map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inside = (x, y) => { let c = false; for (const r of p) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const dmin = (x, y) => { let d = Infinity; for (const r of p) for (let i = 0; i + 1 < r.length; i += Math.max(1, Math.floor(r.length / 400))) d = Math.min(d, Math.hypot(r[i][0] - x, r[i][1] - y)); return d; };
  let best = null;
  for (let gx = 0; gx <= 24; gx++) for (let gy = 0; gy <= 24; gy++) { const x = x0 + (x1 - x0) * gx / 24, y = y0 + (y1 - y0) * gy / 24; if (!inside(x, y)) continue; const d = dmin(x, y); if (!best || d > best[2]) best = [x, y, d]; }
  return best || [p[0][0][0], p[0][0][1], 0];
}
async function render(views) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const outs = [];
  for (const v of views) {
    const [w, s, e, n] = v.bbox; const W = v.width; const kx = Math.cos(((s + n) / 2) * Math.PI / 180);
    const H = Math.round(W * (n - s) / ((e - w) * kx));
    const X = (x) => ((x - w) / (e - w) * W).toFixed(1), Y = (y) => ((n - y) / (n - s) * H).toFixed(1);
    const inView = (polys) => polys.some((p) => p[0].some(([x, y]) => x >= w && x <= e && y >= s && y <= n));
    const pathOf = (polys) => polys.map((p) => p.map((r) => 'M' + r.map(([x, y]) => X(x) + ',' + Y(y)).join('L') + 'Z').join('')).join('');
    const tol = v.tol;
    const i = intervalIndexAt(v.date);
    const rs = drawnAt(v.date).filter((r) => inView(r.geom));
    // colours: greedy over adjacency of the prefectures in view
    const prefAdj = new Map(rs.map((r) => [r.pid, new Set()]));
    for (const r of rs) for (const q of rs) if (r !== q && r.ids.some((id) => q.ids.some((j) => adj.get(id).has(j)))) prefAdj.get(r.pid).add(q.pid);
    const col = new Map();
    for (const r of rs.slice().sort((a, b) => prefAdj.get(b.pid).size - prefAdj.get(a.pid).size)) { const usedC = new Set([...prefAdj.get(r.pid)].map((p) => col.get(p))); col.set(r.pid, PALETTE.find((c) => !usedC.has(c)) || PALETTE[0]); }
    const drawnIds = new Set(rs.flatMap((r) => r.ids));
    const heldIds = new Set([...(withheld.get(i)?.keys() || [])].flatMap((p) => activeRows[i].filter((r) => r.prefId === p).flatMap((r) => r._blocks || [])));
    let svg = '';
    for (const b of BLOCKS) { if (drawnIds.has(b.id) || !inView(b.coords)) continue; const g = tol ? simplifyPolys(b.coords, tol) : b.coords; svg += '<path d="' + pathOf(g) + '" fill="' + (heldIds.has(b.id) ? 'url(#hatch)' : '#eeeeee') + '" stroke="#bbb" stroke-width="0.4"/>'; }
    for (const r of rs) { const g = tol ? simplifyPolys(r.geom, tol) : r.geom; svg += '<path d="' + pathOf(g) + '" fill="' + col.get(r.pid) + '" stroke="#444" stroke-width="' + (v.stroke || 0.8) + '" fill-rule="evenodd"/>'; }
    if (v.blockLines) for (const id of drawnIds) { const b = BID.get(id); if (!inView(b.coords)) continue; svg += '<path d="' + pathOf(b.coords) + '" fill="none" stroke="#888" stroke-width="0.5" stroke-dasharray="3,2"/>'; }
    let labels = '';
    for (const r of rs) {
      let g = simplifyPolys(r.geom, (e - w) / W * 2);
      try { g = pc.intersection(g, [[[w, s], [e, s], [e, n], [w, n], [w, s]]]); } catch { /* label from the whole outline */ }
      if (!g.length) continue;
      const [x, y] = labelPoint(g); if (x < w || x > e || y < s || y > n) continue; labels += '<text x="' + X(x) + '" y="' + Y(y) + '">' + PREF.get(r.pid).names.ja + '</text>'; }
    const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:"Yu Gothic UI","Meiryo",sans-serif}text{font-size:' + (v.font || 11) + 'px;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3px;fill:#222}.t{font-size:22px;text-anchor:start}</style>'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="background:#dfeaf3"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#d9d9d9"/><line x1="0" y1="0" x2="0" y2="7" stroke="#8a8a8a" stroke-width="2.2"/></pattern></defs>'
      + svg + labels
      + '<g transform="translate(20,20)"><rect width="430" height="' + (v.blockLines ? 128 : 100) + '" fill="#fff" opacity="0.9" rx="8"/><text class="t" x="14" y="28" style="text-anchor:start">' + v.title + '</text>'
      + '<rect x="14" y="52" width="26" height="16" fill="url(#hatch)" stroke="#888"/><text x="48" y="61" style="text-anchor:start;font-size:15px">根拠不足のため描かない</text>'
      + '<rect x="14" y="76" width="26" height="16" fill="#eeeeee" stroke="#bbb"/><text x="48" y="85" style="text-anchor:start;font-size:15px">この日の所属の記録なし</text>'
      + (v.blockLines ? '<line x1="14" y1="110" x2="40" y2="110" stroke="#888" stroke-dasharray="3,2"/><text x="48" y="110" style="text-anchor:start;font-size:15px">1920 年の郡・市（構成単位）</text>' : '') + '</g></svg>';
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(html);
    const file = path.join(OUT, v.file);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
    outs.push({ file, date: v.date, drawn: rs.length });
    log('  png ' + file);
  }
  await browser.close();
  return outs;
}
if (!args.includes('--no-images')) {
  const JP = [128, 30, 146.2, 45.7];
  const views = ['1872-07-01', '1876-12-01', '1883-07-01', '1890-07-01'].map((d) => ({ date: d, bbox: JP, width: 1600, tol: 0.004, file: 'meiji-' + d + '.png', title: d + ' の府県（復元・試作）', font: 11 }));
  const KINAI = [135.05, 34.15, 136.15, 34.95];
  for (const d of ['1876-12-01', '1883-07-01']) views.push({ date: d, bbox: KINAI, width: 1800, tol: 0, stroke: 1.4, blockLines: true, file: 'meiji-kinai-' + d + '.png', title: d + ' 大和・河内・和泉（全精度）', font: 18 });
  report.images = await render(views);
  fs.writeFileSync(path.join(OUT, 'meiji-report.json'), JSON.stringify(report, null, 1));
}
log('done ' + path.join(OUT, 'meiji-report.json'));
