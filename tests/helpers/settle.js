/* ============================================================================
 *  tests/helpers/settle.js — WAIT FOR THE CONDITION A FIXED SLEEP STOOD IN FOR  (test-time-headroom)
 * ----------------------------------------------------------------------------
 *  A `waitForTimeout(n)` asserts nothing: it is a guess at how long something takes, paid in full on
 *  a fast machine and too short on a slow one (#R783 measured a 1,400 ms settle reading «nothing was
 *  painted» on a CI runner that needed 46 s). Each helper here waits for the state the sleep was
 *  standing in for, and RETURNS — it never throws for a condition that did not arrive. The test's own
 *  `expect` calls after it are the verdict, with their own messages, exactly as they were behind the
 *  sleep; what moves is only WHEN they look.
 *
 *    until(page, fn, arg, opts)        fn(arg) in the page is truthy — asked every 100 ms
 *    idleAfter(page, change, arg, cap) run change(arg) in the page, then wait for the renderer's own
 *                                      `idle` after it (every tile and transition that change asked
 *                                      for has drawn), at most `cap` ms
 *    settleLayout(page, sels, timeout) motion has stopped: each element's box and scroll are the same
 *                                      on three consecutive frames, and no finite animation moves it
 * ==========================================================================*/

/** Ask the page every `interval` ms until `fn(arg)` is truthy. Resolves true when it was, false when the
 *  time ran out — the caller's assertions decide what that means. */
export function until(page, fn, arg, { timeout = 30_000, interval = 100 } = {}) {
  return page.waitForFunction(fn, arg, { timeout, polling: interval }).then(() => true, () => {
    /* said out loud: a condition that never came cost its whole ceiling, which is the price a sleep used to hide */
    console.warn('[until] gave up after ' + timeout + ' ms: ' + String(fn).replace(/\s+/g, ' ').slice(0, 160));
    return false;
  });
}

/** Run `change(arg)` in the page and wait for the renderer's `idle` that follows it — registered BEFORE
 *  the change, so an `idle` left over from the previous view cannot answer for this one (`loaded()` can
 *  be true in the gap between a jumpTo and the frame that requests its tiles). `cap` is the most it
 *  waits: a renderer streaming tiles may never go idle, and then this costs what the sleep did. */
export function idleAfter(page, change, arg, cap = 8000) {
  return page.evaluate(async ({ src, a, ms }) => {
    const m = window.__imap;
    const idle = new Promise((r) => { try { m.once('idle', r); } catch (_) { r(); } });
    await (new Function('return (' + src + ')'))()(a);
    await Promise.race([idle, new Promise((r) => setTimeout(r, ms))]);
  }, { src: change.toString(), a: arg, ms: cap });
}

/* MOTION HAS STOPPED — the condition a fixed wait after a panel move stood in for (spacetime-train, first written in
   tests/mobile-panels-reach.spec.js). Each named element's box (and its scroll offset) is read on three consecutive
   frames and must be the same on all three, and no finite animation or transition that moves it, its ancestors or its
   descendants may be running. Reading the box forces the style flush, so a transition that a class change has just
   asked for has already begun by the first read: a check made before the motion starts cannot pass. Unlike a fixed
   wait it cannot judge a panel half-way through its move, and it does not wait past the moment it stops. */
export async function settleLayout(page, sels, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const ok = await page.evaluate((list) => new Promise((res) => {
      const els = list.map((s) => document.querySelector(s));
      if (els.some((e) => !e)) { res(false); return; }
      const snap = () => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, e.scrollTop, e.scrollLeft].map((v) => Math.round(v * 2) / 2).join(','); }).join('|');
      const moving = () => document.getAnimations().some((a) => {
        if (a.playState !== 'running' || !a.effect || !(a.effect.target instanceof Element)) return false;
        if (a.effect.getTiming().iterations === Infinity) return false;   /* a spinner never stops; it does not move the panel */
        const t = a.effect.target; return els.some((e) => t === e || t.contains(e) || e.contains(t));
      });
      const a = snap();
      requestAnimationFrame(() => { const b = snap(); requestAnimationFrame(() => { const c = snap(); res(a === b && b === c && !moving()); }); });
    }), sels);
    if (ok) return;
    if (Date.now() > deadline) throw new Error('still moving after ' + timeout + ' ms: ' + sels.join(', '));
  }
}
