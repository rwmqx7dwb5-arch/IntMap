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
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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
const headText = (root) => {
  const s = root.querySelectorAll('.atl-trace-sum')[0];
  if (!s) return null;
  const st = s.querySelectorAll('.atl-stage')[0];
  return st ? st.textContent : s.textContent;
};

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

    const css = read('js/atlas-progress.js');
    /* ⚠ THE NESTING IS ASKED OF THE MARKUP, not of the stub above: that stub flattens what it parses,
       so 「the summary is inside the button」 is a question only the emitted string can answer — and
       it is the whole of what 「展開したら」 means, since the button is what toggles .open. */
    assert.match(css, /<button class="atl-trace-head"[\s\S]{0,400}?atl-trace-sum[\s\S]{0,80}?<\/button>/,
      'the summary — and so the live word — is the expander button itself');
    assert.match(css, /\.atl-trace-rows\{display:none/, 'the rows are folded away by default');
    assert.match(css, /\.atl-trace\.open \.atl-trace-rows\{display:block/, 'and shown when the head is open');
    assert.match(css, /\.atl-trace-head \.atl-stage\{/, 'the head gives the word its own type, so the design is unchanged');
    PROG.done(b);
    assert.ok(!trace.classList.contains('open'), 'a finished trace folds itself away, still openable');
  });
});
