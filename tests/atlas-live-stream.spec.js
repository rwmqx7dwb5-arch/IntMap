/* ============================================================================
 *  atlas-live-stream · the page, while the turn streams
 * ----------------------------------------------------------------------------
 *  The server half is run in tests/atlas-live-stream-checks.test.mjs. This is the reader's half,
 *  in the real page: the session is seeded the way tests/r783-attach-recall.spec.js does (#R753 —
 *  supabase-js answers getSession() from localStorage), and ONLY ai-proxy is played — by a fetch
 *  wrapper installed before the page's own scripts, because Playwright's route.fulfill delivers a
 *  body all at once and what is under test here is what happens BETWEEN its bytes.
 *
 *  The upstream speaks exactly ai-proxy's wire (supabase/functions/_shared/ai-stream.js): `open`,
 *  previews, one `done` carrying {status, body}. Everything else — js/ai-core.js, js/atlas-agent.js,
 *  js/atlas-console.js, js/atlas-live.js, js/atlas-progress.js, the executor — is the product's.
 *
 *  It holds, in the page:
 *    ① a note on the way («まず…», `turn:"continuing"`) goes to the trace, never the reply bubble;
 *    ② the answer is visible WHILE it is written, and is replaced — not appended to — by the answer
 *       the loop returns; the operation's row is ticked in the trace, and while the trace can be seen
 *       the map carries no progress of its own (atlas-progress-one);
 *    ③ a stop mid-sentence keeps the draft, marked unfinished, and records no answer;
 *    ④ a stream that breaks before `done` is asked again once, plainly, and the turn still answers;
 *    ⑤ (atlas-plan-on-map) a plan Atlas declared stands in the work trace with each step's OBSERVED
 *       state, stays when the turn ends, goes back to what its step drew, and is put in front of the model;
 *    ⑥ (atlas-os) the turns above are filed in the investigation notebook — answered ones only, with the
 *       question, the answer and the operation — and WRITTEN TO INDEXEDDB (what survives a reload);
 *       「地図を再現」 puts the camera back through the dispatch, and the entry is handed on as Markdown.
 *       They ride on this file's turns rather than on a page of their own: a second logged-in boot cost
 *       52 s measured, against 4 s of headroom in the whole-suite budget (scripts/test-budget.mjs).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

const FAKE_SESSION = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-0000000005e1', aud: 'authenticated', role: 'authenticated',
    email: 'live.reader@example.invalid', app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Live Reader' }, created_at: new Date().toISOString() },
};
const NOTE = 'まず東京へ移動します。';
const ANSWER = '東京は日本の**首都**で、関東平野の南部、東京湾の北西岸にあります。';

/* The upstream, installed in the page before anything else runs. `window.__live` is its control:
   `mode` picks the script, `hold` keeps step 2 from sending `done` until the test releases it. */
function upstream(arg) {
  const { NOTE, ANSWER } = arg;
  const real = window.fetch.bind(window);
  const enc = new TextEncoder();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ev = (e, d) => enc.encode('event: ' + e + '\ndata: ' + JSON.stringify(d) + '\n\n');
  window.__live = { mode: 'normal', n: 0, bodies: [], hold: true };
  window.fetch = async (u, init) => {
    const s = String(u && u.url ? u.url : u);
    if (!/functions\/v1\/ai-proxy/.test(s)) return real(u, init);
    let b = {}; try { b = JSON.parse(init.body); } catch (_) { b = {}; }
    const L = window.__live;
    if (b.task !== 'atlas_turn') return new Response(JSON.stringify({ text: '{}', used: 1, limit: 100, charged: true, meta: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    const n = ++L.n;
    L.bodies.push({ stream: b.stream === true, plan: JSON.stringify(b.input || []).indexOf('[YOUR PLAN') >= 0 });
    const tool = (b.tools || []).map((t) => t.name).find((x) => /fly|view|camera/i.test(x)) || 'find_capability';
    const call = { type: 'function_call', call_id: 'c' + n, name: tool, arguments: JSON.stringify(/find/.test(tool) ? { query: 'Tokyo' } : { place: 'Tokyo' }) };
    const step1 = JSON.stringify({ turn: 'continuing', answer_mode: 'map', final_text: NOTE });
    const step2 = JSON.stringify({ turn: 'final', answer_mode: 'mixed', final_text: ANSWER });
    /* step 1 is the reply to the question alone; a request that carries a call's output is step 2 */
    const first = !(b.input || []).some((it) => it && it.type === 'function_call_output');
    const text = first ? step1 : step2;
    /* ⑤ Atlas declares a plan in the same reply as the call of its step 1 */
    const planCall = { type: 'function_call', call_id: 'p' + n, name: 'plan', arguments: JSON.stringify({ goal: '東京を示す', steps: ['東京へ移動する', '答える'], current: 1 }) };
    const done = { status: 200, body: { text, used: 1, limit: 100, charged: true, meta: { protocol: 2 }, output: first ? (L.plan ? [planCall, call] : [call]) : [], citations: [] } };
    /* ④ the retry is asked plainly — answer it plainly */
    if (b.stream !== true) return new Response(JSON.stringify(done.body), { status: 200, headers: { 'content-type': 'application/json' } });
    const body = new ReadableStream({ async start(c) {
      c.enqueue(ev('open', { protocol: 2 }));
      c.enqueue(ev('think', { d: first ? '**東京の位置を確かめる**' : '**答えをまとめる**' }));
      await sleep(20);
      /* (atlas-plan-on-map) 4 ms a delta (was 25) and 20 ms before the text (was 150): every claim about the draft is made while `hold` keeps
         `done` back, so the pace only has to leave the deltas apart — the time went to ⑤ (test budget) */
      for (let i = 0; i < text.length; i += 4) { c.enqueue(ev('text', { d: text.slice(i, i + 4) })); await sleep(4); }
      if (first) {
        c.enqueue(ev('call', { id: call.call_id, name: call.name }));
        if (L.mode === 'broken') { L.mode = 'normal'; c.error(new TypeError('network error')); return; }
      } else {
        while (L.hold && !L.released) await sleep(50);
        L.released = false;
      }
      c.enqueue(ev('done', done)); c.close();
    } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}

let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState(), acceptDownloads: true });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess));
    } catch { /* ignore */ }
  }, FAKE_SESSION);
  await context.addInitScript(upstream, { NOTE, ANSWER });
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-in', { timeout: 30_000 });
});
test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

const ask = async (q) => {
  await page.fill('#atlas-panel .atl-in', q);
  await page.click('#atlas-panel .atl-go');
};
const lastReply = () => page.locator('#atlas-panel .atl-b.a').last();

test('①② the note goes to the trace, the answer is shown while written and then replaced, the trace follows the operation', async () => {
  await ask('東京はどこ？');
  /* ① the note, live, in the trace — and not in the reply */
  await expect(page.locator('#atlas-panel .atl-trace-row.say').last()).toContainText(NOTE, { timeout: 20_000 });
  await expect(lastReply().locator('.atl-draft')).toHaveCount(0);
  /* the thinking row said what was decided before it ran (the reasoning headline stood there first and
     gave way to 「次: …」 the moment the call was named — what stays is the statement of intent) */
  await expect(page.locator('#atlas-panel .atl-trace-row').filter({ hasText: /(次|Next): / })).toHaveCount(1);
  /* ② step 2 holds before `done`: the draft is on screen, live, before any answer exists */
  const draft = lastReply().locator('.atl-draft.live');
  await expect(draft).toContainText('関東平野', { timeout: 20_000 });
  await expect(draft.locator('.atl-caret')).toHaveCount(1);
  /* the trace ticked the operation — and, the trace being on screen, nothing on the map said it again
     (atlas-progress-one: four indicators for one turn was the defect) */
  await expect(page.locator('#atlas-panel .atl-trace').last().locator('.atl-trace-rows > .atl-trace-row.ok')).not.toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.atl-hud.on')).toHaveCount(0);
  await page.evaluate(() => { window.__live.released = true; });
  /* the answer replaces the draft: one copy of the sentence, no draft, no caret */
  await expect(lastReply().locator('.atl-draft')).toHaveCount(0, { timeout: 20_000 });
  await expect(lastReply()).toContainText('関東平野の南部');
  expect(await lastReply().evaluate((el) => el.textContent.split('関東平野の南部').length - 1)).toBe(1);
  const lat = await page.evaluate(() => window.IntMapAtlasDebug.latency().slice(-1)[0]);
  expect(lat.how).toBe('answered');
  expect(lat.streamed).toBe(true);
  expect(lat.firstVisible).toBeLessThan(lat.firstAnswer);
  expect(lat.firstAnswer).toBeLessThan(lat.answer);
  expect(await page.evaluate(() => window.__live.bodies.every((b) => b.stream))).toBe(true);
});

test('③ a stop mid-sentence keeps the draft, marked unfinished, and records no answer', async () => {
  await ask('もう一度');
  const draft = lastReply().locator('.atl-draft');
  await expect(draft).toContainText('関東平野', { timeout: 20_000 });
  await page.click('#atlas-panel .atl-go');   /* the busy send button is Stop */
  await expect(lastReply().locator('.atl-draft.stopped')).toHaveCount(1, { timeout: 10_000 });
  await expect(lastReply().locator('.atl-cancelled')).toHaveCount(1);
  await expect(lastReply().locator('.atl-caret')).toHaveCount(0);
  const lat = await page.evaluate(() => window.IntMapAtlasDebug.latency().slice(-1)[0]);
  expect(lat.how).toBe('cancelled');
  expect(lat.answer).toBeUndefined();
  await page.evaluate(() => { window.__live.released = true; });
});

test('④ a stream that breaks before done is asked again once, plainly, and the turn answers', async () => {
  /* (atlas-plan-on-map) this turn also declares a plan — ⑤ reads it, so the plan costs no turn of its own */
  await page.evaluate(() => { window.__live.mode = 'broken'; window.__live.bodies = []; window.__live.hold = false; window.__live.plan = true; });
  await ask('三回目');
  await expect(lastReply()).toContainText('関東平野の南部', { timeout: 30_000 });
  await expect(lastReply().locator('.atl-draft')).toHaveCount(0);
  const bodies = await page.evaluate(() => window.__live.bodies.map((b) => b.stream));
  expect(bodies.slice(0, 2)).toEqual([true, false]);   /* the broken stream, then the one plain retry */
  expect(bodies.filter((x) => x === false).length).toBe(1);
});

test('⑤ the plan Atlas declared in ④ stands in the work trace with its observed states, outlives the turn, and goes back to what a step drew', async () => {
  const trace = page.locator('#atlas-panel .atl-trace').filter({ has: page.locator('.atl-plan') });
  await expect(trace).toHaveCount(1);                              /* one plan, in one place */
  await expect(page.locator('.atl-hud .atl-plan, .atl-hud-plan')).toHaveCount(0);   /* and not on the map */
  const steps = trace.locator('.atl-plan .atl-plan-step');
  await expect(steps).toHaveCount(2);
  const snap = await page.evaluate(() => window.IntMapAtlasDebug.plan());
  expect(snap.goal).toBe('東京を示す');
  await expect(trace.locator('.atl-plan-goal')).toHaveText('東京を示す');
  expect(snap.steps[0].ops.length).toBe(1);                       /* the call made after the plan call serves step 1 */
  expect(snap.steps[1].state).toBe('pending');                     /* never made current: not started */
  /* the state is the executor's verdict — and only `completed` wears the tick (the trace's own mark) */
  await expect(steps.nth(0)).toHaveClass(new RegExp('s-' + snap.steps[0].ops[0].state));
  expect(await steps.nth(0).evaluate((el) => el.classList.contains('ok'))).toBe(snap.steps[0].ops[0].state === 'completed');
  /* the model was shown the plan on the step after it was declared (④: the broken stream, its plain retry, step 2) */
  expect(await page.evaluate(() => window.__live.bodies.map((b) => b.plan))).toEqual([false, false, true]);
  /* the turn ended: the trace folded, the plan's head (goal and N/M) still stands, the steps open with the trace */
  await expect(trace.locator('.atl-plan-count')).toBeVisible();
  await expect(steps.nth(0)).toBeHidden();
  await trace.locator('.atl-trace-head').click();
  await expect(steps.nth(0)).toBeVisible();
  /* the way back to what step 1 drew: the camera is sent elsewhere and the step is pressed */
  await expect(steps.nth(0)).toHaveClass(/(^|\s)can(\s|$)/);
  await page.evaluate(() => { window.IntMapGeoEngine.camera.jumpTo({ center: [-40, -30], zoom: 2 }); });
  await steps.nth(0).click();
  await page.waitForFunction(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return Math.abs(c.lng - 139.7) < 3 && Math.abs(c.lat - 35.7) < 3; }, null, { timeout: 10_000 });
});

test('⑥ (atlas-os) the answered turns are in the notebook and in IndexedDB; a replay puts the camera back; Markdown carries them', async () => {
  /* ① filed: the two answered turns (①② and ④), not the stopped one (③) */
  await expect(page.locator('#atlas-panel .atl-nb-strip .atl-nb-n')).toHaveText('2', { timeout: 15_000 });
  /* ② written where a reload reads it — the database itself, opened fresh, not the page's cache */
  const stored = await page.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('intmap-atlas-notebook');
    rq.onsuccess = () => { const g = rq.result.transaction('entries').objectStore('entries').getAll(); g.onsuccess = () => res(g.result.map((e) => ({ q: e.question, a: e.answer, steps: e.steps.length, camera: e.view && e.view.camera }))); g.onerror = () => rej(g.error); };
    rq.onerror = () => rej(rq.error);
  }));
  expect(stored.map((e) => e.q).sort()).toEqual(['三回目', '東京はどこ？']);
  expect(stored.every((e) => e.a.indexOf('関東平野の南部') >= 0 && e.steps > 0 && e.camera)).toBe(true);
  await page.click('#atlas-panel .atl-nb-strip');
  const item = page.locator('#atlas-panel .atl-nb .atl-nb-item').filter({ hasText: '東京はどこ？' });
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(page.locator('#atlas-panel .atl-nb-dq')).toHaveText('東京はどこ？');
  await expect(page.locator('#atlas-panel .atl-nb-ans')).toContainText('関東平野');
  /* ③ replay: the camera is sent away, and comes back to where the answer left it */
  const want = stored.find((e) => e.q === '東京はどこ？').camera;
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [-40, -30], zoom: 2 }));
  await page.click('#atlas-panel .atl-nb-act[data-act="replay"]');
  await expect(page.locator('#atlas-panel .atl-nb')).toBeHidden();
  await expect(page.locator('#atlas-panel .atl-b.u').last()).toContainText('東京はどこ？', { timeout: 10_000 });
  await page.waitForFunction((w) => { const c = window.IntMapAtlasState.captureSections(['camera']).camera;
    return c && Math.abs(c.lng - w.lng) < 1e-3 && Math.abs(c.lat - w.lat) < 1e-3 && Math.abs(c.zoom - w.zoom) < 1e-2; }, want, { timeout: 30_000 });
  /* ④ handed on: the strip opens the list again (not the entry last read), and the entry exports as Markdown */
  await page.click('#atlas-panel .atl-nb-strip');
  await page.locator('#atlas-panel .atl-nb .atl-nb-item').filter({ hasText: '東京はどこ？' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#atlas-panel .atl-nb-act[data-act="md"]')]);
  expect(dl.suggestedFilename()).toMatch(/^intmap-atlas-notebook-\d{4}-\d{2}-\d{2}\.md$/);
  const fs = await import('node:fs');
  const md = fs.readFileSync(await dl.path(), 'utf8');
  expect(md).toContain('## 東京はどこ？');
  expect(md).toContain('関東平野の南部');
});
