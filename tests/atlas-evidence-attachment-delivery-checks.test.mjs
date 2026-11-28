import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWebEvidence, queryKey } from '../js/atlas-web-evidence.js';
import webCapabilities from '../js/atlas-cap-web.js';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { makeAtlasCatalogText } from '../js/atlas-catalog-text.js';
import attachCapabilities, { turnAttachmentImages, turnTextFiles } from '../js/atlas-cap-attach.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';
import { makeAtlasVerify } from '../js/atlas-verify.js';
import { CASES, runCase } from './helpers/ai-proxy-contract-cases.mjs';
import { MAX_FILES_TEXT, MAX_FILE_TEXT } from '../supabase/functions/ai-proxy/config.ts';

test('search identity includes the end of long questions and a separate language field', async () => {
  const prefix = ' Compare historical harbor traffic and archived customs records '.repeat(9);
  assert.notEqual(queryKey(prefix + 'in May', 'ja'), queryKey(prefix + 'in June', 'ja'));
  assert.notEqual(queryKey(prefix + 'in May', 'ja'), queryKey(prefix + 'in May', 'en'));
  assert.equal(queryKey(prefix + 'in May?', 'JA'), queryKey(prefix + 'in May', 'ja'));
  assert.notEqual(queryKey('harbor|ja'), queryKey('harbor', 'ja'));
  const search = webCapabilities.find((cap) => cap.row[0] === 'web.search');
  const queries = [
    { q: prefix + 'in May', lang: 'ja' }, { q: prefix + 'in June', lang: 'ja' },
    { q: prefix + 'in May', lang: 'en' }, { q: prefix + 'in May?', lang: 'JA' },
  ];
  const prompts = [];
  const result = await search.run({ queries }, {}, {
    R: (ok, html, extra) => ({ ok, html, ...extra }),
    L: (en) => en, note: String, warn: String, esc: String, _curTurnKey: 'long-query-test',
    askAIJSONEnvelope: async (prompt) => { prompts.push(prompt); return { text: prompt, meta: { webUsed: true } }; },
  });
  assert.equal(prompts.length, 3);
  assert.ok(prompts.some((p) => p.includes('in June') && p.includes('written in: ja')));
  assert.equal(new Set(result.exec.web.searches.map((s) => s.evidenceId)).size, 3);
});

test('a refresh keeps the exact evidence and sources used by earlier answers', async () => {
  let now = 1000;
  const store = makeWebEvidence({ now: () => now });
  const fetch = (revision) => async () => ({
    ok: true, query: 'survey archive', text: revision,
    sources: [{ url: 'https://example.org/survey', title: revision }, { url: 'https://example.org/' + revision }],
  });
  const key = queryKey('survey archive');
  const first = await store.acquire('search', key, fetch('first'), { turn: 'answer-1' });
  const firstSources = store.turnSources('answer-1');
  now += 6000;
  const second = await store.acquire('search', key, fetch('second'), { refresh: true, turn: 'answer-2' });
  assert.notEqual(second.entry.id, first.entry.id);
  assert.equal(store.read(first.entry.id).text, 'first');
  assert.equal(store.read('survey archive').id, second.entry.id);
  assert.deepEqual(store.turnSources('answer-1'), firstSources);
  assert.equal(store.turnSources('answer-2')[0].title, 'second');
  store.read(first.entry.id, 6000, { turn: 'answer-2' });
  assert.equal(store.turnSources('answer-2')[0].title, 'second', 'rereading an older snapshot does not replace a newly fetched source');
  for (let i = 0; i < 310; i++) {
    now += 1;
    await store.acquire('page', 'other-' + i, async () => ({ ok: true, text: 'other page' }));
  }
  assert.equal(store.read(first.entry.id), null);
  assert.deepEqual(store.turnSources('answer-1'), firstSources, 'answer sources survive the fetched body cache');
});

test('semantic seed retries once on the next catalogue miss after a network failure', async (t) => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  t.after(() => { globalThis.window = oldWindow; globalThis.fetch = oldFetch; });
  globalThis.window = { SUPABASE_URL: 'https://edge.example' };
  const host = { DB: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } } };
  const capabilities = makeAtlasCapabilities(host);
  capabilities.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
  let seeds = 0;
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    if (body.op === 'seed') {
      seeds += 1;
      throw new TypeError('connection interrupted');
    }
    return { json: async () => ({ state: 'catalog_unknown' }) };
  };
  const query = () => capabilities.searchFused('inspect the current map');
  await query();
  assert.equal(seeds, 1);
  await Promise.all([query(), query()]);
  assert.equal(seeds, 2);
  await query();
  assert.equal(seeds, 2);
});

test('requested text windows reserve capacity before history and count the external fence', async (t) => {
  const history = Array.from({ length: 8 }, (_, i) => ({ name: 'past-' + i, text: 'h'.repeat(MAX_FILE_TEXT) }));
  const wanted = { kind: 'text', name: 'field observations', external: true, text: 'start:'.repeat(90000) };
  ATTACH_LOG.remember(7, [], [wanted]);
  t.after(() => ATTACH_LOG.reset());
  const recalled = [];
  const recall = attachCapabilities.find((cap) => cap.row[0] === 'attach.recall');
  const kernel = {
    R: (ok, html, extra) => ({ ok, html, ...extra }), L: (en) => en, note: String, warn: String,
    _curTurn: 8, _atlRecallAtts: { recalledFiles: recalled },
  };
  let offset = 39;
  for (let i = 0; i < 4; i++) {
    const result = await recall.run({ name: wanted.name, offset }, {}, kernel);
    assert.equal(result.ok, true);
    const file = recalled.at(-1);
    assert.equal(file.text.slice(file.window.prefix, file.window.prefix + file.window.length), wanted.text.slice(offset, result.exec.next));
    assert.match(file.text, /\[END EXTERNAL MCP OUTPUT\]$/);
    offset = result.exec.next;
  }
  const submitted = turnTextFiles(recalled, history);
  assert.deepEqual(submitted, recalled);
  assert.equal(submitted.reduce((n, file) => n + file.text.length, 0), MAX_FILES_TEXT);
  const full = await recall.run({ name: wanted.name, offset }, {}, kernel);
  assert.equal(full.ok, false);
  assert.equal(full.exec.next, offset, 'an unsent window never advances the cursor');
  assert.equal(turnTextFiles(recalled.slice(0, 1), history)[1].name, 'past-0');
});

test('the proxy reports actual window ends and image positions after enforcing its limits', async () => {
  const base = CASES['answers (openai)'];
  const seed = base.requests.find((r) => r.body.task === 'vision_read');
  const png = seed.body.images[0], otherPhoto = 'data:image/jpeg;base64,AQID';
  const frames = ['AAAA', 'AAAB', 'AAAC'].map((data) => 'data:image/png;base64,' + data);
  const images = turnAttachmentImages(frames, [
    { name: 'image-42', dataUrl: png },
    { name: 'invalid comparison', dataUrl: 'data:image/svg+xml;base64,AAAA' },
    { name: 'image-67', dataUrl: otherPhoto },
  ]);
  const turn = base.requests.find((r) => r.body.protocol === 2 && r.body.images);
  const body = { ...turn.body, images, files: [{ name: 'field notes', text: 'XYZsample', window: { offset: 12, length: 6, total: 24, prefix: 3 } }] };
  const long = { ...turn.body, files: [0, 1, 2, 3].map((i) => ({
    name: 'segment-' + i, text: 'c'.repeat(MAX_FILE_TEXT), window: { offset: 999, length: MAX_FILE_TEXT, total: 999 + MAX_FILE_TEXT, prefix: 0 },
  })) };
  const [mixed, clipped] = await runCase(new URL('../supabase/functions/ai-proxy/index.ts', import.meta.url).href, {
    env: base.env, requests: [{ ...turn, body }, { ...turn, body: long }],
  });
  assert.equal(mixed.status, 200);
  const receipt = mixed.body.meta.attachmentReceipt;
  assert.deepEqual(receipt.images.map((img) => [img.position, img.name]), [[1, 'image-42'], [2, 'image-67'], [3, 'view frame 1'], [4, 'view frame 2']]);
  assert.equal(receipt.omittedImages, 2);
  assert.deepEqual(receipt.textWindows[0], { name: 'field notes', offset: 12, end: 18, next: 18, total: 24, more: true });
  const request = mixed.calls.find((c) => new URL(c.url).hostname === 'api.openai.com').body;
  assert.match(JSON.stringify(request), /ATTACHMENT RECEIPT/);
  const parts = request.input.flatMap((item) => Array.isArray(item.content) ? item.content : []);
  assert.deepEqual(parts.filter((part) => part.type === 'input_image').map((part) => part.image_url), [png, otherPhoto, ...frames.slice(0, 2)]);
  assert.equal(clipped.status, 200);
  assert.equal(clipped.body.meta.attachmentReceipt.textWindows[3].next, 999 + MAX_FILES_TEXT - MAX_FILE_TEXT * 3);
});

test('the vision turn publishes a withdrawal when the reread cannot support the failed number', async () => {
  const code = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  const normalized = code.slice(code.indexOf('function _visNorm'), code.indexOf('function _visionSYS'));
  const turn = code.slice(code.indexOf('async function _atlVisionTurn'), code.indexOf('async function run(q,imgs,files'));
  const L = (en) => en, esc = String;
  const verify = makeAtlasVerify({}, { L, esc });
  const expected = ['The last scale marking is illegible.', 'The total cannot be determined from this image.'];
  const first = { data: { contentClass: 'math', answer: 'The total is 109.', checks: [{ type: 'equal', label: 'sum', left: '109', right: '119' }] } };
  const responses = [
    first,
    { data: { contentClass: 'math', answer: expected[1], uncertain: [expected[0]], checks: [] } },
  ];
  const askAIJSONEnvelope = async () => {
    if (!responses.length) throw new TypeError('reread unavailable');
    return responses.shift();
  };
  const deps = {
    ...verify, L, esc, askAIJSONEnvelope, _runGen: 1, _abortCtl: null, stageDots: () => '', PROG: { phase() {} },
    _visionPrompt: String, _visionSYS: String, mdMini: String, wantsContinue: () => false, recordTurn() {},
  };
  const vision = new Function(...Object.keys(deps), normalized + turn + '\nreturn _atlVisionTurn;')(...Object.values(deps));
  const reply = { innerHTML: '' };
  await vision(reply, 'What is the total?', ['fixture'], 1, {}, 'test-turn', askAIJSONEnvelope);
  assert.equal(responses.length, 0);
  for (const line of expected) assert.ok(reply.innerHTML.includes(line));
  assert.doesNotMatch(reply.innerHTML, /109|119/);
  responses.push(first);
  await vision(reply, 'What is the total?', ['fixture'], 1, {}, 'test-turn', askAIJSONEnvelope);
  assert.match(reply.innerHTML, /could not verify/);
  assert.doesNotMatch(reply.innerHTML, /109|119/);
});
