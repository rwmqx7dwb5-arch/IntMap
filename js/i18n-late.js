/* ============================================================================
 *  IntMap · the late translations, and the ticker’s own settings panel  (#R200)
 * ----------------------------------------------------------------------------
 *  Every UI string a later round added, in all five languages, merged into the shared i18n table
 *  before anything reads it — plus the bottom ticker's settings host, which is where its symbol and
 *  news choices are edited. Pure text and one small panel: nothing here touches the map.
 *
 *  Lifted verbatim out of js/app-body.js (#R200, second pass): 106 of its 107 lines are
 *  byte-identical, and the 1 that are not are all #R165's rule — a closure value
 *  js/app-body.js REASSIGNS at runtime is read through IM_HOST's live accessor
 *  (currentLang → HOST.lang), never captured when this factory ran.
 *  Everything else arrives through CTX under its ORIGINAL name, which is what lets the body stay
 *  word-for-word what it was. A real ES module: no window.IntMapModules entry, no src/main.js order.
 * ==========================================================================*/
export function makeI18nLate(HOST, CTX) {
  const i18n=CTX.i18n;
  /* =====================================================================
   *  ROUND 3 — settings persistence, scrollbars, translucent sidebar,
   *  screenshot, layer favorites, data-source list, unified time slider,
   *  animated wind layer, and assorted polish. Self-contained; runs after
   *  every other declaration so all helpers above are available.
   * ===================================================================== */
  Object.assign(i18n.en,{ favLayers:"Favorite layers", uploadGeoJSON:"Upload GeoJSON", screenshotBtn:"Screenshot (hides controls, keeps legends)",
    lblSidebarStyle:"Sidebar appearance", sidebarOpaque:"Solid (default)", sidebarTranslucent:"Frosted glass", sidebarGlass2:"Frosted glass (more transparent)",
    lblLabelLang:"Place-name labels", labelLangUi:"Match app language", labelLangLocal:"Local language (native script)", labelLangEn:"Always English",
    lblFlatPan:"Flat map view", flatPanFixed:"Fixed extent (Europe-centerd)", flatPanFree:"Free pan (wrap around the world)",
    /* (#R180) the rendering engine */
    lblEngine:"Map engine", engineMapLibre:"MapLibre — 2-D/3-D map (default)", engineCesium:"Cesium — true 3-D globe with real terrain",
    engineHint:"Cesium renders the Earth as a real ellipsoid at every zoom, with the same satellite imagery and the same elevation data. It is downloaded only when selected, and switching reloads the page. Contour lines and the closed 3-D solid tool stay MapLibre-only.",
    engineSwitching:"Switching engine — reloading…", engineFellBack:"Cesium could not start, so this session is running on MapLibre.",
    engineActive:"Running on: ",
    /* (#R171) tilt ceiling + viewpoint altitude */
    lblTiltLimit:"Map tilt limit", tiltStandard:"Standard — up to 78° (default)", tiltUnlimited:"Unlimited — the full 0–180° range",
    tiltHint:"Unlimited lets you tilt past the horizon until the camera looks straight up. Beyond 180° the view repeats with the bearing reversed, so right-click the compass to type any angle from 0 to 360.",
    lblEyeAlt:"Viewpoint altitude in the readout", eyeAltOff:"Off (default)", eyeAltOn:"On — show the camera's altitude",
    lblNewsCountries:"News by country media", newsCountriesHint:"Pull headlines from the media of the countries you pick (multiple allowed).",
    lblDataSources:"Data & attribution", viewDataSources:"View all data sources ↗", srcModalTitle:"Data sources & attribution", srcModalSub:"IntMap aggregates the following third-party data, imagery and APIs. All trademarks belong to their owners.",
    screenshotSaved:"Screenshot saved ✓", screenshotBusy:"Capturing…", measureClickClose:"Click the first point to close", lyrSubcables:"Submarine cables",
    lblMapColor:"Map color", mapColorAuto:"Same as appearance", mapColorLight:"Light (white)", mapColorDark:"Dark (black)",
    blueberryBtn:"Support", blueberryTitle:"Support IntMap",
    blueberryBody:"My goal is to build a map where geography, climate, history, ecology, demographics, and world events can be explored in one place.\nIntMap is developed independently and is continuously expanding with new layers, datasets, and features.\nIf you enjoy using IntMap and would like to support its future development, you can contribute below.",
    blueberryGo:"Choose an amount ↗", blueberryNote:"Opens an external page (Stripe)." });
  Object.assign(i18n.jp,{ favLayers:"お気に入りレイヤー", uploadGeoJSON:"GeoJSONを読み込む", screenshotBtn:"スクリーンショット（操作ボタンを隠し凡例は残す）",
    lblSidebarStyle:"サイドバーの外観", sidebarOpaque:"不透過（デフォルト）", sidebarTranslucent:"フロストガラス", sidebarGlass2:"フロストガラス（さらに透明）",
    lblLabelLang:"地名ラベル", labelLangUi:"アプリの言語に合わせる", labelLangLocal:"現地語（その地域の表記）", labelLangEn:"常に英語",
    lblFlatPan:"平面地図の表示", flatPanFixed:"範囲固定（ヨーロッパ中心）", flatPanFree:"自由スクロール（世界一周）",
    /* (#R180) 描画エンジン */
    lblEngine:"地図エンジン", engineMapLibre:"MapLibre — 2D/3D地図（既定）", engineCesium:"Cesium — 実地形つきの真の3D地球儀",
    engineHint:"Cesiumはどのズームでも地球を実際の楕円体として描き、衛星画像も標高データも同じものを使います。選択したときだけダウンロードされ、切り替えるとページを再読み込みします。等高線と閉じた3D立体ツールはMapLibre専用のままです。",
    engineSwitching:"エンジンを切り替えます — 再読み込み中…", engineFellBack:"Cesiumを起動できなかったため、このセッションはMapLibreで動作しています。",
    engineActive:"現在の動作: ",
    /* (#R171) 傾きの上限・視点高度 */
    lblTiltLimit:"地図の傾きの制限", tiltStandard:"標準 — 78°まで（既定）", tiltUnlimited:"無制限 — 0〜180°の全範囲",
    tiltHint:"無制限にすると、地平線を越えて真上を向くところまで倒せます。180°を超えた角度は方位を反転した同じ視線になるため、方位磁針を右クリックすれば0〜360°の任意の角度を数値で指定できます。",
    lblEyeAlt:"常時表示欄に視点の高度", eyeAltOff:"オフ（既定）", eyeAltOn:"オン — 視点位置の高度を表示",
    lblNewsCountries:"国別メディアのニュース", newsCountriesHint:"選択した国のメディアの見出しを取得します（複数選択可）。",
    lblDataSources:"データと出典", viewDataSources:"すべてのデータ出典を見る ↗", srcModalTitle:"データ出典・帰属表示", srcModalSub:"IntMapは以下の第三者のデータ・画像・APIを利用しています。各商標は権利者に帰属します。",
    screenshotSaved:"スクリーンショットを保存しました ✓", screenshotBusy:"撮影中…", measureClickClose:"最初の点をクリックで閉じる", lyrSubcables:"海底ケーブル",
    lblMapColor:"地図の配色", mapColorAuto:"テーマに合わせる", mapColorLight:"ライト（白）", mapColorDark:"ダーク（黒）",
    blueberryBtn:"サポート", blueberryTitle:"IntMapを支援する",
    blueberryBody:"IntMapは、地理・気候・歴史・生態・人口・世界の出来事をひとつの画面で探索できる地図を目指しています。\nIntMapは個人で開発しており、新しいレイヤー・データセット・機能を継続的に追加しています。\nIntMapを気に入っていただけて、今後の開発を応援したい方は、下記からご支援いただけます。",
    blueberryGo:"支援ページへ ↗", blueberryNote:"外部サイト（Stripe）へ遷移します。" });
  /* (#R114) Accent colour picker — Settings → the UI accent (buttons, active tabs, sliders). 5 languages. */
  Object.assign(i18n.en,{ lblAccent:"Accent color", accentDefault:"Default", accentCustom:"Custom color" });
  Object.assign(i18n.jp,{ lblAccent:"アクセントカラー", accentDefault:"デフォルト", accentCustom:"カスタムカラー" });
  try{ Object.assign(i18n.de,{ lblAccent:"Akzentfarbe", accentDefault:"Standard", accentCustom:"Eigene Farbe" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ lblAccent:"Акцентный цвет", accentDefault:"По умолчанию", accentCustom:"Свой цвет" }); }catch(_){}
  try{ Object.assign(i18n.es,{ lblAccent:"Color de acento", accentDefault:"Predeterminado", accentCustom:"Color personalizado" }); }catch(_){}
  /* (#R137) Countries rank-number toggle — 5 languages. */
  Object.assign(i18n.en,{ lblShowRank:"Rank numbers (Countries)", showRankOff:"Off", showRankOn:"On (default)" });
  Object.assign(i18n.jp,{ lblShowRank:"順位の数字（Countries）", showRankOff:"非表示", showRankOn:"表示（デフォルト）" });
  try{ Object.assign(i18n.de,{ lblShowRank:"Rangnummern (Länder)", showRankOff:"Aus", showRankOn:"An (Standard)" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ lblShowRank:"Номера рейтинга (страны)", showRankOff:"Выкл.", showRankOn:"Вкл. (по умолчанию)" }); }catch(_){}
  try{ Object.assign(i18n.es,{ lblShowRank:"Números de rango (Países)", showRankOff:"Desactivado", showRankOn:"Activado (predeterminado)" }); }catch(_){}
  /* (#R42) Share-this-view + Atlas console button tooltips — 5 languages. */
  Object.assign(i18n.en,{ shareView:"Share this view (copy link)", atlasBtn:"Atlas — ask in plain language (beta) · Ctrl/⌘+K" });
  Object.assign(i18n.jp,{ shareView:"この表示を共有（リンクをコピー）", atlasBtn:"Atlas — 自然言語で操作（beta）· Ctrl/⌘+K" });
  try{ Object.assign(i18n.de,{ shareView:"Diese Ansicht teilen (Link kopieren)", atlasBtn:"Atlas — in normaler Sprache fragen (Beta) · Strg/⌘+K" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ shareView:"Поделиться этим видом (копировать ссылку)", atlasBtn:"Atlas — запрос обычными словами (бета) · Ctrl/⌘+K" }); }catch(_){}
  try{ Object.assign(i18n.es,{ shareView:"Compartir esta vista (copiar enlace)", atlasBtn:"Atlas — pregunta en lenguaje natural (beta) · Ctrl/⌘+K" }); }catch(_){}
  /* (#R62) layer-panel position setting — 5 languages */
  Object.assign(i18n.en,{ lblLayerPanel:"Layer panel", layerPanelClassic:"Classic dropdown", layerPanelRight:"Right sidebar (visual, with previews)" });
  Object.assign(i18n.jp,{ lblLayerPanel:"レイヤー選択欄", layerPanelClassic:"従来のドロップダウン", layerPanelRight:"右サイドバー（プレビュー付き・刷新版）" });
  try{ Object.assign(i18n.de,{ lblLayerPanel:"Ebenen-Auswahl", layerPanelClassic:"Klassisches Dropdown", layerPanelRight:"Rechte Seitenleiste (visuell, mit Vorschau)" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ lblLayerPanel:"Панель слоёв", layerPanelClassic:"Классический список", layerPanelRight:"Правая панель (визуальная, с предпросмотром)" }); }catch(_){}
  try{ Object.assign(i18n.es,{ lblLayerPanel:"Panel de capas", layerPanelClassic:"Desplegable clásico", layerPanelRight:"Barra lateral derecha (visual, con vistas previas)" }); }catch(_){}
  /* (#R72) keyboard-shortcut help entry — 5 languages */
  Object.assign(i18n.en,{ lblKbd:"Keyboard shortcuts", viewKbd:"⌨ View keyboard shortcuts (or press ?)" });
  Object.assign(i18n.jp,{ lblKbd:"キーボードショートカット", viewKbd:"⌨ ショートカット一覧を表示（? キーでも開けます）" });
  try{ Object.assign(i18n.de,{ lblKbd:"Tastaturkürzel", viewKbd:"⌨ Tastaturkürzel anzeigen (oder ? drücken)" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ lblKbd:"Горячие клавиши", viewKbd:"⌨ Показать горячие клавиши (или нажмите ?)" }); }catch(_){}
  try{ Object.assign(i18n.es,{ lblKbd:"Atajos de teclado", viewKbd:"⌨ Ver atajos de teclado (o pulsa ?)" }); }catch(_){}
  /* (#R63) bottom news/markets ticker setting — 5 languages */
  Object.assign(i18n.en,{ lblTicker:"Bottom ticker (news & markets)", tickerOff:"Off (default)", tickerOn:"On — thin strip below the map", tkItems:"Shown items", tkNews:"News headlines", tkgFx:"Forex", tkgIdx:"Indices", tkgCom:"Commodities", tkgCrypto:"Crypto" });
  Object.assign(i18n.jp,{ lblTicker:"下部ティッカー（ニュース・マーケット）", tickerOff:"オフ（デフォルト）", tickerOn:"オン — 地図の下に細い帯を表示", tkItems:"表示する項目", tkNews:"ニュース見出し", tkgFx:"為替", tkgIdx:"株価指数", tkgCom:"商品", tkgCrypto:"暗号資産" });
  try{ Object.assign(i18n.de,{ lblTicker:"Ticker unten (News & Märkte)", tickerOff:"Aus (Standard)", tickerOn:"An — schmaler Streifen unter der Karte", tkItems:"Angezeigte Einträge", tkNews:"Schlagzeilen", tkgFx:"Devisen", tkgIdx:"Indizes", tkgCom:"Rohstoffe", tkgCrypto:"Krypto" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ lblTicker:"Нижняя бегущая строка (новости и рынки)", tickerOff:"Выкл (по умолчанию)", tickerOn:"Вкл — тонкая полоса под картой", tkItems:"Показывать", tkNews:"Заголовки новостей", tkgFx:"Валюты", tkgIdx:"Индексы", tkgCom:"Товары", tkgCrypto:"Крипто" }); }catch(_){}
  try{ Object.assign(i18n.es,{ lblTicker:"Cinta inferior (noticias y mercados)", tickerOff:"Desactivada (predeterminado)", tickerOn:"Activada — franja fina bajo el mapa", tkItems:"Elementos mostrados", tkNews:"Titulares", tkgFx:"Divisas", tkgIdx:"Índices", tkgCom:"Materias primas", tkgCrypto:"Cripto" }); }catch(_){}
  /* (#R102) new Countries sort keys (indicator pulldown labels + ascending/descending toggle) — 5 languages */
  Object.assign(i18n.en,{ sortLife:"Life expectancy", sortTfr:"Fertility rate", sortAsc:"Ascending", sortDesc:"Descending", sortDir:"Toggle ascending / descending" });
  Object.assign(i18n.jp,{ sortLife:"平均寿命", sortTfr:"合計特殊出生率", sortAsc:"昇順", sortDesc:"降順", sortDir:"昇順・降順を切り替え" });
  try{ Object.assign(i18n.de,{ sortLife:"Lebenserwartung", sortTfr:"Geburtenrate", sortAsc:"Aufsteigend", sortDesc:"Absteigend", sortDir:"Auf-/absteigend umschalten" }); }catch(_){}
  try{ Object.assign(i18n.ru,{ sortLife:"Прод. жизни", sortTfr:"Рождаемость", sortAsc:"По возрастанию", sortDesc:"По убыванию", sortDir:"Переключить порядок" }); }catch(_){}
  try{ Object.assign(i18n.es,{ sortLife:"Esperanza de vida", sortTfr:"Fecundidad", sortAsc:"Ascendente", sortDesc:"Descendente", sortDir:"Cambiar orden" }); }catch(_){}
  /* (#R102) ticker symbol/item picker in Settings — builds checkboxes from IntMapTicker's symbol registry + a News toggle,
     grouped by category; each change is applied & persisted immediately via IntMapTicker.setConfig. */
  window._populateTickerSyms=function(){ try{ const host=document.getElementById('ticker-syms'); const TK=window.IntMapTicker; if(!host||!TK||!TK.getConfig) return;
    const cf=TK.getConfig(); const L=(k)=>{ try{ return (i18n[HOST.lang]&&i18n[HOST.lang][k])||i18n.en[k]||k; }catch(_){ return k; } };
    const groups=[['fx',L('tkgFx')],['idx',L('tkgIdx')],['com',L('tkgCom')],['crypto',L('tkgCrypto')]];
    let html='<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">'+L('tkItems')+'</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px 12px;">';
    groups.forEach(([g,gl])=>{ const items=cf.list.filter(s=>s.g===g); if(!items.length) return;
      html+='<div style="flex:1 1 44%;min-width:130px;"><div style="font-size:10.5px;font-weight:700;color:var(--text-muted);letter-spacing:.03em;margin:2px 0 3px;">'+gl+'</div>';
      items.forEach(s=>{ html+='<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:2px 0;cursor:pointer;"><input type="checkbox" data-tks="'+s.k+'"'+(cf.syms.has(s.k)?' checked':'')+'> '+s.l+'</label>'; });
      html+='</div>'; });
    html+='</div>';
    html+='<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 0 0;margin-top:6px;border-top:1px solid var(--glass-border,rgba(128,128,128,0.18));cursor:pointer;"><input type="checkbox" data-tknews="1"'+(cf.news?' checked':'')+'> '+L('tkNews')+'</label>';
    host.innerHTML=html;
    const commit=()=>{ const syms=Array.from(host.querySelectorAll('input[data-tks]:checked')).map(c=>c.getAttribute('data-tks'));
      const news=!!host.querySelector('input[data-tknews]:checked'); try{ TK.setConfig({syms,news}); }catch(_){} };
    host.querySelectorAll('input[data-tks],input[data-tknews]').forEach(c=>c.addEventListener('change',commit));
  }catch(_){} };

}
