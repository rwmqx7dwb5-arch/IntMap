#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/locate-parts-v2.mjs   (hist-coverage-depth · PILOT v2)
 *
 * For every PART case of meiji-v2-parts.json: find the 1920 町村's modern municipalities, download their
 * e-Stat 小地域 2020, match the named pre-1889 villages to 町丁・字 names (estat-koaza.mjs matchVillages),
 * and cut the 1920 polygon into
 *     loc   = (union of the matched 町丁・字) ∩ 1920 町村     — the named villages
 *     rest  = 1920 町村 − loc                               — everything else
 * A case is LOCATED only when every village of `locate` matched at level exact/prefixed and nothing is
 * `unlocatable`. Otherwise it carries `why` («village X not located …») and no geometry is cut.
 *
 * Usage (report only): node scripts/histrecon/locate-parts-v2.mjs --munis-cache <file> [--out <json>]
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';
import { modernCodesFor, koaza, matchVillages, prefixSet, km2, clip } from './estat-koaza.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PARTS = JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-v2-parts.json'), 'utf8'));
/* (hist-reconstruction) villages whose territory later research named as an exact list of e-Stat 町丁・字
   (meiji-v3-research.json, kind «aza»: the successor areas are wholly that village, with evidence) — they are
   located by that list, not by matching the village's own name; a case still needs EVERY village located */
const RES3 = fs.existsSync(path.join(HERE, 'meiji-v3-research.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'meiji-v3-research.json'), 'utf8')) : { cases: [] };
const base = (s) => String(s).replace(/[（(].*$/, '').replace(/(村|町)$/, '');
function researchedAza(muni, village) {
  const v = base(village);
  for (const c of RES3.cases) {
    if (c.kind !== 'aza' || c.muni !== muni) continue;
    const named = String(c.village).replace(/[（(].*$/, '').split('・').map(base);
    if (named.includes(v) || named.some((n) => n && (n.startsWith(v) || v.startsWith(n)))) return c;
  }
  return null;
}

const round6 = (g) => g.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])));

/** muniLookup: research key («pref/gun/name», Hokkaido without 支庁) -> muni record */
export function muniLookup(munis) {
  const m = new Map();
  for (const x of munis.values()) {
    const k = x.pref1920 + '/' + x.gun + '/' + x.name;
    if (m.has(k) && m.get(k) !== x) m.set(k, null); else m.set(k, x);
  }
  return (key) => { const x = m.get(key); if (x === null) throw new Error('ambiguous 1920 町村 key ' + key); return x || null; };
}

export async function locateParts({ munis, log = () => {} }) {
  const look = muniLookup(munis);
  const namesByPref = new Map();
  for (const x of munis.values()) { if (!namesByPref.has(x.pref1920)) namesByPref.set(x.pref1920, []); namesByPref.get(x.pref1920).push(x.name); }
  const out = new Map();
  for (const c of PARTS.cases) {
    const M = look(c.muni);
    if (!M) throw new Error('parts: no 1920 町村 ' + c.muni);
    const r = { muni: c.muni, key: M.key, blockId: M.blockId, km2: M.areaKm2, locate: c.locate, unlocatable: c.unlocatable || [], sideHint: c.sideHint || null, sameSide: !!c.sameSide, from: c.from, modern: [], villages: [], located: false, why: null };
    out.set(c.muni, r);
    if (c.sameSide) { r.located = true; r.why = null; continue; }
    if (!c.locate.length) { r.why = r.unlocatable.map((u) => 'village ' + u.village + ' not located (' + u.reason + ')').join('; '); continue; }
    r.modern = await modernCodesFor(M.coords, M.n03, { log });
    const feats = [];
    for (const m of r.modern) feats.push(...await koaza(m.code, { log }));
    const { res, inside, insideCount } = matchVillages(c.locate, feats, M.coords, prefixSet(namesByPref.get(M.pref1920)));
    for (const v of res) {
      if (v.level === 'exact' || v.level === 'prefixed') continue;
      const rc = researchedAza(c.muni, v.village);
      if (!rc) continue;
      const fs2 = feats.filter((f) => rc.aza.includes(f.s));
      const missing = rc.aza.filter((n) => !fs2.some((f) => f.s === n));
      if (missing.length) { v.researchMissing = missing; continue; }
      v.level = 'researched'; v.names = rc.aza; v.feats = fs2; v.evidence = rc.evidence;
    }
    r.insideKoaza = insideCount;
    /* every 町丁・字 inside the 1920 町村, clipped to it: drawn dotted in the village-level zoom */
    r.koaza = inside.map((f) => { try { return { s: f.s, polys: round6(clip("intersection", f.polys, M.coords)) }; } catch { return null; } }).filter(Boolean);
    r.villages = res.map((v) => ({ village: v.village, level: v.level, names: v.names, fuzzy: v.fuzzy }));
    const ok = (v) => v.level === 'exact' || v.level === 'prefixed' || v.level === 'researched';
    const bad = res.filter((v) => !ok(v));
    const why = [];
    for (const v of bad) why.push('village ' + v.village + ' not located (' + (v.researchMissing ? 'researched 町丁・字 not in the e-Stat files searched: ' + v.researchMissing.join('・') + '; ' : '') + (v.level === 'fuzzy' ? 'only fuzzy 町丁・字 candidates: ' + v.fuzzy.join('・') : 'no 町丁・字 of that name inside the 1920 町村; searched ' + r.modern.map((m) => m.name + ' ' + m.code).join(', ')) + ')');
    for (const u of r.unlocatable) why.push('village ' + u.village + ' not located (' + u.reason + ')');
    /* geometry is cut even when the case is not fully located, for the zoom image and the area report */
    const polys = res.filter(ok).flatMap((v) => v.feats.flatMap((f) => f.polys));
    if (polys.length) {
      let u = [polys[0]];
      for (const p of polys.slice(1)) u = clip("union", u, [p]);
      const loc = clip("intersection", u, M.coords);
      const rest = clip("difference", M.coords, loc);
      r.loc = round6(loc); r.rest = round6(rest);
      r.locKm2 = km2(r.loc); r.restKm2 = km2(r.rest);
    }
    if (why.length) r.why = why.join('; '); else if (!r.loc) r.why = 'nothing matched'; else r.located = true;
    log('  part ' + c.muni + ' ' + (r.located ? 'LOCATED' : 'not: ' + r.why.slice(0, 120)));
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const { munis: load } = await import('./munis-n03-1920.mjs');
  let munis;
  const mc = arg('--munis-cache');
  if (mc && fs.existsSync(mc)) munis = new Map(JSON.parse(fs.readFileSync(mc, 'utf8')).munis.map((x) => [x.key, x]));
  else munis = (await load({ log: console.error })).munis;
  const res = await locateParts({ munis, log: console.error });
  const rep = [...res.values()].map((r) => ({ muni: r.muni, located: r.located, why: r.why, modern: r.modern.map((m) => m.name + ' ' + m.code), villages: r.villages, km2: +r.km2.toFixed(3), locKm2: r.locKm2 != null ? +r.locKm2.toFixed(3) : null }));
  if (arg('--out')) fs.writeFileSync(arg('--out'), JSON.stringify(rep, null, 1));
  for (const r of rep) console.log((r.located ? 'OK   ' : 'MISS ') + r.muni + ' [' + r.modern.join(', ') + '] ' + r.villages.map((v) => v.village + '=' + v.level + (v.names.length ? '{' + v.names.slice(0, 6).join(',') + (v.names.length > 6 ? ',…' : '') + '}' : '') + (v.fuzzy.length ? '~{' + v.fuzzy.slice(0, 5).join(',') + '}' : '')).join(' ') + (r.locKm2 != null ? ' loc ' + r.locKm2 + '/' + r.km2 + ' km2' : ''));
}
