/* ============================================================================
 *  #R472 — 監査は「報告」に戻った。回答を消す権限を持っていたのが欠陥だった
 * ----------------------------------------------------------------------------
 *  報告:「ちゃんと観光情報を答えた直後に、自分で『証拠がありません』と言い始める」。画面には
 *  Atlas 自身の回答（「前の案内を訂正します——養老公園です」）と、その下に `analyze` が描いた
 *  「⚠ 裏付けを確認できなかった記述は、この回答から取り除きました」が縦に並んでいた。
 *
 *  ⚠⚠⚠ **本番で実測してから直した。** `analysis_structured` では hosted web search は走っている
 *    （`webUsed:true`・検索2回）のに、provider が返す citation 注釈は **0 件**である。同じ質問・
 *    同じ schema・同じ webMode で、違いは system prompt だけ:
 *
 *        IntMap の ANSWER CONTRACT あり → 引用 **0** 件
 *        ANSWER CONTRACT なし           → 引用 **2** 件
 *
 *    注釈はモデルが URL を書いた場所に付く。IntMap の契約は「URL を書くな」と言う。
 *    **つまり `hosted_web` の記録は、この経路では構造上ぜったいに台帳へ入らない。**
 *
 *  ⚠⚠⚠ **その結果、正しい回答が消されていた。** モデルは2回の検索で赤坂スポーツ公園・住所・
 *    見頃を正しく書いた。欠けていたのは「文とページを結ぶ id」だけで、**その id が存在し得ない
 *    のは IntMap 自身の規則のせい**である。監査は `evidence.primary_unsupported` を上げ、
 *    修復は同じ空の一覧を見せられて「无法核实」と書き、`degrade()` が全 claim を削除し、
 *    `directAnswer.text` が空になり、呼び出し側が「分析没有回传结果」を出した。**道具は何も返さない。**
 *
 *  ⚠⚠ **並んでいた2つ目の回答は、1つ目の正しい下流である。** 中身を抜かれたと告げられた Atlas が
 *    自分で答え直したのは #R419 の設計どおり。**原因は1つで、2つではない。**
 *
 *  直し方は機構を足すことではない——**機構を外すこと**だった。
 *
 *    · `degrade()`     削除。コードが回答を書き換えることは、もう無い。
 *    · `repairBrief()` と修復の呼び出し  削除。**正常経路も異常経路も 1 回になった。**
 *    · 劣化バナー      削除（消すものが無いのだから、告げる中身も無い）。
 *    · 監査は残る。全コードが今までどおり発火し、その結果は開発トレースと **Atlas** へ渡る。
 *
 *  ⚠ **読者の保護は 1 つも減っていない。** #R350 を名づけた保証——「モデルが捏造した URL が
 *    リンクとして読者に届かない」——は **renderer と registry** にある（`stripModelUrls()` と、
 *    台帳の記録からしか作られない出典カード）。`degrade()` はそれを守ってはいなかった。
 *    **削っていただけである。** ⑤ がそれを測る。
 *
 *  ⚠ (#R345 の形) この検査は自分の説明文を読んではならない。上の見出しには `degrade` も
 *    `repairBrief` も書いてある。製品側は `codeOnly()` で注記を剥がしてから見る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const PL = (await import('../js/atlas-answer-pipeline.js')).makeAtlasAnswerPipeline();
const AU = (await import('../js/atlas-answer-audit.js')).makeAtlasAnswerAudit();
const RN = (await import('../js/atlas-answer-render.js')).makeAtlasAnswerRender();
const EV = (await import('../js/atlas-evidence.js')).makeAtlasEvidence();

/* ══ THE REPORTED TURN, AS PRODUCTION ACTUALLY PRODUCED IT ═══════════════════════════════════════
   The hosted search RAN, the provider returned ZERO citations (measured on the live site), and the
   only thing IntMap had gathered for a question about wisteria was a Japanese earthquake feed. */
const ANSWER = () => ({
  directAnswer: { text: '岐阜県で藤の名所として知られる公園は、大垣市の赤坂スポーツ公園です。', claimIds: ['c1'] },
  sections: [{ id: 's1', heading: '所在地と見頃', blocks: [{ type: 'text', text: '所在地は大垣市草道島町40-1、見頃は例年4月下旬〜5月です。', claimIds: ['c2'] }] }],
  limitations: [],
  claims: [
    { id: 'c1', text: '赤坂スポーツ公園は岐阜県の代表的な藤の名所である。', claimType: 'fact', importance: 'primary', dimension: 'level', confidence: 'high', evidenceIds: [], basedOn: [] },
    { id: 'c2', text: '所在地は大垣市草道島町40-1で、見頃は例年4月下旬から5月である。', claimType: 'fact', importance: 'major', dimension: 'level', confidence: 'high', evidenceIds: [], basedOn: [] },
  ],
  places: [],
});

function scripted(over) {
  const seen = [];
  const ask = async (prompt, system, opts) => {
    seen.push({ callId: opts.callId, webMode: opts.webMode, prompt });
    const a = ANSWER();
    return { text: JSON.stringify(a), data: a,
      meta: { webUsed: opts.webMode !== 'off' }, citations: [], callId: opts.callId };
  };
  return { seen, opts: Object.assign({
    question: '岐阜県で藤の名所はどこ？', dataBlock: '[TIME CONTEXT]\nr472\n\n', systemPrompt: 'SYS',
    language: 'Japanese', temporalMode: 'current', requestedOutputs: ['explanation'], turnId: 't-r472',
    webMode: 'auto',
    clientSources: [{ url: 'https://example.org/quake', title: '日本の地震', src: 'USGS', date: '2026-08-25' }],
    appFacts: [], retrievedAt: 'r472-2026-08-25',
    ask, parseJSON: (t) => { try { return JSON.parse(t); } catch (_) { return null; } },
  }, over || {}) };
}

/* ── ① 報告そのもの: 回答が消えない ─────────────────────────────────────────────────────
   ⚠ 修正前は degraded / 2件中0件 / 主文が空文字列 → 呼び出し側の「分析没有回传结果」。 */
test('R472 ①: 引用が1件も返らない本番の条件でも、回答はそのまま読者に届く', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  assert.equal(out.env.claims.length, 2, '主張が削られた: ' + out.env.claims.length + '/2');
  assert.equal(out.env.answer.directAnswer.text, ANSWER().directAnswer.text, '主文が別の文に差し替わった');
  assert.equal(out.env.answer.sections.length, 1, '節が消えた');
  assert.equal(out.env.audit.status, 'findings', '監査の状態: ' + out.env.audit.status);
  assert.ok(out.audit.errors.some((e) => e.code === 'evidence.primary_unsupported'),
    '監査は今までどおり所見を上げること——直したのは判定ではなく、判定の権限である');
});

/* ── ② 正常経路も異常経路も 1 回 ────────────────────────────────────────────────────── */
test('R472 ②: 監査が所見を上げても、モデルへの問い合わせは 1 回のまま', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  assert.equal(s.seen.length, 1, 'モデルを ' + s.seen.length + ' 回呼んでいる');
  assert.equal(out.trace.calls.length, 1, 'トレースが 2 回目を記録している');
});

/* ── ③ 監査は Atlas へ報告する（判決ではなく所見として） ──────────────────────────────── */
test('R472 ③: 所見はコードのまま Atlas へ渡り、「取り除いた」とは言わない', async () => {
  const s = scripted();
  const out = await PL.runStructuredAnswer(s.opts);
  const meta = PL.auditMeta(out.env);
  assert.ok(meta, '所見があるのに Atlas へ何も渡していない');
  assert.ok(meta.auditFindings.includes('evidence.primary_unsupported'), JSON.stringify(meta.auditFindings));
  assert.match(String(meta.unverified), /rendered in full/,
    'Atlas に「全文が画面に出ている」と伝えていない——#R419 はこれを伝えないことで壊れた');
  assert.ok(!/removed|gutted|取り除/.test(String(meta.unverified)),
    '何も取り除いていないのに、取り除いたと言っている');
  assert.equal(meta.degraded, undefined, 'degraded の旗が残っている');
  assert.equal(meta.removedClaims, undefined, 'removedClaims が残っている');
});

test('R472 ③b: 所見が無ければ Atlas に余計な但し書きを渡さない', async () => {
  /* 監査が何も上げない最小の答え: 主文があり、それが primary を引く */
  const env = { answer: { directAnswer: ANSWER().directAnswer, sections: [], limitations: [] }, claims: [], places: [], audit: { status: 'passed', errors: [], warnings: [] } };
  assert.equal(PL.auditMeta(env), null, '所見ゼロの回答に但し書きが付いている');
});

/* ── ④ 機構が消えていること（形として） ──────────────────────────────────────────────
   ⚠ 「使われていない」ではなく「無い」。#R350 ⑨ と同じ主張の仕方。 */
test('R472 ④: 回答を書き換える／問い直す機構がソースから消えている', () => {
  const audit = CODE('js/atlas-answer-audit.js');
  const pipe = CODE('js/atlas-answer-pipeline.js');
  const render = CODE('js/atlas-answer-render.js');
  assert.ok(!/function\s+degrade\s*\(/.test(audit), 'degrade() がまだ在る');
  assert.ok(!/function\s+repairBrief\s*\(/.test(audit), 'repairBrief() がまだ在る');
  assert.equal(AU.degrade, undefined, 'degrade がまだ公開されている');
  assert.equal(AU.repairBrief, undefined, 'repairBrief がまだ公開されている');
  assert.equal(PL.MAX_MODEL_CALLS, undefined, '呼び出し回数の上限がまだ在る——数えるものが無いのだから');
  assert.equal(PL.degradeMeta, undefined, 'degradeMeta がまだ公開されている');
  const asks = pipe.match(/await\s+ask\(/g) || [];
  assert.equal(asks.length, 1, 'パイプラインの ask() が ' + asks.length + ' か所ある');
  assert.ok(!/atl-degraded/.test(render), '劣化バナーの綴りが renderer に残っている');
  assert.ok(!/atl-degraded/.test(CODE('js/atlas-console.js')), '劣化バナーの綴りが kernel に残っている');
});

/* ── ⑤ 読者の保護は 1 つも減っていない ───────────────────────────────────────────────
   ⚠⚠ 「制限は増やすな」は逆向きにも効く——**検査を外して通したのではない**ことを、
   外せる場所ごとに測る。#R350 を名づけた保証は renderer と registry にあって degrade には無い。 */
test('R472 ⑤a: モデルが書いた URL は、今でもリンクにならない', () => {
  const e = { answer: { directAnswer: { text: '詳しくは https://fabricated.example.com/x を参照。', claimIds: [] }, sections: [], limitations: [] }, claims: [], places: [], audit: { status: 'findings', errors: [], warnings: [] } };
  const reg = EV.makeEvidenceRegistry({ callId: 'c', turnId: 't', retrievedAt: 'now' });
  const html = RN.renderAnswer(e, reg, { L: (en) => en, esc: (s2) => String(s2), mdMini: (s2) => String(s2), linkCards: () => '' });
  assert.ok(!/<a[ >]/.test(html), '捏造 URL がリンクになった');
  assert.ok(!/https?:\/\//.test(html), '踏める形の URL が本文に残っている');
  assert.match(html, /fabricated\.example\.com/, 'stripModelUrlsはホスト名だけを残す——消してしまうと文が壊れる');
});

test('R472 ⑤b: 出典カードは今でも台帳の記録からしか作られない', () => {
  const reg = EV.makeEvidenceRegistry({ callId: 'c', turnId: 't', retrievedAt: 'now' });
  assert.deepEqual(reg.addProviderCitations([{ url: 'https://x.example.org/a', title: 'A' }], { webUsed: false }), [],
    '検索が走っていないのに hosted_web の記録が作れる');
  assert.deepEqual(reg.addProviderCitations([{ url: 'https://x.example.org/a', title: 'A' }], { webUsed: true, callId: 'other' }), [],
    '別の呼び出しの引用が入り込める');
  assert.equal(reg.size(), 0);
});

test('R472 ⑤c: 監査規則は 1 つも消えていない', () => {
  const codes = Object.keys(AU.AUDIT_CODES);
  assert.ok(codes.length >= 39, 'AUDIT_CODES が ' + codes.length + ' 件に減っている（実測 39）');
  ['evidence.primary_unsupported', 'schema.unknown_evidence_ref', 'url.raw_in_prose', 'url.host_in_prose',
    'web.unverified_label', 'citation.call_mismatch', 'metric.value_unsupported', 'contradiction.superlative_beaten',
  ].forEach((c) => assert.ok(codes.includes(c), c + ' が AUDIT_CODES から消えている'));
  const src = CODE('js/atlas-answer-audit.js');
  const raised = new Set([...src.matchAll(/push\('([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]));
  codes.forEach((c) => assert.ok(raised.has(c), c + ' は宣言されているが、もう誰も上げない'));
});

/* ── ⑥ プロンプトが嘘をつかない ────────────────────────────────────────────────────
   ⚠ 「これが存在する全ての出典だ」は、検索がこれから走る呼び出しに対しては偽である。
   そして IntMap が記事を1本も持たない問いでは、それが**空の一覧**についての宣言だった。 */
test('R472 ⑥a: 検索が走る呼び出しに「これが存在する全ての出典だ」と言わない', async () => {
  const s = scripted();
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.ok(!/only sources that exist/i.test(p), '検索が走るのに一覧を「完全」と宣言している');
  assert.match(p, /no id here yet/i, '検索で開くページに id が無いことを伝えていない');
  assert.match(p, /is a fabrication/i, '一覧に無い id が捏造であるという歯止めが消えた');
});

test('R472 ⑥b: 検索を使わない呼び出しでは、その一覧は本当に完全なのでそう言う', async () => {
  const s = scripted({ webMode: 'off' });
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.match(p, /\[e1\]/, '事前に集めた出典が呼び出しに出ていない');
  assert.match(p, /only sources that exist/i, '検索が走らない呼び出しからも強い指示が消えた');
  assert.ok(!/no id here yet/i.test(p), '検索が走らないのに「まだ id が無い」と言っている');
});

test('R472 ⑥c: 台帳が空でも、答えるなとは言わない', async () => {
  const s = scripted({ clientSources: [] });
  await PL.runStructuredAnswer(s.opts);
  const p = s.seen[0].prompt;
  assert.match(p, /IntMap holds no source of its own/i, '空であることを伝えていない');
  assert.match(p, /never invent an id/i, '捏造の歯止めが消えた');
});
