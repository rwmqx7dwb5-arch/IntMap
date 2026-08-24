/* ============================================================================
 *  #R419 — 「Atlasに経路を聞いたときの挙動がバグっている」の回帰テスト
 * ----------------------------------------------------------------------------
 *  報告は 2 枚のスクリーンショットだった。1 枚目は 1 本の会話全体である:
 *
 *      利用者: ここから大阪駅まで行きたい。
 *      ■ 停止しました
 *      利用者: 公共交通機関
 *      ■ 停止しました
 *      利用者: 電車・公共交通機関
 *      ■ 停止しました
 *      利用者: 電車・公共交通機関
 *      Atlas: 現在地から大阪まで、電車・公共交通機関の経路を検索します。
 *             「公共交通機関でどこへ行きますか？」 [名古屋駅][中部国際空港][栄駅][行き先を入力する]
 *             「電車・公共交通機関について、どれを表示しますか？」 [現在地周辺の駅・路線][…]
 *             5 件の候補 — タップで地図に表示   ← 経路は出ている
 *
 *  行き先は最初の 1 文に書いてある。停止は 3 回。答え終わった経路の下に、
 *  もう用の無い質問カードが 2 枚、生きたまま残っている。**4 つの機構がそれぞれ壊れていた**:
 *
 *   ① `ask_user` は turn を終わらせなかった。js/atlas-agent.js のループにとって普通の道具で、
 *      {ok:true} を返すと次の step へ進む。だから 1 回の turn が「質問し、もう一度質問し、
 *      それでも経路を引く」ことができた。⑴ が再現し、⑵ が「戻したら赤い」を実測する。
 *   ② 質問カードが **turn の実行中に** 出るので、答えると `run()` が `_runGen` を上げてその turn を
 *      supersede する。そして cancel は `bubble.innerHTML=_cancelledNote()` ——**bubble ごと**
 *      置き換えていた。だから利用者がいま答えた質問そのものが消え、「停止しました」だけが残った。
 *   ③ `actLabel()` は `a.question` を読んでいなかった。`_hist` に入るのはこの label なので、
 *      「公共交通機関でどこへ行きますか？」と訊いた turn は `ask ""` として記録された。
 *      **次の turn から見ると、Atlas は一度も質問していない。**だからまた訊いた。
 *   ④ 2 枚目のスクリーンショット（「1940年のリトアニアでは何が起きていた？」）は同じ形の別の面である。
 *      監査が裏付けの取れない claim を全部削り、「裏付けを確認できなかった記述は…取り除きました」
 *      と正直に描いたのに、**Atlas に返る結果は {ok:true, status:'completed'} のままだった**ので、
 *      Atlas の締めの 1 文は「日付順に整理した解説を表示しました」——画面に無い文書の話をしていた。
 *      執行器が verdict を組み直すときに dispatch 自身の `meta` を捨てていたのが経路上の原因。
 *
 *  ⚠ どれも Atlas の権限を削っていない（CONSTITUTION.md §5）。訊くかどうか・何を訊くか・
 *  どの道具を使うかは今も Atlas が決める。変わったのは **機構が本当のことを言うか** だけ。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasTurnContinuity } = await import('../js/atlas-turn-continuity.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();
const TCONT = makeAtlasTurnContinuity();

/* ⚠ CODE, NOT PROSE. Comments and string bodies become spaces so a check cannot go red on the very
   comment that explains it — the self-hit this repository has now made more than a dozen times
   (memory/intmap-recurring-lessons.md). Same helper as tests/r413-checks.test.mjs. */
function code(src) {
  let out = '', i = 0, inBlock = false;
  const NL = String.fromCharCode(10), BS = String.fromCharCode(92);
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; out += '  '; i += 2; } else { out += c === NL ? NL : ' '; i++; } continue; }
    if (c === '/' && c2 === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '/' && c2 === '/') { while (i < src.length && src[i] !== NL) { out += ' '; i++; } continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < src.length) {
        if (src[i] === BS) { out += '  '; i += 2; continue; }
        if (src[i] === q) { out += ' '; i++; break; }
        out += src[i] === NL ? NL : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

const CONSOLE_SRC = rd('js/atlas-console.js');

/* ══ THE REPORTED TURN, through the real loop over the real surface ═════════════════════════════
   The script is what the transcript shows the model doing: ask, ask again, route anyway, then a
   closing sentence. What is asserted is what the LOOP does with that — not that a good model would
   choose differently, which is the model's business (tests/r406-turn.test.mjs's standing rule). */
function reportedScript() {
  return [
    { text: '', toolCalls: [{ id: 'a', name: 'ask_user', arguments: { question: '公共交通機関でどこへ行きますか？', options: ['名古屋駅', '中部国際空港（セントレア）', '栄駅'] } }] },
    { text: '', toolCalls: [{ id: 'b', name: 'ask_user', arguments: { question: '電車・公共交通機関について、どれを表示しますか？', options: ['現在地周辺の駅・路線', '現在地から目的地までの乗換案内'] } }] },
    { text: '', toolCalls: [{ id: 'c', name: 'run_capability', arguments: { id: 'routing.route', args: { from: '現在地', to: '大阪駅' } } }] },
    { text: '現在地から大阪まで、電車・公共交通機関の経路を検索します。', toolCalls: [] },
  ];
}

async function turn(script, opts = {}) {
  const ran = [];
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return { ok: true, html: '<div>x</div>', meta: { status: 'completed', produced: ['explanation'] } }; },
  });
  const tools = surface.baseTools();
  if (opts.strip) opts.strip(tools);
  let execute = surface.makeExecute(tools, AGENT);
  if (opts.wrapExecute) execute = opts.wrapExecute(execute);
  let i = 0, modelCalls = 0;
  const model = async (req) => { modelCalls++; const r = script[Math.min(i, script.length - 1)]; i++; return typeof r === 'function' ? r(req) : r; };
  const out = await AGENT.runTurn({
    model, tools, execute,
    messages: [{ role: 'user', content: 'ここから大阪駅まで行きたい。' }],
  });
  return { out, ran, modelCalls, tools };
}

/* ── ① the transcript cannot happen any more ────────────────────────────────────────────────── */

test('R419 ①: a question to the reader ENDS the turn — no second question, no route behind their back', async () => {
  const { out, ran } = await turn(reportedScript());
  const types = ran.map((a) => a.type);
  assert.deepEqual(types, ['ask'], 'the turn kept operating after it had asked: ' + JSON.stringify(types));
  assert.equal(out.stopped, 'awaiting_user', 'the loop did not record that it is waiting on the reader');
  assert.equal(ran.length, 1, 'more than one thing reached the dispatch after a question was put');
  /* and the closing sentence of the reported transcript — written while two questions stood
     unanswered — is not produced at all, because there is no step left to write it in. */
  assert.equal(out.text, '', 'the turn narrated an answer over the top of its own unanswered question');
});

test('R419 ②: MUTATION — take the flag off and the reported transcript comes straight back', async () => {
  /* BOTH declarations have to go: the one on the tool descriptor and the one the surface stamps on
     the RESULT for the run_capability door. That the first alone does not restore the defect is
     itself the point of ④ — either door closes the turn. */
  const { out, ran } = await turn(reportedScript(), {
    strip: (tools) => { Object.keys(tools).forEach((k) => { delete tools[k].endsTurn; }); },
    wrapExecute: (ex) => async (call) => { const r = await ex(call); if (r && typeof r === 'object') delete r.endsTurn; return r; },
  });
  const types = ran.map((a) => a.type);
  assert.deepEqual(types, ['ask', 'ask', 'directions'],
    'the check cannot go red — without the flag the loop should ask twice and route anyway, and did not: ' + JSON.stringify(types));
  assert.equal(out.text, '現在地から大阪まで、電車・公共交通機関の経路を検索します。');
});

test('R419 ③: a second call in the SAME reply is refused after the question, and never runs', async () => {
  const { out, ran } = await turn([
    { text: '', toolCalls: [
      { id: 'a', name: 'ask_user', arguments: { question: 'どちらで行きますか？', options: ['電車', '車'] } },
      { id: 'b', name: 'map_view', arguments: { place: '大阪駅' } },
    ] },
    { text: 'done', toolCalls: [] },
  ]);
  assert.deepEqual(ran.map((a) => a.type), ['ask'], 'the map moved under an unanswered question');
  /* the step OFFERED two calls and EXECUTED one — the second was refused before the dispatch, the
     same way a schema rejection is, and never became a result. */
  const step = out.trace.steps.find((s) => s.toolCalls);
  assert.equal(step.toolCalls, 2, 'the step did not offer two calls, so this proves nothing');
  assert.equal(step.executed, 1, 'the call after the question still ran');
  /* and it is not CHARGED, either — a call that never reached a tool must not spend the turn's
     budget, so the reader's next turn starts with everything it should have. */
  assert.equal(out.calls, 1, 'the refused call was billed to the turn anyway');
  assert.equal(out.stopped, 'awaiting_user');
});

test('R419 ④: the other door — reaching dialog.ask by id through run_capability ends it too', async () => {
  const { out, ran } = await turn([
    { text: '', toolCalls: [{ id: 'a', name: 'run_capability', arguments: { id: 'dialog.ask', args: { question: 'どちらで行きますか？', options: ['電車', '車'] } } }] },
    { text: '', toolCalls: [{ id: 'b', name: 'map_view', arguments: { place: '大阪駅' } }] },
    { text: 'done', toolCalls: [] },
  ]);
  assert.deepEqual(ran.map((a) => a.type), ['ask'],
    'a question asked by capability id did not end the turn — the flag is only being read off the tool name');
  assert.equal(out.stopped, 'awaiting_user');
});

test('R419 ⑤: a turn that ended on a question spends NO extra model call writing under it', async () => {
  const { modelCalls, out } = await turn([
    { text: '', toolCalls: [{ id: 'a', name: 'ask_user', arguments: { question: 'どちらで行きますか？', options: ['電車', '車'] } }] },
    { text: 'should never be reached', toolCalls: [] },
  ]);
  assert.equal(out.stopped, 'awaiting_user');
  assert.equal(modelCalls, 1, 'the forced [WRITE THE ANSWER] step still fires after a question (' + modelCalls + ' model calls)');
  assert.equal(out.text, '');
});

test('R419 ⑥: a question that FAILED to render does not strand the reader — the turn continues', async () => {
  const ran = [];
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => { ran.push(action); return (action.type === 'ask') ? { ok: false, meta: { code: 'failed' }, error: 'no picker' } : { ok: true, html: '<div>x</div>', meta: { status: 'completed' } }; },
  });
  const tools = surface.baseTools();
  const script = [
    { text: '', toolCalls: [{ id: 'a', name: 'ask_user', arguments: { question: 'どちらで行きますか？', options: ['電車', '車'] } }] },
    { text: '', toolCalls: [{ id: 'b', name: 'map_view', arguments: { place: '大阪駅' } }] },
    { text: '大阪駅を表示しました。', toolCalls: [] },
  ];
  let i = 0;
  const out = await AGENT.runTurn({
    model: async () => script[Math.min(i, script.length - 1)] && script[i++],
    tools, execute: surface.makeExecute(tools, AGENT),
    messages: [{ role: 'user', content: 'ここから大阪駅まで行きたい。' }],
  });
  assert.notEqual(out.stopped, 'awaiting_user', 'a question that never reached the reader still ended the turn');
  assert.deepEqual(ran.map((a) => a.type), ['ask', 'flyTo']);
});

/* ── ⑦ the question is recorded, so the next turn can see what the reader is answering ───────── */

test('R419 ⑦: actionLabel carries the question text — not an empty pair of quotes', () => {
  const q = '公共交通機関でどこへ行きますか？';
  const label = TCONT.actionLabel({ type: 'ask', question: q, options: ['名古屋駅', '栄駅'] });
  assert.ok(label.indexOf(q) >= 0, 'the question is still not in the record: ' + JSON.stringify(label));
  /* a question is a sentence, and half a sentence is not a question the next turn can match an
     answer to — the 26-character cut that applies to every other field must not apply here */
  const long = 'あ'.repeat(120) + '？';
  assert.ok(TCONT.actionLabel({ type: 'ask', question: long }).indexOf(long) >= 0, 'the question is being truncated again');
  /* every other kind of step keeps the short label it always had */
  assert.equal(TCONT.actionLabel({ type: 'flyTo', place: '大阪駅' }), 'flyTo "大阪駅"');
  assert.equal(TCONT.actionLabel({ type: 'flyTo', place: 'x'.repeat(40) }).length, 'flyTo ""'.length + 26);
  /* all four spellings of the same capability, because the dispatch case accepts all four */
  ['ask', 'choose', 'clarify', 'options'].forEach((t) => {
    assert.ok(TCONT.actionLabel({ type: t, question: q }).indexOf(q) >= 0, t + ' is not recognised as a question');
  });
});

test('R419 ⑧: the question becomes its OWN conversation line, with the options offered', () => {
  const rec = TCONT.askRecords([
    { type: 'flyTo', place: '大阪駅' },
    { type: 'ask', question: '公共交通機関でどこへ行きますか？', options: ['名古屋駅', { label: '栄駅' }] },
  ]);
  assert.equal(rec.length, 1, 'one question in, ' + rec.length + ' records out');
  assert.ok(rec[0].indexOf('公共交通機関でどこへ行きますか？') >= 0, 'the question did not reach the record');
  assert.ok(rec[0].indexOf('名古屋駅') >= 0 && rec[0].indexOf('栄駅') >= 0,
    'the options were not recorded — a chip label with no question is not a sentence');
  assert.match(rec[0], /NEXT message is the answer/,
    'nothing tells the next turn that the reader message IS the answer to this');
  /* a question with no text is not a record of anything */
  assert.deepEqual(TCONT.askRecords([{ type: 'ask', options: ['a'] }]), []);
});

test('R419 ⑧b: the console files that line itself, and keeps the question out of the truncated list', () => {
  const c = code(CONSOLE_SRC);
  assert.match(c, /TCONT\.askRecords\(kept\)\.forEach\(s=>_hist\.push/,
    'recordTurn no longer files the questions as their own history lines');
  assert.match(c, /kept\.filter\(a=>!TCONT\.isAsk\(a\)\)\.map\(actLabel\)/,
    'the question is back inside the `did:` list, which is cut at 260 characters');
  assert.match(c, /function actLabel\(a\)\{ return TCONT\.actionLabel\(a\); \}/,
    'the console has its own label function again — two spellings of the same rule');
});

/* ── ⑨ stopping a turn does not erase what it already put on the page ────────────────────────── */

function fakeBubble(kids) {
  const b = {
    kids: kids.slice(),
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      const idx = b.kids.findIndex((k) => k.cls === cls);
      if (idx < 0) return null;
      return { className: cls, parentNode: { replaceChild(nu) { b.kids[idx] = { cls: nu.className, html: nu.innerHTML }; } } };
    },
    insertAdjacentHTML(where, html) { b.kids.push({ cls: 'atl-cancelled', html }); },
    get innerHTML() { return b.kids.map((k) => '<div class="' + k.cls + '">' + k.html + '</div>').join(''); },
    set innerHTML(v) { b.kids = String(v).trim() ? [{ cls: '', html: String(v) }] : []; },
  };
  return b;
}
const NOTE = '<span>停止しました</span>';

test('R419 ⑨: cancelling a turn keeps the question it had already rendered', () => {
  /* the bubble in the reported transcript: the picker is on the page, the thinking dots are gone
     (the compose after the first action removes them), and then the turn is superseded. */
  const b = fakeBubble([{ cls: 'atl-choice-ui', html: '公共交通機関でどこへ行きますか？' }]);
  TCONT.markCancelled(b, NOTE);
  assert.ok(b.innerHTML.indexOf('公共交通機関でどこへ行きますか？') >= 0,
    'the question the reader had just answered was erased by the Stopped note');
  assert.ok(b.innerHTML.indexOf('停止しました') >= 0, 'the turn was not marked stopped at all');
  /* several cancel paths can run over one bubble — say it once */
  TCONT.markCancelled(b, NOTE);
  assert.equal(b.innerHTML.split('停止しました').length - 1, 1, 'the Stopped note was painted twice');
});

test('R419 ⑨b: a bubble that never got past the thinking dots is still replaced whole', () => {
  const b = fakeBubble([{ cls: 'atl-stage', html: '考えています' }]);
  TCONT.markCancelled(b, NOTE);
  assert.ok(b.innerHTML.indexOf('停止しました') >= 0);
  assert.ok(b.innerHTML.indexOf('考えています') < 0, 'the dead thinking indicator survived next to the Stopped note');
});

test('R419 ⑨c: MUTATION — no call site paints the note over a whole bubble any more', () => {
  const c = code(CONSOLE_SRC);
  const offenders = c.split(/\r?\n/)
    .map((l, n) => ({ l, n: n + 1 }))
    .filter((x) => /innerHTML\s*=\s*_cancelledNote\(\)/.test(x.l));
  assert.deepEqual(offenders.map((x) => x.n), [],
    'a cancel path still replaces the whole bubble: line(s) ' + offenders.map((x) => x.n).join(', '));
  assert.match(c, /_markCancelled\(b\)\{ TCONT\.markCancelled/, 'the console stopped delegating to the module');
});

test('R419 ⑨d: the kernel did not grow to hold any of this', () => {
  /* tests/r318-checks.test.mjs ⑨b is the ceiling; this says WHY there is a new file at all.
     js/atlas-console.js shipped at 4,909 lines against a ceiling of 4,910 — one line of headroom —
     so #R199's rule applies without interpretation: the kernel shrinks by MOVING. */
  assert.ok(CONSOLE_SRC.split(String.fromCharCode(10)).length < 4_910, 'js/atlas-console.js grew past its shrink-only ceiling');
  assert.ok(rd('js/atlas-turn-continuity.js').length > 2_000, 'the module that was supposed to hold it is empty');
});

/* ── ⑩ a gutted answer is not reported as a finished one ─────────────────────────────────────── */

test('R419 ⑩: a DEGRADED analysis reaches Atlas as degraded, with what was removed', async () => {
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    /* what js/atlas-console.js's analyze case now returns when its audit removed every claim it
       could not tie to an evidence record — the 1940 Lithuania answer. */
    runAction: async () => ({ ok: true, html: '<div class="atl-degraded">…</div>',
      meta: { status: 'completed', produced: ['explanation'], degraded: true, removedClaims: 7,
        unverified: 'DEGRADED: the answer audit removed 7 claim(s) …' } }),
  });
  const tools = surface.baseTools();
  const out = await surface.makeExecute(tools, AGENT)({ name: 'research', arguments: { question: '1940年のリトアニアでは何が起きていた？' } });
  assert.equal(out.ok, true, 'the tool did run and did render — that part was never in doubt');
  assert.equal(out.status, 'degraded', 'Atlas is still told the gutted answer "completed"');
  assert.equal(out.removedClaims, 7, 'Atlas is not told how much was removed');
  assert.match(String(out.unverified), /DEGRADED/, 'the reason did not survive to the one deciding what to say');
});

test('R419 ⑩b: an ordinary analysis is untouched — no new hedge on an answer that passed', async () => {
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async () => ({ ok: true, html: '<div>answer</div>', meta: { status: 'completed', produced: ['explanation'] } }),
  });
  const tools = surface.baseTools();
  const out = await surface.makeExecute(tools, AGENT)({ name: 'research', arguments: { question: 'x' } });
  assert.equal(out.status, 'completed');
  assert.equal(out.removedClaims, undefined);
  assert.equal(out.unverified, undefined);
});

test('R419 ⑪: the executor carries the dispatch case\'s own meta into the result', () => {
  const c = code(rd('js/atlas-executor.js'));
  assert.match(c, /raw\.meta/,
    'js/atlas-executor.js builds the result from the verdict alone again — everything the case said '
    + 'about itself in `meta` dies before Atlas can read it, which is how a degraded answer came out '
    + 'the far end as "completed"');
  /* and the verdict still wins any key it also sets — `status`, `code` and `ok` stay derived from
     what the app was watched doing (#R318), never asserted by the case. */
  assert.match(c, /_base\.meta\s*=\s*Object\.assign\(\{\},[^;]*raw[^;]*,[^;]*_base\.meta/,
    'the merge order is reversed — the case can now overwrite the verifier');
});

/* ── ⑫ the surface still declares the fact once, next to the tool it belongs to ──────────────── */

test('R419 ⑫: exactly one tool is declared turn-ending, and it is the one that asks the reader', () => {
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: async () => ({ ok: true }) });
  const tools = surface.baseTools();
  const ending = Object.keys(tools).filter((k) => tools[k].endsTurn);
  assert.deepEqual(ending, ['ask_user'], 'the turn-ending set changed: ' + JSON.stringify(ending));
  assert.equal(tools.ask_user.capabilityId, 'dialog.ask');
  assert.match(tools.ask_user.description, /ENDS the turn/,
    'the tool no longer tells its caller that calling it is the end of the turn');
});
