/* ============================================================================
 *  IntMap · Atlas — SYNTAX HIGHLIGHTING FOR THE CODE BLOCKS IN A REPLY  (#R494)
 * ----------------------------------------------------------------------------
 *  #R156 gave a fenced code block a language label and a Copy button and left the code itself one
 *  flat colour. That is the half of a code block a reader does not use: the label says what the
 *  language is, and then nothing in the block distinguishes a keyword from a string from a comment.
 *
 *  ⚠ THIS ESCAPES EVERYTHING IT EMITS, AND IT IS THE ONLY THING THAT TOUCHES THE CODE.
 *  `highlightCode()` replaces the `esc(code)` that used to sit inside `<code>` in js/atlas-reply.js,
 *  so it inherits that call's whole responsibility: every run of author text goes through `esc()`
 *  before it reaches the output, and the ONLY unescaped characters this file ever emits are the
 *  `<span class="hl-…">` wrappers it writes itself. A grammar that fails to match simply leaves the
 *  run in the escaped-text path — there is no branch in which raw code reaches the DOM.
 *
 *  ⚠ NO EXTERNAL LIBRARY, AND DELIBERATELY SO. Prism/highlight.js are 20–100 kB before a single
 *  language, and every byte of them is on the startup budget (scripts/perf-budget.mjs) for a feature
 *  most sessions never reach. Seven grammars written as ordered token rules cover what an Atlas reply
 *  actually contains — the answer to 「このJSONはどう読むの」 and 「このクエリを直して」 — and an
 *  unrecognised language falls back to comments/strings/numbers, which is true of nearly every syntax
 *  and wrong for none of them.
 *
 *  ⚠ ORDER IS THE GRAMMAR. The rules of a language are joined into ONE alternation and scanned once,
 *  left to right, so the FIRST rule that matches at a position wins. Comments and strings are always
 *  first — otherwise a keyword inside a string, or a quote inside a comment, would be coloured as
 *  code. No rule may contain a capturing group: the scanner maps `m[i]` back to `rules[i-1]`, so a
 *  stray `(` inside one rule would silently re-label every rule after it. Use `(?:…)`.
 * ==========================================================================*/

/**
 * makeAtlasHighlight() -> { highlightCode, highlightLang }
 *
 * ⚠ EVERY DECLARATION BELOW LIVES INSIDE THIS FACTORY, and that is a rule of the repository rather
 * than a preference: tests/r175-checks ③ fails any js/ module that leaves an unexported name at the
 * top level, because a module-scope binding nothing exports is invisible to the import graph and to
 * every instrument that walks it. The compiled-grammar cache therefore lives per factory, which is
 * what we want anyway — js/atlas-reply.js builds one and keeps it.
 */
export function makeAtlasHighlight() {
  /* the same five characters js/atlas-console.js's esc() handles — kept local so this module has no
     dependency to inject and cannot be handed a caller's weaker escaper by accident */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const BT = String.fromCharCode(96);   /* a back-tick, spelled so no reader of this file has to wonder whether it terminates something (CONSTITUTION §2) */

  const NUM = '\\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b';
  const DQ  = '"(?:\\\\.|[^"\\\\\\n])*"';
  const SQ  = "'(?:\\\\.|[^'\\\\\\n])*'";
  const TPL = BT + '(?:\\\\.|[^' + BT + '\\\\])*' + BT;

  /* className → token pattern, in priority order. NO capturing groups (see the header). */
  const GRAMMARS = {
    js: { flags: 'g', rules: [
      ['hl-c', '//[^\\n]*|/\\*[\\s\\S]*?\\*/'],
      ['hl-s', DQ + '|' + SQ + '|' + TPL],
      ['hl-k', '\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|import|export|from|as|default|delete|void|null|undefined|true|false|static|get|set|interface|type|enum|implements|readonly|public|private|protected)\\b'],
      ['hl-n', NUM],
      ['hl-f', '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()'],
      ['hl-t', '\\b[A-Z][A-Za-z0-9_$]*\\b'],
    ] },
    py: { flags: 'g', rules: [
      ['hl-c', '#[^\\n]*'],
      ['hl-s', '(?:[rRbBfFuU]{0,2})(?:"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|' + DQ + '|' + SQ + ')'],
      ['hl-k', '\\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|with|try|except|finally|raise|lambda|pass|break|continue|yield|global|nonlocal|assert|async|await|del|match|case)\\b'],
      ['hl-n', NUM],
      ['hl-f', '\\b[A-Za-z_][\\w]*(?=\\s*\\()'],
      ['hl-t', '@[A-Za-z_][\\w.]*'],
    ] },
    json: { flags: 'g', rules: [
      ['hl-a', '"(?:\\\\.|[^"\\\\])*"(?=\\s*:)'],
      ['hl-s', '"(?:\\\\.|[^"\\\\])*"'],
      ['hl-k', '\\b(?:true|false|null)\\b'],
      ['hl-n', '-?' + NUM],
    ] },
    html: { flags: 'g', rules: [
      ['hl-c', '<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>'],
      ['hl-t', '</?[A-Za-z][\\w:.-]*|/?>'],
      ['hl-a', '\\b[A-Za-z_:][\\w:.-]*(?=\\s*=)'],
      ['hl-s', '"[^"\\n]*"|\'[^\'\\n]*\''],
      ['hl-v', '&[a-zA-Z]+;|&#\\d+;'],
    ] },
    css: { flags: 'g', rules: [
      ['hl-c', '/\\*[\\s\\S]*?\\*/'],
      ['hl-s', '"[^"\\n]*"|\'[^\'\\n]*\''],
      ['hl-t', '@[-a-zA-Z]+'],
      ['hl-a', '[-a-zA-Z]+(?=\\s*:)|--[-\\w]+'],
      ['hl-n', '#[0-9a-fA-F]{3,8}\\b|\\b\\d+(?:\\.\\d+)?(?:px|em|rem|ch|%|vh|vw|vmin|vmax|s|ms|deg|fr|pt)?\\b'],
    ] },
    sql: { flags: 'gi', rules: [
      ['hl-c', '--[^\\n]*|/\\*[\\s\\S]*?\\*/'],
      ['hl-s', "'(?:''|[^'])*'"],
      ['hl-k', '\\b(?:select|from|where|and|or|not|null|is|in|like|between|order|group|by|having|limit|offset|insert|into|values|update|set|delete|create|table|view|index|alter|drop|add|column|primary|foreign|key|references|join|inner|left|right|full|outer|on|as|distinct|union|all|case|when|then|else|end|with|returning|conflict|do|nothing|cascade|default|constraint|unique|check|begin|commit|rollback|grant|revoke)\\b'],
      ['hl-f', '\\b(?:count|sum|avg|min|max|coalesce|cast|now|date_trunc|extract|round|abs|length|lower|upper|substring|jsonb_build_object|array_agg)(?=\\s*\\()'],
      ['hl-n', NUM],
    ] },
    bash: { flags: 'g', rules: [
      ['hl-c', '#[^\\n]*'],
      ['hl-s', DQ + "|'[^'\\n]*'"],
      ['hl-v', '\\$\\{[^}\\n]*\\}|\\$[A-Za-z_][\\w]*|\\$[0-9@*#?]'],
      ['hl-k', '\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|export|local|readonly|source|shift|trap|exit|set|unset)\\b'],
      ['hl-f', '\\b(?:echo|cd|ls|cat|grep|sed|awk|curl|npm|npx|node|git|docker|supabase|mkdir|rm|cp|mv|chmod|find|test)\\b'],
      ['hl-n', NUM],
    ] },
    /* ⚠ 'm' is load-bearing here and nowhere else: the key rule is anchored to the START OF A LINE,
       which without it would match only the first line of the document. */
    yaml: { flags: 'gm', rules: [
      ['hl-c', '#[^\\n]*'],
      ['hl-a', '^[ \\t]*-?[ \\t]*[A-Za-z_][\\w.-]*(?=[ \\t]*:)'],
      ['hl-s', DQ + '|' + SQ],
      ['hl-k', '\\b(?:true|false|null|yes|no|on|off)\\b'],
      ['hl-n', NUM],
      ['hl-v', '&[\\w-]+|\\*[\\w-]+'],
    ] },
    /* a language we do not have a grammar for: the three token classes that are true almost everywhere */
    plain: { flags: 'g', rules: [
      ['hl-c', '//[^\\n]*|/\\*[\\s\\S]*?\\*/|#[^\\n]*'],
      ['hl-s', DQ + '|' + SQ],
      ['hl-n', NUM],
    ] },
  };

  /* what a fence label means. Anything not here — and anything with no label at all — is handled by
     `highlightCode`'s own two branches, which is why this map has no default entry. */
  const ALIAS = {
    js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
    ts: 'js', typescript: 'js', tsx: 'js',
    py: 'py', python: 'py', python3: 'py',
    json: 'json', jsonc: 'json', geojson: 'json',
    html: 'html', xml: 'html', svg: 'html', vue: 'html', xhtml: 'html',
    css: 'css', scss: 'css', less: 'css',
    sql: 'sql', postgres: 'sql', postgresql: 'sql', psql: 'sql', plpgsql: 'sql',
    sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash',
    yaml: 'yaml', yml: 'yaml', toml: 'yaml',
  };

  const CACHE = Object.create(null);
  function compiled(name) {
    if (CACHE[name]) return CACHE[name];
    const g = GRAMMARS[name];
    const re = new RegExp(g.rules.map((r) => '(' + r[1] + ')').join('|'), g.flags);
    return (CACHE[name] = { re, rules: g.rules });
  }

  /** The language key a fence label resolves to, or '' when the label names nothing we know. */
  function highlightLang(lang) {
    const key = String(lang == null ? '' : lang).trim().toLowerCase();
    return ALIAS[key] || '';
  }

  /**
   * highlightCode(code, lang) -> HTML for the inside of a <code> element.
   *
   * ⚠ The return value is TRUSTED HTML and the input is NOT: every character of `code` leaves this
   * function through `esc()`. An unlabelled block is escaped and returned unchanged — colouring prose
   * that merely happens to be inside a fence would be a guess, and this file does not guess.
   */
  function highlightCode(code, lang) {
    const src = String(code == null ? '' : code);
    const key = String(lang == null ? '' : lang).trim();
    if (!key) return esc(src);                       /* no label → no grammar to apply */
    if (src.length > 60000) return esc(src);         /* a pathological paste is not worth a scan */
    const g = compiled(ALIAS[key.toLowerCase()] || 'plain');
    const re = g.re;
    re.lastIndex = 0;
    let out = '', last = 0, m;
    while ((m = re.exec(src)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      if (m.index > last) out += esc(src.slice(last, m.index));
      let cls = '';
      for (let i = 1; i < m.length; i++) { if (m[i] !== undefined) { cls = g.rules[i - 1][0]; break; } }
      out += cls ? ('<span class="' + cls + '">' + esc(m[0]) + '</span>') : esc(m[0]);
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }


  return { highlightCode, highlightLang };
}

/* ⚠ THE PALETTE IS A PAIR, NOT A COLOUR. A code block appears on the panel's translucent surface in
   both themes, so every token needs a value in each — a single set tuned for light goes muddy on
   dark and vice versa. The two sets are GitHub's, which is what a reader of code on the web is
   already calibrated to, expressed as custom properties on the wrapper so the spans stay theme-free. */
export const HIGHLIGHT_CSS =
    '.atl-codewrap{--atl-hl-c:#6e7781;--atl-hl-s:#0a3069;--atl-hl-k:#cf222e;--atl-hl-n:#0550ae;'
      + '--atl-hl-f:#8250df;--atl-hl-t:#953800;--atl-hl-a:#0550ae;--atl-hl-v:#953800;}'
  + '[data-theme="dark"] .atl-codewrap{--atl-hl-c:#8b949e;--atl-hl-s:#a5d6ff;--atl-hl-k:#ff7b72;--atl-hl-n:#79c0ff;'
      + '--atl-hl-f:#d2a8ff;--atl-hl-t:#ffa657;--atl-hl-a:#79c0ff;--atl-hl-v:#ffa657;}'
  + '.atl-codeblock .hl-c{color:var(--atl-hl-c);font-style:italic;}'
  + '.atl-codeblock .hl-s{color:var(--atl-hl-s);}'
  + '.atl-codeblock .hl-k{color:var(--atl-hl-k);}'
  + '.atl-codeblock .hl-n{color:var(--atl-hl-n);}'
  + '.atl-codeblock .hl-f{color:var(--atl-hl-f);}'
  + '.atl-codeblock .hl-t{color:var(--atl-hl-t);}'
  + '.atl-codeblock .hl-a{color:var(--atl-hl-a);}'
  + '.atl-codeblock .hl-v{color:var(--atl-hl-v);}'
  /* (#R494) the Wrap toggle — the default is unchanged (`white-space:pre` + a horizontal scrollbar,
     which is the only honest rendering of code whose lines mean something). `wrap` is the reader's
     choice for the case the default is wrong: a one-line JSON payload or a log line, where the
     horizontal scrollbar hides the end of every line. */
  + '.atl-codeblock.wrap,.atl-codeblock.wrap code{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;}'
  + '.atl-codeblock.wrap{overflow-x:hidden;}';
