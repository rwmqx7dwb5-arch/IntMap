/* ============================================================================
 *  IntMap · THE TWO REFUSALS EVERY AUTHORED STRING OF A DECLARED SCREEN GETS   (js/ui-text-rules.js)
 * ----------------------------------------------------------------------------
 *  Atlas declares screens in two spellings — a VIEW in the reply (`ui.compose`, js/atlas-ui-spec.js) and a live
 *  BOARD (`board.compose`, js/board-spec.js) — and a view can now carry a board. A string Atlas wrote is judged by
 *  the same two rules in both, so the rules are written ONCE, here, and neither spec has a copy:
 *    url     a link in a drawn answer claims IntMap fetched the page (js/atlas-answer-render.js demoteProseLinks)
 *    markup  a tag is refused rather than shown as escaped noise; nothing from a spec is ever parsed as HTML
 *  A string is JUDGED, not cleaned: removing the offending part would draw something the model did not write.
 *  Pure: no DOM, no globals. tests/declarative-workspace-checks.test.mjs and tests/board-compose-checks.test.mjs evaluate it.
 * ==========================================================================*/
const URL_RE = /\b(?:https?|ftp|javascript|vbscript|data|file|blob):|\bwww\.[a-z0-9-]+\./i;
/* a tag is a `<` followed AT ONCE by a name (or `</name`, `<!`, `<?`) — or a name followed by an attribute, closed or not;
   `a < b`, `<5%` and `x > y` are prose and pass */
const TAG_RE = /<\/?[a-z][a-z0-9-]*(?:[\s/][^<>]*)?>|<[a-z][a-z0-9-]*\s+[a-z-]+\s*=|<[!?]/i;

/** textProblems(s, L) → [{code, why}] — empty when the string is plain text. `L` is the two-language picker (en, jp). */
export function textProblems(s, L) {
  const out = [];
  if (URL_RE.test(s)) out.push({ code: 'url', why: L('contains a link or URL — a view draws no links (a link in an answer would claim IntMap fetched the page); cite sources in your answer instead',
    'リンクまたは URL が含まれています——ビューはリンクを描きません（回答の中のリンクは IntMap がそのページを取得したと主張してしまうため）。出典は回答の本文で示してください') });
  if (TAG_RE.test(s)) out.push({ code: 'markup', why: L('contains HTML markup — a view is drawn only from IntMap\'s own parts; write plain text (Markdown in a "text" block)',
    'HTML が含まれています——ビューは IntMap 自身の部品だけで描きます。プレーンテキスト（"text" ブロックでは Markdown）で書いてください') });
  return out;
}
