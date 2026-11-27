/* Atlas が成功を成功と知り、失敗を失敗と知る — 回帰（発注書 2026-11-27 の 1〜10）。*/
import test from 'node:test';
import assert from 'node:assert/strict';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

async function withDoor(fn) {
  const sent = [];
  const prev = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = { SUPABASE_URL: 'https://edge.test', SUPABASE_ANON_KEY: 'k' };
  const page = (url) => ({ ok: true, state: { url, cookies: {} }, status: 200, page: { title: 'T ' + url, text: 'text of ' + url, links: [{ ref: 'l1', text: 'next', href: url + '/next' }], files: [] } });
  globalThis.fetch = async (u, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    await tick(5);
    const out = body.action === 'click' ? page((body.state && body.state.url) + '/next') : page(String(body.url));
    return { status: 200, json: async () => out };
  };
  try {
    const { webBrowseDoor } = await import('../js/web-browse.js');
    const { webEvidence } = await import('../js/atlas-web-evidence.js');
    webEvidence.clear();
    const HOST = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } } };
    await fn(webBrowseDoor(HOST), sent);
  } finally { globalThis.window = prev.window; globalThis.fetch = prev.fetch; }
}

test('⑤ A→B→A: A のリンク 1 は A のリンク 1 を開く（A の再読込が親の再利用で門に届かなくても）', async () => {
  await withDoor(async (door, sent) => {
    const a1 = await door.browse({ action: 'open', url: 'https://a.example/p' });
    await door.browse({ action: 'open', url: 'https://b.example/p' });
    /* 3 回目の open A は親の再利用が前回の結果を返すだけで、門は走らない。モデルは A の結果の「リンク 1」を選ぶ */
    const ref = a1.page.links[0];
    assert.match(ref.ref, /^l1@/, 'ref は取得元ページを名指す');
    const c = await door.browse({ action: 'click', ref: ref.ref });
    assert.match(sent[sent.length - 1].state.url, /a\.example/);
    assert.equal(sent[sent.length - 1].ref, 'l1', 'サーバーへは素の ref');
    assert.match(c.state.url, /a\.example/);
    /* ページ名の無い ref は従来どおり開いているページ */
    const plain = await door.browse({ action: 'click', ref: 'l1' });
    assert.ok(plain.ok);
  });
});

/* ── 共通の足場 ──────────────────────────────────────────────────────────────────────────────────────────────── */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const AGENT = (await imp('js/atlas-agent.js')).makeAtlasAgent();
const GV = await imp('js/atlas-goal-verify.js');
const TOOLS = { draw: { name: 'draw', description: 'x', parameters: { type: 'object', properties: { x: { type: 'string' } } } } };
const USER = [{ role: 'user', content: '北海道の黒土地帯をマッピングして' }];
const scripted = (replies) => { let i = 0; const m = async () => replies[Math.min(i++, replies.length - 1)]; m.count = () => i; return m; };

test('① 実行したが観測できなかった呼び出しを、独立した読み手に FAILED と告げない（観測器の誤報）', () => {
  const rows = GV.recordOf([
    { capability: 'map.compose', ok: false, status: 'unobserved', unobservedModes: ['map'] },
    { capability: 'map.compose', ok: false, status: 'partial', error: 'some_unplaced', producedModes: ['map'] },
    { capability: 'map.pin', ok: false, error: 'not_found' },
    { capability: 'map.view', ok: true, status: 'completed', producedModes: ['map'] },
  ]);
  assert.doesNotMatch(rows[0], /FAILED/); assert.match(rows[0], /NOT a failure/);
  assert.doesNotMatch(rows[1], /FAILED/); assert.match(rows[1], /partial/);
  assert.match(rows[2], /FAILED \(not_found\)/, '本当の失敗は失敗のまま');
  assert.match(rows[3], /ok \[produced: map\]/);
});

test('② 地図を描く呼び出しが走り（観測できず）、門が受け入れた回答は「完了していないもの: 地図」と報告されない', async () => {
  const model = scripted([{ text: '', toolCalls: [{ name: 'draw', arguments: { x: 'a' } }] }, { text: '描きました。', toolCalls: [], answerMode: 'map' }]);
  const out = await AGENT.runTurn({ model, tools: TOOLS, messages: USER,
    execute: async () => ({ ok: false, status: 'unobserved', unobservedModes: ['map'], message: 'ran; could not be seen' }) });
  assert.equal(out.unmet.filter((u) => u.kind === 'output').length, 0);
  assert.equal(out.completion, 'complete');
});

test('⑧ 一度確認された不足は、次の検証が無応答でも解消されない（20 行要求に 8 行）', async () => {
  const model = scripted([{ text: '8 行です。', toolCalls: [] }, { text: '', toolCalls: [{ name: 'draw', arguments: { x: 'b' } }] }, { text: 'やはり 8 行です。', toolCalls: [] }]);
  let n = 0;
  const out = await AGENT.runTurn({ model, tools: TOOLS, messages: [{ role: 'user', content: '20 行の表にして' }], execute: async () => ({ ok: true }),
    verify: async () => { n++; return n === 1 ? { unmet: [{ need: '残り 12 行', why: '8 行しかない' }] } : null; } });
  assert.equal(n, 2);
  assert.equal(out.completion, 'partial', '無応答の検証は不足を消さない');
  assert.equal(out.unmet[0].need, '残り 12 行');
  /* 解消を観測した読み手は消せる */
  let m = 0;
  const out2 = await AGENT.runTurn({ model: scripted([{ text: '8 行です。', toolCalls: [] }, { text: '', toolCalls: [{ name: 'draw', arguments: { x: 'c' } }] }, { text: '20 行です。', toolCalls: [] }]), tools: TOOLS, messages: USER, execute: async () => ({ ok: true }),
    verify: async () => { m++; return m === 1 ? { unmet: [{ need: '残り 12 行' }] } : { unmet: [] }; } });
  assert.equal(out2.completion, 'complete');
});

/* ── ③ 実行用キー ─────────────────────────────────────────────────────────────────────────────────────────────── */
const { makeAtlasTurnResults } = await imp('js/atlas-turn-results.js');
test('③ コード・パス・識別子は大文字小文字を保つ。人が打った地名は従来どおり同じ呼び出し', () => {
  const T = makeAtlasTurnResults({});
  const k = (code) => T.callKey('run_capability', { id: 'python.run', args: { code } });
  assert.notEqual(k('A=19\nprint(A)'), k('a=7\nprint(a)'));
  assert.notEqual(k('print(A)'), k('print(a)'));
  assert.notEqual(T.callKey('x', { path: '/Tmp/X' }), T.callKey('x', { path: '/tmp/x' }));
  assert.notEqual(T.callKey('x', { url: 'https://a.example/Foo' }), T.callKey('x', { url: 'https://a.example/foo' }));
  assert.equal(T.callKey('map_view', { place: 'Osaka' }), T.callKey('map_view', { place: ' osaka ' }));
  assert.equal(T.callKey('map_view', { place: '大阪駅' }), T.callKey('map_view', { place: ' 大阪駅 ' }));
});

/* ── ④ 子の結果の再利用は、受け取った成果物の版で照合する ───────────────────────────────────────────────────── */
const D = await imp('js/atlas-delegate.js');
test('④ 上流が東京に変われば、前回の大阪の分析は返らない。同じ入力なら再利用される', async () => {
  const ran = [];
  const exec = (city) => ({ id: 'e', async run(task) {
    ran.push(task.id);
    if (task.id === 'p') return { state: 'done', summary: city, findings: [], data: { city } };
    return { state: 'done', summary: 'analysis of ' + task.inputs[0].summary, findings: [], data: null };
  } });
  const list = [{ id: 'p', goal: 'fetch the city' }, { id: 'q', goal: 'analyse p', inputs: [{ from: 'p' }] }];
  const d1 = D.makeDelegation({ executor: exec('Osaka') });
  const r1 = await d1.run(list);
  assert.equal(r1[1].summary, 'analysis of Osaka');
  const snap = d1.snapshot();
  /* 同じ入力: 再利用 */
  ran.length = 0;
  const same = await D.makeDelegation({ executor: exec('Osaka'), resume: snap }).run(list);
  assert.equal(same[1].summary, 'analysis of Osaka'); assert.deepEqual(ran, [], '何も走らない');
  /* 上流の中身だけが変わる（契約は同じ文）: 下流は走り直す */
  ran.length = 0;
  const snap2 = JSON.parse(JSON.stringify(snap));
  snap2.results.find((e) => e.id === 'p').result.summary = 'Osaka';   /* p の記録は大阪のまま */
  const tokyo = await D.makeDelegation({ executor: exec('Tokyo'), resume: { ...snap2, results: snap2.results.filter((e) => e.id !== 'p') } }).run(list);
  assert.equal(tokyo[0].summary, 'Tokyo');
  assert.equal(tokyo[1].summary, 'analysis of Tokyo', '前回の大阪の分析を返さない');
  assert.ok(ran.includes('q'));
});

/* ── ⑥ 取り込みの返答は実件数と登録 ID を述べる ───────────────────────────────────────────────────────────── */
test('⑥ 47 地物は 47 行（地図レイヤー通し番号ではない）。GIS 登録が無ければ「追加成功」と言わない', async () => {
  const prev = globalThis.window.GeoJSONUpload;
  try {
    const { webBrowseDoor } = await imp('js/web-browse.js');
    const door = webBrowseDoor({});
    globalThis.window.GeoJSONUpload = { handle: async () => [{ ok: true, label: 'x', format: 'geojson', n: 1, layer: 1, features: 47, registered: true, datasetId: 'ds_1' }] };
    const ok = await door.toDataset({ name: 'x.geojson' }, 'x');
    assert.equal(ok.ok, true); assert.equal(ok.rows, 47); assert.equal(ok.datasetId, 'ds_1');
    globalThis.window.GeoJSONUpload = { handle: async () => [{ ok: true, label: 'x', format: 'geojson', n: 2, layer: 2, features: 47, registered: false, datasetId: null }] };
    const bad = await door.toDataset({ name: 'x.geojson' }, 'x');
    assert.equal(bad.ok, false); assert.equal(bad.code, 'not_registered'); assert.equal(bad.rows, 47); assert.equal(bad.layer, 2);
  } finally { globalThis.window.GeoJSONUpload = prev; }
});

/* ── ⑨ サーバーで保存した操作は依存順に・観測してから「適用済み」 ───────────────────────────────────────────── */
const JC = await imp('js/atlas-jobs-client.js');
test('⑨ 名前順ではなく依存順（1850 年へ移動 → 描画）。失敗した操作は適用済みにならず、後続も走らない', async () => {
  const mk = () => ({ id: 'J', tasks: [
    { id: 'a_draw', state: 'done', deps: ['b_move'], endedAt: '2026-11-27T00:00:02Z', parked: { capability: 'map.draw', args: {} } },
    { id: 'b_move', state: 'done', deps: [], endedAt: '2026-11-27T00:00:01Z', parked: { capability: 'time.set', args: { year: 1850 } } },
  ] });
  const seen = [];
  const mem = () => { const set = new Set(); return { has: (k) => set.has(k), add: (k) => set.add(k), set }; };
  const m1 = mem();
  const r1 = await JC.applyParked(mk(), async (p) => { seen.push(p.capability); return { ok: true }; }, m1);
  assert.deepEqual(seen, ['time.set', 'map.draw']);
  assert.deepEqual(r1.map((x) => x.applied), [true, true]);
  /* 先行が効かなかった: 印は付かず、後続は走らない */
  const m2 = mem(); seen.length = 0;
  const r2 = await JC.applyParked(mk(), async (p) => { seen.push(p.capability); return p.capability === 'time.set' ? { ok: false, why: 'x' } : { ok: true }; }, m2);
  assert.deepEqual(seen, ['time.set']);
  assert.equal(m2.set.size, 0, '失敗は「適用済み」の印を付けない');
  assert.equal(r2[1].applied, false); assert.match(r2[1].why, /predecessor/);
});

/* ── ⑩ 長い資料の範囲読みは進展であり反復ではない／入力は版と件数と列を添え、後から読める ────────────────────── */
test('⑩ 先頭・中間・末尾の範囲読みを反復と判定しない', async () => {
  const material = 'H'.repeat(8000) + 'M'.repeat(8000) + 'T'.repeat(7013);   /* 23,013 文字 */
  let step = 0; const prompts = [];
  const ask = async (prompt) => {
    prompts.push(prompt); step++;
    if (step === 1) return { data: { calls: [{ capability: 'data.big', args: {} }] }, meta: {} };
    if (step === 2) return { data: { calls: [{ capability: 'read_step', args: { ref: '1', offset: 4500, length: 4500 } }] }, meta: {} };
    if (step === 3) return { data: { calls: [{ capability: 'read_step', args: { ref: '1', offset: 11000, length: 4500 } }] }, meta: {} };
    if (step === 4) return { data: { calls: [{ capability: 'read_step', args: { ref: '1', offset: 18500, length: 4500 } }] }, meta: {} };
    return { data: { summary: 'done' }, meta: {} };
  };
  const capability = { run: async () => ({ ok: true, text: material }), classify: () => 'read', describe: () => 'none' };
  const D = D_.makeDelegation({ executor: D_.makeWorkerExecutor({ ask, capability, maxCalls: null }) });
  const [r] = await D.run([{ goal: 'g', tools: ['data.big'] }]);
  assert.equal(r.state, 'done', String(r.code));
  assert.match(prompts[prompts.length - 1], /TTTT/, '末尾がモデルに届いた');
});
const D_ = D;

const JCORE = await imp('js/atlas-job-core.js');
test('⑩ 12,000 文字を超える入力は版・件数・列を添え、残りを範囲で読める（黙って切らない）', () => {
  const rows = Array.from({ length: 1251 }, (_, i) => ({ city: 'c' + i, port: 'p' + i, km: i }));
  const task = { goal: 'pick the last city', inputs: [{ from: 'gis', summary: 's', findings: [], gaps: [], data: { rows } }] };
  const p = JCORE.workerPrompt(task, undefined, { read: true });
  assert.match(p, /MANIFEST/); assert.match(p, /"rows":1251/); assert.match(p, /"columns":\["city","port","km"\]/); assert.match(p, /"version":"/);
  assert.match(p, /read_step/); assert.match(p, /input:gis/);
  const v = JCORE.inputView(task.inputs[0], { read: true });
  assert.ok(v.whole.includes('"c1250"'), '全体は保持され、末尾の行は読める');
  const plain = JCORE.workerPrompt(task);
  assert.match(plain, /NOT given to you/, '読めない側は切れていると述べる');
  const small = JCORE.workerPrompt({ goal: 'g', inputs: [{ from: 'x', summary: 'tiny' }] });
  assert.doesNotMatch(small, /MANIFEST/, '収まる入力は従来どおり');
});

/* ── ⑦ 依頼の版 ───────────────────────────────────────────────────────────────────────────────────────────── */
test('⑦ 依頼変更の前に作られた結果は、報告で「変更前」と印され、変更内容が添えられる', async () => {
  const src = await import('node:fs').then((f) => f.readFileSync(join(ROOT, 'supabase/functions/_shared/atlas-job-runner.js'), 'utf8'));
  assert.match(src, /requestVersion/);
  assert.equal((src.match(/p_result: stamped\(ctx, result, /g) || []).length, 3, '3 つの完了経路すべてが版（開始時と条件を書いた時点）を書く');
  assert.match(src, /computed under the request as it was before the reader's change/);   /* 振る舞いは tests/gis-result-handoff-checks.test.mjs が実際に走らせて確かめる */
});
