/* ============================================================================
 *  IntMap · the outlet picker follows the feed it counts
 * ----------------------------------------------------------------------------
 *  提供元の選択欄はフィードそのもの（届いた見出しの publisher を数えたもの）。言語の <select> は
 *  同じ設定ダイアログの中にあり、切り替えるとフィードがその言語で取り直される——なのに欄を
 *  数え直す契機は「設定を開いたとき」しか無かった。実測（nightly deep tier・tests/r466.spec.js）:
 *  開いたままの欄は «AP · Al Jazeera (1)»、開き直すと «조선일보 (7)»。
 *
 *  ここでは製品のモジュールを実際に評価する（綴りを読まない）: フィードを差し替えて
 *  `intmap-news-feed` を上げ、開いている欄は新しいフィードを数え、閉じている欄は触られないこと。
 *  上げる側（js/app-body.js の globalData の setter）は tests/event-bus-checks.test.mjs が
 *  js/bus.js の `from` と突き合わせる。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

/* the smallest page the module touches: a window that carries events, and the elements it looks up */
function page() {
  const el = (id) => ({ id, innerHTML: '', textContent: '', value: '', dataset: {}, style: {},
    classList: { contains: () => false, toggle() {}, remove() {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {} });
  const els = Object.fromEntries(['settings-modal', 'newssource-multi', 'newssource-dd-label', 'setting-newssource']
    .map((id) => [id, el(id)]));
  const w = new EventTarget();
  w.IntMapSafe = { html: (s) => String(s) };
  globalThis.window = w;
  globalThis.document = { getElementById: (id) => els[id] || null, addEventListener() {} };
  return els;
}

test('the open outlet picker re-counts when the feed is replaced, and a closed one is left alone', async () => {
  const els = page();
  const HOST = { lang: 'en', globalData: [{ publisher: 'AP' }, { publisher: 'Al Jazeera' }] };
  const { newsSources } = await import('../js/news-sources.js');
  const bus = await import('../js/bus.js');
  newsSources(HOST, { NEWS_COUNTRY_FEEDS: {} });

  /* opened: the dialog paints the picker from the feed it has now */
  els['settings-modal'].style.display = 'flex';
  window.IntMapNewsSources.render();
  assert.match(els['newssource-multi'].innerHTML, /AP/);

  /* the language changes under the open dialog and the feed lands again in that language */
  HOST.globalData = [{ publisher: '조선일보' }, { publisher: '조선일보' }, { publisher: '연합뉴스' }];
  bus.emit('intmap-news-feed');
  const open = els['newssource-multi'].innerHTML;
  assert.match(open, /조선일보.*\(2\)/, 'the open picker still counts the feed it was opened on');
  assert.doesNotMatch(open, /Al Jazeera/, 'an outlet the new feed does not carry is still listed');

  /* closed: nothing repaints it (opening does) */
  els['settings-modal'].style.display = 'none';
  HOST.globalData = [{ publisher: 'Reuters' }];
  bus.emit('intmap-news-feed');
  assert.equal(els['newssource-multi'].innerHTML, open, 'a closed dialog was repainted');
});
