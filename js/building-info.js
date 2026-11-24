// @ts-check
/* ============================================================================
 *  IntMap · js/building-info.js — THE CARD A PICKED 3D BUILDING OPENS
 * ----------------------------------------------------------------------------
 *  The 3D city layer draws buildings from three datasets; each states height, use, year, storeys… in its own tiles.
 *  Until this card nothing showed them. A click on a building (the engine's 'buildingpick', js/cesium-engine.js
 *  _pickBuilding) opens it: the height large, then the rows the dataset states (js/building-attrs.js), then every
 *  attribute the tile carries, then the source and its licence. A phone gets a card hanging from the top, a desktop a card on the
 *  left (the right is the panels'). Esc, the close button, or a click on anything else closes it, and the building's
 *  tint is put back.
 *
 *  Built with DOM nodes and textContent only — a name or address from an upstream tile is never parsed as markup.
 *  The CSS is css/intmap.css `.bldg-card`. One export: the mounter, imported lazily by js/beta-overlays.js when the
 *  3D city layer is switched on, torn down when it is switched off.
 * ==========================================================================*/
import { describeBuilding } from './building-attrs.js';
import { IntMapLang } from './lang-registry.js';   /* the one language helper: the same pick() every other module asks (js/beta-overlays.js) */

/**
 * @param {{GE:()=>any, lang:()=>string}} deps
 * @returns {{destroy:()=>void, close:()=>void}}
 */
export function mountBuildingInfo(deps) {
  const GE = deps.GE;
  const L = IntMapLang.pick(deps.lang);
  /* the words for a row key (js/building-attrs.js keys rows by what they are, so each word is written once, here) */
  const label = (/** @type {string} */ k) => {
    switch (k) {
      case 'usage': return L('Building use', '用途'); case 'class': return L('Building class', '分類'); case 'year': return L('Built', '建築年');
      case 'floorsAbove': return L('Storeys above ground', '地上階数'); case 'floorsBelow': return L('Storeys below ground', '地下階数'); case 'floors': return L('Storeys', '階数');
      case 'fireproof': return L('Fire resistance', '耐火構造'); case 'zone': return L('Zoning', '用途地域'); case 'address': return L('Address', '住所');
      case 'id': return L('ID', 'ID'); case 'roof': return L('Roof', '屋根'); case 'status': return L('Status', '状態'); case 'type': return L('Type', '種別');
      case 'raised': return L('Raised from the ground by', '地面からの持ち上がり'); case 'sourceHeight': return L('Height stated by the source', '出典が述べる高さ');
      default: return k;
    }
  };
  const noteText = (/** @type {{code:string,arg?:string}} */ n) => (n.code === 'ridge-derived'
    ? L('ridge line above ground (derived from b3_h_nok − b3_h_maaiveld)', '棟の高さ(b3_h_nok − b3_h_maaiveld から算出)')
    : L('how it was set: ', '値の決め方: ') + (n.arg || ''));
  /** @type {HTMLElement|null} */ let card = null;
  const el = (/** @type {string} */ tag, /** @type {string} */ cls, /** @type {string} */ txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  function close() {
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = null;
    try { GE().layers.clearBuildingPick(); } catch (_) { /* a renderer without 3D tiles has nothing to untint */ }
  }

  function render(/** @type {any} */ ev) {
    const d = describeBuilding(ev.tilesetId, ev.properties);
    if (!d) { close(); return; }
    if (card && card.parentNode) card.parentNode.removeChild(card);
    const c = el('aside', 'bldg-card', ''); c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', L('Building details', '建物の情報'));
    const head = el('div', 'bldg-head', '');
    const ttl = el('div', 'bldg-title', d.title || L('Building', '建物'));
    const x = /** @type {HTMLButtonElement} */ (el('button', 'bldg-close', '')); x.type = 'button'; x.setAttribute('aria-label', L('Close', '閉じる'));
    x.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
    x.addEventListener('click', close);
    head.appendChild(ttl); head.appendChild(x); c.appendChild(head);
    if (d.headline) {
      const h = el('div', 'bldg-hero', ''); h.appendChild(el('span', 'bldg-hero-v', d.headline.value)); h.appendChild(el('span', 'bldg-hero-l', L('Height', '高さ')));
      c.appendChild(h);
      if (d.headline.note) c.appendChild(el('div', 'bldg-note', noteText(d.headline.note)));
    }
    if (d.rows.length) {
      const dl = el('dl', 'bldg-rows', '');
      d.rows.forEach((r) => { dl.appendChild(el('dt', '', label(r.key))); dl.appendChild(el('dd', '', r.value)); });
      c.appendChild(dl);
    } else if (!d.headline) c.appendChild(el('div', 'bldg-note', L('The dataset states no attributes for this building.', 'この建物について、データは属性を持っていません。')));
    if (d.all.length) {
      const det = el('details', 'bldg-all', ''); det.appendChild(el('summary', '', L('All attributes (', 'すべての属性 (') + d.all.length + ')'));
      const dl2 = el('dl', 'bldg-rows bldg-raw', ''); d.all.forEach(([k, v]) => { dl2.appendChild(el('dt', '', k)); dl2.appendChild(el('dd', '', v)); }); det.appendChild(dl2); c.appendChild(det);
    }
    const foot = el('div', 'bldg-src', ''); foot.appendChild(el('span', '', d.datasetName + ' · '));
    const a = /** @type {HTMLAnchorElement} */ (el('a', '', d.licence)); a.href = d.licenceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; foot.appendChild(a);
    c.appendChild(foot);
    document.body.appendChild(c); card = c;
  }

  const onPick = (/** @type {any} */ ev) => { try { render(ev); } catch (_) { close(); } };
  const onClear = () => close();
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && card) close(); };
  let events = null; try { events = GE().events; events.on('buildingpick', onPick); events.on('buildingpickclear', onClear); } catch (_) { events = null; }
  document.addEventListener('keydown', onKey);

  return {
    close,
    destroy() { try { if (events) { events.off('buildingpick', onPick); events.off('buildingpickclear', onClear); } } catch (_) { } document.removeEventListener('keydown', onKey); close(); },
  };
}
