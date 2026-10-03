// ============================================================================
//  IntMap · _shared/news-entities.js — WHICH COMPANY A NEWS ARTICLE NAMES (news-intelligence)
// ----------------------------------------------------------------------------
//  The rule behind public.news_event_entities: given the company atlas's own roster
//  (data/companies/index.json — the file the company panel reads, served by the site) and one
//  article's headline and description, which companies does the text name, and on what evidence.
//
//  ⚠ ONE RULE, NO LIST OF EXCEPTIONS. The roster is not annotated by hand («Apple is ambiguous»,
//    «Target is a word»); the evidence decides. Three kinds, strongest first:
//      legal_name  the registered name («Apple Inc.», «Toyota Motor Corporation») as written
//      ticker      the ticker WITH its exchange or in the form a market story prints it
//                  («NASDAQ: AAPL», «(NYSE:BA)», «$TSLA») — a bare «BA» is not evidence of anything
//      name        the common name («Toyota», «Boeing»), as a whole word with its capital letter
//    ⚠ A ONE-WORD COMMON NAME NEEDS ITS CAPITAL TO MEAN SOMETHING. «Apple» in «Apple shares fell»
//      is a name; in a Title-Case headline («Fed Misses Its Inflation Target») every word has a
//      capital, so the capital says nothing. A one-word name is therefore accepted only from
//      sentence-case text (the description, or a headline that is not Title Case), or when the
//      name is written in capitals throughout (BMW, BASF, ASML — an acronym is not a common word).
//      In sentence-case text a capital at the START of a sentence is no evidence either, unless the
//      event is filed under business or technology (the category is the server's own, decided from
//      the feed section — docs/NEWS-EVENTS.md §6).
//    ⚠ WHAT THIS DOES NOT CATCH, measured on 3,099 production articles (2026-10-02, 160 matches): a
//      capitalised name used as part of another proper noun in sentence case («the Amazon rainforest»).
//      The row says `name` and carries the sentence, and the reader sees both — the claim is never
//      shown without the words it rests on.
//    ⚠ THE LONGEST NAME TAKES ITS SPAN (the IntMapNewsGeo rule, js/newsgeo.js): «Toyota Tsusho»
//      consumes the «Toyota» inside it, so one phrase is never two companies.
//  ⚠ PURE: no network, no clock, no Deno, no DOM — node imports it as it is
//    (tests/news-intelligence-checks.test.mjs runs the shipped function, not a copy).
// ============================================================================

/* the three evidence kinds, strongest first — the table's CHECK constraint holds the same three words */
export const MATCH_KINDS = Object.freeze(['legal_name', 'ticker', 'name']);
const RANK = { legal_name: 0, ticker: 1, name: 2 };

const words = (s) => String(s || '').split(/\s+/).filter(Boolean);

/* Title Case: almost every word long enough to be a content word starts with a capital. Measured on
   the feeds' headlines (Google News / Reuters / AP write «Stocks Rally as Fed Signals Cuts»; the BBC and
   NHK write sentence case). Short words («as», «of», «to») are left out of the count because some
   styles keep them lower-case inside an otherwise Title-Case line. */
export function isTitleCase(text) {
  const w = words(text).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')).filter((x) => x.length >= 4);
  if (w.length < 3) return false;
  const cap = w.filter((x) => /^\p{Lu}/u.test(x)).length;
  return cap / w.length >= 0.8;
}

/* every surface form a roster row offers, with the evidence kind it would be */
export function surfacesOf(row) {
  const out = [];
  const n = String((row && row.n) || '').trim();
  const ln = String((row && row.ln) || '').trim();
  const tk = String((row && row.tk) || '').trim();
  if (ln && ln !== n && /\p{L}/u.test(ln)) out.push({ text: ln, kind: 'legal_name' });
  if (n && /\p{L}/u.test(n)) out.push({ text: n, kind: 'name' });
  if (/^[A-Z][A-Z0-9.]{0,9}$/.test(tk)) out.push({ text: tk, kind: 'ticker' });
  return out;
}

/** build the matcher once per roster — { match(article, ctx) → [{ id, kind, evidence }] }
    ⚠ INDEXED, NOT ONE REGEX PER NAME. The first version ran ~1,050 regular expressions over every text:
      measured 15.3 s for 3,099 production articles (2026-10-02), far past an Edge Function's CPU allowance.
      Names are now looked up by their first word at each word of the text, and the tickers by ONE pattern. */
const TOKEN = /[\p{L}\p{N}]+/gu;
/* «NASDAQ: AAPL», «(NYSE:BA)», «(AAPL)», «$AAPL» — the exchange word is any capitalised run before a colon,
   so no list of exchanges is kept here */
const TICKER = /\b([A-Z][A-Za-z]{1,9})\s?:\s?([A-Z][A-Z0-9.]{0,9})\b|\(([A-Z][A-Z0-9.]{0,9})\)|\$([A-Z][A-Z0-9.]{0,9})\b/g;
export function makeEntityMatcher(roster) {
  const byFirst = new Map(), tickers = new Map();
  let size = 0;
  for (const row of (roster || [])) {
    const id = String((row && row.id) || '');
    if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id)) continue;
    for (const s of surfacesOf(row)) {
      size++;
      if (s.kind === 'ticker') { const l = tickers.get(s.text) || []; l.push(id); tickers.set(s.text, l); continue; }
      const first = (s.text.match(/[\p{L}\p{N}]+/u) || [''])[0];
      if (!first || !s.text.startsWith(first)) continue;   /* a name that starts with punctuation has no first word to find it by */
      const oneWord = words(s.text).length === 1;
      const acronym = /^[\p{Lu}\p{N}&.-]+$/u.test(s.text) && /\p{Lu}/u.test(s.text) && s.text.length >= 2;
      const l = byFirst.get(first) || []; l.push({ id, kind: s.kind, text: s.text, len: s.text.length, oneWord, acronym }); byFirst.set(first, l);
    }
  }

  function scan(text, sentenceCase, ctx, out) {
    if (!text) return;
    const cand = [];
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(text))) {
      const list = byFirst.get(m[0]); if (!list) continue;
      for (const f of list) {
        if (!text.startsWith(f.text, m.index)) continue;
        const e = m.index + f.text.length;
        if (e < text.length && /[\p{L}\p{N}]/u.test(text[e])) continue;   /* «Metaverse» is not «Meta» */
        cand.push({ f, s: m.index, e });
      }
    }
    TICKER.lastIndex = 0;
    while ((m = TICKER.exec(text))) {
      const tk = m[2] || m[3] || m[4];
      for (const id of (tickers.get(tk) || [])) cand.push({ f: { id, kind: 'ticker', len: tk.length }, s: m.index, e: m.index + m[0].length });
    }
    /* the longest name first, so it takes its span before anything inside it can; then the stronger kind */
    cand.sort((x, y) => (y.f.len - x.f.len) || (RANK[x.f.kind] - RANK[y.f.kind]) || (x.s - y.s));
    const taken = [];
    for (const c of cand) {
      const f = c.f, s = c.s, e = c.e;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      if (f.kind === 'name' && f.oneWord && !f.acronym) {
        /* in a Title-Case line every word has a capital, so the capital is no evidence at all —
           not even with a business category («Huawei Target a Key Source…», «Securing GDP Target»,
           measured on production headlines 2026-10-02) */
        if (!sentenceCase) continue;
        const filed = ctx && (ctx.category === 'business' || ctx.category === 'technology');
        /* a capital that is only there because a sentence starts with it is not a name's capital
           (leading quotes and brackets included: «‘Visa hopping’ students…») */
        if (!filed && sentenceStart(text, s)) continue;
      }
      taken.push([s, e]);
      out.push({ id: f.id, kind: f.kind, evidence: snippet(text, s, e) });
    }
  }

  return {
    size,
    match(article, ctx) {
      const title = String((article && article.title) || '');
      const desc = String((article && article.description) || '');
      const found = [];
      scan(title, !isTitleCase(title), ctx, found);
      scan(desc, true, ctx, found);
      /* one row per company: the strongest evidence it was named on */
      const best = new Map();
      for (const f of found) {
        const was = best.get(f.id);
        if (!was || RANK[f.kind] < RANK[was.kind]) best.set(f.id, f);
      }
      return Array.from(best.values());
    },
  };
}

/* does a sentence (or a quotation) begin at `s` — the start of the text, after . ! ?, or right after an opening quote */
export function sentenceStart(text, s) {
  /* a word right after an opening quote begins a quotation, which is capitalised whatever it says
     («…daily news podcast “Visa hopping” international students…» — production, 2026-10-02) */
  if (/[\p{Pi}\p{Ps}"'‘“]$/u.test(String(text).slice(0, s))) return true;
  const before = String(text).slice(0, s).replace(/[\s\p{Pi}\p{Ps}"'‘“(\[]+$/u, '');
  return before === '' || /[.!?]["'’”)\]]*$/.test(before);
}

/* the sentence the claim rests on, cut at word boundaries — at most 200 characters (the column allows 400) */
export function snippet(text, s, e) {
  const t = String(text);
  let a = Math.max(0, s - 90), b = Math.min(t.length, e + 90);
  if (a > 0) { const sp = t.indexOf(' ', a); if (sp >= 0 && sp < s) a = sp + 1; }
  if (b < t.length) { const sp = t.lastIndexOf(' ', b); if (sp > e) b = sp; }
  return ((a > 0 ? '…' : '') + t.slice(a, b).trim() + (b < t.length ? '…' : '')).slice(0, 400);
}
