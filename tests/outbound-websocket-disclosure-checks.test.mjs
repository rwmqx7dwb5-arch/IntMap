/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  outbound-websocket-disclosure — 送信先の発見器が http(s) しか読まず、WebSocket が台帳にも
 *  プライバシー本文の照合にも入っていなかった
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥: scripts/outbound-hosts.mjs の URL の正規表現は `https?://` だけを読んでいたので、
 *  js/data-layers.js の `new WebSocket('wss://stream.aisstream.io/v0/stream')`（読者自身の AIS キー
 *  と表示中の地図範囲を第三者へ送る）が発見されず、scripts/outbound-hosts.json にも Privacy §4 の
 *  照合にも入っていなかった。さらに母集合は「ルートの *.html」だけで、vite.config.js の
 *  STATIC_ASSETS が配る ja/*.html・s/*.html は一度も読まれていなかった。
 *
 *  ここで測るのは「aisstream の行があるか」ではなく、**どの API・どのネットワーク scheme で新しい
 *  送信先が足されても規則が赤くなるか**である。作業ツリーは書き換えず、ファイル一覧を差し替えて
 *  規則（check）を実際に評価する:
 *    ① 今のリポジトリは緑で、wss:// の送信先が発見され、その語句が §4 に英日ともある
 *    ② ws / wss / ftp / https を WebSocket・EventSource・sendBeacon・import()・Worker・
 *       importScripts に渡す新しいリテラルは、どれも台帳に無ければ赤
 *    ③ 自前で登録する scheme（om:// imapsat://）とコメントの中の wss:// は送信先ではない
 *    ④ 台帳から wss の行を消すと赤
 *    ⑤ 配られる入れ子のページ（STATIC_ASSETS 由来）が母集合に入り、そこに足した送信先は赤
 *    ⑥ AIS のキーがブラウザ内にだけ保存されることを §2 が英日で述べる
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { check, browserFiles, readLedger, privacySection4, discover, LEGAL } from '../scripts/outbound-hosts.mjs';
import { viteStaticAssets } from '../scripts/runtime-scripts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = browserFiles(ROOT);
const LEDGER_NOW = readLedger(ROOT);
const LEGAL_NOW = readFileSync(join(ROOT, LEGAL), 'utf8');
const run = (over = {}) => check({ files: FILES, ledger: LEDGER_NOW, legalSource: LEGAL_NOW, ...over });
const clone = (x) => JSON.parse(JSON.stringify(x));

/* the WebSocket recipients are read from what the discoverer finds, not named here */
const socketHosts = () => [...new Set(discover(FILES).filter((o) => !o.link && !o.dynamic)
  .filter((o) => /\bwss?:\/\/[^'"`\s]*/.test(FILES.find((f) => f.file === o.file).text.split('\n')[o.line - 1]))
  .map((o) => o.host))];

test('① the repository is green, and a wss:// recipient is discovered and disclosed in en and jp', () => {
  const r = run();
  assert.deepEqual(r.problems, [], r.problems.join('\n'));
  const hosts = socketHosts();
  assert.ok(hosts.length > 0, 'no ws:// or wss:// recipient was discovered — the scheme is no longer read');
  const sec4 = privacySection4(LEGAL_NOW);
  for (const host of hosts) {
    const row = LEDGER_NOW.hosts.find((h) => h.host === host);
    assert.ok(row && row.disclosure, `${host} is a WebSocket recipient with no disclosure row`);
    for (const lang of ['en', 'jp']) assert.ok(sec4[lang].includes(row.disclosure[lang]), `${host}: the ${lang} words are not in §4`);
  }
});

const PROBE = 'js/zz-outbound-probe.js';
const CASES = [
  ['ws', "new WebSocket('ws://ws-plain.example/feed');", 'ws-plain.example'],
  ['wss', 'const s = new WebSocket(`wss://wss-tpl.example/v1/${id}`);', 'wss-tpl.example'],
  ['ftp', "fetch('ftp://ftp-host.example/file');", 'ftp-host.example'],
  ['EventSource', "new EventSource('https://sse-host.example/events');", 'sse-host.example'],
  ['sendBeacon', "navigator.sendBeacon('https://beacon-host.example/b', blob);", 'beacon-host.example'],
  ['import()', "import('https://esm-host.example/mod.js');", 'esm-host.example'],
  ['Worker', "new Worker('https://worker-host.example/w.js');", 'worker-host.example'],
  ['importScripts', "importScripts('https://isc-host.example/s.js');", 'isc-host.example'],
];

test('② a new recipient is red whatever API receives it and whatever network scheme names it', () => {
  for (const [label, code, host] of CASES) {
    const r = run({ files: FILES.concat([{ file: PROBE, text: 'const id = 1, blob = null;\n' + code + '\n' }]) });
    assert.ok(r.problems.some((p) => p.startsWith(host + ' is requested')), `${label}: ${host} was not reported\n` + r.problems.join('\n'));
  }
});

test('③ an in-page scheme and a wss:// in a comment are not recipients', () => {
  const text = "// new WebSocket('wss://in-comment.example/x')\nconst u = 'om://in-page.example/latest.json';\nconst v = 'imapsat://2/0/2';\n";
  const occ = discover([{ file: PROBE, text }]);
  assert.deepEqual(occ.map((o) => o.host), [], 'reported: ' + occ.map((o) => o.host).join(', '));
});

test('④ removing the WebSocket row from the ledger turns it red', () => {
  for (const host of socketHosts()) {
    const ledger = clone(LEDGER_NOW);
    ledger.hosts = ledger.hosts.filter((h) => h.host !== host);
    assert.ok(run({ ledger }).problems.some((p) => p.startsWith(host + ' is requested')), host + ' stayed green without its row');
  }
});

test('⑤ every .html page the build copies is in the universe, and a recipient added to one is red', () => {
  const vite = viteStaticAssets(readFileSync(join(ROOT, 'vite.config.js'), 'utf8'));
  const excluded = (f) => vite.exclude.some((x) => f === x || f.startsWith(x.replace(/\/$/, '') + '/'));
  const served = execFileSync('git', ['ls-files', '-z', '--', ...vite.assets], { cwd: ROOT }).toString('utf8')
    .split('\0').filter((f) => f.endsWith('.html') && !excluded(f));
  const nested = served.filter((f) => f.includes('/'));
  assert.ok(nested.length > 0, 'the build copies no nested page — this case has nothing to measure');
  const have = new Set(FILES.map((f) => f.file));
  for (const f of served) assert.ok(have.has(f), f + ' is served by the build and not read by the discoverer');
  const page = nested[0];
  const files = FILES.map((f) => (f.file === page ? { file: page, text: f.text.replace(/<\/head>/i, '<script src="https://nested-page.example/x.js"></script></head>') } : f));
  assert.ok(run({ files }).problems.some((p) => p.startsWith('nested-page.example is requested')), page + ': a <script src> there was not reported');
});

test('⑥ Privacy §2 says the reader\'s own AIS key is kept in the browser, in en and jp', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(LEGAL_NOW, sandbox, { filename: LEGAL });
  const L = sandbox.window.IntMapLegalText;
  for (const lang of ['en', 'jp']) {
    const sec2 = (/<p><b>2\.[\s\S]*?<\/p>/.exec(L.html('privacy', lang)) || [''])[0];
    assert.ok(/aisstream\.io/.test(sec2), `Privacy §2 (${lang}) does not name the aisstream.io key among what stays in the browser`);
  }
});
