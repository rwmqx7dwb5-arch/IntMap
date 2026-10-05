#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/build-meiji-v2.mjs   (hist-coverage-depth · PILOT v2 — writes nothing into the repo)
 *
 * MEIJI PREFECTURES 1871-12 … 1890-12, v2: the v1 assembly (build-meiji.mjs: stated facts on 1920 郡/市
 * blocks) with the village-level research of meiji-resolutions.json layered over it.
 *
 *   facts        meiji-prefectures.json                — unchanged; corrections are applied here, in memory
 *   research     meiji-resolutions.json                — splits (each 1920 町村 assigned per interval),
 *                                                        transfers (moved villages pinned to 1920 町村),
 *                                                        dates, corrections, stillUnresolved
 *   transcription meiji-v2-ops.json / meiji-v2-parts.json — the structure the research states in prose
 *   geometry     blocks-n03-1920.mjs (郡/市), munis-n03-1920.mjs (1920 町村),
 *                estat-koaza.mjs + locate-parts-v2.mjs  (大字 of e-Stat 小地域 2020 for PART 町村)
 *
 * What changes against v1 (.agents/rules/historical-verification.md — resolve by research, never fill):
 *   · a block that a split resolution assigns 町村 by 町村 is drawn from its 1920 町村 polygons, per side;
 *   · a moved village is drawn on the side that held the 郡 it came from (read from a 1920 町村 that was
 *     always in that 郡: `fromRef`) on every interval before the move, and on the destination side after;
 *   · a PART 町村 (only some pre-1889 villages on a side) is cut with e-Stat 大字 clipped to it — only when
 *     EVERY named village is found by exact name (or as P+name with P a former municipality name);
 *   · what the research could not settle stays withheld, with the reason:
 *       R6 village X not located      R7 the from-side of a move is itself divided
 *       R8 the move's day is unknown inside a window in which the two sides differ
 *       R9 a split interval leaves a 1920 町村 of its block unassigned / names an unknown prefecture
 *     and the v1 rules R1–R5 for everything the research did not touch.
 *   · jurisdiction follows the legal order; custody dates are notes in `dates[i].note`.
 *
 * Usage:
 *   node scripts/histrecon/build-meiji-v2.mjs --out <dir> --blocks-cache <blocks.json> --munis-cache <munis.json>
 *        [--v1-report <meiji-report.json>] [--no-images]
 * Output (in <dir>; never in the repository; every file name carries -v2):
 *   hist-admin-recon-meiji-v2.js, hist-admin-recon-meiji-coarse-v2.js, meiji-report-v2.json, meiji-*-v2.png
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';
import turfArea from '@turf/area';
import { blocks as loadBlocks, SOURCE as N03 } from './blocks-n03-1920.mjs';
import { munis as loadMunis } from './munis-n03-1920.mjs';
import { locateParts, muniLookup, PARTS } from './locate-parts-v2.mjs';
import { LICENCE as ESTAT, clip, snapLog } from './estat-koaza.mjs';
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = arg('--out');
if (!OUT) { console.error('usage: node scripts/histrecon/build-meiji-v2.mjs --out <dir> --blocks-cache <file> --munis-cache <file> [--v1-report <file>] [--no-images]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const log = (s) => console.error(s);

/* ── inputs ─────────────────────────────────────────────────────────────────────────────── */
const F = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-prefectures.json'), 'utf8'));
const RES = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-resolutions.json'), 'utf8'));
const OPS = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-v2-ops.json'), 'utf8'));
let BL;
{ const c = arg('--blocks-cache'); if (c && fs.existsSync(c)) BL = JSON.parse(fs.readFileSync(c, 'utf8')); else { BL = await loadBlocks({ log }); if (c) fs.writeFileSync(c, JSON.stringify(BL)); } }
let MU;
{ const c = arg('--munis-cache'); if (c && fs.existsSync(c)) MU = new Map(JSON.parse(fs.readFileSync(c, 'utf8')).munis.map((x) => [x.key, x])); else { const m = await loadMunis({ log }); MU = m.munis; if (c) fs.writeFileSync(c, JSON.stringify({ munis: [...MU.values()], unionTrouble: m.unionTrouble })); } }
const BLOCKS = BL.blocks;
const BID = new Map(BLOCKS.map((b) => [b.id, b]));
const look = muniLookup(MU);
const lookOrThrow = (k, why) => { const m = look(k); if (!m) throw new Error('no 1920 町村 «' + k + '» (' + why + ')'); return m; };
const munisOfBlock = new Map();
for (const m of MU.values()) {
  if (!BID.has(m.blockId)) throw new Error('町村 ' + m.key + ' names block ' + m.blockId + ' which blocks-n03-1920 does not have');
  if (!munisOfBlock.has(m.blockId)) munisOfBlock.set(m.blockId, []);
  munisOfBlock.get(m.blockId).push(m.key);
}
const readWindow = (file, key) => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { window: w }); return w[key]; };

const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const END = addDays(F.scope.to, 1);
const rowEnd = (r) => r.to || END;
const active = (r, t) => r.from <= t && rowEnd(r) > t;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/* ══ 0. CORRECTIONS ON THE TABLE (meiji-v2-ops.json rowOps; each names its correction) ═════════ */
const appliedOps = [];
for (const op of OPS.rowOps) {
  const hit = (r) => (op.gun ? r.gun === op.gun : true) && (op.kuni ? r.kuni === op.kuni : true) && (op.pref ? r.pref === op.pref : true)
    && (op.thenIs ? r.then.length === 1 && r.then[0] === op.thenIs : true) && (op.before ? r.from < op.before : true);
  let n = 0;
  if (op.op === 'drop') { const keep = F.membership.filter((r) => !hit(r)); n = F.membership.length - keep.length; F.membership = keep; }
  else if (op.op === 'unsplit') { for (const r of F.membership) if (hit(r) && r.split) { r.split = null; n++; } }
  else if (op.op === 'redate') { for (const r of F.membership) if (op.gun ? r.gun === op.gun : true) { if (r.from === op.date) { r.from = op.to; n++; } if (r.to === op.date) { r.to = op.to; n++; } } }
  else throw new Error('unknown rowOp ' + op.op);
  if (!n) throw new Error('rowOp ' + op.id + ' ' + op.op + ' matched nothing');
  appliedOps.push({ id: op.id, op: op.op, rows: n, basis: op.basis });
}

/* ── prefecture identity (v1) ───────────────────────────────────────────────────────────── */
const PREF = new Map(F.prefectures.map((p) => [p.id, p]));
const unresolvedPrefRows = [];
for (const r of F.membership) {
  if (r.prefId) continue;
  const c = F.prefectures.filter((p) => p.names.ja === r.pref && p.start <= r.from && (!p.end || p.end > r.from));
  if (c.length === 1) r.prefId = c[0].id; else unresolvedPrefRows.push(r);
}
/* a prefecture as the research spells it («福井県（第1次）», «青森県 (from …)»), on a day */
const prefAt = (name, day) => {
  const n = String(name).replace(/[\s(（].*$/, '').trim();
  const c = F.prefectures.filter((p) => p.names.ja === n && p.start <= day && (!p.end || p.end > day));
  if (c.length === 1) return c[0].id;
  /* the research can name a holder before the table's first date for it (開拓使 from 1869-09-20, S9/C34).
     The table starts every holder at the 第1次府県統合 announcement of its group, and the rest of that
     holder's land is unrecorded before it — so this land is left unrecorded too (null), not withheld */
  const d = F.prefectures.filter((p) => p.names.ja === n && p.start > day && (!p.end || p.end > day));
  if (!c.length && d.length === 1) { earlyHolders.add(d[0].id + ' named by the research before its table start ' + d[0].start + ': left unrecorded there, like the rest of its land'); return null; }
  return undefined;
};
const earlyHolders = new Set();

/* ══ 1. JOIN (v1, unchanged) ══════════════════════════════════════════════════════════════ */
const stripParen = (s) => { let t = String(s || ''), u; do { u = t; t = t.replace(/[（(][^（()）]*[）)]/g, ''); } while (t !== u); return t.trim(); };
const byName = new Map();
for (const b of BLOCKS) { if (!byName.has(b.name)) byName.set(b.name, []); byName.get(b.name).push(b); }
const loc = (b) => b.pref1920 + '/' + (b.id.split('/').length === 3 ? b.id.split('/')[1] : '');
const unitKey = (r) => r.kind + ':' + (r.gunTitle || r.gun);
const kuniList = (k) => String(k || '').split(/[・、]/).map((s) => s.trim()).filter(Boolean);
const rowsByUnit = new Map();
for (const r of F.membership) { const k = unitKey(r); if (!rowsByUnit.has(k)) rowsByUnit.set(k, []); rowsByUnit.get(k).push(r); }
const unitBlock = new Map(), joinHow = new Map();
const kuniPlaces = new Map(), kuniPrefs = new Map();
for (const [k, rs] of rowsByUnit) {
  const c = byName.get(rs[0].gun) || [];
  if (c.length === 1) {
    unitBlock.set(k, [c[0].id]); joinHow.set(k, 'name');
    for (const q of kuniList(rs[0].kuni)) { if (!kuniPlaces.has(q)) { kuniPlaces.set(q, new Set()); kuniPrefs.set(q, new Set()); } kuniPlaces.get(q).add(loc(c[0])); kuniPrefs.get(q).add(c[0].pref1920); }
  }
}
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
const groupJoins = [];
{
  const groups = new Map();
  for (const k of rowsByUnit.keys()) { const n = rowsByUnit.get(k)[0].gun; if (!groups.has(n)) groups.set(n, []); groups.get(n).push(k); }
  for (const [n, ks] of groups) {
    if (ks.length < 2 || !ks.some((k) => !unitBlock.has(k))) continue;
    const prefs = new Set(ks.flatMap((k) => kuniList(rowsByUnit.get(k)[0].kuni)).flatMap((q) => [...(kuniPrefs.get(q) || [])]));
    const c = (byName.get(n) || []).filter((b) => prefs.has(b.pref1920));
    if (!c.length || new Set(ks.map(timeline)).size !== 1) continue;
    for (const k of ks) { unitBlock.set(k, c.map((b) => b.id)); joinHow.set(k, 'group: ' + ks.length + ' units named ' + n); }
    groupJoins.push({ name: n, units: ks, blocks: c.map((b) => b.id) });
  }
}
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
const adj = new Map(BLOCKS.map((b) => [b.id, new Set()]));
{
  const vk = new Map();
  for (const b of BLOCKS) for (const p of b.coords) for (const ring of p) for (const [x, y] of ring) { const key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4); let s = vk.get(key); if (!s) vk.set(key, s = new Set()); s.add(b.id); }
  const cnt = new Map();
  for (const s of vk.values()) if (s.size > 1) { const a = [...s]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const k2 = a[i] < a[j] ? a[i] + '|' + a[j] : a[j] + '|' + a[i]; cnt.set(k2, (cnt.get(k2) || 0) + 1); } }
  for (const [k2, n] of cnt) if (n >= 2) { const [a, b] = k2.split('|'); adj.get(a).add(b); adj.get(b).add(a); }
}
for (const k of unjoinedUnits()) {
  const r = rowsByUnit.get(k)[0];
  if (r.kind !== 'shi') continue;
  const thenBlocks = r.then.map(stripParen).flatMap((t) => [...rowsByUnit.entries()].filter(([, rs]) => rs[0].gun === t && rs[0].kind === 'gun').flatMap(([kk]) => unitBlock.get(kk) || []));
  const u = used();
  const c = BLOCKS.filter((b) => b.kind === '市' && !u.has(b.id) && thenBlocks.some((t) => adj.get(t).has(b.id)));
  if (c.length === 1) { unitBlock.set(k, [c[0].id]); joinHow.set(k, 'leftover 市 block touching the block of its then-郡 ' + r.then.join('/')); }
}
for (const b of BLOCKS) {
  if (used().has(b.id)) continue;
  const hits = [...unitBlock.entries()].filter(([, ids]) => ids.some((id) => BID.get(id).name === b.name && BID.get(id).pref1920 === b.pref1920));
  if (hits.length === 1) { hits[0][1].push(b.id); joinHow.set(hits[0][0], joinHow.get(hits[0][0]) + ' + same 郡 in another 支庁 (' + b.id + ')'); }
}
for (const [k, rs] of rowsByUnit) for (const r of rs) r._blocks = unitBlock.get(k) || null;
const blockUnits = new Map();
for (const [k, ids] of unitBlock) for (const id of ids) { if (!blockUnits.has(id)) blockUnits.set(id, new Set()); blockUnits.get(id).add(k); }
log('join: units ' + rowsByUnit.size + ', joined ' + unitBlock.size);

/* ══ 2. RESEARCH → EVENTS ════════════════════════════════════════════════════════════════ */
/* coverage «pref/郡» (Hokkaido without 支庁) -> block id */
const blockOf = (s) => {
  if (BID.has(s)) return s;
  const [p, ...rest] = s.split('/'); const name = rest.join('/');
  const c = BLOCKS.filter((b) => b.pref1920 === p && b.name === name);
  if (c.length !== 1) throw new Error('coverage block «' + s + '» resolves to ' + c.length + ' blocks');
  return c[0].id;
};
const researchMuniKey = (m) => m.pref1920 + '/' + m.gun + '/' + m.name;
/* splits: one record per interval; redates per the legal-order rule (ops.splitRedate) */
const splitIvs = [];
const issues = [];
for (const s of RES.resolved.splits) {
  const red = Object.entries(OPS.splitRedate || {}).find(([k]) => s.key.startsWith(k))?.[1] || {};
  for (const iv of s.intervals) {
    const from = red[iv.from]?.to || iv.from, to = red[iv.to]?.to || iv.to;
    const blocks = iv.coverage.blocks.map(blockOf);
    const entries = [];
    for (const a of iv.assignments) {
      for (const m of a.n03_1920_municipalities) {
        const M = lookOrThrow(researchMuniKey(m), 'split ' + s.key);
        entries.push({ muni: M.key, part: m.whole_or_part === 'part', detail: m.part_detail || '', prefName: a.pref });
      }
    }
    splitIvs.push({ src: s.key, cluster: s.cluster, from, to, blocks, entries, redated: from !== iv.from || to !== iv.to });
  }
}
/* transfers: resolution entries + ops.extraTransfers. A transfer is a list of (1920 町村, whole|part, fromRef) */
const transferEvents = [];
const resolvedTransferKeys = new Set();
for (const t of RES.resolved.transfers) {
  const o = OPS.transfers[t.key] || {};
  resolvedTransferKeys.add(t.key);
  const munis = (t.n03_1920_municipalities || []);
  if (munis.length && !OPS.transfers[t.key]) throw new Error('meiji-v2-ops.json has no entry for transfer «' + t.key + '»');
  if (o.skip) { transferEvents.push({ key: t.key, skip: o.skip }); continue; }
  if (!munis.length) { transferEvents.push({ key: t.key, skip: 'no land moved (' + String(t.whole_or_part) + '): ' + String(t.notes).slice(0, 160) }); continue; }
  let T = null, W = null;
  if (o.window) W = o.window; else if (ISO.test(t.date)) T = t.date; else throw new Error('transfer «' + t.key + '» date «' + t.date + '» has no window in ops');
  /* a move after the record still matters for every interval of it (the land sits in its 1920 町村); only a
     move after the N03 vintage (1920-01-01) leaves the land where it was */
  if ((T || W[0]) >= '1920-01-01') { transferEvents.push({ key: t.key, skip: 'after the 1920-01-01 survey (' + (T || W[0]) + ')' }); continue; }
  const items = munis.map((m) => {
    const M = lookOrThrow(researchMuniKey(m), 'transfer ' + t.key);
    const ref = o.fromRefByMuni ? o.fromRefByMuni[researchMuniKey(m)] : o.fromRef;
    if (!ref) throw new Error('transfer «' + t.key + '»: no fromRef for ' + researchMuniKey(m));
    return { muni: M.key, part: m.whole_or_part === 'part', ref: lookOrThrow(ref, 'fromRef of ' + t.key).key };
  });
  transferEvents.push({ key: t.key, cluster: t.cluster, T, W, windowBasis: o.windowBasis, items, note: o.note || null });
}
for (const x of OPS.extraTransfers || []) {
  transferEvents.push({ key: x.id, T: x.date, W: null, items: x.munis.map((m) => ({ muni: lookOrThrow(m.muni, x.id).key, part: m.whole_or_part === 'part', ref: lookOrThrow(x.fromRef, x.id).key })), note: x.basis });
}
const liveTransfers = transferEvents.filter((e) => !e.skip);
/* which villageTransfers of the facts the research covers (their v1 heuristic is then replaced) */
const coveredBy = (v) => {
  const k = v.date + ' ' + v.article, y = String(v.date).slice(0, 4), art = stripParen(v.article);
  return RES.resolved.transfers.filter((t) => t.key === k || t.key.includes(k) || ((t.key.startsWith(y) || t.key.includes(' ' + y + ' ')) && t.key.includes(art))).map((t) => t.key);
};
/* unassigned land (ops.unassigned) */
const unassigned = (OPS.unassigned || []).map((u) => ({ ...u, munis: u.munis.map((k) => lookOrThrow(k, u.id).key) }));

/* PART cases: e-Stat 大字 */
log('locating PART villages (e-Stat 小地域 2020)…');
const PARTRES = await locateParts({ munis: MU, log });
const partOf = (key) => [...PARTRES.values()].find((r) => r.key === key) || null;

/* ══ 3. BREAKPOINTS ══════════════════════════════════════════════════════════════════════ */
const bp = new Set([END]);
for (const r of F.membership) { bp.add(r.from); if (r.to) bp.add(r.to); }
for (const p of F.prefectures) { if (p.start) bp.add(p.start); if (p.end) bp.add(p.end); }
for (const s of splitIvs) { bp.add(s.from); bp.add(s.to); }
for (const e of liveTransfers) { if (e.T) bp.add(e.T); if (e.W) { bp.add(e.W[0]); bp.add(e.W[1]); } }
for (const u of unassigned) bp.add(u.until);
const START = [...F.membership.map((r) => r.from)].sort()[0];
const BP = [...bp].filter((d) => d >= START && d <= END).sort();
const INTERVALS = BP.slice(0, -1).map((a, i) => [a, BP[i + 1]]);
const intervalIndexAt = (t) => INTERVALS.findIndex(([a, b]) => a <= t && b > t);
log('intervals ' + INTERVALS.length);

/* ══ 4. PER INTERVAL: OWNERS OF BLOCKS AND PARCELS ═══════════════════════════════════════════
   A parcel is a whole 1920 町村 («key»), or the located villages («key#loc») / the rest («key#rest») of
   a PART 町村. A block is either whole (its rows name one prefecture) or carries a parcel map. */
const withheld = new Map();
const hold = (i, pid, why) => { if (!pid) return; if (!withheld.has(i)) withheld.set(i, new Map()); const m = withheld.get(i); if (!m.has(pid)) m.set(pid, new Set()); m.get(pid).add(why); };
const activeRows = INTERVALS.map(([a]) => F.membership.filter((r) => r.prefId && active(r, a)));
const rowPrefsOnBlock = (i, id) => [...new Set(activeRows[i].filter((r) => r._blocks && r._blocks.includes(id)).map((r) => r.prefId))];
const STATE = [];             // i -> { split: Map(blockId -> true), parcels: Map(parcelKey -> pid|null), parcelBlocks: Set }
const conflicts = [];         // a transfer overriding a split's explicit side
const partUse = new Map();    // muni key -> { intervals needing the cut, located }
const sideScore = (e, hint) => { const d = e.detail; let s = 0; if (hint && d.includes(hint)) s += 2; if (/only|のみ/.test(d)) s += 1; if (/all but|except|以外|を除く|除き/.test(d)) s -= 3; return s; };
const villageWhy = (P) => P.why || 'not transcribed';

INTERVALS.forEach(([a, b], i) => {
  const st = { split: new Set(), parcels: new Map(), parcelBlocks: new Set(), notes: [] };
  STATE[i] = st;
  /* (A) splits */
  for (const s of splitIvs) {
    if (!(s.from <= a && s.to > a)) continue;
    const byMuni = new Map();
    for (const e0 of s.entries) {
      const e = { ...e0, pid: prefAt(e0.prefName, a) };
      if (e.pid === undefined) issues.push({ kind: 'R9', split: s.src, at: a, what: 'prefecture «' + e0.prefName + '» does not resolve on ' + a });
      if (!byMuni.has(e.muni)) byMuni.set(e.muni, []); byMuni.get(e.muni).push(e);
    }
    for (const id of s.blocks) {
      st.split.add(id); st.parcelBlocks.add(id);
      const missing = (munisOfBlock.get(id) || []).filter((k) => !byMuni.has(k));
      if (missing.length) {
        const ps = [...new Set([...byMuni.values()].flat().filter((e) => MU.get(e.muni).blockId === id).map((e) => e.pid))];
        for (const p of ps) hold(i, p, 'R9 split «' + s.src.slice(0, 60) + '» leaves ' + missing.length + ' 1920 町村 of ' + id + ' unassigned: ' + missing.slice(0, 4).map((k) => k.split('/').pop()).join('・'));
      }
    }
    for (const [k, es] of byMuni) {
      const ps = [...new Set(es.map((e) => e.pid))];
      if (ps.some((p) => p === undefined)) { for (const p of ps) hold(i, p, 'R9 split «' + s.src.slice(0, 50) + '»: unresolved prefecture name'); continue; }
      if (ps.length === 1) { st.parcels.set(k, ps[0]); continue; }
      const P = partOf(k);
      if (!P) throw new Error('split «' + s.src + '» divides ' + k + ' but meiji-v2-parts.json has no case for it');
      const hint = P.sideHint || (P.locate[0] || '').replace(/(村|新田|浦|町)$/, '');
      const scored = es.map((e) => ({ e, s: sideScore(e, hint) })).sort((x, y) => y.s - x.s);
      if (scored.length !== 2 || scored[0].s === scored[1].s) throw new Error('split «' + s.src + '» ' + k + ': cannot tell which side holds the located villages (hint ' + hint + ')');
      const locSide = scored[0].e.pid, restSide = scored[1].e.pid;
      st.parcels.set(k + '#loc', locSide); st.parcels.set(k + '#rest', restSide);
      st.notes.push({ muni: k, locSide, restSide, src: s.src });
    }
  }
  /* default owner of a 町村 / parcel BEFORE transfers (split map, else the block's single row prefecture) */
  const blockSingle = (id) => { const ps = rowPrefsOnBlock(i, id); return ps.length === 1 ? ps[0] : ps.length ? undefined : null; };
  const baseOwner = (key) => {
    if (st.parcels.has(key)) return st.parcels.get(key);
    const k0 = key.replace(/#(loc|rest)$/, '');
    if (key === k0 && st.parcels.has(k0 + '#rest')) return st.parcels.get(k0 + '#rest');      /* a ref 町村 that is itself cut: its main part */
    if (key !== k0 && st.parcels.has(k0)) return st.parcels.get(k0);
    return blockSingle(MU.get(k0).blockId);
  };
  const before = new Map();   // snapshot for fromRef reads (no transfer reads another transfer's result)
  /* (B) transfers */
  for (const e of liveTransfers) {
    const pre = e.T ? b <= e.T : b <= e.W[0];
    const post = e.T ? a >= e.T : a >= e.W[1];
    for (const it of e.items) {
      const landKey = it.part ? it.muni + '#loc' : it.muni;
      const destOwner = it.part ? baseOwner(it.muni + '#rest') : baseOwner(it.muni);
      let fromOwner = before.has(it.ref) ? before.get(it.ref) : baseOwner(it.ref);
      before.set(it.ref, fromOwner);
      const explicit = st.parcels.has(landKey) ? st.parcels.get(landKey) : undefined;
      let want;
      if (post) want = destOwner;
      else if (pre) want = fromOwner;
      else { /* the day is inside the window */
        if (fromOwner !== destOwner) { for (const p of [fromOwner, destOwner]) hold(i, p, 'R8 day of «' + e.key.slice(0, 50) + '» unknown within ' + e.W.join('..') + ' (' + e.windowBasis + ')'); }
        want = destOwner;
      }
      if (want === undefined || fromOwner === undefined && pre) {
        hold(i, destOwner, 'R7 from-side of «' + e.key.slice(0, 50) + '» is divided on this interval (' + it.ref + ')');
        for (const p of rowPrefsOnBlock(i, MU.get(it.ref).blockId)) hold(i, p, 'R7 from-side of «' + e.key.slice(0, 50) + '» (other side)');
        continue;
      }
      if (explicit !== undefined && explicit !== want) conflicts.push({ interval: INTERVALS[i], muni: landKey, split: explicit && PREF.get(explicit)?.names.ja, transfer: want && PREF.get(want)?.names.ja, event: e.key });
      if (want === destOwner) {
        /* the moved land sits with the rest of its 町村: nothing to cut. A split that cut it with a side the
           transfer contradicts (its prose limit «… まで» is the transfer's date) is corrected. */
        if (explicit !== undefined && explicit !== want) st.parcels.set(landKey, want);
        continue;
      }
      if (it.part) {
        const P = partOf(it.muni);
        if (!P) throw new Error('transfer «' + e.key + '» moves part of ' + it.muni + ' across a prefecture line on ' + INTERVALS[i][0] + ' but meiji-v2-parts.json has no case for it');
        st.parcels.set(it.muni + '#loc', want);
        if (!st.parcels.has(it.muni + '#rest')) st.parcels.set(it.muni + '#rest', destOwner);
      } else st.parcels.set(it.muni, want);
      st.parcelBlocks.add(MU.get(it.muni).blockId);
    }
  }
  /* (C) unassigned land */
  for (const u of unassigned) if (a < u.until) for (const k of u.munis) { st.parcels.set(k, null); st.parcelBlocks.add(MU.get(k).blockId); }
  /* (D) every block with any parcel gets a full map; a block whose rows name several prefectures and that no
     split covers cannot be filled — it stays whole, and R1/R2 below withhold it as in v1 */
  for (const id of [...st.parcelBlocks]) {
    if (st.split.has(id)) continue;
    const single = blockSingle(id);
    if (single === undefined) { st.parcelBlocks.delete(id); for (const k of [...st.parcels.keys()]) if (MU.get(k.replace(/#(loc|rest)$/, '')).blockId === id) st.parcels.delete(k); continue; }
    for (const k of munisOfBlock.get(id)) if (!st.parcels.has(k) && !st.parcels.has(k + '#loc')) st.parcels.set(k, single);
  }
  /* (E) R6: a PART 町村 whose two sides end up in different prefectures needs the cut — after splits AND
     transfers, so a split's side that a later transfer corrects does not withhold anything */
  for (const [k, o] of st.parcels) {
    if (!k.endsWith('#loc')) continue;
    const k0 = k.slice(0, -4), r = st.parcels.get(k0 + '#rest');
    if (o === r) continue;
    const P = partOf(k0);
    if (!P) throw new Error(k0 + ' is divided between two prefectures on ' + a + ' but meiji-v2-parts.json has no case for it');
    if (!partUse.has(k0)) partUse.set(k0, { intervals: 0, located: P.located });
    partUse.get(k0).intervals++;
    if (!P.located) { hold(i, o, 'R6 ' + villageWhy(P) + ' [' + k0 + ']'); hold(i, r, 'R6 ' + villageWhy(P) + ' [' + k0 + ']'); }
  }
});

/* owners on a block, parcel-aware */
const prefsOnBlock = (i, id) => {
  const st = STATE[i];
  if (!st.parcelBlocks.has(id)) return rowPrefsOnBlock(i, id);
  const s = new Set();
  for (const k of munisOfBlock.get(id)) { for (const kk of [k, k + '#loc', k + '#rest']) if (st.parcels.has(kk) && st.parcels.get(kk)) s.add(st.parcels.get(kk)); }
  return [...s];
};

/* ══ 5. v1 WITHHOLDING RULES, MINUS WHAT THE RESEARCH SETTLED ══════════════════════════════════ */
INTERVALS.forEach(([a], i) => {
  const rows = activeRows[i], st = STATE[i];
  for (const r of rows) if (r.split) {
    if ((r._blocks || []).length && r._blocks.every((id) => st.split.has(id))) continue;
    hold(i, r.prefId, 'R1 split: ' + r.gun + ' — ' + r.split.slice(0, 80));
    for (const id of r._blocks || []) for (const p of prefsOnBlock(i, id)) if (p !== r.prefId) hold(i, p, 'R1 split (other side): ' + r.gun);
  }
  const byBlock = new Map();
  for (const r of rows) for (const id of r._blocks || []) { if (!byBlock.has(id)) byBlock.set(id, []); byBlock.get(id).push(r); }
  for (const [id, rs] of byBlock) {
    if (st.split.has(id)) continue;
    const ps = [...new Set(rs.map((r) => r.prefId))];
    if (ps.length > 1) for (const p of ps) hold(i, p, 'R2 block held by ' + ps.length + ' prefectures: ' + id);
    const want = blockUnits.get(id), have = new Set(rs.map(unitKey));
    if (want && want.size > have.size) for (const p of ps) hold(i, p, 'R2 block partly accounted (' + have.size + '/' + want.size + ' units): ' + id);
  }
});
const incomplete = [];
INTERVALS.forEach(([a], i) => {
  for (const r of activeRows[i]) if (!r._blocks) {
    const thenIds = r.then.map(stripParen).flatMap((t) => F.membership.filter((q) => q.gun === t && q._blocks && active(q, a)).map((q) => [q.prefId, q._blocks]));
    if (thenIds.length && thenIds.every(([p]) => p === r.prefId)) continue;
    if (!thenIds.length) { (incomplete[i] ||= []).push([r.prefId, r.gunTitle || r.gun]); continue; }
    hold(i, r.prefId, 'R5 unjoined row inside another prefecture\'s block: ' + (r.gunTitle || r.gun));
    for (const [p] of thenIds) if (p !== r.prefId) hold(i, p, 'R5 unjoined row (other side): ' + r.gun);
  }
});
/* R3 — v1 logic for the unresolved entries the research did not settle */
const SURVEY_YEAR = 1920;
const dateSpans = (text) => {
  const out = []; let t = text;
  for (const m of text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) out.push([m[0], m[0]]);
  for (const m of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) { const d = m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); out.push([d, d]); }
  t = t.replace(/(\d{4})-(\d{2})-(\d{2})/g, ' ').replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, ' ');
  for (const m of t.matchAll(/(\d{4})年(\d{1,2})月/g)) { const a = m[1] + '-' + m[2].padStart(2, '0') + '-01'; const b = +m[2] === 12 ? (+m[1] + 1) + '-01-01' : m[1] + '-' + String(+m[2] + 1).padStart(2, '0') + '-01'; out.push([a, b]); }
  t = t.replace(/(\d{4})年(\d{1,2})月/g, ' ');
  for (const m of t.matchAll(/(?<![\d-])(1[89]\d\d)(?![\d-])/g)) { const y = +m[1]; if (y >= 1868 && y < SURVEY_YEAR) out.push([y + '-01-01', (y + 1) + '-01-01']); }
  return out;
};
const unresolvedApplied = [];
for (const u of F.unresolved) {
  if (OPS.unresolved[u.what]) { unresolvedApplied.push({ what: u.what, applied: false, settledBy: OPS.unresolved[u.what] }); continue; }
  const own = dateSpans(u.what), expl = dateSpans(u.why);
  let w0, w1, how;
  if (own.length >= 2) { w0 = own.map((s) => s[0]).sort()[0]; w1 = own.map((s) => s[1]).sort().slice(-1)[0]; how = 'span in the title'; }
  else if (/\bdate\b/i.test(u.what) && own.concat(expl).length) { const s = own.concat(expl); w0 = s.map((x) => x[0]).sort()[0]; w1 = s.map((x) => x[1]).sort().slice(-1)[0]; how = 'disputed date'; }
  else if (own.concat(expl).length) { w0 = '0000-01-01'; w1 = own.concat(expl).map((x) => x[1]).sort().slice(-1)[0]; how = 'extent unknown'; }
  const toks = u.what.split(/[\s・、→()（）,]+/).filter(Boolean);
  const names = new Set(toks.flatMap((t) => [t, t + '郡']));
  const prefNames = new Set(toks.filter((t) => F.prefectures.some((p) => p.names.ja === t)));
  if (!w1) { unresolvedApplied.push({ what: u.what, applied: false, note: 'no date: a caveat' }); continue; }
  if (/^city\s/.test(u.what)) { unresolvedApplied.push({ what: u.what, applied: false, note: 'routed to R4 (city)' }); continue; }
  const thenHit = (t) => { const s = stripParen(t); return [...names].some((n) => s === n || (s.startsWith(n) && /^の/.test(s.slice(n.length)))); };
  const kuniNamed = toks.filter((t) => F.membership.some((r) => kuniList(r.kuni).includes(t)));
  const inKuni = (r) => !kuniNamed.length || kuniList(r.kuni).some((q) => kuniNamed.includes(q));
  const hit = (r) => (inKuni(r) && (names.has(r.gun) || r.then.some(thenHit))) || kuniList(r.kuni).some((q) => names.has(q)) || prefNames.has(r.pref);
  let n = 0; const ps = new Set();
  INTERVALS.forEach(([a, b], i) => {
    if (!(a < w1 && b > w0)) return;
    const rs = activeRows[i].filter(hit);
    const ids = new Set(rs.flatMap((r) => r._blocks || []));
    const all = new Set(rs.map((r) => r.prefId));
    for (const id of ids) for (const p of prefsOnBlock(i, id)) all.add(p);
    for (const p of all) { hold(i, p, 'R3 unresolved: ' + u.what); n++; ps.add(p); }
  });
  unresolvedApplied.push({ what: u.what, applied: n > 0, window: [w0, w1], how, prefectures: [...ps].map((p) => PREF.get(p).names.ja), intervals: n });
}
/* R4 — the v1 heuristic, only for villageTransfers no resolution covers, plus city annexations */
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
const thenNames = (t) => { const s = String(t); const o = [stripParen(s).replace(/のうち.*$/, '')]; for (const m of s.matchAll(/[（(]([^）)]*?郡)に当たる/g)) o.push(m[1]); return o; };
const unitsCalled = (g) => [...rowsByUnit.values()].filter((rs) => rs[0]._blocks && (rs[0].gun === g || rs[0].then.some((t) => thenNames(t).includes(g))));
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
function addTransfer(src, T, homeCands, names, ownName) {
  const groups = []; let internal = false;
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
const coveredSweep = [];
for (const v of F.villageTransfers) {
  const cov = coveredBy(v);
  if (cov.length) { coveredSweep.push({ sweep: v.date + ' ' + v.article, by: cov }); continue; }
  const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(v.date);
  if (!m) { transfers.push({ src: v, skipped: 'date not parsed: ' + v.date }); continue; }
  const T = m[2] ? v.date : (+m[1] + 1) + '-01-01';
  if (T > SURVEY_YEAR + '-01-01') { transfers.push({ src: v, skipped: 'after the 1920 survey' }); continue; }
  const art = stripParen(v.article);
  const dis = (/[（(]([^）)]*)[）)]/.exec(v.article) || [])[1];
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
  const src = { article: c.name + ' annexes part of ' + (p.gun || '(郡 not stated)'), date: p.date };
  if (!city) { transfers.push({ src, skipped: 'city not joined' }); continue; }
  addTransfer(src, p.date, city[0]._blocks, p.gun ? [p.gun] : [], null);
}
for (const u of F.unresolved) {
  const m = /^city\s+(.+)$/.exec(u.what); if (!m) continue;
  const city = [...rowsByUnit.values()].find((rs) => stripParen(rs[0].gun) === stripParen(m[1]) && rs[0]._blocks);
  const ds = dateSpans(u.why); if (!city || !ds.length) continue;
  addTransfer({ article: u.what + ' (unresolved: origin 郡 not stated)', date: ds.map((d) => d[1]).sort().slice(-1)[0] }, ds.map((d) => d[1]).sort().slice(-1)[0], city[0]._blocks, [], null);
}
for (const t of transfers) for (const g of t.groups || []) {
  INTERVALS.forEach(([a], i) => {
    if (a >= t.T) return;
    /* the sweep's coarse rule reads the blocks' row prefectures (as v1): a researched village parcel inside a
       block does not make every unrelated sweep move there a cross-prefecture move */
    const ps = new Set(g.blocks.flatMap((id) => STATE[i].split.has(id) ? prefsOnBlock(i, id) : rowPrefsOnBlock(i, id)));
    if (ps.size > 1) { for (const p of ps) hold(i, p, 'R4 village transfer ' + t.src.date + ' ' + t.src.article + (g.unknownOther ? ' (other side unknown: all neighbours)' : '')); g.hit = (g.hit || 0) + 1; }
  });
}

/* ══ 6. PIECES, RUNS, UNIONS ═════════════════════════════════════════════════════════════════
   The pieces of a prefecture on an interval: whole blocks it alone holds (no parcel map), and parcels. */
const pieceGeom = (pk) => {
  if (pk.startsWith('B:')) return BID.get(pk.slice(2)).coords;
  const k = pk.slice(2), m = /^(.*)#(loc|rest)$/.exec(k);
  if (!m) return MU.get(k).coords;
  const P = partOf(m[1]);
  if (!P || !P.located) return null;
  return m[2] === 'loc' ? P.loc : P.rest;
};
const pieceArea = (pk) => {
  if (pk.startsWith('B:')) return BID.get(pk.slice(2)).areaKm2;
  const k = pk.slice(2), m = /^(.*)#(loc|rest)$/.exec(k);
  if (!m) return MU.get(k).areaKm2;
  const P = partOf(m[1]); if (P && P.located) return m[2] === 'loc' ? P.locKm2 : P.restKm2;
  return m[2] === 'loc' ? 0 : MU.get(m[1]).areaKm2;   /* an unlocated cut is counted whole on the rest side (only for measures of withheld land) */
};
const block1920Of = (pk) => pk.startsWith('B:') ? BID.get(pk.slice(2)) : BID.get(MU.get(pk.slice(2).replace(/#(loc|rest)$/, '')).blockId);
const piecesAt = (i) => {
  const st = STATE[i], out = new Map();
  const add = (p, pk) => { if (!p) return; if (!out.has(p)) out.set(p, []); out.get(p).push(pk); };
  const blockIds = new Set(activeRows[i].flatMap((r) => r._blocks || []));
  for (const id of st.parcelBlocks) blockIds.add(id);
  for (const id of blockIds) {
    if (st.parcelBlocks.has(id)) { for (const k of munisOfBlock.get(id)) { if (st.parcels.has(k)) add(st.parcels.get(k), 'M:' + k); if (st.parcels.has(k + '#loc')) add(st.parcels.get(k + '#loc'), 'M:' + k + '#loc'); if (st.parcels.has(k + '#rest')) add(st.parcels.get(k + '#rest'), 'M:' + k + '#rest'); } continue; }
    for (const p of rowPrefsOnBlock(i, id)) add(p, 'B:' + id);
  }
  return out;
};
const PIECES = INTERVALS.map((_, i) => piecesAt(i));
const runs = [];
const prefIds = [...new Set(PIECES.flatMap((m) => [...m.keys()]))];
for (const pid of prefIds) {
  let cur = null;
  INTERVALS.forEach(([a, b], i) => {
    const pcs = (PIECES[i].get(pid) || []).slice().sort();
    if (!pcs.length) { cur = null; return; }
    const w = withheld.get(i)?.get(pid);
    const drawn = !w;
    const key = pcs.join('|') + '#' + drawn;
    if (cur && cur.key === key && cur.b === a) { cur.b = b; cur.n++; if (w) for (const x of w) cur.why.add(x); return; }
    cur = { pid, a, b, pieces: pcs, drawn, key, n: 1, why: new Set(w || []) };
    runs.push(cur);
  });
}
const unionTrouble = [];
function unionAll(polys, label) {
  if (polys.length < 2) return polys;
  try { return pc.union(polys[0], ...polys.slice(1)); } catch { /* fold */ }
  let acc = [polys[0]], seams = 0;
  for (const p of polys.slice(1)) { try { acc = clip('union', acc, [p]); } catch { acc = acc.concat([p]); seams++; } }
  if (seams) unionTrouble.push(label + ' (' + seams + ' unmerged)');
  return acc;
}
const round6 = (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));
const unionMemo = new Map();
const unionPieces = (pcs, label) => {
  const key = pcs.join('|');
  if (!unionMemo.has(key)) {
    /* whole blocks first (already unions), then the parcels of each divided block merged block by block */
    const polys = [];
    const byBlock = new Map();
    for (const pk of pcs) { if (pk.startsWith('B:')) { polys.push(...pieceGeom(pk)); continue; } const id = block1920Of(pk).id; if (!byBlock.has(id)) byBlock.set(id, []); byBlock.get(id).push(pk); }
    for (const [id, ks] of byBlock) { const g = ks.flatMap((pk) => pieceGeom(pk) || []); polys.push(...unionAll(g, label + ' ' + id)); }
    unionMemo.set(key, round6(unionAll(polys, label)));
  }
  return unionMemo.get(key);
};
const drawnRuns = runs.filter((r) => r.drawn && r.pieces.length);
log('runs ' + runs.length + ', drawn ' + drawnRuns.length);
let t0 = Date.now();
drawnRuns.forEach((r, k) => { r.geom = unionPieces(r.pieces, r.pid + ' ' + r.a); if (k % 25 === 0) log('  union ' + k + '/' + drawnRuns.length + ' ' + ((Date.now() - t0) / 1000).toFixed(0) + 's'); });

/* custody notes: a run that starts or ends on a date with a note carries it */
const noteAt = new Map((OPS.custodyNotes || []).map((n) => [n.date, n.text]));
for (const e of liveTransfers) if (e.note && e.T) noteAt.set(e.T, (noteAt.has(e.T) ? noteAt.get(e.T) + ' / ' : '') + e.note);

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
    const village = r.pieces.some((pk) => pk.startsWith('M:'));
    feats.push([P.names.ja, 4, sy, sm, sd, ey, em, ed, polys.map((p) => p.map(pool)), { en: P.names.en || P.names.ja, ja: P.names.ja }, village ? 'meiji-recon-village' : 'meiji-recon', r.pid, null]);
    const startStated = r.a === P.start, endStated = r.b === P.end;
    const notes = [noteAt.get(r.a), r.b !== END ? noteAt.get(r.b) : null].filter(Boolean);
    dates[i] = {
      start: { raw: r.a, precision: 'day', ...(startStated ? {} : { derived: true, basis: 'membership of its 郡 / 町村 changes on this day (facts + research)' }) },
      end: r.b === END ? { raw: null, precision: null, derived: true, basis: 'the record ends 1890-12-31' } : { raw: r.b, precision: 'day', ...(endStated ? {} : { derived: true, basis: 'membership of its 郡 / 町村 changes on this day' }) },
      ...(notes.length ? { note: notes.join(' / ') } : {}),
    };
  });
  const data = { v: 1, src: 'Reconstruction (pilot v2): prefecture membership of 1920 郡/市/町村 from Japanese Wikipedia (CC BY-SA, facts extracted) and village-level research, on ' + N03.publisher + ' and ' + ESTAT.publisher + ' · ' + label,
    built: new Date().toISOString().slice(0, 10), tolerance: tol, decimals: dec, levels: [4], dateSemantics: 'exclusive-end',
    sources: { 'meiji-recon': { publisher: N03.publisher, licence: N03.licence, citation: N03.citation },
      'meiji-recon-village': { publisher: N03.publisher + ' + ' + ESTAT.publisher, licence: N03.licence + ' / ' + ESTAT.quotes[2], citation: N03.citation + ' ' + ESTAT.citation } },
    dates, rings, feats };
  fs.writeFileSync(file, 'window.__HISTADMRECONMEIJI=' + JSON.stringify(data) + ';\n');
  return { file, bytes: fs.statSync(file).size, feats: feats.length, rings: rings.length, vertices: rings.reduce((s, r) => s + r.length, 0) };
}
const admin1Head = fs.readFileSync(path.join(ROOT, 'data', 'hist-admin1.js'), 'utf8').slice(0, 400000);
const ADM1_TOL = Number(/"tolerance":([0-9.]+)/.exec(admin1Head)[1]);
const ADM1_DEC = Math.max(...[...admin1Head.matchAll(/\[(-?\d+\.(\d+)),(-?\d+\.(\d+))\]/g)].slice(0, 2000).map((m) => Math.max(m[2].length, m[4].length)));
const sizes = {
  full: writeBundle(path.join(OUT, 'hist-admin-recon-meiji-v2.js'), drawnRuns, 0, 6, 'full precision (6 decimals, not simplified)'),
  coarse: writeBundle(path.join(OUT, 'hist-admin-recon-meiji-coarse-v2.js'), drawnRuns, ADM1_TOL, ADM1_DEC, 'simplified to data/hist-admin1.js tolerance ' + ADM1_TOL),
};
log('bundle ' + JSON.stringify(sizes));

/* ══ MEASURE ══════════════════════════════════════════════════════════════════════════════ */
const report = { built: new Date().toISOString(), scope: F.scope, intervals: INTERVALS.length, sizes, estat: ESTAT, appliedOps, issues: issues.filter((x, k, a) => a.findIndex((y) => y.what === x.what && y.split === x.split) === k), earlyHolders: [...earlyHolders], conflicts, snapped: [...new Set(snapLog)].map((s) => s + ' ×' + snapLog.filter((x) => x === s).length) };
report.join = { units: rowsByUnit.size, joined: unitBlock.size, unresolvedPrefRows: unresolvedPrefRows.length };
const areaOfPieces = (pcs) => pcs.reduce((s, pk) => s + pieceArea(pk), 0);

// A. membership vs the 1920 prefectures, by area of pieces
report.A = {};
for (const d of ['1889-07-01', '1890-07-01']) {
  const i = intervalIndexAt(d);
  const truthArea = new Map();
  for (const b of BLOCKS) if (b.name !== '所属未定') truthArea.set(b.pref1920, (truthArea.get(b.pref1920) || 0) + b.areaKm2);
  const rows = [];
  for (const [pid, pcs] of PIECES[i]) {
    const by = new Map(); for (const pk of pcs) { const t = block1920Of(pk).pref1920; by.set(t, (by.get(t) || 0) + pieceArea(pk)); }
    const mine = areaOfPieces(pcs);
    let best = null; for (const [tp, ia] of by) { const iou = ia / (mine + truthArea.get(tp) - ia); if (!best || iou > best.iou) best = { tp, iou }; }
    rows.push({ pref: PREF.get(pid).names.ja, pref1920: best?.tp, iou: best ? +best.iou.toFixed(4) : 0, km2: +mine.toFixed(0), drawn: !withheld.get(i)?.has(pid) });
  }
  rows.sort((p, q) => p.iou - q.iou);
  report.A[d] = { prefectures: rows.length, iouMedian: rows.map((r) => r.iou).sort()[rows.length >> 1], below1: rows.filter((r) => r.iou < 0.9999) };
}
// B. 旧国 vs data/hist-kuni.js (v1, unchanged: it compares the 1920 blocks' 国, not the prefecture assembly)
{
  const K = readWindow('data/hist-kuni.js', '__HISTKUNI');
  const older = new Map();
  for (const c of F.cities) for (const p of c.parents) { const m = /(.{2}国)から分割された(.{2,3}国)/.exec(p.kuniNote || ''); if (m) older.set(m[2], m[1]); }
  const kuniOfBlock = new Map();
  for (const b of BLOCKS) { const ks = new Set([...(blockUnits.get(b.id) || [])].flatMap((k) => rowsByUnit.get(k).flatMap((r) => kuniList(r.kuni)))); if (ks.size === 1) kuniOfBlock.set(b.id, [...ks][0]); }
  const res = [];
  const A = (g) => turfArea({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: g } }) / 1e6;
  for (const f of K.feats) {
    const name = f[0];
    const theirs = f[8].map((p) => p.map((ri) => K.rings[ri]));
    const ids = [...kuniOfBlock].filter(([, k]) => k === name || older.get(k) === name).map(([id]) => id);
    if (!ids.length) { res.push({ kuni: name, blocks: 0 }); continue; }
    const ours = round6(unionAll(ids.flatMap((id) => BID.get(id).coords), 'kuni ' + name));
    let inter, uni;
    try { inter = clip('intersection', ours, theirs); uni = clip('union', ours, theirs); } catch (e) { res.push({ kuni: name, blocks: ids.length, error: String(e.message || e) }); continue; }
    res.push({ kuni: name, blocks: ids.length, iou: +(A(inter) / A(uni)).toFixed(4), oursKm2: +A(ours).toFixed(0), theirsKm2: +A(theirs).toFixed(0) });
  }
  const ok = res.filter((r) => r.iou != null).sort((p, q) => p.iou - q.iou);
  report.B = { perKuni: res, iouMedian: ok[ok.length >> 1]?.iou, worst10: ok.slice(0, 10) };
}
// C. counts
report.C = [];
for (const [d, c] of Object.entries(F.counts)) {
  const i = intervalIndexAt(d); if (i < 0) continue;
  const inForce = [...PIECES[i].keys()].filter((p) => ['fu', 'ken'].includes(PREF.get(p).kind));
  const wh = inForce.filter((p) => withheld.get(i)?.has(p));
  report.C.push({ date: d, stated: c.stated, statedN: c.derived, inForceFuKen: inForce.length, drawn: inForce.length - wh.length, withheld: wh.length, withheldNames: wh.map((p) => PREF.get(p).names.ja) });
}
// withheld list
const whList = runs.filter((x) => !x.drawn).map((r) => ({ pref: PREF.get(r.pid).names.ja, pid: r.pid, from: r.a, to: r.b, reasons: [...r.why] }));
const byRule = {};
for (const w of whList) for (const x of new Set(w.reasons.map((s) => s.slice(0, 2)))) byRule[x] = (byRule[x] || 0) + 1;
report.withheld = { runs: whList.length, prefectureIntervals: [...withheld.values()].reduce((s, m) => s + m.size, 0), byRule, list: whList };
report.unresolvedApplied = unresolvedApplied;
report.transfersResearch = transferEvents.map((e) => ({ key: e.key, skip: e.skip || null, date: e.T || (e.W ? e.W.join('..') : null), items: (e.items || []).map((it) => it.muni + (it.part ? ' (part)' : '') + ' <- ' + it.ref) }));
report.transfersSweepCovered = coveredSweep;
report.transfersHeuristic = { total: transfers.length, withheldSomething: transfers.flatMap((t) => (t.groups || []).filter((g) => g.hit).map((g) => ({ date: t.src.date, article: t.src.article, intervals: g.hit, unknownOther: g.unknownOther }))) };
report.incomplete = Object.entries(incomplete).map(([i, l]) => ({ interval: INTERVALS[i], drawnWithout: l.map(([p, u]) => PREF.get(p).names.ja + ' w/o ' + u) }));
// PART cases
report.parts = [...PARTRES.values()].map((r) => ({ muni: r.muni, located: r.located, needed: partUse.get(r.key)?.intervals || 0, why: r.why, modern: r.modern.map((m) => m.name + ' ' + m.code),
  villages: r.villages.map((v) => ({ village: v.village, level: v.level, matched: v.names, fuzzy: v.fuzzy })), unlocatable: r.unlocatable, km2: +r.km2.toFixed(3), locKm2: r.locKm2 != null ? +r.locKm2.toFixed(3) : null }));
// D. coverage
const LAND = BLOCKS.filter((b) => b.name !== '所属未定').reduce((s, b) => s + b.areaKm2, 0);
report.D = { landKm2: +LAND.toFixed(0), at: {} };
const drawnAt = (d) => drawnRuns.filter((r) => r.a <= d && r.b > d);
for (const d of ['1872-07-01', '1876-12-01', '1883-07-01', '1890-07-01']) {
  const rs = drawnAt(d); const km = rs.reduce((s, r) => s + areaOfPieces(r.pieces), 0);
  const i = intervalIndexAt(d);
  const withheldKm = [...(withheld.get(i)?.keys() || [])].reduce((s, p) => s + areaOfPieces(PIECES[i].get(p) || []), 0);
  report.D.at[d] = { drawn: rs.length, km2: +km.toFixed(0), share: +(km / LAND).toFixed(4), withheldKm2: +withheldKm.toFixed(0) };
}
// E. against v1
{
  const v1f = arg('--v1-report');
  if (v1f && fs.existsSync(v1f)) {
    const V1 = JSON.parse(fs.readFileSync(v1f, 'utf8'));
    const v1Held = (pid, d) => V1.withheld.list.some((w) => w.pid === pid && w.from <= d && w.to > d);
    const v1D = V1.D;
    let both = 0, newly = 0, lost = 0, bothDrawn = 0, daysNew = 0, daysLost = 0, daysBoth = 0;
    const newlyList = new Map(), lostList = new Map();
    const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
    INTERVALS.forEach(([a, b], i) => {
      for (const pid of PIECES[i].keys()) {
        const h2 = !!withheld.get(i)?.has(pid), h1 = v1Held(pid, a);
        if (h1 && h2) { both++; daysBoth += days(a, b); }
        else if (h1 && !h2) { newly++; daysNew += days(a, b); const k = PREF.get(pid).names.ja; newlyList.set(k, (newlyList.get(k) || 0) + days(a, b)); }
        else if (!h1 && h2) { lost++; daysLost += days(a, b); const k = PREF.get(pid).names.ja; if (!lostList.has(k)) lostList.set(k, new Set()); for (const w of withheld.get(i).get(pid)) lostList.get(k).add(w.slice(0, 140)); }
        else bothDrawn++;
      }
    });
    const reasonsLeft = {};
    for (const w of whList) for (const r of w.reasons) { const k = r.replace(/\s*\[.*\]$/, '').slice(0, 160); reasonsLeft[k] = (reasonsLeft[k] || 0) + 1; }
    report.E = { measuredOn: 'v2 intervals (' + INTERVALS.length + '); v1 status read at each interval\'s first day from ' + path.basename(v1f),
      prefectureIntervals: { v1WithheldNowDrawn: newly, v1DrawnNowWithheld: lost, stillWithheld: both, drawnInBoth: bothDrawn },
      prefectureDays: { nowDrawn: Math.round(daysNew), nowWithheld: Math.round(daysLost), stillWithheld: Math.round(daysBoth) },
      runs: { v1Withheld: V1.withheld.runs, v2Withheld: whList.length },
      newlyDrawnDaysByPrefecture: Object.fromEntries([...newlyList].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])),
      newlyWithheld: Object.fromEntries([...lostList].map(([k, s]) => [k, [...s]])),
      v1D: v1D.at, remainingReasonsByRunCount: Object.fromEntries(Object.entries(reasonsLeft).sort((a, b) => b[1] - a[1])) };
  }
}
report.unionTrouble = unionTrouble;
fs.writeFileSync(path.join(OUT, 'meiji-report-v2.json'), JSON.stringify(report, null, 1));

/* ══ IMAGES ═══════════════════════════════════════════════════════════════════════════════ */
const PALETTE = ['#f8c8c8', '#c8e0f8', '#cdeccd', '#f8e4b8', '#e0cdf3', '#f6d0e8', '#c8efe8', '#ecefc0', '#f3d6c2', '#d2d8f6'];
function simplifyPolys(polys, tol) {
  const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] }, { tolerance: tol, decimals: 6 });
  const g = fc.features[0].geometry; return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}
function labelPoint(polys) {
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
    const bbIn = (polys) => polys.some((p) => p[0].some(([x, y]) => x >= w && x <= e && y >= s && y <= n));
    const pathOf = (polys) => polys.map((p) => p.map((r) => 'M' + r.map(([x, y]) => X(x) + ',' + Y(y)).join('L') + 'Z').join('')).join('');
    const tol = v.tol;
    const i = intervalIndexAt(v.date);
    const rs = drawnAt(v.date).filter((r) => bbIn(r.geom));
    const blocksOfRun = (r) => new Set(r.pieces.map((pk) => block1920Of(pk).id));
    const prefAdj = new Map(rs.map((r) => [r.pid, new Set()]));
    for (const r of rs) { const br = blocksOfRun(r); for (const q of rs) { if (r === q) continue; const bq = blocksOfRun(q); if ([...br].some((id) => bq.has(id) || [...bq].some((j) => adj.get(id).has(j)))) prefAdj.get(r.pid).add(q.pid); } }
    const col = new Map();
    for (const r of rs.slice().sort((a, b) => prefAdj.get(b.pid).size - prefAdj.get(a.pid).size)) { const usedC = new Set([...prefAdj.get(r.pid)].map((p) => col.get(p))); col.set(r.pid, PALETTE.find((c) => !usedC.has(c)) || PALETTE[0]); }
    const drawnPieces = new Set(rs.flatMap((r) => r.pieces));
    const heldPieces = new Set([...(withheld.get(i)?.keys() || [])].flatMap((p) => PIECES[i].get(p) || []));
    let svg = '';
    /* land not drawn: whole blocks, hatched where a withheld prefecture holds them */
    const drawnBlocks = new Set([...drawnPieces].filter((pk) => pk.startsWith('B:')).map((pk) => pk.slice(2)));
    const partlyDrawn = new Set([...drawnPieces].filter((pk) => pk.startsWith('M:')).map((pk) => block1920Of(pk).id));
    for (const b of BLOCKS) {
      if (drawnBlocks.has(b.id) || !bbIn(b.coords)) continue;
      const held = [...heldPieces].some((pk) => block1920Of(pk).id === b.id);
      const g = tol ? simplifyPolys(b.coords, tol) : b.coords;
      svg += '<path d="' + pathOf(g) + '" fill="' + (held ? 'url(#hatch)' : '#eeeeee') + '" stroke="#bbb" stroke-width="0.4"/>';
    }
    void partlyDrawn;
    for (const r of rs) { const g = tol ? simplifyPolys(r.geom, tol) : r.geom; svg += '<path d="' + pathOf(g) + '" fill="' + col.get(r.pid) + '" stroke="#444" stroke-width="' + (v.stroke || 0.8) + '" fill-rule="evenodd"/>'; }
    if (v.blockLines) for (const id of new Set([...drawnPieces].map((pk) => block1920Of(pk).id))) { const b = BID.get(id); if (!bbIn(b.coords)) continue; svg += '<path d="' + pathOf(b.coords) + '" fill="none" stroke="#888" stroke-width="0.5" stroke-dasharray="3,2"/>'; }
    if (v.muniLines) {
      for (const m of MU.values()) { if (!bbIn(m.coords)) continue; svg += '<path d="' + pathOf(m.coords) + '" fill="none" stroke="#666" stroke-width="0.7" stroke-dasharray="6,3"/>'; }
      for (const P of PARTRES.values()) { if (!P.koaza) continue; for (const k of P.koaza) if (bbIn(k.polys)) svg += '<path d="' + pathOf(k.polys) + '" fill="none" stroke="#777" stroke-width="0.6" stroke-dasharray="1,2.5"/>'; }
      for (const P of PARTRES.values()) { if (!P.located || !P.loc || !bbIn(P.loc)) continue; svg += '<path d="' + pathOf(P.loc) + '" fill="none" stroke="#b00" stroke-width="1.6"/>'; }
    }
    let labels = '';
    for (const r of rs) {
      let g = simplifyPolys(r.geom, (e - w) / W * 2);
      try { g = pc.intersection(g, [[[w, s], [e, s], [e, n], [w, n], [w, s]]]); } catch { /* whole outline */ }
      if (!g.length) continue;
      const [x, y] = labelPoint(g); if (x < w || x > e || y < s || y > n) continue; labels += '<text x="' + X(x) + '" y="' + Y(y) + '">' + PREF.get(r.pid).names.ja + '</text>';
    }
    if (v.muniLines) for (const P of PARTRES.values()) { if (!P.located || !P.loc || !bbIn(P.loc)) continue; const [x, y] = labelPoint(P.loc); if (x >= w && x <= e && y >= s && y <= n) labels += '<text class="v" x="' + X(x) + '" y="' + Y(y) + '">' + P.locate.join('・') + '</text>'; }
    const legendH = 100 + (v.blockLines ? 28 : 0) + (v.muniLines ? 84 : 0);
    let legend = '<g transform="translate(20,20)"><rect width="520" height="' + legendH + '" fill="#fff" opacity="0.92" rx="8"/><text class="t" x="14" y="28">' + v.title + '</text>'
      + '<rect x="14" y="52" width="26" height="16" fill="url(#hatch)" stroke="#888"/><text x="48" y="61" class="l">根拠不足のため描かない</text>'
      + '<rect x="14" y="76" width="26" height="16" fill="#eeeeee" stroke="#bbb"/><text x="48" y="85" class="l">この日の所属の記録なし</text>';
    let yy = 110;
    if (v.blockLines) { legend += '<line x1="14" y1="' + yy + '" x2="40" y2="' + yy + '" stroke="#888" stroke-dasharray="3,2"/><text x="48" y="' + yy + '" class="l">1920 年の郡・市（構成単位）</text>'; yy += 28; }
    if (v.muniLines) {
      legend += '<line x1="14" y1="' + yy + '" x2="40" y2="' + yy + '" stroke="#666" stroke-width="1.4" stroke-dasharray="6,3"/><text x="48" y="' + yy + '" class="l">1920 年の町村（N03-1920）</text>'; yy += 28;
      legend += '<line x1="14" y1="' + yy + '" x2="40" y2="' + yy + '" stroke="#777" stroke-width="1.4" stroke-dasharray="1,2.5"/><text x="48" y="' + yy + '" class="l">大字・町丁（e-Stat 小地域 2020, 町村で切り抜き）</text>'; yy += 28;
      legend += '<line x1="14" y1="' + yy + '" x2="40" y2="' + yy + '" stroke="#b00" stroke-width="2"/><text x="48" y="' + yy + '" class="l">移動・分属した旧村（名指しされた村）</text>';
    }
    legend += '</g>';
    const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:"Yu Gothic UI","Meiryo",sans-serif}text{font-size:' + (v.font || 11) + 'px;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3px;fill:#222}.t{font-size:22px;text-anchor:start}.l{text-anchor:start;font-size:15px}.v{font-size:' + Math.round((v.font || 11) * 0.8) + 'px;fill:#900}</style>'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" style="background:#dfeaf3"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#d9d9d9"/><line x1="0" y1="0" x2="0" y2="7" stroke="#8a8a8a" stroke-width="2.2"/></pattern></defs>'
      + svg + labels + legend + '</svg>';
    await page.setViewportSize({ width: W, height: H });
    await page.setContent(html);
    const file = path.join(OUT, v.file);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
    outs.push({ file, date: v.date, drawn: rs.length, prefectures: rs.map((r) => PREF.get(r.pid).names.ja) });
    log('  png ' + file);
  }
  await browser.close();
  return outs;
}
if (!args.includes('--no-images')) {
  const JP = [128, 30, 146.2, 45.7];
  const views = ['1872-07-01', '1876-12-01', '1883-07-01', '1890-07-01'].map((d) => ({ date: d, bbox: JP, width: 1600, tol: 0.004, file: 'meiji-' + d + '-v2.png', title: d + ' の府県（復元・試作 v2）', font: 11 }));
  const KINAI = [135.05, 34.15, 136.15, 34.95];
  for (const d of ['1876-12-01', '1883-07-01']) views.push({ date: d, bbox: KINAI, width: 1800, tol: 0, stroke: 1.4, blockLines: true, file: 'meiji-kinai-' + d + '-v2.png', title: d + ' 大和・河内・和泉（全精度 v2）', font: 18 });
  for (const z of (arg('--zooms') ? JSON.parse(fs.readFileSync(arg('--zooms'), 'utf8')) : [])) views.push({ tol: 0, stroke: 1.4, muniLines: true, font: 16, width: 1800, ...z });
  report.images = await render(views);
  fs.writeFileSync(path.join(OUT, 'meiji-report-v2.json'), JSON.stringify(report, null, 1));
}
log('done ' + path.join(OUT, 'meiji-report-v2.json'));
