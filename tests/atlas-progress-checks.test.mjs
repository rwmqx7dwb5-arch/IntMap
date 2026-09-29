/* ============================================================================
 *  Atlas · the work trace — what the reader sees while a turn runs (js/atlas-progress.js)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from four round files; every test keeps the title it had there:
 *    · tests/r723-atlas-progress-ui-checks.test.mjs   — every step stays on screen; no capability is 「考え中」
 *    · tests/r725-atlas-trace-detail-checks.test.mjs  — the detail column is the capability's own subject
 *    · tests/r744-atlas-trace-head-checks.test.mjs    — one live word, on the head; the turn's own clock
 *    · tests/r746-atlas-clock-rounding-checks.test.mjs — the clock never prints a time that does not exist
 *  The three files that used a DOM stub each carried their own copy of it; there is one now (the #R744
 *  copy, whose textContent='' empties the node as a real DOM's does).
 *  Their histories follow, each above its own tests.
 * ==========================================================================*/
/* ============================================================================
 *  R723 — 「Atlasの回答中に、なにをいまAtlasがやってるのかみえずらいから、ChatGPTやClaudeのような、
 *          作業中のことがよく見えるUIに。」
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED — not the fix. [[intmap-restate-the-defect-not-the-fix]]: a check that
 *  states the answer it happened to reach guards that answer, and #R520 showed one doing that for
 *  187 rounds. So each check below says what the reader COULD NOT SEE:
 *
 *    ① a turn's earlier steps vanished — the indicator was ONE element that overwrote itself;
 *    ② 109 of the registry's 138 capabilities said 「考え中」 while doing something else, because
 *       which word appeared came from a hand-written list of ~30 legacy `type` spellings;
 *    ③ from the FIRST tool call onwards there was no indicator at all, and no marker either — the
 *       compose step assigns `ai.innerHTML`, and `.atl-stage` is both;
 *    ④ what Atlas had decided to do was reported only to a developer diagnostics object.
 *
 *  ⚠ THESE RUN AGAINST THE MODULE, EVALUATED — not against its source. [[intmap-r505-lessons]]:
 *  a check that reads source cannot see evaluation order, and three of the four defects above are
 *  defects OF ORDER (what is wiped when, what is re-armed when, what is removed when). The DOM stub
 *  below is the smallest one those four questions need; it is deliberately not a DOM.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

/* ── a DOM the size of the question (the same shape tests/r723 uses) ───────────────────────── */
function makeNode(tag) {
  const n = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
    _cls: '', _attrs: Object.create(null), _text: '', _html: '',
    get className() { return this._cls; },
    set className(v) { this._cls = String(v || ''); },
    get classList() {
      const self = this;
      const set = () => new Set(self._cls.split(/\s+/).filter(Boolean));
      return {
        add: (c) => { const s = set(); s.add(c); self._cls = [...s].join(' '); },
        remove: (c) => { const s = set(); s.delete(c); self._cls = [...s].join(' '); },
        contains: (c) => set().has(c),
        toggle: (c) => { const s = set(); if (s.has(c)) { s.delete(c); } else { s.add(c); } self._cls = [...s].join(' '); return s.has(c); }
      };
    },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v == null ? '' : v); if (this._text === '') { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; } },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v == null ? '' : v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._fromHtml(); },
    _fromHtml() {
      const re = /<(\w+)[^>]*class="([^"]+)"[^>]*>/g; let m;
      while ((m = re.exec(this._html))) { const c = makeNode(m[1]); c.className = m[2]; c.parentNode = this; this.children.push(c); }
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    replaceChild(nw, old) { const i = this.children.indexOf(old); if (i >= 0) { this.children[i] = nw; nw.parentNode = this; old.parentNode = null; } return old; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    insertAdjacentElement(where, el) {
      const p = this.parentNode; if (!p) return null;
      const i = p.children.indexOf(this);
      p.children.splice(where === 'beforebegin' ? i : i + 1, 0, el); el.parentNode = p; return el;
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener() { },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const want = String(sel).replace(/^\./, ''); const out = [];
      (function walk(node) { node.children.forEach((c) => { if (c._cls.split(/\s+/).includes(want)) out.push(c); walk(c); }); })(this);
      return out;
    }
  };
  return n;
}
function withDom(fn) {
  const prev = { window: globalThis.window, document: globalThis.document };
  const root = makeNode('div');
  globalThis.window = globalThis.window || {};
  globalThis.document = { createElement: (t) => makeNode(t) };
  try { return fn(root); } finally { globalThis.document = prev.document; globalThis.window = prev.window; }
}
const load = async () => (await import('../js/atlas-progress.js'));
const registry = async () => (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
const mount = (mod, caps) => mod.makeAtlasProgress({}, { L: (en) => en, esc: (s) => String(s == null ? '' : s), capabilities: () => caps });
const ev = (operationId, capabilityId, phase) => ({ kernel: 'atlas', operationId, capabilityId, phase, source: 'atlas' });
function fakeExec() { const subs = []; return { on: (f) => { subs.push(f); return () => { }; }, fire: (e) => subs.forEach((f) => f(e)) }; }
function bubbleIn(root) { const b = makeNode('div'); b.className = 'atl-b a'; root.appendChild(b); return b; }
function rowsOf(root) { return root.querySelectorAll('atl-trace-row'); }
const headText = (root) => {
  const s = root.querySelectorAll('.atl-trace-sum')[0];
  if (!s) return null;
  const st = s.querySelectorAll('.atl-stage')[0];
  return st ? st.textContent : s.textContent;
};

/* the #R725 mount: the same module handed the schema registry too, so a detail can be read off it */
const schemas = async () => (await import('../js/atlas-schemas.js')).makeAtlasSchemas();
async function mountWithSchemas() {
  const mod = await load();
  const S = await schemas();
  const caps = await registry();
  const P = mod.makeAtlasProgress({}, {
    L: (en) => en, esc: (s) => String(s == null ? '' : s),
    capabilities: () => caps, schemas: () => S
  });
  return { P, S, caps };
}

/* render(ms) — what the head prints for a turn that lasted exactly this long.
   ⚠ The clock is moved, not the formatter called: this is the path the screen is painted by. */
function renderer(PROG, root) {
  return (ms) => {
    const real = Date.now;
    const b = makeNode('div'); b.className = 'atl-b a'; root.appendChild(b);
    let t = 1_000_000_000_000;
    try {
      Date.now = () => t;
      PROG.open(b);
      PROG.phase(b, 'think');   /* ⚠ a trace with no rows removes itself on done() — this turn did something */
      t += ms;
      PROG.done(b);
    } finally { Date.now = real; }
    const head = b.parentNode.children.filter((c) => c.className.includes('atl-trace')).pop();
    return (head.querySelectorAll('.atl-trace-ms')[0] || {}).textContent;
  };
}
/* the seconds a rendering claims, whatever form it took */
function secondsOf(text) {
  let m = /^(\d+)m(\d{2})s$/.exec(text);
  if (m) return { minutes: +m[1], seconds: +m[2], total: +m[1] * 60 + +m[2] };
  m = /^(\d+(?:\.\d)?)s$/.exec(text);
  if (m) return { minutes: 0, seconds: +m[1], total: +m[1] };
  return null;
}
/* ══ ① WHAT ALREADY HAPPENED STAYS ON SCREEN ════════════════════════════════════════════════════
   The defect: the indicator was ONE element and every step overwrote it, so a six-step turn showed
   one word at a time and left no trace of the other five. */
test('R723 ① every step of a turn is still on screen when the next one starts', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');

    EXEC.fire(ev('op1', 'view.flyTo', 'planned'));
    EXEC.fire(ev('op1', 'view.flyTo', 'completed'));
    EXEC.fire(ev('op2', 'research.brief', 'planned'));
    EXEC.fire(ev('op2', 'research.brief', 'completed'));
    EXEC.fire(ev('op3', 'data.weather', 'planned'));

    const rows = rowsOf(root);
    assert.ok(rows.length >= 4, 'the thinking row and all three operations are present, not one at a time (' + rows.length + ')');
    const words = rows.map((r) => (r.querySelectorAll('atl-trace-word')[0] || { textContent: '' }).textContent);
    assert.ok(words.includes('Moving the view'), 'the flyTo step is still listed: ' + words.join(' | '));
    assert.ok(words.includes('Researching'), 'so is the brief');
    assert.ok(words.includes('Looking up data'), 'and the one that is running now');
    /* and they are DISTINCT states, which is the half the one word could not express */
    const running = rows.filter((r) => r.className.includes('run'));
    assert.equal(running.length, 1, 'exactly one row is in flight');
    assert.ok(rows.filter((r) => r.className.includes('ok')).length >= 3, 'the finished ones say so');
    PROG.done(b);   /* the elapsed clock is a real interval outside a browser — stop it, as a turn does */
  });
});

/* ══ ② NO CAPABILITY IS SILENTLY 「考え中」 ══════════════════════════════════════════════════════
   The defect, measured at #R723: `_STAGE_OF` named 29 of the registry's 138 rows and returned
   'think' for the rest, so FOUR CAPABILITIES IN FIVE announced the wrong thing. The universe is the
   registry, not a list kept here — a capability added tomorrow is in it the moment it is added. */
test('R723 ② every capability the registry holds has a word of its own, and the registry is the universe', async () => {
  const mod = await load(); const caps = await registry();
  const all = caps.all().filter(Boolean);
  assert.ok(all.length >= 130, 'the registry is loaded (' + all.length + ' capabilities)');

  const cats = [...new Set(all.map((c) => c.category).filter(Boolean))];
  assert.ok(cats.length >= 10, 'and it uses ' + cats.length + ' categories');
  withDom(() => {
    const PROG = mount(mod, caps);
    const known = new Set(PROG.categoryWords());
    const missing = cats.filter((c) => !known.has(c));
    assert.deepEqual(missing, [], 'a category the registry uses with no word: ' + missing.join(', '));

    /* ⚠ AND THE FALLBACK IS NOT THE PHASE WORD. 「Thinking」 for an operation is precisely the old
       defect; if a word is ever missing the reader must get something true, not something wrong. */
    /* ⚠ (#R744) THE WORD, NOT THE MARKUP. This asked stageHtml('think') for the word until the live
       label moved to the trace head and the marker stopped carrying text — at which point every
       comparison below would have been made against an empty string and passed for the wrong
       reason. The question is about the WORD, so it is the word that is asked for. */
    const thinking = PROG.phaseWord('think');
    assert.ok(thinking.trim().length, 'the thinking word is a word');
    const silent = all.filter((c) => thinking === PROG.wordFor(c.id));
    assert.deepEqual(silent.map((c) => c.id), [],
      silent.length + ' capabilities would announce themselves as thinking');
    /* ⚠ AND THE SAME ASSERTION ASKED WHERE IT IS NOT VACUOUS. Every category the registry uses has a
       word, so the loop above never reaches the fallback — measured: replacing the fallback with the
       thinking word left the check above GREEN. An id outside this build's registry is the only input
       that exercises it, and the answer there must still not be the word that was the defect. */
    const unknown = PROG.wordFor('somecategory.notInThisBuild');
    assert.notEqual(unknown, thinking, 'an unrecognised capability is not announced as thinking either');
    assert.ok(unknown.trim().length, 'and it is not announced as nothing');
  });
});

/* ══ ③ THE MARKER SURVIVES THE COMPOSE THAT WIPES THE BUBBLE ════════════════════════════════════
   The defect: `runActions` ends every tool call with `_atlCompose(ai)`, which assigns
   `ai.innerHTML`. `.atl-stage` is BOTH the live word and the marker meaning 「this bubble is still
   working」 (#R313), so after tool 1 the reader saw no indicator for the rest of the turn AND the
   cancel scan could no longer find the reply to stop. Both halves failed silently, because
   `setStage` guards on the very class that had been erased. */
test('R723 ③ a compose mid-turn does not take the indicator — or the cancel marker — away', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    b.innerHTML = PROG.stageHtml('think');
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');
    assert.ok(b.querySelector('.atl-stage'), 'the pending reply starts with the marker');

    EXEC.fire(ev('op1', 'view.flyTo', 'planned'));
    b.innerHTML = '<div>the first tool’s result</div>';        /* exactly what _atlCompose does */
    assert.equal(b.querySelector('.atl-stage'), null, 'which does erase it — this is the defect');

    PROG.live(b);
    assert.ok(b.querySelector('.atl-stage'), 'and PROG.live is what puts it back, so the turn stays cancellable');
    /* the trace itself was never in the bubble, so it could not be erased at all */
    assert.equal(b.querySelectorAll('.atl-trace').length, 0, 'the trace is not a child of the bubble');
    assert.ok(root.querySelectorAll('.atl-trace').length, 'it is a sibling');
    assert.ok(rowsOf(root).length >= 2, 'and it still holds every step');

    /* ⚠ AND IT GOES AWAY WHEN THE TURN DOES. Re-arming after every compose includes the compose
       that renders the finished answer, so without this the reader would be left with a shimmering
       「考え中」 under a reply that had already arrived. */
    PROG.done(b);
    assert.equal(b.querySelector('.atl-stage'), null, 'a finished reply is not still working');
    assert.ok(root.querySelectorAll('.atl-trace').length, 'but what it did remains, openable');
  });
});

/* ══ ④ ONE LIVE TRACE, WHATEVER PATH A TURN LEAVES BY ═══════════════════════════════════════════
   A turn can end through an abort, a supersede or a throw. Making every exit call done() is a
   lifecycle, and a lifecycle is the thing #R623 and #R667 each got wrong; the invariant is enforced
   at the ONE place a new reply appears instead. */
test('R723 ④ a new reply ends the previous trace, so none is ever left spinning', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const a = bubbleIn(root);
    PROG.open(a); PROG.watch(EXEC); PROG.phase(a, 'think');
    EXEC.fire(ev('op1', 'view.flyTo', 'planned'));
    assert.equal(rowsOf(root).filter((r) => r.className.includes('run')).length, 1, 'the first reply is working');

    const b = bubbleIn(root);              /* the reader sent another message; nobody called done() */
    PROG.open(b);
    assert.equal(rowsOf(root).filter((r) => r.className.includes('run')).length, 0,
      'the abandoned trace stopped claiming to be working');

    /* …and the old trace no longer eats the executor's events */
    EXEC.fire(ev('op2', 'data.weather', 'planned'));
    const live = root.querySelectorAll('atl-trace')[1];
    assert.ok(live && live.querySelectorAll('atl-trace-row').length >= 1, 'the new reply is the one being traced');
    PROG.done(b);
  });
});

/* ══ ⑤ THE HAND-WRITTEN LIST IS GONE FROM THE CONSOLE ═══════════════════════════════════════════
   Not a style rule: while `_STAGE_OF` exists, adding a capability to it one spelling at a time is
   the cheapest-looking repair, and that is how 109 silent capabilities accumulated
   ([[intmap-no-ad-hoc-hardcoding]] — .agents/rules/no-ad-hoc-hardcoding.md §1). */
test('R723 ⑤ no list of action spellings decides what the reader is told', async () => {
  const { readFileSync } = await import('node:fs');
  /* ⚠ COMMENTS ARE NOT CODE, AND THIS CHECK MUST NOT READ THEM. Both files EXPLAIN what `_STAGE_OF`
     was — keeping that record is what [[intmap-restate-the-defect-not-the-fix]] asks for — so a raw
     text search finds the name in prose and calls a completed removal a failure. scripts/code-only.mjs
     is the repository's one stripper; growing a second one here is [[intmap-recurring-lessons]] G. */
  const { codeOnly } = await import('../scripts/code-only.mjs');
  const code = (p) => codeOnly(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const src = code('../js/atlas-console.js');
  assert.ok(!/_STAGE_OF/.test(src), 'the type→stage list is gone from js/atlas-console.js');
  assert.ok(!/_STAGE_TXT/.test(src), 'and so is its label table — one indicator, one owner');
  assert.ok(/PROG\.step\(/.test(src), 'and the call site that used to consult it asks the trace instead');
  assert.ok(!/\bflyTo\b/.test(code('../js/atlas-progress.js')),
    'and the module that replaced it names no capability spelling in its own code');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R725 (formerly tests/r725-atlas-trace-detail-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R725 — 本番で実測: Atlas の作業一覧の「引数」欄が、実際のターンで全行空だった
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED. #R723 shipped a work trace whose detail column read
 *
 *      a.name || a.place || a.country || a.metric || a.query || a.topic || a.mode || …
 *
 *  — ELEVEN KEY NAMES, copied from js/atlas-turn-continuity.js. Production measured what that
 *  costs: on a real turn every row's detail was the empty string, because the capability that ran
 *  (`map.compose`) carries its subject under `title`, a twelfth spelling nobody had thought of.
 *  Adding `title` would have fixed that one turn and left the next capability blank
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1: 「報告された 1 件のための記述」).
 *
 *  The capability already declares the answer. js/atlas-schemas.js says, per capability and in the
 *  capability's own order, which arguments are free text (a SUBJECT) and which come from a declared
 *  vocabulary (a SETTING: `enum`, `boolean`, `number`). The rule is stated over that distinction.
 *
 *  ⚠ EVALUATED, NOT READ (#R505). These load the real schema module and the real registry; a check
 *  that greps js/atlas-progress.js for key names would be the very list being removed.
 * ==========================================================================*/
/* ══ ① THE REPORTED TURN, ARGUMENT BY ARGUMENT ══════════════════════════════════════════════════
   These four capabilities and these four argument objects are what production actually executed
   (captured from IntMapAtlasExec.execute during the reported turn). Every row's detail was empty. */
test('R725 ① the capabilities of the reported turn each name their own subject', async () => {
  const { P } = await mountWithSchemas();
  const observed = [
    ['data.weather', { type: 'weather', place: '大阪市, 日本' }, '大阪市, 日本'],
    ['data.weather', { type: 'weather', place: '札幌市, 日本' }, '札幌市, 日本'],
    /* ⚠ THE ONE THAT WAS BLANK. `title` is the subject; `camera` is a setting with two enum values,
       and it comes FIRST in the argument object — so a rule that took "the first string" would
       have shown 「fit」, which tells the reader nothing about what Atlas did. */
    ['map.compose', { type: 'compose', camera: 'fit', title: '大阪市と札幌市の現在の気温', items: [{ name: 'a' }] },
      '大阪市と札幌市の現在の気温'],
    ['layers.toggle', { type: 'layer', name: 'Wind', on: true }, 'Wind']
  ];
  for (const [id, args, want] of observed) {
    assert.equal(P.detailFor(id, args), want, id + ' shows its subject');
  }
});

/* ══ ② THE RULE IS OVER THE SCHEMA, NOT OVER A LIST OF NAMES ════════════════════════════════════
   Asked of EVERY capability that has a schema: whatever the detail picks, it is a free-text
   argument that capability declares — never one drawn from a declared vocabulary. */
test('R725 ② across the whole registry, the detail is never a setting', async () => {
  const { P, S, caps } = await mountWithSchemas();
  const ids = caps.all().map((c) => c && c.id).filter(Boolean);
  assert.ok(ids.length >= 130, ids.length + ' capabilities');

  let asked = 0, enumShown = 0, subjectShown = 0;
  const leaked = [];
  for (const id of ids) {
    const sc = S.schemaFor(id);
    const props = (sc && sc.properties) || null;
    if (!props) continue;
    /* give EVERY declared argument a value, so nothing is picked merely by being the only one set */
    const args = { type: 'x' };
    Object.keys(props).forEach((k) => {
      const p = props[k] || {};
      if (p.enum && p.enum.length) args[k] = String(p.enum[0]);
      else if (p.type === 'string') args[k] = 'SUBJECT-' + k;
      /* ⚠ A NUMBER THE MODEL SENT AS TEXT IS STILL A NUMBER. The envelope is JSON the model writes,
         and it writes `zoom: "10"` often enough that a rule reading only `typeof value === 'string'`
         would offer 「10」 to the reader as the subject of the step. What the argument IS, is what the
         capability declared it to be — so these arrive here in the sloppy shape on purpose. */
      else if (p.type === 'number') args[k] = '10';
      else if (p.type === 'boolean') args[k] = 'true';
      else if (p.type === 'array') args[k] = [];
    });
    asked++;
    const got = P.detailFor(id, args);
    if (!got) continue;
    subjectShown++;
    if (!/^SUBJECT-/.test(got)) { enumShown++; leaked.push(id + ' -> ' + got); continue; }
    const key = got.replace(/^SUBJECT-/, '');
    const p = props[key] || {};
    if (!(p.type === 'string' && !(p.enum && p.enum.length))) { enumShown++; leaked.push(id + ' -> ' + got); }
  }
  assert.ok(asked >= 100, 'the sweep reached ' + asked + ' capabilities with a schema');
  assert.ok(subjectShown >= 80, 'and ' + subjectShown + ' of them have a subject to show');
  assert.deepEqual(leaked, [], enumShown + ' capabilit(ies) would show a setting as the subject');
});

/* ══ ③ NOTHING IS INVENTED ══════════════════════════════════════════════════════════════════════
   An empty column says 「this step had no subject worth naming」, which is true. A guess would say
   something false about what Atlas did, and the reader cannot tell the two apart. */
test('R725 ③ a capability with nothing to name shows nothing, not a guess', async () => {
  const { P } = await mountWithSchemas();
  assert.equal(P.detailFor('map.clearHighlights', { type: 'reset' }), '', 'no arguments, no detail');
  assert.equal(P.detailFor('not.a.capability', { type: 'x', place: 'Osaka' }), '',
    'an id this build has no schema for is not guessed at from its argument names');
  assert.equal(P.detailFor('data.weather', {}), '', 'a declared argument that was not passed shows nothing');
  assert.equal(P.detailFor('data.weather', { type: 'weather', place: '   ' }), '', 'whitespace is not a subject');
  /* the internals the console stamps on an action are not arguments */
  assert.equal(P.detailFor('data.weather', { type: 'weather', __paintRun: 'run7', __meta: {} }), '',
    'the bookkeeping fields the dispatch adds are never shown');
});

/* ══ ④ THE CAPABILITY'S OWN ORDER IS THE ONLY TIE-BREAK ══════════════════════════════
   A 「required arguments first」 tie-break was written here first and MEASURED WRONG: `chart.compose`
   declares free text as [title, source] and requires [kind, source], so required-first showed the
   reader a data SOURCE where the chart has a TITLE. It is the one capability in the registry where
   the two rules disagree, which is why the disagreement is the check. */
test('R725 ④ where declaration order and requiredness disagree, the capability’s order wins', async () => {
  const { P, S } = await mountWithSchemas();
  const sc = S.schemaFor('chart.compose');
  const props = Object.keys(sc.properties || {});
  const req = sc.required || [];
  /* the premise, asserted rather than remembered */
  assert.ok(props.indexOf('title') < props.indexOf('source'), 'chart.compose declares title before source');
  assert.ok(!req.includes('title') && req.includes('source'), 'and requires source but not title');
  assert.equal(P.detailFor('chart.compose', { type: 'chart', title: 'GDP per head', source: 'World Bank', kind: 'line' }),
    'GDP per head', 'the reader is shown the chart, not where its numbers came from');
});

/* ══ ⑤ AN ACTION'S OWN `type` IS NEVER MISTAKEN FOR ITS SUBJECT ════════════════════════
   Twenty-one schemas declare a property literally named `type`, and a legacy action object carries
   its own `type` (the action name, e.g. 'weather'). Today every one of those twenty-one is an enum,
   so the free-text rule already refuses them and no second guard is needed. This states the
   INVARIANT rather than the mechanism: the day a schema declares `type` as free text, this fails
   and someone decides — instead of the trace quietly showing the reader the name of an action. */
test('R725 ⑤ no capability would show the action name as its subject', async () => {
  const { P, S, caps } = await mountWithSchemas();
  let withTypeProp = 0, checked = 0;
  const leaked = [];
  for (const c of caps.all()) {
    const id = c && c.id; if (!id) continue;
    const sc = S.schemaFor(id); const props = (sc && sc.properties) || null; if (!props) continue;
    if (props.type) withTypeProp++;
    const args = { type: 'LEGACY-ACTION-NAME' };
    Object.keys(props).forEach((k) => {
      const p = props[k] || {};
      if (k === 'type') return;                      /* leave the action's own value in place */
      if (p.enum && p.enum.length) args[k] = String(p.enum[0]);
      else if (p.type === 'string') args[k] = 'SUBJECT-' + k;
    });
    checked++;
    if (P.detailFor(id, args) === 'LEGACY-ACTION-NAME') leaked.push(id);
  }
  assert.ok(withTypeProp >= 1, withTypeProp + ' schemas declare a property named `type` (the premise)');
  assert.ok(checked >= 100, 'asked of ' + checked + ' capabilities');
  assert.deepEqual(leaked, [], 'these would show the action name: ' + leaked.join(', '));
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R744 (formerly tests/r744-atlas-trace-head-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R744 — 「Atlasの回答中の進行表示は、もとからあった "Thinking" みたいな表示が上で、それを展開したら、
 *          最近付けた詳細なステップが見れる、最新のAIと同じ感じのUIに。"Working" と、従来の今何やってるか
 *          表示は被ってるから、"Working" のほうの、詳細ステップの合計時間表示は、いらない。」
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED — not the fix ([[intmap-restate-the-defect-not-the-fix]]). What the
 *  reader was actually shown, measured on the live site while one turn ran:
 *
 *      ▾ Working                                    40.5s     ← the trace's head, above the bubble
 *        ✓ Thinking                                  7.9s
 *        ↻ Researching  Which volcano in Indonesia…
 *      Researching                                             ← the shimmer, inside the bubble
 *
 *    ① TWO LIVE INDICATORS FOR ONE STATE, in two places, disagreeing in wording: a head that said
 *       「Working」 for every turn whatever was happening, and a shimmering word below it that said
 *       what was actually happening. #R313 removed one duplicate indicator; #R723 introduced this
 *       one by giving the trace a head of its own while leaving the word where it was.
 *    ② ⚠ AND THE HALF THAT WAS NOT A DUPLICATE. The head's elapsed total was removed with the word
 *       on the first pass of this round and put back on the reader's instruction: nothing else says
 *       how long the turn has been running, and the rows do not (they time OPERATIONS — #R723
 *       measured 13.6 s of rows inside a 57.2 s turn). ② below is the check that it stays.
 *
 *  ⚠ AND THE HALF THAT MUST NOT MOVE WITH THE WORD. `.atl-stage` has been two things since #R313:
 *  the live label AND the marker meaning 「this bubble is still working」, which is what
 *  js/atlas-console.js's cancel scan finds and what js/atlas-turn-continuity.js's `markCancelled`
 *  replaces with the Stopped note. Moving the label is not permission to move the marker — ③ and ④
 *  below are the checks that a turn is still cancellable and still stoppable in the right place.
 *
 *  ⚠ RUN AGAINST THE MODULE, EVALUATED, for the reason [[intmap-r505-lessons]] gives: three of the
 *  five questions here are questions of ORDER (what is written when, what is reused when, what is
 *  removed when), and source cannot answer those.
 * ==========================================================================*/
/* ══ ① ONE LIVE WORD, AND IT IS THE ONE THE HEAD SHOWS ══════════════════════════════════════════
   The defect: the head said 「Working」 while a second element said what was really happening, so a
   reader watching a turn had two indicators to reconcile. */
test('R744 ① the head says what is happening, and nothing else says it at the same time', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    b.innerHTML = PROG.stageHtml('think');
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');

    assert.equal(headText(root), PROG.phaseWord('think'), 'a pending turn is headed by the thinking word');
    assert.ok(!/Working/.test(headText(root)), 'not by a noun that is true of every turn');

    EXEC.fire(ev('op1', 'research.brief', 'planned'));
    assert.equal(headText(root), PROG.wordFor('research.brief'), 'and it follows the step that is running now');

    /* ⚠ AND THE SECOND INDICATOR IS GONE, not merely quieter: the marker inside the bubble carries
       no text at all, so it cannot say the same thing in a different place. */
    const marks = b.querySelectorAll('.atl-stage');
    assert.equal(marks.length, 1, 'the bubble holds exactly one marker');
    assert.equal(marks[0].textContent, '', 'and the marker is not a second live word');
    PROG.live(b);
    assert.equal(b.querySelectorAll('.atl-stage')[0].textContent, '', 're-arming it after a compose does not give it one back');
    PROG.done(b);
  });
});

/* ══ ② THE ONE CLOCK NOBODY ELSE KEEPS ═════════════════════════════════════════════════════════
   ⚠ THE DUPLICATE WAS THE WORD, NOT THE NUMBER. This check first said the head must print no time
   at all, and that was wrong about what was doubled: nothing else on screen says how long the turn
   has been running, and the rows are not that number — they time OPERATIONS, and #R723 measured
   13.6 s of operations inside a 57.2 s turn. So the invariant is that the head carries the turn's
   elapsed total, that it stops when the turn does, and that the rows keep their own times beside
   it — three facts, none of which any other element states. */
test('R744 ② the head keeps the turn total, and it is the number no row holds', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');

    const ms = () => String((root.querySelectorAll('.atl-trace-ms')[0] || {}).textContent);
    assert.match(ms(), /^\d+(\.\d+)?s$|^\d+m\d\ds$/, 'the head carries a time: ' + ms());

    /* ⚠ THE TURN IS MOSTLY WAITING, AND THAT IS THE POINT. Both operations below are instantaneous;
       the wait around them is not. If the head's number were derived from the rows — the reading
       that made this round briefly delete it as a duplicate — it would stay at 0.0s through a turn
       the reader watched for a fifth of a second. */
    EXEC.fire(ev('op1', 'view.flyTo', 'planned'));
    EXEC.fire(ev('op1', 'view.flyTo', 'completed'));
    const t = Date.now(); while (Date.now() - t < 160) { /* the planner wait, which no row covers */ }
    PROG.done(b);

    const total = parseFloat(ms());
    assert.ok(total >= 0.1, 'the head reports the whole turn, waits included (' + ms() + ')');
    const rows = root.querySelectorAll('.atl-trace-t').map((x) => parseFloat(x.textContent) || 0);
    assert.equal(rows.length, 2, 'and each row still reports its own');
    assert.ok(total > rows.reduce((a, c) => a + c, 0),
      'which is a smaller number than the turn: rows ' + rows.join(' + ') + ' vs ' + ms());

    /* ⚠ AND THE TOTAL IS NOT A SECOND LIVE WORD. What was doubled is the word, and the head says it
       once — the clock stands at the other end of the same line and says something no word does. */
    assert.ok(!/Working/.test(String(headText(root))), 'the summary is not a noun true of every turn');
    assert.ok(!/\d+(\.\d+)?s/.test(String(headText(root))), 'and the summary is not the clock either');
  });
});

/* ══ ③ THE MARKER DID NOT MOVE WITH THE WORD ════════════════════════════════════════════════════
   `.atl-stage` is two things (#R313). Only one of them moved. If the other had, every cancel path
   in the app would have gone silently dead — the shape [[intmap-recurring-lessons]] keeps: an
   instrument that is green because it is no longer looking. */
test('R744 ③ a working reply is still findable by the selector every cancel path uses', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps);
    const b = bubbleIn(root);
    b.innerHTML = PROG.stageHtml('think');
    PROG.open(b); PROG.phase(b, 'think');

    /* the scan js/atlas-console.js runs: a DESCENDANT of the bubble, not a sibling of it */
    assert.ok(b.querySelector('.atl-stage'), 'the marker is inside the bubble');
    assert.equal(root.querySelectorAll('.atl-trace')[0].querySelectorAll('.atl-stage').length, 1,
      'the head has one of its own — which is the word, and is NOT inside any .atl-b');

    PROG.done(b);
    assert.equal(b.querySelector('.atl-stage'), null, 'a finished reply is no longer counted as working');

    /* and the two call sites still name that exact class */
    const con = read('js/atlas-console.js');
    const scans = con.match(/\.atl-b\.a \.atl-stage/g) || [];
    assert.ok(scans.length >= 2, 'both cancel scans still name the marker (' + scans.length + ')');
    assert.match(read('js/atlas-turn-continuity.js'), /querySelector\('\.atl-stage'\)/,
      'and markCancelled still replaces exactly it, so the Stopped note lands where the work stopped');
  });
});

/* ══ ④ THE STOPPED NOTE STILL REPLACES THE MARKER ══════════════════════════════════════════════
   ⚠ ASKED OF THE REAL markCancelled, not of a restatement of it. A marker with no text is the input
   this round newly hands that function, and 「it still works」 is a claim about running it. */
test('R744 ④ stopping a turn paints the note over the marker, not under the answer', async () => {
  const mod = await load(); const caps = await registry();
  const { makeAtlasTurnContinuity } = await import('../js/atlas-turn-continuity.js');
  withDom((root) => {
    const TCONT = makeAtlasTurnContinuity();
    const PROG = mount(mod, caps);
    const b = bubbleIn(root);
    b.innerHTML = PROG.stageHtml('think');
    PROG.open(b); PROG.phase(b, 'think');
    const marker = b.querySelector('.atl-stage');
    assert.ok(marker, 'there is a marker to replace');
    TCONT.markCancelled(b, '<span>Stopped</span>');
    assert.equal(b.querySelector('.atl-stage'), null, 'the marker was consumed');
    assert.ok(b.querySelectorAll('.atl-cancelled').length === 1, 'and the note stands where it stood');
  });
});

/* ══ ⑤ THE WORD IS A LIVING ELEMENT, NOT A REDRAWN ONE ═════════════════════════════════════════
   ⚠ THIS IS A CLAIM ABOUT AN ANIMATION, SO IT IS ASKED AS ONE ABOUT IDENTITY. The shimmer is a CSS
   animation on the element; building a fresh span whenever the word changes restarts that animation
   at 0%, so the sweep would jump backwards at every step — visible, and invisible to any check that
   only compared the text. */
test('R744 ⑤ changing the word does not replace the element that is shimmering', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');
    const first = root.querySelectorAll('.atl-trace-sum')[0].querySelectorAll('.atl-stage')[0];
    EXEC.fire(ev('op1', 'view.flyTo', 'planned'));
    EXEC.fire(ev('op1', 'view.flyTo', 'completed'));
    EXEC.fire(ev('op2', 'data.weather', 'planned'));
    const after = root.querySelectorAll('.atl-trace-sum')[0].querySelectorAll('.atl-stage')[0];
    assert.equal(after, first, 'the same span carried every word of the turn');
    assert.equal(after.textContent, PROG.wordFor('data.weather'), 'and it says the current one');
    PROG.done(b);
  });
});

/* ══ ⑥ THE DETAIL IS BEHIND THE HEAD, AND THE HEAD IS WHAT OPENS IT ════════════════════════════
   The asked-for shape: the familiar indicator on top, the detailed steps one expand away. */
test('R744 ⑥ the steps live behind the head the live word is on', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const PROG = mount(mod, caps); const EXEC = fakeExec();
    const b = bubbleIn(root);
    PROG.open(b); PROG.watch(EXEC); PROG.phase(b, 'think');
    const trace = root.querySelectorAll('.atl-trace')[0];
    assert.ok(trace.querySelectorAll('.atl-trace-sum')[0].querySelectorAll('.atl-stage')[0],
      'the live word is in the summary');
    assert.ok(trace.querySelectorAll('.atl-trace-rows')[0], 'and the rows are its sibling, not its replacement');

    /* ⚠ THE NESTING IS ASKED OF THE MARKUP, not of the stub above: that stub flattens what it parses,
       so 「the summary is inside the button」 is a question only the emitted string can answer — and
       it is the whole of what 「展開したら」 means, since the button is what toggles .open.
       ⚠ (tests-by-topic) THE STRING THE MODULE EMITTED, NOT THE SOURCE IT WAS WRITTEN IN: the stub
       keeps what open() assigned to the trace's innerHTML, and the stylesheet is the module's own
       exported ATLAS_PROGRESS_CSS — the text that is actually injected into the page. */
    const emitted = trace.innerHTML;
    assert.match(emitted, /<button class="atl-trace-head"[\s\S]{0,400}?atl-trace-sum[\s\S]{0,80}?<\/button>/,
      'the summary — and so the live word — is the expander button itself');
    const css = mod.ATLAS_PROGRESS_CSS;
    assert.equal(typeof css, 'string', 'js/atlas-progress.js exports the stylesheet it injects');
    assert.match(css, /\.atl-trace-rows\{display:none/, 'the rows are folded away by default');
    assert.match(css, /\.atl-trace\.open \.atl-trace-rows\{display:block/, 'and shown when the head is open');
    assert.match(css, /\.atl-trace-head \.atl-stage\{/, 'the head gives the word its own type, so the design is unchanged');
    PROG.done(b);
    assert.ok(!trace.classList.contains('open'), 'a finished trace folds itself away, still openable');
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R746 (formerly tests/r746-atlas-clock-rounding-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R746 — the work trace's clock printed a time that does not exist
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, MEASURED IN PRODUCTION (#R744's own verification, 651 DOM samples over 3 turns).
 *  The head of the Atlas work trace counted:
 *
 *      1m58s → 1m59s → 1m60s → 2m00s
 *                      ^^^^^^ no such time
 *
 *  It was not a race and not rare. The minute and the second were TWO roundings of ONE quantity —
 *  `floor(n / 60000)` for the minute and `round((n % 60000) / 1000)` for the second — and they
 *  disagree for the last half-second of every minute (119,500–119,999 ms is minute 1, second 60).
 *  A turn that runs three minutes shows it three times, on a head repainted four times a second.
 *  The same split printed 「60.0s」 just below the boundary, for the same reason.
 *
 *  ⚠ WHAT THE CHECK STATES IS THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]):
 *  「no rendering of any duration names a second or a minute that does not exist, and the rendered
 *  value is never further from the truth than its own precision」. Stating it as 「round once」 would
 *  guard this implementation; stated as a property of the OUTPUT it survives the next rewrite.
 *
 *  ⚠ ASKED THROUGH THE MODULE, NOT OF AN EXPORTED HELPER. `fmtMs` is private and stays private —
 *  exporting it so a test can call it would be the thing tests/r175 ③ forbids. The head's clock is
 *  driven by `Date.now()`, so the durations below are produced by moving that clock and letting
 *  `done()` paint — the same path the reader's screen is painted by.
 * ==========================================================================*/
/* ══ ① NO RENDERING NAMES A TIME THAT DOES NOT EXIST ════════════════════════════════════════════
   Swept across every boundary a minute has, at 10 ms resolution. The production sighting (1m60s)
   is one point in this sweep; so is 「60.0s」, which the same split produced 500 ms earlier. */
test('R746 ① every duration the trace prints is a time that exists', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const render = renderer(mount(mod, caps), root);
    const bad = [];
    for (let base = 0; base <= 5; base++) {
      for (let ms = base * 60_000 - 1200; ms <= base * 60_000 + 1200; ms += 10) {
        if (ms < 0) continue;
        const out = render(ms);
        const p = secondsOf(out);
        if (!p) { bad.push(ms + 'ms → ' + out + ' (unreadable)'); continue; }
        if (p.minutes > 0 && p.seconds > 59) bad.push(ms + 'ms → ' + out);
        if (p.minutes === 0 && p.seconds >= 60) bad.push(ms + 'ms → ' + out);
      }
    }
    assert.deepEqual(bad.slice(0, 8), [], bad.length + ' impossible time(s) printed, e.g. ' + bad.slice(0, 4).join(', '));
    /* the exact sighting, named so a reader of this file can find it again */
    assert.equal(render(119_600), '2m00s', 'the measured case: 1m59.6s is two minutes, not 1m60s');
    assert.equal(render(59_970), '1m00s', 'and 59.97s is a minute, not 60.0s');
  });
});

/* ══ ② AND IT IS STILL THE TRUTH, TO ITS OWN PRECISION ══════════════════════════════════════════
   ⚠ WITHOUT THIS, ① IS SATISFIED BY A CLOCK THAT LIES. 「Never print 60」 is also true of a
   formatter that always says 0m00s, or one that floors every minute away — so the second half of
   the invariant is that the rendered value is within its own resolution of the real duration. */
test('R746 ② and no duration is misreported by more than the precision it claims', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const render = renderer(mount(mod, caps), root);
    const cases = [0, 40, 450, 949, 950, 1_000, 1_049, 12_340, 59_949, 59_950, 59_970,
      60_000, 60_400, 61_500, 119_499, 119_500, 119_600, 120_000, 599_500, 3_600_000];
    const off = [];
    for (const ms of cases) {
      const out = render(ms);
      const p = secondsOf(out);
      if (!p) { off.push(ms + 'ms → ' + out); continue; }
      /* a tenth-of-a-second form may be 0.05 s out; a whole-second form 0.5 s */
      const tol = /m/.test(out) ? 0.5001 : 0.0501;
      if (Math.abs(p.total - ms / 1000) > tol) off.push(ms + 'ms → ' + out);
    }
    assert.deepEqual(off, [], 'rendering(s) further from the truth than their own precision');
  });
});

/* ══ ③ THE STEP OF THE CLOCK NEVER GOES BACKWARDS ══════════════════════════════════════════════
   A head repainted four times a second is read as a running clock, and the reader notices a number
   that jumps back. Two independent roundings could do that at the boundary even when neither value
   is impossible on its own — so monotonicity is asked of the SEQUENCE, which ① and ② cannot see. */
test('R746 ③ the printed clock never runs backwards as the turn goes on', async () => {
  const mod = await load(); const caps = await registry();
  withDom((root) => {
    const render = renderer(mount(mod, caps), root);
    let prev = -1, prevText = '';
    for (let ms = 0; ms <= 185_000; ms += 50) {
      const out = render(ms);
      const p = secondsOf(out);
      assert.ok(p, ms + 'ms printed something unreadable: ' + out);
      assert.ok(p.total >= prev, 'the clock went backwards at ' + ms + 'ms: ' + prevText + ' → ' + out);
      prev = p.total; prevText = out;
    }
  });
});
