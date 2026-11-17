/* A literal string as a RegExp source. Every metacharacter is escaped, and the BACKSLASH first among them: a replace
   that escapes `.` or `(` but not the backslash turns an input that already holds one into a different pattern (CodeQL
   js/incomplete-sanitization). `/` is escaped too so the result is also safe inside a regex literal. */
export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}
