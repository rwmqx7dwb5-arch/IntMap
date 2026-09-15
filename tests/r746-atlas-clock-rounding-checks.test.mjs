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
import test from 'node:test';
import assert from 'node:assert/strict';

/* ── a DOM the size of the question (the shape tests/r723 and tests/r744 use) ──────────────── */
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
