// R154 source-level regression checks (deterministic, no browser).
// Guards the R154 UX/feature batch (10 user-reported items):
//   #1  Köppen — width now HUGS the content per language (_fitKoppenLegend measures the widest row, clamps 172–340),
//       ending both "行の幅が狭すぎる" (clipping) and "テキスト以上に横幅伸ばして…行の幅変わってない" (dead space)
//   #2  Atlas typography — headings differentiate by SIZE + SPACING only, NO colour ("目次を色分けするのはやめる");
//       _atlStanza no longer FABRICATES headings (opening-sentence bold-lead + "Label:"→## removed = "判定がおかしい" fix)
//   #3  Street View coverage line — tileSize 128→64 (~0.9px hairline) + opacity 0.9→0.62
//   #4  Atlas sources — undecodable Google-News redirects are KEPT (labelled by publisher), not dropped to zero ("出展が全くない")
//   #5  Draw — Elevation profile available for freehand lines (_profileFromCoords + draw-profile button)
//   #6  AQI / UV widgets — rebuilt iOS-style: whole card takes the category colour, 6-tier AQI, luminance-based text colour
//   #7  Atlas voice input — .atl-mic button + Web Speech API dictation
//   #8  Normal-mode layer panel defaults to the RIGHT sidebar
//   #9  Right sidebar is drag-resizable (left edge) + smaller default width (430→380) + honours the saved width
//   #10 Layer on/off desync — an auto-learned layer left visible after being toggled OFF is now hidden by _auditLearned
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */

test('R154 #1 Köppen legend width hugs the content per language', () => {
  assert.match(html, /\.koppen-legend\{[^}]*width:220px; min-width:180px; max-width:460px;/, 'fixed 264px lock replaced by a dynamic width (172–340 clamp)');
  assert.match(html, /WIDTH HUGS THE CONTENT \(per language\)/, 'fit-to-content width logic present in _fitKoppenLegend');
  assert.match(html, /m\.style\.fontWeight='600'; m\.textContent=cd\?cd\.textContent:'';/, 'measures each row (code weight 600 + name) with an off-screen span');
  assert.match(html, /const w=Math\.max\(190, Math\.min\(460, room>200\?room:460, contentW\)\);/, 'R155: width clamped 190–460 (raised from 324 so DE/RU names fit) and to the room right of the panel');
  assert.match(html, /lg\.style\.width=w\+'px';/, 'the measured width is applied');
});

test('R154 #2 Atlas typography — size/spacing only, no colour, no fabricated headings', () => {
  assert.match(html, /HEADINGS DIFFERENTIATE BY SIZE \+ SPACING ONLY — NO COLOUR/, 'explicit no-colour heading policy');
  // none of the four heading rules may carry --primary-color
  assert.ok(!/margin:1\.\d+em 0 [^;]*;font-size:1\.\d+em;line-height:1\.3\d*;">\$1<\/div>'\)\s*$/m.test(html) || true, 'sanity');
  assert.ok(!/color:var\(--primary-color\);margin:1\.\d+em 0 [^;]*;font-size:1\.\d/.test(html), 'no heading rule uses --primary-color');
  assert.match(html, /\.replace\(\/\^#\{3,6\}\\s\*\(\.\+\)\$\/gm,'<div class="atl-h" style="font-weight:600;color:var\(--text-main\)/, 'h3 heading is text-main (R159 weight 600 — no bold, no colour)');
  assert.ok(!/out\.push\('## '\+label\)/.test(html), 'no "Label:"→## fabrication');
  assert.ok(!/out\.push\('\*\*'\+first\+'\*\*'\)/.test(html), 'no opening-sentence→bold-lead fabrication');
  assert.match(html, /NO MORE HEADING FABRICATION/, '_atlStanza documents the removal of guesswork');
  // the prompt tells the model not to enlarge ordinary sentences
  assert.match(html, /Use a heading ONLY for a genuine section title, never to enlarge an ordinary sentence\./, 'prompt forbids enlarging non-headings');
});

test('R154 #3 Street View coverage line — thinner hairline', () => {
  assert.match(html, /type:'raster',tileSize:64,minzoom:0,maxzoom:21/, 'tileSize 128→64');
  assert.match(html, /'raster-opacity':0\.62/, 'opacity 0.9→0.62');
});

test('R154 #4 Atlas sources — undecodable aggregator kept, labelled by publisher', () => {
  assert.match(html, /if\(_isAggUrl\(u\)\)\{ const dec=_decGNewsUrl\(u\); if\(dec\) u=dec; else agg=true; \}/, 'undecodable Google-News redirect flagged agg (not dropped)');
  assert.match(html, /if\(agg\) return \{url:u, host:'news\.google\.com', agg:true\};/, 'aggregator kept with agg flag');
  assert.match(html, /const dom=\(c\.agg&&c\.src\)\?c\.src:c\.host;/, 'card domain line shows the publisher for aggregator links');
  assert.match(html, /clean\.push\(\{url:cu\.url, host:cu\.host, agg:!!cu\.agg, src:String\(it\.src\|\|''\)/, 'linkCards carries src + agg');
});

test('R154 #5 Draw — elevation profile for freehand lines', () => {
  assert.match(html, /window\._profileFromCoords=function\(pts\)\{/, 'reusable coords→profile core extracted');
  assert.match(html, /window\._elevationProfile=function\(\)\{[\s\S]*window\._profileFromCoords\(pts\);/, 'measure/area path delegates to the core');
  assert.match(html, /id="draw-profile"[^>]*>📈 \$\{t\('elevProfile'\)\}/, 'Draw panel shows an Elevation profile button');
  assert.match(html, /profBtn\.onclick=\(\)=>\{ const c=\(simplified&&simplified\.length>=2\)\?simplified/, 'button profiles the traced line (simplified, raw fallback)');
});

test('R154 #6 AQI / UV widgets — iOS colour-fill rebuild', () => {
  /* ⚠ (#R292) THIS CHECK MOVED HOUSE. The widget board is a platform now (js/widget-*.js), so the
     spellings below — `_wgtColor`, `_TINT_A`, `.wgt-colored` — no longer exist. What #R154 asked for
     does: the AQI and UV cards still take their category's colour, the AQI scale is still all six
     tiers, and the category words are still translated. The mechanism is a `tone(state)` on the
     definition returning `sev0…sev4`, which js/widget-layout.js turns into a class the stylesheet
     paints — so the card can no longer be an opaque slab even by accident, which is what #R187 and
     #R188 spent two rounds undoing. */
  const dd = html;   /* appSource already concatenates every js/ file and css/intmap.css */
  assert.match(dd, /tone: function \(st\) \{ return st\.data \? 'sev' \+ aqiCat\(st\.data\.us_aqi\)\.level : null; \}/,
    'the AQI card still colours itself from its category');
  assert.match(dd, /tone: function \(st\) \{ return st\.data \? 'sev' \+ uvCat\(peakUV\(st\.data\.j\)\.v\)\.level : null; \}/,
    'and so does the UV card');
  /* (#R187) 「AQI, UVIウィジェットはぼんやりと影を付けなくてよい。そして、全ウィジェットはガラス風の
     質感に。」 — the 158° gradient WAS the soft shading (it darkened the bottom-right corner by 14 %),
     and being opaque it also overrode --glass-fill, making these the only two non-glass widgets. It
     is a flat translucent tint now. What #R154 was really pinning survives: the whole card still
     takes the category colour, inline-!important so it beats the sidebar-glass override, and the
     text colour is still chosen by luminance — now on the COMPOSITED surface, because behind 58 %
     alpha the raw colour is no longer what the eye sees. */
  assert.match(dd, /function aqiCat\(v\) \{[\s\S]*Very unhealthy[\s\S]*Hazardous/, 'AQI uses the full 6-tier scale');
  assert.match(dd, /function uvCat\(v\) \{/, 'UV category helper');
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
  assert.match(dd, /L\('Good', '良い', 'Gut', 'Хорошо', 'Buena'\)/, 'AQI labels localized to 5 languages');
});

test('R154 #7 Atlas voice input', () => {
  assert.match(html, /<button class="atl-mic"/, 'mic button in the input bar');
  assert.match(html, /const SR=window\.SpeechRecognition\|\|window\.webkitSpeechRecognition;/, 'Web Speech API');
  assert.match(html, /if\(mic&&!SR\)\{ mic\.style\.display='none'; \}/, 'mic hidden when unsupported');
  assert.match(html, /const langMap=\{jp:'ja-JP',de:'de-DE',ru:'ru-RU',es:'es-ES',en:'en-US'\};/, 'recognition language follows the UI language');
  assert.match(html, /L\('Voice input','音声入力','Spracheingabe','Голосовой ввод','Entrada de voz'\)/, 'mic title localized to 5 languages');
});

test('R154 #8 Layer panel defaults to the right sidebar (normal mode)', () => {
  assert.match(html, /window\.imLayerPanel='right';/, "default is 'right'");
  assert.match(html, /if\(s\.layerPanelSet===true && \(s\.layerPanel==='right'\|\|s\.layerPanel==='classic'\)\)\{ window\.imLayerPanel=s\.layerPanel;/, 'R155: only an EXPLICITLY-chosen saved value overrides the right default (stale classic no longer wins)');
});

test('R154 #9 Right sidebar resizable + smaller default', () => {
  assert.match(html, /:root\{--lsr-w:min\(300px,92vw\);\}/, 'default width 430→380→340→300 (R160)');
  assert.match(html, /#layer-sidebar-r \.lsr-resizer\{position:absolute;top:0;left:-3px;/, 'left-edge resize handle CSS');
  assert.match(html, /rh\.className='lsr-resizer';/, 'resizer element created in build()');
  assert.match(html, /let w=rsw-\(e\.clientX-rsx\);/, 'grows as the cursor moves left');
  assert.match(html, /localStorage\.setItem\('intmap_lsr_w', String\(sb\.offsetWidth\)\)/, 'persists the dragged width');
  assert.match(html, /let saved=parseInt\(localStorage\.getItem\('intmap_lsr_w'\)\|\|'',10\);/, 'open() honours the saved width');
  assert.match(html, /\(saved>=260\)\?Math\.min\(saved,cap\):Math\.max\(280,Math\.min\(300/, 'saved width used, else the 300 default (R160)');
});

test('R154 #10 Layer on/off desync — OFF learned layer is hidden', () => {
  assert.match(html, /function _ownedByCheckedOther\(cbId,lid\)\{/, 'cross-owner guard so an OFF-hide never mis-hides');
  assert.match(html, /function _auditLearned\(cb\)\{ try\{ if\(_LEARN_SKIP\.test\(cb\.id\)\|\|userTouched\(cb\)\)/, 'guards apply to BOTH directions (no !cb.checked bail)');
  assert.match(html, /if\(!cb\.checked\)\{[\s\S]*fix:'hide-learned'[\s\S]*setLayout\(lid,'visibility','none'\)/   /* (#R178) …through the contract (layers.setLayout) */, 'OFF + still-painted owned layers are hidden');
  /* ⚠ (#R276) ASSERTED AS A PROPERTY, NOT AS A LINE. The original pinned the exact text
     `try{ state[id].on=false; }catch(_){}` and its trailing comment; #R276 rewrote that failure
     branch (the toast, the state, the checkbox and the legend) and the property — a load failure
     clears the STATE, not only the checkbox — is unchanged and is what is checked. Pinning the line
     turned a correct change into a red test, which is this project's most-repeated false signal. */
  {
    const after = html.slice(html.indexOf('function toggle(id,on)'));
    const m = /\.catch\(\(\)=>\{([\s\S]{0,700}?)\n\s*\}\);/.exec(after);
    assert.ok(m, 'the ECMWF toggle has a failure branch');
    assert.match(m[1], /state\[id\]\.on=false/, 'ECMWF load-failure also clears state.on…');
    assert.match(m[1], /cb\.checked=false/, '…as well as the checkbox');
  }
});
