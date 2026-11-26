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

/* (atlas-eval-map-state) the FINAL MAP the world reports — in the shapes IntMapAtlasState.snapshot() publishes
   (js/atlas-state.js `viewport` / `objects`, js/atlas-console.js `atlas`), and only the sections the
   scenario's own world speaks for. A scenario whose world does not say what the map became (a camera move
   that was never observed, a turn R802 recorded without its clock) carries NO snapshot: the map axis is then
   `unobserved`, which is the point of keeping it apart from `mismatch`.
   ⚠ The frame's numbers are the scripted world's, like the 「1,554 km」 its dispatch returns — what the replay
   holds is the grader reading them, not the renderer producing them. */
const frame = (west, south, east, north) => ({ viewport: { west, south, east, north } });
/* js/atlas-console.js `_atlasOverlayState` as it starts: every drawing null, no country highlighted */
const ATLAS_EMPTY = { highlightCountries: 0, highlight: null, choropleth: null, customScore: null, pins: null, polygons: null, lines: null, measure: null, radius: null, userPins: null, tool: '' };
const objects = (...kinds) => ({ objects: { n: kinds.length, items: kinds.map((k, i) => ({ id: k + '-' + i, kind: k, name: '' })) } });

/* ── (atlas-delegation-eval) research.delegate, as its result reaches the model ──────────────────────────────────
   js/atlas-cap-research.js hands back `meta.delegated[]` (one entry per task, in js/atlas-delegate.js's shape) and
   `meta.delegatedCostUsd`; the surface carries both to the model. A child here is the shape of a real one — a summary,
   findings with their sources, the gaps — and the numbers a cassette cannot take from anywhere (cost, calls, ms) are the
   SCRIPT's: a worker with web search is one to two calls and costs about a cent, and runs ten to thirty seconds. They
   are fixtures that exercise the judge's arithmetic offline, not measurements — the bench online
   (scripts/atlas-delegation-bench.mjs without --offline) is where they are measured.
   `msOf` is how long the world took to answer an action (replay.mjs reads it like the live tap does). */
const kid = (id, state, o = {}) => ({ id, state, code: o.code, detail: o.detail, summary: o.summary || '', findings: o.findings || [], gaps: o.gaps || [], sources: o.sources || [], costUsd: o.costUsd || 0, calls: o.calls == null ? 1 : o.calls, ms: o.ms });
const delegatedResult = (kids) => {
  const ok = kids.filter((k) => k.state === 'done' || k.state === 'partial').length;
  return { ok: ok > 0, html: '<div class="atl-deleg">' + kids.map((k) => k.id + ' — ' + k.state).join(' · ') + '</div>', meta: {
    status: ok === kids.length ? 'completed' : (ok ? 'partial' : 'failed'),
    code: ok === kids.length ? undefined : (ok ? 'some_tasks_ended_otherwise' : (kids[0] && kids[0].code) || 'no_findings'),
    produced: ok ? ['explanation'] : undefined,
    delegated: kids, delegatedCostUsd: kids.reduce((m, k) => m + k.costUsd, 0) } };
};
const piece = (id, goal) => ({ id, goal, returns: 'one figure with its reference date and a source URL' });
const analyze = (question, extra) => run('research.analyze', Object.assign({ question }, extra || {}));
const explained = (html) => done('<div>' + html + '</div>', ['explanation']);

/* the pieces of the three delegation questions (scripts/atlas-eval/answer-key.json) */
const NA = [['us', 'the United States', 'resident population in the 2020 Census (1 April 2020)'], ['ca', 'Canada', 'population in the 2021 Census'], ['au', 'Australia', 'population in the 2021 Census']];
const JPN = [['tokyo', '東京都', '東京都の人口（令和2年国勢調査）'], ['osaka', '大阪府', '大阪府の人口（令和2年国勢調査）'], ['hokkaido', '北海道', '北海道の人口（令和2年国勢調査）']];
const ROUTES = [['crude', 'Persian Gulf crude oil to Japan', 'the sea route from the Persian Gulf terminals to Japan'], ['ironore', 'Western Australian iron ore to Japan', 'the sea route from Port Hedland to Japan'], ['lng', 'Qatari LNG to Japan', 'the sea route from Ras Laffan to Japan']];

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
    /* the route the world drew, framed: the inventory holds it as kind `route` (js/map-tools.js) */
    snapshot: { ...frame(134.6, 34.2, 140.6, 36.2), ...objects('route') },
    expect: { verdict: 'pass', grade: 'correct', map: 'match' },
  },
  {
    id: 'rail-request-reached-nothing',
    ...textOf('records', 'rail-tokyo-osaka'),
    origin: { kind: 'scripted', from: 'R802 §2 — find_capability ×8, zero operations, step_budget (DEV-NOTES.md R802; dev-notes record)' },
    model: [
      ...['鉄道 経路', '電車 ルート', '乗換案内', '所要時間 距離', '新幹線', 'train route', 'rail directions', '経路探索'].map((q) => step(['find_capability', { query: q }])),
      say(''), say(''),   /* (atlas-unbounded-execution) the empty final, handed back once, and the same again */
      finalSay(''),
    ],
    respond: () => { throw new Error('this turn reaches no dispatch'); },
    /* zero operations on the fresh page the harness asks every question on (scripts/atlas-eval.mjs): nothing
       was drawn, so the map is the one the page started with — no object, no Atlas drawing */
    snapshot: { ...objects(), atlas: ATLAS_EMPTY },
    expect: { verdict: 'fail', failures: ['reach', 'operations'], map: 'mismatch' },
  },
  {
    id: 'layer-values-refused-every-time',
    ...textOf('records', 'population-density-tokyo-delhi-lagos'),
    origin: { kind: 'scripted', from: 'R802 §4 — data.layerValues ×17, all failed with 「No readable data on the active layers here」, step_budget, no reply' },
    model: [
      ...[['Tokyo', 'Delhi'], ['Lagos', 'Tokyo, Japan'], ['Delhi, India', 'Lagos, Nigeria'], ['東京', 'デリー'], ['ラゴス', 'Tokyo Metropolis'],
        ['New Delhi', 'Lagos State'], ['Tokyo 23 wards', 'National Capital Territory'], ['Lagos Island', 'Tokyo-to']]
        .map(([a, b]) => step(run('data.layerValues', { place: a, layer: 'population density' }), run('data.layerValues', { place: b, layer: 'population density' }))),
      say(''), say(''),   /* (atlas-unbounded-execution) the empty final, handed back once, and the same again */
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
    /* no snapshot: the page was not compositing, so where the camera ended is exactly what was not observed */
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1, map: 'unobserved' },
  },
  {
    id: 'cut-short-answer-written-after',
    ...textOf('records', 'gdp-per-capita-top10-not-in-total'),
    origin: { kind: 'scripted', from: 'R802 §8 — the turn ran out with 「I\'m comparing the two rankings now.」 as its text. (atlas-unbounded-execution) With no step count the same script reaches its own answer on the ninth reply — no forced final' },
    model: [
      step(run('data.rank', { metric: 'gdp_per_capita', order: 'top', n: 10 })),
      { text: 'I\'m comparing the two rankings now.', turnState: 'continuing', toolCalls: [{ id: 'c0', name: 'run_capability', arguments: { id: 'data.rank', args: { metric: 'gdp', order: 'top', n: 10 } } }] },
      ...[12, 15, 20, 25, 30, 35].map((n) => step(run('data.rank', { metric: 'gdp', order: 'top', n }))),
      say('Of the top 10 by GDP per capita, Luxembourg, Ireland, Switzerland, Norway, Singapore, Iceland, Qatar and Denmark are not in the top 10 by total GDP; the United States is in both lists.'),
    ],
    respond: (a) => done('<div>' + (a.metric || 'rank') + ' top ' + (a.n || 10) + '</div>', ['map', 'panel']),
    expect: { verdict: 'pass' },
  },
  {
    id: 'cut-short-narration-is-the-reply',
    ...textOf('records', 'gdp-per-capita-top10-not-in-total'),
    origin: { kind: 'scripted', from: 'R802 §8 — the turn ran out on a narration, and the forced final came back empty: the reader got no answer. (atlas-unbounded-execution) With no step count the turn ends on its own empty final, handed back once and the hand-back empty too: still no answer' },
    model: [
      step(run('data.rank', { metric: 'gdp_per_capita', order: 'top', n: 10 })),
      { text: 'I\'m comparing the two rankings now.', turnState: 'continuing', toolCalls: [{ id: 'c0', name: 'run_capability', arguments: { id: 'data.rank', args: { metric: 'gdp', order: 'top', n: 10 } } }] },
      ...[12, 15, 20, 25, 30, 35].map((n) => step(run('data.rank', { metric: 'gdp', order: 'top', n }))),
      say(''), say(''),   /* (atlas-unbounded-execution) the empty final, handed back once, and the same again */
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
    /* the map was right and the sentence was wrong: map.measure holds its two points (`atlas.measure`) in a
       frame around both — the two axes disagree, which is why they are kept apart */
    snapshot: { ...frame(124.5, 24.0, 143.0, 37.5), atlas: { ...ATLAS_EMPTY, measure: { n: 2 }, tool: 'measure' } },
    expect: { verdict: 'fail', failures: ['answer'], grade: 'incorrect', map: 'match' },
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
    /* no snapshot: R802 recorded that the last operation cleared the pins, not where the clock or the frame ended */
    expect: { verdict: 'fail', failures: ['observer'], map: 'unobserved' },
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
    snapshot: { ...frame(147.0, -41.0, 178.0, -31.0), atlas: { ...ATLAS_EMPTY, measure: { n: 2 }, tool: 'measure' } },
    expect: { verdict: 'pass', grade: 'correct', map: 'match' },
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
    /* the two pins in the object inventory (kind `pin`), the measure's two points, both in the frame */
    snapshot: { ...frame(136.5, 33.5, 145.0, 44.5), ...objects('pin', 'pin'), atlas: { ...ATLAS_EMPTY, userPins: { n: 2 }, measure: { n: 2 }, tool: 'measure' } },
    expect: { verdict: 'pass', grade: 'correct', map: 'match' },
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
    snapshot: frame(148.6, -35.7, 149.6, -34.9),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1, map: 'match' },
  },
  /* ── (eval-shape-grading) THE THING ITSELF: the map is graded on `atlas.shapes.<kind>:<basis>`, not on «a line».
     The four turns below are the two ways a shape question is answered right and the two ways it was answered wrong
     (「フォッサマグナをマッピングして」 — dev-notes 2026-11-18-atlas-real-shapes). The snapshot's `shapes` is what
     js/atlas-console.js _atlasOverlayState tallies for the drawing the world reports. */
  {
    id: 'drawn-line-restyled-by-id-across-turns',
    ...textOf('records', 'restyle-drawn-line-across-turns'),
    origin: { kind: 'scripted', from: 'atlas-objects-unify — the reported case: a line Atlas drew could not be recoloured (the capability had list/remove/focus/rename, drawLine returned no object id, and the observer saw only id lists). The line now comes back with its id, and the later step edits THAT object through map.object set; the observer reads the look back from the map.' },
    model: [
      step(run('map.drawLine', { places: ['London', 'Paris'], label: 'London-Paris' })),
      step(run('map.object', { op: 'set', id: 'line_1', color: 'red', width: 5, opacity: 0.6 })),
      say('ロンドンからパリまで線を引き、その線（line_1）を赤・太さ5・不透明度60%に変えました。'),
    ],
    respond: (a) => (a && a.op === 'set'
      ? { ok: true, html: '<div>✓ set · line_1 · color=#ff0000, width=5, opacity=0.6</div>', objectIds: ['line_1'], meta: { status: 'completed', produced: ['object'], objectIds: ['line_1'] } }
      : { ok: true, html: '<div>London-Paris</div>', objectIds: ['line_1'], meta: { status: 'completed', produced: ['map', 'object'], objectIds: ['line_1'] } }),
    snapshot: { objects: { n: 1, items: [{ id: 'line_1', kind: 'line', name: 'London-Paris', color: '#ff0000', width: 5, opacity: 0.6, geom: 'line', editable: ['color', 'width', 'opacity', 'name'] }] } },
    expect: { verdict: 'pass', dispatched: 2, map: 'match' },
  },
  {
    id: 'river-traced-on-its-course',
    ...textOf('answers', 'shinano-river-length'),
    origin: { kind: 'scripted', from: 'representative: map.highlight on a river → the waterway\'s own course (fetchRiverLine), basis real' },
    model: [
      step(run('map.highlight', { query: '信濃川' })),
      say('信濃川の流路を地図に描きました（OpenStreetMap の水路）。幹川流路延長は367 kmで、日本一長い川です。'),
    ],
    respond: () => done('<div>✦ 信濃川</div>', ['map']),
    snapshot: { atlas: { ...ATLAS_EMPTY, lines: { n: 1 }, shapes: { n: 1, 'line:real': 1, names: ['信濃川'] } } },
    expect: { verdict: 'pass', grade: 'correct', map: 'match' },
  },
  {
    id: 'river-stood-in-by-a-drawn-line',
    ...textOf('answers', 'shinano-river-length'),
    origin: { kind: 'scripted', from: 'the stand-in this round grades: a line the model drew through towns on the river, counted as «a line» by the old key (atlas.lines ≥ 1) — no upstream vouches for its course' },
    model: [
      step(run('map.drawLine', { places: ['長野市', '小千谷市', '新潟市'], label: '信濃川' })),
      say('信濃川を地図に線で描きました。幹川流路延長は367 kmです。'),
    ],
    respond: () => done('<div>— 信濃川</div>', ['map']),
    snapshot: { atlas: { ...ATLAS_EMPTY, lines: { n: 1 }, shapes: { n: 1, 'line:unstated': 1 } } },
    expect: { verdict: 'pass', grade: 'correct', map: 'mismatch' },
  },
  {
    id: 'fault-stood-in-by-joined-towns',
    ...textOf('answers', 'itoigawa-shizuoka-tectonic-line-declined'),
    origin: { kind: 'scripted', from: 'the reported defect (2026-11-18): towns along the fault composed and joined by a schematic relation, reported as the fault' },
    model: [
      step(run('map.compose', { title: '糸魚川静岡構造線', items: [{ name: '糸魚川市' }, { name: '諏訪市' }, { name: '静岡市' }], relations: [{ from: 1, to: 2 }, { from: 2, to: 3 }] })),
      say('糸魚川静岡構造線を地図に描きました。糸魚川から諏訪を経て静岡に至る大断層です。'),
    ],
    respond: () => done('<div>1 糸魚川市 · 2 諏訪市 · 3 静岡市</div>', ['map', 'explanation']),
    snapshot: { atlas: { ...ATLAS_EMPTY, shapes: { n: 2, 'line:unstated': 2 } } },
    expect: { verdict: 'fail', failures: ['answer'], grade: 'absent', map: 'mismatch' },
  },
  {
    id: 'fault-declined-honestly',
    ...textOf('answers', 'itoigawa-shizuoka-tectonic-line-declined'),
    origin: { kind: 'scripted', from: 'representative: the shape is asked for (item.shape line), IntMap has none (shapesUnresolved, not_found), and the reply says so without a stand-in' },
    model: [
      step(run('map.compose', { title: '糸魚川静岡構造線', items: [{ name: '糸魚川静岡構造線', shape: 'line' }, { name: '糸魚川市' }, { name: '静岡市' }] })),
      say('糸魚川静岡構造線の線の形状データは、IntMap が読める典拠にありません。代わりの線は描かず、両端の糸魚川市と静岡市だけを地図に置きました。断層は糸魚川から諏訪湖付近を経て静岡に至ります。'),
    ],
    respond: () => ({ ok: true, html: '<div>1 糸魚川市 · 2 静岡市 — 糸魚川静岡構造線: no shape</div>', meta: { status: 'partial', produced: ['map', 'explanation'] } }),
    snapshot: { atlas: { ...ATLAS_EMPTY } },
    expect: { verdict: 'pass', grade: 'correct', map: 'match' },
  },
  /* ── (atlas-delegation-eval) THE PAIRED ARMS the A/B bench replays offline (scripts/atlas-delegation-bench.mjs --offline).
     Each question has one cassette in which the turn delegated (arm `delegate`) and one in which it did not (arm
     `direct`). Which one a real turn takes is Atlas's decision; these are the two things it can decide. The delegate
     arms are the three ways a delegation ends: every child returns, one is refused and the model regroups, one comes
     back unobservable and the reply must say so. */
  {
    id: 'delegate-census-total-all-children-done',
    ...textOf('answers', 'delegate-north-america-census-total'),
    arm: 'delegate',
    origin: { kind: 'scripted', from: 'representative: three independent pieces handed to workers at once, all three return findings, the reply integrates them into the total (fixture costs and times — see the note above)' },
    model: [
      step(run('research.delegate', { tasks: NA.map(([id, who, what]) => piece(id, 'Find ' + who + '\'s ' + what + ' as published by its national statistics office.')) })),
      say('The latest national censuses count 331,449,281 people in the United States (2020), 36,991,981 in Canada (2021) and 25,422,788 in Australia (2021). Together that is 393,864,050 people.'),
    ],
    msOf: () => 17100,
    respond: () => delegatedResult([
      kid('us', 'done', { summary: 'The 2020 Census counted 331,449,281 residents on 1 April 2020.', findings: [{ claim: 'Resident population of the United States, 1 April 2020: 331,449,281', place: 'United States', date: '2020-04-01', source: 'https://census.gov/newsroom/press-releases/2021/2020-census-apportionment-results.html' }], sources: ['https://census.gov/newsroom/press-releases/2021/2020-census-apportionment-results.html'], costUsd: 0.0118, ms: 13800 }),
      kid('ca', 'done', { summary: 'The 2021 Census counted 36,991,981 people in Canada (11 May 2021).', findings: [{ claim: 'Population of Canada, 2021 Census: 36,991,981', place: 'Canada', date: '2021-05-11', source: 'https://www12.statcan.gc.ca/census-recensement/stats/statind2021.cfm?Lang=E' }], sources: ['https://www12.statcan.gc.ca/census-recensement/stats/statind2021.cfm?Lang=E'], costUsd: 0.0094, ms: 11200 }),
      kid('au', 'done', { summary: 'The 2021 Census counted 25,422,788 people in Australia, excluding overseas visitors.', findings: [{ claim: 'Population of Australia, 2021 Census: 25,422,788', place: 'Australia' }], sources: [], costUsd: 0.0103, ms: 16400 }),
    ]),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1, delegation: { delegatedCount: 3, states: { done: 3 }, overlapped: true, regrouped: false } },
  },
  {
    id: 'direct-census-total-no-delegation',
    ...textOf('answers', 'delegate-north-america-census-total'),
    arm: 'direct',
    origin: { kind: 'scripted', from: 'representative: the same question answered without delegating — Atlas researches the three countries itself, three analyses in one reply' },
    model: [
      step(...NA.map(([, who, what]) => analyze('What is ' + who + '\'s ' + what + '?', { countries: [who] }))),
      say('The latest national censuses count 331,449,281 people in the United States (2020), 36,991,981 in Canada (2021) and 25,422,788 in Australia (2021). Together that is 393,864,050 people.'),
    ],
    respond: (a) => explained(String(a.question || 'analysis')),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 3, delegation: null },
  },
  {
    id: 'delegate-child-refused-and-regrouped',
    ...textOf('answers', 'delegate-japan-three-prefectures-census-total'),
    arm: 'delegate',
    origin: { kind: 'scripted', from: 'delegation-limits — the server admits fewer workers than were asked (ai-proxy refuses the third with delegation_children, measured 2026-11-19 against a two-worker policy); the refusal comes back as the task\'s state, and Atlas regroups by handing the refused piece in a call of its own' },
    model: [
      step(run('research.delegate', { tasks: JPN.map(([id, , what]) => piece(id, what + 'を、総務省統計局または都道府県の公表値で調べる。')) })),
      step(run('research.delegate', { tasks: [piece('hokkaido', '北海道の人口（令和2年国勢調査）を、総務省統計局または北海道の公表値で調べる。')] })),
      say('令和2年国勢調査の人口は、東京都14,047,594人、大阪府8,837,685人、北海道5,224,614人で、3 つの合計は28,109,893人です。'),
    ],
    msOf: (a) => (a.tasks.length === 3 ? 12400 : 8200),
    respond: (a) => (a.tasks.length === 3
      ? delegatedResult([
        kid('tokyo', 'done', { summary: '令和2年国勢調査の東京都の人口は14,047,594人。', findings: [{ claim: '東京都の人口（令和2年国勢調査）: 14,047,594人', place: '東京都', date: '2020-10-01', source: 'https://www.spt.metro.tokyo.lg.jp/tosei/hodohappyo/press/2022/01/20/07.html' }], sources: ['https://www.spt.metro.tokyo.lg.jp/tosei/hodohappyo/press/2022/01/20/07.html'], costUsd: 0.0112, ms: 11300 }),
        kid('osaka', 'done', { summary: '令和2年国勢調査の大阪府の人口は8,837,685人。', findings: [{ claim: '大阪府の人口（令和2年国勢調査）: 8,837,685人', place: '大阪府', date: '2020-10-01' }], sources: [], costUsd: 0.0097, ms: 9800 }),
        kid('hokkaido', 'refused', { code: 'delegation_children', detail: { status: 429 }, summary: 'この依頼で受け付ける子の仕事の数を超えています。', calls: 0, ms: 310 }),
      ])
      : delegatedResult([
        kid('hokkaido', 'done', { summary: '令和2年国勢調査の北海道の人口は5,224,614人。', findings: [{ claim: '北海道の人口（令和2年国勢調査）: 5,224,614人', place: '北海道', date: '2020-10-01' }], sources: [], costUsd: 0.0089, ms: 7900 }),
      ])),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 2, delegation: { delegatedCount: 4, states: { done: 3, refused: 1 }, refused: [{ id: 'hokkaido', code: 'delegation_children' }], regrouped: true } },
  },
  {
    id: 'direct-japan-census-total-no-delegation',
    ...textOf('answers', 'delegate-japan-three-prefectures-census-total'),
    arm: 'direct',
    origin: { kind: 'scripted', from: 'representative: the same question answered without delegating' },
    model: [
      step(...JPN.map(([, who, what]) => analyze(what + 'は？', { place: who }))),
      say('令和2年国勢調査の人口は、東京都14,047,594人、大阪府8,837,685人、北海道5,224,614人で、3 つの合計は28,109,893人です。'),
    ],
    respond: (a) => explained(String(a.place || 'analysis')),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 3, delegation: null },
  },
  {
    id: 'delegate-child-unobservable-said-so',
    ...textOf('answers', 'delegate-gulf-to-japan-routes-strait-name'),
    arm: 'delegate',
    origin: { kind: 'scripted', from: 'atlas-delegation — a worker whose request left and never came back is `unobservable` (not known to have failed, not retried — js/atlas-delegate.js); the call as a whole still returns the two findings, and the reply must tell the reader the third piece is missing rather than write it from memory' },
    model: [
      step(run('research.delegate', { tasks: ROUTES.map(([id, , what]) => piece(id, 'Describe ' + what + ': ports, waypoints and the narrow straits it passes.')) })),
      say('The Gulf crude and the Qatari LNG tankers both leave through the Strait of Hormuz, between Iran and the Musandam Peninsula of Oman, into the Gulf of Oman. I could not describe the Western Australian iron-ore route: that worker\'s request left but no answer came back, so I have not written it from memory.'),
    ],
    msOf: () => 30900,
    respond: () => delegatedResult([
      kid('crude', 'done', { summary: 'Crude from Gulf terminals leaves the Persian Gulf through the Strait of Hormuz, crosses the Arabian Sea and the Indian Ocean, and passes the Strait of Malacca before reaching Japan.', findings: [{ claim: 'Tankers leaving the Persian Gulf pass the Strait of Hormuz, the waterway between the Persian Gulf and the Gulf of Oman', place: 'Strait of Hormuz', source: 'https://en.wikipedia.org/wiki/Strait_of_Hormuz' }], sources: ['https://en.wikipedia.org/wiki/Strait_of_Hormuz'], costUsd: 0.0131, calls: 2, ms: 18900 }),
      kid('ironore', 'unobservable', { code: 'network', detail: { status: 0 }, summary: 'Failed to fetch', calls: 1, ms: 30000 }),
      kid('lng', 'done', { summary: 'LNG from Ras Laffan loads inside the Persian Gulf and leaves through the Strait of Hormuz.', findings: [{ claim: 'Ras Laffan, Qatar, is on the Persian Gulf coast; its LNG carriers leave via the Strait of Hormuz', place: 'Ras Laffan' }], sources: [], costUsd: 0.0108, ms: 14200 }),
    ]),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 1,
      delegation: { delegatedCount: 3, states: { done: 2, unobservable: 1 }, unobservable: ['ironore'], overlapped: true },
      replyMustMatch: [{ pattern: 'no answer came back|could not (?:describe|get|obtain|confirm)', why: 'a child that came back unobservable is a fact of this world; the reader must be told that piece is missing (never written from memory)' }] },
  },
  {
    id: 'direct-gulf-routes-no-delegation',
    ...textOf('answers', 'delegate-gulf-to-japan-routes-strait-name'),
    arm: 'direct',
    origin: { kind: 'scripted', from: 'representative: the same question answered without delegating' },
    model: [
      step(...ROUTES.map(([, , what]) => analyze('Describe ' + what + ' and the narrow straits it passes.'))),
      say('The Gulf crude and the Qatari LNG tankers both leave through the Strait of Hormuz, between Iran and the Musandam Peninsula of Oman, into the Gulf of Oman. The iron-ore route from Port Hedland does not pass it.'),
    ],
    respond: (a) => explained(String(a.question || 'analysis')),
    expect: { verdict: 'pass', grade: 'correct', dispatched: 3, delegation: null },
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
