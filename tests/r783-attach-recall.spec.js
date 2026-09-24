/* ============================================================================
 *  R783 · 添付の取り寄せ（attach.recall）を、実物の経路で通す
 * ----------------------------------------------------------------------------
 *  #R773 の未了:「画像・PDF の `attach.recall` を本番の実会話で発火させた検証」。本番でそれを
 *  測るにはログインと課金が要り、しかも**取り寄せは Atlas が必要と判断したときだけ通る**——
 *  判断を検査で固定してはならない（CONSTITUTION.md §5）。
 *
 *  ⚠ そこで、ログインが必要な部分の**手前まで**を実物で通す。#R753 が記録した事実を使う:
 *  supabase-js は `getSession()` を localStorage から答えるので、未来の `expires_at` を持つ
 *  セッションを置けば資格情報なしで「ログイン後の画面」が走る。上流（ai-proxy）だけを
 *  この spec が置き換え、**モデルの役を演じる**——ゆえに測れるのは
 *    ① 添付した画像と PDF が、そのターンのリクエストに本当に載るか
 *    ② 次のターンで載らず、しかし在ることが述べられるか（費用の規則）
 *    ③ Atlas が `attach.recall` を呼んだとき、**中身が次の一手のリクエストに載るか**
 *    ④ 同じ引数の二度目が「もう済んでいる」と述べられ、**中身が二重に載らないか**
 *    ⑤ 無い名前の取り寄せが**失敗として**モデルに届くか（「確認できなかった」を成功にしない）
 *  ——どれも本番では読者の会話 1 本ぶんの偶然に頼るしかなかったもので、ここでは毎回通る。
 *
 *  ⚠ 置き換えたのは上流 1 つだけである。添付の読み取り（js/atlas-attach.js）、台帳
 *  （js/atlas-attach-log.js）、道具の面（js/atlas-toolsurface.js）、dispatch の
 *  `recallAttachment`、2 つのチャネル（js/ai-core.js）は、すべて製品のものが走る。
 *
 *  ⚠⚠⚠ これを書いて最初に走らせたときの実測: **取り寄せは一度も走れなかった。** Atlas が
 *  `run_capability{id:'attach.recall', args:{name:'paper.pdf'}}` を出すと、dispatch に届く前に
 *  `needs_input`（「これを実行するには、もう1つ必要です。使用する値を教えてください。」）で
 *  返る。原因は `js/atlas-capabilities.js` の `attach.recall` の行の**10 列目が `'text'`** で、
 *  `hasTarget('text')` が読むのは `query/text/question/value/place/term` ——
 *  この能力が持つ唯一の引数 `name`（js/atlas-schemas.js）はその一覧に無い。つまり台帳が
 *  「`attach.recall` を name で呼べ」と述べ、機構がその name を name と認めていなかった。
 *  ⇒ 直すのは事例ではなく列である: その 1 セルを `''` にすると、`required:['name']` を
 *  持つスキーマ（#R406 以降、引数の無い呼び出しを拒むのはそこ）が唯一の門になる。
 *  ⚠ `hasTarget('text')` に `name` を足すのは誤り——`text` を的とする他の能力すべてで
 *  「読者に打たせる的」の意味が緩む（js/atlas-capabilities.js の data.coverage の註が
 *  同じ広げ方を名指して警告している）。
 *  実測: そのセルを `''` にして 5/5 緑、`'text'` のままで ③④ と ⑤ が赤。
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

/* クライアントが受け取るセッション（#R753 と同じ形）。サーバには通らないし、通す必要もない
   ——AI の上流はこの spec が受け持ち、他の Supabase 呼び出しは hermetic が止める。 */
const FAKE_SESSION = {
  access_token: 'hermetic.test.token', token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'hermetic-test-refresh',
  user: { id: '00000000-0000-4000-8000-000000000783', aud: 'authenticated', role: 'authenticated',
    email: 'r783.reader@example.invalid', app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'R783 Reader' }, created_at: new Date().toISOString() },
};

/* 本物の 1×1 PNG（署名・IHDR・IDAT・IEND）と、本物の骨格を持つ PDF。⚠ どちらも
   「その形式である」ことをバイトで名乗る——js/atlas-attach.js は名前も MIME も信じない。 */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const PDF_TEXT = '%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
const PDF_B64 = Buffer.from(PDF_TEXT, 'latin1').toString('base64');

/* モデルの役。⚠ 返すのは js/atlas-agent.js の TURN_SCHEMA そのもの——`turn:'continuing'` と
   `tool_calls` が「まだ途中」で、それが無いものが答えである。 */
const recall = (name) => ({ name: 'run_capability', arguments_json: JSON.stringify({ id: 'attach.recall', args: { name: name } }) });
/* ⚠ 番号は**ターンの呼び出しの通し番号**であって「読者の何通目か」ではない。1 通目（画像つき）は
   視覚の道へ行くので、ここに来る 1 本目は読者の 2 通目である。 */
function modelReply(n) {
  /* 1 本目: 取り寄せを 2 件（画像と PDF）＋ **同じ呼び出しをもう一度**（④ のため） */
  if (n === 1) return { turn: 'continuing', final_text: '前に添付されたものを取り寄せます。',
    tool_calls: [recall('paper.pdf'), recall('image-1'), recall('paper.pdf')] };
  /* 2 本目: 在りもしない名前で取り寄せる（⑤ のため） */
  if (n === 2) return { turn: 'continuing', final_text: 'もう 1 件確かめます。', tool_calls: [recall('nope.pdf')] };
  return { turn: 'final', final_text: '両方読めました。' };
}

/* ⚠⚠ 実測でわかった製品の事実: **画像が付いたメッセージは視覚の道（`vision_read`）へ行き、
   道具を呼べる agent のループ（`atlas_turn`）には入らない**（js/atlas-console.js:4705 が
   `imgs.length` で分岐して return する）。だから取り寄せが起きうるのは「画像を付けていない
   ターン」だけで、この spec の 1 通目と 2 通目はそもそも別の経路である。両方数える。 */
let page, diag, visionBodies, turnBodies;
/* (atlas-native-tools) モデルが読む文字列。一本の `prompt`（視覚の道・古い上流）でも、protocol 2 の `input` item
   （会話・依頼・道具の結果——function_call_output は `output`）でも、同じ問いで読めるように。 */
const modelText = (b) => String((b && b.prompt) || '') + '\n'
  + ((b && Array.isArray(b.input)) ? b.input : []).map((it) => String(it.content || it.output || it.arguments || '')).join('\n');

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript((sess) => {
    try {
      localStorage.setItem('intmap_ws4', JSON.stringify({ on: false }));
      localStorage.setItem('sb-vpekfwdpurzejrrmacac-auth-token', JSON.stringify(sess));
    } catch { /* ignore */ }
  }, FAKE_SESSION);
  visionBodies = []; turnBodies = [];
  /* ⚠ hermetic の**あと**に貼る。Playwright は後から足した route を先に見るので、これが
     AI の上流だけを置き換え、他は hermetic のまま。 */
  await context.route('**/functions/v1/ai-proxy', async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
    /* ⚠ 経路ごとに数える。用語解説その他も同じ上流を使うので、全部を 1 列に数えると
       添付の載り方を別の機能の呼び出しについて測ることになる。 */
    const task = String(body.task || '');
    let text = '{}';
    /* ⚠ (atlas-native-tools) ai-proxy は protocol 2 を話す——呼び出しは provider の function_call item（id つき）で
       返り、書いた文だけが text（FINAL_SCHEMA）に載る。この上流の役も同じ形で答える。 */
    let extra = {};
    if (task === 'atlas_turn') {
      turnBodies.push(body);
      const r = modelReply(turnBodies.length);
      if (body.protocol === 2) {
        const n = turnBodies.length;
        text = JSON.stringify({ turn: r.turn, final_text: r.final_text });
        extra = { output: (r.tool_calls || []).map((c, i) => ({ type: 'function_call', call_id: 'c' + n + '_' + i, name: c.name, arguments: c.arguments_json })),
          meta: { protocol: 2 } };
      } else text = JSON.stringify(r);
    }
    else if (task === 'vision_read') { visionBodies.push(body); text = JSON.stringify({ contentClass: 'other', answer: '1×1 の PNG と、Catalog だけの PDF です。' }); }
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(Object.assign({ text: text, used: 1, limit: 100, charged: true }, extra)) });
  });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.IntMapGeoEngine && window.IntMapGeoEngine.hasRenderer && window.IntMapGeoEngine.hasRenderer()), null, { timeout: 60_000 });
  /* ログイン後の画面であること（refreshCurrentUser の見える結果。#R753） */
  await page.waitForFunction(() => !!document.querySelector('#btn-account .acct-av'), null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapLazy.need('atlasConsole'));
  await page.waitForFunction(() => !!window.IntMapConsole, null, { timeout: 60_000 });
  await page.evaluate(() => window.IntMapConsole.open());
  await page.waitForSelector('#atlas-panel .atl-in', { timeout: 30_000 });
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* */ } });

test('R783 ① 落とした画像と PDF は、そのターンのリクエストに本当に載る', async () => {
  /* 実物の添付経路: パネルへの drop（読者の手つきそのもの）。ATL_FILE.read と
     compressImage が走り、送る前のサムネとチップが出るまで待つ。 */
  await page.evaluate(([png, pdf]) => {
    const bytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
    const dt = new DataTransfer();
    dt.items.add(new File([bytes(png)], 'shot.png', { type: 'image/png' }));
    dt.items.add(new File([bytes(pdf)], 'paper.pdf', { type: 'application/pdf' }));
    document.getElementById('atlas-panel').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [PNG_B64, PDF_B64]);
  await page.waitForSelector('#atlas-panel .atl-imgrow .atl-thumb img', { timeout: 20_000 });
  await page.waitForSelector('#atlas-panel .atl-imgrow .atl-fchip', { timeout: 20_000 });

  /* ⚠ 送るバイトの正本は「アプリが作ったもの」であって、この spec が置いた原本ではない
     （compressImage は再符号化する）。だから画面のサムネから読む。 */
  const thumb = await page.evaluate(() => document.querySelector('#atlas-panel .atl-imgrow .atl-thumb img').src);
  expect(thumb.startsWith('data:image/'), 'サムネが data URL でない＝符号化器を通っていない').toBe(true);

  await page.fill('#atlas-panel .atl-in', 'この画像と PDF は何ですか');
  await page.click('#atlas-panel .atl-go');
  await expect.poll(() => visionBodies.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);

  const b = visionBodies[0];
  /* この事実自体を検査が述べる（上の見出し）——画像つきの送信は agent のループに入らない */
  expect(b.task).toBe('vision_read');
  expect(Array.isArray(b.images) && b.images.length, '画像が vision チャネルに載っていない').toBe(1);
  expect(b.images[0]).toBe(thumb);
  expect(Array.isArray(b.docs) && b.docs.length, 'PDF が文書チャネルに載っていない').toBe(1);
  expect(b.docs[0].name).toBe('paper.pdf');
  expect(b.docs[0].mime).toBe('application/pdf');
  expect(Buffer.from(b.docs[0].b64, 'base64').toString('latin1'), '送られた PDF が元のバイトと違う').toBe(PDF_TEXT);
  /* このターンの分は台帳が二度述べない（今まさに目の前に在るものを「前に在った」と言わない） */
  expect(modelText(b)).not.toContain('ATTACHED EARLIER IN THIS CONVERSATION');
});

test('R783 ② 次のターンでは載らない（費用）が、在ることは述べられる', async () => {
  await page.fill('#atlas-panel .atl-in', 'さっきの PDF の続きを教えて');
  await page.click('#atlas-panel .atl-go');
  await expect.poll(() => turnBodies.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);

  const b = turnBodies[0];
  /* 毎ターン 8 MB を再送しない——これが台帳が「述べるだけ」にした理由 */
  expect(b.docs, '2 ターン目に PDF が再送されている（1 件 8 MB が会話の長さだけ課金される）').toBeUndefined();
  expect(b.images == null || b.images.length === 0, '2 ターン目に画像が再送されている').toBe(true);
  /* ⚠ しかし黙ってもいない。渡さないことと、在ることを黙っていることは別。 */
  const p = modelText(b);
  expect(p, '前のターンの添付が述べられていない').toContain('ATTACHED EARLIER IN THIS CONVERSATION');
  expect(p).toContain('paper.pdf (application/pdf)');
  expect(p).toContain('image-1 (image)');
  expect(p, 'どうすれば取り戻せるかを同じ文が述べる').toContain('attach.recall');
});

test('R783 ③④ 取り寄せは中身を次の一手の目の前に置き、二度目は二重に載せない', async () => {
  /* ② の返答が continuing だったので、同じターンの次の一手が来る（ターンの呼び出しが 1 本増える） */
  await expect.poll(() => turnBodies.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
  const b = turnBodies[1];

  /* ③ 中身が戻っている。⚠ 名前が戻っただけでは #R773 の報告（「全部見れません」）は消えない */
  expect(Array.isArray(b.docs) && b.docs.length, '取り寄せた PDF が次のリクエストに載っていない').toBe(1);
  expect(Buffer.from(b.docs[0].b64, 'base64').toString('latin1'), '取り寄せた PDF のバイトが違う').toBe(PDF_TEXT);
  expect(Array.isArray(b.images) && b.images.length, '取り寄せた画像が vision チャネルに載っていない').toBe(1);
  expect(String(b.images[0]).startsWith('data:image/')).toBe(true);

  /* ④ 同じ引数の二度目は「もう済んでいる」と述べられ、中身は 1 部しか載らない
     （.agents/rules/one-pass-or-a-reason.md §4 の 3 問目。⚠ 拒否ではなく、同じ答えを返す） */
  expect(b.docs.length, '同じ取り寄せが 2 回ぶんの PDF を載せた＝二度目が一度目と違うことをしている').toBe(1);
  expect(modelText(b), '二度目が「もう済んでいる」と述べられていない').toContain('ALREADY made this exact call');
});

test('R783 ⑤ 無い名前の取り寄せは失敗として届き、在る名前を述べる', async () => {
  /* ③ の返答も continuing だったので、4 本目が来る——その中身が「失敗の受領証」 */
  await expect.poll(() => turnBodies.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  const p = modelText(turnBodies[2]);
  /* ⚠ 文はブラウザの言語で書かれる（この dispatch は 5 言語を持つ）。だから測るのは
     「どちらかの言い方で失敗が述べられていること」であって、英語の綴りではない。 */
  const REFUSED = /No attachment called that|その名前の添付はありません/;
  expect(p, '取り寄せの失敗がモデルに届いていない（「確認できなかった」が成功として通る）').toMatch(REFUSED);
  expect(p, '失敗が ok:false として届いていない').toContain('"ok":false');
  expect(p, '失敗が、在るものを述べていない').toContain('paper.pdf');

  /* そして dispatch を直に呼んでも同じ答えである（失敗は経路の性質ではなく、事実の性質） */
  const r = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'recall_attachment', name: 'nope.pdf' })
    .then((x) => ({ ok: x && x.ok, html: String((x && x.html) || '') })));
  expect(r.ok, '無い名前の取り寄せが ok で返っている').toBe(false);
  expect(r.html).toMatch(REFUSED);
  /* 在る名前なら成功し、同じ会話のあいだ何度でも取り寄せられる（取り寄せは台帳を空にしない） */
  const ok = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'recall_attachment', name: 'paper.pdf' })
    .then((x) => ({ ok: x && x.ok, recalled: x && x.exec ? x.exec.recalled : null })));
  expect(ok.ok, '述べられた名前の取り寄せが失敗した').not.toBe(false);
});

test('R783 ⑥ この spec は上流を 1 つしか置き換えていない（ページは静かなまま）', async () => {
  const bad = (diag.pageErrors || []).slice();
  expect(bad, '送信経路が例外を投げた（#R777 の形）').toEqual([]);
});
