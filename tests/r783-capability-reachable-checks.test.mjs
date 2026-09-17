/* ============================================================================
 *  R783 — 宣言された引数で呼べない能力が 0 件であること（扉に届くか）
 * ----------------------------------------------------------------------------
 *  実測。#R773 は添付の取り寄せを実装し、その検査も 9 本緑だったのに、本物のターンで
 *  `run_capability{id:'attach.recall', args:{name:'paper.pdf'}}` は **dispatch に届かず**
 *  `needs_input`（「使用する値を教えてください」）で返っていた。`attach.recall` の唯一の引数は
 *  `name` で、10 列目が宣言した的 `'text'` を満たせる欄は `query/text/question/value/place/term`
 *  ——交わらない。同じ形が `data.radiationNear` にもあった（スキーマは `lat`/`lon` を必須にし、
 *  的 `'point'` は `lng` を読む）。**どちらも、自分のスキーマが許すどの呼び出しでも自分の的を
 *  満たせない能力**＝誰も開けられない扉だった。
 *
 *  ⚠ だからここは 2 件を名指ししない。名指しは 3 件目を見逃す。測るのは構造:
 *  **145 能力すべてについて、スキーマが宣言する欄を埋めた呼び出しが実際に dispatch へ届く**こと。
 *
 *  ⚠ そして「ソースを読む検査」ではない（#R505）。js/atlas-executor.js の本物のカーネルを
 *  install し、dispatch の位置に記録器を置いて、`OS.execute()` を **本当に走らせる**——
 *  availability ②・引数の検証 ③・的の解決 ④・lazy module まで、Atlas が通る道をそのまま通る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

/* カーネルは lazy module を `window.IntMapLazy` に訊く（step ⑤）。node にはそれが無く、
   ReferenceError は `unavailable` になって「届かなかった」を別の理由で作ってしまうので、
   ここでは何も読み込まない need() を置く——測っているのは扉であって読み込みではない。 */
globalThis.window = globalThis.window || {};
if (!globalThis.window.IntMapLazy) globalThis.window.IntMapLazy = { need: async () => {} };

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { installAtlasKernel } = await import('../js/atlas-executor.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasAgent } = await import('../js/atlas-agent.js');

const HOST = { lang: () => 'en' };

/* スキーマが述べた型・enum・下限・最小要素数・入れ子の必須欄に従って、その欄が取りうる最も
   素直な値を作る。⚠ 値の良さは問わない——`hasTarget` は「在るか」しか訊かないと自分で
   述べている。⚠ 入れ子まで降りるのは必須で、降りないと photo.locate の `area` のように
   **構成した呼び出し自身が不正**になり、測っているものが製品ではなく生成器になる（①b が
   それを見張る）。 */
function value(sc) {
  if (!sc) return 'x';
  if (Array.isArray(sc.enum) && sc.enum.length) return sc.enum[0];
  switch (sc.type) {
    case 'boolean': return true;
    case 'number': case 'integer': {
      let v = (sc.minimum != null && sc.maximum != null) ? (sc.minimum + sc.maximum) / 2
        : (sc.minimum != null ? sc.minimum : 1);
      return sc.type === 'integer' ? Math.round(v) : v;
    }
    case 'array': {
      const n = Math.max(1, sc.minItems || 1), out = [];
      for (let i = 0; i < n; i++) out.push(value(sc.items || { type: 'string' }));
      return out;
    }
    case 'object': return fill(sc);
    default: return 'x'.repeat(Math.max(1, sc.minLength || 1));
  }
}
function fill(sc) {
  const a = {};
  for (const k of Object.keys((sc && sc.properties) || {})) a[k] = value(sc.properties[k]);
  return a;
}
/* その能力が「引数なしでは働けない」と自分で述べているか（js/atlas-schemas.js の規則 3）。 */
function demandsArgs(sc) {
  if (!sc) return false;
  if (Array.isArray(sc.required) && sc.required.length) return true;
  return Array.isArray(sc.anyOf) && sc.anyOf.some((b) => Array.isArray(b.required) && b.required.length);
}

/* 本物のカーネルを 1 回だけ組む。dispatch の位置には記録器——「届いたか」は
   ステータスの綴りではなく、**engine の側が呼ばれた事実**で測る。 */
const CAPS = makeAtlasCapabilities(HOST);
const SCHEMAS = makeAtlasSchemas();
let received = null;
const dispatch = (a) => { received = a; return { ok: true, html: '' }; };
CAPS.bindRuntime({ schemas: SCHEMAS, dispatch: dispatch });
const OS = {};
installAtlasKernel(OS, HOST, { capabilities: CAPS });

async function run(id, args) {
  received = null;
  const r = await OS.execute(id, args);
  return { result: r, reached: received };
}

const SUBJECTS = CAPS.all().filter((c) => !c.withdrawn)
  .map((c) => ({ cap: c, sc: (() => { try { return SCHEMAS.schemaFor(c.id); } catch (_) { return null; } })() }))
  .filter((s) => s.sc && s.sc.properties && Object.keys(s.sc.properties).length);

test('R783 ①: スキーマが宣言する欄を埋めた呼び出しは、145 能力すべてで dispatch に届く', async () => {
  /* 母集合が縮めばこの検査は何も見ない（#R707 の床の分母）。今日の実測は 144。 */
  assert.ok(SUBJECTS.length >= 140, '引数スキーマを持つ能力が ' + SUBJECTS.length + ' 件しか見えていない');
  const unreachable = [];
  for (const { cap, sc } of SUBJECTS) {
    const { result, reached } = await run(cap.id, fill(sc));
    if (!reached) {
      unreachable.push(cap.id + ' → ' + result.status + '/' + result.code
        + ' (target «' + ((cap.targetPolicy && cap.targetPolicy.kind) || '') + '»'
        + ' / schema declares ' + Object.keys(sc.properties).join(', ') + ')');
    }
  }
  assert.deepEqual(unreachable, [],
    '自分のスキーマが許す呼び出しで自分の的を満たせない＝Atlas からはどう呼んでも読者への質問に落ちる。'
    + '直すのは事例ではなく 10 列目: スキーマが既にその引数を required にしているなら、'
    + 'js/atlas-capabilities.js の的の列は空であるべきで、門は required 1 つになる（②がそれを測る）。'
    + '⚠ hasTarget の欄名一覧に足して直してはならない——同じ的を持つ他の能力すべてで的の意味が緩む。');
});

test('R783 ①b: 構成した呼び出しはスキーマに適合している（測っているのは製品であって生成器ではない）', async () => {
  const rejected = [];
  for (const { cap, sc } of SUBJECTS) {
    const { result } = await run(cap.id, fill(sc));
    if (result.code === 'bad_args') rejected.push(cap.id + ' ' + JSON.stringify((result.observed && result.observed.errors) || []));
  }
  assert.deepEqual(rejected, [], 'カーネル自身が不正と述べた呼び出しで①を測っていた——値の生成器を直すこと');
});

test('R783 ②: 引数なしでは働けないと述べた能力は、引数なしの呼び出しを dispatch の前で拒む', async () => {
  /* ⚠ 的の列を空にすることが安全なのは、拒否が**消えず移った**ときだけ。移った先は
     js/atlas-toolsurface.js の 2 度目の検証で、そこが Atlas の送ったものを required ごと
     測る（カーネルの ③ は `inputSchema` が required を落とすので測らない——読者が押した
     ボタンの resume 経路を bad_args にしないため）。 */
  const agent = makeAtlasAgent();
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: SCHEMAS, runAction: dispatch });
  const tools = surface.baseTools();
  const execute = surface.makeExecute(tools, agent);
  const demanding = SUBJECTS.filter((s) => demandsArgs(s.sc));
  assert.ok(demanding.length >= 80, '引数を要求する能力が ' + demanding.length + ' 件しか見えていない');
  const slipped = [];
  for (const { cap } of demanding) {
    received = null;
    const r = await execute({ name: 'run_capability', arguments: { id: cap.id, args: {} } });
    if (r && r.ok !== false) slipped.push(cap.id + ' → accepted');
    else if (received) slipped.push(cap.id + ' → refused but the dispatch already ran');
  }
  assert.deepEqual(slipped, [],
    '自分で必須と述べた引数の無い呼び出しが engine に届いた。的の列を空にしてよいのは、'
    + 'スキーマの required がこの拒否を持っているときだけである（#R302 の退行条件）。');
});
