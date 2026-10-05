#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/estat-koaza.mjs   (hist-coverage-depth · PILOT v2)
 *
 * SUB-町村 GEOMETRY for the Meiji reconstruction: where only some pre-1889 villages (藩政村) of a 1920
 * 町村 changed side, the 1920 polygon is too coarse. The 大字 of today largely keep the 藩政村 lines,
 * and the one national, redistributable set of them is e-Stat's 国勢調査 小地域境界 (町丁・字等, 2020).
 *
 *   source   政府統計の総合窓口(e-Stat) 統計地理情報システム 境界データ
 *            «国勢調査 2020年 小地域（町丁・字等別）» shapefile, 世界測地系 緯度経度 (JGD2000), per
 *            municipality: https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=<5桁>&coordSys=1&format=shape&downloadType=5&datum=2000
 *            .dbf Shift_JIS; fields used: CITY_NAME, S_NAME (町丁・字等), HCODE (8101 = 町丁・字等,
 *            8154 = 水面調査区 — not land, skipped).
 *   licence  observed 2026-10-05 (quoted in LICENCE below): 統計GIS 機能利用規約 第６条 sends its contents
 *            to the e-Stat 利用規約, which is 政府標準利用規約（第2.0版） and CC BY 4.0 compatible.
 *
 *   modern municipality of a 1920 町村: point-in-polygon of points sampled inside the 1920 polygon against
 *            国土数値情報 N03 (2020-01-01) of the same modern prefecture (the N03-1920 file code is today's
 *            prefecture code). Every municipality a sample point falls in is downloaded — a 1920 村 may lie
 *            in two cities today.
 *
 * Caches (never in the repository): os.tmpdir()/intmap-histrecon-cache/{estat-2020,n03-2020}.
 * ========================================================================== */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pc from 'polygon-clipping';
import area from '@turf/area';
import { zipEntries, shapefileToGeoJSON } from '../lib/elections-geo.mjs';

const CACHE = join(tmpdir(), 'intmap-histrecon-cache');
const ESTAT = (code) => 'https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=' + code + '&coordSys=1&format=shape&downloadType=5&datum=2000';
const N03PAGE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2024.html';
const N03DATA = 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/';

export const LICENCE = {
  publisher: '政府統計の総合窓口(e-Stat) 統計地理情報システム 境界データ「国勢調査 2020年 小地域（町丁・字等別）」',
  url: 'https://www.e-stat.go.jp/gis/statmap-search?page=1&type=2&aggregateUnitForBoundary=A&toukeiCode=00200521&toukeiYear=2020&serveyId=A002005212020&coordsys=1&format=shape&datum=2000',
  terms: 'https://www.e-stat.go.jp/terms-of-use',
  gisTerms: 'https://www.e-stat.go.jp/gis-terms',
  observed: '2026-10-05',
  quotes: [
    '統計地理情報システム機能利用規約 第６条（コンテンツの利用）「本機能が提供する情報（以下「コンテンツ」という。）の利用条件等は、「政府統計の総合窓口（e-Stat）利用規約」に準じるものとします。」',
    '利用規約 ６）イ「本利用ルールは、平成２８年１月２９日に定めたものです。本利用ルールは、政府標準利用規約（第2.0版）に準拠しています。」',
    '利用規約 ６）ウ「本利用ルールは、クリエイティブ・コモンズ・ライセンスの表示 4.0 国際（https://creativecommons.org/licenses/by/4.0/legalcode.ja に規定される著作権利用許諾条件。以下「CC BY」といいます。）と互換性があり、本利用ルールが適用されるコンテンツはCC BYに従うことでも利用することができます。」',
    '利用規約 １）イ「コンテンツを編集・加工等して利用する場合は、上記出典とは別に、編集・加工等を行ったことを記載してください。」',
  ],
  citation: '出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）「国勢調査 2020年 小地域（町丁・字等別）境界データ」を加工して作成。',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cached(dir, name, url, log) {
  mkdirSync(join(CACHE, dir), { recursive: true });
  const f = join(CACHE, dir, name);
  if (existsSync(f)) return readFileSync(f);
  log('GET ' + url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(f, buf);
  await sleep(500);
  return buf;
}
const multi = (g) => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const bboxOf = (polys) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
export const inPolys = (polys, x, y) => {
  for (const p of polys) {
    let c = false;
    for (const r of p) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
    if (c) return true;
  }
  return false;
};
export const km2 = (polys) => polys.length ? area({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }) / 1e6 : 0;

/* ── modern municipalities (N03 2020-01-01) ─────────────────────────────────────────────── */
let n03Names = null;
const n03Memo = new Map();
async function n03Modern(prefCode, log) {
  if (n03Memo.has(prefCode)) return n03Memo.get(prefCode);
  if (!n03Names) {
    const html = (await cached('n03-2020', '_page.html', N03PAGE, log)).toString('utf8');
    n03Names = [...new Set([...html.matchAll(/N03-2020\/(N03-20200101_[0-9]{2}_GML\.zip)/g)].map((m) => m[1]))];
    if (n03Names.length < 47) throw new Error('expected 47 N03-2020 files on ' + N03PAGE + ', found ' + n03Names.length);
  }
  const name = n03Names.find((n) => n.includes('_' + prefCode + '_'));
  const buf = await cached('n03-2020', name, N03DATA + 'N03-2020/' + name, log);
  const ent = zipEntries(buf);
  const cpg = [...ent.keys()].find((k) => /\.cpg$/i.test(k));
  const enc = cpg && /utf-?8/i.test(ent.get(cpg).toString()) ? 'utf-8' : 'shift_jis';
  const fc = shapefileToGeoJSON(ent, { encoding: enc });
  const feats = fc.features.filter((f) => f.properties.N03_007).map((f) => { const polys = multi(f.geometry); return { code: f.properties.N03_007, name: (f.properties.N03_003 || '') + (f.properties.N03_004 || ''), polys, bbox: bboxOf(polys) }; });
  n03Memo.set(prefCode, feats);
  return feats;
}
/** Modern municipality codes a 1920 polygon lies in: sample a 31x31 grid of its bbox, keep points inside it. */
export async function modernCodesFor(coords, prefCode, { log = () => {} } = {}) {
  const feats = await n03Modern(prefCode, log);
  const [x0, y0, x1, y1] = bboxOf(coords);
  const hits = new Map();
  const N = 30;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = x0 + (x1 - x0) * (i + 0.5) / (N + 1), y = y0 + (y1 - y0) * (j + 0.5) / (N + 1);
    if (!inPolys(coords, x, y)) continue;
    const f = feats.find((g) => x >= g.bbox[0] && x <= g.bbox[2] && y >= g.bbox[1] && y <= g.bbox[3] && inPolys(g.polys, x, y));
    if (f) hits.set(f.code, { code: f.code, name: f.name, n: (hits.get(f.code)?.n || 0) + 1 });
  }
  /* a small 村 may get no grid point: fall back to its first vertex's nearest inside point (centroid-ish) */
  if (!hits.size) {
    const r = coords[0][0]; let sx = 0, sy = 0; for (const [x, y] of r) { sx += x; sy += y; }
    const x = sx / r.length, y = sy / r.length;
    const f = feats.find((g) => inPolys(g.polys, x, y));
    if (f) hits.set(f.code, { code: f.code, name: f.name, n: 1 });
  }
  return [...hits.values()];
}

/* ── e-Stat 小地域 ─────────────────────────────────────────────────────────────────────── */
const koazaMemo = new Map();
export async function koaza(code, { log = () => {} } = {}) {
  if (koazaMemo.has(code)) return koazaMemo.get(code);
  const buf = await cached('estat-2020', code + '.zip', ESTAT(code), log);
  const fc = shapefileToGeoJSON(zipEntries(buf), { encoding: 'shift_jis' });
  const feats = fc.features.map((f) => ({ code, city: f.properties.CITY_NAME, s: f.properties.S_NAME || '', hcode: f.properties.HCODE, key: f.properties.KEY_CODE, polys: multi(f.geometry) }));
  koazaMemo.set(code, feats);
  return feats;
}

/* ── name matching ──────────────────────────────────────────────────────────────────────────
   Variant glyphs are folded (one table, the common 旧字体/異体字 and the small ケ/ヶ/が of place names);
   nothing village-specific is listed here. */
const FOLD = [['ヶ', 'ケ'], ['ヵ', 'ケ'], ['が', 'ケ'], ['ガ', 'ケ'], ['槇', '槙'], ['澤', '沢'], ['嶋', '島'], ['邊', '辺'], ['邉', '辺'], ['條', '条'], ['舘', '館'], ['瀧', '滝'], ['廣', '広'], ['濱', '浜'], ['萬', '万'], ['塲', '場'], ['冨', '富'], ['淵', '渕'], ['之', 'ノ'], ['の', 'ノ']];
export const fold = (s) => { let t = String(s || ''); for (const [a, b] of FOLD) t = t.split(a).join(b); return t; };
/** The prefixes «prefixed» accepts: every 1920 町村 name of the prefecture, its stem, and stem + 町
 *  (a 村 that became a 町 before it was merged: 沖ノ島村 -> 沖の島町). */
export function prefixSet(names1920) {
  const s = new Set();
  for (const n of names1920) { const f = fold(n); s.add(f); const st = f.replace(/[町村]$/, ''); if (st.length >= 1) { s.add(st); s.add(st + '町'); } }
  return s;
}
/* «五明一丁目» -> «五明»; «大字吉田» -> «吉田» */
export const baseName = (s) => fold(String(s).replace(/^大字/, '').replace(/[0-9０-９〇一二三四五六七八九十百]+丁目$/, '').replace(/[0-9０-９]+番?地?$/, ''));
/* the stems a pre-1889 village name can carry as a 大字: the name, and the name without its settlement
   suffix (村/町/浦/新田/新村 — the suffix is dropped when 村 became 大字; 新田 often too) */
export function villageStems(v) {
  const n = fold(String(v).replace(/[（(][^）)]*[）)]/g, '').trim());
  const out = [{ s: n, how: 'name' }];
  for (const [re, how] of [[/村$/, 'without 村'], [/浦$/, 'without 浦'], [/町$/, 'without 町'], [/新田村$/, 'without 新田村'], [/新田$/, 'without 新田'], [/新村$/, 'without 新村']]) {
    if (re.test(n) && n.replace(re, '').length >= 1) out.push({ s: n.replace(re, ''), how });
  }
  return out;
}
/* A 町丁・字 name is «大字» or «大字 + 字» run together (五明町西亀具 = 五明町 + 西亀具), or a merged
   municipality's name prefixed to the old 大字 (祖父江町馬飼 = 祖父江町 + 馬飼). Heads: the name, and the
   part up to and including/excluding its first 町. */
function splits(s) {
  const b = baseName(s);
  const heads = new Set([b]);
  const k = b.indexOf('町');
  if (k > 0 && k < b.length - 1) { heads.add(b.slice(0, k)); heads.add(b.slice(0, k + 1)); }
  if (b.endsWith('町')) heads.add(b.slice(0, -1));
  /* «東加賀野井字江東» = 大字 東加賀野井 + 字 江東 */
  const j = b.indexOf('字');
  if (j > 0 && j < b.length - 1) heads.add(b.slice(0, j));
  return { b, heads };
}
/**
 * Locate pre-1889 villages inside one 1920 町村.
 *   level «exact»    a 大字 head equals the village name or one of its stems
 *   level «prefixed» the name is P + stem (+ a 字 run) with P = a former municipality name: a 1920 町村 name of
 *                    the same prefecture (with/without 町/村, `prefixes`), or a «family prefix» of the
 *                    downloaded city — a run ending in 町/村 that ≥ 3 distinct 町丁・字 names start with
 *                    (祖父江町馬飼寺東 = 祖父江町 + 馬飼 + 字 寺東; 富合町小岩瀬)
 *   «fuzzy»          the stem occurs elsewhere in the name — REPORTED, NOT USED
 * Only 町丁・字 whose area lies ≥ 50 % inside the 1920 polygon are candidates (a same-named 大字 in the
 * next town is not the village).
 */
export function matchVillages(villages, feats, muniCoords, prefixes) {
  const inside = [];
  for (const f of feats) {
    if (f.hcode !== 8101) continue;
    let inter;
    try { inter = clip("intersection", f.polys, muniCoords); } catch { continue; }
    const a = km2(f.polys), ai = km2(inter);
    if (a > 0 && ai / a >= 0.5) inside.push({ ...f, share: ai / a, sp: splits(f.s) });
  }
  /* family prefixes, discovered from the names themselves */
  const fam = new Map();
  for (const f of feats) { const b = baseName(f.s); for (let k = 2; k < b.length - 1; k++) if (b[k] === '町' || b[k] === '村') { const P = b.slice(0, k + 1); if (!fam.has(P)) fam.set(P, new Set()); fam.get(P).add(b); } }
  const pre = new Set(prefixes);
  for (const [P, s] of fam) if (s.size >= 3) pre.add(P);
  const res = [];
  for (const v of villages) {
    const stems = villageStems(v);
    const exact = inside.filter((f) => stems.some((st) => f.sp.heads.has(st.s)));
    let level = exact.length ? 'exact' : null, hits = exact;
    if (!hits.length) {
      /* P + stem (+ whatever 字 follows): P must be a former municipality name (1920 list or a family prefix) */
      hits = inside.filter((f) => stems.some((st) => { const i = f.sp.b.indexOf(st.s); return i > 0 && st.s.length >= 2 && pre.has(f.sp.b.slice(0, i)); }));
      if (hits.length) level = 'prefixed';
    }
    const fuzzy = hits.length ? [] : inside.filter((f) => stems.some((st) => st.s.length >= 2 && f.sp.b.includes(st.s))).map((f) => f.s);
    res.push({ village: v, level: level || (fuzzy.length ? 'fuzzy' : 'unmatched'), names: [...new Set(hits.map((f) => f.s))], feats: hits, fuzzy: [...new Set(fuzzy)], how: stems.map((s) => s.s) });
  }
  return { res, inside, insideCount: inside.length, insideNames: inside.map((f) => f.s) };
}

/* ── robust clipping ────────────────────────────────────────────────────────────────────────
   polygon-clipping's sweep line throws on nearly-coincident segments (observed: e-Stat 町丁・字 against
   N03-1920 町村 along a shared river line). Retry on coordinates snapped to 1e-6° (≈0.1 m) and then 1e-5°
   (≈1 m), dropping zero-width spikes; the snap is recorded so a report can say which pieces needed it. */
const snapRing = (r, f) => { const o = []; for (const [x, y] of r) { const p = [Math.round(x * f) / f, Math.round(y * f) / f]; const q = o[o.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) o.push(p); } if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0].slice()); return o.length >= 4 ? o : null; };
const despikeRing = (ring) => { let r = ring.slice(0, -1), again = true; while (again && r.length > 3) { again = false; for (let i = 0; i < r.length; i++) { const a = r[(i + r.length - 1) % r.length], c = r[(i + 1) % r.length]; if (a[0] === c[0] && a[1] === c[1]) { r.splice(i, 1); r.splice(i % r.length, 1); again = true; break; } } } r.push(r[0].slice()); return r.length >= 4 ? r : null; };
export const snap = (g, f) => g.map((p) => p.map((r) => snapRing(r, f)).filter(Boolean).map(despikeRing).filter(Boolean)).filter((p) => p.length);
export const snapLog = [];
export function clip(op, a, ...bs) {
  try { return pc[op](a, ...bs); } catch { /* retry */ }
  for (const f of [1e6, 1e5, 2e4]) {
    try { const r = pc[op](snap(a, f), ...bs.map((b) => snap(b, f))); snapLog.push(op + ' snapped to 1/' + f + '°'); return r; } catch { /* next */ }
  }
  throw new Error('polygon-clipping ' + op + ' failed even on 1/20000° snapped input');
}
