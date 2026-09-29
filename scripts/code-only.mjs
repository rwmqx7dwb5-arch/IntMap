/* ============================================================================
 *  IntMap · COMMENTS ARE NOT CODE — ONE PLACE THAT KNOWS IT   (#R345, test-code-only-one)
 * ----------------------------------------------------------------------------
 *  A source-level check reads a file with a regular expression and asks «is this call here?».
 *  Every file that explains WHY a call was added, removed, or built differently contains that
 *  call's spelling in prose — so the check answers «yes» to its own explanatory note. This
 *  repository has paid for that nine times now; #R318 counted eight and wrote the first stripper
 *  inline in scripts/atlas-capability-audit.mjs, and #R345 hit the ninth:
 *
 *    supabase/functions/aviation-feed/index.ts made exactly one call, corsFor("x-intmap-channel"),
 *    and mentioned corsFor() once more in a comment explaining why it extends the shared builder
 *    locally. tests/helpers/fn-cors.js matched the comment with the no-argument branch of its
 *    pattern, called the contract «ambiguous», and turned FIVE tests in tests/r333-checks.test.mjs
 *    red on a file whose contract was never in doubt. #R339 reworded its comment and moved on.
 *
 *  ⚠ THE STRIPPER IS THE FIX; REWORDING THE PROSE IS NOT. A check that a comment can make lie is
 *    a check that the next author's comment will make lie again, and the failure is loudest in the
 *    files that are best explained. So this lives in ONE module and every reader imports it.
 *
 *  ⚠ (test-code-only-one) #R345 said «one module» and the repository went on writing copies: a
 *    census found 635 comment-stripping sites in 170 files under tests/ and scripts/ (regex chains,
 *    hand-written loops, acorn onComment blankers, comment-line filters), most of them the same
 *    regex pair (a lazy block-comment match followed by «two slashes not behind a colon, to end of
 *    line») that test 8 of tests/r345-checks.test.mjs shows deleting a call. They were copies because this
 *    module answered only one of the questions they were asking — so it now answers all of them, as
 *    OPTIONS, and scripts/comment-strippers.mjs (a rule in `npm run check:static`) finds a new copy
 *    by its SHAPE, whatever it is called.
 *
 *  WHAT IT GUARANTEES
 *    · A line comment runs to the end of its line; a block comment runs to its terminator. Both
 *      are removed.
 *    · Line structure survives: a comment leaves its own line breaks behind, so nothing that was
 *      on two lines is ever spliced onto one (the inline version collapsed a block comment to a
 *      single space, which could join the code before it to the code after it).
 *    · STRING LITERALS SURVIVE INTACT — '…', "…" and `…` including ${ } substitution, escapes and
 *      nesting. A URL is not a comment: "https://example.com" keeps its slashes, and so does a
 *      string that spells a block-comment opener inside itself. The regex-pair heuristic this
 *      replaces could only defend the slashes that sat directly behind a quote or a colon.
 *    · REGEX LITERALS SURVIVE INTACT, because a character class may contain the two characters
 *      that open a block comment — mistaking that for one swallows the rest of the file.
 *
 *  THE OPTIONS — each is a question a copy was written to answer
 *    lang: 'js' (default) · 'css' (block comments only; a `//` in CSS is a URL, never a comment)
 *          · 'html' (`<!-- -->` only) · 'sql' (`--` to end of line and block comments; '…' and
 *          "…" are quoted, and a `--` inside them is text).
 *    offsets: true — a comment becomes the same number of spaces (its line breaks kept), so an
 *          index into the result is an index into the source and a line count is a line count.
 *    literals: 'blank' — (js) the string, template-text and regex literals are blanked too, with the
 *          same offsets, so a check that asks for CODE is not answered by a quoted word. The ${ }
 *          inside a template is code and is kept.
 *    parser: 'acorn' — (js) the comment and literal ranges come from acorn's tokenizer (module,
 *          then script) instead of the scanner below; a file acorn cannot read THROWS, and the
 *          caller decides what that means. For a reader whose answer must be the grammar's.
 *
 *  WHAT THE SCANNER IS NOT: a JavaScript parser. It decides regex-vs-division from the previous
 *  significant token, the way every syntax highlighter does. A wrong guess in the direction of
 *  «division» costs nothing (the literal is left in the text, which is where it already was); the
 *  guess is only ever made after an operator or a keyword, where division cannot occur.
 *
 *  tests/r345-checks.test.mjs and tests/code-only-options-checks.test.mjs feed every clause above
 *  a fixture with the defect present and assert the answer, in both directions — a stripper
 *  nobody has seen fail proves nothing.
 * ==========================================================================*/
import { createRequire } from 'node:module';

/* After one of these, a `/` opens a regular expression; after anything else it divides. */
const REGEX_OK_PUNCT = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+',
  '-', '*', '%', '~', '^', '<', '>', '\n']);
const REGEX_OK_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'new',
  'delete', 'void', 'throw', 'do', 'else', 'yield', 'await']);
const LANGS = new Set(['js', 'css', 'html', 'sql']);

/** Does the `/` about to be read open a regular expression, judged by what precedes it? */
function startsRegex(out) {
  let j = out.length - 1;
  while (j >= 0 && (out[j] === ' ' || out[j] === '\t' || out[j] === '\r')) j--;
  if (j < 0) return true;                                   // start of file
  const c = out[j];
  if (REGEX_OK_PUNCT.has(c)) return true;
  if (!/[A-Za-z0-9_$]/.test(c)) return false;
  let k = j;
  while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k--;
  return REGEX_OK_WORD.has(out.slice(k + 1, j + 1));
}

/* Every character but a line break becomes a space: the offset-keeping form of «removed». */
const blank = (t) => t.replace(/[^\n\r]/g, ' ');

/**
 * The CODE of a source: every comment removed, everything else — string literals, template
 * literals, regular expressions, line breaks — left exactly as it was (unless an option says
 * otherwise; see the header).
 * @param {string} src
 * @param {{lang?:'js'|'css'|'html'|'sql', offsets?:boolean, literals?:'keep'|'blank', parser?:'scan'|'acorn'}} [opts]
 */
export function codeOnly(src, opts = {}) {
  const s = String(src);
  const lang = opts.lang || 'js';
  if (!LANGS.has(lang)) throw new Error(`codeOnly: unknown lang ${JSON.stringify(lang)}`);
  const offsets = opts.offsets === true || opts.literals === 'blank';
  const blankLiterals = opts.literals === 'blank';
  if (blankLiterals && lang !== 'js') throw new Error('codeOnly: literals:"blank" is defined for js only');
  if (opts.parser === 'acorn') {
    if (lang !== 'js') throw new Error('codeOnly: parser:"acorn" reads js only');
    return viaAcorn(s, { offsets, blankLiterals });
  }

  /* `code` is the text the regex-vs-division guess reads (comments as the default form, literals
     as written); `out` is what the caller asked for. They differ only under an option. */
  let out = '', code = '';
  const emit = (t, kind) => {
    if (kind === 'comment-line') { if (offsets) out += blank(t); return; }
    if (kind === 'comment-block') {
      const nl = t.replace(/[^\n]/g, '');
      code += ' ' + nl + ' ';
      out += offsets ? blank(t) : ' ' + nl + ' ';
      return;
    }
    code += t;
    out += kind === 'literal' && blankLiterals ? blank(t) : t;
  };
  let i = 0;
  const n = s.length;
  const lineComment = (len) => {                            // runs to (not through) the line break
    let e = i + len;
    while (e < n && s[e] !== '\n') e++;
    emit(s.slice(i, e), 'comment-line'); i = e;
  };
  const blockComment = (open, close) => {
    const e = s.indexOf(close, i + open.length);
    const end = e < 0 ? n : e + close.length;
    emit(s.slice(i, end), 'comment-block'); i = end;
  };
  const quoted = (q, escapes) => {                          // a string never runs past its line
    let e = i + 1;
    while (e < n) {
      const ch = s[e];
      if (escapes && ch === '\\') { e += 2; continue; }
      if (ch === '\n') break;                               // unterminated: do not eat the file
      e++;
      if (ch === q) break;
    }
    e = Math.min(e, n);
    emit(s.slice(i, e), 'literal'); i = e;
  };

  if (lang === 'html') {
    while (i < n) {
      const e = s.indexOf('<!--', i);
      if (e < 0) { emit(s.slice(i), 'code'); break; }
      emit(s.slice(i, e), 'code'); i = e;
      blockComment('<!--', '-->');
    }
    return out;
  }
  if (lang === 'css' || lang === 'sql') {
    while (i < n) {
      const c = s[i];
      if (c === '/' && s[i + 1] === '*') { blockComment('/*', '*/'); continue; }
      if (lang === 'sql' && c === '-' && s[i + 1] === '-') { lineComment(2); continue; }
      if (c === "'" || c === '"') { quoted(c, lang === 'css'); continue; }
      let e = i + 1;
      while (e < n && !'/-\'"'.includes(s[e])) e++;
      emit(s.slice(i, e), 'code'); i = e;
    }
    return out;
  }

  /* One frame per template literal we are inside of. A code frame counts braces so that the `}`
     closing a ${ } is told apart from the `}` closing an object written inside it. */
  const frames = [{ tpl: false, depth: 0 }];
  while (i < n) {
    const f = frames[frames.length - 1];
    const c = s[i];

    if (f.tpl) {                                            // inside a template literal
      if (c === '\\') { emit(s.slice(i, i + 2), 'literal'); i += 2; continue; }
      if (c === '`') { emit(c, 'literal'); i++; frames.pop(); continue; }
      if (c === '$' && s[i + 1] === '{') { emit('${', 'code'); i += 2; frames.push({ tpl: false, depth: 0 }); continue; }
      emit(c, 'literal'); i++; continue;
    }

    if (c === '/' && s[i + 1] === '/') { lineComment(2); continue; }     // keep the line break
    if (c === '/' && s[i + 1] === '*') { blockComment('/*', '*/'); continue; }
    if (c === "'" || c === '"') { quoted(c, true); continue; }
    if (c === '`') { emit(c, 'literal'); i++; frames.push({ tpl: true, depth: 0 }); continue; }
    if (c === '/' && startsRegex(code)) {                   // a regex literal, character class and all
      let e = i + 1, cls = false;
      while (e < n) {
        const ch = s[e];
        if (ch === '\\') { e += 2; continue; }
        if (ch === '\n') break;                             // unterminated: it was division after all
        e++;
        if (ch === '[') cls = true;
        else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) break;
      }
      e = Math.min(e, n);
      emit(s.slice(i, e), 'literal'); i = e;
      continue;
    }
    if (c === '{') { f.depth++; emit(c, 'code'); i++; continue; }
    if (c === '}') {
      if (f.depth === 0 && frames.length > 1) { emit(c, 'code'); i++; frames.pop(); continue; }
      if (f.depth > 0) f.depth--;
      emit(c, 'code'); i++; continue;
    }
    emit(c, 'code'); i++;
  }
  return out;
}

/* The grammar's answer. Token labels acorn gives a literal's own characters: the backquotes too,
   so window[`X`] reads like window['X']; the ${ and } of a substitution are code and stay. */
const LITERAL_TOKENS = new Set(['string', 'template', 'invalidTemplate', 'regexp', '`']);
let acornLib = null;
function viaAcorn(s, { offsets, blankLiterals }) {
  acornLib = acornLib || createRequire(import.meta.url)('acorn');
  let comments, literals;
  const opts = (sourceType) => ({
    ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: sourceType === 'script',
    onComment: (block, _text, a, b) => comments.push([a, b, block]),
    onToken: (t) => { if (blankLiterals && LITERAL_TOKENS.has(t.type.label)) literals.push([t.start, t.end]); },
  });
  let first = null;
  for (const sourceType of ['module', 'script']) {
    comments = []; literals = [];
    try { acornLib.parse(s, opts(sourceType)); first = null; break; } catch (e) { first = first || e; }
  }
  if (first) throw first;
  const spans = [...comments, ...literals.map(([a, b]) => [a, b, null])].sort((x, y) => x[0] - y[0]);
  let out = '', at = 0;
  for (const [a, b, block] of spans) {
    if (a < at) continue;
    out += s.slice(at, a);
    const t = s.slice(a, b);
    if (offsets || block === null) out += blank(t);
    else if (block) out += ' ' + t.replace(/[^\n]/g, '') + ' ';
    at = b;
  }
  return out + s.slice(at);
}

export default codeOnly;
