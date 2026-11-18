// The admin-MFA migration rewrites every policy that decides admin rights some other way, by
// matching the deparsed expression (block 3), and refuses to finish while one is left (block 4).
// Its first run against production stopped in block 4 on seven policies whose deparsed shape
// block 3 did not know. supabase/tests/50 cannot see that class (the repository has no such
// policy), so this test runs the migration's own patterns on production's deparsed text.
//
// Observed 2026-11-18 on production (`select qual from pg_policies`), verbatim. Expire: when the
// migration has been applied in production, these strings are history, not a fixture to refresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261118130000_admin_needs_mfa_session.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const block3 = sql.slice(sql.indexOf('-- ── 3.'), sql.indexOf('-- ── 4.'));

// SQL string literals joined by `||` or by adjacency; `uid` is substituted where `|| uid ||` appears.
function constant(name) {
  const m = block3.match(new RegExp(`${name} constant text :=([\\s\\S]*?);\\n`));
  assert.ok(m, `${name} is declared in block 3`);
  return m[1];
}
function evalLiteral(expr, env) {
  let out = '';
  // A quoted literal, or a name that follows `||` (a comment between the literals holds neither).
  const re = /'((?:[^']|'')*)'|\|\|\s*(\w+)\s*(?=\|\|)/g;
  let t;
  while ((t = re.exec(expr))) out += t[1] !== undefined ? t[1].replace(/''/g, "'") : env[t[2]];
  return out;
}
const uid = evalLiteral(constant('uid'), {});
const patterns = {
  exists: new RegExp(evalLiteral(constant('re_exists'), { uid }), 'g'),
  inList: new RegExp(evalLiteral(constant('re_in'), {}), 'g'),
  byUid: new RegExp(evalLiteral(constant('re_uid'), { uid }), 'g'),
};
const rewrite = (s) => s.replace(patterns.exists, 'public.is_admin()').replace(patterns.inList, 'public.is_admin()').replace(patterns.byUid, 'public.is_admin()');

const production = {
  'Allow admins to delete any comment': '(auth.uid() IN ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.is_admin = true)))',
  'Allow admins to delete any post': '(auth.uid() IN ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.is_admin = true)))',
  'comments admin delete': '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))',
  'posts admin delete': '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))',
  'reports admin read': '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))',
  'feedback_delete_admin': '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND p.is_admin)))',
  'feedback_select_admin': '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = auth.uid()) AND p.is_admin)))',
};

test('every production policy that stopped the first run is rewritten to public.is_admin()', () => {
  for (const [name, qual] of Object.entries(production)) {
    assert.equal(rewrite(qual), 'public.is_admin()', name);
  }
});

test('the shapes the repository and profiles_select already had still rewrite, parentheses kept paired', () => {
  const sub = '(EXISTS ( SELECT 1\n   FROM profiles p\n  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_admin)))';
  assert.equal(rewrite(sub), 'public.is_admin()');
  assert.equal(rewrite(`((auth.uid() = user_id) OR ${sub})`), '((auth.uid() = user_id) OR public.is_admin())');
  assert.equal(rewrite('((auth.uid() = id) OR is_admin(auth.uid()))'), '((auth.uid() = id) OR public.is_admin())');
});

test('a policy that already asks is_admin() is left alone', () => {
  const done = '( SELECT is_admin() AS is_admin)';
  assert.equal(rewrite(done), done);
});
