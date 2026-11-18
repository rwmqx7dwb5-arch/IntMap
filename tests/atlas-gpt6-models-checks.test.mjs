/* ══ atlas-gpt6-models ═════════════════════════════════════════════════════════════════════════════
 *  The user (2026-11-16): 「Sol→Terra→luna の順番かつ、それぞれの最新番号に変えて。gpt-6.1-sol /
 *  gpt-6.1-terra / gpt-6-luna です。また、その他諸々も色々任せる。」 — and the analysis of an Atlas answer
 *  they pasted with it (a follow-up about Czech public-media funding), whose reader-visible defects were:
 *    ① a map note 「本文の主要スポット 1 件を地図にマッピングしました」 under an answer about money and law,
 *    ② a row of bare 「1」 citation pills that pointed at nothing visible,
 *    ③ 「出典が1サイト（google.com）に集中しています」 under an answer citing Reuters, AP and Czech outlets,
 *    ④ the same facts restated under several headings and a second 「結論として」, with the newest
 *       development — the thing the follow-up asked about — missing.
 *  Each check below RUNS the code that produced the defect rather than reading its spelling.
 * ================================================================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN, OPENAI_LAST_RESORT_MODEL } from '../supabase/functions/_shared/ai-provider.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/safe-html.js');
const { makeAtlasVerify } = await import('../js/atlas-verify.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasAnswerRender } = await import('../js/atlas-answer-render.js');
const { makeAtlasAnswerContract } = await import('../js/atlas-answer-contract.js');
const { makeAtlasEvidence } = await import('../js/atlas-evidence.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');
NominatimGate.configure({ gapMs: 0, reset: true });   /* the 1,100 ms floor is tested elsewhere; here it only slows the file */

const V = makeAtlasVerify({}, { L: (en) => en, esc: (s) => String(s) });
const GEOBJ = makeAtlasGeoObject();

test('atlas-gpt6-models: the ladder is Sol → Terra → Luna, each at its latest point release', () => {
  assert.deepEqual([OPENAI_DEFAULT_MODEL, ...FALLBACK_CHAIN], ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna']);
  /* the unattended jobs take one step, to the last rung */
  assert.equal(OPENAI_LAST_RESORT_MODEL, 'gpt-6-luna');
});

test('atlas-gpt6-models ③: a source is counted by its publisher, not by the redirect host its link goes through', () => {
  const gnews = (n) => 'https://news.google.com/rss/articles/CBMi' + n + '?oc=5';
  const audit = V._atlAuditSources([
    { url: gnews('a'), publisher: 'Reuters' },
    { url: gnews('b'), publisher: 'AP News' },
    { url: gnews('c'), publisher: 'Česká televize' },
    { url: gnews('d'), publisher: 'Reuters' },
  ]);
  assert.equal(audit.distinct, 3, 'three publishers were counted as ' + JSON.stringify(audit.byDomain));
  assert.equal(audit.concentrated, false, 'four articles from three publishers were reported as one site');
  assert.ok(!('google.com' in audit.byDomain), 'the redirect host was counted as a source');
  /* a publisher written as a host is rounded like a host, so the official-domain test still reads it */
  const off = V._atlAuditSources([{ url: 'https://www.psp.cz/x', publisher: 'www.psp.cz' }, { url: 'https://psp.cz/y' }]);
  assert.equal(off.distinct, 1, 'www.psp.cz and psp.cz became two sources');
  /* and a citation with no publisher is still counted by its URL, exactly as before */
  const plain = V._atlAuditSources([{ url: 'https://www.bbc.co.uk/a' }, { url: 'https://news.bbc.co.uk/b' }]);
  assert.equal(plain.concentrated, true, 'two BBC links stopped being one site');
});

test('atlas-gpt6-models ①: an answer that declares its places is not given more from its prose', async (t) => {
  /* every lookup the pass can make — the region geocoder it is handed, and the strict Nominatim rung,
     which goes through fetch — is counted, and answers «nothing found» */
  let asked = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { asked++; return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  t.after(() => { globalThis.fetch = realFetch; });
  const pin = V.makePinReplyPlaces({ GE: () => ({ camera: {} }), GEOBJ, L: (en) => en,
    geocode: async () => { asked++; return null; }, paintPois: () => true, getPois: () => [], setPois: () => {}, ledger: null });
  const text = 'Prime Minister Andrej Babiš said in Prague that the Czech Television fee could become voluntary; the Chamber of Deputies passed the bill in Prague.';
  const out = await pin([], { text, citations: [], placesDeclared: true });
  assert.equal(out, '', 'an empty declared list still produced a map note');
  assert.equal(asked, 0, 'a lookup ran for a name the model chose not to list');
  /* the safety net is unchanged for an answer whose shape has no places field */
  await pin([], { text, citations: [] });
  assert.ok(asked > 0, 'the prose net stopped running for answers that cannot declare places');
});

test('atlas-gpt6-models ②: a citation pill names its publisher, and keeps its own link', () => {
  const EV = makeAtlasEvidence();
  const CT = makeAtlasAnswerContract();
  const RN = makeAtlasAnswerRender();
  const reg = EV.makeEvidenceRegistry({ callId: 'call-1', turnId: 't1', retrievedAt: 'fixture' });
  reg.addClientSources([{ url: 'https://www.reuters.com/world/europe/czech-a', title: 'Czech fee', src: 'Reuters' }]);
  const id = reg.all()[0].id;
  const env = CT.normalizeAnswer({
    directAnswer: { text: 'The fee may become voluntary.', claimIds: ['c1'] },
    sections: [], claims: [{ id: 'c1', text: 'The fee may become voluntary.', claimType: 'fact', importance: 'primary', dimension: 'trend', confidence: 'medium', evidenceIds: [id] }],
  });
  const UI = { L: (en) => en, esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    mdMini: (s) => String(s), linkCards: () => '' };
  const html = RN.renderAnswer(env, reg, UI);
  const pill = /<a class="atl-cite"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/.exec(html);
  assert.ok(pill, 'no citation pill: ' + html);
  assert.equal(pill[2], 'Reuters', 'the pill shows «' + pill[2] + '» instead of who published it');
  assert.equal(pill[1], 'https://www.reuters.com/world/europe/czech-a');
});

test('atlas-gpt6-models ④: the analysis rules ask for the asked question first, once, with its status', () => {
  const rules = makeAtlasAnswerContract().answerContractRules({ language: 'ja' });
  for (const rule of ['FOCUS:', 'NO REPETITION:', 'STATUS:', 'PLACES:'])
    assert.ok(rules.includes(rule), 'the analysis contract lost its ' + rule + ' rule');
});
