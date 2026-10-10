/* ============================================================================
 *  IntMap · the two phone doors under the empty search field — «Here, now» and «Photo's place»   (mobile-next)
 * ----------------------------------------------------------------------------
 *  The sheet's head field is the phone's one entry (docs/architecture/09-mobile.md §9.2): focusing it with nothing
 *  typed already shows the example maps (js/showcase-gallery.js). Above them, two rows that only a phone makes
 *  natural — what is happening where I stand (the place card's «Here, now», js/place-dossier.js), and where a photo in my library was taken
 *  (js/share-inbox.js openShared). Neither opens by itself and neither reads the position before it is pressed:
 *  the browser's own location prompt follows the press.
 *  Loaded with the gallery on the first empty focus (js/search-geocode.js); the two modules it opens are fetched
 *  by the press. Strings are en + jp (CONSTITUTION.md §7); marks are js/icons.js line icons.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import { hostDoor } from './host-door.js';
import './safe-html.js';

const lang = () => { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } };
const t = IntMapLang.pick(() => lang());
const H = (s) => globalThis.IntMapSafe.html(s);
const CSS = [
  '.hn-entry{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 10px 2px;}',
  '.hn-entry button{display:flex;align-items:center;gap:9px;min-height:52px;padding:8px 12px;border:1px solid rgba(128,128,128,0.18);border-radius:14px;background:var(--input-bg);color:var(--text-main);font:inherit;text-align:left;cursor:pointer;}',
  '.hn-entry button:active{transform:scale(0.98);}',
  '.hn-entry .hn-e-i{flex:0 0 auto;display:inline-flex;color:var(--primary-color);}',
  '.hn-entry b{display:block;font-size:13.5px;font-weight:650;line-height:1.2;}',
  '.hn-entry small{display:block;font-size:11px;color:var(--text-muted);line-height:1.25;margin-top:2px;}',
].join('\n');
let styled = false;
function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-here-entry-css'; st.textContent = CSS; document.head.appendChild(st); }

/* The library picker is opened INSIDE the press: a file input may only be clicked while the browser still counts the
   tap as the reader's (Safari drops that across an await), so the module that reads the photo is fetched after the
   choice, not before it. js/share-inbox.js openShared then treats it exactly as a photo from the share sheet. */
function pickPhoto(HOST) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) import('./share-inbox.js').then((m) => m.openShared(HOST, { file: f })).catch(() => {}); }, { once: true });
  document.body.appendChild(inp);
  inp.click();
}

/** put the two rows at the top of the empty-state list `res` (idempotent). → true when drawn */
export function showEntry(res) {
  if (!res || res.querySelector('.hn-entry')) return false;
  style();
  const row = document.createElement('div');
  row.className = 'hn-entry'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', t('Where you are', 'いまいる場所'));
  row.innerHTML = '<button type="button" data-hn-entry="here"><span class="hn-e-i">' + icon('target', { size: 20 }) + '</span><span><b>' + H(t('Here, now', 'いま、ここ')) + '</b><small>' + H(t('Weather, quakes, news, history', '天気・地震・ニュース・歴史')) + '</small></span></button>'
    + '<button type="button" data-hn-entry="photo"><span class="hn-e-i">' + icon('image', { size: 20 }) + '</span><span><b>' + H(t('Photo\'s place', '写真の場所')) + '</b><small>' + H(t('Where a photo was taken', '写真の撮影地を地図に')) + '</small></span></button>';
  row.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-hn-entry]') : null; if (!b) return;
    const HOST = hostDoor.host; if (!HOST) return;
    /* the press ends the search: the field gives up the caret (on a phone the keyboard closes and the sheet comes down) */
    try { const inp = document.getElementById('ms-input'); if (inp) inp.blur(); } catch (_) { /* no field */ }
    res.style.display = 'none'; res.innerHTML = '';
    if (b.dataset.hnEntry === 'here') import('./place-dossier.js').then((m) => m.openHereNow(HOST)).catch(() => {});
    else pickPhoto(HOST);
  });
  res.insertBefore(row, res.firstChild);
  res.style.display = 'block';
  return true;
}
