/* ── lift a function declaration out of a shipped file, body and all ──────────────────────────────
   ⚠ Not a copy of the algorithm: the text returned IS the text that ships. A brace matcher that
   steps over string literals, meant to be run on comment-stripped source (scripts/code-only.mjs),
   so a `{` inside a comment or inside a quoted 'FeatureCollection' cannot end a function early.

   ⚠ IT LIVES HERE BECAUSE READING A BODY BY ITS CLOSING SPELLING IS THE BUG IT REPLACES (#R531).
   tests/r518-checks ② used to take `function csFC(…){[\s\S]*?\n      return {type:'FeatureCollection'`
   — a lazy match that ends at whatever the function happens to return TODAY. #R531 changed csFC to
   build the collection into a local and `return fc;`, so the match ran on past the end of csFC and
   swallowed hbFC, whose exclusive `<=t` then failed the very assertion that says csFC must not have
   one. The check was right and its reading was fastened to a spelling — #R488's shape. One matcher,
   shared, so the next reader of a function body cannot re-introduce it. */
export function liftFunction(src, name) {
  const head = 'function ' + name + '(';
  const at = src.indexOf(head);
  if (at < 0) throw new Error('no declaration of ' + name);
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced body for ' + name);
}
