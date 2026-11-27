/* ============================================================================
 *  IntMap · ATLAS QUALITY LAB — DID ATLAS BRING WHAT THE READER DID NOT THINK TO ASK FOR?   (the initiative axis)
 * ----------------------------------------------------------------------------
 *  (atlas-ui-parts) The other axes grade faithfulness: the right number (grade.mjs), the right map for the words asked
 *  (map-state.mjs), the thing asked for existing (deliverables.mjs). None of them can see a reply that does exactly and only
 *  what was asked while a better one was available — a text answer about change across space and time, with nothing
 *  shown, nothing fetched, nothing the reader can flip. This is that missing half, and like the others it is a SEPARATE
 *  axis: "did what was asked" and "made it understood" fail for different reasons.
 *
 *  TWO READERS, NEITHER ASKED ABOUT A SUBJECT
 *    · expressionOf(obs)  — deterministic. The FAMILIES of expression the turn realized (a map, a chart, a table or
 *      dashboard, data shaded onto areas, a time axis, a control the reader can press), read off the capabilities the record
 *      says ran and the kinds of control it drew. A family is what the registry says a capability PRODUCES — the table of
 *      what-produces-what is discovered from js/atlas-capabilities.js, not listed here (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
 *    · the independent grader — ai-proxy `atlas_grade`, given this record as one line (`factsLine`) and scored on the
 *      `initiative` axis of the shared schema (supabase/functions/_shared/atlas-grade-schema.js). It judges whether what was
 *      added deepens understanding or only decorates; this file cannot, and does not pretend to.
 *
 *  ⚠ NOT A QUOTA. A count of families is a FACT printed beside the grade, never a target: "more representations" is the
 *    failure the order warned of (meaningless mapping). The grader's 1 means "proportionate"; only a question that invited more
 *    and got only words scores 0.
 *  ⚠ THE QUESTIONS ARE OPEN ON PURPOSE (scripts/atlas-eval/open-questions.json): no verified answer, no expected capability, no
 *    expected map — so nothing in the set can be answered by remembering what the set expected. They span unrelated subjects so
 *    that a gain is a gain in the general ability, not in one topic.
 *  Pure: no browser, no network (the registry file is read once).
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const str = (v) => (v == null ? '' : String(v));

let PRODUCES = null;
/** capability id -> the `produces` cell of its registry row (discovered from the generated rows of js/atlas-capabilities.js) */
export function producesTable(root = ROOT) {
  if (PRODUCES && root === ROOT) return PRODUCES;
  const src = readFileSync(join(root, 'js/atlas-capabilities.js'), 'utf8');
  const out = {};
  for (const m of src.matchAll(/^\s*\["([A-Za-z0-9_.]+)","[^"]*","[^"]*","[^"]*","[^"]*","[^"]*","([^"]*)"/gm)) out[m[1]] = m[2].split(',').filter(Boolean);
  if (root === ROOT) PRODUCES = out;
  return out;
}

/* A call whose RESULT says it did not happen drew nothing. The statuses are the ones js/atlas-results.js stamps (completed · partial · unobserved
   ran; failed · cancelled · superseded · needs_input · running did not finish what was asked), and `ok:false` is a failure whatever it is called.
   A result that cannot be read states nothing, so the call counts as made (an old record that kept only the arguments). */
const NO_EFFECT = new Set(['failed', 'cancelled', 'superseded', 'needs_input', 'running', 'refused']);
export function tookEffect(resultText) {
  let o = resultText;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { return true; } }
  if (!o || typeof o !== 'object') return true;
  if (o.ok === false) return false;
  return !NO_EFFECT.has(str(o.status));
}

/* ⚠ (atlas-controls-receipts) WHAT WAS DRAWN IS READ OFF THE RESULT, NEVER OFF THE ARGUMENTS. This used to walk the call's arguments for anything shaped like a
   control, so one good button and one tab group the renderer refused was recorded as 「drew tabs」 and the turn earned `interactive` for a switch nobody could
   see (measured in an external audit). The UI generator now returns the controls it put on the page — `details.drawn` [{id, kind, options?}] — and that list
   is the only source. A record without it (made before it existed) states no control. */
function resultOf(c) {
  let o = c && c.resultText;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { return null; } }
  return o && typeof o === 'object' ? o : null;
}
/** drawnControls(calls) -> [{id, kind, options?}] the controls the calls' results say are on the page */
export function drawnControls(calls) {
  const out = [];
  for (const c of calls || []) {
    if (c && c.resultText != null && !tookEffect(c.resultText)) continue;
    const o = resultOf(c); const d = o && ((o.details && o.details.drawn) || o.drawn);
    if (Array.isArray(d)) d.forEach((x) => { if (x && x.id && x.kind) out.push({ id: String(x.id), kind: String(x.kind), options: Number.isFinite(+x.options) ? +x.options : undefined }); });
  }
  return out;
}
/** drawnSwitches(calls) -> the drawn controls a reader flips between states (tabs / steps): what the harness presses */
export function drawnSwitches(calls) { return drawnControls(calls).filter((x) => (x.kind === 'tabs' || x.kind === 'steps') && x.options >= 2); }
function controlKinds(calls) { return [...new Set(drawnControls(calls).map((x) => x.kind.toLowerCase()))]; }
/**
 * switchWorked(p) -> true when pressing the switch moved the map: every option was confirmed by its row AND at least two options left the map in different
 * states (clock, ticked layers or legend). A switch whose options all show the same map is drawn but not a switch.
 */
export function switchWorked(p) {
  if (!p || !p.found || !Array.isArray(p.options) || p.options.length < 2) return false;
  if (!p.options.every((o) => o && o.confirmed)) return false;
  const sig = (o) => JSON.stringify(o.after || null);
  return new Set(p.options.map(sig)).size >= 2;
}

/**
 * expressionOf(obs, table?) -> { families, capabilities, controls } | null when the record carries no operations.
 * A family is a word the registry itself uses in a `produces` cell (map, chart, panel, explanation, camera ...) plus
 * `interactive` when the turn drew a switch the reader can press (tabs / steps) - the one thing a `produces` cell cannot say.
 */
export function expressionOf(obs, table = producesTable()) {
  const ops = obs && Array.isArray(obs.operations) ? obs.operations : null;
  if (!ops) return null;
  const fam = new Set(), caps = new Set();
  for (const o of ops) {
    if (!o || NO_EFFECT.has(str(o.status))) continue;
    const id = str(o.capabilityId);
    if (!id) continue;
    caps.add(id);
    (table[id] || []).forEach((p) => fam.add(p));
  }
  const controls = controlKinds(obs.calls);
  /* `interactive` is earned by the press, not by the drawing: the harness pressed every option of each drawn switch (scripts/atlas-eval.mjs PAGE.press) */
  const pressed = Array.isArray(obs.pressed) ? obs.pressed : [];
  const working = pressed.filter(switchWorked).map((p) => p.id);
  if (working.length) fam.add('interactive');
  return { families: [...fam].sort(), capabilities: [...caps].sort(), controls, switches: { drawn: drawnSwitches(obs.calls).length, working: working.length } };
}

/** factsLine(expr) -> the one line the grader is given beside the reply (what the turn DID, from the record) */
export function factsLine(expr) {
  if (!expr) return 'the record carries no operations';
  return (expr.capabilities.length ? 'capabilities that ran: ' + expr.capabilities.join(', ') : 'no capability ran (words only)')
    + ' / kinds of output: ' + (expr.families.join(', ') || 'none')
    + (expr.controls.length ? ' / controls drawn in the reply: ' + expr.controls.join(', ') : '')
    + (expr.switches && expr.switches.drawn ? ' / switches that changed the map when pressed: ' + expr.switches.working + ' of ' + expr.switches.drawn : '');
}

/** initiativeOf(turns) -> the axis over the turns that were graded: how many, the mean, the distribution; ungraded counted apart */
export function initiativeOf(turns) {
  const t = (turns || []).filter((x) => x && x.metrics && x.metrics.rubric);
  const scored = t.filter((x) => x.metrics.rubric.measured && x.metrics.rubric.initiative != null);
  const dist = { 0: 0, 1: 0, 2: 0 };
  for (const x of scored) dist[x.metrics.rubric.initiative]++;
  const sum = scored.reduce((s, x) => s + x.metrics.rubric.initiative, 0);
  return {
    graded: scored.length, ungraded: t.length - scored.length, mean: scored.length ? sum / scored.length : null, distribution: dist,
    wordsOnlyWhereMoreWasInvited: scored.filter((x) => x.metrics.rubric.initiative === 0).map((x) => x.id),
  };
}

/** validateOpenQuestions(set) -> [problem...]: an open question carries no answer, expectation, capability or map - the point of the set */
export function validateOpenQuestions(set) {
  const bad = [], ids = new Set();
  for (const q of (set && set.questions) || []) {
    if (!q.id || ids.has(q.id)) bad.push('duplicate or missing id: ' + q.id);
    ids.add(q.id);
    if (q.lang !== 'en' && q.lang !== 'jp') bad.push(q.id + ': lang must be en or jp');
    if (!str(q.text).trim()) bad.push(q.id + ': no text');
    for (const k of ['answer', 'expect', 'mapState', 'capabilities', 'deliverables']) if (q[k] != null) bad.push(q.id + ': an open question carries no "' + k + '" - nothing may say what the right shape of the reply is');
  }
  return bad;
}
