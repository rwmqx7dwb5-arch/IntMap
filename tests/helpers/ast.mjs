/* ============================================================================
 *  tests/helpers/ast.mjs — ONE way to parse a source for a check   (test-code-only-one)
 * ----------------------------------------------------------------------------
 *  72 files under tests/ and 29 under scripts/ imported acorn themselves, and each wrote its own
 *  options and its own recursive walk. The options drift (one reads `ecmaVersion: 2022` and fails
 *  on a newer file; one reads only modules and fails on a classic script; one forgets `locations`
 *  and reports offsets where a line was promised), and a hand-rolled walk that skips a key sees
 *  less of the tree than it claims. This is the configuration every AST check needs, once:
 *
 *    parseSource(src, opts?) — acorn, latest syntax, locations on, hashbang allowed; read as a
 *        module, and when that fails as a classic script (sloppy-mode syntax, top-level return).
 *        A source neither can read THROWS (the check should fail loudly), unless { orNull: true }.
 *        { sourceType } pins one reading; any other key is passed to acorn (onComment, ranges …).
 *    walkSource(srcOrAst, visitors, how = 'simple') — acorn-walk over it: 'simple' calls
 *        visitors[type](node); 'ancestor' calls visitors[type](node, ancestors); 'full' calls
 *        visitors(node) for every node.
 *
 *  For «is this call in the CODE, not the prose», parse or don't — read codeOnly(src) from
 *  scripts/code-only.mjs (docs/TESTING.md, «the source-reading instruments»).
 * ==========================================================================*/
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export const PARSE_OPTIONS = Object.freeze({ ecmaVersion: 'latest', allowHashBang: true, locations: true });

export function parseSource(src, { sourceType, orNull = false, ...extra } = {}) {
  const text = String(src);
  const readings = sourceType ? [sourceType] : ['module', 'script'];
  let first = null;
  for (const st of readings) {
    try {
      return acorn.parse(text, { ...PARSE_OPTIONS, sourceType: st, allowReturnOutsideFunction: st === 'script', ...extra });
    } catch (e) { first = first || e; }
  }
  if (orNull) return null;
  throw first;
}

export function walkSource(srcOrAst, visitors, how = 'simple') {
  const ast = typeof srcOrAst === 'string' ? parseSource(srcOrAst) : srcOrAst;
  if (how === 'full') walk.full(ast, visitors);
  else if (how === 'ancestor') walk.ancestor(ast, visitors);
  else walk.simple(ast, visitors);
  return ast;
}

export { acorn, walk };
