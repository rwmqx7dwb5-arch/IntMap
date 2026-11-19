/* ============================================================================
 *  Atlas `imageryInfo` — WHICH satellite / aerial pictures exist at a place and time, when each was taken, how sharp, on what terms.
 * ----------------------------------------------------------------------------
 *  The body of the capability data.imageryInfo (js/atlas-cap-data.js). It answers from js/imagery-registry.js — the same declaration
 *  the satellite panel reads — so the screen and Atlas cannot disagree about a supplier. Loaded on demand (the Atlas chunk), never at boot.
 *  Nothing here is estimated: a date is MEASURED (Esri's Citations layer), CHOSEN (the date the picture was asked for) or DECLARED
 *  (a range, because the supplier publishes no per-place date) and the answer says which (captureLine).
 *  `apply:true` switches the satellite base to the best picture of that time, through the panel's own switch (window.__sat).
 * ==========================================================================*/
import { rankAt, captureAt, captureLine, planClockMatch, sourceById } from './imagery-registry.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 'YYYY' → that year's mid-year day (a year asks «that year», not a day); 'YYYY-MM-DD' as is; anything else → null */
export function timeOf(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim();
  if (/^\d{4}$/.test(s)) return s + '-06-15';
  return ISO.test(s) ? s : null;
}

export async function imageryInfoRun(a, K) {
  const { R, warn, note, esc, L, geocode, GE } = K;
  let lng = null, lat = null, name = '';
  if (a.place) { const ll = await geocode(a.place); if (!ll) return R(false, warn(L('IntMap could not place «' + esc(String(a.place)) + '», so there is no point to look up pictures for.', 'IntMap は「' + esc(String(a.place)) + '」の場所を特定できませんでした。'))); lng = ll.lng; lat = ll.lat; name = ll.name || a.place; }
  if (lng == null && a.lng != null && isFinite(+a.lng) && isFinite(+a.lat)) { lng = +a.lng; lat = +a.lat; }
  let zoom = null;
  try { const c = GE().camera.getCenter(); zoom = GE().camera.getZoom(); if (lng == null) { lng = c.lng; lat = c.lat; name = L('map center', '地図中心'); } } catch (_) { /* no renderer */ }
  if (lng == null) return R(false, warn(L('There is no map centre to read.', '読み取る地図の中心がありません。')));
  if (a.time != null && a.time !== '' && !timeOf(a.time)) return R(false, warn(L('Give the time as YYYY or YYYY-MM-DD.', '時刻は YYYY または YYYY-MM-DD で指定してください。')));
  const T = window.IntMapTime, clockIso = (T && T.iso && T.isLive && !T.isLive()) ? T.iso() : null;
  const time = timeOf(a.time) || clockIso;   /* an explicit time wins; else a Chronos clock that is not live; else now */
  const rows = rankAt({ lng, lat, zoom, time });
  const lang = L('en', 'jp');
  const SAT = window.__sat, cur = SAT && SAT.state ? SAT.state.providerId : null;

  if (a.apply) {
    if (!SAT || !SAT.select || !SAT.state) return R(false, warn(L('The satellite base is not available to switch.', '衛星画像の切り替え機能が利用できません。')));
    if (!document.querySelector('.map-container.sat-on')) return R(false, warn(L('Switch the map to Satellite first, then ask again.', '先に地図を衛星表示に切り替えてから、もう一度依頼してください。')));
    const iso = time || new Date().toISOString().slice(0, 10);
    let plan;
    if (a.provider) { const s = sourceById(String(a.provider)); plan = s ? planClockMatch({ providerId: s.id, lng, lat, zoom, iso }) : null; if (plan && plan.providerId !== s.id) plan = null; }
    else plan = planClockMatch({ providerId: cur, lng, lat, zoom, iso });
    if (!plan) return R(false, warn(L('No satellite or aerial picture of that time exists at that place' + (a.provider ? ' from ' + esc(String(a.provider)) : '') + '.', 'その場所・その時刻の衛星・航空画像はありません' + (a.provider ? '（' + esc(String(a.provider)) + '）' : '') + '。')));
    if (plan.pick.day) SAT.state.day = plan.pick.day;
    if (plan.pick.year) SAT.state.year = plan.pick.year;
    try { SAT.select(plan.providerId); } catch (_) { /* the panel refuses a locked provider with its own message */ }
  }

  if (!rows.length) return R(true, note('◈ ' + esc(name || (lat.toFixed(3) + ', ' + lng.toFixed(3))) + ' — ' + L('no declared supplier has a picture here at that time.', 'その時刻にこの場所の画像を持つ供給元はありません。')));
  const out = [];
  for (const r of rows.slice(0, 8)) {
    const s = r.source;
    let info = null; try { info = await captureAt(s, { lng, lat, day: r.pick.day || time, year: r.pick.year }); } catch (_) { info = null; }
    const terms = s.license.commercial === 'allowed' ? L('commercial use allowed', '商用可') : L('commercial use NOT confirmed', '商用の可否は未確認');
    const flags = [s.scope === 'regional' ? L('regional', '地域別') : '', r.pick.exact ? '' : L('nearest year ' + (r.pick.year || ''), '最も近い年 ' + (r.pick.year || '')), s.partial ? L('partial swath coverage', '観測帯のみ') : '', r.id === cur ? L('shown now', '表示中') : ''].filter(Boolean);
    out.push('<b>' + esc(s.name[lang === 'jp' ? 1 : 0]) + '</b> (' + esc(s.id) + ')' + (flags.length ? ' [' + esc(flags.join(', ')) + ']' : '') + '<br>' + esc(info ? captureLine(s, info, lang) : '') + ' · ' + esc(terms) + ' · <a href="' + window.IntMapSafe.url(s.license.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.license.name) + '</a>');
  }
  const head = '◈ ' + esc(name || (lat.toFixed(3) + ', ' + lng.toFixed(3))) + (time ? ' · ' + esc(time) : '');
  return R(true, note(head) + note(out.join('<br><br>')) + (a.apply ? note(L('Switched the satellite base to the first picture whose time matches.', '衛星画像を、時刻が合う画像に切り替えました。')) : ''));
}
