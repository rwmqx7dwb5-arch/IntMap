/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  outbound-hosts-disclosed — プライバシーの説明が、ブラウザが実際に通信する先と一度も照合されていなかった
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥: js/legal-text.js の Privacy §4（英日それぞれ 16 KB の手書きの散文）と、ブラウザの
 *  コードが要求しうるホストは、一度も突き合わされていなかった。実測で、読んでいる記事の URL を
 *  受け取る r.jina.ai と、パスワードの SHA-1 の先頭 5 文字を受け取る api.pwnedpasswords.com を
 *  含む多数のホストが §4 に無かった（しかも記事は「まず報道機関から直接読む」と書かれていたが、
 *  実際の 1 段目は Jina AI だった）。
 *
 *  ここで測るのは「台帳ファイルがあるか」ではなく、**規則が事実の変化で赤くなるか**である。
 *  規則（scripts/outbound-hosts.mjs の check）を、作業ツリーを書き換えずに、ファイル・台帳・
 *  §4 の本文を差し替えて実際に評価する:
 *    ① 今のリポジトリは緑で、母集合は空ではない
 *    ② 台帳から 1 行消す → そのホストが赤
 *    ③ 開示の語句を片方の言語で 1 か所壊す → その言語で赤
 *    ④ js に新しいホストのリテラルを 1 つ足す → 赤。コメントの中・<a href> の中なら赤くならない
 *    ⑤ コードがもう要求しないホストが台帳に残る → 赤（台帳が古びない）
 *    ⑥ 眠っている送信先のスイッチが true になる → 赤（§4 が名指すまで）
 *    ⑦ check:datagov がこの規則を実際に走らせている
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { check, browserFiles, readLedger, privacySection4, discover, LEGAL, LEDGER } from '../scripts/outbound-hosts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = browserFiles(ROOT);
const LEDGER_NOW = readLedger(ROOT);
const LEGAL_NOW = readFileSync(join(ROOT, LEGAL), 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));
const run = (over = {}) => check({ files: FILES, ledger: LEDGER_NOW, legalSource: LEGAL_NOW, ...over });
const withFile = (file, edit) => FILES.map((f) => (f.file === file ? { file, text: edit(f.text) } : f));

/* a row that carries a disclosure, read from the ledger itself rather than named here */
const DISCLOSED = LEDGER_NOW.hosts.find((r) => r.disclosure && r.sends && r.sends.code === 'url')
  || LEDGER_NOW.hosts.find((r) => r.disclosure);

test('① the repository as it stands satisfies the rule, over a universe that is not empty', () => {
  const r = run();
  assert.deepEqual(r.problems, [], r.problems.join('\n'));
  assert.ok(r.requested.size > 50, `only ${r.requested.size} requested host(s) were discovered — the parser has stopped seeing the code`);
  assert.ok(LEDGER_NOW.hosts.length === new Set(LEDGER_NOW.hosts.map((h) => h.host)).size, 'a host is listed twice in ' + LEDGER);
  const sec4 = privacySection4(LEGAL_NOW);
  assert.ok(sec4.en && sec4.jp, 'Privacy §4 could not be read in both languages');
  /* the two recipients that carry something of the reader's are the ones this round exists for */
  for (const host of ['r.jina.ai', 'api.pwnedpasswords.com']) {
    const row = LEDGER_NOW.hosts.find((h) => h.host === host);
    assert.ok(row && row.disclosure, `${host} is not disclosed in ${LEDGER}`);
    assert.ok(sec4.en.includes(row.disclosure.en) && sec4.jp.includes(row.disclosure.jp), `${host}: its words are not in §4`);
  }
});

test('② removing a ledger row turns that host red', () => {
  const ledger = clone(LEDGER_NOW);
  ledger.hosts = ledger.hosts.filter((h) => h.host !== DISCLOSED.host);
  const r = run({ ledger });
  assert.ok(r.problems.some((p) => p.startsWith(DISCLOSED.host + ' is requested')), r.problems.join('\n') || 'no problem reported');
});

test('③ breaking a disclosure phrase in ONE language turns it red in that language only', () => {
  for (const lang of ['en', 'jp']) {
    const phrase = DISCLOSED.disclosure[lang];
    const other = lang === 'en' ? DISCLOSED.disclosure.jp : DISCLOSED.disclosure.en;
    /* the probe needs a row whose two phrases differ, or breaking one would break both */
    assert.ok(!other.includes(phrase), `«${phrase}» is also inside the other language's phrase — pick a row whose phrases differ`);
    const broken = LEGAL_NOW.split(phrase).join(phrase.split('').reverse().join(''));
    assert.notEqual(broken, LEGAL_NOW, `the ${lang} phrase «${phrase}» is not in ${LEGAL}`);
    const r = run({ legalSource: broken });
    assert.ok(r.problems.some((p) => p.includes(`${DISCLOSED.host}: the ${lang} disclosure`)), `${lang}: ` + (r.problems.join('\n') || 'no problem reported'));
    const otherLang = lang === 'en' ? 'jp' : 'en';
    assert.ok(!r.problems.some((p) => p.includes(`${DISCLOSED.host}: the ${otherLang} disclosure`)), `breaking ${lang} also reported ${otherLang}`);
  }
});

test('④ a new host in a js/ literal is red; the same URL in a comment or an <a href> is not', () => {
  const HOST = 'outbound-probe.example.org';
  const target = FILES.find((f) => f.file.startsWith('js/') && f.file.endsWith('.js')).file;
  const fetched = run({ files: withFile(target, (t) => t + `\n;fetch('https://${HOST}/v1/probe');\n`) });
  assert.ok(fetched.problems.some((p) => p.startsWith(HOST + ' is requested')), fetched.problems.join('\n') || 'no problem reported');

  /* assembled by concatenation, the host still counts — the shape CARTO's tiles had */
  const assembled = run({ files: withFile(target, (t) => t + `\n;var _z='https://'+(window.x||'a')+'.${HOST}/'+1;\n`) });
  assert.ok(assembled.problems.some((p) => p.startsWith('*.' + HOST + ' is requested')), assembled.problems.join('\n') || 'no problem reported');

  const commented = run({ files: withFile(target, (t) => t + `\n/* fetch('https://${HOST}/v1/probe') */\n`) });
  assert.deepEqual(commented.problems, [], 'a URL in a comment is not a request');

  const anchored = run({ files: withFile(target, (t) => t + `\n;var _a='<a href="https://${HOST}/about" target="_blank">x</a>';\n`) });
  assert.deepEqual(anchored.problems, [], 'an <a href> is a link, not a request');
  const occ = discover([{ file: 'js/probe.js', text: `var h='<a class="x" href="'+esc(u||('https://${HOST}/'+id))+'">';` }]);
  assert.equal(occ[0] && occ[0].link, 'anchor', 'an href assembled by concatenation is still an href');
});

test('⑤ a ledger row whose host the code no longer requests is red', () => {
  const ledger = clone(LEDGER_NOW);
  ledger.hosts.push({ host: 'gone.example.org', what: 'nothing any more', link: 'was a link' });
  const r = run({ ledger });
  assert.ok(r.problems.some((p) => p.includes('gone.example.org is no longer named')), r.problems.join('\n') || 'no problem reported');
});

test('⑥ a dormant recipient becomes red the day its switch turns true', () => {
  const dormant = LEDGER_NOW.hosts.find((h) => h.dormant);
  assert.ok(dormant, 'no dormant row to test with');
  const sw = dormant.dormant.switch;
  const files = withFile('index.html', (t) => t.replace(new RegExp(`window\\.${sw}\\s*=\\s*false\\s*;`), `window.${sw}=true;`));
  assert.notDeepEqual(files, FILES);
  const r = run({ files });
  assert.ok(r.problems.some((p) => p.startsWith(dormant.host + ' is dormant') && p.includes('TRUE')), r.problems.join('\n') || 'no problem reported');
});

test('⑦ check:datagov runs this rule (not a copy of it)', () => {
  const out = execFileSync(process.execPath, ['scripts/data-governance.mjs', '--check', '--rule=outbound-disclosed'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /ok\s+outbound-disclosed: \d+ host\(s\) the browser code can request/);
  assert.match(out, /ok\s+outbound-disclosed: every requested host is in scripts\/outbound-hosts\.json/);
});
