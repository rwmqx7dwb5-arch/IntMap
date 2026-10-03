/* ============================================================================
 *  sales-next — the classroom worksheet (a tour on paper) and the enquiries pipeline   (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code where it can run without a browser:
 *    ① the worksheet's page model (js/tour-worksheet.js sheetModel), EVALUATED on a declared tour: the
 *      curriculum unit the tour declares, one step per step, the student sheet carries no teacher text, the
 *      teacher sheet carries what to read out and an address that opens THAT step, a written tour gets no
 *      address, every credit once, a step not pictured keeps its reason;
 *    ② it reuses — not copies — the map postcard and the time-lapse's «has the map drawn» reading, and the
 *      player keeps the preview on screen in the classroom mode and yields its keys to it;
 *    ③ Atlas reaches it: `panel.tourWorksheet` is a registry row and the planner's catalogue describes it;
 *    ④ the pipeline's words are one declaration (inquiry-shape.js INQUIRY_PIPELINE): the table's CHECKs, the
 *      generated console page and the console's scripts say the same, and the scripts spell none of them;
 *    ⑤ the pipeline board's model (js/admin-pipeline.js pipelineModel), EVALUATED: what is a lead, what is
 *      due on the operator's own day, what is open without a date, a stage the page does not know;
 *    ⑥ the board is shipped and only an admin's grant names the new columns.
 *  The database half (CHECKs, RLS) is supabase/tests/24_org_inquiry_pipeline_test.sql.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const modUrl = (p) => pathToFileURL(path.join(ROOT, p)).href;
if (!globalThis.window) globalThis.window = globalThis;

const tours = await import('../js/tours.js');
const { CURRICULUM } = await import('../js/showcase.js');
const W = await import('../js/tour-worksheet.js');

/* the tour as the player hands it (js/tour-player.js playingTour), built from the declaration in the reader's language */
function asPlayed(id, lang) {
  const d = tours.tourById(id);
  const pick = (v) => (Array.isArray(v) ? (lang === 'jp' ? v[1] : v[0]) : String(v || ''));
  return { id: d.id, title: pick(d.title), custom: false, temp: false, t: '', curriculum: d.curriculum.slice(), step: 1,
    steps: tours.tourSteps(d).map((s) => ({ title: pick(s.title), say: pick(s.say), ask: pick(s.ask), linked: !!s.hash })) };
}

test('① the worksheet model, evaluated: unit, steps, student vs teacher, an address per step, credits once, a missing map keeps its reason', () => {
  const tour = asPlayed('meiji-japan', 'jp');
  const N = tour.steps.length; assert.ok(N >= 2, 'the tour has steps to put on paper');
  const shots = tour.steps.map((_, i) => (i === 1 ? { ok: false, error: 'not-drawn-in-time' }
    : { ok: true, url: 'blob:x/' + i, w: 1200, h: 630, instant: '18' + i, credits: ['OpenHistoricalMap', i ? 'CShapes 2.0' : 'OpenHistoricalMap'] }));
  const base = 'https://example.test/IntMap/';
  const student = W.sheetModel(tour, shots, { lang: 'jp', base, made: new Date(2026, 9, 3) });
  const c = CURRICULUM[tour.curriculum[0]];
  assert.deepEqual(student.units, [c.subject[1] + ' — ' + c.item[1]], 'the unit is the one the tour declares, in the reader\'s language');
  assert.equal(student.steps.length, N);
  assert.equal(student.pictured, N - 1);
  assert.equal(student.steps[1].image, null); assert.equal(student.steps[1].imageError, 'not-drawn-in-time', 'a step not pictured says why');
  assert.ok(student.steps.every((s) => s.say === '' && s.link === ''), 'the student sheet carries no teacher text and no address');
  assert.deepEqual(student.steps.map((s) => s.ask), tour.steps.map((s) => s.ask), 'every question is the tour\'s own');
  assert.deepEqual(student.credits, ['OpenHistoricalMap', 'CShapes 2.0'], 'every credit once, in the order it first appears');
  assert.equal(student.made, '2026-10-03');

  const teacher = W.sheetModel(tour, shots, { lang: 'jp', base, teacher: true });
  assert.deepEqual(teacher.steps.map((s) => s.say), tour.steps.map((s) => s.say), 'the teacher sheet carries what to read out');
  teacher.steps.forEach((s, i) => {
    assert.ok(s.link.startsWith(base + 'index.html?'), 'step ' + (i + 1) + ' has a short address');
    const q = tours.tourFromSearch(new URL(s.link).search);
    assert.deepEqual(q, { id: 'meiji-japan', step: i + 1 }, 'and that address opens THIS step of THIS tour');
  });

  const written = Object.assign({}, tour, { id: 'custom', custom: true, curriculum: [] });
  assert.ok(W.sheetModel(written, shots, { lang: 'en', base, teacher: true }).steps.every((s) => s.link === ''), 'a written tour has no short address, so none is printed');
  assert.deepEqual(W.sheetModel(written, shots, { lang: 'en' }).units, []);
});

test('② it reuses the postcard and the lapse\'s drawn reading; the player keeps the preview and yields its keys', async () => {
  const R = rd('js/map-recorder.js');
  assert.match(R, /^export \{ postcard \};$/m, 'the postcard is exported, not copied');
  assert.match(R, /export function siteBrand\(\) \{ return brand\(\); \}/);
  assert.match(rd('js/time-lapse.js'), /export async function mapDrawn\(\) \{ return drawnNow\(\); \}/, 'the lapse\'s own «has the map drawn» reading');
  const src = rd('js/tour-worksheet.js');
  assert.ok(src.includes('R.postcard(') && src.includes('TL.mapDrawn('), 'the worksheet pictures with the postcard after the lapse\'s reading');
  assert.ok(!/getContext\(|drawImage\(|toBlob\(/.test(src), 'the worksheet composes no picture of its own');
  assert.ok(!src.includes('.innerHTML'), 'the sheet is built from text nodes');
  assert.ok(Number.isFinite(W.DRAW_WAIT_MS) && W.DRAW_WAIT_MS > 0 && W.ANSWER_LINES > 0);
  const P = await import('../js/tour-player.js');
  assert.ok(P.CLASSROOM_CSS.includes(':not(#im-worksheet)'), 'the classroom mode keeps the worksheet on screen');
  const pl = rd('js/tour-player.js');
  assert.match(pl, /if \(document\.documentElement\.hasAttribute\('data-worksheet'\)\) return;/, 'the player yields its keys while the preview is open');
  assert.match(pl, /data-imt="sheet"/, 'the classroom panel has the worksheet button');
  assert.match(pl, /a === 'sheet'\) import\('\.\/tour-worksheet\.js'\)/);
  assert.equal(typeof P.playingTour, 'function'); assert.equal(P.playingTour(), null, 'nothing is playing in node');
});

test('③ Atlas reaches the worksheet: a registry row, and the catalogue describes it', async () => {
  assert.ok(rd('js/atlas-capabilities.js').includes('["panel.tourWorksheet","tourWorksheet"'), 'panel.tourWorksheet is a registry row');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const text = makeAtlasCatalogText({ lang: 'en' }, {}).text(['panel.tourWorksheet']);
  assert.match(text, /"type":"tourWorksheet"/);
  assert.match(text, /teacher/);
});

const SHAPE = await import(modUrl('supabase/functions/_shared/inquiry-shape.js'));
const PIPE = SHAPE.INQUIRY_PIPELINE;
const MIG = rd('supabase/migrations/20261003210000_org_inquiry_pipeline.sql');
const MIG0 = rd('supabase/migrations/20261003150000_org_inquiries.sql');
const words = (s) => [...s.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);

test('④ one declaration of the pipeline\'s words: the table, the generated page, and scripts that spell none of them', async () => {
  assert.deepEqual(words((/check \(stage in \(([^)]*)\)\)/.exec(MIG) || [])[1] || ''), [...PIPE.stages], 'the stage CHECK');
  assert.equal(+((/char_length\(next_step\) <= (\d+)/.exec(MIG) || [])[1]), PIPE.nextStepMax, 'the next-step ceiling');
  assert.deepEqual(words((/status\s+text\s+not null default 'new' check \(status in \(([^)]*)\)\)/.exec(MIG0) || [])[1] || ''), [...PIPE.statuses], 'the triage words are the table\'s');
  assert.ok(PIPE.closedStages.every((s) => PIPE.stages.includes(s)) && !PIPE.closedStages.includes(PIPE.stages[0]));
  assert.ok(PIPE.notLeads.purposes.every((p) => SHAPE.INQUIRY.purposes.includes(p)) && PIPE.notLeads.statuses.every((s) => PIPE.statuses.includes(s)));
  const GEN = await import(modUrl('scripts/org-pages.mjs'));
  const html = GEN.outputs(GEN.orgFacts())[GEN.ADMIN_PAGE];
  const main = /<main id="aq-view-admin"([^>]*)>/.exec(html)[1];
  const attr = (n) => (new RegExp(n + '="([^"]*)"').exec(main) || [])[1];
  assert.equal(attr('data-stages'), PIPE.stages.join(','));
  assert.equal(attr('data-statuses'), PIPE.statuses.join(','));
  assert.equal(attr('data-closed-stages'), PIPE.closedStages.join(','));
  assert.equal(+attr('data-next-step-max'), PIPE.nextStepMax);
  assert.match(html, /id="tab-pipe"/); assert.match(html, /id="list-pipe"/);
  for (const f of ['js/admin-inquiries.js', 'js/admin-pipeline.js']) {
    const lits = new Set([...rd(f).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
    const spelled = [...PIPE.stages, ...PIPE.statuses].filter((w) => lits.has(w));
    assert.deepEqual(spelled, [], f + ' spells no pipeline or triage word itself (it reads them from the page)');
  }
});

test('⑤ the board\'s model, evaluated: leads, due on the operator\'s day, open without a date, an unknown stage', async () => {
  const P = await import('../js/admin-pipeline.js');
  const w = P.wordsFrom({ dataset: { statuses: PIPE.statuses.join(','), stages: PIPE.stages.join(','), closedStages: PIPE.closedStages.join(','),
    notLeadPurposes: PIPE.notLeads.purposes.join(','), notLeadStatuses: PIPE.notLeads.statuses.join(','), nextStepMax: String(PIPE.nextStepMax) } });
  assert.ok(w);
  assert.equal(P.wordsFrom({ dataset: {} }), null, 'a page without the words gets no board, not a guessed list');
  const [lead, talking, trial, adopted, declined] = PIPE.stages;
  const now = new Date(2026, 9, 3, 23, 30);   /* late on the operator's 3 October — the due line is their day, not UTC's */
  const row = (o) => Object.assign({ id: o.name, created_at: '2026-09-01T00:00:00Z', audience: 'education', purpose: 'classroom', status: PIPE.statuses[1], stage: lead, next_step_on: null }, o);
  const rows = [
    row({ name: 'a', stage: talking, next_step_on: '2026-10-03' }),            /* due today */
    row({ name: 'b', stage: trial, next_step_on: '2026-10-01' }),              /* overdue */
    row({ name: 'c', stage: trial, next_step_on: '2026-10-04' }),              /* tomorrow */
    row({ name: 'd', stage: adopted, next_step_on: '2026-09-01' }),            /* closed: not due */
    row({ name: 'e', stage: talking }),                                        /* open, past the first stage, no date */
    row({ name: 'f', stage: lead }),                                           /* a lead nobody has talked to: not «undated» */
    row({ name: 'g', status: PIPE.notLeads.statuses[0] }),                     /* spam */
    row({ name: 'h', purpose: PIPE.notLeads.purposes[0], audience: 'supporter' }), /* a supporter asking to be named */
    row({ name: 'i', stage: 'won', audience: 'newsroom' }),                    /* a stage the page does not declare */
    row({ name: 'j', stage: declined, audience: 'newsroom' }),
  ];
  const m = P.pipelineModel(rows, w, now);
  assert.equal(m.today, '2026-10-03');
  assert.deepEqual(m.leads.map((r) => r.name).sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'i', 'j'], 'spam and a supporter listing are not leads');
  assert.deepEqual(m.due.map((r) => r.name), ['b', 'a'], 'due: open, on or before today, oldest first');
  assert.deepEqual(m.undated.map((r) => r.name), ['e']);
  assert.deepEqual(m.unknownStage.map((r) => r.name), ['i'], 'an unknown stage is said, not dropped');
  assert.deepEqual(m.columns[trial].map((r) => r.name), ['b', 'c']);
  assert.deepEqual(Object.keys(m.columns), [...PIPE.stages]);
  assert.equal(m.byAudience.education[trial], 2); assert.equal(m.byAudience.newsroom[declined], 1);
  assert.equal(P.ageDays('2026-10-01T00:00:00Z', Date.parse('2026-10-03T12:00:00Z')), 2);
});

test('⑥ the board is shipped, and the new columns are granted to the role RLS already confines to admins', async () => {
  const { STATIC_ASSETS } = await import(modUrl('vite.config.js'));
  assert.ok(STATIC_ASSETS.includes('js/admin-pipeline.js'), 'copied into dist/ beside admin-inquiries.js');
  assert.match(rd('js/admin-inquiries.js'), /import\('\.\/admin-pipeline\.js'\)/, 'loaded only when the Pipeline tab opens');
  const g = /grant update \(([^)]*)\) on table public\.org_inquiries to authenticated;/.exec(MIG);
  assert.ok(g); assert.deepEqual(g[1].split(',').map((s) => s.trim()), ['stage', 'next_step', 'next_step_on', 'stage_changed_at']);
  assert.ok(!/create policy|disable row level security|grant [^;]* to anon/i.test(MIG), 'no new policy, no anon grant: RLS (admin only) is unchanged');
});
