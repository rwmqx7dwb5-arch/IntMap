/* ============================================================================
 *  IntMap · COMMENTS ARE NOT CODE — ONE PLACE THAT KNOWS IT   (#R345)
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
 *    files that are best explained. So this lives in ONE module and both readers import it.
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
 *  WHAT IT IS NOT: a JavaScript parser. It decides regex-vs-division from the previous significant
 *  token, the way every syntax highlighter does. A wrong guess in the direction of «division» costs
 *  nothing (the literal is left in the text, which is where it already was); the guess is only ever
 *  made after an operator or a keyword, where division cannot occur.
 *
 *  tests/r345-checks.test.mjs feeds every clause above a fixture with the defect present and
 *  asserts the answer, in both directions — a stripper nobody has seen fail proves nothing.
 * ==========================================================================*/

/* After one of these, a `/` opens a regular expression; after anything else it divides. */
const REGEX_OK_PUNCT = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+',
  '-', '*', '%', '~', '^', '<', '>', '\n']);
const REGEX_OK_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'new',
  'delete', 'void', 'throw', 'do', 'else', 'yield', 'await']);

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

/**
 * The CODE of a JavaScript/TypeScript source: every comment removed, everything else — string
 * literals, template literals, regular expressions, line breaks — left exactly as it was.
 */
export function codeOnly(src) {
  const s = String(src);
  let out = '';
  let i = 0;
  /* One frame per template literal we are inside of. A code frame counts braces so that the `}`
     closing a ${ } is told apart from the `}` closing an object written inside it. */
  const frames = [{ tpl: false, depth: 0 }];

  while (i < s.length) {
    const f = frames[frames.length - 1];
    const c = s[i];

    if (f.tpl) {                                            // inside a template literal
      if (c === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { out += c; i++; frames.pop(); continue; }
      if (c === '$' && s[i + 1] === '{') { out += '${'; i += 2; frames.push({ tpl: false, depth: 0 }); continue; }
      out += c; i++; continue;
    }

    if (c === '/' && s[i + 1] === '/') {                    // line comment — keep the line break
      i += 2;
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {                    // block comment — keep its line breaks
      i += 2;
      out += ' ';
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') out += '\n'; i++; }
      i = Math.min(i + 2, s.length);
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"') {                           // a quoted string
      out += c; i++;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
        if (ch === '\n') break;                             // unterminated: do not eat the file
        out += ch; i++;
        if (ch === c) break;
      }
      continue;
    }
    if (c === '`') { out += c; i++; frames.push({ tpl: true, depth: 0 }); continue; }
    if (c === '/' && startsRegex(out)) {                    // a regex literal, character class and all
      out += c; i++;
      let cls = false;
      while (i < s.length) {
        const ch = s[i];
        if (ch === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
        if (ch === '\n') break;                             // unterminated: it was division after all
        out += ch; i++;
        if (ch === '[') cls = true;
        else if (ch === ']') cls = false;
        else if (ch === '/' && !cls) break;
      }
      continue;
    }
    if (c === '{') { f.depth++; out += c; i++; continue; }
    if (c === '}') {
      if (f.depth === 0 && frames.length > 1) { out += c; i++; frames.pop(); continue; }
      if (f.depth > 0) f.depth--;
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

export default codeOnly;
