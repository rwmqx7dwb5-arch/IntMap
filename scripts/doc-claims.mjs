/* ============================================================================
 *  IntMap · WHAT IS THIS NUMBER IN THE PROSE A NUMBER *OF*?
 * ----------------------------------------------------------------------------
 *  `scripts/doc-facts.mjs` guards facts that are written down in more than one document —
 *  how many Edge Functions there are, how many rings, how many cities. Every one of those
 *  rules has to find, in Japanese prose, the sentences that STATE the number, and then
 *  compare what they state against what the repository actually holds.
 *
 *  ⚠ THE WAY THOSE RULES USED TO FIND THEM DECIDED, BY ITSELF, HOW MUCH THEY COULD SEE.
 *    The `edge-count` needle was
 *
 *        Edge Functions?  ·  one of 「は を — – - : ： （ (」  ·  a number  ·  「本」
 *
 *    — a HAND-WRITTEN SET OF SEPARATORS. A sentence that put anything else between the noun
 *    and the number was not judged wrong and was not judged right: it was never looked at,
 *    and the report said「all N agree」about the sentences that happened to fit.
 *
 *    MEASURED (#R696, and re-measured #R699 before this file existed): `docs/README.md` said
 *    「Edge Function の名簿（**16 本**の名前…）」while there were seventeen. The gate was green.
 *    Putting the number back to 16 today still leaves it green — the separator between the
 *    noun and the number is 「の名簿（」, and 「の」 was deliberately kept out of that set.
 *    The walk also reaches `Architecture.md` §6.2's 「⚠ **17本**すべてを…宣言する」 — the 正本
 *    paragraph itself. MEASURED over the same 44 documents: 7 claims → 9, with no false one.
 *
 *    This is the shape #R694 found in the `_shared/` roster gate: there, a 260-character
 *    window decided how many omissions were tolerated, so the LENGTH of the text decided what
 *    the gate could see. Here a list of separator characters decides it. Both are a property
 *    of the NEEDLE leaking out into the rule's coverage.
 *
 *  ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────────────────
 *  A quantity in Japanese attaches to a noun phrase, and the noun phrase may be built out of
 *  several nouns linked by particles. So rather than asking「which characters am I willing to
 *  see between the noun and the number」, walk LEFT from the number along that chain and find
 *  out WHICH NOUN THE QUANTITY IS ACTUALLY COUNTING:
 *
 *      「Edge Functions は **17本**」   0 nouns in between, linked by は     → an inventory claim
 *      「Edge Function の名簿（17 本の名前」  名簿 in between, linked by の  → an inventory claim
 *      「公開 relay 4 本」             the chain reaches `relay` and stops   → NOT ours
 *      「Edge Function の 1 本」        0 nouns in between, linked by の      → PARTITIVE: one OF them
 *      「**Edge Function 1 本**（…）」  0 nouns, no link at all               → an INSTANCE: one does this
 *
 *  ⚠ THE DIRECTION OF THE DEFAULT IS THE POINT. The old needle was an INCLUSION list:
 *    anything it did not name was invisible. This is an EXCLUSION list — every quantity whose
 *    chain reaches the subject is checked unless it lands in a class that is named here, with
 *    a reason, AND COUNTED IN THE REPORT. A phrasing nobody anticipated now reads as a claim
 *    and gets checked, instead of disappearing. Zero examined is visible too, because the
 *    tally is printed whether or not anything was wrong.
 *
 *  ⚠ AND A HEADING IS A SUBJECT — FOR A QUANTITY THAT HAS NO NOUN OF ITS OWN. 「⚠ **17本**
 *    すべてを」 opens its line under §6.2「Edge Functions — 17本」and leans on that heading, the
 *    way the reader does. But 「socket は同時に1本だけ」 and 「残り4本」 sit under the same
 *    heading with nouns of their own: MEASURED, letting the heading speak for every chain that
 *    failed turned ELEVEN of those into claims that there are 1, 2, 4, 10, 13 and 128 Edge
 *    Functions, against two true ones. Only a quantity that opens its line qualifies.
 *
 *  Kept separate from doc-facts.mjs for the reason #R694 gave: one run of that script is
 *  ~7.5 s, so the sweep that proves this rule — every phrasing, in both directions — could
 *  never be written against it. Against this module it is milliseconds, and
 *  `tests/r699-doc-claim-needles-checks.test.mjs` writes exactly that sweep, importing this
 *  function rather than restating the rule (.agents/rules/no-ad-hoc-hardcoding.md §2.3).
 * ==========================================================================*/

/* ── the pieces of a noun phrase ──────────────────────────────────────────────────────────
   ⚠ A SPACE IS PART OF A NOUN ONLY BETWEEN TWO LATIN LETTERS. 「Edge Function」 is one noun
     and 「公開 relay」 is two; without that distinction the walk out of 「公開 relay 4 本」
     would run straight past `relay` and hand the 4 to whatever noun came before it. */
const NOUN_CH = /[A-Za-z0-9_.\u002d\u002f\u3041-\u309f\u30a0-\u30ff\u4e00-\u9fff\u30fc]/;
const LATIN = /[A-Za-z0-9]/;
/* Markup and brackets sit between the words without being words. `（` is here as well as in
   the links below: it is skipped when it closes to the right of the number and consumed as a
   link when the number is inside it. */
const SKIP = /[ \t*`"'\u201c\u201d\u300c\u300d\u300e\u300f\u3010\u3011\uff62\uff63]/;
/* Quantifier prefixes: 「全17本」「約17本」「計17本」 — part of the quantity, not of the chain. */
const PREFIX = /[\u5168\u7d04\u8a08\u306a\u3089\u3073\u306b]/;
/* The links of a noun-modifier chain. Particles and the punctuation that stands in for them
   in a heading or a table cell. ⚠ This is not a list of "separators I will tolerate" — it is
   the set of links the walk can FOLLOW; anything else simply ends the chain, and a quantity
   whose chain ended without reaching the subject is reported as such rather than dropped. */
const LINK = /[\u306e\u306f\u304c\u3092\u3082\u3068\u306b\u3078\u3084\uff1a:\uff08(\u2014\u2013\u30fb,=|\u2192]/;
/* The classes a rule must compare against the repository. The others are named, counted and
   left alone — that naming is what makes «nothing was looked at» different from «nothing
   disagreed», which the needle this replaces could not tell apart. */
export const CHECKED = ['inventory', 'unlinked'];

/* `の` is the one link whose IDENTITY matters afterwards: with no noun in between it makes the
   quantity partitive (one OF them) rather than an inventory. */
const PARTITIVE = '\u306e';

/**
 * Walk left from `at` and report which noun the quantity there is counting.
 * @returns {{noun:string|null, hops:string[], link:string|null}}
 *   `noun`  the head noun the chain reached, or null if it reached a boundary first
 *   `hops`  the nouns passed through on the way (nearest first)
 *   `link`  the link consumed immediately before the head noun (null = bare juxtaposition)
 */
export function headNoun(body, at, subjectRe) {
  let i = at;
  const hops = [];
  let link = null;
  /* the quantity's own prefix (全/約/計) belongs to the number */
  while (i > 0 && (SKIP.test(body[i - 1]) || PREFIX.test(body[i - 1]))) i--;
  for (let guard = 0; guard < 24; guard++) {
    while (i > 0 && SKIP.test(body[i - 1])) i--;
    if (i === 0) return { noun: null, hops, link };
    const c = body[i - 1];
    if (LINK.test(c)) {
      /* `のち` / `には` — a link is only a link when a noun (or the number) sits on each side;
         that is guaranteed here because we only ever read one character and keep walking. */
      link = c;
      i--;
      while (i > 0 && SKIP.test(body[i - 1])) i--;
      if (i === 0 || !NOUN_CH.test(body[i - 1])) return { noun: null, hops, link };
      continue;
    }
    if (!NOUN_CH.test(c)) return { noun: null, hops, link };          /* 。 newline | # > ⚠ … */
    /* consume one noun run */
    let j = i;
    while (j > 0) {
      const p = body[j - 1];
      /* ⚠ A LINK ENDS THE RUN. The links are kana and kana is noun material, so without this
         the walk out of 「Edge Function の名簿（17 本」 reads 「の名簿」 as ONE noun, never
         sees the particle that carries it to `Edge Function`, and reports the sentence — the
         #R696 defect itself — as being about nothing. (Measured: hops:['の名簿'], noun:null.) */
      if (LINK.test(p)) break;
      if (NOUN_CH.test(p)) { j--; continue; }
      if (p === ' ' && j >= 2 && LATIN.test(body[j - 2]) && j < body.length && LATIN.test(body[j])) { j--; continue; }
      break;
    }
    const run = body.slice(j, i);
    if (subjectRe.test(run)) return { noun: run, hops, link };
    hops.push(run);
    i = j;
    link = null;
    /* an intervening noun can only stay in the chain if a link carries it to the next one */
    while (i > 0 && SKIP.test(body[i - 1])) i--;
    if (i === 0 || !LINK.test(body[i - 1])) return { noun: null, hops, link };
  }
  return { noun: null, hops, link };
}

/* ── the section a position sits in ───────────────────────────────────────────────────────
   A quantity leaning on its heading rather than on a noun still has a subject — but it is the
   subject of the INNERMOST heading, not of any ancestor.
   ⚠ MEASURED: `Architecture.md` §6 is 「## 6. Supabase（テーブル・Edge Functions・環境変数）」,
     which names the subject and runs over §6.1 (the tables) and §6.3 (the secrets) as well.
     Taking every enclosing heading put every number in three sections' worth of prose into the
     subject's scope. The nearest heading above the quantity is the one that is actually
     talking, which is how the reader reads it too. */
/* Does this position open its line — is there nothing but markup to its left?
   ⚠ MEASURED: without this, 「（鍵1本あたり3接続で、4本」 and 「…）。1 本」 also "attach to
     nothing", because 「、」 and 「。」 end the chain the same way the start of a line does. They
     are not spoken by the heading — the sentence they are in has already said what they count.
     A quantity that OPENS its line has no such sentence. */
export function opensLine(body, at) {
  const ls = body.lastIndexOf('\n', at - 1) + 1;
  return /^[\s>*#—–·|⚠-]*$/.test(body.slice(ls, at));
}

/* Is the subject named on this line, to the left of `at`? */
export function subjectOnLine(body, at, anywhereRe) {
  const ls = body.lastIndexOf('\n', at - 1) + 1;
  return anywhereRe.test(body.slice(ls, at));
}

export function enclosingHeading(body, at) {
  let last = '';
  for (const h of body.matchAll(/^#{1,6}[ \t]+(.*)$/gm)) {
    if (h.index >= at) break;
    last = h[1];
  }
  return last;
}

/**
 * Every quantity in `body` that is about `subject`, classified.
 *
 * @param {string} body
 * @param {{noun:string, units:string[], words?:Record<string,number>}} subject
 * @returns {{items:{text:string,n:number,kind:string,why:string,index:number}[], tally:Record<string,number>}}
 *
 * kinds:
 *   `inventory`  a statement of how many there are — the rule must check this number
 *   `partitive`  「… の N 本」 one OF them
 *   `instance`   「… N 本（…）」 N of them do this
 *   `other`      the chain reached a different noun — not about this subject at all. Counted
 *                in the tally, not listed: it is most of the numbers in the repository.
 *
 * ⚠ THE RESIDUAL, WRITTEN DOWN RATHER THAN PAPERED OVER (docs/TESTING.md says this too):
 *   a BARE English numeral that attaches to nothing — "All seventeen are declared there now"
 *   — is not reachable. It was tried, at section scope and at paragraph scope, and MEASURED
 *   against the corpus: `docs/SECURITY-ARCHITECTURE.md` §5 opens "There are seventeen Edge
 *   Functions, and this table used to list two." A claim about how many there are and a
 *   sentence of the document's own history sit in ONE SENTENCE, and nothing structural
 *   separates them. Widening to catch the first one turns the second into a failure, so it
 *   stays out — the counted Japanese quantities, where this repository's facts actually live,
 *   are complete.
 */
export function claims(body, subject) {
  const subjectRe = new RegExp(subject.noun + '$');
  const anywhereRe = new RegExp(subject.noun);
  const units = subject.units.join('|');
  const inSection = (i) => anywhereRe.test(enclosingHeading(body, i));
  const items = [];
  const push = (index, text, n, kind, why) => items.push({ index, text: text.replace(/\s+/g, ' ').trim(), n, kind, why });

  /* 1 · counted quantities: a number with one of the subject's counters */
  const QTY = new RegExp('(?<![\\d.\u00a7#])(\\d[\\d,]*)[ \\t]*(?:' + units + ')(?![A-Za-z])', 'g');
  for (const m of body.matchAll(QTY)) {
    const n = Number(m[1].replace(/,/g, ''));
    const { noun, hops, link } = headNoun(body, m.index, subjectRe);
    const text = body.slice(Math.max(0, m.index - 34), m.index + m[0].length);
    if (noun == null) {
      /* ⚠ A HEADING SPEAKS ONLY FOR A QUANTITY THAT HAS NO NOUN OF ITS OWN. 「⚠ **17本**すべてを
         …宣言する」 has nothing at all to its left — the heading 「### 6.2 Edge Functions」 is
         what it leans on, the way the reader reads it. But 「socket は同時に1本だけ」 and
         「残り4本」 sit under that same heading with nouns of their own, and MEASURED, letting
         the heading speak for every chain that failed turned ELEVEN of those into claims that
         there are 1, 2, 4, 10, 13 and 128 Edge Functions, against two true ones. A chain that
         reached some OTHER noun has already found its subject. */
      if (hops.length === 0 && link == null && opensLine(body, m.index) && inSection(m.index)) { push(m.index, text, n, 'inventory', 'leans on the heading above it'); continue; }
      /* ⚠ THE WALK STILL HAS AN ALPHABET OF LINKS, AND AN ALPHABET IS A HAND-WRITTEN SET.
         The difference from the separator set it replaces is that running off the end of it is
         now VISIBLE. If no other noun claimed the quantity (hops is empty) and the subject is
         named on this very line, the number is almost certainly counting the subject through a
         connector this walk does not know — 「Edge Functions · 17本」 was exactly that. It is
         checked like any other claim and says so, instead of joining the 460 quantities in the
         repository that have nothing to do with the subject. */
      if (hops.length === 0 && subjectOnLine(body, m.index, anywhereRe)) { push(m.index, text, n, 'unlinked', 'named on the same line, joined by something the walk does not know'); continue; }
      push(m.index, text, n, 'other', hops.length ? 'counts ' + hops[0] : 'attaches to nothing under a heading that names them');
      continue;
    }
    if (hops.length === 0 && link === PARTITIVE) { push(m.index, text, n, 'partitive', '\u306e with no noun in between — one OF them'); continue; }
    if (hops.length === 0 && link == null) { push(m.index, text, n, 'instance', 'bare juxtaposition — that many of them do this'); continue; }
    push(m.index, text, n, 'inventory', hops.length ? 'via ' + hops.join(' \u2190 ') : 'stated directly');
  }

  /* 2 · English: the numeral stands before the noun, so the chain runs the other way. */
  if (subject.words) {
    const EN = new RegExp('(?<![\\d.\u00a7#])\\**\\b([A-Za-z]+|\\d+)\\b\\**[ \\t]+(?:' + subject.noun + ')\\b', 'g');
    for (const m of body.matchAll(EN)) {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? Number(raw) : subject.words[raw];
      if (n == null) continue;                       /* "an", "the", "many" — not a quantity */
      push(m.index, m[0], n, 'inventory', 'stated directly');
    }
  }

  items.sort((a, b) => a.index - b.index);
  const tally = {};
  for (const it of items) tally[it.kind] = (tally[it.kind] || 0) + 1;
  return { items, tally };
}
