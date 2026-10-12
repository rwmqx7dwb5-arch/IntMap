#!/usr/bin/env node
/* ============================================================================
 *  scripts/field-speed.mjs — HOW LONG READERS WAIT, BY RELEASE, AND WHETHER A RELEASE MADE IT WORSE   (field-speed)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-13, BEFORE THIS FILE. Every speed instrument IntMap had was a LAB instrument:
 *    · check:perf / check:assets — the bytes a start-up downloads, against ceilings (tests/perf-baseline.json);
 *    · scripts/frame-profile.mjs --boot — one phone profile, on the machine that runs it.
 *  None of them is a reader. A release could pass every ceiling and still make the map slower to become
 *  usable on the phones people actually hold (a long task, a request that waits on another, a CDN), and
 *  nothing would ever say so — the only witness was a reader who gave up.
 *
 *  NOW: every page load counts, once and anonymously, the range its wait fell in and how its launch screen
 *  lifted, under the release it was (supabase/functions/usage-count/shape.js `ready` / `boot_end`, through
 *  the anonymous counter's own consent rules). The database publishes one reading of those counts —
 *  public.field_speed(p_days): per release and device, SHARES and a band, never a count
 *  (supabase/migrations/20261013130000_field_speed.sql). This file is that reading's one reader:
 *
 *    PURE   summarise(rows) — the releases, newest first, each device's shares, its median and 3-in-4
 *           wait as a bucket edge, the share of loads whose map settled (`idle`);
 *           judge(releases) — whether the newest well-measured release is slower (or less reliable) than
 *           the well-measured release before it, per device;
 *           sentences() — the status page's rows in en and jp (the page renders them as they are);
 *           line(fs) — the one line `worktree.mjs status` prints.
 *    FETCH  fetchFieldSpeed() — the public endpoint, with the publishable key read from src/vendor.js
 *           (where the page has it — not restated), paged, with a deadline; null and a reason on failure.
 *  Readers: scripts/build-service-status.mjs (data/service-status.json → the status page «IntMap, now»,
 *  Atlas `system.speed`), scripts/worktree.mjs.
 *
 *  ⚠ WHAT IS NOT SAID. A share is of the page loads the counter heard — readers with Do Not Track, Global
 *  Privacy Control or the setting off are not in it, and neither is a page that started hidden. A release
 *  with fewer than 30 page loads is not published at all. A verdict needs two releases with 300+ page loads
 *  each; without them the answer is «not judged» and says why — never «same».
 *
 *      node scripts/field-speed.mjs            the releases and the verdict
 *      node scripts/field-speed.mjs --json     the same as JSON (what build-service-status.mjs stores)
 *      node scripts/field-speed.mjs --days 30  a wider window (1–90; the database clamps it)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOT_BUCKETS, BOOT_ENDINGS, BOOT_EDGES_MS } from '../supabase/functions/usage-count/shape.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DAYS = 14;

/* ══ THE VERDICT'S TWO NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4) ═══════════════════════════
   JUDGE_BANDS — a release is compared only when the database put it in one of these bands (≥ 300 page
     loads). At 300 per side the standard error of the DIFFERENCE of two shares near one half is
     sqrt(2·0.25/300) ≈ 4.1 points, so…
   SHIFT_POINTS — …a move of 10 points is ≈ 2.4 standard errors: a change in the release, not the draw.
     Ten points is also what a reader notices: one in ten of them now waits a bucket longer.
   EXPIRES: if the bands field_speed() returns change (they are its CASE), or if traffic makes 3000+ the
   usual band — then a smaller shift is measurable and this threshold hides real regressions.
   CANON: here; the migration's band edges are the database's. */
export const JUDGE_BANDS = Object.freeze(['300+', '1000+', '3000+', '10000+']);
export const SHIFT_POINTS = 10;

/** «202610121710-6830fff» → { at: '2026-10-12T17:10:00Z', sha: '6830fff' } (null when it is not a release) */
export function releaseParts(rel) {
  const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)-([0-9a-f]{7,12})$/.exec(String(rel || ''));
  return m ? { at: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`, sha: m[6] } : null;
}

/** the smallest bucket whose cumulative share reaches q (0–1) — its label, or null with no shares */
export function quantileBucket(shares, q) {
  let acc = 0, any = false;
  for (const b of BOOT_BUCKETS) {
    const s = Number(shares && shares[b]) || 0;
    if (s > 0) any = true;
    acc += s;
    if (acc >= q * 100 - 1e-9) return b;
  }
  return any ? 'late' : null;
}
/** the share (0–100) of loads at or under a bucket */
export function shareWithin(shares, bucket) {
  let acc = 0;
  for (const b of BOOT_BUCKETS) { acc += Number(shares && shares[b]) || 0; if (b === bucket) break; }
  return Math.round(acc * 10) / 10;
}

/**
 * field_speed() rows → releases, newest first:
 *   [{ release, at, sha, devices: { mobile?: { loads, buckets:{label:share}, p50, p75, idle, endings:{…} }, desktop?: … } }]
 * A device appears only with its `ready` shares (the endings alone say nothing about the wait).
 */
export function summarise(rows) {
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const parts = releaseParts(r && r.release);
    if (!parts || (r.device !== 'mobile' && r.device !== 'desktop')) continue;
    const share = Number(r.share);
    if (!Number.isFinite(share)) continue;
    if (!by.has(r.release)) by.set(r.release, { release: r.release, ...parts, devices: {} });
    const rel = by.get(r.release);
    const d = rel.devices[r.device] || (rel.devices[r.device] = { loads: null, buckets: {}, endings: {} });
    if (r.metric === 'ready' && BOOT_BUCKETS.includes(r.bucket)) { d.buckets[r.bucket] = share; d.loads = r.loads || d.loads; }
    else if (r.metric === 'boot_end' && BOOT_ENDINGS.includes(r.bucket)) d.endings[r.bucket] = share;
  }
  const out = [];
  for (const rel of by.values()) {
    for (const k of Object.keys(rel.devices)) {
      const d = rel.devices[k];
      if (!Object.keys(d.buckets).length) { delete rel.devices[k]; continue; }
      d.p50 = quantileBucket(d.buckets, 0.5);
      d.p75 = quantileBucket(d.buckets, 0.75);
      d.idle = Object.keys(d.endings).length ? (d.endings.idle || 0) : null;
    }
    if (Object.keys(rel.devices).length) out.push(rel);
  }
  return out.sort((a, b) => b.release.localeCompare(a.release));
}

/**
 * Per device: the newest release measured well enough (JUDGE_BANDS) against the one before it.
 *   state 'slower'      — fewer of the newer release's loads were usable within the older one's 3-in-4 wait
 *                         (by SHIFT_POINTS or more)
 *         'faster'      — more of them were, by as much
 *         'less-reliable' — the wait did not move, but fewer launch screens lifted on a settled map
 *         'same'        — neither moved by SHIFT_POINTS
 *         'unjudged'    — fewer than two releases measured well enough (`why` says so)
 */
export function judge(releases) {
  const out = {};
  for (const dev of ['mobile', 'desktop']) {
    const well = (releases || []).filter((r) => r.devices[dev] && JUDGE_BANDS.includes(r.devices[dev].loads));
    if (well.length < 2) {
      out[dev] = { state: 'unjudged', why: well.length ? 'only one release has 300+ page loads in the window' : 'no release has 300+ page loads in the window' };
      continue;
    }
    const [n, o] = well, N = n.devices[dev], O = o.devices[dev];
    const edge = O.p75;
    const now = shareWithin(N.buckets, edge), was = shareWithin(O.buckets, edge);
    const base = { newer: n.release, older: o.release, edge, now, was };
    if (was - now >= SHIFT_POINTS) out[dev] = { state: 'slower', ...base };
    else if (now - was >= SHIFT_POINTS) out[dev] = { state: 'faster', ...base };
    else if (N.idle != null && O.idle != null && O.idle - N.idle >= SHIFT_POINTS) out[dev] = { state: 'less-reliable', ...base, idleNow: N.idle, idleWas: O.idle };
    else out[dev] = { state: 'same', ...base };
  }
  return out;
}

/* ── the endpoint ──────────────────────────────────────────────────────────────────────────── */

/** the project URL and publishable key, read from where the page has them (src/vendor.js) */
export function endpointOf(root = ROOT) {
  let src = '';
  try { src = fs.readFileSync(path.join(root, 'src/vendor.js'), 'utf8'); } catch { return null; }
  const url = /window\.SUPABASE_URL\s*=\s*'([^']+)'/.exec(src);
  const key = /window\.SUPABASE_ANON_KEY\s*=\s*'([^']+)'/.exec(src);
  return url && key ? { url: url[1].replace(/\/$/, ''), key: key[1] } : null;
}

/* PAGE: PostgREST answers at most its max-rows per request (1000 on Supabase); the reading is paged until
   a short page. DEADLINE_MS: one call answers in well under a second (measured against the sibling
   usage_counts_summary from the admin console); 20 s bounds a whole paged read on a slow runner. */
const PAGE = 1000;
const DEADLINE_MS = 20000;

/** { measuredAt, days, releases, verdict } — or { unread: why }. Never throws. */
export async function fetchFieldSpeed({ root = ROOT, days = DAYS, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const ep = endpointOf(root);
  if (!ep) return { unread: 'the project address and key could not be read from src/vendor.js' };
  if (typeof fetchImpl !== 'function') return { unread: 'no fetch in this runtime' };
  const deadline = Date.now() + DEADLINE_MS;
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const left = deadline - Date.now();
    if (left <= 0) return { unread: 'the reading did not finish within ' + DEADLINE_MS / 1000 + ' s' };
    let res;
    try {
      res = await fetchImpl(`${ep.url}/rest/v1/rpc/field_speed?p_days=${days}&limit=${PAGE}&offset=${offset}`, {
        headers: { apikey: ep.key, authorization: 'Bearer ' + ep.key, accept: 'application/json' },
        signal: AbortSignal.timeout(left),
      });
    } catch (e) { return { unread: 'no answer from the database: ' + String((e && e.message) || e).split('\n')[0] }; }
    if (!res.ok) {
      let body = ''; try { body = (await res.text()).slice(0, 160); } catch { /* none */ }
      /* PGRST202 = the function is not in the schema: the migration has not reached production yet */
      return { unread: `field_speed answered HTTP ${res.status}${/PGRST202/.test(body) ? ' (the function is not deployed yet)' : ''}` };
    }
    let page; try { page = await res.json(); } catch { return { unread: 'field_speed answered something that is not JSON' }; }
    if (!Array.isArray(page)) return { unread: 'field_speed answered something that is not a list' };
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const releases = summarise(rows);
  const verdict = judge(releases);
  return { measuredAt: now().toISOString(), days, edgesMs: BOOT_EDGES_MS.slice(), releases: releases.slice(0, 12), verdict,
    words: sentences({ releases, verdict, days }) };
}

/* ── the reader's words, decided here once (en + jp — CONSTITUTION.md §7) ──────────────────────────
   The status page and Atlas show these as they are: the sentences are made where the numbers are decided, so
   the page carries no second copy of the rule (and its lazily loaded chunk does not carry the phrasebook —
   tests/perf-baseline.json). Times are the release's own UTC minute, said as UTC. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const W = {
  en: {
    dev: { mobile: 'Phones and tablets', desktop: 'Computers' },
    within: (b) => (b === 'late' ? 'over 20 s' : 'within ' + String(b).replace('s', ' s')),
    rel: (r) => (r ? `release ${MON[+r.at.slice(5, 7) - 1]} ${+r.at.slice(8, 10)} ${r.at.slice(11, 16)} UTC (${r.sha})` : ''),
    dist: (d, w) => `: half ${w(d.p50)}, 3 in 4 ${w(d.p75)}`,
    loads: (d) => ` · ${d.loads} page loads` + (d.idle != null ? ` · map settled ${d.idle}%` : ''),
    none: (days) => `No release has 30 page loads in the last ${days} days yet`,
    slower: 'the newest release opens more slowly', faster: 'the newest release opens faster', 'less-reliable': 'the newest release settles the map less often',
  },
  jp: {
    dev: { mobile: '携帯・タブレット', desktop: 'パソコン' },
    within: (b) => (b === 'late' ? '20 秒超' : String(b).replace('s', ' 秒以内')),
    rel: (r) => (r ? `版 ${+r.at.slice(5, 7)}月${+r.at.slice(8, 10)}日 ${r.at.slice(11, 16)} UTC（${r.sha}）` : ''),
    dist: (d, w) => `：半数が ${w(d.p50)}、4 人に 3 人が ${w(d.p75)}`,
    loads: (d) => `・${d.loads} 回` + (d.idle != null ? `・地図が表示し終えて開いた ${d.idle}%` : ''),
    none: (days) => `直近 ${days} 日に 30 回以上数えられた版はまだありません`,
    slower: '最新の版は開くのが遅くなりました', faster: '最新の版は開くのが速くなりました', 'less-reliable': '最新の版は地図を表示し終えて開く回が減りました',
  },
};

/**
 * The status page's speed section as rows in both languages: { worse, rows: [{ tone, icon, en: {t, d}, jp: {t, d} }] } —
 * the newest published release per device, then one row per device whose newest well-measured release moved.
 * `worse` is true when a release became slower or less reliable (the page's headline says so).
 */
export function sentences({ releases, verdict, days }) {
  const rows = [];
  const both = (f) => ({ en: f(W.en), jp: f(W.jp) });
  const rels = releases || [];
  const rel = (id) => rels.find((x) => x.release === id);
  for (const dev of ['mobile', 'desktop']) {
    const r = rels.find((x) => x.devices[dev]);
    if (!r) continue;
    const d = r.devices[dev];
    rows.push({ tone: 'ok', icon: 'gauge', ...both((w) => ({ t: w.dev[dev] + w.dist(d, w.within), d: w.rel(r) + w.loads(d) })) });
  }
  if (!rows.length) rows.push({ tone: 'muted', icon: 'clock', ...both((w) => ({ t: w.none(days || DAYS), d: '' })) });
  let worse = false;
  for (const dev of ['mobile', 'desktop']) {
    const v = verdict && verdict[dev];
    if (!v || v.state === 'unjudged' || v.state === 'same') continue;
    const shaky = v.state === 'less-reliable', bad = v.state !== 'faster';
    if (bad) worse = true;
    rows.push({ tone: bad ? 'warn' : 'ok', icon: bad ? 'warning' : 'check-circle', ...both((w) => ({
      t: w.dev[dev] + (w === W.jp ? '：' : ': ') + w[v.state],
      d: (shaky ? '' : w.within(v.edge) + (w === W.jp ? '：' : ': ')) + (shaky ? v.idleNow : v.now) + '% (' + w.rel(rel(v.newer)) + ') ← '
        + (shaky ? v.idleWas : v.was) + '% (' + w.rel(rel(v.older)) + ')',
    })) });
  }
  return { worse, rows };
}

/* ── words (Japanese: the operator's) ───────────────────────────────────────────────────────── */
const DEV_JP = { mobile: '携帯', desktop: 'PC' };
const within = (b) => (b === 'late' ? '20 秒超' : b ? b.replace('s', ' 秒以内') : '?');

/** the line `worktree.mjs status` prints: { ok, text } — ok false only for a measured regression */
export function line(fsx) {
  if (!fsx || fsx.unread) return { ok: true, text: `読者の手元での速さ: 不明（${(fsx && fsx.unread) || '記録が無い'}）` };
  const parts = [];
  let ok = true;
  for (const dev of ['mobile', 'desktop']) {
    const v = fsx.verdict && fsx.verdict[dev];
    if (!v) continue;
    if (v.state === 'unjudged') { parts.push(`${DEV_JP[dev]} 判定なし（${v.why}）`); continue; }
    const rel = (releaseParts(v.newer) || {}).sha || v.newer;
    if (v.state === 'slower') { ok = false; parts.push(`${DEV_JP[dev]} で遅くなった: ${rel} は ${within(v.edge)} が ${v.now}%（前 ${v.was}%）`); }
    else if (v.state === 'less-reliable') { ok = false; parts.push(`${DEV_JP[dev]} で地図が落ち着く前に起動画面が上がる回が増えた: ${rel} ${v.idleNow}%（前 ${v.idleWas}%）`); }
    else if (v.state === 'faster') parts.push(`${DEV_JP[dev]} で速くなった: ${rel} は ${within(v.edge)} が ${v.now}%（前 ${v.was}%）`);
    else parts.push(`${DEV_JP[dev]} 変化なし（${rel}・${within(v.edge)} ${v.now}%）`);
  }
  return { ok, text: '読者の手元での速さ: ' + (parts.join(' / ') || '公開できる release が無い') + (fsx.measuredAt ? `（${fsx.measuredAt.slice(0, 16).replace('T', ' ')} UTC の集計）` : '') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--days');
  const fsx = await fetchFieldSpeed({ days: i >= 0 ? Math.max(1, Math.min(90, +process.argv[i + 1] || DAYS)) : DAYS });
  if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(fsx) + '\n'); }
  else {
    console.log(line(fsx).text);
    for (const r of fsx.releases || []) {
      console.log(`  ${r.at.slice(0, 16).replace('T', ' ')} ${r.sha}`);
      for (const [dev, d] of Object.entries(r.devices)) {
        console.log(`    ${DEV_JP[dev]}  ${d.loads}  半数 ${within(d.p50)} · 4 人に 3 人 ${within(d.p75)}${d.idle != null ? ` · 地図が落ち着いて開いた ${d.idle}%` : ''}`);
      }
    }
  }
}
