/* atlas-find-semantic — two things the 46-question round left behind (dev-notes/2026-09-25-atlas-50-remainder.md §9).
 *
 *  ① 「現在地の天気」 did not reach data.weather. A Japanese request is cut into runs by SCRIPT, and a particle is
 *    written in the same script as the words it joins, so 天気 was two characters inside the run 現在地の天気 and
 *    no evidence at all. The platform's word segmenter now says where the words of a run are.
 *  ② The analysis prompt numbered the same articles twice — the NEWS EVIDENCE list by date, the evidence registry
 *    by fetch order — and a citation is resolved against the registry. Now the list is written from the registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const CONSOLE_SRC = codeOnly(readLF(join(ROOT, 'js/atlas-console.js')));

const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasAnswerPipeline } = await import('../js/atlas-answer-pipeline.js');

/* ══ ① A WORD INSIDE A RUN ═══════════════════════════════════════════════════════════════════════ */
const CAPS = makeAtlasCapabilities({});
CAPS.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const ranked = (q) => (CAPS.search(q, { want: 3, min: 1 }).ranked || []).map((r) => r.id);

test('atlas-find-semantic ① the weather at the reader\'s own place reaches the weather capability', () => {
  /* measured before this change: 現在地の天気 → ten routing/navigation rows and no data.weather; ここの天気 → nothing */
  assert.equal(ranked('現在地の天気')[0], 'data.weather', '現在地の天気 → ' + ranked('現在地の天気').join(', '));
  assert.equal(ranked('ここの天気')[0], 'data.weather', 'ここの天気 → ' + ranked('ここの天気').join(', '));
  /* 「今いる場所」 is also a spelling of view.locate (the resolver's own table), so both are candidates — the weather one must be among them */
  assert.ok(ranked('今いる場所の天気').slice(0, 3).includes('data.weather'), '今いる場所の天気 → ' + ranked('今いる場所の天気').join(', '));
});

test('atlas-find-semantic ① the segmenter adds words, it does not turn a greeting into a request (#R745)', () => {
  assert.deepEqual(ranked('ありがとう'), [], 'a run the segmenter keeps whole yields nothing new');
  assert.equal(ranked('現在地から大阪駅までの経路')[0], 'routing.route');
  assert.equal(ranked('東京から大阪までの鉄道ルート')[0], 'routing.route');
  assert.equal(ranked('東京の天気')[0], 'data.weather');
});

test('atlas-find-semantic ① the words come from the platform, not from a list in the code', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/atlas-capabilities.js')));
  assert.match(src, /new Intl\.Segmenter\(/, 'the run is cut by the platform\'s word segmenter');
  assert.match(src, /terms\.words\.forEach\(add\)/, 'and its words are evidence exactly like a Latin word');
  assert.ok(!/天気/.test(src.slice(src.indexOf('function runWords'), src.indexOf('function runWords') + 1200)), 'no vocabulary is written beside it');
});

/* ══ ② ONE NUMBERING FOR ONE SET OF ARTICLES ══════════════════════════════════════════════════════ */
function extract(startNeedle, endNeedle) {
  const i = CONSOLE_SRC.indexOf(startNeedle);
  assert.ok(i >= 0, 'atlas-console.js still has ' + startNeedle);
  const j = CONSOLE_SRC.indexOf(endNeedle, i);
  assert.ok(j > i, 'and its end ' + endNeedle);
  return CONSOLE_SRC.slice(i, j + endNeedle.length);
}
const HELPERS = new Function(
  extract('const _ORIGIN_LBL=', '};') + '\n'
  + extract('function _analyzeEvidence(', 'return recs; }') + '\n'
  + extract('function _evidenceBlock(', "return lines.join('\\n'); }") + '\n'
  + 'return { _analyzeEvidence, _evidenceBlock };')();

/* fetched in this order (GDELT answered first); the list is newest-first, so the two orders differ */
const SINK = [
  { url: 'https://a.example/old', title: 'Oldest story', src: 'A', date: '2026-09-20', dateType: 'gdelt_seen_date', origin: 'gdelt' },
  { url: 'https://b.example/mid', title: 'Middle story', src: 'B', date: '2026-09-22', dateType: 'publication_date', origin: 'gnews' },
  { url: 'https://c.example/new', title: 'Newest story', src: 'C', date: '2026-09-24', dateType: 'publication_date', origin: 'gnews' },
];

async function promptFor(dataBlock, clientSources) {
  const { runStructuredAnswer } = makeAtlasAnswerPipeline();
  let prompt = '';
  const ask = async (p) => { prompt = prompt || p; return { data: { directAnswer: { text: 'x', claimIds: [] }, sections: [], claims: [] }, meta: {} }; };
  let RES = null;
  try { RES = await runStructuredAnswer({ question: 'q', systemPrompt: 's', language: 'English', webMode: 'off', dataBlock, clientSources, ask, parseJSON: (t) => t }); } catch (_) { /* the prompt is what is measured */ }
  return { prompt, registry: RES && RES.registry };
}
/* every «[id] title: T … url: U» line of the NEWS list, resolved the way a citation is: through the registry's EVIDENCE RECORDS */
function misnumbered(prompt) {
  const news = prompt.slice(prompt.indexOf('[NEWS EVIDENCE'), prompt.indexOf('[EVIDENCE RECORDS'));
  const records = prompt.slice(prompt.indexOf('[EVIDENCE RECORDS'));
  const lines = news.split('\n').filter((l) => /^\[e\d+\] title: /.test(l));
  assert.equal(lines.length, SINK.length, 'every article is listed with an id');
  return lines.filter((l) => {
    const [, id, title] = /^\[(e\d+)\] title: (.*?) \|/.exec(l);
    const rec = records.split('\n').find((r) => r.startsWith('[' + id + ']'));
    return !rec || rec.indexOf('title: ' + title) < 0;
  });
}

test('atlas-find-semantic ② a NEWS EVIDENCE id names the same article the registry resolves it to', async () => {
  const H = HELPERS;
  const recs = H._analyzeEvidence(SINK);
  const part = (reg) => '[NEWS EVIDENCE]\n' + H._evidenceBlock(recs, reg.idOf) + '\n\n';
  const { prompt } = await promptFor([part], recs);
  assert.deepEqual(misnumbered(prompt), [], 'lines whose id resolves to another article');
  assert.match(prompt, /^\[e1\] title: Newest story/m, 'and the registry numbers them in the list\'s order, newest first');
});

test('atlas-find-semantic ② the check sees the defect it replaces (two numberings in one prompt)', async () => {
  const H = HELPERS;
  const recs = H._analyzeEvidence(SINK);
  const { prompt } = await promptFor(['[NEWS EVIDENCE]\n' + H._evidenceBlock(recs) + '\n\n'], SINK);
  assert.ok(misnumbered(prompt).length > 0, 'the old composition — list by date, registry by fetch order — must be caught');
});

test('atlas-find-semantic ② an article the registry holds no record for is not given a number', async () => {
  const H = HELPERS;
  const recs = H._analyzeEvidence(SINK);
  const out = H._evidenceBlock(recs, () => null);
  assert.ok(out.split('\n').every((l) => l.startsWith('[no id — not citable]')), out);
});

test('atlas-find-semantic ② the analysis path writes the list from the registry and hands it the list\'s order', () => {
  assert.match(CONSOLE_SRC, /parts\.push\(block, reg=>'\[NEWS EVIDENCE[^\n]*_evidenceBlock\(evRecs,reg\.idOf\)/, 'the list is a function of the registry');
  assert.match(CONSOLE_SRC, /clientSources:evRecs\.map\(/, 'the registry is given the articles in the list\'s order');
  assert.doesNotMatch(CONSOLE_SRC, /clientSources:srcSink\.map\(/, 'not in fetch order');
});
