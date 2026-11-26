import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* The Studio table editor issues a plain UPDATE and cannot set intmap.ai_ledger, so the guard must let the operator's own role
   through and still refuse the API roles (atlas-jobs-reliability had refused every direct write). */
test('the ai_usage count guard admits the operator and refuses the API roles', () => {
  const m = fs.readFileSync('supabase/migrations/20261202100000_ai_usage_table_editor.sql', 'utf8');
  const body = /function public\.ai_usage_count_guard\(\)[\s\S]*?\n\$\$;/.exec(m);
  assert.ok(body, 'the guard is redefined');
  assert.match(body[0], /current_user not in \('anon', 'authenticated', 'service_role', 'authenticator'\) then return null/);
  assert.match(body[0], /in \('rpc', 'admin'\) then return null/);
  assert.match(body[0], /errcode = '42501'/);
});
