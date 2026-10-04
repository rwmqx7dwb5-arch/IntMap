/* ============================================================================
 *  tests/ops-next-checks.test.mjs — operations as a product   (ops-next, 2026-10-03)
 * ----------------------------------------------------------------------------
 *  ① the data sources' RECORD over time (data/service-status.json `history`): how a night is folded in,
 *    what the readers count, and that the shipped bundle is well formed;
 *  ② 「更新情報」/ What's new: the reader's lines in dev-notes/, the generator (JSON, pages, Atom, sitemap),
 *    the in-app list and its unread rule, and Atlas's `system.whatsNew`;
 *  ③ the half of the Atlas evaluation that needs no session: reach, the offline report, and that the
 *    live report is told apart from it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.document = globalThis.document || { documentElement: { lang: 'en' } };
await import('../js/safe-html.js');
const S = await import('../js/service-status.js');
const B = await import('../scripts/build-service-status.mjs');
const NS = await import('../scripts/lib/nightly-status.mjs');
const DN = await import('../scripts/dev-notes.mjs');
const WN = await import('../scripts/whats-new.mjs');
const W = await import('../js/whats-new.js');
const RCH = await import('../scripts/atlas-eval/reach.mjs');

const up = (at, verdicts, networkObserved = true) => ({ measuredAt: at, networkObserved, hosts: Object.entries(verdicts).map(([host, verdict]) => ({ host, verdict })) });

/* ── ① the record ─────────────────────────────────────────────────────────── */
test('① a night is folded in once, in order, and only what was measured is a night', () => {
  let h = B.advanceHistory(null, up('2026-10-01T10:00:00Z', { a: 'alive', b: 'dead' }));
  assert.deepEqual(h.nights, ['2026-10-01T10:00:00Z']);
  assert.deepEqual(h.hosts, { a: 'a', b: 'd' });
  h = B.advanceHistory(h, up('2026-10-02T10:00:00Z', { a: 'refused', c: 'alive' }));
  assert.deepEqual(h.hosts, { a: 'ar', b: 'd.', c: '.a' }, 'a host first probed tonight was not probed before; a host absent tonight is «.»');
  assert.deepEqual(B.advanceHistory(h, up('2026-10-02T10:00:00Z', { a: 'alive' })), h, 'the same night twice is the same history (idempotent)');
  assert.deepEqual(B.advanceHistory(h, up('2026-09-30T10:00:00Z', { a: 'alive' })), h, 'an older night does not rewrite the past');
  assert.deepEqual(B.advanceHistory(h, null), h, 'a run that read nothing adds no night');
  const blind = B.advanceHistory(h, up('2026-10-03T10:00:00Z', { a: 'alive', c: 'alive' }, false));
  assert.equal(blind.hosts.a.at(-1), 'u', 'a night whose checker had no network says nothing about anyone');
  /* the span is the constant's; a host probed on none of the held nights leaves */
  let k = null;
  for (let i = 0; i < 5; i++) k = B.advanceHistory(k, up(`2026-10-0${i + 1}T10:00:00Z`, i === 0 ? { gone: 'alive', x: 'alive' } : { x: 'alive' }), 3);
  assert.equal(k.nights.length, 3);
  assert.ok(!('gone' in k.hosts), 'a host not probed on any held night has left the history');
  assert.equal(k.hosts.x, 'aaa');
});

test('① the readers count only measured nights, and say so in en and jp', () => {
  assert.deepEqual(S.recordOf('aaud.r'), { answered: 2, measured: 4, nights: 6 });
  assert.match(S.recordSentence('aaa', 'en'), /all of the last 3/);
  assert.match(S.recordSentence('a.da', 'jp'), /直近 3 晩の確認のうち 2 晩/);
  assert.equal(S.recordSentence('u..', 'en'), '', 'nothing measured, nothing said');
  const b = { history: { nights: ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'], hosts: { a: 'ad', b: 'au', c: '.a' } } };
  assert.deepEqual(S.nightsOf(b).map((n) => [n.answered, n.measured]), [[2, 2], [1, 2]]);
  const bundle = { v: 1, upstream: { measuredAt: '2026-10-02T00:00:00Z', networkObserved: true, hosts: [
    { host: 'api.example.org', verdict: 'dead', what: 'x', whatJp: 'x' }, { host: 'www.ok.org', verdict: 'alive', what: 'y', whatJp: 'y' }] },
  history: { nights: ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'], hosts: { 'api.example.org': 'ad', 'www.ok.org': 'aa' } } };
  assert.match(S.sourceRecord(bundle, 'https://www.example.org/', 'en'), /Answered 1 of the last 2/, 'a credit is told its hosts\' record (same site, www stripped)');
  assert.match(S.sourceRecord(bundle, 'https://www.ok.org/', 'jp'), /すべてで応答/);
  assert.equal(S.sourceRecord(bundle, 'https://nowhere.test/', 'en'), '');
  const page = S.composeStatus({ bundle, online: true, shell: true, layersOn: 0, layerProblems: [] }, 'en');
  const sec = page.sections.find((x) => x.id === 'upstream');
  assert.ok(sec.record && sec.record.nights.length === 2 && sec.record.pct === 75, 'the record section: 3 of 4 measured checks answered');
  assert.equal(sec.all.find((r) => r.host === 'api.example.org').series, 'ad');
});

test('① the shipped bundle carries a well-formed history, and every row has words in en and jp', () => {
  const b = JSON.parse(rd('data/service-status.json'));
  const H = b.history;
  assert.ok(H && Array.isArray(H.nights) && H.nights.length >= 1 && H.nights.length <= B.HISTORY_KEEP);
  for (let i = 1; i < H.nights.length; i++) assert.ok(Date.parse(H.nights[i]) > Date.parse(H.nights[i - 1]), 'nights only move forward');
  for (const [h, s] of Object.entries(H.hosts)) assert.ok(s.length === H.nights.length && /^[ardu.]+$/.test(s), h + ' has one cell per night');
  if (b.upstream) assert.equal(H.nights.at(-1), b.upstream.measuredAt, 'the newest night is the measurement the bundle states');
  const L = B.readerLedger(ROOT);
  const build = L.hosts.filter((r) => r.group === 'build');
  assert.ok(build.length > 0 && build.every((r) => /^elections\//.test(r.host) && r.what && r.whatJp), 'the rebuild sources are told by their own declaration');
});

/* ── ② What's new ─────────────────────────────────────────────────────────── */
test('② a reader\'s line is both languages or neither, plain, and in Japanese where it says so', () => {
  assert.deepEqual(DN.newsProblems({}), []);
  assert.match(DN.newsProblems({ newsen: 'x' })[0], /both en and jp/);
  assert.ok(DN.newsProblems({ newsen: 'Ok', newsjp: 'English only' }).some((p) => /not written in Japanese/.test(p)));
  assert.ok(DN.newsProblems({ newsen: 'See [it](x)', newsjp: '見て' }).some((p) => /markup/.test(p)));
  assert.ok(DN.newsProblems({ newsen: 'New \u{1F680}', newsjp: '新しい' }).some((p) => /emoji/.test(p)));
  assert.ok(DN.newsProblems({ newsen: 'x'.repeat(DN.NEWS_MAX + 1), newsjp: '新' }).some((p) => /characters/.test(p)));
  assert.deepEqual(DN.checkNotes(ROOT), [], 'the records as they are pass the check');
});

test('② omitting the reader line is a decision: a branch that changes PRODUCT.md or adds a root page must say so', () => {
  const rec = 'dev-notes/2026-10-04-x.md';
  const none = () => ({ title: 'x' });
  assert.deepEqual(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'M', file: 'js/a.js' }], none), [], 'no signal, nothing asked');
  assert.equal(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'M', file: 'PRODUCT.md' }], none).length, 1, 'PRODUCT.md changed');
  assert.equal(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'A', file: 'security.html' }], none).length, 1, 'a page was added');
  assert.deepEqual(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'M', file: 'index.html' }], none), [], 'editing a page is not adding one');
  assert.deepEqual(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'M', file: 'PRODUCT.md' }], () => ({ newsen: 'a', newsjp: 'あ' })), [], 'the lines answer it');
  assert.deepEqual(DN.newsOmissions([{ status: 'A', file: rec }, { status: 'M', file: 'PRODUCT.md' }], () => ({ internal: 'merge only' })), [], 'so does an internal reason');
  assert.deepEqual(DN.newsOmissions([{ status: 'M', file: rec }, { status: 'M', file: 'PRODUCT.md' }], none), [], 'only records added on the branch are asked');
});

test('② the generator: entries newest first, pages in both languages, an Atom feed per language, a sitemap', () => {
  const M = WN.collect(ROOT, { repo: 'https://github.com/o/r' });
  assert.deepEqual(M.problems, []);
  assert.ok(M.entries.length >= 40, 'the records of 2026-10-02/03 that changed what a reader sees are announced');
  for (let i = 1; i < M.entries.length; i++) assert.ok(M.entries[i - 1].date >= M.entries[i].date, 'newest first');
  for (const e of M.entries) {
    assert.ok(e.en && e.jp && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    assert.equal(e.url, e.pr ? 'https://github.com/o/r/pull/' + e.pr : null, 'a change is linked only when its record names one');
  }
  assert.equal(new Set(M.entries.map((e) => e.id)).size, M.entries.length, 'ids are unique (the Atom ids and the unread marks rest on them)');
  const out = WN.outputs(M);
  assert.deepEqual(Object.keys(out).sort(), ['ja/updates.html', 'ja/updates.xml', 'sitemap-updates.xml', 'updates.html', 'updates.xml', 'whats-new.json'].sort());
  const J = JSON.parse(out['whats-new.json']);
  assert.equal(J.schema, 'intmap-whats-new/1');
  assert.equal(J.entries.length, M.entries.length);
  assert.match(out['updates.html'], /<html lang="en">/);
  assert.match(out['ja/updates.html'], /<html lang="ja">/);
  assert.match(out['updates.html'], /hreflang="ja" href="__INTMAP_SITE_URL__ja\/updates\.html"/);
  assert.match(out['updates.html'], /type="application\/atom\+xml"/);
  assert.ok(out['ja/updates.html'].includes(M.entries[0].jp.replace(/&/g, '&amp;').replace(/</g, '&lt;')), 'the Japanese page shows the Japanese line');
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(out['updates.html']), 'the page runs nothing');
  const feed = out['updates.xml'];
  assert.match(feed, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.equal((feed.match(/<entry>/g) || []).length, M.entries.length);
  assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="en">/);
  assert.match(out['ja/updates.xml'], /xml:lang="ja"/);
  assert.match(out['sitemap-updates.xml'], /updates\.html/);
  /* every record without the two lines stays internal */
  const internal = DN.entries(ROOT).filter((e) => e.kind === 'dated' && !e.news);
  assert.ok(internal.length > 0 && internal.every((e) => !M.entries.some((x) => x.id === e.date + '-' + e.slug)));
  assert.equal(WN.repoUrl(ROOT, { GITHUB_REPOSITORY: 'a/b' }), 'https://github.com/a/b');
});

test('② the generator writes into a directory, and the build and the sitemap index carry it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-next-wn-'));
  try {
    const files = WN.writeTo(dir, WN.collect(ROOT, { repo: null }));
    for (const f of files) assert.ok(existsSync(join(dir, f)), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(rd('vite.config.js'), /whatsNewPlugin\(\)/);
  /* the index's array CARRIES the updates sitemap — not «is exactly these three»: other generators join the same
     array (wave2-train: marketing's on-this-day). What the index really holds is evaluated in
     tests/marketing-engine-checks.test.mjs ⑦ (the generated sitemap index's <loc>s, sitemap-updates.xml among them). */
  assert.match(rd('scripts/history-pages.mjs'), /\[(?:\w+, )*UPDATES_SITEMAP(?:, \w+)*\]\.map\(/);
});

test('② in the app: entries in the reader\'s language, and «unread» is «not yet shown on this device»', () => {
  const list = { schema: 'intmap-whats-new/1', entries: [
    { id: '2026-10-03-b', date: '2026-10-03', en: 'B', jp: 'ビー', pr: 7, url: 'u' }, { id: '2026-10-02-a', date: '2026-10-02', en: 'A', jp: 'エー' }] };
  assert.deepEqual(W.entriesIn(list, 'jp').map((e) => e.text), ['ビー', 'エー']);
  assert.deepEqual(W.entriesIn(list, 'en', { since: '2026-10-03' }).map((e) => e.id), ['2026-10-03-b']);
  assert.equal(W.entriesIn(list, 'en', { limit: 1 }).length, 1);
  assert.deepEqual(W.unreadOf(list, null), [], 'a device that never looked has a baseline, not 40 unread');
  assert.deepEqual(W.unreadOf(list, ['2026-10-02-a']), ['2026-10-03-b']);
  assert.deepEqual(W.seenAfter(list), ['2026-10-03-b', '2026-10-02-a']);
  const ls = rd('js/layer-state.js');
  assert.match(ls, /import\('\.\/whats-new\.js'\)/, 'fetched on demand');
  assert.ok(!/^import .*whats-new/m.test(ls), 'never on the boot path');
  assert.match(ls, /IntersectionObserver/, 'the mark is counted when the button is first seen, not at start-up');
  assert.match(rd('index.html'), /id="btn-whats-new"[^>]*>.*data-i18n="viewWhatsNew"/);
  for (const l of ['en', 'jp']) assert.match(rd(`js/locales/ui.${l}.js`), /viewWhatsNew:"/);
});

test('② Atlas reaches the list: a registered capability, described to the planner, reading the same module', async () => {
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const C = makeAtlasCapabilities({});
  const c = C.resolve('system.whatsNew');
  assert.ok(c && !c.withdrawn, 'system.whatsNew is in the registry');
  assert.ok(C.resolve('whatsNew'), 'and answers to its dispatch spelling');
  const sys = rd('js/atlas-cap-system.js');
  assert.match(sys, /\{"type":"whatsNew"/);
  assert.match(sys, /whatsNew\.describe\(/, 'it reads the same model the page draws');
  assert.match(sys, /IntMapWhatsNew/, 'and names the handle that shows the page');
});

/* ── ③ the evaluation's half that needs no session ─────────────────────────── */
test('③ reach is measured with the options find_capability uses, and reports a miss as a miss', () => {
  assert.match(rd('js/atlas-toolsurface.js'), new RegExp('CAPS\\.searchFused\\(q, \\{ want: ' + RCH.FIND_OPTS.want + ', min: ' + RCH.FIND_OPTS.min + ' \\}\\)'),
    'the reach asks the search exactly as find_capability does');
  const CAPS = { search: (q) => ({ ranked: /route/.test(q) ? [{ id: 'routing.route', rank: 1 }, { id: 'map.drawLine', rank: 2 }] : [] }) };
  const R = RCH.reachOf([
    { id: 'q1', lang: 'en', text: 'route from A to B', capabilities: ['routing.route', 'map.drawLine'] },
    { id: 'q2', lang: 'jp', text: '距離', capabilities: ['map.measure'] },
    { id: 'q3', text: 'no caps' }], CAPS);
  assert.equal(R.measured, 2, 'a question naming no capability is not measured');
  assert.equal(R.allFound, 1);
  assert.deepEqual(R.byQuestion[1].expected, [{ id: 'map.measure', rank: null }]);
  assert.deepEqual(R.missedCaps, { 'map.measure': 1 });
});

test('③ the offline report, and the live report told apart from it', () => {
  const NSs = NS.atlasEvalState({ total: 2, runs: [
    { id: 2, status: 'completed', conclusion: 'failure', createdAt: '2026-10-04T05:41:00Z' },
    { id: 1, status: 'completed', conclusion: 'failure', createdAt: '2026-10-03T05:41:00Z' }] },
  { 2: { report: false, offline: true, why: ['missing'], step: 'Require the secrets' } });
  assert.equal(NSs.latest.measured, false, 'an offline report does not make the live half «measured»');
  assert.deepEqual(NSs.offlineRun, { id: 2, at: '2026-10-04T05:41:00Z' });
  assert.equal(NS.LIVE_REPORT, 'atlas-eval-report');
  assert.match(rd('scripts/lib/nightly-status.mjs'), /x\.name === LIVE_REPORT/, 'the live report is found by its name, not by «any artifact»');
  const sum = B.offlineSummary({ schema: 'intmap-atlas-eval-offline/1', at: 'T', replay: { cassettes: 12, clean: 12 }, reach: { basis: 'b', questions: 74, allFound: 2, pairs: 157, reached: 34 } }, { id: 9, at: 'R' });
  assert.deepEqual(sum.reach, { basis: 'b', questions: 74, allFound: 2, pairs: 157, reached: 34 });
  assert.equal(B.offlineSummary({ schema: 'other' }, null), null);
  const page = S.composeStatus({ bundle: { v: 1, atlasEval: { total: 9, latest: null, offline: sum } }, online: true, layerProblems: [] }, 'jp');
  const row = page.sections.find((x) => x.id === 'atlas').rows.find((r) => /ログイン不要/.test(r.title));
  assert.ok(row && /34 件/.test(row.detail) && /答えの評価ではありません/.test(row.detail), 'the status page states the half that was measured, and what it is not');
  const y = rd('.github/workflows/atlas-eval.yml');
  assert.match(y, /\n {2}offline:\n/);
  assert.match(y, /node scripts\/atlas-eval\.mjs --offline --out _offline/);
  assert.match(y, /name: atlas-eval-offline/);
  const offJob = y.slice(y.indexOf('\n  offline:'), y.indexOf('\n  eval:'));
  assert.ok(!/secrets\./.test(offJob), 'the offline job needs no secret');
});

test('③ the offline run executes over the real registry, replays every cassette, and writes its report', () => {
  /* in a child process: the product modules need the globals a test that stubs `window` does not give them */
  const dir = mkdtempSync(join(tmpdir(), 'ops-next-off-'));
  try {
    const r = spawnSync(process.execPath, ['scripts/atlas-eval.mjs', '--offline', '--out', dir], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, 'every recorded turn replays as recorded: ' + (r.stderr || '').slice(-400));
    const rep = JSON.parse(readFileSync(join(dir, 'atlas-eval-offline.json'), 'utf8'));
    assert.equal(rep.schema, 'intmap-atlas-eval-offline/1');
    assert.ok(rep.reach.questions >= 50, 'every answer-key question that names its capabilities is measured');
    assert.equal(rep.reach.pairs, rep.reach.byQuestion.reduce((n, b) => n + b.expected.length, 0));
    for (const b of rep.reach.byQuestion) for (const e of b.expected) assert.ok(e.rank == null || (Number.isInteger(e.rank) && e.rank >= 1 && e.rank <= b.ranked));
    assert.equal(rep.replay.clean, rep.replay.cassettes);
    assert.ok(existsSync(join(dir, 'atlas-eval-offline.md')));
    assert.deepEqual(B.offlineSummary(rep, { id: 1, at: rep.at }).replay, { cassettes: rep.replay.cassettes, clean: rep.replay.clean });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
