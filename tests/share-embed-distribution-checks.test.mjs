/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 *  share-embed-distribution — 地図を他サイトへ埋め込む（?embed=1）と、その埋め込みコードを作る経路
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  元の欠陥: 共有リンク（js/map-ui.js viewHash の #v=…）は地図の全状態を運べるのに、他サイトへ
 *  埋め込む手段が 1 つも無かった（リポジトリ全体で embed の grep が 0 件）。そして Atlas の
 *  `share` は共有パネルを開いて「✓ 共有パネル」と言うだけで、作ったリンクを読者に渡せなかった。
 *
 *  ここで測るのは綴りではなく**評価した結果**である（ブラウザでの見え方は
 *  tests/share-embed-distribution.spec.js）:
 *    ① js/embed-mode.js の文法と URL の組み立て — 埋め込みは共有リンクに ?embed=1 を足したもので、
 *       ハッシュ（＝地図）とそれ以外のクエリを 1 文字も書き換えない。外すと元のリンクに戻る
 *    ② iframe コードは属性から抜け出せず、http(s) 以外の URL を src に書かない（一つの符号化器）
 *    ③ 大きさの既定値・上下限は 1 か所（EMBED_SIZES / EMBED_PX）にあり、Atlas の schema がそれを読む
 *    ④ Atlas の `share` を評価する: 作ったリンク／コードそのものが結果に載り、パネルは同じ値を
 *       同じタブで開く。共有窓口が無いときは失敗を述べる
 *    ⑤ 埋め込みの CSS は「残すもの」の一覧で書かれている——出典表記（#map-credit・renderer の
 *       クレジット）と凡例（js/data-layers.js が凡例として扱う 2 つの class）が残す側にある
 *    ⑥ 新しい文言は en と jp の両方にある（コードが引くキーを、コードから数える）
 *    ⑦ 文法の早い読み手（index.html の最初の script）を**評価して** embedFlags と突き合わせる。
 *       通常の起動は埋め込みの module を静的に import しない（src/main.js は data-embed のときだけ
 *       動的に取りに行き、共有パネルは開いたときに取りに行く）
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const M = await import('../js/embed-mode.js');

test('① the grammar: ?embed=1 turns it on, &interactive=0 makes a still picture, anything else is the app', () => {
  assert.deepEqual(M.embedFlags(''), { on: false, interactive: false });
  assert.deepEqual(M.embedFlags('?embed=1'), { on: true, interactive: true });
  assert.deepEqual(M.embedFlags('?a=1&embed=1&interactive=0'), { on: true, interactive: false });
  assert.deepEqual(M.embedFlags('?embed=0'), { on: false, interactive: false });
  assert.deepEqual(M.embedFlags('?embed=true'), { on: false, interactive: false });
  /* Node has no `location`: the module evaluated as «not an embed», and published nothing on window */
  assert.deepEqual({ ...M.EMBED }, { on: false, interactive: false });
});

test('① an embed is the share link plus ?embed=1 — the hash and the other parameters are untouched, both ways', () => {
  const HASH = '#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato,dl-eu&tt=1990-06-15&s=eyJ4IjoxfQ';
  const link = 'https://example.test/IntMap/?staging=1' + HASH;
  const e = M.embedUrl(link);
  const u = new URL(e);
  assert.equal(u.hash, HASH, 'the hash IS the map and travels byte for byte');
  assert.equal(u.searchParams.get('embed'), '1');
  assert.equal(u.searchParams.get('staging'), '1');
  assert.equal(u.searchParams.get('interactive'), null, 'interactive is the default and is not written');
  const still = new URL(M.embedUrl(link, { interactive: false }));
  assert.equal(still.searchParams.get('interactive'), '0');
  assert.equal(M.embedFlags(still.search).interactive, false);
  /* 「Open in IntMap」 goes back to exactly the link the embed was made from */
  assert.equal(M.appUrl(M.embedUrl(link, { interactive: false })), link);
  /* making an embed of an embed does not stack switches */
  assert.equal(M.embedUrl(M.embedUrl(link)), e);
});

test('② the iframe code cannot break out of its attributes, and refuses any scheme but http(s)', () => {
  const evil = 'https://example.test/?embed=1#v=1,2"><script>alert(1)</script>';
  const code = M.iframeCode(evil, 'small', 'a "title" <b>');
  assert.match(code, /^<iframe src="[^"<>]*" width="480" height="320" style="border:0;max-width:100%;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" title="[^"<>]*"><\/iframe>$/);
  assert.ok(!/<script/i.test(code));
  assert.match(M.iframeCode('javascript:alert(1)', 'small', 't'), /src=""/, 'a javascript: URL is written as nothing');
  assert.match(M.iframeCode('https://x.test/?embed=1#v=1', 'responsive', 't'), /width="100%" height="450"/);
});

test('③ sizes: presets from one table, explicit numbers clamped to one pair of bounds, a percentage only for a width', () => {
  for (const [k, s] of Object.entries(M.EMBED_SIZES)) assert.deepEqual(M.frameSize(k), { w: s.w, h: s.h }, k);
  assert.deepEqual(M.frameSize('nonsense'), { w: M.EMBED_SIZES.medium.w, h: M.EMBED_SIZES.medium.h }, 'an unknown preset is the default');
  assert.deepEqual(M.frameSize('small', 1, 99999), { w: M.EMBED_PX.min, h: M.EMBED_PX.max });
  assert.deepEqual(M.frameSize('small', '80%', '50%'), { w: '80%', h: M.EMBED_SIZES.small.h });
  assert.deepEqual(M.frameSize('small', 'abc', -5), { w: M.EMBED_SIZES.small.w, h: M.EMBED_SIZES.small.h });
});

/* ── ④ the Atlas capability, evaluated with a stub kernel and a stub share panel ─────────────── */
const PANEL = (await import('../js/atlas-cap-panel.js')).default;
const SHARE = PANEL.find((e) => e.row[0] === 'panel.share');

function kernel() {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return {
    R: (ok, html) => ({ ok: !!ok, html: html || '' }),
    note: (h) => '<note>' + h + '</note>', warn: (h) => '<warn>' + h + '</warn>', esc,
    L: (en, jp) => en, clickId: () => false,
  };
}

test('③ the Atlas schema offers exactly the share panel\'s presets and bounds', () => {
  const p = SHARE.schema().properties;
  assert.deepEqual(p.size.enum, Object.keys(M.EMBED_SIZES));
  assert.equal(p.width.minimum, M.EMBED_PX.min);
  assert.equal(p.width.maximum, M.EMBED_PX.max);
  assert.equal(p.embed.type, 'boolean');
  assert.equal(p.interactive.type, 'boolean');
});

test('④ Atlas `share` hands over what it made: the link, or the iframe code — the same values the panel shows', async () => {
  const LINK = 'https://example.test/IntMap/#v=15.0000,50.0000,3.00,0,0,f&l=dl-nato';
  const opened = [];
  globalThis.window = {
    IntMapShare: {
      open: (o) => { opened.push(o); },
      link: () => LINK,
      embed: () => { const url = M.embedUrl(LINK, { interactive: false }); const size = M.frameSize('small'); return { url, size, interactive: false, code: M.iframeCode(url, size, 'IntMap map') }; },
    },
  };
  try {
    const a = await SHARE.run({ type: 'share' }, {}, kernel());
    assert.equal(a.ok, true);
    assert.deepEqual(opened.pop(), { tab: 'link' });
    assert.ok(a.html.includes(kernel().esc(LINK)), 'the link itself is in the result: ' + a.html);

    const b = await SHARE.run({ type: 'share', embed: true, size: 'small', interactive: false }, {}, kernel());
    assert.equal(b.ok, true);
    assert.deepEqual(opened.pop(), { tab: 'embed', size: 'small', width: undefined, height: undefined, interactive: false });
    const code = window.IntMapShare.embed().code;
    assert.ok(b.html.includes(kernel().esc(code)), 'the iframe code itself is in the result: ' + b.html);
    assert.match(b.html, /480 × 320/);
  } finally { delete globalThis.window; }
});

test('④ with no share panel to open, `share` says it could not — it does not claim a link', async () => {
  globalThis.window = {};
  try {
    const r = await SHARE.run({ type: 'share', embed: true }, {}, kernel());
    assert.equal(r.ok, false);
    globalThis.window = { IntMapShare: { open() { }, link: () => '', embed: () => ({ url: '' }) } };
    const r2 = await SHARE.run({ type: 'share' }, {}, kernel());
    assert.equal(r2.ok, false, 'an empty address is not a link');
  } finally { delete globalThis.window; }
});

test('⑤ the embed stylesheet is a list of what STAYS, and the credits and the legends are on it', () => {
  const css = M.EMBED_CSS;
  const rules = css.split(/\r?\n/).filter((l) => /^html\[data-embed\][^{]*\{\s*display:none !important;\s*\}/.test(l));
  assert.ok(rules.length >= 3, 'the hide rules are there');
  for (const r of rules) assert.match(r, /:not\(/, 'every hide rule names what it keeps, not what it hides: ' + r);
  const kept = rules.join(' ');
  assert.match(kept, /:not\(#map-credit\)/, 'the app\'s credit bar stays');
  assert.match(kept, /:not\(#map\)/, 'the map — and the renderer\'s credit line inside it — stays');
  /* the legend classes kept are the ones js/data-layers.js itself treats as a legend */
  const dl = src('js/data-layers.js');
  for (const cls of ['data-legend', 'koppen-legend']) {
    assert.ok(dl.includes("className='" + cls) || dl.includes("getElementsByClassName('" + cls), cls + ' is a legend class in js/data-layers.js');
    assert.match(kept, new RegExp(':not\\(\\.' + cls + '\\)'), cls + ' stays in an embed');
  }
  /* the credit lines wrap instead of being cut with an ellipsis */
  assert.match(css, /html\[data-embed\] \.map-credit\{[^}]*white-space:normal/);
  assert.match(css, /html\[data-embed\] \.map-credit-view\{[^}]*white-space:normal/);
  /* and none of it is in the stylesheet every start-up parses */
  assert.ok(!src('css/intmap.css').includes('data-embed'), 'css/intmap.css carries no embed rule');
});

test('⑦ index.html\'s first script, EVALUATED, reads the grammar exactly as embedFlags does', () => {
  const html = src('index.html');
  const m = /<script>\(function\(\)\{var t='auto';\r?\n(\s*var q=location\.search;[^\r\n]*)/.exec(html);
  assert.ok(m, 'the head script reads the query');
  const read = (q) => {
    const attrs = {};
    new Function('location', 'document', m[1])({ search: q }, { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } });
    return attrs['data-embed'];
  };
  const cases = ['', '?embed=1', '?embed=1&interactive=0', '?a=1&embed=1', '?embed=0', '?embed=10', '?xembed=1',
    '?embed=1&interactive=1', '?interactive=0', '?staging=1&embed=1&interactive=0&perf=1'];
  for (const q of cases) {
    const f = M.embedFlags(q);
    assert.equal(read(q), f.on ? (f.interactive ? '1' : 'static') : undefined, 'query ' + JSON.stringify(q));
  }
  /* every address embedUrl writes is read as an embed by that script */
  assert.equal(read(new URL(M.embedUrl('https://x.test/IntMap/?lang=jp#v=1,2,3')).search), '1');
  assert.equal(read(new URL(M.embedUrl('https://x.test/IntMap/?lang=jp#v=1,2,3', { interactive: false })).search), 'static');
});

test('⑦ a normal start-up does not import the embed module; the embed and the share panel fetch it', () => {
  const code = (p) => codeOnly(src(p));
  const main = code('src/main.js');
  assert.ok(!/^\s*import\s+['"][^'"]*embed-mode/m.test(main), 'src/main.js has no static import of it');
  assert.match(main, /if \(window\.IntMapDevice\.embedded\(\)\) import\('\.\.\/js\/embed-mode\.js'\);/);
  /* no EAGER module imports it statically (the Atlas capability file is inside the lazy kernel) */
  for (const p of ['js/map-ui.js', 'js/atlas-loader.js', 'js/app-body.js']) {
    assert.ok(!/^\s*import\s[^;]*embed-mode/m.test(code(p)), p + ' does not import it statically');
  }
  assert.match(code('js/map-ui.js'), /import\('\.\/embed-mode\.js'\)/, 'the share panel fetches it when it opens');
});

/* ⑧ ONE answer to «is this page an embed», EVALUATED, and every start-up path that prepares something an
   embed cannot show reads that answer — not the query, not the attribute, each its own way. */
test('⑧ js/ui-device.js embedded() answers from <html data-embed>, and the boot entries all ask it', async () => {
  const attrs = new Set();
  const doc = { documentElement: { hasAttribute: (k) => attrs.has(k) }, addEventListener() { }, body: null };
  const G = { document: doc, matchMedia: () => ({ matches: false, addEventListener() { } }) };
  new Function('window', 'globalThis', codeOnly(src('js/ui-device.js')).replace(/typeof window !== 'undefined' \? window : globalThis/, 'window'))(G, G);
  assert.equal(G.IntMapDevice.embedded(), false);
  attrs.add('data-embed');
  assert.equal(G.IntMapDevice.embedded(), true, 'read live, not captured at load');
  /* the readers, each at the entry of what it would otherwise start. Counted by the one call, so a reader
     that asked the query or the attribute itself would not count (and the next rule below finds it). */
  const READERS = {
    'src/main.js': 'whether to fetch the embed view at all',
    'js/atlas-loader.js': 'the desktop Atlas warm-up',
    'js/app-body.js': 'the account and data boot, and which sidebars open',
    'js/session-tabs.js': 'the default tab, and reading / writing the saved session',
    'js/widgets.js': 'the widget board',
    'js/layer-previews.js': 'the automatic opening of the thumbnail queue',
    'js/mobile-ui.js': 'the bottom sheet\'s camera padding',
  };
  for (const [p, what] of Object.entries(READERS)) assert.match(codeOnly(src(p)), /window\.IntMapDevice\.embedded\(\)/, p + ' asks embedded() for ' + what);
  /* nobody else re-reads the switch: the query is read by index.html's first script and js/embed-mode.js
     (which writes the grammar), the attribute by js/ui-device.js and the embed view's own stylesheet */
  const owners = new Set(['js/ui-device.js', 'js/embed-mode.js']);
  for (const d of ['js', 'src']) for (const n of fs.readdirSync(new URL('../' + d + '/', import.meta.url))) {
    if (!/\.js$/.test(n)) continue;
    const p = d + '/' + n; if (owners.has(p)) continue;
    const c = codeOnly(src(p));
    assert.ok(!/hasAttribute\(\s*['"]data-embed['"]|[?&]embed=1|getAttribute\(\s*['"]data-embed/.test(c), p + ' reads the embed switch itself instead of asking embedded()');
  }
});

test('⑥ every string the embed code and the share tabs look up exists in en and jp', async () => {
  const { IntMapLang } = await import('../js/lang-registry.js');
  await import('../js/locales/ui.en.js');
  await import('../js/locales/ui.jp.js');
  const keys = new Set();
  for (const m of src('js/embed-mode.js').matchAll(/\bt[r]?\('([A-Za-z0-9_]+)'/g)) keys.add(m[1]);
  const share = src('js/map-ui.js').split('export function share(')[1] || '';
  for (const m of share.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)) keys.add(m[1]);
  assert.ok(keys.size >= 10, 'the keys were found: ' + [...keys].join(', '));
  for (const lang of ['en', 'jp']) {
    const tbl = IntMapLang.keyed(lang);
    const missing = [...keys].filter((k) => !(typeof tbl[k] === 'string' && tbl[k].trim()));
    assert.deepEqual(missing, [], lang + ' is missing ' + missing.join(', '));
  }
  /* jp is a translation, not a copy of the English */
  const en = IntMapLang.keyed('en'), jp = IntMapLang.keyed('jp');
  for (const k of ['embedOpen', 'embedDesc', 'shareTabEmbed']) assert.notEqual(jp[k], en[k], k);
});
