#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — THE SCRIPTED CASSETTES (written by hand; the recorded ones come from production)
 * ----------------------------------------------------------------------------
 *  A scripted cassette is a turn whose MODEL SIDE is written here: either a defect a manual round
 *  recorded, reconstructed from what that round wrote down (the calls it counted, the stop it saw, the
 *  sentence the reader got), or a representative turn that exercises one path of the loop the replay
 *  must keep working. The WORLD side answers through `respond(action)` — the executor's legacy shape
 *  ({ok, html, meta}), observers' verdicts included.
 *
 *      node scripts/atlas-eval/scripted-cassettes.mjs           check that every cassette below is current
 *      node scripts/atlas-eval/scripted-cassettes.mjs --write   (re)write scripts/atlas-eval/cassettes/<id>.json
 *
 *  ⚠ --write RECORDS WHAT THE CODE DOES NOW. Run it when a cassette is new or when a divergence the
 *    replay reported is the intended change — never to make a red replay green without reading why.
 *
 *  Each scenario says where it came from (`origin`) and what the judge must conclude (`expect`). A
 *  defect cassette lists the failure kinds the judge has to find: if the judge stops finding them, the
 *  replay is red — that is how the judge is held to the defects it was built for.
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { productModules, recordScripted, canon } from './replay.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CASSETTE_DIR = join(ROOT, 'scripts', 'atlas-eval', 'cassettes');

const key = JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/answer-key.json'), 'utf8'));
const records = JSON.parse(readFileSync(join(ROOT, 'scripts/atlas-eval/questions.json'), 'utf8'));
const textOf = (set, id) => {
  const q = (set === 'answers' ? key : records).questions.find((x) => x.id === id);
  if (!q) throw new Error('no question ' + set + ':' + id);
  return { text: q.text, lang: q.lang, question: { set, id } };
};

/* model replies, in the shape js/atlas-agent.js readReply hands the loop */
const step = (...calls) => ({ text: '', turnState: 'continuing', toolCalls: calls.map((c, i) => ({ id: 'c' + i, name: c[0], arguments: c[1] || {} })) });
const say = (text) => ({ text, toolCalls: [] });
const finalSay = (text) => ({ final: true, text, toolCalls: [] });
const run = (id, args) => ['run_capability', { id, args }];

/* world answers, in the executor's shape */
const done = (html, produced = ['map']) => ({ ok: true, html, meta: { status: 'completed', produced } });
const failed = (html, code) => ({ ok: false, html, meta: { status: 'failed', code } });

export const SCENARIOS = [
  {
    id: 'tokaido-route-answered',
    ...textOf('answers', 'tokaido-shinkansen-tokyo-shinosaka-length'),
    origin: { kind: 'scripted', from: 'representative: find_capability → run_capability → an answer that states the verified figure (the path R802 §2 measured as never taken)' },
    model: [
      step(['find_capability', { query: '鉄道 ルート 駅間 距離' }]),
      step(run('routing.route', { from: '東京駅', to: '新大阪駅', mode: 'rail' })),
      say('東海道新幹線の東京駅から新大阪駅までのルートを地図に引きました。線路の実際の長さ（実キロ）は515.4 km、運賃計算に使う営業キロは552.6 kmです（JR東海）。'),
    ],
    respond: () => done('<div>東京駅 → 新大阪駅 · 鉄道 · 552.6 km · 2時間27分</div>', ['map', 'route']),
    expect: { verdict: 'pass', grade: 'correct' },
  },
  {
    id: 'rail-request-reached-nothing',
    ...textOf('records', 'rail-tokyo-osaka'),
    origin: { kind: 'scripted', from: 'R802 §2 — find_capability ×8, zero operations, step_budget (DEV-NOTES.md R802; dev-notes record)' },
    model: [
      ...['鉄道 経路', '電車 ルート', '乗換案内', '所要時間 距離', '新幹線', 'train route', 'rail directions', '経路探索'].map((q) => step(['find_capability', { query: q }])),
      finalSay(''),
    ],
    respond: () => { throw new Error('this turn reaches no dispatch'); },
    expect: { verdict: 'fail', failures: ['reach', 'operations'] },
  },
  {
    id: 'layer-values-refused-every-time',
    ...textOf('records', 'population-density-tokyo-delhi-lagos'),
    origin: { kind: 'scripted', from: 'R802 §4 — data.layerValues ×17, all failed with 「No readable data on the active layers here」, step_budget, no reply' },
    model: [
      ...[['Tokyo', 'Delhi'], ['Lagos', 'Tokyo, Japan'], ['Delhi, India', 'Lagos, Nigeria'], ['東京', 'デリー'], ['ラゴス', 'Tokyo Metropolis'],
        ['New Delhi', 'Lagos State'], ['Tokyo 23 wards', 'National Capital Territory'], ['Lagos Island', 'Tokyo-to']]
        .map(([a, b]) => step(run('data.layerValues', { place: a, layer: 'population density' }), run('data.layerValues', { place: b, layer: 'population density' }))),
      finalSay(''),
    ],
    respond: () => failed('<div>⚠ No readable data on the active layers here.</div>', 'no_data'),
    expect: { verdict: 'fail', failures: ['capability', 'result', 'reply'] },
  },
  {
    id: 'unobserved-call-is-not-run-twice',
    ...textOf('answers', 'mount-fuji-elevation'),
    origin: { kind: 'scripted', from: 'atlas-turn-engine ① — a camera move on a page that was not compositing is `unobserved`; the model repeating it is answered from the ledger, not run again (#R768 measured seven no_change replies)' },
    model: [
      step(['map_view', { place: 'Mount Fuji' }]),
      step(['map_view', { place: 'Mount Fuji' }]),
      say('富士山へ移動しました。標高は3,776 mです（国土地理院）。'),
    ],
    respond: () => ({ ok: false, html: '<div>Mount Fuji</div>', meta: { status: 'unobserved', code: 'not_rendering', produced: [] } }),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1 },
  },
  {
    id: 'cut-short-answer-written-after',
    ...textOf('records', 'gdp-per-capita-top10-not-in-total'),
    origin: { kind: 'scripted', from: 'R802 §8 — the turn ran out with 「I\'m comparing the two rankings now.」 as its text; the forced final now writes the answer from the transcript' },
    model: [
      step(run('data.rank', { metric: 'gdp_per_capita', order: 'top', n: 10 })),
      { text: 'I\'m comparing the two rankings now.', turnState: 'continuing', toolCalls: [{ id: 'c0', name: 'run_capability', arguments: { id: 'data.rank', args: { metric: 'gdp', order: 'top', n: 10 } } }] },
      ...[12, 15, 20, 25, 30, 35].map((n) => step(run('data.rank', { metric: 'gdp', order: 'top', n }))),
      finalSay('Of the top 10 by GDP per capita, Luxembourg, Ireland, Switzerland, Norway, Singapore, Iceland, Qatar and Denmark are not in the top 10 by total GDP; the United States is in both lists.'),
    ],
    respond: (a) => done('<div>' + (a.metric || 'rank') + ' top ' + (a.n || 10) + '</div>', ['map', 'panel']),
    expect: { verdict: 'pass' },
  },
  {
    id: 'cut-short-narration-is-the-reply',
    ...textOf('records', 'gdp-per-capita-top10-not-in-total'),
    origin: { kind: 'scripted', from: 'R802 §8 — the turn ran out on a narration, and the forced final came back empty: the reader got no answer' },
    model: [
      step(run('data.rank', { metric: 'gdp_per_capita', order: 'top', n: 10 })),
      { text: 'I\'m comparing the two rankings now.', turnState: 'continuing', toolCalls: [{ id: 'c0', name: 'run_capability', arguments: { id: 'data.rank', args: { metric: 'gdp', order: 'top', n: 10 } } }] },
      ...[12, 15, 20, 25, 30, 35].map((n) => step(run('data.rank', { metric: 'gdp', order: 'top', n }))),
      finalSay(''),
    ],
    respond: (a) => done('<div>' + (a.metric || 'rank') + ' top ' + (a.n || 10) + '</div>', ['map', 'panel']),
    expect: { verdict: 'fail', failures: ['reply'] },
  },
  {
    id: 'measured-and-stated-wrong',
    ...textOf('answers', 'great-circle-haneda-naha'),
    origin: { kind: 'scripted', from: 'representative: the tool ran and the reply states a distance the source contradicts — the judge alone passed this; the grade must not' },
    model: [
      step(run('map.measure', { from: '羽田空港', to: '那覇空港' })),
      say('羽田空港から那覇空港までの直線距離は約1,000 kmです。'),
    ],
    respond: () => done('<div>羽田空港 → 那覇空港 · 1,554 km</div>', ['map']),
    expect: { verdict: 'fail', failures: ['answer'], grade: 'incorrect' },
  },
  {
    id: 'answered-in-the-wrong-language',
    ...textOf('answers', 'japan-prefecture-count'),
    origin: { kind: 'scripted', from: 'R802 recorded a German reply to a question asked in another language; the language of the reply is judged on every turn' },
    model: [say('Japan has 47 prefectures (1 metropolis, 1 circuit, 2 urban prefectures and 43 prefectures).')],
    respond: () => { throw new Error('no dispatch'); },
    expect: { verdict: 'fail', failures: ['language'], grade: 'correct' },
  },
  {
    id: 'observer-contradicts-itself',
    ...textOf('records', 'ryoseikoku-1750'),
    origin: { kind: 'scripted', from: 'R802 §3 — research.situationMap returned a result that was drawn (html) and `not_rendered` at once, and Atlas called it again' },
    model: [
      step(run('research.situationMap', { topic: '日本の令制国', year: 1750, temporalMode: 'historical' })),
      step(run('research.situationMap', { topic: '令制国 1750年', year: 1750, temporalMode: 'historical' })),
      say('1750年の令制国を地図に描きました。'),
    ],
    respond: () => ({ ok: false, html: '<div>令制国（1750）</div>', meta: { status: 'partial', code: 'not_rendered', produced: [] } }),
    expect: { verdict: 'fail', failures: ['observer'] },
  },
  {
    id: 'promoted-tool-runs-the-capability',
    ...textOf('answers', 'great-circle-sydney-auckland'),
    origin: { kind: 'scripted', from: 'atlas-turn-engine — what find_capability returns is callable by its own name from the next step (133 of 146 capabilities were two decisions away)' },
    model: [
      step(['find_capability', { query: 'measure distance between two places' }]),
      step(['map_measure', { from: 'Sydney Airport', to: 'Auckland Airport' }]),
      say('The great-circle distance from Sydney Airport to Auckland Airport is about 2,160 km (measured on the map).'),
    ],
    respond: () => done('<div>Sydney Airport → Auckland Airport · 2,159 km</div>', ['map']),
    expect: { verdict: 'pass', grade: 'correct' },
  },
  {
    id: 'independent-calls-run-together',
    ...textOf('answers', 'great-circle-haneda-new-chitose'),
    origin: { kind: 'scripted', from: 'atlas-turn-engine — two pins in one reply touch different things and run together; the measure after them runs once' },
    model: [
      step(run('map.pin', { place: '羽田空港' }), run('map.pin', { place: '新千歳空港' })),
      step(run('map.measure', { from: '羽田空港', to: '新千歳空港' })),
      say('羽田空港と新千歳空港にピンを立てました。2点間の大圏距離は約820 kmです。'),
    ],
    respond: (a) => done('<div>' + (a.place || ((a.from || '') + ' → ' + (a.to || '') + ' · 820 km')) + '</div>', ['map']),
    expect: { verdict: 'pass', grade: 'correct' },
  },
  {
    id: 'malformed-call-handed-back',
    ...textOf('answers', 'australia-capital-name'),
    origin: { kind: 'scripted', from: 'js/atlas-agent.js reject — a call whose arguments do not match the schema never reaches the dispatch; it is handed back typed, and the corrected call runs' },
    model: [
      step(['map_view', { zoom: 'far' }]),
      step(['map_view', { place: 'Canberra' }]),
      say('The capital of Australia is Canberra; the map is now centred on it.'),
    ],
    respond: () => done('<div>Canberra</div>', ['map']),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1 },
  },
];

/** build(P) → [cassette] — every scenario run once through the real loop */
export async function build(P) {
  const out = [];
  for (const scn of SCENARIOS) out.push(await recordScripted(scn, P));
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const P = await productModules((p) => import(pathToFileURL(join(ROOT, p)).href));
  const built = await build(P);
  const write = process.argv.includes('--write');
  let stale = 0;
  mkdirSync(CASSETTE_DIR, { recursive: true });
  for (const c of built) {
    const file = join(CASSETTE_DIR, c.id + '.json');
    const text = JSON.stringify(c, null, 2) + '\n';
    const same = existsSync(file) && canon(JSON.parse(readFileSync(file, 'utf8'))) === canon(JSON.parse(text));
    if (write) { if (!same) { writeFileSync(file, text); console.log('wrote ' + c.id); } }
    else if (!same) { stale++; console.log('  STALE ' + c.id + ' — the scenario and its cassette differ (run with --write if that is intended)'); }
  }
  if (!write) { console.log(stale ? stale + ' stale cassette(s)' : 'scripted cassettes: ' + built.length + ' current'); process.exit(stale ? 1 : 0); }
}
