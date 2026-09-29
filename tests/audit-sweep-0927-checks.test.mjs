/* ============================================================================
 *  audit-sweep-0927 — 多面的な監査（2026-09-27）で直したものの回帰
 * ----------------------------------------------------------------------------
 *  ① IntMapSafe.url() の結果は、それ単体で引用符つき属性に入れて無害（正本 js/safe-html.js を評価する）
 *  ② ファイル台帳の木（docs/FILES.md）の本数・実在・「全件」名簿を実体に訊く（ledger-claims）
 *  ③ 通知（*toast）に裸の文字列を渡した箇所を、関数名から発見して数える（i18n-sink-literal-audit）
 *  ④ main に着地する定期 workflow は、GITHUB_TOKEN の push が起こさない deploy を自分で起動する
 *  ⑤ 中継の死活プローブは記事を本文で判定する（Content-Type を書き換える基盤の上でも生きていると言える）
 *  記録: dev-notes/2026-09-27-audit-sweep-0927.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① ─────────────────────────────────────────────────────────────────────── */
/* the real encoder — js/safe-html.js since safe-output-single-module (it was index.html's inline block) */
const safe = (() => {
  const ctx = {};
  vm.runInNewContext(rd('js/safe-html.js'), ctx);
  return ctx.IntMapSafe;
})();

test('① url(): a URL with a quote in it can no longer close the attribute it is put in', () => {
  const hostile = [
    'https://x/" onmouseover="alert(1)',
    "https://x/' onfocus='alert(1)",
    'https://x/a"><script>alert(1)</script>',
    'https://x/`x`',
    'mailto:a@b.com?subject=" onclick="x',
    'tel:+81 3"1234',
  ];
  for (const h of hostile) {
    const out = safe.url(h);
    assert.ok(out.length > 0, `${h} keeps its (allowed) scheme`);
    assert.doesNotMatch(out, /["'<>`\s]/, `${JSON.stringify(h)} → ${JSON.stringify(out)} is inert in a quoted attribute`);
    /* what a browser would request is the same address: the encoding is the one the URL parser applies */
    assert.equal(decodeURIComponent(out), h.replace(/[\t\n\r]/g, ''), 'percent-decoding gives back what was asked for');
  }
});

test('① url(): ordinary URLs are untouched, and the scheme check still refuses', () => {
  for (const u of ['https://example.com/a?b=1&c=2#d', 'http://example.org/x', 'mailto:a@b.com', 'https://ja.wikipedia.org/wiki/東京']) {
    assert.equal(safe.url(u), u);
  }
  for (const u of ['javascript:alert(1)', ' java\tscript:alert(1)', 'data:text/html,<b>', 'vbscript:x']) {
    assert.equal(safe.url(u), '');
  }
  assert.equal(safe.url('data:image/svg+xml;base64,x', { allowData: true }), '');
  assert.equal(safe.url('data:image/png;base64,iVBOR', { allowData: true }), 'data:image/png;base64,iVBOR');
  /* composing with html() stays correct: nothing is double-encoded */
  assert.equal(safe.html(safe.url('https://x/"a')), 'https://x/%22a');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
const { auditLedger, ledgerRows, countGlob, statedCount } = await import('../scripts/ledger-claims.mjs');

test('② ledger: the real docs/FILES.md agrees with the tree, and a full roster is declared', () => {
  const r = auditLedger(rd('docs/FILES.md'), ROOT);
  assert.deepEqual(r.problems, []);
  assert.ok(r.located >= 50, `the rooted rows were actually read (${r.located})`);
  assert.ok(r.rosters >= 1, '.github/workflows/ declares itself complete');
  const wf = readdirSync(join(ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml'));
  const listed = new Set(ledgerRows(rd('docs/FILES.md')).filter((x) => x.path.startsWith('.github/workflows/')).map((x) => x.name));
  for (const f of wf) assert.ok(listed.has(f), `${f} is in the ledger`);
});

test('② ledger: each of the three drifts it was written for goes red', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  try {
    mkdirSync(join(dir, 'tests'));
    mkdirSync(join(dir, 'wf'));
    for (const f of ['a_test.sql', 'b_test.sql', 'c.spec.js']) writeFileSync(join(dir, 'tests', f), '');
    for (const f of ['ci.yml', 'sweep.yml']) writeFileSync(join(dir, 'wf', f), '');
    const md = ['```', 'tests/', '  *_test.sql        pgTAP（1本）', '  c.spec.js         ある', '  gone.spec.js      無い',
      'wf/                 （全件）', '  ci.yml            CI', '```'].join('\n');
    const r = auditLedger(md, dir);
    const kinds = Object.fromEntries(r.problems.map((p) => [p.kind, p]));
    assert.equal(kinds.count.actual, 2);
    assert.equal(kinds.count.stated, 1);
    assert.equal(kinds.missing.path, 'tests/gone.spec.js');
    assert.deepEqual(kinds.omits.names, ['sweep.yml']);
    assert.equal(countGlob(dir, 'tests/*_test.sql'), 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(statedCount('pgTAP（構造 ＋ 関数。13本）'), 13);
  assert.equal(statedCount('Edge Functions（20本。一覧は §6.2）'), 20);
  assert.equal(statedCount('本数は書かない'), null);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
const sinks = await import('../scripts/i18n-sink-literal-audit.mjs');

test('③ notices: a bare literal handed to any *toast is found, whatever the helper is called', () => {
  const src = [
    "imToast('Map not ready');",
    'HOST.aiToast("地図");',
    'window.satToast(`Loading`);',
    "imToast(window.IntMapLang.t(lang,'Map not ready','地図'));",
    'imToast(`${n} items`);',
    "imToast('✓');",
  ].join('\n');
  const hits = sinks.sinkLiterals(src);
  assert.deepEqual(hits.map((h) => h.text), ['Map not ready', '地図', 'Loading']);
  assert.deepEqual(hits.map((h) => h.line), [1, 2, 3]);
  const r = sinks.audit(ROOT);
  assert.ok(r.files > 100, `js/ was walked (${r.files})`);
  assert.deepEqual(r.findings, [], 'no notice in js/ is handed a bare literal');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ a workflow that lands on main with GITHUB_TOKEN also starts the deploy', () => {
  const dir = join(ROOT, '.github/workflows');
  const landers = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
    const y = readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    const lands = /gh pr merge\b/.test(y) || /git push\b[^\n]*\bmain\b/.test(y);
    if (!lands || !/github\.token|GITHUB_TOKEN/.test(y)) continue;
    landers.push(f);
    assert.match(y, /gh workflow run deploy\.yml/, `${f} lands on main with GITHUB_TOKEN, whose push starts no deploy`);
  }
  assert.ok(landers.includes('tle-refresh.yml'), `the sweep found the one lander that exists today (${landers.join(', ')})`);
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ the relay probe calls an article alive by its body, not by the gateway-rewritten type', async () => {
  const page = '<!doctype html><html><head><meta name="description" content="x"></head><body>'
    + '<p>' + 'word '.repeat(1200) + '</p></body></html>';
  const server = createServer((req, res) => {
    if (req.url.startsWith('/page')) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(page); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"error":"upstream_status"}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { discover, probe } = await import('../scripts/probe-relay-ladder.mjs');
    const article = (await discover()).find((t) => t.as === 'html');
    assert.ok(article, 'the article rung is among the probe targets');
    assert.equal(typeof article.body, 'function', 'it is judged by a body predicate');
    const alive = await probe({ ...article, relayUrl: `${base}/page` });
    assert.equal(alive.alive, true, 'HTML under text/plain is a working relay');
    const envelope = await probe({ ...article, relayUrl: `${base}/refusal` });
    assert.equal(envelope.alive, false, 'the relay\'s own JSON refusal is not the document');
  } finally { server.close(); }
});
