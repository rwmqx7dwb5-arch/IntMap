#!/usr/bin/env node
/* ============================================================================
 *  IntMap · SITING — Japan, by prefecture   (data/siting-jp.json)
 * ----------------------------------------------------------------------------
 *  産業立地の比較に要る実データを、公開された出典から 1 本にまとめる。**推定も補間もしない**: 出典が述べた数を
 *  都道府県（ISO 3166-2:JP）ごとに置き、出典が述べなかったところは null のまま残す。
 *
 *    power      JEPX（日本卸電力取引所）のスポット市場・エリアプライス（円/kWh）。最新の完結した年度の全コマ平均と昼間（8-18 時）平均。
 *               ⚠ 卸のエネルギー価格であって、需要家が払う料金（託送・賦課金を含む）ではない。県 → エリアの対応は供給区域の事実。
 *    land       国土数値情報 地価公示（L01）の標準地のうち、用途地域が工業系（工業・工業専用）または利用現況が工場のもの。
 *               県ごとの件数・中央値・最小・最大（円/㎡）と、標準地そのものの座標・価格。件数が少ない県は件数を併記する。
 *    labor      厚生労働省 地域別最低賃金（円/時・発効日つき）／総務省統計局 SSDSE-B の生産年齢人口・有効求人倍率。
 *    research   SSDSE-B の大学数・大学教員数・大学学生数（文部科学省 学校基本調査から）。
 *    regulation 工場立地法・同施行令（e-Gov 法令 API の条文）— 届出の規模要件と着工制限。国単位の規則で、県の値ではない。
 *    anchors    data/companies/footprint.json の日本の拠点を、県のポリゴン（Natural Earth admin-1）に落としたもの。足さない・推測しない。
 *
 *  ⚠ 空白（出典を見つけられず、載せていない次元）は `gaps` に理由つきで残す。工業用水・物流は現時点で載せていない。
 *    ダムデータ（国土数値情報 W01）は非商用に限られるため使っていない。METI 経済構造実態調査の Excel は WAF の確認を求めるので機械では取らない。
 *
 *  USAGE   node scripts/build-siting-jp.mjs              取得して data/siting-jp.json を書く
 *          node scripts/build-siting-jp.mjs --check      取得して、同梱の出典値と一致するか比べる（network）
 *  EXPIRES 出典の URL か列構成が変われば、各 parse が理由つきで落ちる（黙って別の値を書かない）。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { SITING_JP } from './lib/upstream-cadence.mjs';
import { agreeOrRefuse } from './lib/gov-stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'siting-jp.json');
const UA = 'IntMapDataBuild/1.0 (+https://github.com/rwmqx7dwb5-arch/IntMap)';

/* 出自は値である（check:datagov が読む）。上流が述べていることだけを書く。 */
export const GOVERNANCE = {
  'data/siting-jp.json': {
    upstreams: [
      { publisher: 'Japan Electric Power Exchange (JEPX) — spot market results', url: 'https://www.jepx.jp/electricpower/market-data/spot/', licence: 'JEPX terms of use (data published for public reference; source credit required)', attribution: true,
        paidBy: 'JEPX spot market area prices (Japan Electric Power Exchange)', fields: 'half-hourly area prices (JPY/kWh) for the nine mainland price areas, one fiscal year' },
      { publisher: 'MLIT Japan — National Land Numerical Information, Land Price Public Announcement (L01)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-2026.html', licence: 'Public Data License 1.0 (PDL1.0, compatible with CC BY 4.0)', attribution: true,
        paidBy: 'National Land Numerical Information — Land Price Public Announcement (MLIT Japan)', fields: 'standard-parcel price per square metre, zoning class, current use, coordinates' },
      { publisher: 'Ministry of Health, Labour and Welfare Japan — regional minimum wages', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/', licence: 'Government Standard Terms of Use (compatible with CC BY 4.0)', attribution: true,
        paidBy: 'Regional minimum wages (Ministry of Health, Labour and Welfare, Japan)',
        fields: 'prefectural minimum wage (JPY/hour) and effective date, by fiscal year' },
      { publisher: 'Statistics Bureau of Japan / NSTAC — SSDSE-B (Standardized Statistical Data Set for Education)', url: 'https://www.nstac.go.jp/use/literacy/ssdse/', licence: 'Government Standard Terms of Use (compatible with CC BY 4.0)', attribution: true,
        paidBy: 'SSDSE-B Standardized Statistical Data Set (Statistics Bureau of Japan / NSTAC)',
        fields: 'working-age population, active job openings and applicants, university counts, faculty and students, by prefecture' },
      { publisher: 'Digital Agency Japan — e-Gov Laws API', url: 'https://laws.e-gov.go.jp/', licence: 'Government Standard Terms of Use (statute text)', attribution: true,
        paidBy: 'e-Gov Laws API — Factory Location Act (Digital Agency, Japan)',
        fields: 'article text of the Factory Location Act and its Cabinet Order' },
    ],
    priority: { disjoint: ['electricity price (JEPX)', 'industrial land price (MLIT L01)', 'minimum wage (MHLW)', 'workforce and universities (SSDSE-B)', 'rules (e-Gov)'] },
    /* the file as a whole: every upstream is credited, and each states its own terms above */
    publisher: 'JEPX · MLIT Japan · MHLW Japan · Statistics Bureau of Japan (NSTAC) · Digital Agency Japan',
    url: 'https://www.jepx.jp/electricpower/market-data/spot/',
    licence: 'Each value keeps its source licence: PDL 1.0, Government Standard Terms of Use, JEPX terms of use',
    licenceUrl: 'https://www.digital.go.jp/resources/open_data/public_data_license_v1.0',
    attribution: true,
    paidBy: 'JEPX spot market area prices (Japan Electric Power Exchange)',
    ...SITING_JP, builtBy: 'scripts/build-siting-jp.mjs',
    /* ⚠ LITERALS THE GATE CAN READ WITHOUT RUNNING THIS FILE; build() refuses to write a bundle that disagrees (scripts/lib/gov-stamp.mjs).
       asOf is the day the upstreams were read; each metric carries its own vintage in metrics[].vintage. */
    retrievedAt: '2026-11-20',
    generatedAt: '2026-11-20',
    asOf: '2026-11-20',
    /* measured on areas[]: key id (ISO 3166-2:JP); every one has a name */
    quality: { rows: 47, missing: { id: 0, name: 0, nameLocal: 0 }, outOfRange: {}, duplicates: 0 },
    schema: 'scripts/build-siting-jp.mjs (areas: id name nameLocal m{metric} ...; sites; anchors) — read by js/siting.js and js/atlas-cap-siting.js; tests/siting-checks.test.mjs' },
};

/* ── 取得 ───────────────────────────────────────────────────────────────── */
async function get(url, tries = 3) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(180000) });
      if (r.status === 200) return Buffer.from(await r.arrayBuffer());
      last = 'HTTP ' + r.status;
    } catch (e) { last = String(e && e.message || e); }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error('fetch failed: ' + url + ' — ' + last);
}
const sjis = (b) => new TextDecoder('shift_jis').decode(b);

/* zip の中の 1 ファイル（名前の末尾で選ぶ）。中央ディレクトリを読み、deflate だけを展開する。 */
function unzipOne(buf, endsWith) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    if (name.endsWith(endsWith)) {
      const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
      const data = buf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
      if (method === 8) return zlib.inflateRawSync(data);
      if (method === 0) return data;
      throw new Error('zip method ' + method);
    }
    p += 46 + nl + el + cl;
  }
  throw new Error('no ' + endsWith + ' in zip');
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r2 = (x) => Math.round(x * 100) / 100;
const pc = (n) => String(n).padStart(2, '0');

/* 県 → 電力エリア。電力会社の供給区域（OCCTO・各社）に拠る事実。静岡は東西で周波数と事業者が分かれる（富士川の東は東京電力）ので主たるエリアに置き split を立てる。
   沖縄電力は JEPX のエリアではない（スポットのエリアプライスが無い）ので null。 */
const AREA_OF = {
  hokkaido: [1], tohoku: [2, 3, 4, 5, 6, 7, 15], tokyo: [8, 9, 10, 11, 12, 13, 14, 19], chubu: [20, 21, 22, 23, 24],
  hokuriku: [16, 17], kansai: [18, 25, 26, 27, 28, 29, 30], chugoku: [31, 32, 33, 34, 35], shikoku: [36, 37, 38, 39], kyushu: [40, 41, 42, 43, 44, 45, 46],
};
const AREA_COL = { hokkaido: 6, tohoku: 7, tokyo: 8, chubu: 9, hokuriku: 10, kansai: 11, chugoku: 12, shikoku: 13, kyushu: 14 };
const SPLIT = { 22: 'Shizuoka is split along the Fuji River: the east is served by Tokyo Electric Power, the rest by Chubu Electric Power. The Chubu price is shown.' };

/* ── power: JEPX ────────────────────────────────────────────────────────── */
async function power() {
  const now = new Date();
  const fy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = fy; y >= fy - 2; y--) {
    let buf;
    try { buf = await get('https://www.jepx.jp/market/excel/spot_' + y + '.csv', 2); } catch { continue; }
    const rows = sjis(buf).split(/\r?\n/).slice(1).filter((l) => /^\d{4}\/\d\d\/\d\d,/.test(l)).map((l) => l.split(','));
    if (rows.length < 17000) continue;   // 48 コマ × 365 日 = 17,520。完結していない年度は使わない
    const out = {};
    for (const [a, col] of Object.entries(AREA_COL)) {
      const all = [], day = [];
      for (const r of rows) {
        const v = parseFloat(r[col]); if (!isFinite(v)) continue;
        all.push(v); const slot = +r[1]; if (slot >= 17 && slot <= 36) day.push(v);   // コマ 17-36 = 8:00-18:00
      }
      out[a] = { avg: r2(all.reduce((s, v) => s + v, 0) / all.length), day: r2(day.reduce((s, v) => s + v, 0) / day.length), slots: all.length };
    }
    return { fy: y, from: rows[0][0].replace(/\//g, '-'), to: rows[rows.length - 1][0].replace(/\//g, '-'), area: out, url: 'https://www.jepx.jp/market/excel/spot_' + y + '.csv' };
  }
  throw new Error('JEPX: no complete fiscal-year file found');
}

/* ── land: 国土数値情報 L01 ─────────────────────────────────────────────── */
async function land() {
  let zip, year = 0;
  for (let y = new Date().getUTCFullYear() - 2000; y >= new Date().getUTCFullYear() - 2002; y--) {
    try { zip = await get('https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-' + y + '/L01-' + y + '_GML.zip', 1); year = 2000 + y; break; } catch { /* 前の年版へ */ }
  }
  if (!zip) throw new Error('L01: no edition found');
  const j = JSON.parse(unzipOne(zip, '.geojson').toString('utf8'));
  const byPref = {}, sites = [], names = {};
  for (const f of j.features) {
    const p = f.properties, code = String(p.L01_004 || ''), price = +p.L01_008;
    if (!/^\d{5}$/.test(code) || !isFinite(price) || price <= 0) continue;
    const pref = code.slice(0, 2);
    if (!names[pref]) names[pref] = String(p.L01_025 || '').split(/[\s　]/)[0];
    const zone = String(p.L01_051 || ''), use = String(p.L01_028 || '');
    const industrial = zone === '工業' || zone === '工専' || /工場/.test(use);
    if (!industrial) continue;
    (byPref[pref] = byPref[pref] || []).push(price);
    sites.push([pref, code, +f.geometry.coordinates[0].toFixed(5), +f.geometry.coordinates[1].toFixed(5), price, zone === '_' ? '' : zone, use, String(p.L01_024 || '')]);
  }
  return { year, byPref, sites, names, total: j.features.length };
}

/* ── labor: 地域別最低賃金 ──────────────────────────────────────────────── */
async function minWage() {
  const page = (await get('https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/')).toString('utf8');
  const links = [...page.matchAll(/href="(\/content\/11200000\/\d+\.xlsx)"/g)].map((m) => 'https://www.mhlw.go.jp' + m[1]);
  const X = createRequire(import.meta.url)('xlsx');
  for (const u of links) {
    const wb = X.read(await get(u), { type: 'buffer' });
    const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    if (!rows[0] || rows[0][0] !== '年度' || !rows[1] || rows[1][0] !== '都道府県名') continue;   // 改定状況の表だけ（セルフチェックシートではない）
    const yc = []; rows[0].forEach((v, i) => { if (typeof v === 'string' && /年度$/.test(v)) yc.push([v, i]); });
    const serial = (n) => (typeof n === 'number' && isFinite(n) ? new Date((n - 25569) * 86400000).toISOString().slice(0, 10) : null);
    const today = new Date().toISOString().slice(0, 10);
    const out = {};
    for (const r of rows.slice(2)) {
      const nm = String(r[0] || '').replace(/[\s　]/g, ''); if (!nm || /全国/.test(nm)) continue;   // 全国加重平均額の行は県ではない
      /* 発効日が今日以前の最新の改定を「いま有効な最低賃金」とする。令和8年度の改定は県ごとに発効日が違い、まだ発効していない県がある。 */
      const rev = yc.map(([lab, c]) => ({ lab, wage: r[c], from: serial(r[c + 1]) })).filter((x) => typeof x.wage === 'number' && x.from);
      const inForce = rev.filter((x) => x.from <= today).pop(), idx = rev.indexOf(inForce), prev = idx > 0 ? rev[idx - 1] : null, next = rev[idx + 1] || null;
      if (!inForce) continue;
      out[nm] = { wage: inForce.wage, from: inForce.from, year: inForce.lab, prev: prev ? prev.wage : null, prevFrom: prev ? prev.from : null, next: next ? { wage: next.wage, from: next.from } : null };
    }
    if (Object.keys(out).length !== 47) throw new Error('minimum wage: expected 47 prefectures, got ' + Object.keys(out).length);
    return { year: yc[yc.length - 1][0], byName: out, url: u };
  }
  throw new Error('minimum wage: revision table not found on the MHLW page');
}

/* ── labor/research: SSDSE-B ────────────────────────────────────────────── */
async function ssdse() {
  const page = (await get('https://www.nstac.go.jp/use/literacy/ssdse/')).toString('utf8');
  const m = /files\/(SSDSE-B-(\d{4})\.csv)/.exec(page); if (!m) throw new Error('SSDSE-B csv link not found');
  const lines = sjis(await get('https://www.nstac.go.jp/files/' + m[1])).split(/\r?\n/);
  const codes = lines[0].split(','), labels = lines[1].split(',');
  const col = (c) => { const i = codes.indexOf(c); if (i < 0) throw new Error('SSDSE-B column ' + c + ' missing (' + labels.length + ' columns)'); return i; };
  const ix = { pop: col('A1101'), work: col('A1302'), seekers: col('F3102'), openings: col('F3103'), univ: col('E6102'), faculty: col('E6202'), students: col('E6302') };
  const latest = {};
  for (const l of lines.slice(2)) {
    const c = l.split(','); if (c.length < codes.length - 1 || !/^R\d{5}$/.test(c[1])) continue;
    const pref = c[1].slice(1, 3), y = +c[0];
    if (!latest[pref] || y > latest[pref].y) latest[pref] = { y, c };
  }
  const out = {};
  for (const [pref, { y, c }] of Object.entries(latest)) {
    const n = (k) => { const v = parseFloat(c[ix[k]]); return isFinite(v) ? v : null; };
    out[pref] = { year: y, pop: n('pop'), work: n('work'), seekers: n('seekers'), openings: n('openings'), univ: n('univ'), faculty: n('faculty'), students: n('students') };
  }
  return { edition: m[2], byPref: out, url: 'https://www.nstac.go.jp/files/' + m[1] };
}

/* ── regulation: e-Gov ──────────────────────────────────────────────────── */
function flat(n, o = []) { if (n == null) return o; if (typeof n === 'string') { o.push(n); return o; } if (Array.isArray(n)) { n.forEach((x) => flat(x, o)); return o; } if (n.children) flat(n.children, o); return o; }
async function rules() {
  const law = async (id) => JSON.parse((await get('https://laws.e-gov.go.jp/api/2/law_data/' + id + '?response_format=json')).toString('utf8'));
  const [act, order] = [await law('334AC0000000024'), await law('349CO0000000029')];
  const at = flat(act.law_full_text).join(''), ot = flat(order.law_full_text).join('');
  const pick = (t, from, len) => { const i = t.indexOf(from); if (i < 0) throw new Error('e-Gov: «' + from + '» not found — the statute changed; re-read the rules'); return t.slice(i, i + len); };
  const a11 = pick(at, '第十一条第六条第一項の規定による届出をした者', 150);
  const o2 = pick(ot, '第二条法第六条第一項の政令で定める規模は', 90);
  if (!/九十日/.test(a11) || !/九千平方メートル/.test(o2) || !/三千平方メートル/.test(o2)) throw new Error('e-Gov: the figures in the statute no longer match what this builder reports');
  return [
    { id: 'notify-size', ref: '工場立地法施行令 第2条 / Factory Location Act Cabinet Order, Art. 2', lawId: '349CO0000000029', text: o2,
      en: 'A plant that must be notified to the municipality (a «specific factory») is one on a site of 9,000 m² or more, or with 3,000 m² or more of total building footprint.' },
    { id: 'wait-90', ref: '工場立地法 第11条 / Factory Location Act, Art. 11', lawId: '334AC0000000024', text: a11,
      en: 'Construction may not start until 90 days after the notification is accepted; the mayor may shorten the period when the content is found appropriate.' },
  ].map((r) => ({ ...r, dimension: 'regulation', revision: r.lawId === '334AC0000000024' ? act.revision_info.amendment_enforcement_date : order.revision_info.amendment_enforcement_date }));
}

/* ── anchors: 企業の拠点を県へ ──────────────────────────────────────────── */
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function inPoly(x, y, g) { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h))); }
function distToRing(x, y, ring) { let d = Infinity; for (const [px, py] of ring) d = Math.min(d, (px - x) ** 2 + (py - y) ** 2); return Math.sqrt(d); }
export function prefecturesOf(rows) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  const units = j.f.filter((f) => f.i === 'JPN').map((f) => ({ iso: f.n.split('|').find((x) => /^JP-[0-9]{2}$/.test(x)), en: f.n.split('|')[0], g: f.g }));
  return rows.map(([lon, lat]) => {
    const hit = units.find((u) => inPoly(lon, lat, u.g));
    if (hit) return { iso: hit.iso, how: 'polygon' };
    let best = null, bd = Infinity;   // 海岸で簡略化された輪郭の外に落ちた点だけ、最寄りの県へ（0.1° 以内に限る）
    for (const u of units) for (const p of u.g.type === 'Polygon' ? [u.g.coordinates] : u.g.coordinates) { const d = distToRing(lon, lat, p[0]); if (d < bd) { bd = d; best = u; } }
    return bd <= 0.1 ? { iso: best.iso, how: 'nearest' } : { iso: null, how: 'none' };
  });
}
function anchors() {
  const fp = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'footprint.json'), 'utf8'));
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'companies', 'index.json'), 'utf8')).companies;
  const sec = Object.fromEntries(idx.map((c) => [c.id, c.sec]));
  const rows = fp.f.filter((r) => r[4] === 'JPN');
  const pref = prefecturesOf(rows.map((r) => [r[2], r[3]]));
  const out = [];
  rows.forEach((r, i) => { if (pref[i].iso) out.push({ iso: pref[i].iso, company: fp.companies[r[0]], sector: sec[fp.companies[r[0]]] || null, type: fp.types[r[1]], lon: r[2], lat: r[3], precision: r[5], name: r[7] }); });
  return { out, total: rows.length, placed: out.length, polygonUnits: new Set(out.map((a) => a.iso)).size };
}

/* ── 組み立て ───────────────────────────────────────────────────────────── */
export async function build() {
  const [pw, ld, mw, ss, rl] = await Promise.all([power(), land(), minWage(), ssdse(), rules()]);
  const an = anchors();
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  const en = Object.fromEntries(j.f.filter((f) => f.i === 'JPN').map((f) => [f.n.split('|').find((x) => /^JP-[0-9]{2}$/.test(x)).slice(3), f.n.split('|')[0]]));
  const areaOfPref = {}; for (const [a, ps] of Object.entries(AREA_OF)) for (const p of ps) areaOfPref[pc(p)] = a;
  const stripped = (s) => s.replace(/[都府県]$/, '');
  const areas = [];
  for (let p = 1; p <= 47; p++) {
    const code = pc(p), ja = ld.names[code];
    if (!ja) throw new Error('prefecture ' + code + ' has no name in the land price edition');
    const pa = areaOfPref[code] || null, pa2 = pa ? pw.area[pa] : null;
    const w = mw.byName[stripped(ja)] || mw.byName[ja]; if (!w) throw new Error('minimum wage row for ' + ja + ' not found');
    const s = ss.byPref[code]; if (!s) throw new Error('SSDSE-B row for ' + code + ' not found');
    const lp = ld.byPref[code] || [];
    areas.push({
      id: 'JP-' + code, name: en[code] || ja, nameLocal: ja, powerArea: pa,
      ...(SPLIT[p] ? { note: SPLIT[p] } : {}),
      m: {
        power_spot_avg: pa2 ? pa2.avg : null, power_spot_day: pa2 ? pa2.day : null,
        land_ind_median: lp.length ? Math.round(median(lp)) : null, land_ind_min: lp.length ? Math.min(...lp) : null, land_ind_max: lp.length ? Math.max(...lp) : null, land_ind_n: lp.length,
        labor_min_wage: w.wage, labor_min_wage_prev: w.prev,
        labor_working_age: s.work, labor_openings_ratio: s.seekers ? r2(s.openings / s.seekers) : null, pop_total: s.pop,
        research_universities: s.univ, research_faculty: s.faculty, research_students: s.students,
      },
      effective: { labor_min_wage: w.from }, ...(w.next ? { pending: { labor_min_wage: w.next } } : {}),
    });
  }
  const metrics = {
    power_spot_avg: { dimension: 'power', unit: 'JPY/kWh', better: 'lower', source: 'jepx', vintage: 'FY' + pw.fy + ' (' + pw.from + ' to ' + pw.to + ')', label: { en: 'Wholesale electricity price, annual mean (JEPX spot, price area)', jp: '卸電力価格 年度平均（JEPX スポット・エリアプライス）' }, note: 'Wholesale energy price of the price area, not the tariff a plant pays (network charges and levies are not included).' },
    power_spot_day: { dimension: 'power', unit: 'JPY/kWh', better: 'lower', source: 'jepx', vintage: 'FY' + pw.fy, label: { en: 'Wholesale electricity price, daytime mean 08:00-18:00', jp: '卸電力価格 昼間平均（8-18 時）' }, note: 'Same as above, half-hour slots 17 to 36 only.' },
    land_ind_median: { dimension: 'land', unit: 'JPY/m2', better: 'lower', source: 'mlit-l01', vintage: 'Land Price Public Announcement ' + ld.year, label: { en: 'Industrial land price, median of announced parcels', jp: '工業系の地価 公示地の中央値' }, note: 'Parcels in an industrial or exclusively-industrial zone, or currently used as a factory. Read land_ind_n: some prefectures have only a few.' },
    land_ind_min: { dimension: 'land', unit: 'JPY/m2', better: 'lower', source: 'mlit-l01', vintage: 'Land Price Public Announcement ' + ld.year, label: { en: 'Industrial land price, lowest announced parcel', jp: '工業系の地価 最小' } },
    land_ind_max: { dimension: 'land', unit: 'JPY/m2', better: 'lower', source: 'mlit-l01', vintage: 'Land Price Public Announcement ' + ld.year, label: { en: 'Industrial land price, highest announced parcel', jp: '工業系の地価 最大' } },
    land_ind_n: { dimension: 'land', unit: 'parcels', better: 'higher', source: 'mlit-l01', vintage: 'Land Price Public Announcement ' + ld.year, label: { en: 'Industrial parcels announced (sample size)', jp: '工業系の公示地の数（標本数）' } },
    labor_min_wage: { dimension: 'labor', unit: 'JPY/hour', better: 'lower', source: 'mhlw-minwage', vintage: 'in force on ' + new Date().toISOString().slice(0, 10) + ' (effective date per prefecture)', label: { en: 'Regional minimum wage', jp: '地域別最低賃金' }, note: 'A floor on pay, not the market wage for engineers.' },
    labor_min_wage_prev: { dimension: 'labor', unit: 'JPY/hour', better: 'lower', source: 'mhlw-minwage', vintage: 'the revision before the one in force', label: { en: 'Regional minimum wage, previous year', jp: '地域別最低賃金（前年度）' } },
    labor_working_age: { dimension: 'labor', unit: 'persons', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition + ', ' + Math.max(...Object.values(ss.byPref).map((v) => v.year)), label: { en: 'Population aged 15-64', jp: '15～64歳人口' } },
    labor_openings_ratio: { dimension: 'labor', unit: 'ratio', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition, label: { en: 'Active job openings per active applicant (general)', jp: '有効求人倍率（一般）' }, note: 'A higher ratio means tighter labour supply; it is competition for workers, not capacity.' },
    pop_total: { dimension: 'labor', unit: 'persons', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition, label: { en: 'Total population', jp: '総人口' } },
    research_universities: { dimension: 'research', unit: 'institutions', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition, label: { en: 'Universities', jp: '大学数' } },
    research_faculty: { dimension: 'research', unit: 'persons', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition, label: { en: 'University faculty', jp: '大学教員数' } },
    research_students: { dimension: 'research', unit: 'persons', better: 'higher', source: 'ssdse-b', vintage: 'SSDSE-B ' + ss.edition, label: { en: 'University students', jp: '大学学生数' } },
  };
  const sources = {
    jepx: { name: 'Japan Electric Power Exchange — spot market results', url: pw.url, licence: 'JEPX terms of use' },
    'mlit-l01': { name: 'MLIT National Land Numerical Information — Land Price Public Announcement ' + ld.year + ' (L01)', url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L01-' + ld.year + '.html', licence: 'PDL1.0' },
    'mhlw-minwage': { name: 'MHLW — regional minimum wages (revision table H14 to R8)', url: mw.url, licence: 'Government Standard Terms of Use' },
    'ssdse-b': { name: 'Statistics Bureau of Japan / NSTAC — SSDSE-B ' + ss.edition, url: ss.url, licence: 'Government Standard Terms of Use' },
    egov: { name: 'e-Gov Laws API — Factory Location Act and Cabinet Order', url: 'https://laws.e-gov.go.jp/', licence: 'Government Standard Terms of Use' },
  };
  const gaps = [
    { dimension: 'water', reason: 'No commercially usable open source for prefecture-level industrial water was reachable: the MLIT dam data (W01) is non-commercial only, and the METI Census of Manufacture workbooks sit behind a bot challenge that is not bypassed.' },
    { dimension: 'logistics', reason: 'Not loaded yet for Japan (ports, airports and trunk roads exist as map layers but are not joined to the prefecture table).' },
    { dimension: 'power', reason: 'Okinawa is not a JEPX price area, so it has no price. Retail industrial tariffs (high-voltage contract rates) are not published as open data per prefecture.' },
  ];
  const g = agreeOrRefuse(GOVERNANCE['data/siting-jp.json'], areas, { fields: { id: {}, name: {}, nameLocal: {} }, key: ['id'] }, new Date().toISOString().slice(0, 10));
  const data = {
    ...g, schema: 1, country: 'JP', iso3: 'JPN',
    src: 'JEPX spot area prices; MLIT National Land Numerical Information L01; MHLW minimum wages; Statistics Bureau SSDSE-B; e-Gov statutes; IntMap company footprint',
    metrics, sources, gaps, rules: rl,
    areas,
    sites: { cols: ['pref', 'city', 'lon', 'lat', 'jpy_m2', 'zone', 'use', 'name'], rows: ld.sites },
    anchors: an.out,
    coverage: { landParcelsTotal: ld.total, landParcelsIndustrial: ld.sites.length, anchorsPlaced: an.placed, anchorsJapan: an.total },
  };
  return data;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const check = process.argv.includes('--check');
  const data = await build();
  const text = JSON.stringify(data);
  if (check) {
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const same = JSON.stringify({ ...old, generatedAt: 0 }) === JSON.stringify({ ...data, generatedAt: 0 });
    console.log(same ? 'siting/jp.json matches upstream' : 'siting/jp.json differs from upstream (rebuild)');
    process.exit(same ? 0 : 1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log('wrote', path.relative(ROOT, OUT), (text.length / 1024).toFixed(1) + ' KB', '·', data.areas.length, 'prefectures ·', data.sites.rows.length, 'industrial parcels ·', data.anchors.length, 'anchors');
}
