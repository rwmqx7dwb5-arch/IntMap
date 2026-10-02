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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str } from './atlas-caps.js';

export default [
  /* (#R491) the term gloss. It writes nothing and paints nothing — it opens a card beside the
     text and produces an explanation, which is why its observer is 'none' and its risk 'read'. */
  {
    row: ['reader.gloss',               'gloss',          'explainTerm,defineTerm',                                      'research','none',    '',                       'explanation',         'read',    'none',   'text',     '', 'external'],
    doc: [
      { in: 'reader.gloss', text: 'EXPLAIN A TERM IN THE ANSWER YOU JUST GAVE: {"type":"gloss","term":str} opens a small dictionary card beside the conversation for that word or phrase \u2014 what it means generally, what it means IN THE PASSAGE the reader is looking at, and a short background. The reader can also raise this card themselves by selecting a phrase in your reply and right-clicking it (long-pressing it on a touch screen), so it is the SAME card either way. Use it when the reader asks what a specific term in your answer means (\u300c\u3053\u306e\u8a00\u8449\u306e\u610f\u5473\u306f\u300d / "what does <phrase> mean here"), and pass the phrase EXACTLY as it appears in the answer. It runs on its own daily allowance, NOT on the reader\'s question quota. It does not touch the map; for a full discussion of a subject answer normally instead.\n' },
    ],
    schema: () => ({ type: 'object', properties: { term: str(), text: str(), query: str() }, anyOf: [{ required: ['term'] }, { required: ['text'] }, { required: ['query'] }] }), /* (#R491) a gloss with no phrase is not a question */
    async run(a, dctx, K) { const GLOSS = K.GLOSS;
      return GLOSS.dispatch(a);   /* (#R491) 「この言葉の意味は」 — the same card the reader raises by right-clicking a phrase. Spends the gloss lane, not a question; paints nothing */
    },
  },
];
