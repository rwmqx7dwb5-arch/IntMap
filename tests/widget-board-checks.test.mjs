/* ============================================================================
 *  IntMap · the widget board — the AQI and UV cards take their category's tone
 * ----------------------------------------------------------------------------
 *  Moved from tests/r154-checks.test.mjs #6. From its header:
 * ==========================================================================*/
//   #6  AQI / UV widgets — rebuilt iOS-style: whole card takes the category colour, 6-tier AQI, luminance-based text colour
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
test('R154 #6 AQI / UV widgets — iOS colour-fill rebuild', () => {
  /* ⚠ (#R292) THIS CHECK MOVED HOUSE. The widget board is a platform now (js/widget-*.js), so the
     spellings below — `_wgtColor`, `_TINT_A`, `.wgt-colored` — no longer exist. What #R154 asked for
     does: the AQI and UV cards still take their category's colour, the AQI scale is still all six
     tiers, and the category words are still translated. The mechanism is a `tone(state)` on the
     definition returning `sev0…sev4`, which js/widget-layout.js turns into a class the stylesheet
     paints — so the card can no longer be an opaque slab even by accident, which is what #R187 and
     #R188 spent two rounds undoing. */
  /* js/widget-defs-data.js, RUN: the platform around it (js/widget-core.js's define/el/L) is a
     recorder, so the two definitions it registers and the helpers it exports are asked directly.
     L() hands back its arguments, so a label's language slots can be counted. */
  const defs = [];
  const win = { IntMapWidgetCore: { el: () => ({}), L: (...a) => a, define: (d) => { defs.push(d); } }, IntMapWidgetRender: {} };
  win.window = win;
  new Function('window', readFileSync(new URL('js/widget-defs-data.js', root), 'utf8'))(win);
  const D = win.IntMapWidgetDefsData, def = (id) => defs.find((d) => d.id === id);
  assert.ok(def('env.aqi') && def('env.uv'), 'the AQI and UV cards are both registered');
  assert.equal(def('env.aqi').tone({ data: { us_aqi: 350 } }), 'sev' + D.aqiCat(350).level,
    'the AQI card still colours itself from its category');
  assert.equal(def('env.aqi').tone({ data: null }), null, '…and says nothing before it has data');
  assert.equal(def('env.uv').tone({ data: { j: { daily: { uv_index_max: [12] } } } }), 'sev' + D.uvCat(12).level,
    'and so does the UV card');
  /* (#R187) 「AQI, UVIウィジェットはぼんやりと影を付けなくてよい。そして、全ウィジェットはガラス風の
     質感に。」 — the 158° gradient WAS the soft shading (it darkened the bottom-right corner by 14 %),
     and being opaque it also overrode --glass-fill, making these the only two non-glass widgets. It
     is a flat translucent tint now. What #R154 was really pinning survives: the whole card still
     takes the category colour, inline-!important so it beats the sidebar-glass override, and the
     text colour is still chosen by luminance — now on the COMPOSITED surface, because behind 58 %
     alpha the raw colour is no longer what the eye sees. */
  /* the six US AQI bands, by the breakpoints the EPA publishes (0–50 … 301+) */
  const aqiWords = [25, 75, 125, 175, 250, 350].map((v) => D.aqiCat(v).label[0]);
  assert.deepEqual(aqiWords, ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'],
    'AQI uses the full 6-tier scale');
  assert.equal(typeof D.uvCat, 'function', 'UV category helper');
  assert.equal(D.uvCat(12).level, 4, '…and the top of the UV scale is the top tone');
  /* spelling kept for the tint half — it is CSS in css/intmap.css; a stylesheet has no value to call */
  /* ⚠ AND THE TINT CANNOT BE AN OPAQUE SLAB ANY MORE. #R154 painted the whole card; #R187 and #R188
     then spent two rounds establishing that it must be flat and translucent. The stylesheet now
     tints only the BORDER and the value, over the same `--widget-surface` every other card uses, so
     the two ways this went wrong before are both unreachable by construction. */
  const wcss = html.slice(html.indexOf('#R292 · THE WIDGET BOARD'));
  assert.match(wcss, /\.wgt-card\.wgt-tone-sev4\{ *border-color:/, 'the severity tint is a border, not a fill');
  assert.ok(!/\.wgt-card\.wgt-tone-\S+\{[^}]*background:(?!\s*var\(--widget-surface)/.test(wcss),
    'no severity class may give a card its own background');
  // 5-language category labels (standing rule) — the helper is `L` in the platform (#R292),
  // and the i18n gate carries the remaining four languages from the inline table.
  assert.deepEqual(D.aqiCat(25).label, ['Good', '良い', 'Gut', 'Хорошо', 'Buena'], 'AQI labels localized to 5 languages');
});
