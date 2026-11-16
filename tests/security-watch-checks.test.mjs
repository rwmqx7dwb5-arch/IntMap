/* ============================================================================
 *  security-watch — the security checks are a standing activity, not a one-off sweep
 * ----------------------------------------------------------------------------
 *  What is held here (dev-notes/2026-11-16-security-watch.md):
 *   1. security.yml runs on a DAILY schedule, and a red scheduled run reaches a person: the
 *      watch job needs both scanning jobs, runs on the schedule even when they fail, and hands the
 *      result to the one incident-issue mechanism (scripts/ci-incident-issue.cjs).
 *   2. The public security page states the cadence the workflow actually has — read from the cron,
 *      so the sentence cannot outlive a schedule change.
 *   3. Two of the CodeQL findings fixed in the same change, by behaviour: the dev server's directory
 *      redirect cannot name another host, and the Hong Kong reader decodes entities once.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { load as yamlLoad } from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wf = yamlLoad(readFileSync(join(ROOT, '.github/workflows/security.yml'), 'utf8'));
const on = wf.on || wf[true];

test('security.yml is scheduled daily and its red scheduled run opens the incident issue', () => {
  const crons = on.schedule.map((s) => s.cron.trim().split(/\s+/));
  assert.ok(crons.some(([, , dom, mon, dow]) => dom === '*' && mon === '*' && dow === '*'),
    `a daily cron is required — an advisory is published against unchanged code; got ${JSON.stringify(on.schedule)}`);
  const watch = Object.values(wf.jobs).find((j) => (j.steps || []).some((s) => /ci-incident-issue\.cjs/.test(s.with?.script || '')));
  assert.ok(watch, 'a job hands the scheduled result to scripts/ci-incident-issue.cjs');
  const scanners = Object.keys(wf.jobs).filter((k) => wf.jobs[k] !== watch);
  assert.deepEqual([...watch.needs].sort(), scanners.sort(), 'the watch waits for every scanning job in the workflow');
  assert.match(watch.if, /always\(\)/, 'it runs when a scanning job FAILED — that is the case it exists for');
  assert.match(watch.if, /schedule/, 'and only for the scheduled run (a PR already shows its own red)');
  assert.equal(watch.permissions.issues, 'write');
  assert.equal(watch.permissions['security-events'], 'read');
});

test('the security page states the cadence the workflow has', () => {
  const dow = on.schedule.some((s) => s.cron.trim().split(/\s+/)[4] === '*');
  for (const [file, daily, weekly] of [['security.html', 'Every day and on every change', 'Every week and on every change'],
    ['ja/security.html', '毎日と変更のたびに', '毎週と変更のたびに']]) {
    const page = readFileSync(join(ROOT, file), 'utf8');
    assert.ok(page.includes(dow ? daily : weekly), `${file} says the cadence the cron has`);
    assert.ok(!page.includes(dow ? weekly : daily), `${file} does not also say the other one`);
  }
});

test('the dev server redirects a directory only within itself', async () => {
  const proc = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--port', '0'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const port = await new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error('serve.mjs did not come up')), 15000);
      let out = '';
      proc.stdout.on('data', (d) => { out += d; const m = /static server on http:\/\/[^\s:/]+:(\d+)\//.exec(out); if (m) { clearTimeout(t); ok(Number(m[1])); } });
      proc.on('error', no);
    });
    /* raw paths: fetch() would rewrite `\` to `/` before sending, which is the browser's reading this guards */
    for (const path of ['/data', '//data', '/%5Cdata', '/%5C%5Cdata', '/%2F%5Cdata']) {
      const { status, location } = await new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path }, (r) => {
        r.resume(); ok({ status: r.statusCode, location: r.headers.location });
      }).on('error', no));
      assert.equal(status, 301, `${path} is a directory`);
      assert.equal(location, '/data/', `${path} → ${location}: a Location may not begin with // or /\\ (another host)`);
    }
  } finally { proc.kill(); }
});

test('the Hong Kong reader decodes each entity once', async () => {
  const { unescape } = await import('../scripts/elections/hk.mjs');
  assert.equal(unescape('A &amp;lt;b&amp;gt; &amp; C&nbsp;D&#39;s<br/>x'), 'A &lt;b&gt; & C D’s x');
});
