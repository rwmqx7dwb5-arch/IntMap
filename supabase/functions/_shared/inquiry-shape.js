// ============================================================================
//  IntMap · the shape of an organisation's enquiry  (sales-channels)
// ----------------------------------------------------------------------------
//  ONE DECLARATION, THREE READERS:
//    · supabase/functions/reader-reports/index.ts — validates a { kind: 'inquiry' } body against it
//      before writing public.org_inquiries as the service role;
//    · scripts/org-pages.mjs — generates the contact form's choices from it (en + jp labels live in
//      scripts/org-pages-text.mjs, keyed by these words);
//    · supabase/migrations/20261003150000_org_inquiries.sql — the table's CHECK constraints are the
//      database's outer bound on the same words and lengths.
//  tests/sales-channels-checks.test.mjs reads the migration and holds all three equal, so a word added
//  here and not there (or the reverse) is a red test, not an enquiry the database refuses in production.
//
//  ⚠ THE REPLY ADDRESS IS THE ONE THE SENDER TYPED, even when they are signed in: an organisation is
//  answered where it reads mail, which need not be the IntMap account's address. `user_id` is still
//  the verified account's (reader-reports decides it, never the body).
//  ⚠ SPAM. Besides the shared buckets (reader-reports), the form carries one field no person sees
//  (HONEYPOT — hidden by css/org-pages.css, out of the tab order, aria-hidden). A body that fills it is
//  refused 400 like any other malformed body; it is never acknowledged as stored, because it was not.
//
//  Plain JS without a Deno or DOM dependency: Node (the generator and the tests) imports it as is.
// ============================================================================

export const INQUIRY = Object.freeze({
  /* who is writing — one introduction page each, except `supporter` (support.html) and `other` */
  audiences: Object.freeze(['newsroom', 'education', 'research', 'supporter', 'other']),
  /* what they want — `licence` is LICENSE §6 «to obtain a commercial license, contact the copyright
     holder»; `supporter_listing` is a supporter asking to be named on support.html */
  purposes: Object.freeze(['embed', 'classroom', 'data', 'licence', 'partnership', 'supporter_listing', 'other']),
  honeypot: 'website_confirm',
});

/* Canonical: the CHECK constraints of public.org_inquiries (the migration above) — restated so that an
   over-long field is answered 400 before the database is asked. */
export const INQUIRY_LIMITS = Object.freeze({
  name: 120, email: 254, organization: 200, role: 120, website: 400, country: 80, message: 5000, page: 400, lang: 16,
});

/* An address the way the table's CHECK reads one (something@something), within its length. Deliberately
   no stricter: a reply that bounces costs the admin one look; refusing a real address loses the enquiry. */
export function isReplyAddress(s) {
  return typeof s === 'string' && s.length >= 3 && s.length <= INQUIRY_LIMITS.email && /^[^\s@]+@[^\s@]+$/.test(s);
}
