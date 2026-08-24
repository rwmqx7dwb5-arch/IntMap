/* ============================================================================
 *  R406 — A WHOLE TURN, FROM THE TYPED SENTENCE TO WHAT THE READER IS SHOWN
 * ----------------------------------------------------------------------------
 *  These drive the REAL modules — js/atlas-agent.js over js/atlas-toolsurface.js over the real
 *  js/atlas-capabilities.js registry and the real js/atlas-schemas.js table. Only two things are
 *  stubbed, and both are stubbed at the seams the browser itself injects: the model (a script) and
 *  the dispatch (a recorder). Everything between them is production code.
 *
 *  ⚠⚠⚠ NO ASSERTION HERE MAY DEPEND ON THE WORDS OF THE REQUEST, AND THE SUITE PROVES IT.
 *  Every scenario runs over a LIST of spellings of the same request — different punctuation, a
 *  missing question mark, a middle dot instead of one, a different language, a different word order
 *  — and asserts the outcome is IDENTICAL across all of them. 「セーヌ川の長さは・」 and
 *  「セーヌ川の長さは？」 differed only by U+30FB vs U+FF1F, and that one character decided whether
 *  IntMap thought a question had been asked. A test that pinned either spelling to an expected
 *  branch would be putting that defect back, in the test file (§11 of the work order says so).
 *
 *  ⚠ WHAT IS AND IS NOT BEING TESTED. The model's judgement is the model's; these tests do not
 *  assert that a good model chooses `map_view` for 「台湾へ移動して」. They assert what the LOOP does
 *  with a choice: that a direct answer runs nothing, that a call missing a required argument never
 *  reaches the dispatch, that the closing sentence is written after the results, and that none of it
 *  varies with how the sentence was spelt.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasAgent } = await import('../js/atlas-agent.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const AGENT = makeAtlasAgent();
const CAPS = makeAtlasCapabilities({});
const SCHEMAS = makeAtlasSchemas();

/* One turn, with the real surface over the real registry. `script` is a list of model replies (or
   functions of the request); `ran` collects the ACTION OBJECTS that reached the dispatch. */
async function turn(userText, script, opts = {}) {
  const ran = [];
  const rendered = new Set(opts.renders || []);
  const failing = new Set(opts.fails || []);
  const surface = makeAtlasToolSurface({
    capabilities: CAPS, schemas: SCHEMAS,
    runAction: async (action) => {
      ran.push(action);
      if (failing.has(action.type)) return { ok: false, meta: { code: 'not_found' }, error: 'no match' };
      return { ok: true, html: rendered.has(action.type) ? '<div>answer</div>' : '', meta: { status: 'completed', produced: ['map'] } };
    },
  });
  const tools = surface.baseTools();
  let i = 0;
  const seen = [];
  const model = async (req) => {
    seen.push(req);
    const r = script[Math.min(i, script.length - 1)];
    i++;
    return typeof r === 'function' ? r(req) : r;
  };
  const out = await AGENT.runTurn({
    model, tools, execute: surface.makeExecute(tools, AGENT),
    system: 'sys', messages: (opts.history || []).concat([{ role: 'user', content: userText }]),
  });
  return { out, ran, tools, seen, calls: i };
}

const answer = (t) => ({ text: t, toolCalls: [] });
const call = (name, args) => ({ text: '', toolCalls: [{ id: 'a', name, arguments: args }] });

/* Every scenario is run over these rewritings of "the same request". They are never inspected by
   the code under test — that is the point. */
const SPELLINGS = {
  plainQuestion: ['セーヌ川の長さは・', 'セーヌ川の長さは？', 'セーヌ川の長さは', 'セーヌ川は何km？',
    'How long is the Seine', 'Quelle est la longueur de la Seine ?', 'województwo dolnośląskieってどんな場所？',
    'seine length', '   セーヌ川の長さは。   '],
  mapRequest: ['セーヌ川を地図で表示して', '台湾へ移動して', 'フランスをハイライトして',
    'fly to Taiwan', 'zeig mir Taiwan', '台湾に行って', 'Taiwan'],
};

/* ── ① A DIRECT ANSWER IS A COMPLETE TURN, WHATEVER THE SENTENCE LOOKED LIKE ──────────────── */
test('R406-turn ①: a turn the model answers directly runs nothing and changes nothing — for every spelling', async () => {
  const seen = [];
  for (const q of SPELLINGS.plainQuestion) {
    const { out, ran, calls } = await turn(q, [answer('約777キロメートルです。')]);
    seen.push({ q, ran: ran.length, calls, text: out.text, stopped: out.stopped });
  }
  /* identical in every respect that matters — no action, one model call, the model's text */
  for (const r of seen) {
    assert.equal(r.ran, 0, `${r.q} executed ${r.ran} action(s) for a direct answer`);
    assert.equal(r.calls, 1, `${r.q} cost ${r.calls} model calls`);
    assert.equal(r.text, '約777キロメートルです。', `${r.q} lost the answer`);
    assert.equal(r.stopped, 'answered');
  }
  /* and the middle dot behaves exactly like the full-width question mark — the reported defect */
  const dot = seen.find((r) => r.q === 'セーヌ川の長さは・');
  const qm = seen.find((r) => r.q === 'セーヌ川の長さは？');
  assert.deepEqual({ ...dot, q: '' }, { ...qm, q: '' },
    'the middle dot and the question mark still take different paths');
});

/* ── ② THE TOOLS OFFERED DO NOT DEPEND ON THE REQUEST ─────────────────────────────────────── */
test('R406-turn ②: the same tools are offered for every request, and the catalogue is not among them', async () => {
  const sets = [];
  let biggest = 0;
  for (const q of SPELLINGS.plainQuestion.concat(SPELLINGS.mapRequest)) {
    const { tools, seen } = await turn(q, [answer('ok')]);
    sets.push(Object.keys(tools).sort().join(','));
    biggest = Math.max(biggest, JSON.stringify(seen[0].tools).length);
  }
  assert.equal(new Set(sets).size, 1, 'the tool surface varied with the wording of the request');
  /* the whole surface, schemas included, against the 64,250 characters of catalogue it replaced */
  assert.ok(biggest < 12_000, `the tool block is ${biggest} characters — it must not become the catalogue again`);
  const names = sets[0].split(',');
  assert.ok(names.includes('find_capability'), 'nothing can reach the capabilities that are not core tools');
  assert.ok(names.includes('run_capability'));
});

/* ── ③ AN EXPLICIT OPERATION REACHES THE DISPATCH AS THE ACTION IT ALWAYS WAS ─────────────── */
test('R406-turn ③: a map tool becomes the legacy action object, and success is reported after it ran', async () => {
  const order = [];
  const { out, ran } = await turn('台湾へ移動して', [
    call('map_view', { place: 'Taiwan' }),
    (req) => {
      order.push('model-2');
      const tool = req.messages.filter((m) => m.role === 'tool').pop();
      assert.equal(tool.content[0].ok, true, 'the model was not shown the result before answering');
      return answer('台湾へ移動しました。');
    },
  ]);
  assert.deepEqual(ran, [{ type: 'flyTo', place: 'Taiwan' }], 'the dispatch did not get the action it has always taken');
  assert.equal(out.text, '台湾へ移動しました。');
  assert.deepEqual(order, ['model-2'], 'the closing sentence was not written after the result');
});

/* ── ④ THE ARGUMENT-LESS ACTION NEVER REACHES EXECUTION ───────────────────────────────────── */
test('R406-turn ④: analyze without a question and highlight without a target are refused before they run', async () => {
  for (const [tool, args] of [['research', {}], ['highlight', {}], ['map_view', {}]]) {
    const { out, ran } = await turn('x', [call(tool, args), answer('done')]);
    assert.equal(ran.length, 0, `${tool} with no arguments reached the dispatch`);
    assert.equal(out.trace.rejected, 1, `${tool} was not rejected`);
    assert.equal(out.text, 'done', 'the reader was shown the rejection instead of an answer');
  }
});

test('R406-turn ⑤: the rejection is addressed to the model, names the field, and is never rendered', async () => {
  let secondReq = null;
  await turn('x', [
    call('research', {}),
    (req) => { secondReq = req; return answer('ok'); },
  ]);
  const tool = secondReq.messages.filter((m) => m.role === 'tool').pop();
  assert.equal(tool.content[0].ok, false);
  assert.equal(tool.content[0].error, 'invalid_arguments');
  assert.match(tool.content[0].message, /question/, 'the model was not told WHICH argument was missing');
  assert.ok(tool.content[0].schema, 'the model was not given the schema to correct against');
});

/* ── ⑥ DISCOVERY REACHES THE CAPABILITIES THAT ARE NOT CORE TOOLS ─────────────────────────── */
test('R406-turn ⑥: find_capability returns a few real capabilities with their real schemas', async () => {
  let found = null;
  await turn('x', [call('find_capability', { query: 'isochrone reachable area' }), (req) => {
    found = req.messages.filter((m) => m.role === 'tool').pop().content[0];
    return answer('ok');
  }]);
  assert.equal(found.ok, true);
  assert.ok(found.matches.length > 0, 'discovery found nothing for a real IntMap feature');
  /* ⚠⚠⚠ (#R413) THIS USED TO BE `matches.length <= 8`, AND THAT CEILING WAS THE DEFECT.
     `search()` breaks equal scores with `a.id.localeCompare(b.id)`, so cutting at eight let the
     ALPHABET decide what Atlas was allowed to know about: measured on 「現在地から大阪駅までの経路」,
     ten capabilities score 16 — identically, because the only signal a Japanese request produces is
     the per-CATEGORY hint row — and sorted by id, `routing.route` lands NINTH and was dropped, while
     the five navigation.* that arrived instead all reply «plan a route first». Atlas asked the reader
     to type their own address because IntMap had handed it a toolkit that could not draw a route.
     ⚠ The invariant is NOT a smaller number. It is that nothing is dropped, and that the RESULT
     stays small because the shared catalogue blocks are de-duplicated rather than clipped — which is
     what the byte assertion below actually measures. CONSTITUTION.md §5. */
  assert.equal(found.matches.length, CAPS.search('isochrone reachable area', { want: 3, min: 1 }).ranked.length,
    'every capability that scored comes back — discovery must not truncate its own ranking');
  assert.ok(JSON.stringify(found).length < 40_000,
    `discovery returned ${JSON.stringify(found).length} bytes — de-duplication, not truncation, is what keeps this small`);
  found.matches.forEach((m) => {
    assert.ok(CAPS.resolve(m.id), `${m.id} is not a real capability id`);
    assert.equal(m.schema.type, 'object', `${m.id} came back without a real schema`);
  });
});

test('R406-turn ⑦: run_capability re-validates against THAT capability schema, not the generic one', async () => {
  /* run_capability's own schema can only say `args` is an object; the surface must check the rest,
     or it becomes the hole the argument-less action walks back in through. */
  const { ran, out } = await turn('x', [
    call('run_capability', { id: 'routing.isochrone', args: {} }),
    answer('ok'),
  ]);
  assert.equal(ran.length, 0, 'an under-specified capability ran through the generic envelope');
  assert.equal(out.results[0].error, 'invalid_arguments');
  assert.ok(out.results[0].schema, 'no schema came back for the model to correct against');
});

test('R406-turn ⑧: run_capability with good arguments reaches the dispatch under the legacy name', async () => {
  const { ran } = await turn('x', [call('run_capability', { id: 'view.projection', args: { mode: 'globe' } }), answer('ok')]);
  assert.equal(ran.length, 1);
  assert.equal(ran[0].type, 'projection', 'the capability id was not translated to the dispatch spelling');
  assert.equal(ran[0].mode, 'globe');
});

test('R406-turn ⑧b: a `type` smuggled into the arguments cannot redirect the call to another case', async () => {
  /* the dispatch switches on action.type; if the arguments were spread OVER the tool's own type,
     a call that passed map_view's schema would execute whatever case the argument named. */
  const a = await turn('x', [call('map_view', { place: 'Rome', type: 'layer' }), answer('ok')]);
  assert.equal(a.ran[0].type, 'flyTo', 'an argument redirected a core tool to another dispatch case');
  const b = await turn('x', [call('run_capability', { id: 'view.projection', args: { mode: 'globe', type: 'time' } }), answer('ok')]);
  assert.equal(b.ran[0].type, 'projection', 'an argument redirected run_capability to another dispatch case');
});

/* ── ⑨ ANSWER + MAP: ONE FAILURE DOES NOT MAKE THE OTHER A FAILURE ────────────────────────── */
test('R406-turn ⑨: in a combined request a failed map step does not discard the answer', async () => {
  const { out, ran } = await turn('セーヌ川の長さを答えて、流域も地図で見せて', [
    { text: '', toolCalls: [
      { id: 'a', name: 'research', arguments: { question: 'length of the Seine' } },
      { id: 'b', name: 'highlight', arguments: { query: 'Seine basin' } },
    ] },
    (req) => {
      const res = req.messages.filter((m) => m.role === 'tool').pop().content;
      assert.equal(res.filter((r) => r.ok).length, 1, 'the model could not see which half worked');
      assert.equal(res.filter((r) => !r.ok).length, 1);
      return answer('長さは約777kmです。流域の描画はできませんでした。');
    },
  ], { fails: ['highlight'], renders: ['analyze'] });
  assert.equal(ran.length, 2, 'the second step was skipped because the first family failed');
  assert.match(out.text, /777/);
  assert.equal(out.stopped, 'answered');
});

test('R406-turn ⑩: a tool that drew its own sourced answer says so, so the model does not write it twice', async () => {
  let res = null;
  await turn('現在のギリシャ情勢を調べて', [
    call('research', { question: 'Greece current situation', use: ['web'] }),
    (req) => { res = req.messages.filter((m) => m.role === 'tool').pop().content[0]; return answer('要点は次のとおりです。'); },
  ], { renders: ['analyze'] });
  assert.equal(res.rendered, true, 'the model was not told the answer had already been shown');
});

/* ── ⑪ CONVERSATION: WHAT IS SETTLED IS NOT ASKED AGAIN ───────────────────────────────────── */
test('R406-turn ⑪: the turn carries the conversation, so a settled subject is available to the model', async () => {
  const history = [
    { role: 'user', content: '旅行行きたい' },
    { role: 'assistant', content: 'どちらへ行かれますか？' },
    { role: 'user', content: '台湾' },
    { role: 'assistant', content: '台湾ですね。' },
  ];
  let req = null;
  await turn('一週間の旅程を考えて', [(r) => { req = r; return answer('7日間の案です…'); }], { history });
  const text = req.messages.map((m) => String(m.content)).join('\n');
  assert.match(text, /台湾/, 'the settled subject was not carried into the turn');
  assert.equal(req.messages.length, 5, 'the history was truncated or duplicated');
});

test('R406-turn ⑪b: asking the reader is a tool Atlas may reach for, and it needs a real question', async () => {
  /* 「曖昧さが結果を大きく変える場合だけ確認する」 — WHETHER to ask is Atlas's judgement, so nothing
     here asserts that a vague request produces a question. What is asserted is that the door exists,
     that it reaches the same dispatch case it always did, and that an empty question cannot go out. */
  const bad = await turn('x', [call('ask_user', {}), answer('…')]);
  assert.equal(bad.ran.length, 0, 'a question with no text reached the reader');
  assert.equal(bad.out.trace.rejected, 1);

  const good = await turn('旅行行きたい', [
    call('ask_user', { question: 'どちらへ行かれますか？', options: ['台湾', 'アイスランド'], allowText: true }),
    answer('選んでください。'),
  ]);
  assert.equal(good.ran.length, 1);
  assert.equal(good.ran[0].type, 'ask', 'the dialog capability was not reached under its dispatch name');
  assert.equal(good.ran[0].question, 'どちらへ行かれますか？');
  assert.deepEqual(good.ran[0].options, ['台湾', 'アイスランド']);
});

/* ── ⑫ FAILURE: NOTHING IS CLAIMED THAT DID NOT HAPPEN ────────────────────────────────────── */
test('R406-turn ⑫: when everything fails the turn still ends with one answer and no invented success', async () => {
  const { out, ran } = await turn('存在しない場所へ移動して', [
    call('map_view', { place: 'Atlantis' }),
    (req) => {
      const r = req.messages.filter((m) => m.role === 'tool').pop().content[0];
      assert.equal(r.ok, false);
      return answer('その場所は見つかりませんでした。');
    },
  ], { fails: ['flyTo'] });
  assert.equal(ran.length, 1);
  assert.equal(out.text, 'その場所は見つかりませんでした。');
  assert.equal(out.results.filter((r) => r.ok).length, 0);
});

/* ── ⑬ THE WIRE FORMAT ────────────────────────────────────────────────────────────────────── */
test('R406-turn ⑬: the envelope parses both an arguments object and an arguments_json string', async () => {
  const a = AGENT.readReply({ final_text: '', tool_calls: [{ name: 'map_view', arguments: { place: 'Rome' } }] }, '', JSON.parse);
  const b = AGENT.readReply({ final_text: '', tool_calls: [{ name: 'map_view', arguments_json: '{"place":"Rome"}' }] }, '', JSON.parse);
  assert.deepEqual(a.toolCalls, b.toolCalls);
  assert.equal(a.toolCalls[0].arguments.place, 'Rome');
  /* an unparseable arguments string is an EMPTY argument set, which the schema check then rejects
     and hands back — never a crash, and never a silently half-applied call */
  const c = AGENT.readReply({ final_text: '', tool_calls: [{ name: 'map_view', arguments_json: '{oops' }] }, '', JSON.parse);
  assert.deepEqual(c.toolCalls[0].arguments, {});
  /* final_text alone is a complete reply */
  const d = AGENT.readReply({ final_text: 'hello' }, '', JSON.parse);
  assert.equal(d.text, 'hello');
  assert.equal(d.toolCalls.length, 0);
});

test('R406-turn ⑭: the envelope schema is strictly expressible, so the enforcement is not silently dropped', () => {
  /* supabase/functions/ai-proxy/index.ts converts a caller schema with strictJsonSchema(), which
     returns null — dropping the WHOLE schema to plain json_object — for any object with no declared
     properties. That is why the arguments travel as a string. This re-runs that rule. */
  const expressible = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'array') return expressible(node.items);
    if (node.type !== 'object') return true;
    const keys = Object.keys(node.properties || {});
    return keys.length > 0 && keys.every((k) => expressible(node.properties[k]));
  };
  assert.ok(expressible(AGENT.TURN_SCHEMA), 'TURN_SCHEMA would be rejected by the proxy and silently downgraded');
});
