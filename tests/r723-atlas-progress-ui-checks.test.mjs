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

/* ── a DOM the size of the question ─────────────────────────────────────────────────────────── */
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
    set textContent(v) { this._text = String(v == null ? '' : v); },
    get innerHTML() { return this._html; },
    /* the whole point: assigning innerHTML DESTROYS the children */
    set innerHTML(v) { this._html = String(v == null ? '' : v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._fromHtml(); },
    _fromHtml() {
      /* enough of a parser for the markup this module writes: one element per class= it emits */
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

function mount(mod, caps) {
  return mod.makeAtlasProgress({}, {
    L: (en) => en, esc: (s) => String(s == null ? '' : s),
    capabilities: () => caps
  });
}
/* the shape js/atlas-executor.js's `phase()` emits */
const ev = (operationId, capabilityId, phase) => ({ kernel: 'atlas', operationId, capabilityId, phase, source: 'atlas' });
function fakeExec() {
  const subs = [];
  return { on: (f) => { subs.push(f); return () => { }; }, fire: (e) => subs.forEach((f) => f(e)) };
}
function bubbleIn(root) { const b = makeNode('div'); b.className = 'atl-b a'; root.appendChild(b); return b; }
function rowsOf(root) { return root.querySelectorAll('atl-trace-row'); }

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
