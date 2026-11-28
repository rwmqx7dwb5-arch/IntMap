/* ============================================================================
 *  atlas-cited-answers · an answer's sources, in the real page
 * ----------------------------------------------------------------------------
 *  The core is run in tests/atlas-cited-answers-checks.test.mjs. This is the reader's half: a real Atlas turn,
 *  with ONLY ai-proxy played (the tests/r783-attach-recall.spec.js harness — a seeded session, the upstream
 *  replaced, everything else the product's). The model asks for two tools a reader's question would need —
 *  a query of the volcano table and the map's clock set to 1900 — and then writes an answer that repeats ONE
 *  value the query returned (read out of the tool result it was handed, as a model would) and one number that
 *  no tool returned. It holds:
 *    ① the returned value carries [n], the invented one does not, and [n] is the query's column and its record
 *    ② the line items are the border records drawn at 1900, each with its licence; the line card opens
 *    ③ the answer can be cited: the credit line names the map and every listed source
 *    ④ the copy of the reply carries the list
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

const FAKE_SESSION = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-00000000c17e', aud: 'authenticated', role: 'authenticated',
    email: 'cited.reader@example.invalid', app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Cited Reader' }, created_at: new Date().toISOString() },
};
const INVENTED = '4,321';   /* a number no tool returns: it must stay unmarked */
let page, diag, turnBodies, echoed;

/* the value a model would repeat: the first four-digit-or-longer figure in what the query tool handed back */
function valueFrom(body) {
  const outs = (Array.isArray(body.input) ? body.input : []).filter((it) => it && it.type === 'function_call_output').map((it) => String(it.output || ''));
  for (const o of outs) { const m = /"(?:observed|facts|text|summary)"[\s\S]*?(\d{1},?\d{3})/.exec(o) || /(\d,\d{3}|\d{4})\s*m\b/.exec(o); if (m) return m[1]; }
  return null;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);   /* a whole turn, then the 1900 borders drawn and their records read */
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess)); } catch { /* ignore */ }
  }, FAKE_SESSION);
  turnBodies = []; echoed = null;
  await context.route('**/functions/v1/ai-proxy', async (route) => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
    let text = '{}', extra = {};
    if (String(body.task || '') === 'atlas_turn' && body.protocol === 2) {
      turnBodies.push(body);
      const n = turnBodies.length;
      let r;
      if (n === 1) r = { turn: 'continuing', final_text: '調べます。', calls: [
        { name: 'query_data', arguments: { from: 'volcanoes', where: [{ col: 'elevM', op: '>=', value: 6000 }], show: ['elevM'], order: { col: 'elevM', dir: 'desc' }, limit: 5 } },
        { name: 'set_time', arguments: { year: 1900 } }] };
      else { echoed = valueFrom(body); r = { turn: 'final', final_text: '最も高い火山の標高は ' + (echoed || '?') + ' m です。参考までに ' + INVENTED + ' という数もあります。 ([apnews.com](https://apnews.com/article/a1))' }; }
      text = JSON.stringify({ turn: r.turn, final_text: r.final_text });
      extra = { citations: [{ url: 'https://apnews.com/article/a1', title: 'Ceasefire talks continue' }], output: (r.calls || []).map((c, i) => ({ type: 'function_call', call_id: 'c' + n + '_' + i, name: c.name, arguments: JSON.stringify(c.arguments) })), meta: { protocol: 2 } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({ text, used: 1, limit: 100, charged: true }, extra)) });
  });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-in', { timeout: 30_000 });
  await page.fill('#atlas-panel .atl-in', '6000m を超える火山で一番高いのは？ 1900年の国境も見せて');
  await page.click('#atlas-panel .atl-go');
  await expect.poll(() => turnBodies.length, { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
  /* the sources are ONE collapsed line (<details class="atl-srcs">): wait for the rows to exist, then open it as a reader would */
  await page.waitForSelector('#atlas-panel details.atl-srcs .atl-srcs-list li', { state: 'attached', timeout: 60_000 });
  await page.locator('#atlas-panel details.atl-srcs > summary').last().click();
  /* the map's half (the border records) lands after the answer */
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#atlas-panel .atl-srcs-list li[data-kind="line"]').length), { timeout: 60_000 }).toBeGreaterThan(0);
});
test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

test('① a value the query returned carries [n]; a number no tool returned does not', async () => {
  expect(echoed, 'the tool result handed to the model carried a value to repeat').toBeTruthy();
  /* the marks land with the answer's repaint, the border records with another: read after the reader's [n] is on screen, not at the instant the list is (CI's nightly
     run read the page between the two — its own failure snapshot, taken a moment later, shows the [1] beside 6,879) */
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('#atlas-panel sup.atl-srcn a').length), { timeout: 30_000 }).toBeGreaterThan(0);
  const got = await page.evaluate(() => {
    const bub = [...document.querySelectorAll('#atlas-panel .atl-srcs')].pop().closest('.atl-b');
    const sups = [...bub.querySelectorAll('sup.atl-srcn a')].map((a) => ({ n: a.getAttribute('data-atl-srcn'), before: a.parentElement.previousSibling ? a.parentElement.previousSibling.textContent.slice(-8) : '' }));
    const items = [...bub.querySelectorAll('.atl-srcs-list li')].map((li) => ({ n: li.getAttribute('data-n'), kind: li.getAttribute('data-kind'), text: li.textContent }));
    return { sups, items, html: bub.innerHTML.length };
  });
  expect(got.sups.length, JSON.stringify(got)).toBeGreaterThanOrEqual(1);
  expect(got.sups.some((s) => s.before.includes('4,321')), 'the invented number is unmarked').toBe(false);
  const item = got.items.find((i) => i.n === got.sups[0].n);
  expect(item.kind).toBe('number');
  expect(item.text).toMatch(/Smithsonian|GVP|Global Volcanism/);
});

test('② the lines are the border records of 1900, each with its licence, and the line card opens', async () => {
  const lines = await page.evaluate(() => [...document.querySelectorAll('#atlas-panel .atl-srcs-list li[data-kind="line"]')].map((li) => li.textContent));
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.join('\n')).toMatch(/1900/);
  expect(lines.some((t) => /CC|ODbL|GPL|licen|ライセンス|BY/.test(t)), lines.join('\n')).toBe(true);
  await page.locator('#atlas-panel .atl-srcs-btn[data-atl-line]').first().click();
  await page.waitForSelector('.bp-popup', { timeout: 20_000 });
});

test('③ the answer can be cited, naming the map and every listed source', async () => {
  await page.locator('#atlas-panel .atl-srcs-citebox summary').last().click();
  await page.waitForSelector('#atlas-panel .atl-srcs-citebody textarea.atl-srcs-credit', { timeout: 30_000 });
  const credit = await page.locator('#atlas-panel .atl-srcs-citebody textarea.atl-srcs-credit').last().inputValue();
  expect(credit).toMatch(/IntMap/);
  expect(credit).toMatch(/Smithsonian|GVP|Global Volcanism/);
  const ref = await page.locator('#atlas-panel .atl-srcs-citebody textarea.atl-srcs-ref').last().inputValue();
  expect(ref).toMatch(/IntMap/);
});

test('④ the visible credit line and the list are part of what Copy copies', async () => {
  const txt = await page.evaluate(() => [...document.querySelectorAll('#atlas-panel .atl-srcs')].pop().parentElement.textContent);
  expect(txt).toMatch(/この回答の出典|Sources of this answer/);
  expect(txt).toMatch(/出典表記|Credit line/);
  expect(diag.pageErrors || [], 'no page errors').toEqual([]);
});

/* (atlas-answer-sources) the page the prose cites is a source chip, the background map's credit is not counted as a source, and on a phone the first press opens the card */
test('⑤ a cited host is a chip with a card; the basemap credit is not a source; a phone press opens the card', async () => {
  const got = await page.evaluate(() => {
    const bub = [...document.querySelectorAll('#atlas-panel .atl-srcs')].pop().closest('.atl-b');
    return { chips: [...bub.querySelectorAll('a.atl-sc')].map((a) => a.getAttribute('data-host')), blue: bub.querySelectorAll('.atl-md a.atl-a').length,
      sum: bub.querySelector('details.atl-srcs > summary').textContent, mapRows: bub.querySelectorAll('.atl-srcs-list li[data-kind="map"]').length,
      h2: (() => { const h = bub.querySelector('h2.atl-h2'); return h ? parseFloat(getComputedStyle(h).fontSize) / parseFloat(getComputedStyle(bub.querySelector('.atl-md')).fontSize) : 0; })() };
  });
  expect(got.chips).toContain('apnews.com');
  expect(got.blue, 'prose carries no blue link for a host').toBe(0);
  expect(got.mapRows, 'no background credit is a row of the sources list').toBe(0);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.locator('#atlas-panel a.atl-sc').first().scrollIntoViewIfNeeded();
  await page.locator('#atlas-panel a.atl-sc').first().hover();
  await expect(page.locator('.atl-scard')).toBeVisible();
  const sourceLink = page.locator('.atl-scard .atl-scard-open');
  await expect(sourceLink).toHaveAttribute('href', 'https://apnews.com/article/a1');
  await expect(sourceLink).toHaveText('Ceasefire talks continue');
  await expect(page.locator('.atl-scard')).not.toContainText(/Open the original article|元記事を開く/);
  const card = await page.locator('.atl-scard').boundingBox();
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
});

test('⑥ confirmation stays in the answer and hands the receipt to the same and next model requests', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const jobId = '00000000-0000-4000-8000-000000000202';
  let starts = 0;
  await page.route('**/functions/v1/atlas-jobs', (route) => {
    starts++;
    return route.fulfill({ status: 202, json: { jobId, created: true, status: 'queued' } });
  });
  await page.route('**/rest/v1/atlas_jobs?*', (route) => route.fulfill({
    json: [{ id: jobId, title: 'Confirmation regression', status: 'queued', tasks_total: 1 }],
  }));
  await page.route('**/rest/v1/atlas_job_tasks?*', (route) => route.fulfill({ json: [] }));

  const aiEndpoint = '**/functions/v1/ai-proxy';
  const input = page.locator('#atlas-panel .atl-in');
  const send = page.locator('#atlas-panel .atl-go');
  for (const approve of [true, false]) {
    const beforeStarts = starts;
    const model = [];
    const staleAnswer = Promise.withResolvers();
    const callId = approve ? 'confirm-run' : 'confirm-decline';
    const serveTurn = async (route) => {
      const body = route.request().postDataJSON();
      const output = [], meta = { protocol: 2 };
      let text = '{}';
      if (body.task === 'atlas_turn' && body.protocol === 2) {
        model.push(body);
        if (model.length === 1) {
          text = JSON.stringify({ turn: 'continuing', final_text: 'I will ask before starting the background job.' });
          meta.webUsed = true;
          output.push({ type: 'function_call', call_id: callId, name: 'run_capability',
            arguments: JSON.stringify({ id: 'jobs.start', args: { title: 'Confirmation regression', tasks: [{ goal: 'Read one public map source' }] } }) });
        } else {
          const raw = body.input.find(it => it.type === 'function_call_output' && it.call_id === callId)?.output;
          const result = raw && JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
          const job = result?.details?.job;
          if (approve && result?.code === 'needs_confirm') await staleAnswer.promise;
          const say = job ? `Job ${job.id} is ${job.status}.`
            : result?.code === 'confirmation_declined' ? 'You declined the operation.' : 'The job has not started.';
          text = JSON.stringify({ turn: 'final', final_text: say });
        }
      }
      await route.fulfill({ status: 200, json: { text, used: 1, limit: 100, charged: true, output, meta } });
    };
    await page.route(aiEndpoint, serveTurn);
    try {
      await input.fill('Start the background job once I confirm.');
      await send.click();
      const answer = page.locator('#atlas-panel .atl-b.a').last();
      const choice = answer.locator('[data-confirm="' + (approve ? 'run' : 'no') + '"]');
      await expect(choice).toBeVisible({ timeout: 12_000 });
      expect(starts).toBe(beforeStarts);
      await choice.evaluate(button => button.click());
      await expect(choice).toBeEnabled();
      await choice.click({ timeout: 12_000 });

      if (approve) {
        const card = answer.locator(`[data-atl-job="${jobId}"]`);
        await expect(card).toBeVisible();
        staleAnswer.resolve();
        await expect(answer.locator('.atl-md')).toContainText(`Job ${jobId} is queued.`);
        await expect(card).toContainText(/waiting|待機中/);
        expect(starts).toBe(beforeStarts + 1);
      } else {
        await expect(answer.locator('.atl-md')).toContainText('You declined the operation.');
        expect(starts).toBe(beforeStarts);
      }
      await expect(choice).toHaveCount(0);
      await expect(send).not.toHaveClass(/busy/);
      await input.fill('What happened to my background job?');
      await send.click();
      await expect.poll(() => model.length).toBeGreaterThanOrEqual(3);
      await expect(send).not.toHaveClass(/busy/);
      const prefix = 'IntMap confirmation receipt: ';
      const saved = model[2].input.findLast(it => typeof it.content === 'string' && it.content.startsWith(prefix));
      expect(saved).toBeDefined();
      const nextReceipt = JSON.parse(saved.content.slice(prefix.length));
      if (approve) expect(nextReceipt.details.job).toMatchObject({ id: jobId, status: 'queued' });
      else expect(nextReceipt.code).toBe('confirmation_declined');
    } finally {
      staleAnswer.resolve();
      await page.unroute(aiEndpoint, serveTurn);
    }
  }
});
