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
 *    ② the reply that would end the turn is visible WHILE it is written — in the trace, as a candidate, never in the answer's
 *       place while the turn can still hand it back (atlas-completion-verdict) — and the answer the loop returns takes its place
 *       once: the candidate's row goes and the sentence is in the reply exactly once; the operation's row is ticked in the trace,
 *       and while the trace can be seen the map carries no progress of its own (atlas-progress-one);
 *    ③ a stop mid-sentence keeps what was written, readable and marked unfinished, and records no answer;
 *    ④ a stream that breaks before `done` is asked again once, plainly, and the turn still answers;
 *    ⑤ (atlas-plan-on-map) a plan Atlas declared stands in the work trace with each step's OBSERVED
 *       state, stays when the turn ends, goes back to what its step drew, and is put in front of the model;
 *    ⑥ (notebook-hidden) the investigation notebook is not shown (js/atlas-notebook-store.js NOTEBOOK_SHOWN — the reader,
 *       2026-10-04: 「機能だけ残すけど、いったんユーザーには存在せず、見えないように。」): after the answered turns above there
 *       is no notebook strip and no notebook button in the panel, and NOTHING NEW IS WRITTEN to its database — a reader is
 *       not recorded by a feature they cannot see. The notebook's own logic (filing, replay, Markdown) is held by
 *       tests/atlas-os-checks.test.mjs against the shown build (tests/helpers/notebook-shown.mjs); when NOTEBOOK_SHOWN goes back
 *       to true, this test's earlier form (the strip counts 2, IndexedDB holds both, replay and Markdown) is the one to restore —
 *       dev-notes/2026-10-04-notebook-hidden.md names the commit.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
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
    if (b.task === 'vision_read' && L.mapMarkerFixture) {
      L.mapMarkerCalls.push({ prompt: JSON.parse(b.prompt), imageCount: b.images.length, webMode: b.webMode });
      const body = { text: JSON.stringify({ marks: L.mapMarkerFixture }), used: 1, limit: 100,
        meta: { modelServed: 'source-markers-fixture' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
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
  await expect(lastReply()).not.toContainText(/Done\.|完了しました。/);
  /* (2026-11-26) the statement of intent (「次: …」) stands in the head beside the live word while the call is being decided and goes when the operation starts —
     it is not a history row any more, so it is not asserted here (tests/atlas-progress-display-checks.test.mjs ① covers that the wait leaves no row) */
  /* ② step 2 holds before `done`: the candidate is on screen, live, in the trace — and NOT in the answer's place */
  const cand = page.locator('#atlas-panel .atl-trace-row.say').last();
  await expect(cand).toContainText('関東平野', { timeout: 20_000 });
  await expect(lastReply().locator('.atl-draft')).toHaveCount(0);
  /* the trace ticked the operation — and, the trace being on screen, nothing on the map said it again
     (atlas-progress-one: four indicators for one turn was the defect) */
  await expect(page.locator('#atlas-panel .atl-trace').last().locator('.atl-trace-rows .atl-trace-row.ok')).not.toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.atl-hud.on')).toHaveCount(0);
  await page.evaluate(() => { window.__live.released = true; });
  /* the answer takes the candidate's place: one copy of the sentence, the candidate's row gone, no draft */
  await expect(lastReply()).toContainText('関東平野の南部', { timeout: 20_000 });
  await expect(lastReply().locator('.atl-draft')).toHaveCount(0);
  await expect(page.locator('#atlas-panel .atl-trace-row.say', { hasText: '関東平野の南部' })).toHaveCount(0);
  expect(await lastReply().evaluate((el) => el.textContent.split('関東平野の南部').length - 1)).toBe(1);
  const lat = await page.evaluate(() => window.IntMapAtlasDebug.latency().slice(-1)[0]);
  expect(lat.how).toBe('answered');
  expect(lat.streamed).toBe(true);
  expect(lat.firstVisible).toBeLessThan(lat.firstAnswer);
  expect(lat.firstAnswer).toBeLessThan(lat.answer);
  expect(await page.evaluate(() => window.__live.bodies.every((b) => b.stream))).toBe(true);

  // Rebuild an older answer after the reader asked to follow the end of a long conversation.
  const scroll = await page.evaluate(async () => {
    const panel = document.querySelector('#atlas-panel');
    const chat = panel.querySelector('.atl-chat');
    const oldQuestion = document.createElement('div');
    oldQuestion.className = 'atl-b u';
    oldQuestion.textContent = 'Earlier question';
    const longReply = document.createElement('div');
    longReply.className = 'atl-b a';
    const content = document.createElement('div');
    content.style.height = (chat.clientHeight * 3) + 'px';
    longReply.append(content);
    chat.append(oldQuestion, longReply);
    panel.querySelector('.atl-jump').click();
    const latest = chat.scrollHeight - chat.clientHeight;
    const ended = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await ended();
    const oldTop = chat.scrollTop;
    longReply.append(document.createElement('div'));
    await ended();
    const afterRepaint = chat.scrollTop;
    chat.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
    chat.scrollTo({ top: latest - 200, behavior: 'instant' });
    const manual = chat.scrollTop;
    content.style.height = (chat.clientHeight * 4) + 'px';
    longReply.append(document.createElement('div'));
    await ended();
    const afterManual = chat.scrollTop;
    oldQuestion.remove();
    longReply.remove();
    return { latest, oldTop, afterRepaint, manual, afterManual };
  });
  expect(scroll.latest).toBeGreaterThan(200);
  expect(scroll.oldTop).toBeCloseTo(scroll.latest, 0);
  expect(scroll.afterRepaint).toBeCloseTo(scroll.oldTop, 0);
  expect(scroll.afterManual).toBeCloseTo(scroll.manual, 0);
});

test('③ a stop mid-sentence keeps what was written, marked unfinished, and records no answer', async () => {
  await ask('もう一度');
  const cand = page.locator('#atlas-panel .atl-trace-row.say', { hasText: '関東平野' }).last();
  await expect(cand).toContainText('関東平野', { timeout: 20_000 });
  await page.click('#atlas-panel .atl-go');   /* the busy send button is Stop */
  /* stopped: what was written stays readable, marked unfinished — it never became an answer */
  await expect(lastReply().locator('.atl-draft.stopped')).toContainText('関東平野', { timeout: 10_000 });
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
  await expect(trace.locator('.atl-plan-count')).toBeHidden();          /* (2026-11-26) the checklist is not on the page until the reader opens the trace */
  await expect(steps.nth(0)).toBeHidden();
  await trace.locator('.atl-trace-head').click();
  await expect(trace.locator('.atl-plan-count')).toBeVisible();
  await expect(steps.nth(0)).toBeVisible();
  /* the way back to what step 1 drew: the camera is sent elsewhere and the step is pressed */
  await expect(steps.nth(0)).toHaveClass(/(^|\s)can(\s|$)/);
  await page.evaluate(() => { window.IntMapGeoEngine.camera.jumpTo({ center: [-40, -30], zoom: 2 }); });
  await steps.nth(0).click();
  await page.waitForFunction(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return Math.abs(c.lng - 139.7) < 3 && Math.abs(c.lat - 35.7) < 3; }, null, { timeout: 10_000 });
});

test('⑥ (notebook-hidden) the notebook is not shown, and the answered turns are not written to it', async () => {
  /* the turns above were answered (①②, ④) — the panel holds their replies */
  await expect(page.locator('#atlas-panel .atl-b.u')).not.toHaveCount(0);
  /* no strip, no sheet, no notebook button anywhere in the panel */
  await expect(page.locator('#atlas-panel .atl-nb-strip')).toHaveCount(0);
  await expect(page.locator('#atlas-panel .atl-nb')).toHaveCount(0);
  await expect(page.locator('#atlas-panel [data-act="keep"], #atlas-panel [data-act="file"]')).toHaveCount(0);
  /* nothing new in the database a reload would read — opened fresh, not the page's cache. A browser that never had a
     notebook has no such database at all, which is the same answer: zero entries. */
  const stored = await page.evaluate(() => new Promise((res) => {
    const have = indexedDB.databases ? indexedDB.databases() : Promise.resolve(null);
    have.then((list) => {
      if (list && !list.some((d) => d.name === 'intmap-atlas-notebook')) { res(0); return; }
      const rq = indexedDB.open('intmap-atlas-notebook');
      rq.onsuccess = () => { const db = rq.result; if (!db.objectStoreNames.contains('entries')) { res(0); return; }
        const g = db.transaction('entries').objectStore('entries').count(); g.onsuccess = () => res(g.result); g.onerror = () => res(-1); };
      rq.onerror = () => res(-1);
    }, () => res(-1));
  }));
  expect(stored).toBe(0);
});

/* Geography recovery shares the already booted, signed-in Atlas page. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
<g id="wooded-area" style="fill:#35a870;fill-rule:evenodd" transform="translate(2,3)"><path d="M 8 7 H 78 V 57 H 8 Z M 28 27 H 48 V 37 H 28 Z"/></g>
<g transform="translate(2 3)"><path id="survey-trace" fill="none" stroke="#5500ff" d="M 15 62 H 30 L 70 68"/></g>
</svg>`;

const surveyMarks = [[5,5],[95,5],[95,95],[5,95],[50,8],[8,50],[87,50],[50,89],[35,27],[65,73]]
  .map((pixel,i) => ({ pixel, name:'Survey point '+(i+1) }));
const distortedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <path id="embankment" fill="none" stroke="#145171" d="M 15 22 L 80 74"/>
  <g transform="translate(1 2)">${surveyMarks.map(({name,pixel:[x,y]}) => `<circle cx="${x-1}" cy="${y-2}" r="1"><title>${name}</title></circle>`).join('')}</g>
</svg>`;
const rasterMarks = [[5,5],[90,5],[5,75],[90,75],[40,12],[65,55]].map((pixel,i) => ({ pixel, name:'Marsh marker '+(i+1) }));

function vectorPdf() {
  const commands = '0.2 0.4 0.6 RG\n2 w\n10 10 m\n30 30 50 55 80 70 c\nS\nq [4 2] 0 d 10 60 m 60 64 l S Q\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 80] /Resources <<>> /Contents 4 0 R >>',
    '<< /Length ' + commands.length + ' >>\nstream\n' + commands + 'endstream',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(out.length); out += (i+1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = out.length;
  return out + 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' +
    offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Root 1 0 R /Size ' + offsets.length + ' >>\nstartxref\n' + xref + '\n%%EOF\n';
}

test('Atlas recovers geographic features from unseen SVG, PDF and PNG sources', async () => {
  const calls = [];
  let png;
  await page.exposeBinding('__provideMapRaster', (_, bytes) => { png = Buffer.from(bytes, 'base64'); });
  await page.evaluate((marks) => {
    window.__live.mapMarkerFixture = marks;
    window.__live.mapMarkerCalls = [];
  }, rasterMarks);
  await page.route('**/functions/v1/web-browse', async (route) => {
    const req = route.request().postDataJSON();
    calls.push(req.url);
    const isPdf = req.url.endsWith('.pdf');
    const isPng = req.url.endsWith('.png');
    const bytes = isPng ? png : Buffer.from(isPdf ? vectorPdf() : req.url.endsWith('/distortion.svg') ? distortedSvg : svg);
    await route.fulfill({ json: { ok: true, file: { name: new URL(req.url).pathname.split('/').at(-1),
      type: isPng ? 'image/png' : isPdf ? 'application/pdf' : 'image/svg+xml', url: req.url, bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), b64: bytes.toString('base64') } } });
  });
  const evidence = await page.evaluate(async ({marks,rasterMarks}) => {
    const gis = async () => { await window.IntMapLazy.need('gisCore'); return window.IntMapGis; };
    const fetchFile = (a) => window.IntMapConsole.dispatch({ type: 'fetchFile', ...a });
    const areaUrl = 'https://public.example.org/editions/survey.svg', pdfUrl = 'https://public.example.org/assets/plate.pdf';
    const read = async (url) => {
      const r = await fetchFile({ url, mapSource: { action: 'inspect' } });
      if (!r?.ok || !r.exec?.mapSource) throw new Error(JSON.stringify(r));
      return r.exec.mapSource;
    };
    const area = await read(areaUrl);
    const G = await gis();
    const ground = ([x, y]) => [17 + x / 100, 42 - y / 100];
    const tie = (pixel) => ({ pixel, ground: ground(pixel) });
    const ring = (l, t, r, b) => [[l,t], [r,t], [r,b], [l,b], [l,t]].map(ground);
    const reference = G.data.add({ title: 'independently stated test boundary', features: [{
      type: 'Feature', properties: { featureClass: 'woodland' },
      geometry: { type: 'Polygon', coordinates: [ring(10,10,80,60), ring(30,30,50,40)] },
    }] });
    const georef = { control: [[0,0], [100,0], [0,80], [100,80]].map(tie), check: [{ ...tie([43,29]), evidence: 'independent-observation' }], maxErrorM: 0.001 };
    const extract = (record, extra) => fetchFile({ mapSource: { action: 'extract', source: record.source.id, ...georef, ...extra } });
    const a = await extract(area, { legend: [{ label: 'woodland', color: '#35a870' }], reference: { dataset: reference.id, field: 'featureClass' }, crop: [0, 0, 100, 61], period: { start: '1980', end: '1985' } });
    const l = await extract(area, { method: 'linework', legend: [{ label: 'survey', elementIds: ['survey-trace'] }] });
    const vectorArea = await extract(area, { method: 'linework', legend: [
      { id: 'woods', label: 'woodland', geometry: 'Polygon', elementIds: ['wooded-area'] },
      { id: 'meadow', label: 'meadow', color:'#97ad58', geometry: 'Polygon', elementIds: ['no-such-group'] },
    ] });
    const pdf = await read(pdfUrl);
    const p = await extract(pdf, { method: 'linework', legend: [
      { label: 'river', color: '#336699', dash: 'solid' }, { label: 'seasonal', color: '#336699', dashArray: [4,2] },
    ] });
    const ambiguous = await extract(pdf, { method: 'linework', legend: [
      { label: 'river', color: '#336699' }, { label: 'seasonal', color: '#336699' },
    ] });
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 80;
    const context = canvas.getContext('2d');
    context.fillStyle = '#442290';
    context.fillRect(25, 20, 40, 30);
    context.fillRect(90, 70, 5, 5);
    context.fillStyle = '#171717';
    for (const {pixel:[x,y]} of rasterMarks) context.fillRect(x,y,1,1);
    const png = canvas.toDataURL('image/png').split(',')[1];
    // Hand the normal file relay a third, independently generated document.
    const rasterUrl = 'https://public.example.org/assets/archive.png';
    await window.__provideMapRaster(png);
    const raster = await read(rasterUrl);
    const z = await extract(raster, { legend: [{ label: 'marsh', swatch: [92, 72] }], crop: [0, 0, 85, 60] });
    const namedRasterReference = G.data.add({ title:'separate marsh ground survey', features:rasterMarks.map(({name,pixel}) => ({
      type:'Feature', properties:{name}, geometry:{type:'Point', coordinates:ground(pixel)},
    })) });
    const v = await fetchFile({ mapSource:{ action:'extract',source:raster.source.id,
      landmarks:{dataset:namedRasterReference.id,field:'name'}, maxErrorM:1,
      legend:[{label:'marsh',color:'#442290'}], crop:[0,0,85,60] } });
    const warped = await read('https://public.example.org/editions/distortion.svg');
    const survey = G.data.add({ title:'separate ground survey', features:marks.map(({name,pixel:[x,y]}) => ({
      type:'Feature', properties:{name}, geometry:{type:'Point',coordinates:[19+x/100+(y/120)**2/4, 38-y/100+x*y/50000]},
    })) });
    const n = await fetchFile({ mapSource:{ action:'extract', source:warped.source.id, method:'linework',
      landmarks:{dataset:survey.id,field:'name'}, transformModel:'auto', maxErrorM:1,
      legend:[{ label:'embankment', elementIds:['embankment'] }] } });
    const featuresOf = (r) => G.data.get(r.exec?.mapSource?.dataset?.id)?.features();
    const measured = a.ok ? await G.atlas.run({ op: 'measure', inputs: [a.exec.mapSource.dataset.id], params: { what: 'area' } }) : null;
    const display = await G.atlas.draw({ dataset: vectorArea.exec.mapSource.dataset.id });
    const vectorFeatures = featuresOf(vectorArea);
    const body = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(vectorFeatures)));
    const vectorFingerprint = [...new Uint8Array(body)].map(n => n.toString(16).padStart(2, '0')).join('');
    return { area, pdf, a, l, p, z, n, v, vectorArea, display, vectorFeatures, vectorFingerprint, ambiguous, nonlinearLines:featuresOf(n), rasterFeatures: featuresOf(z), areaFeatures: featuresOf(a), svgLines: featuresOf(l), pdfLines: featuresOf(p),
      measurement: measured?.ok };
  }, { marks:surveyMarks, rasterMarks });
  expect(evidence.area.size).toMatchObject({ width: 100, height: 80, origin: 'top-left' });
  expect(evidence.area.preview.frame).toBeTruthy();
  expect(evidence.area.vectorSelectors.elementIds).toContain('wooded-area');
  expect(evidence.vectorArea.ok, JSON.stringify(evidence.vectorArea)).toBe(true);
  const structural = evidence.vectorArea.exec.mapSource;
  expect(structural.quality.classification).toMatchObject({ field: 'classId', missingClassIds: ['meadow'],
    classes: [{ id: 'woods', color: '#35a870', selectedShapes: 1, registeredFeatures: 1 },
      { id: 'meadow', selectedShapes: 0, registeredFeatures: 0 }],
    unclassified: { missingSelectors: 1 } });
  expect(evidence.display).toMatchObject({ ok:true, legend:{field:'classId', classes:[
    {id:'woods',label:'woodland',color:'#35a870',count:1},{id:'meadow',label:'meadow',color:'#97ad58',count:0},
  ]} });
  expect(evidence.vectorFeatures[0].geometry.coordinates).toHaveLength(2);
  expect(evidence.vectorFeatures[0].properties).toMatchObject({ classId: 'woods', sourceElementId: 'wooded-area' });
  expect(structural.output).toMatchObject({ id: structural.dataset.id, version: structural.dataset.version, sha256: evidence.vectorFingerprint });
  expect(structural.dataset.provenance.output.sha256).toBe(evidence.vectorFingerprint);
  expect(structural.dataset.provenance.output.provenanceSha256).toBe(structural.output.provenanceSha256);
  expect(evidence.pdf.vectorSelectors.strokeStyles.map(row => row.dash).sort()).toEqual(['dashed','solid']);
  expect(evidence.ambiguous.exec.mapSource.detail.classification.unclassified.ambiguous).toBe(2);
  expect(evidence.ambiguous.exec.mapSource.detail.classification.missingClassIds).toEqual(['river','seasonal']);
  expect(evidence.a.ok, JSON.stringify(evidence.a)).toBe(true);
  expect(evidence.areaFeatures[0].geometry.coordinates).toHaveLength(2);
  expect(evidence.a.exec.mapSource.quality.reference.results[0].iou).toBeCloseTo(1, 7);
  expect(evidence.a.exec.mapSource.quality.positional.independent.rmseM).toBeLessThan(0.001);
  expect(evidence.a.exec.mapSource.quality.positional.independentlyCheckedErrorM).toBeLessThan(0.001);
  expect(evidence.a.exec.mapSource.quality.positional.checkEvidence['independent-observation'].pixelBounds)
    .toEqual([43, 29, 43, 29]);
  expect(evidence.a.exec.mapSource.dataset.time.kind).toBe('constant');
  expect(evidence.a.exec.mapSource.dataset.sourceCrs).toBeNull();
  expect(evidence.a.exec.mapSource.dataset.provenance.recipe.transform.crs).toBe('EPSG:4326');
  expect(evidence.a.exec.mapSource.dataset.provenance.sourceSha256).toBe(evidence.area.source.sha256);
  expect(evidence.measurement).toBe(true);
  expect(evidence.l.ok, JSON.stringify(evidence.l)).toBe(true);
  expect(evidence.svgLines[0].geometry.coordinates[0][0]).toBeCloseTo(17.17);
  expect(evidence.svgLines[0].geometry.coordinates[0][1]).toBeCloseTo(41.35);
  expect(evidence.p.ok, JSON.stringify(evidence.p)).toBe(true);
  expect(evidence.pdfLines.map(f => f.properties.classId)).toEqual(['river','seasonal']);
  expect(evidence.pdfLines[0].geometry.coordinates.length).toBeGreaterThan(2);
  expect(evidence.pdfLines[0].geometry.coordinates[0][0]).toBeCloseTo(17.10);
  expect(evidence.pdfLines[0].geometry.coordinates.at(-1)[1]).toBeCloseTo(41.90);
  expect(evidence.z.ok, JSON.stringify(evidence.z)).toBe(true);
  expect(evidence.z.exec.mapSource.quality.extraction.classes).toEqual([{ label: 'marsh', pixels: 1200 }]);
  expect(evidence.rasterFeatures[0].properties).toMatchObject({ class: 'marsh', sourcePixels: 1200, color: '#442290' });
  expect(evidence.n.ok, JSON.stringify(evidence.n)).toBe(true);
  expect(evidence.n.exec.mapSource.quality.positional).toMatchObject({
    transformModel:'quadratic', controlSource:{method:'named-svg-markers'},
    independent:{count:2}, accepted:true,
  });
  expect(evidence.nonlinearLines[0].geometry.coordinates.length).toBeGreaterThan(10);
  expect(evidence.nonlinearLines[0].geometry.coordinates[0][0]).toBeCloseTo(19.15+(22/120)**2/4, 8);
  expect(evidence.v.ok, JSON.stringify(evidence.v)).toBe(true);
  expect(evidence.v.exec.mapSource.quality.positional.independentlyCheckedErrorM).toBeNull();
  expect(evidence.v.exec.mapSource.quality.positional.checkEvidence['shared-visual-reading'].count).toBeGreaterThan(0);
  expect(evidence.v.exec.mapSource.quality.positional).toMatchObject({
    transformModel:'affine', controlSource:{method:'visual-landmark-estimates',model:'source-markers-fixture'},
    independent:{count:1}, accepted:true,
  });
  const visual = await page.evaluate(() => window.__live.mapMarkerCalls);
  expect(visual).toHaveLength(1);
  expect(visual[0].prompt).toMatchObject({width:100,height:80,names:rasterMarks.map(mark=>mark.name)});
  expect(visual[0].imageCount).toBe(1);
  expect(visual[0].webMode).toBe('off');
  expect(calls).toHaveLength(4);
});
