/* ============================================================================
 *  IntMap · NEWS PULSE — the Layers row and the doors   (news-intelligence)
 * ----------------------------------------------------------------------------
 *  Everything that RUNS AT BOOT for js/news-intel.js: the Layers row «News pulse by country», its name,
 *  the IntMapOS commands, and the facade `window.IntMapNewsIntel` the company panel and Atlas call — so
 *  every door exists before anybody has paid for the body (CONSTITUTION: a command that only exists after
 *  the layer is on is not reachable). The body — the country outlines, the counts, the painting, the
 *  brief, companies in the news — is fetched through js/lazy-modules.js `newsIntel` the first time
 *  somebody asks. The split is js/net-health.js's, for the same reason.
 *
 *  ⚠ THE FACADE ANSWERS BEFORE THE BODY ARRIVES: `isOn()` is false and `state()` says `loaded:false`
 *  for a layer nobody asked for — the truth, and what lets a caller ask without the download.
 *  ⚠ THE ROW NAME LIVES HERE AND NOWHERE ELSE; the body reads it back through `label()` (#R519).
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { loadNECountries } from './ne-countries.js';   /* handed to the lazy body (see js/news-intel.js `geo`) */

export function newsPulse(HOST) {
  const L = IntMapLang.pick(() => HOST.lang);
  const ID = 'dl-newspulse';
  const label = () => L('News pulse by country', '国ごとのニュースの脈');

  let body = null, pending = null;
  function need() {
    if (body) return Promise.resolve(body);
    if (!pending) {
      pending = window.IntMapLazy.need('newsIntel')
        .then(() => { body = window.__imNewsIntel || null; return body; })
        .catch(() => { pending = null; return null; });
    }
    return pending;
  }
  async function toggle(want) {
    if (!want && !body) return false;   /* switching off what was never fetched is already true */
    const b = await need();
    if (!b) {
      try { HOST.imToast(L('Could not load the news pulse', 'ニュースの脈を読み込めませんでした')); } catch (_) { }
      const el = document.getElementById(ID);
      if (el) { el.checked = false; const r = el.closest('.lyr-row'); if (r) r.classList.remove('on'); }
      return false;
    }
    return b.toggle(want);
  }

  function buildRow() {
    const dd = document.getElementById('layer-dropdown'); if (!dd || document.getElementById(ID)) return;
    const w = document.createElement('div'); w.className = 'lyr-row'; w.id = 'lyrrow-newspulse';
    w.innerHTML = '<label class="layer-option"><input type="checkbox" id="' + ID + '"> '
      + '<span class="lyr-sw" style="background:linear-gradient(90deg,#e7e3f7 0%,#a99ae0 45%,#35208a 100%)"></span> '
      + '<span class="ec-lbl" id="' + ID + '-lbl"></span></label>';
    dd.appendChild(w);
    w.querySelector('input').addEventListener('change', (ev) => {
      ev.target.closest('.lyr-row').classList.toggle('on', ev.target.checked);
      toggle(ev.target.checked);
    });
    relabel();
    try { window.reorganizeLayerPanel && window.reorganizeLayerPanel(); } catch (_) { }
  }
  function relabel() { const e = document.getElementById(ID + '-lbl'); if (e) e.textContent = label(); }
  if (document.readyState !== 'loading') setTimeout(buildRow, 0); else document.addEventListener('DOMContentLoaded', buildRow);
  window.addEventListener('intmap-lang', () => setTimeout(relabel, 20));

  /* ⚠ ATLAS DRIVES THE ROW THROUGH ITS CHECKBOX, so the box cannot disagree with the map (js/net-health.js) */
  function setOn(want) {
    const el = document.getElementById(ID);
    if (el) { if (el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); } return Promise.resolve(want); }
    return toggle(want);
  }
  try {
    window.IntMapOS.register('newspulse.toggle', (ctx) => setOn(!(ctx && ctx.params && ctx.params.on === false)),
      { label: 'News pulse by country · show / hide', group: 'layers' });
    /* ⚠ THE ANSWER IS A COMMAND OF ITS OWN, because «which countries are in the news» is a reading, not a
       request to repaint the map — it works whether or not the row is on */
    window.IntMapOS.register('newspulse.rank', (ctx) => need().then((b) => (b ? b.ranking((ctx && ctx.params) || {}) : null)),
      { label: 'News pulse · which countries have the most (or rising) news events', group: 'data' });
    window.IntMapOS.register('newspulse.brief', (ctx) => need().then((b) => (b ? b.brief(((ctx && ctx.params) || {}).country) : null)),
      { label: 'News pulse · the news brief of one country (events, change, internet outages)', group: 'data' });
  } catch (_) { }

  window.IntMapNewsIntel = {
    id: ID, label, toggle, setOn, ready: need,
    /* the Natural Earth outlines through the one data door — the body reads them here, so it does not import them */
    outlines: (scale) => loadNECountries(scale),
    isOn: () => !!(body && body.isOn()),
    state: () => (body ? Object.assign({ loaded: true }, body.state()) : { loaded: false, on: false }),
    setOptions: (o) => need().then((b) => (b ? b.setOptions(o || {}) : null)),
    ranking: (o) => need().then((b) => (b ? b.ranking(o || {}) : { ok: false, error: 'module' })),
    brief: (q) => need().then((b) => (b ? b.brief(q) : { ok: false, error: 'module' })),
    outageNews: (o) => need().then((b) => (b ? b.outageNews(o || {}) : { ok: false, error: 'module' })),
    companyEvents: (id) => need().then((b) => (b ? b.companyEvents(id) : { ok: false, items: [], error: 'module' })),
    showCompanyLinks: (sites, items) => need().then((b) => (b ? b.showCompanyLinks(sites, items) : null)),
    /* hiding what was never drawn is already true — do not download the body to hide nothing */
    hideCompanyLinks: () => { if (body) body.hideCompanyLinks(); },
  };
  return window.IntMapNewsIntel;
}
