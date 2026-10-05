/* ============================================================================
 *  IntMap · A COARSE BOUNDARY REDRAWN ALONG THE RIVER OR WALL HISTORY SAYS IT FOLLOWED — the reader
 *  (hist-border-refine)
 * ----------------------------------------------------------------------------
 *  data/hist-courses.js (scripts/build-hist-courses.mjs) names, for a ring of a coarse record, the vertex
 *  ranges of its drawn runs that are that record's drawing of a stretch a reviewed fact says followed a river
 *  or wall (scripts/histcourse/courses.json, two sources each) — and the feature's own vertices to draw there
 *  instead. Every decision is in that file; this only splices.
 *
 *  ⚠ NOT ON THE BOOT PATH. js/border-coast.js (which is) imports this module only when a Cliopatria line is
 *  first drawn — the start-up budget (check:perf eager) is not paid for a time-machine-only reader.
 *  ⚠ OPTIONAL in the same way the coast marks are: absent, or for another pool, a ring is drawn exactly as the
 *  marks say.
 *  ⚠ A REDRAW HOLDS ONLY WHILE ITS FACT DOES. A ring is pooled across every row (and date) that draws it, so
 *  each substitution is in force only while the clock `t` (a sortable YYYYMMDD day) is inside its course's
 *  `days` [from, to) — and with no clock, never. The caller that memoises lines keys them by `epoch(t)`.
 * ==========================================================================*/

/* the course file, by a script tag (it assigns window.__IMBCOURSE) — resolves the reader, or null */
export function open(win, doc) {
  return new Promise((res) => {
    if (win.__IMBCOURSE) { res(reader(win, win.__IMBCOURSE)); return; }
    if (!doc || typeof doc.createElement !== 'function') { res(null); return; }
    const s = doc.createElement('script'); s.src = 'data/hist-courses.js'; s.async = true;
    s.onload = () => res(win.__IMBCOURSE ? reader(win, win.__IMBCOURSE) : null);
    s.onerror = () => res(null);
    doc.head.appendChild(s);
  });
}

export function reader(win, C) {
  const active = (x, t) => { const c = C.courses && C.courses[x[2]]; return !!(c && c.days && t >= c.days[0] && t < c.days[1]); };
  /* the substitutions for ring `ri` of the pool `global` holds at `t` — only if that pool is the one they were
     derived from (same length), as a mark is */
  function at(global, ri, poolLen, t) {
    if (!C.sets || t == null) return null;
    for (const k in C.sets) {
      const s = C.sets[k];
      if (s && s.global === global) { const l = (s.rings === poolLen && s.sub && s.sub[ri]) || null; if (!l) return null; const a = l.filter((x) => active(x, t)); return a.length ? a : null; }
    }
    return null;
  }
  /* a ring the page holds: by the origin js/hist-bundles.js records for it (the bundles live in a Worker and the
     page holds a sparse mirror), else by identity in a bundle on window (the node harnesses) */
  function of(ring, t) {
    if (t == null || !ring) return null;
    let origin = null; try { origin = win.IntMapHistBundles ? win.IntMapHistBundles.ringOrigin(ring) : null; } catch (_) { origin = null; }
    if (origin) return at(origin[0], origin[1], origin[2], t);
    for (const k in C.sets) {
      const s = C.sets[k], b = s && win[s.global];
      if (b && Array.isArray(b.rings) && b.rings.length === s.rings) { const i = b.rings.indexOf(ring); if (i >= 0) return at(s.global, i, s.rings, t); }
    }
    return null;
  }
  /* which stretch of time `t` is in, among every course's [from, to) — two dates with the same answer draw the
     same substitutions */
  const edges = [...new Set((C.courses || []).flatMap((c) => c.days || []))].sort((a, b) => a - b);
  function epoch(t) { if (t == null) return -1; let n = 0; for (const e of edges) { if (e <= t) n++; else break; } return n; }
  /* one run V[a..b] with the substitutions inside it spliced in: V[..x0-1], the course's own vertices i0 → i1,
     then V[x1+1..] — one continuous line, so nothing about the run's ends moves */
  function splice(V, a, b, subs) {
    const out = [];
    let i = a;
    for (const s of subs) {
      if (s[0] < a || s[1] > b) continue;
      for (; i < s[0]; i++) out.push(V[i]);
      const line = C.courses[s[2]] && C.courses[s[2]].line;
      if (!line) { for (; i <= s[1]; i++) out.push(V[i]); continue; }
      if (s[4] >= s[3]) for (let j = s[3]; j <= s[4]; j++) out.push(line[j]);
      else for (let j = s[3]; j >= s[4]; j--) out.push(line[j]);
      i = s[1] + 1;
    }
    for (; i <= b; i++) out.push(V[i]);
    return out;
  }
  /* every drawn run of a closed ring (`mark` as data/border-coast.js writes it) with the substitutions spliced in */
  function runs(V, mark, subs) {
    if (mark === 1 || !Array.isArray(mark)) return [splice(V, 0, V.length - 1, subs)];
    const out = [];
    for (const run of mark) { const seg = splice(V, run[0], run[1], subs); if (seg.length > 1) out.push(seg); }
    return out;
  }
  return { at, of, epoch, splice, runs };
}
