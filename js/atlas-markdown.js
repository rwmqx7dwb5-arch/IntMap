/* ============================================================================
 *  IntMap · Atlas — THE BLOCK STRUCTURE OF A REPLY  (#R494)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT THIS REPLACES, AND WHY IT HAD TO STOP BEING A CHAIN OF `.replace()` CALLS.
 *
 *  From #R149 to #R232 the Atlas typography was a single expression: `esc(text)` followed by a dozen
 *  regular expressions that rewrote line shapes into `<div>`s and turned newlines into spacers —
 *  a 1.5em empty div for a blank line, a 0.82em one for a sentence-end newline, `<br>` for the rest.
 *  It worked, and it got better every round, and by #R232 it had produced its own proof that the
 *  shape was finished: the heading rules and the paragraph rule each emitted air around a heading,
 *  so a `## ` section opened with 3.55em of nothing, and the fix was a POST-PASS that went back over
 *  the finished HTML and deleted the spacer next to a heading. That is a renderer correcting itself
 *  because it has no idea what it just built.
 *
 *  It also could not do the things a reply actually contains. A bullet was a `<div>` with a `•` and a
 *  hanging indent, so a NESTED bullet was a bullet with more spaces in front of it; an ordered list
 *  was normalised to bullets and lost its numbers; a multi-line `>` quote was N separate quotes, one
 *  per line; a list item could not contain a second paragraph or a code block, because there was no
 *  such thing as "inside" anything.
 *
 *  So: parse, then render. Lines → a block tree (headings, paragraphs, lists with items and nesting,
 *  blockquotes, rules) → semantic HTML → CSS decides the spacing. The double gap is not fixed here,
 *  it is ABSENT: `<p>`'s bottom margin and `<h2>`'s top margin COLLAPSE, which is the browser doing
 *  for free the arithmetic the post-pass was doing by hand.
 *
 *  ⚠ IT DOES NOT SEE CODE, MATH OR TABLES, AND MUST NOT. js/atlas-reply.js pulls those into
 *  private-use placeholders BEFORE the reflow passes run (#R156/#R463) precisely so a `$` or a `#`
 *  inside them is never read as markdown, and restores them after. A line that is nothing but a block
 *  placeholder is emitted verbatim as its own block; a placeholder in the middle of a paragraph makes
 *  that paragraph render as a `<div>` rather than a `<p>`, because a `<div>` inside a `<p>` closes the
 *  paragraph in the parser and the rest of the text would escape the element.
 *
 *  ⚠ NO BOLD, MONOCHROME HEADINGS. #R159 「返答のテキストは太字にしない」 and #R154 「見出しを色分け
 *  するのはやめる」 are product decisions, not implementation details: `**bold**` still renders as
 *  plain text and every heading level is weight 600 in `--text-main`. What differentiates them is
 *  size and spacing, and that is now stated once in CSS instead of six times in string literals.
 * ==========================================================================*/

/**
 * makeAtlasMarkdown({ esc }) -> { renderMarkdown }
 *
 * `esc` is the app's own HTML escaper, injected rather than imported so this module has the same
 * shape as the rest of the Atlas reply pipeline and stays trivially testable from node.
 */
export function makeAtlasMarkdown(CTX) {
  const esc = CTX.esc;

  /* ── placeholders ─────────────────────────────────────────────────────────────────────────────
     The two fences are js/atlas-reply.js's (U+E000 … U+E001). `B` is a block it protected, `I` an
     inline one; `X` is this module's own, used to hold finished inline HTML out of the way of the
     final `esc()`. Only `X` is restored here — `B` and `I` belong to the caller and must survive. */
  const X0 = 'X', X1 = '';
  const RE_X = /X(\d+)/g;
  const RE_BLOCK_PH_LINE = /^(?:B\d+)+$/;
  const RE_BLOCK_PH = /B\d+/;

  /* ── line shapes ──────────────────────────────────────────────────────────────────────────────
     ⚠ RE_HR demands three of the SAME mark and nothing else on the line, so `- item` (one mark, then
     a space, then text) cannot reach it. It is tested before the list matcher regardless. */
  const RE_HR    = /^[ \t]{0,3}(?:-[ \t]*-[ \t]*-[-\t ]*|\*[ \t]*\*[ \t]*\*[*\t ]*|_[ \t]*_[ \t]*_[_\t ]*)$/;
  const RE_ATX   = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
  const RE_QUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/;
  const RE_UL    = /^[ \t]*[-*+•・][ \t]+(?=\S)/;
  const RE_OL    = /^[ \t]*(\d{1,9})[.)][ \t]+(?=\S)/;
  const RE_CIRC  = /^[ \t]*([①-⑳])[ \t]*(?=\S)/;
  const CIRCLED  = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  /* a whole line that is nothing but a bold run is an author-written section lead (#R151/#R154) */
  const RE_LEAD  = /^\*\*([^*\n]{2,90})\*\*[ \t]*[:：]?[ \t]*$/;
  /* the #R150 soft break: a line that ENDS a sentence, followed by more prose, opens a new paragraph
     with a smaller gap than a blank line would give */
  const RE_SENT_END = /[.!?。！？…”"』）)]$/;

  function indentOf(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (c === ' ') n++; else if (c === '\t') n += 4; else break;
    }
    return n;
  }
  function dedent(s, cols) {
    let i = 0, col = 0;
    while (i < s.length && col < cols) {
      const c = s.charAt(i);
      if (c === ' ') { col++; i++; } else if (c === '\t') { col += 4; i++; } else break;
    }
    return s.slice(i);
  }
  function colWidth(s, len) {
    let col = 0;
    for (let i = 0; i < len; i++) col += (s.charAt(i) === '\t' ? 4 : 1);
    return col;
  }

  /** The list marker a line opens with, or null. `col` is the column its CONTENT starts at. */
  function marker(line) {
    if (!line) return null;
    let m = RE_OL.exec(line);
    if (m) return { type: 'ol', indent: indentOf(line), col: colWidth(line, m[0].length), text: line.slice(m[0].length), start: parseInt(m[1], 10) };
    m = RE_CIRC.exec(line);
    if (m) return { type: 'ol', indent: indentOf(line), col: colWidth(line, m[0].length), text: line.slice(m[0].length), start: CIRCLED.indexOf(m[1]) + 1 };
    m = RE_UL.exec(line);
    if (m) return { type: 'ul', indent: indentOf(line), col: colWidth(line, m[0].length), text: line.slice(m[0].length), start: null };
    return null;
  }

  function isBlockStart(line) {
    return RE_HR.test(line) || RE_ATX.test(line) || RE_QUOTE.test(line)
      || RE_BLOCK_PH_LINE.test(line.trim()) || !!marker(line);
  }

  /* ── the parser ───────────────────────────────────────────────────────────────────────────── */

  function parseBlocks(lines, from, to) {
    const nodes = [];
    let i = from;
    while (i < to) {
      const line = lines[i];
      if (!line || !line.trim()) { i++; continue; }
      if (RE_BLOCK_PH_LINE.test(line.trim())) { nodes.push({ t: 'raw', v: line.trim() }); i++; continue; }
      if (RE_HR.test(line)) { nodes.push({ t: 'hr' }); i++; continue; }
      const h = RE_ATX.exec(line);
      if (h) { nodes.push({ t: 'h', level: h[1].length, text: h[2] }); i++; continue; }
      if (RE_QUOTE.test(line)) { const q = parseQuote(lines, i, to); nodes.push(q.node); i = q.next; continue; }
      const mk = marker(line);
      if (mk) { const l = parseList(lines, i, to, mk); nodes.push(l.node); i = l.next; continue; }
      const p = parseParagraph(lines, i, to);
      for (let k = 0; k < p.nodes.length; k++) nodes.push(p.nodes[k]);
      i = p.next;
    }
    return nodes;
  }

  /* ⚠ CONSECUTIVE `>` LINES ARE ONE QUOTE. The old renderer turned each of them into its own bordered
     div, so a three-line quotation was three stacked boxes with three left rules. Lazy continuation
     (a plain line directly under a quoted one) belongs to the quote, as it does in every markdown
     implementation; a blank line ends it. */
  function parseQuote(lines, i, to) {
    const buf = [];
    let k = i;
    while (k < to) {
      const ln = lines[k];
      const m = RE_QUOTE.exec(ln);
      if (m) { buf.push(m[1]); k++; continue; }
      if (!ln.trim()) break;
      if (isBlockStart(ln)) break;
      buf.push(ln.trim()); k++;
    }
    return { node: { t: 'quote', kids: parseBlocks(buf, 0, buf.length) }, next: k };
  }

  /* ⚠ AN ITEM IS A CONTAINER, WHICH IS THE WHOLE POINT. Everything indented to the item's CONTENT
     column belongs to that item and is parsed recursively — so a sub-list, a second paragraph, a
     protected code block or a quote inside a bullet all work, and none of them needed a rule of
     their own. `loose` records whether the author left blank lines between items; a tight list
     renders its items without paragraph wrappers, which is what keeps a short bullet list compact. */
  function parseList(lines, i, to, first) {
    const type = first.type;
    const items = [];
    let loose = false;
    let k = i;
    while (k < to) {
      const mk = marker(lines[k]);
      if (!mk || mk.type !== type || mk.indent !== first.indent) break;
      const buf = [mk.text];
      k++;
      let blanks = 0;
      while (k < to) {
        const ln = lines[k];
        if (!ln.trim()) { blanks++; k++; continue; }
        const ind = indentOf(ln);
        if (ind >= mk.col) {
          if (blanks) { buf.push(''); loose = true; }
          buf.push(dedent(ln, mk.col)); blanks = 0; k++; continue;
        }
        if (blanks) break;                       /* blank line then an out-dented line → the list ended */
        if (marker(ln) || isBlockStart(ln)) break;
        buf.push(ln.trim()); k++;                /* lazy continuation of this item's paragraph */
      }
      if (blanks && k < to) {
        const nx = marker(lines[k]);
        if (nx && nx.indent === first.indent && nx.type === type) loose = true;
      }
      items.push(parseBlocks(buf, 0, buf.length));
    }
    /* a marker line the loop could not consume would spin forever — it cannot happen (the entry
       condition matched `first`), but a parser that can loop is worse than one that emits nothing */
    if (k === i) return { node: { t: 'p', lines: [lines[i].trim()], soft: false, hasBlock: false }, next: i + 1 };
    return { node: { t: 'list', type, start: first.start, loose, items }, next: k };
  }

  function parseParagraph(lines, i, to) {
    const buf = [];
    let k = i;
    let hasBlock = false;
    while (k < to) {
      const ln = lines[k];
      if (!ln.trim()) break;
      if (k > i && isBlockStart(ln)) break;
      if (RE_BLOCK_PH.test(ln)) hasBlock = true;
      buf.push(ln.trim());
      k++;
    }
    if (!buf.length) return { nodes: [], next: i + 1 };

    const lead = buf.length === 1 ? RE_LEAD.exec(buf[0]) : null;
    if (lead) return { nodes: [{ t: 'h', level: 4, lead: true, text: lead[1] }], next: k };

    const groups = [[]];
    for (let n = 0; n < buf.length; n++) {
      groups[groups.length - 1].push(buf[n]);
      if (n < buf.length - 1 && RE_SENT_END.test(buf[n])) groups.push([]);
    }
    const nodes = groups.map((g, gi) => ({ t: 'p', lines: g, soft: gi < groups.length - 1, hasBlock }));
    return { nodes, next: k };
  }

  /* ── inline ───────────────────────────────────────────────────────────────────────────────────
     Each finished fragment is parked in an `X` placeholder so the ONE `esc()` at the end covers every
     run of author text and nothing else. Restoring loops, because a link label can itself hold a
     placeholder and `String.replace` does not re-scan what it substituted. */
  function inline(text) {
    const S = [];
    const put = (h) => { S.push(h); return X0 + (S.length - 1) + X1; };
    let s = String(text == null ? '' : text);

    /* (#R494) escaped markdown: `\*not italic\*` is text the author asked for literally */
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!|>~$])/g, (m, ch) => put(esc(ch)));
    /* (#R74) markdown links → real (safe) anchors. ⚠ `href` STAYS THE FIRST ATTRIBUTE — the URL
       audit in tests/r463-checks.test.mjs reads anchors with a regex that assumes it. */
    s = s.replace(/\[([^\]\n]{1,160})\]\((https?:[^)\s]{4,400})\)/g,
      (m, t, u) => put('<a href="' + u + '" class="atl-a" target="_blank" rel="noopener">' + esc(t) + '</a>'));
    /* (#R79g) bare urls too — the leading-char guard skips one already inside an href="…" */
    s = s.replace(/(^|[^"'=>/])(https?:\/\/[^\s<)"'）】]{4,400})/g,
      (m, pre, u) => pre + put('<a href="' + u + '" class="atl-a atl-a-url" target="_blank" rel="noopener">' + esc(u) + '</a>'));
    /* (#R159) inline **bold** → plain: an Atlas reply body carries no bold */
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '$1');
    /* (#R156) *italic* — guarded so `**`, a bullet and `2 * 3` cannot misfire */
    s = s.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g,
      (m, pre, t) => pre + put('<i>' + esc(t) + '</i>'));

    let out = esc(s);
    for (let pass = 0; pass < 4 && RE_X.test(out); pass++) {
      RE_X.lastIndex = 0;
      out = out.replace(RE_X, (m, n) => S[+n] || '');
    }
    RE_X.lastIndex = 0;
    return out;
  }

  /* ── rendering ────────────────────────────────────────────────────────────────────────────── */

  function headingHtml(n) {
    const lv = Math.min(6, Math.max(1, n.level | 0));
    return '<h' + lv + ' class="atl-h atl-h' + lv + (n.lead ? ' atl-hb' : '') + '">'
      + inline(n.text) + '</h' + lv + '>';
  }

  function listHtml(n) {
    const tag = n.type === 'ol' ? 'ol' : 'ul';
    let h = '<' + tag + ' class="atl-' + tag + (n.loose ? ' atl-loose' : '') + '"';
    if (tag === 'ol' && n.start && n.start !== 1) h += ' start="' + n.start + '"';
    h += '>';
    for (let i = 0; i < n.items.length; i++) h += '<li class="atl-li">' + blocksHtml(n.items[i], !n.loose) + '</li>';
    return h + '</' + tag + '>';
  }

  function blocksHtml(nodes, tight) {
    let h = '';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.t === 'raw') { h += n.v; continue; }
      if (n.t === 'hr') { h += '<hr class="atl-hr">'; continue; }
      if (n.t === 'h') { h += headingHtml(n); continue; }
      if (n.t === 'quote') { h += '<blockquote class="atl-bq">' + blocksHtml(n.kids, false) + '</blockquote>'; continue; }
      if (n.t === 'list') { h += listHtml(n); continue; }
      const body = n.lines.map(inline).join('<br>');
      /* a tight list item opens with its text, not with a paragraph box */
      if (tight && i === 0) { h += body; continue; }
      const tag = n.hasBlock ? 'div' : 'p';
      h += '<' + tag + ' class="atl-p' + (n.soft ? ' atl-ps' : '') + '">' + body + '</' + tag + '>';
    }
    return h;
  }

  /**
   * renderMarkdown(src) -> HTML
   * `src` is the placeholder-protected, reflowed reply text js/atlas-reply.js hands over.
   */
  function renderMarkdown(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    return blocksHtml(parseBlocks(lines, 0, lines.length), false);
  }

  return { renderMarkdown, _parseBlocks: parseBlocks, _inline: inline };
}
