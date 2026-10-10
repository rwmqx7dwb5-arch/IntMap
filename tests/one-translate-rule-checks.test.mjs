/* ============================================================================
 *  one-translate-rule — the positional/inline translation rule exists once, and so does the keyed one
 * ----------------------------------------------------------------------------
 *  ① pick(getLang) and t(lang, …) resolve identically for every language × argument length ×
 *    empty/null column — and both equal the bodies they replaced (frozen below as an oracle);
 *  ② keyedText() is the one keyed lookup: live table, English per key, then the caller's fallback;
 *  ③ no js/ file re-implements the keyed lookup by reading IntMapI18N and falling back to `.en[key]` itself;
 *  ④ no js/ file wraps IntMapLang.t in a local `(en, jp) => IntMapLang.t(lang, en, jp)` — it is
 *    IntMapLang.pick(() => lang), the same rule with the accessor as data.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntMapLang } from '../js/lang-registry.js';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'lang-registry.js');
const src = (f) => readFileSync(join(ROOT, 'js', f), 'utf8');

/* give the new-language rows their inline tables so the fallback arm is exercised */
const CODES = IntMapLang.LANGS.map((l) => l.code);
CODES.forEach((c, i) => { if (i >= 5) IntMapLang.define(c, { inline: { 'Hello': 'Hello@' + c, 'Empty': '' } }); });

/* the two bodies this round deleted, kept verbatim as the oracle (code lookup via the public normalise) */
function oldPick(getLang) {
  return function () {
    const n = arguments.length; if (!n) return '';
    let code; try { code = IntMapLang.normalise(getLang()); } catch (e) { code = IntMapLang.FALLBACK; }
    const i = IntMapLang.index(code); const a = arguments;
    if (i < 0) return a[0];
    if (i > 0 && i < n) { const v = a[i]; if (v != null && v !== '') return v; }
    return a[0];
  };
}

const COLS = ['Hello', 'Hallo', 'Привет', 'Hola', '你好', '您好', 'Bonjour', '안녕'];
const cell = (k) => (k % 5 === 3 ? '' : k % 5 === 4 ? null : COLS[k % COLS.length]);

test('① pick and t agree on every language x length x empty/null column', () => {
  let cases = 0;
  const langs = [...CODES, 'ja', 'EN-gb', 'xx', '', null, undefined];
  for (const lang of langs) for (let len = 0; len <= 6; len++) {
    for (const first of ['Hello', 'Empty', 'Unlisted']) {
      const texts = Array.from({ length: len }, (_, k) => (k === 0 ? first : cell(k)));
      const viaPick = IntMapLang.pick(() => lang)(...texts);
      assert.equal(IntMapLang.t(lang, ...texts), viaPick, `t vs pick ${lang} ${JSON.stringify(texts)}`);
      assert.equal(IntMapLang.t(() => lang, ...texts), viaPick, `t(fn) vs pick ${lang}`);
      cases++;
    }
  }
  assert.equal(cases, langs.length * 7 * 3);
  /* t with no text, and a throwing accessor */
  assert.equal(IntMapLang.t('de'), '');
  assert.equal(IntMapLang.pick(() => { throw new Error('x'); })('A', 'B'), 'A');
  assert.equal(IntMapLang.t(() => { throw new Error('x'); }, 'A', 'B'), 'A');
});

test('① the positional columns still equal the pre-merge body', () => {
  for (const lang of CODES.slice(0, 5)) for (let len = 1; len <= 6; len++) {
    const texts = Array.from({ length: len }, (_, k) => (k === 0 ? 'Unlisted' : cell(k)));
    assert.equal(IntMapLang.pick(() => lang)(...texts), oldPick(() => lang)(...texts));
    assert.equal(IntMapLang.t(lang, ...texts), oldPick(() => lang)(...texts));
  }
});

test('② keyedText: live table, English per key, then the fallback', () => {
  assert.equal(IntMapLang.keyedText('de', 'no-such-key-anywhere', 'FB'), 'FB');
  assert.equal(IntMapLang.keyedText('xx', 'no-such-key-anywhere', 'FB'), 'FB');
  const prev = globalThis.window;
  globalThis.window = { IntMapI18N: { en: { k1: 'EN1', k2: 'EN2', k3: 'EN3' }, jp: { k1: 'JP1', k2: '' } } };
  try {
    assert.equal(IntMapLang.keyedText('jp', 'k1', 'FB'), 'JP1');
    assert.equal(IntMapLang.keyedText('jp', 'k2', 'FB'), 'EN2');   /* empty falls through to English */
    assert.equal(IntMapLang.keyedText('jp', 'k3', 'FB'), 'EN3');
    assert.equal(IntMapLang.keyedText('de', 'k1', 'FB'), 'EN1');   /* table absent here: keyed() has English only */
    assert.equal(IntMapLang.keyedText('jp', 'k9', 'FB'), 'FB');
    globalThis.window.IntMapI18N.lang = () => 'jp';
    assert.equal(IntMapLang.keyedText(null, 'k1', 'FB'), 'JP1');   /* null code = the reader's current language */
    globalThis.window.IntMapI18N.lang = () => { throw new Error('x'); };
    assert.equal(IntMapLang.keyedText(null, 'k1', 'FB'), 'FB');
  } finally { if (prev === undefined) delete globalThis.window; else globalThis.window = prev; }
});

/* The remaining hand-written key-then-English readers. Each is in a file this round was not allowed to
   touch (they are being edited elsewhere); the list is a debt and the test fails if an entry stops
   matching, so it can only shrink. */
const KEYED_PENDING = new Set(['app-body.js', 'data-layers.js', 'i18n-late.js', 'map-ui.js']);
const KEYED_SHAPE = /\.en\[\s*(?:k|key)\s*\]/;

test('③ no js/ file re-implements the keyed lookup (reading a key table and falling back to .en[key])', () => {
  const hits = JS.filter((f) => KEYED_SHAPE.test(src(f)));
  const fresh = hits.filter((f) => !KEYED_PENDING.has(f));
  assert.deepEqual(fresh, [], 'use IntMapLang.keyedText(lang, key, fallback)');
  const stale = [...KEYED_PENDING].filter((f) => !hits.includes(f));
  assert.deepEqual(stale, [], 'remove from KEYED_PENDING: the shape is gone');
});

/* connections-panel forwards a tuple of unknown length (`t(lang, ...row)`) through a 3-parameter alias that
   drops every column past the second; collapsing it onto IntMapLang.t would change what a long row says. */
const ALIAS_PENDING = new Set(['connections-panel.js']);
const LOCAL_WRAPPERS = [
  /\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*(?:\{\s*(?:try\s*\{\s*)?return\s+)?IntMapLang\.t\(\s*[^;]*?,\s*\1\s*,\s*\2\s*\)/,
  /\(\s*\.\.\.(\w+)\s*\)\s*=>\s*IntMapLang\.t\([^;]*?\.\.\.\1\s*\)/,
  /\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*IntMapLang\.t\(\s*\1\s*,\s*\2\s*,\s*\3\s*\)/,
];

test('④ no js/ file wraps IntMapLang.t in a local (en, jp) => … lambda', () => {
  const code = (f) => codeOnly(src(f));   /* prose may quote the shape */
  const hits = JS.filter((f) => LOCAL_WRAPPERS.some((re) => re.test(code(f))));
  assert.deepEqual(hits.filter((f) => !ALIAS_PENDING.has(f)), [], 'use IntMapLang.pick(() => <lang>)');
  assert.deepEqual([...ALIAS_PENDING].filter((f) => !hits.includes(f)), [], 'remove from ALIAS_PENDING');
});
