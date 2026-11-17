/* IntMap · csv-cell — the one rule for a text cell IntMap writes into a CSV a spreadsheet will open
   (moved from js/quest-class.js, security-review-nov, so every CSV writer uses it instead of a copy).
   A cell a spreadsheet would read as a formula — a student typed «=HYPERLINK(…)» as their name, a label that
   begins with «=» — is kept as text: a value that begins with = + - @, a tab or a carriage return gets a leading
   apostrophe (OWASP «CSV injection»). Numbers are ours and are written as numbers; only text is guarded. */
export function csvText(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
