import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const jobId = '00000000-0000-4000-8000-000000000202';
const session = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-000000000203', aud: 'authenticated', role: 'authenticated',
    email: 'confirmation.reader@example.invalid', app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Confirmation Reader' }, created_at: '2026-11-28T00:00:00Z' },
};

for (const approve of [true, false]) {
  test(`the confirmation stays available and hands back the ${approve ? '202 receipt' : 'decline'}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ storageState: seededStorageState() });
    try {
      await installHermeticRouting(context);
      await context.addInitScript((sess) => {
        localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
        localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess));
      }, session);
      let starts = 0;
      const model = [];
      let releaseStaleAnswer;
      const staleAnswer = new Promise((resolve) => { releaseStaleAnswer = resolve; });
      await context.route('**/functions/v1/atlas-jobs', (route) => {
        starts++;
        return route.fulfill({ status: 202, json: { jobId, created: true, status: 'queued' } });
      });
      await context.route('**/rest/v1/atlas_jobs?*', (route) => route.fulfill({
        json: [{ id: jobId, title: 'Confirmation regression', status: 'queued', tasks_total: 1 }],
      }));
      await context.route('**/rest/v1/atlas_job_tasks?*', (route) => route.fulfill({ json: [] }));
      await context.route('**/functions/v1/ai-proxy', async (route) => {
        const body = route.request().postDataJSON();
        const extra = { output: [], meta: { protocol: 2 } };
        let text = '{}';
        if (body.task === 'atlas_turn' && body.protocol === 2) {
          model.push(body);
          const receipt = (body.input || []).find((it) => it.type === 'function_call_output' && it.call_id === 'confirm-job');
          if (model.length === 1) {
            text = JSON.stringify({ turn: 'continuing', final_text: 'I will ask before starting the background job.' });
            extra.meta.webUsed = true;
            extra.output = [{ type: 'function_call', call_id: 'confirm-job', name: 'run_capability',
              arguments: JSON.stringify({ id: 'jobs.start', args: { title: 'Confirmation regression', tasks: [{ goal: 'Read one public map source' }] } }) }];
          } else {
            const raw = receipt?.output;
            const result = raw && JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
            const job = result?.details?.job;
            if (approve && result?.code === 'needs_confirm') await staleAnswer;
            const say = job ? `Job ${job.id} is ${job.status}.` : result?.code === 'confirmation_declined' ? 'You declined the operation.' : 'The job has not started.';
            text = JSON.stringify({ turn: 'final', final_text: say });
          }
        }
        await route.fulfill({ status: 200, json: { text, used: 1, limit: 100, charged: true, ...extra } });
      });
      const page = await context.newPage();
      await page.goto('/', { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60_000 });
      await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
      await page.evaluate(() => window.IntMapConsole.open());
      const input = page.locator('#atlas-panel .atl-in');
      const send = page.locator('#atlas-panel .atl-go');
      const question = 'Start the background job once I confirm.';
      await input.fill(question);
      await send.click();
      const answer = page.locator('#atlas-panel .atl-b.a').last();
      const choice = answer.locator('[data-confirm="' + (approve ? 'run' : 'no') + '"]');
      await expect(choice).toBeVisible({ timeout: 12_000 });
      expect(starts).toBe(0);
      await expect(choice).toBeEnabled();
      await choice.evaluate(button => button.click());
      await expect(choice).toBeEnabled();
      await choice.click({ timeout: 12_000 });

      if (approve) {
        const card = answer.locator(`[data-atl-job="${jobId}"]`);
        await expect(card).toBeVisible();
        releaseStaleAnswer();
        await expect(answer.locator('.atl-md')).toContainText(`Job ${jobId} is queued.`);
        await expect(card).toContainText(/waiting|待機中/);
        expect(starts).toBe(1);
      } else {
        await expect(answer.locator('.atl-md')).toContainText('You declined the operation.');
        expect(starts).toBe(0);
      }
      await expect(choice).toHaveCount(0);
      await expect(send).not.toHaveClass(/busy/);
      await input.fill('What happened to my background job?');
      await send.click();
      await expect.poll(() => model.length).toBeGreaterThanOrEqual(3);
      const prefix = 'IntMap confirmation receipt: ';
      const saved = model[2].input.find(it => typeof it.content === 'string' && it.content.startsWith(prefix));
      expect(saved).toBeDefined();
      const nextReceipt = JSON.parse(saved.content.slice(prefix.length));
      if (approve) expect(nextReceipt.details.job).toMatchObject({ id: jobId, status: 'queued' });
      else expect(nextReceipt.code).toBe('confirmation_declined');
    } finally {
      await context.close();
    }
  });
}
