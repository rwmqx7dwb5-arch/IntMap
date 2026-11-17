/* ui-compass-atlas-polish — 利用者の指示を、綴りではなく値として守る。
 *  ① 「Atlasの回答文と、そのしたのコピー、再試行との間の隙間を狭く」
 *     隙間 = 会話列の gap ＋ 操作行の margin-top。片方だけを測ると、もう片方が動いたとき黙って広がる。
 *  ② 「入力欄の周りがハイライトされるのもやめて」
 *     ハイライトは 2 つの規則から来ていた: Atlas 自身の :focus（枠色＋影）と、全体共通の :focus-visible の輪。
 *  ③ 「入力可能状態にするとあるなぞの青い小さい丸…消して」— IntMap の DOM には無く、利用者の Edge でだけ Atlas の欄に出る。
 *     ブラウザの書き込み支援を断る標準の属性を、Atlas の 2 つの入力欄（質問・編集）に付ける。
 *  ④ 左上の補助操作（ワークスペース・ログイン・フィードバック・設定）は主タブより弱く、ロゴと同じ行に並ぶ。
 *  （方位磁針の絵は tests/shell-compass-controls-checks.test.mjs の R504 ⑥⑦ が幾何で測る。） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
/* code only: the JS files carry their CSS in string literals (kept), the stylesheet's notes are block comments (dropped) */
const js = (p) => codeOnly(read(p));
const css = (p) => codeOnly(read(p), { lang: 'css' });
const px = (s) => (s == null ? NaN : parseFloat(s));

/* 宣言の中身を、規則の選択子で引く（呼び出し側がコメントを除いた本文を渡す） */
function decl(body, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[}\'"\\s,])' + esc + '\\{([^}]*)\\}').exec(body);
  return m ? m[1] : null;
}
const prop = (d, name) => { const m = d && new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(d); return m ? m[1].trim() : null; };
const firstLen = (v) => px(String(v || '').split(/\s+/)[0]);

test('① the gap between an Atlas reply and its copy/retry row is at most 4px, desktop and phone', () => {
  const styles = js('js/atlas-styles.js'), tools = js('js/atlas-msg-tools.js');
  const deskGap = px(prop(decl(styles, '#atlas-panel .atl-chat'), 'gap'));
  const phoneGap = px(prop(decl(styles, 'body:not(.ws-mode) #atlas-panel.atl-tab .atl-chat'), 'gap'));
  const deskMargin = firstLen(prop(decl(tools, '#atlas-panel .atl-msgt'), 'margin'));
  const phoneMargin = firstLen(prop(decl(tools, 'body:not(.ws-mode) #atlas-panel.atl-tab .atl-msgt:not(.atl-msgt-u)'), 'margin'));
  for (const [name, v] of [['desktop gap', deskGap], ['phone gap', phoneGap], ['desktop margin', deskMargin], ['phone margin', phoneMargin]]) {
    assert.ok(Number.isFinite(v), `${name} must be readable from the stylesheet`);
  }
  assert.ok(deskGap + deskMargin >= 0 && deskGap + deskMargin <= 4, `desktop: ${deskGap} + ${deskMargin} px`);
  assert.ok(phoneGap + phoneMargin >= 0 && phoneGap + phoneMargin <= 4, `phone: ${phoneGap} + ${phoneMargin} px`);
  /* messages themselves stay apart — the gap is what separates one exchange from the next */
  assert.ok(deskGap >= 8, 'the conversation gap itself was not shrunk');
});

test('② focusing the Atlas field draws no ring and no border change', () => {
  assert.ok(!/#atlas-panel \.atl-in:focus\{/.test(js('js/atlas-styles.js')), 'Atlas declares no :focus look for its field');
  const ring = /#atlas-panel \.atl-in:focus-visible\{([^}]*)\}/.exec(css('css/intmap.css'));
  assert.ok(ring && /outline:none !important/.test(ring[1]),
    'the shared :focus-visible ring (outline !important) is cancelled for this field by name');
});

test('③ both Atlas fields decline browser writing assistance and autofill', () => {
  const fields = [['js/atlas-console.js', 'atl-in'], ['js/atlas-msg-tools.js', 'atl-edit-in']];
  for (const [file, cls] of fields) {
    const tag = new RegExp('<textarea class="' + cls + '"[^>]*>').exec(read(file));
    assert.ok(tag, `${file} builds the ${cls} field`);
    assert.match(tag[0], /writingsuggestions="false"/, `${cls}: writingsuggestions="false"`);
    assert.match(tag[0], /autocomplete="off"/, `${cls}: autocomplete="off"`);
    assert.ok(!/spellcheck="false"/.test(tag[0]), `${cls}: spell checking is a capability and stays on`);
  }
});

test('④ the secondary header actions sit on the title row and are quieter than the main tabs', () => {
  const sheet = css('css/intmap.css');
  const area = decl(sheet, '.header-area');
  assert.equal(prop(area, 'flex-direction'), 'row', 'logo and actions share one row');
  assert.equal(prop(area, 'flex-wrap'), 'wrap', 'and wrap instead of clipping when a language is wide');
  const media = /@media\(min-width:769px\)\{([\s\S]*?)\n\s*\}/.exec(sheet);
  assert.ok(media, 'the quiet style is desktop-only (the phone keeps 44px targets)');
  const btn = decl(media[1], '.header-actions > button');
  assert.equal(prop(btn, 'background'), 'transparent', 'no fill at rest');
  assert.equal(prop(btn, 'color'), 'var(--text-muted)', 'muted text at rest');
  assert.equal(prop(decl(sheet, '.mode-btn'), 'background'), 'var(--input-bg)', 'the main tabs keep their fill, so they read as primary');
});
