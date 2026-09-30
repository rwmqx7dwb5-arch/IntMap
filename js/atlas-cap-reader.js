/* ============================================================================
 *  IntMap · Atlas capabilities — the `reader.*` namespace   (js/atlas-cap-reader.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str } from './atlas-caps.js';

export default [
  /* (#R491) the term gloss. It writes nothing and paints nothing — it opens a card beside the
     text and produces an explanation, which is why its observer is 'none' and its risk 'read'. */
  {
    row: ['reader.gloss',               'gloss',          'explainTerm,defineTerm',                                      'research','none',    '',                       'explanation',         'read',    'none',   'text',     '', 'external'],
    schema: () => ({ type: 'object', properties: { term: str(), text: str(), query: str() }, anyOf: [{ required: ['term'] }, { required: ['text'] }, { required: ['query'] }] }), /* (#R491) a gloss with no phrase is not a question */
    async run(a, dctx, K) { const GLOSS = K.GLOSS;
      return GLOSS.dispatch(a);   /* (#R491) 「この言葉の意味は」 — the same card the reader raises by right-clicking a phrase. Spends the gloss lane, not a question; paints nothing */
    },
  },
];
