/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  wave4-ops — 読者の手元での速さ（field-speed）と、夜の警報が「読めなかった」を言うこと（nightly-unread）
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  測るのは「ファイルがあるか」ではなく、何が届き何が届かないか。どれも実際に評価する。
 *    ① 宣言（shape.js）——版の綴り・時間の区間・終わり方。サーバーと同じ検査を通る行だけ。
 *    ② ブラウザ（js/usage-counts.js）——偽のページで起動画面を上げ、ページが隠れたときに送られる本文を読む。
 *       隠れたまま始まった読み込み・版の無いページは数えない。
 *    ③ DB の公開の読み（migration）——読み手が判定に使う帯と、SQL が返す帯が同じ。版の綴りが SQL の形に合う。
 *    ④ 読み手（scripts/field-speed.mjs）——分位・判定・行・頁めくり・未配備の 404。
 *    ⑤ 状態ページ（js/service-status.js）——速さの節、遅くなった版の見出し、今回の起動の行（en + jp）。
 *    ⑥ 夜の警報（nightly-blame / deep-history）——1 晩も読めなかった窓を「赤なし」と言わず、理由を運ぶ。
 *  DB の半分（権限・割合・床・窓）は supabase/tests/43_field_speed_test.sql（pgTAP）。
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const modUrl = (p, q) => pathToFileURL(join(ROOT, p)).href + (q ? '?' + q : '');

const S = await import(modUrl('supabase/functions/usage-count/shape.js'));
const FS = await import(modUrl('scripts/field-speed.mjs'));
const CE = await import(modUrl('supabase/functions/_shared/client-error-shape.js'));
const PROD = CE.PRODUCTION_ORIGIN;
const STAMP = '2026-10-12T17:10:49Z-6830fff';
const REL = '202610121710-6830fff';

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① the release, the range and the ending are declared once and refused when malformed', () => {
  assert.equal(S.releaseOf(STAMP), REL);
  for (const bad of ['__INTMAP_BUILD_STAMP__', '2026-10-12T17:10:49Z-nogit', '', null, 'R171']) assert.equal(S.releaseOf(bad), null, String(bad));
  assert.equal(S.bootBucket(0), '1s');
  assert.equal(S.bootBucket(1000), '1s', 'an edge belongs to the range it closes');
  assert.equal(S.bootBucket(1001), '2s');
  assert.equal(S.bootBucket(20000), '20s', 'the failsafe itself is in the last range');
  assert.equal(S.bootBucket(20001), 'late');
  assert.equal(S.bootBucket(NaN), null);
  assert.equal(S.BOOT_BUCKETS.length, S.BOOT_EDGES_MS.length + 1);
  assert.deepEqual(S.bootRows({ stamp: STAMP, mobile: true, ms: 2400, ending: 'idle' }),
    [{ m: 'ready', d: REL + '.m.3s' }, { m: 'boot_end', d: REL + '.m.idle' }]);
  assert.deepEqual(S.bootRows({ stamp: '2026-10-12T17:10:49Z-nogit', mobile: true, ms: 2400, ending: 'idle' }), [], 'no release, nothing to compare');
  assert.deepEqual(S.bootRows({ stamp: STAMP, ms: 2400, ending: 'ready' }), [], 'an ending outside the contract');
  for (const r of S.bootRows({ stamp: STAMP, mobile: false, ms: 99999, ending: 'no-renderer' })) assert.ok(S.acceptRow(r.m, r.d, 1), 'the server accepts what the browser builds: ' + r.d);
  for (const [m, d] of [['ready', REL + '.m.2.5s'], ['ready', REL + '.x.2s'], ['ready', 'abc.m.2s'], ['boot_end', REL + '.m.done'], ['ready', REL + '.m.idle'], ['boot_end', REL + '.m.2s']]) {
    assert.equal(S.acceptRow(m, d, 1), null, `refused: ${m} ${d}`);
  }
  assert.deepEqual(S.acceptRow('ready', REL + '.d.4s', 9), { m: 'ready', d: REL + '.d.4s', n: 1, cap: S.METRICS.ready.maxDims }, 'once per page load');
  /* the ending names are the launch screen's contract — the ones js/app-body.js and index.html record */
  for (const e of S.BOOT_ENDINGS) assert.ok(src('js/app-body.js').includes(`'${e}'`) || src('index.html').includes(`'${e}'`), 'an ending the app records: ' + e);
  assert.match(src('index.html'), /finish\('timeout'\); }\s*\n?\s*},20000\);/, 'the last edge is the failsafe the launch screen keeps (20 s)');
  assert.equal(S.BOOT_EDGES_MS[S.BOOT_EDGES_MS.length - 1], 20000);
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
/* the real module, on a fake page whose launch screen lifts — one process per page load (the helper says why) */
const pageLoad = (o) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'tests/helpers/field-speed-page.mjs'), JSON.stringify(o)], { encoding: 'utf8' }));
const speedRowsOf = (rows) => rows.filter((r) => r[0] === 'ready' || r[0] === 'boot_end').map((r) => r.slice(0, 2).join(' ')).sort();

test('② a page load is counted once, when its launch screen lifts — and a hidden start or an unbuilt page is not', () => {
  const phone = pageLoad({ stamp: STAMP, kind: 'phone', ms: 2400, why: 'idle' });
  assert.deepEqual(speedRowsOf(phone), ['boot_end ' + REL + '.m.idle', 'ready ' + REL + '.m.3s']);
  assert.ok(phone.some((r) => r[0] === 'view'), 'in the same beacon as the page view, under the same consent');
  assert.deepEqual(speedRowsOf(pageLoad({ stamp: STAMP, kind: 'desktop', ms: 14200, why: 'timeout' })),
    ['boot_end ' + REL + '.d.timeout', 'ready ' + REL + '.d.20s'], 'an escape is counted with its wait, and says it was one');
  for (const [o, why] of [[{ hiddenAtStart: true }, 'it started in a background tab'], [{ hideBeforeReady: true }, 'the reader left before it was usable'],
    [{ stamp: '__INTMAP_BUILD_STAMP__' }, 'an unbuilt copy has no release']]) {
    assert.deepEqual(speedRowsOf(pageLoad({ stamp: STAMP, kind: 'phone', ms: 900, why: 'idle', ...o })), [], why);
  }
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ the public reading publishes shares and bands, the bands the verdict needs, and only the speed shape', () => {
  const sql = src('supabase/migrations/20261013130000_field_speed.sql');
  const bands = [...sql.matchAll(/then '(\d+\+)'/g)].map((m) => m[1]).concat([...sql.matchAll(/else '(\d+\+)'/g)].map((m) => m[1]));
  for (const b of FS.JUDGE_BANDS) assert.ok(bands.includes(b), `the verdict asks for band ${b}, which the database returns`);
  /* (review) a share with a decimal place lets 30–99 loads be solved back into their count: whole percents, floor 100 */
  assert.equal(+/where g\.total >= (\d+)/.exec(sql)[1], FS.PUBLISH_FLOOR, 'the floor the reader states is the floor the database keeps');
  assert.ok(FS.PUBLISH_FLOOR >= 100, 'at n >= 100 one load moves a whole-percent share by at most one point');
  assert.match(sql, /round\(100\.0 \* g\.n \/ g\.total\)::integer/, 'a share is a whole percent');
  assert.match(sql, /share integer/);
  assert.doesNotMatch(sql, /'30\+'/, 'no band below the floor');
  /* the privacy policy says the same floor and the same rounding, in both languages */
  const legal = src('js/legal-text.js');
  assert.match(legal, new RegExp('fewer than ' + FS.PUBLISH_FLOOR + ' page loads is not shown'));
  assert.match(legal, /as whole percentages, never counts/);
  assert.match(legal, new RegExp('整数の割合です。' + FS.PUBLISH_FLOOR + ' 回未満の版は公開しません'));
  assert.match(sql, /ANON MAY CALL: \S/, 'the comment says why anon may call it (pgTAP 11)');
  assert.doesNotMatch(sql.split('returns table')[1].split(')')[0], /\b(n|count|total|day)\b/, 'no returned column is a count or a day');
  const pattern = /'\^\[0-9\]\{12\}-\[0-9a-f\]\{7,12\}\\\.\[md\]\\\.\[a-z0-9-\]\+\$'/.exec(sql);
  assert.ok(pattern, 'the SQL names the shape of a speed dimension');
  const re = /^[0-9]{12}-[0-9a-f]{7,12}\.[md]\.[a-z0-9-]+$/;
  for (const ending of S.BOOT_ENDINGS) for (const b of S.BOOT_BUCKETS) {
    for (const r of S.bootRows({ stamp: STAMP, mobile: true, ms: b === 'late' ? 30000 : S.BOOT_EDGES_MS[S.BOOT_BUCKETS.indexOf(b)], ending })) {
      assert.ok(re.test(r.d), 'what the browser sends is what the database reads: ' + r.d);
      assert.ok(r.d.length <= 64, 'within the table\'s dimension length');
    }
  }
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
const row = (metric, release, device, bucket, share, loads) => ({ metric, release, device, bucket, share, loads });
const A = '202610110900-aaaaaaa', B2 = '202610121710-bbbbbbb';
const RELS = [
  row('ready', A, 'mobile', '2s', 30, '300+'), row('ready', A, 'mobile', '3s', 50, '300+'), row('ready', A, 'mobile', '6s', 20, '300+'),
  row('boot_end', A, 'mobile', 'idle', 96, '300+'), row('boot_end', A, 'mobile', 'timeout', 4, '300+'),
  row('ready', B2, 'mobile', '2s', 10, '1000+'), row('ready', B2, 'mobile', '3s', 50, '1000+'), row('ready', B2, 'mobile', '6s', 40, '1000+'),
  row('boot_end', B2, 'mobile', 'idle', 95, '1000+'), row('boot_end', B2, 'mobile', 'timeout', 5, '1000+'),
  row('ready', B2, 'desktop', '1s', 70, '100+'), row('ready', B2, 'desktop', '2s', 30, '100+'),
  row('ready', 'garbage', 'mobile', '1s', 100, '300+'),
];
test('④ the reading: quantiles from shares, newest first, and a verdict only between two well-measured releases', () => {
  assert.equal(FS.quantileBucket({ '2s': 30, '3s': 50, '6s': 20 }, 0.5), '3s');
  assert.equal(FS.quantileBucket({ '2s': 30, '3s': 50, '6s': 20 }, 0.75), '3s');
  assert.equal(FS.quantileBucket({ '2s': 30, '3s': 45, '6s': 25 }, 0.75), '3s', 'a share that reaches the quantile exactly is enough');
  assert.equal(FS.quantileBucket({}, 0.5), null);
  assert.equal(FS.shareWithin({ '2s': 10, '3s': 50, '6s': 40 }, '3s'), 60);
  const rels = FS.summarise(RELS);
  assert.deepEqual(rels.map((r) => r.release), [B2, A], 'newest first; a malformed release is not read');
  assert.equal(rels[0].at, '2026-10-12T17:10:00Z');
  assert.equal(rels[0].sha, 'bbbbbbb');
  assert.equal(rels[0].devices.mobile.p50, '3s');
  assert.equal(rels[0].devices.mobile.p75, '6s');
  assert.equal(rels[0].devices.mobile.idle, 95);
  assert.equal(rels[0].devices.desktop.idle, null, 'no ending was published for it — unknown, not zero');
  const v = FS.judge(rels);
  /* A's 3-in-4 wait is «within 3 s» (80% of A); B2 had 60% within 3 s: 20 points fewer → slower */
  assert.deepEqual(v.mobile, { state: 'slower', newer: B2, older: A, edge: '3s', now: 60, was: 80 });
  assert.equal(v.desktop.state, 'unjudged', 'one release with 100+ loads is not a comparison');
  assert.match(v.desktop.why, /300\+/);
  /* the same distribution is «same»; a small move is not a regression */
  const same = FS.judge(FS.summarise(RELS.map((r) => (r.release === B2 && r.device === 'mobile' && r.metric === 'ready') ? { ...r, share: { '2s': 25, '3s': 50, '6s': 25 }[r.bucket] } : r)));
  assert.equal(same.mobile.state, 'same', '5 points is within the draw');
  /* the wait held but fewer launch screens lifted on a settled map */
  const shaky = FS.judge(FS.summarise(RELS.map((r) => {
    if (r.release !== B2 || r.device !== 'mobile') return r;
    if (r.metric === 'ready') return { ...r, share: { '2s': 30, '3s': 50, '6s': 20 }[r.bucket] };
    return { ...r, share: { idle: 80, timeout: 20 }[r.bucket] };
  })));
  assert.equal(shaky.mobile.state, 'less-reliable');
  assert.equal(shaky.mobile.idleNow, 80);
  /* the operator's line */
  const fsx = { measuredAt: '2026-10-13T05:00:00Z', days: 14, releases: rels, verdict: v };
  const L = FS.line(fsx);
  assert.equal(L.ok, false, 'a slower release is the line that is not green');
  assert.match(L.text, /携帯 で遅くなった: bbbbbbb は 3 秒以内 が 60%（前 80%）/);
  assert.equal(FS.line({ unread: 'x' }).ok, true, 'an unread record is not a regression');
  assert.match(FS.line({ unread: 'x' }).text, /不明（x）/);
});

test('④ the endpoint: the key the page has, paged until a short page, and «not deployed» said as such', async () => {
  const ep = FS.endpointOf(ROOT);
  assert.ok(ep && /^https:\/\/[a-z]+\.supabase\.co$/.test(ep.url) && ep.key.length > 20, 'read from src/vendor.js');
  const asked = [];
  const page = Array.from({ length: 1000 }, () => row('ready', A, 'mobile', '2s', 100, '300+'));
  const fake = async (url, init) => {
    asked.push(url);
    assert.equal(init.headers.apikey, ep.key);
    const off = +new URL(url).searchParams.get('offset');
    return { ok: true, json: async () => (off === 0 ? page : [row('ready', B2, 'mobile', '2s', 100, '300+')]) };
  };
  const known = [{ minute: '202610110900', sha: 'a'.repeat(40) }, { minute: '202610121710', sha: 'b'.repeat(40) }];
  const got = await FS.fetchFieldSpeed({ root: ROOT, fetchImpl: fake, known, now: () => new Date('2026-10-13T00:00:00Z') });
  assert.equal(asked.length, 2, 'a full page asks for the next one');
  assert.match(asked[0], /\/rest\/v1\/rpc\/field_speed\?p_days=14&limit=1000&offset=0$/);
  assert.deepEqual(got.releases.map((r) => r.release), [B2, A]);
  assert.equal(got.measuredAt, '2026-10-13T00:00:00.000Z');
  const missing = await FS.fetchFieldSpeed({ root: ROOT, known, fetchImpl: async () => ({ ok: false, status: 404, text: async () => '{"code":"PGRST202"}' }) });
  assert.match(missing.unread, /HTTP 404 \(the function is not deployed yet\)/);
  const down = await FS.fetchFieldSpeed({ root: ROOT, known, fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.match(down.unread, /no answer from the database: ECONNRESET/);
});

test('④ the bundle carries the reading — and a reading that failed is null with its reason, never a stale one passed off as new', async () => {
  const BS = await import(modUrl('scripts/build-service-status.mjs'));
  const fsx = { measuredAt: '2026-10-13T00:00:00Z', days: 14, releases: FS.summarise(RELS), verdict: FS.judge(FS.summarise(RELS)) };
  const ok = BS.compose({ liveness: null, ledger: [], atlasEval: null, fieldSpeed: fsx, unread: [], previousHistory: null });
  assert.equal(ok.fieldSpeed.releases.length, 2);
  const bad = BS.compose({ liveness: null, ledger: [], atlasEval: null, fieldSpeed: { unread: 'HTTP 404' }, unread: [{ half: 'fieldSpeed', why: 'HTTP 404' }], previousHistory: null });
  assert.equal(bad.fieldSpeed, null);
  assert.deepEqual(bad.unread, [{ half: 'fieldSpeed', why: 'HTTP 404' }]);
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
/* ── (review) forging ─────────────────────────────────────────────────────── */
test('④b a release main never had is never published — and the server refuses what cannot be a release', async () => {
  /* the forgery the review measured: a well-formed future release, 300+ loads, every reader slow */
  const FORGED = '209912312359-aaaaaaa';
  const forged = [...RELS, row('ready', FORGED, 'mobile', '20s', 100, '1000+'), row('boot_end', FORGED, 'mobile', 'timeout', 100, '1000+')];
  const known = [{ minute: '202610110900', sha: 'a'.repeat(40) }, { minute: '202610121710', sha: 'b'.repeat(40) }];
  const got = await FS.fetchFieldSpeed({ root: ROOT, known, fetchImpl: async () => ({ ok: true, json: async () => forged }) });
  assert.deepEqual(got.releases.map((r) => r.release), [B2, A], 'the forged «newest» release is not one of them');
  assert.equal(got.unverified, 2, 'and the bundle says how many releases it refused (the forgery and the malformed one)');
  assert.equal(got.verdict.mobile.newer, B2, 'the verdict compares real releases only');
  assert.ok(!/Dec 31 23:59|12月31日 23:59/.test(JSON.stringify(got.words)), 'no sentence names it');
  /* the same sha at another minute is not the release either — the stamp is both */
  assert.equal(FS.isKnownRelease('202610121711-bbbbbbb', known), false);
  assert.equal(FS.isKnownRelease('202610121710-bbbbbbb', known), true);
  /* a history that cannot be read verifies nothing, so nothing is published */
  const shallow = await FS.fetchFieldSpeed({ root: ROOT, known: null, fetchImpl: async () => { throw new Error('must not be asked'); } });
  assert.match(shallow.unread, /shallow clone/);
  /* main's own history is the source: the commit this tree is on is a release, at its committer minute */
  const here = FS.knownReleases(ROOT);
  if (here) {
    const ct = +execFileSync('git', ['log', '-1', '--format=%ct', here[0].sha], { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.ok(FS.isKnownRelease(S.releaseOf(new Date(ct * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') + '-' + here[0].sha.slice(0, 7)), here),
      'a stamp built the way scripts/build-stamp.mjs builds it is recognised');
  }

  /* the server: future and too-old releases, and one speed dimension per request */
  const now = Date.UTC(2026, 9, 13, 12, 0);
  const body = (rows) => JSON.stringify({ c: rows });
  const kept = (rows) => S.parse(body(rows), now).rows.map((r) => r.m + ' ' + r.d);
  assert.deepEqual(kept([['ready', FORGED + '.m.2s', 1]]), [], 'a release in the future');
  assert.deepEqual(kept([['ready', '202606010000-aaaaaaa.m.2s', 1]]), [], 'a release older than field_speed can read (90 days)');
  assert.deepEqual(kept([['ready', '202610131130-aaaaaaa.m.2s', 1]]), ['ready 202610131130-aaaaaaa.m.2s'], 'a release of the last half hour');
  assert.ok(S.acceptRow('ready', FORGED + '.m.2s', 1), 'the browser has no clock check: its own clock may be wrong, the server decides');
  /* filling the day's ceiling: 64 distinct releases in one request open ONE dimension, not 64 */
  const flood = Array.from({ length: 64 }, (_, i) => ['ready', '20261013' + String(1000 + i).padStart(4, '0') + '-' + 'abcdef0'.slice(0, 6) + (i % 10) + '.m.2s', 1]);
  assert.equal(S.parse(body(flood), now).rows.filter((r) => r.m === 'ready').length, 1, 'one speed dimension per request');
  const honest = S.parse(body([['view', '', 1], ['ready', '202610131130-aaaaaaa.m.2s', 1], ['boot_end', '202610131130-aaaaaaa.m.idle', 1]]), now).rows;
  assert.equal(honest.length, 3, 'an honest page load loses nothing');
  /* so the ceiling takes as many requests as it has dimensions, and one caller is held far below that */
  assert.ok(S.METRICS.ready.maxDims / S.METRICS.ready.perRequest > 120, 'more requests than one caller may send in an hour');
});

test('④c the page never shows a release newer than itself', async () => {
  const St = await import(modUrl('js/service-status.js'));
  const rels = FS.summarise(RELS);
  const verdict = FS.judge(rels);
  const F = { words: FS.sentences({ releases: rels, verdict, days: 14 }) };
  assert.ok(F.words.rows.every((r) => r.rel), 'every row says which release it speaks for');
  const all = St.speedRows(F, 'en', B2);
  assert.equal(all.worse, true);
  const older = St.speedRows(F, 'en', A);   /* a page of release A cannot know B2 */
  assert.ok(!older.rows.some((r) => /bbbbbbb/.test(r.title + r.detail)), older.rows.map((r) => r.detail).join(' | '));
  assert.equal(older.rows.length, 1, 'every row was about B2: the page says it has nothing to show, not an empty section');
  assert.equal(older.rows[0].tone, 'muted');
  assert.equal(older.worse, false, 'a row the page refused cannot set the headline');
});

test('⑤ the status page: a speed section in en and jp, a slower release in the headline, and this visit', async () => {
  const St = await import(modUrl('js/service-status.js'));
  const rels = FS.summarise(RELS);
  const verdict = FS.judge(rels);
  const F = { measuredAt: '2026-10-13T00:00:00Z', days: 14, releases: rels, verdict, words: FS.sentences({ releases: rels, verdict, days: 14 }) };
  const base = { bundle: { v: 1, fieldSpeed: F, upstream: null, atlasEval: null }, online: true, shell: true, storageMB: 0, layersOn: 0, layerProblems: [], boot: { ms: 2412, ending: 'idle' } };
  for (const lang of ['en', 'jp']) {
    const s = St.composeStatus(base, lang);
    const sec = s.sections.find((x) => x.id === 'speed');
    assert.ok(sec, 'a speed section');
    const titles = sec.rows.map((r) => r.title).join('\n');
    if (lang === 'en') {
      assert.match(titles, /Phones and tablets: half within 3 s, 3 in 4 within 6 s/);
      assert.match(titles, /Computers: half within 1 s/);
      assert.match(titles, /Phones and tablets: the newest release opens more slowly/);
      assert.match(s.headline, /opens more slowly/);
      assert.equal(s.sections.find((x) => x.id === 'device').rows.at(-1).title, 'This visit was ready in 2.4 s');
    } else {
      assert.match(titles, /携帯・タブレット：半数が 3 秒以内、4 人に 3 人が 6 秒以内/);
      assert.match(titles, /最新の版は開くのが遅くなりました/);
      assert.match(s.headline, /遅くなっています/);
      assert.equal(s.sections.find((x) => x.id === 'device').rows.at(-1).title, '今回は 2.4 秒で使えるようになりました');
    }
    assert.equal(s.tone, 'warn');
  }
  /* unread → muted, says so, and does not move the headline */
  const unread = St.composeStatus({ ...base, bundle: { v: 1, upstream: null, atlasEval: null }, boot: null }, 'en');
  assert.equal(unread.sections.find((x) => x.id === 'speed').rows[0].tone, 'muted');
  assert.doesNotMatch(unread.headline, /slowly/);
  assert.ok(!unread.sections.find((x) => x.id === 'device').rows.some((r) => /This visit/.test(r.title)), 'no record of this visit, no row');
  /* nothing published yet */
  const empty = St.speedRows({ words: FS.sentences({ releases: [], verdict: {}, days: 14 }) }, 'jp');
  assert.equal(St.speedRows({ releases: [] }, 'en').rows[0].tone, 'muted', 'a record without its sentences is not read as one');
  const det = St.composeStatus(base, 'en').sections.find((x) => x.id === 'speed').rows.map((r) => r.detail);
  assert.ok(det.includes('release Oct 12 17:10 UTC (bbbbbbb) · 1000+ page loads · map settled 95%'), 'the release, its band and the settled share: ' + det.join(' | '));
  assert.ok(det.includes('within 3 s: 60% (release Oct 12 17:10 UTC (bbbbbbb)) ← 80% (release Oct 11 09:00 UTC (aaaaaaa))'), 'the verdict names both releases: ' + det.join(' | '));
  assert.match(empty.rows[0].title, /まだありません/);
  assert.equal(St.bootOfThisVisit({ html: 1, dom: 300, timeout: 14000 }).ending, 'timeout');
  assert.equal(St.bootOfThisVisit({ html: 1 }), null, 'the launch screen is still up');
  assert.equal(St.thisVisitRow({ ms: 900, ending: 'no-renderer' }, 'en').tone, 'warn');
});

test('⑤ Atlas and the operator reach the same reading', () => {
  assert.match(src('js/atlas-cap-system.js'), /row: \['system\.speed',\s+'speed'/);
  assert.match(src('js/atlas-cap-system.js'), /await statusPage\.describe\(\);[\s\S]{0,400}x\.id === 'speed'/, 'Atlas reads the status page\'s own speed section — no second computation');
  assert.ok(src('js/atlas-capabilities.js').includes('["system.speed","speed",'), 'and it is in the registry Atlas searches');
  assert.match(src('scripts/worktree.mjs'), /import\('\.\/field-speed\.mjs'\)[\s\S]*FIELD_SPEED\.line\(/, 'worktree status prints it (field-speed loaded on its own — a tree without shape.js keeps the rest of the status)');
  assert.match(src('scripts/build-service-status.mjs'), /fetchFieldSpeed\(/, 'the bundle builder reads it');
  /* the privacy policy says it, in both languages */
  const legal = src('js/legal-text.js');
  assert.match(legal, /how long the map took to become usable/);
  assert.match(legal, /地図が使えるようになるまでの時間/);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────── */
test('⑥ a window in which no night was read is «not known», with the reason — never «nothing red»', async () => {
  const NB = await import(modUrl('scripts/nightly-blame.mjs'));
  const DH = await import(modUrl('scripts/deep-history.mjs'));
  const nights = Array.from({ length: 3 }, (_, i) => ({ runId: 10 - i, day: '2026-10-1' + i, read: false, why: '一部の shard の log を読めなかった: Deep rest 1/5（gh: Resource not accessible by integration (HTTP 403)）' }));
  const h = { known: true, ...DH.classify(nights) };
  const b = NB.blame(h);
  assert.equal(b.read, 0);
  assert.deepEqual(b.unread, [{ why: nights[0].why, nights: 3 }]);
  const md = NB.markdown(b);
  assert.match(md, /No night could be read/);
  assert.match(md, /NOT KNOWN/);
  assert.match(md, /HTTP 403/, 'the reason reaches the issue');
  assert.doesNotMatch(md, /No test has been red/);
  assert.match(NB.render(b), /1 晩も読めていない/);
  /* a window that WAS read keeps its old sentence, and names any night it could not read */
  const some = { known: true, ...DH.classify([{ runId: 2, day: '2026-10-12', read: true, failed: [], flaky: [] }, nights[0]]) };
  const md2 = NB.markdown(NB.blame(some));
  assert.match(md2, /No test has been red on two consecutive read nights \(window: 2 nights, 1 read\)/);
  assert.match(md2, /Not read: 1 night\(s\)/);
  /* gh's own words, not «Command failed» */
  assert.equal(DH.ghWhy({ message: 'Command failed: gh api x\nmore' }, 'gh: Not Found (HTTP 404)\n'), 'gh: Not Found (HTTP 404)');
  assert.equal(DH.ghWhy({ message: 'Command failed: gh api x' }, ''), 'Command failed: gh api x');
  assert.equal(DH.ghWhy({ killed: true }, ''), 'gh の時間切れ');
});
