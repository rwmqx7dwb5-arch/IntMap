/* ============================================================================
 *  shell-experience — 「IntMap のいま」, the supplier named on a failure, and the map's half of the window
 * ----------------------------------------------------------------------------
 *  What this round built (dev-notes/2026-10-03-shell-experience.md):
 *    · last night's checks (upstream-liveness.yml, atlas-eval.yml) shipped as data/service-status.json and read
 *      by the reader — the status page, a failed layer's pill, the data-sources lists, Atlas `diagnose`;
 *    · scripts/worktree.mjs status saying when the Atlas evaluation last succeeded and why it did not run;
 *    · the first-visit Layers panel opening only when the map keeps at least half the window.
 *  Every check below EVALUATES the code it is about (the pure halves are exported for that), and reads source
 *  only where the claim is about wiring between files.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* the browser modules read window/document at import; give them the least that lets them load */
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.document = globalThis.document || { documentElement: { lang: 'en' } };
await import('../js/safe-html.js');
const S = await import('../js/service-status.js');
const { hostMatches } = await import('../js/host-match.js');
const LIV = await import('../scripts/upstream-liveness.mjs');
const NS = await import('../scripts/lib/nightly-status.mjs');
const { classify } = await import('../js/layer-state.js');

const night = (at, verdicts, prevAt) => ({ measuredAt: at, hosts: Object.entries(verdicts).map(([host, verdict]) => ({ host, verdict, why: verdict, status: null })), transitions: prevAt ? { comparedWith: prevAt } : null });

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① one host rule: the liveness script and the browser use the same function', () => {
  assert.equal(LIV.hostMatches, hostMatches, 'scripts/upstream-liveness.mjs re-exports js/host-match.js — no copy');
  assert.ok(hostMatches('*.wikipedia.org', 'de.wikipedia.org'));
  assert.ok(!hostMatches('*.wikipedia.org', 'de.wikipediaxorg'));
  assert.ok(!/function hostMatches/.test(rd('scripts/upstream-liveness.mjs')), 'the script no longer carries its own matcher');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② the nightly result carries when a host last answered and since when it has not — only what was observed', () => {
  const a = night('2026-10-01T10:00:00Z', { h: 'alive', g: 'dead' });
  LIV.transitions(null, a);
  const ha = a.hosts.find((x) => x.host === 'h'), ga = a.hosts.find((x) => x.host === 'g');
  assert.equal(ha.lastAlive, '2026-10-01T10:00:00Z');
  assert.equal(ga.lastAlive, null, 'a host never seen alive has no lastAlive');
  assert.equal(ga.downSince, '2026-10-01T10:00:00Z', 'the first run of a down streak is its start');
  const b = night('2026-10-02T10:00:00Z', { h: 'dead', g: 'dead' });
  LIV.transitions(a, b);
  const hb = b.hosts.find((x) => x.host === 'h'), gb = b.hosts.find((x) => x.host === 'g');
  assert.equal(hb.lastAlive, '2026-10-01T10:00:00Z', 'carried from the night it answered');
  assert.equal(hb.downSince, '2026-10-02T10:00:00Z');
  assert.equal(gb.downSince, '2026-10-01T10:00:00Z', 'carried while the streak lasts');
  const c = night('2026-10-03T10:00:00Z', { h: 'unobserved', g: 'alive' });
  LIV.transitions(b, c);
  const hc = c.hosts.find((x) => x.host === 'h'), gc = c.hosts.find((x) => x.host === 'g');
  assert.equal(hc.lastAlive, '2026-10-01T10:00:00Z', '「確認できなかった」 neither moves nor clears it');
  assert.equal(hc.downSince, '2026-10-02T10:00:00Z');
  assert.equal(gc.lastAlive, '2026-10-03T10:00:00Z');
  assert.equal(gc.downSince, null);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ the reader digest: the ledger’s own words in both languages, and nothing inferred beyond the streak', () => {
  const ledger = { hosts: [{ host: 'x.example', what: 'X tiles', whatJp: 'X のタイル' }] };
  const r = night('2026-10-02T10:00:00Z', { 'x.example': 'dead', 'y.example': 'refused', 'z.example': 'alive' }, '2026-10-01T10:00:00Z');
  r.hosts[0].from = 'up'; r.hosts[0].streak = 1;      /* a result written before lastAlive existed */
  r.hosts[1].from = null; r.hosts[1].streak = 2;
  const d = NS.readerUpstreams(r, ledger);
  const x = d.hosts.find((h) => h.host === 'x.example'), y = d.hosts.find((h) => h.host === 'y.example'), z = d.hosts.find((h) => h.host === 'z.example');
  assert.equal(x.what, 'X tiles'); assert.equal(x.whatJp, 'X のタイル');
  assert.equal(x.lastAlive, '2026-10-01T10:00:00Z', 'down for 1 run after up ⇒ the previous run saw it');
  assert.equal(x.downSince, '2026-10-02T10:00:00Z');
  assert.equal(y.lastAlive, null, 'down since the series began: no date is invented');
  assert.equal(y.downSince, null);
  assert.equal(y.runs, 2);
  assert.ok(!('what' in y), 'a host the ledger does not describe is given no words');
  assert.equal(z.lastAlive, '2026-10-02T10:00:00Z');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ the Atlas evaluation: 「測っていない」 is its own answer, apart from the run’s colour', () => {
  const runs = { total: 3, runs: [
    { id: 3, status: 'completed', conclusion: 'failure', createdAt: '2026-10-02T11:00:00Z', url: 'u3' },
    { id: 2, status: 'completed', conclusion: 'failure', createdAt: '2026-10-01T11:00:00Z', url: 'u2' },
    { id: 1, status: 'completed', conclusion: 'failure', createdAt: '2026-09-30T11:00:00Z', url: 'u1' },
  ] };
  const s = NS.atlasEvalState(runs, { 3: { report: false, why: ['missing repository secret(s): A B. Nothing was measured.'], step: 'Require the secrets' } });
  assert.equal(s.lastSuccessAt, null);
  assert.equal(s.failingRuns, 3);
  assert.equal(s.latest.measured, false);
  const line = NS.atlasEvalLine(s);
  assert.equal(line.ok, false);
  assert.match(line.text, /成功 0 回（全 3 回/);
  assert.match(line.text, /評価の前に停止（何も測っていない）: missing repository secret/);
  const green = NS.atlasEvalState({ total: 2, runs: [{ id: 5, status: 'completed', conclusion: 'success', createdAt: '2026-10-03T11:00:00Z' }, runs.runs[0]] }, { 5: { report: true, why: [] } });
  assert.equal(green.lastSuccessAt, '2026-10-03T11:00:00Z');
  assert.equal(green.lastReportAt, '2026-10-03T11:00:00Z');
  assert.equal(NS.atlasEvalLine(green).ok, true);
  assert.equal(NS.atlasEvalState(null), null, 'nothing read is not «green»');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ every host the nightly check probes has words for the reader in en and jp (CONSTITUTION §7)', () => {
  const L = JSON.parse(rd('scripts/outbound-hosts.json'));
  const probed = L.hosts.filter((h) => h.probe && h.probe.url);
  assert.ok(probed.length > 100, `the probed rows were read (${probed.length})`);
  const missing = probed.filter((h) => !(typeof h.what === 'string' && h.what.trim() && typeof h.whatJp === 'string' && h.whatJp.trim())).map((h) => h.host);
  assert.deepEqual(missing, [], 'a probed host without `what` + `whatJp` would be shown to a Japanese reader in English');
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────── */
const B = { upstream: { measuredAt: '2026-10-02T10:44:42Z', networkObserved: true, hosts: [
  { host: 'api.gdeltproject.org', verdict: 'refused', status: 429, what: 'GDELT', whatJp: 'GDELT', runs: 2, lastAlive: null, downSince: null },
  { host: 'celestrak.org', verdict: 'dead', what: 'CelesTrak', whatJp: 'CelesTrak', runs: 1, lastAlive: '2026-10-01T11:11:26Z', downSince: '2026-10-02T10:44:42Z' },
  { host: '*.wikipedia.org', verdict: 'alive', what: 'Wikipedia', whatJp: 'ウィキペディア', lastAlive: '2026-10-02T10:44:42Z' },
  { host: 'gibs.earthdata.nasa.gov', verdict: 'dead', what: 'GIBS', whatJp: 'GIBS', runs: 1 },
] }, atlasEval: { total: 8, windowFrom: '2026-09-25T10:30:34Z', lastSuccessAt: null, failingRuns: 8, latest: { at: '2026-10-02T11:18:07Z', conclusion: 'failure', measured: false, why: ['missing repository secret(s)'] } } };

test('⑥ a failed request is joined to its supplier by the URL it asked — through a relay, by the target it carries', () => {
  const relay = 'https://vpek.supabase.co/functions/v1/gdelt-relay?u=' + encodeURIComponent('https://api.gdeltproject.org/api/v2/doc/doc?query=x');
  assert.equal(S.requestHost(relay), 'api.gdeltproject.org');
  assert.equal(S.requestHost('https://celestrak.org/NORAD/elements/gp.php'), 'celestrak.org');
  assert.equal(S.requestHost('not a url at all'), null);
  assert.equal(S.upstreamFor(B, 'de.wikipedia.org').host, '*.wikipedia.org', 'the ledger’s pattern rows match');
  assert.equal(S.upstreamFor(B, 'unknown.example'), null, 'a host the measurement does not list is not called alive — it is not mentioned');
  /* a credit links the homepage; the browser asks the API host under it */
  assert.deepEqual(S.upstreamsForSource(B, 'https://www.gdeltproject.org/').map((r) => r.host), ['api.gdeltproject.org']);
  /* ⚠ never a registrable-domain guess: a NASA credit elsewhere does not inherit GIBS's verdict */
  assert.deepEqual(S.upstreamsForSource(B, 'https://firms.modaps.eosdis.nasa.gov/').map((r) => r.host), []);
  assert.equal(S.sourceNote(B, 'https://earthquake.usgs.gov/', 'en'), '', 'a supplier that answered adds nothing to its credit');
});

test('⑥b the sentences say only what was measured, in en and jp', () => {
  const g = S.upstreamFor(B, 'api.gdeltproject.org'), c = S.upstreamFor(B, 'celestrak.org'), w = S.upstreamFor(B, 'en.wikipedia.org');
  assert.match(S.upstreamSentence(g, 'en'), /refusing requests \(HTTP 429\) in the last 2 nightly checks\./);
  assert.match(S.upstreamSentence(g, 'jp'), /要求を拒否しています（毎晩の確認：HTTP 429・2 回続けて）。/);
  assert.ok(!/since|から/.test(S.upstreamSentence(g, 'en') + S.upstreamSentence(g, 'jp')), 'no 「since」 nobody measured');
  assert.match(S.upstreamSentence(c, 'en'), /has not been answering since .*; it last answered /);
  assert.match(S.upstreamSentence(c, 'jp'), /応答していません（毎晩の確認：.* から・最後に応答 .*）。/);
  assert.match(S.upstreamSentence(w, 'jp', B.upstream.measuredAt), /応答していました/);
});

test('⑥c the page: the headline follows the worst thing that is true, and an unread record is never 「all good」', () => {
  const base = { bundle: B, online: true, shell: true, storageMB: 12, layersOn: 1, layerProblems: [] };
  for (const lang of ['en', 'jp']) {
    const s = S.composeStatus(base, lang);
    assert.deepEqual(s.sections.map((x) => x.id), ['device', 'layers', 'upstream', 'atlas']);
    assert.equal(s.tone, 'warn');
    const up = s.sections.find((x) => x.id === 'upstream');
    assert.equal(up.rows.length, 1 + 3, 'the count row and one row per supplier not answering');
    assert.equal(up.all.length, 4, 'and every supplier, in the expandable list');
    const at = s.sections.find((x) => x.id === 'atlas');
    assert.equal(at.rows[0].tone, 'warn', 'never evaluated is said, not hidden');
  }
  assert.equal(S.composeStatus({ ...base, online: false }, 'en').tone, 'bad');
  assert.match(S.composeStatus({ ...base, layerProblems: [{ label: 'Radar', state: 'failed', detail: 'x' }] }, 'jp').headline, /描けていないレイヤー/);
  const allUp = { upstream: { ...B.upstream, hosts: [B.upstream.hosts[2]] }, atlasEval: { ...B.atlasEval, lastSuccessAt: '2026-10-02T12:00:00Z', latest: { conclusion: 'success' } } };
  assert.equal(S.composeStatus({ ...base, bundle: allUp }, 'en').tone, 'ok');
  const unread = S.composeStatus({ ...base, bundle: null }, 'en');
  const u = unread.sections.find((x) => x.id === 'upstream').rows[0];
  assert.equal(u.tone, 'muted', 'an unread measurement is muted — neither green nor red');
  const blind = S.composeStatus({ ...base, bundle: { upstream: { ...B.upstream, networkObserved: false } } }, 'en');
  assert.match(blind.sections.find((x) => x.id === 'upstream').rows[0].title, /measured nothing/);
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────── */
test('⑦ the shipped bundle states its own provenance in-band and lists only hosts the ledger knows', async () => {
  const b = JSON.parse(rd('data/service-status.json'));
  const head = Object.keys(b).slice(0, 13);
  for (const k of ['publisher', 'licence', 'licenceUrl', 'cadence', 'builtBy', 'schema', 'generatedAt', 'retrievedAt', 'asOf', 'quality']) assert.ok(head.includes(k), `in-band ${k} is at the head`);
  const L = new Set(JSON.parse(rd('scripts/outbound-hosts.json')).hosts.map((h) => h.host));
  if (b.upstream) for (const h of b.upstream.hosts) assert.ok(L.has(h.host), `${h.host} is a ledger row`);
  assert.equal(b.quality.rows, b.upstream ? b.upstream.hosts.length : 0);
  /* ⚠ the bundle carries its own `unread` list (empty when both halves were read) — the reader's test of
     「was it read」 must accept it. Measured: the first draft tested `!b.unread`, and an empty array is truthy,
     so every good bundle was shown as 「could not be read」 (caught by the spec in tests/ui-a11y-polish.spec.js). */
  assert.equal(S.usable(b), true, 'the shipped bundle is a usable measurement');
  assert.equal(S.usable({ unreadable: 'network' }), false);
  assert.equal(S.usable(null), false);
  const { compose, GOVERNANCE, OUT } = await import('../scripts/build-service-status.mjs');
  assert.equal(OUT, 'data/service-status.json');
  assert.ok(GOVERNANCE[OUT] && GOVERNANCE[OUT].cadence === 'P1D' && GOVERNANCE[OUT].cadenceBasis, 'the builder declares the cadence and why');
  const c = compose({ liveness: null, ledger: { hosts: [] }, atlasEval: null, unread: [{ half: 'upstream', why: 'x' }], now: new Date('2026-10-03T00:00:00Z') });
  assert.equal(c.upstream, null, 'a half that was not read is null, not an old answer dressed as new');
  assert.equal(c.unread.length, 1);
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────── */
test('⑧ the shared readers put the URL on what they throw, and the layer record keeps it', () => {
  const fd = rd('js/fetch-deadline.js');
  assert.match(fd, /'timeout', \{ url: String\(url\) \}/);
  assert.match(fd, /'http', \{ status: r\.status, url: String\(url\) \}/);
  assert.match(rd('js/proxy-fetch.js'), /'http', \{ status: r\.status, url: u \}/);
  const e = Object.assign(new Error('http 429'), { reason: 'http', status: 429, url: 'https://celestrak.org/x' });
  assert.deepEqual(classify(e), { state: 'failed', reason: 'http', status: 429, url: 'https://celestrak.org/x' });
  const t = Object.assign(new Error('deadline'), { reason: 'timeout', url: 'https://celestrak.org/x' });
  assert.equal(classify(t).url, 'https://celestrak.org/x');
  const ls = rd('js/layer-state.js');
  assert.match(ls, /import\('\.\/service-status\.js'\)/, 'the status module is fetched on demand, never on the boot path');
  assert.ok(!/^import .*service-status/m.test(ls), 'no static import of it');
  assert.match(ls, /export const statusPage = \{/, 'the page has an eager handle for Settings and Atlas');
  assert.match(ls, /m\.open\(statusCtx\(\)\)/, 'the layer records are handed to the page, not read back through a global');
  const code = codeOnly(rd('js/service-status.js'));
  assert.ok(!/IntMapLayerState|layer-state/.test(code), 'service-status.js (also loaded raw by sources.html) does not reach for the layer module');
});

/* ── ⑨ ─────────────────────────────────────────────────────────────────────── */
test('⑨ the first-visit Layers panel leaves the map at least half the window; a restored choice is the reader’s', () => {
  const ui = rd('js/map-ui.js');
  const at = ui.indexOf('const roomy=()=>');
  assert.ok(at > 0, 'the rule exists');
  const block = ui.slice(at, at + 900);
  assert.match(block, /\(left\+right\)<=W\/2/, 'the panels together cover at most half the window');
  assert.match(block, /if\(unanswered&&!roomy\(\)\)/, 'only the unanswered first visit is held back');
  assert.match(block, /requestIdleCallback\(\(\)=>\{ try\{ if\(roomy\(\)\) open\(\); \}/, 'and it is asked again at the moment it would open');
  assert.match(block, /else open\(\);/, 'a restored right:true still opens');
});

/* ── ⑩ ─────────────────────────────────────────────────────────────────────── */
test('⑩ the bundle reaches the site through the one unattended path, and the operator is told about the evaluation', () => {
  const y = rd('.github/workflows/tle-refresh.yml');
  assert.match(y, /node scripts\/build-service-status\.mjs/);
  assert.match(y, /git add data\/tle data\/service-status\.json/);
  assert.match(y, /checks: read/, 'the failing step’s annotation needs it');
  const w = rd('scripts/worktree.mjs');
  assert.match(w, /import \{ fetchAtlasEval, atlasEvalLine \} from '\.\/lib\/nightly-status\.mjs'/);
  assert.equal((w.match(/atlasEval\(\)/g) || []).length, 3, 'defined once, read by the brief and the full status');
  assert.match(rd('index.html'), /id="btn-status-page"/);
  assert.match(rd('js/atlas-cap-system.js'), /statusPage\.describe\(\)/, 'Atlas diagnose reads the same page');
});
