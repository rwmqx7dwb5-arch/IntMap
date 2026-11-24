/* ============================================================================
 *  IntMap · js/transit-catalogue.js — WHICH TIMETABLES EXIST NEAR A POINT, AND WHY EACH IS OR IS NOT USED
 * ----------------------------------------------------------------------------
 *  data/transit-feed-catalogue.json (scripts/transit-discover.mjs) holds the ~2 750 open, key-free GTFS
 *  schedules the Mobility Database lists, each with a verdict from its licence link
 *  (js/transit-licence.js). The planner ships a handful of BUILT feeds (js/transit-feeds.js); this file
 *  answers the other question — «there is no timetable here: is that because none exists, or because
 *  the one that exists may not be used?» — so that Atlas says the true one of the two.
 *
 *  Pure functions over the catalogue's rows, no DOM, no network (the planner fetches the file).
 *
 *  row = [id, country, provider, place, licenceUrl, spdx, verdict, downloadUrl, bbox|null]
 * ==========================================================================*/

const R = { id: 0, country: 1, provider: 2, place: 3, licenceUrl: 4, spdx: 5, verdict: 6, url: 7, bbox: 8 };

/** the feeds whose stop bounding box (widened by padKm) holds the point */
export function feedsAt(rows, p, padKm) {
  const pad = (padKm == null ? 5 : padKm) / 111; const lng = +p.lng, lat = +p.lat;
  if (!isFinite(lng) || !isFinite(lat)) return [];
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  return (rows || []).filter((r) => { const b = r[R.bbox]; return b && b[2] - b[0] < 180 && lng >= b[0] - pad / cos && lng <= b[2] + pad / cos && lat >= b[1] - pad && lat <= b[3] + pad; });
}

/**
 * What the catalogue knows about a point, structured (the reply words it in the reader's language).
 *   usable   verdict usable-lead  — the stated licence permits commercial use; not built, and the
 *            publisher's page has not been read, so «a lead», never «licensed»
 *   blocked  verdict unusable     — the licence forbids it (NonCommercial / NoDerivatives)
 *   unstated verdict none         — no licence stated: all rights reserved, never used
 *   unread   verdict unknown      — a licence page nobody has read
 */
export function knownAt(rows, p, padKm) {
  /* the most local feed first (smallest stated area): a long-distance coach feed whose box merely spans the point is the weakest example */
  const area = (r) => (r[R.bbox][2] - r[R.bbox][0]) * (r[R.bbox][3] - r[R.bbox][1]);
  const here = feedsAt(rows, p, padKm).sort((x, y) => area(x) - area(y));
  const by = { usable: [], blocked: [], unstated: [], unread: [] };
  here.forEach((r) => { (({ 'usable-lead': by.usable, unusable: by.blocked, none: by.unstated, unknown: by.unread })[r[R.verdict]] || by.unread).push(r); });
  const brief = (r) => ({ id: r[R.id], provider: r[R.provider], place: r[R.place], country: r[R.country], licence: r[R.spdx] || null, licenceUrl: r[R.licenceUrl] || null, verdict: r[R.verdict] });
  const pick = (a) => a.slice(0, 5).map(brief);
  return { total: here.length, counts: { usable: by.usable.length, blocked: by.blocked.length, unstated: by.unstated.length, unread: by.unread.length },
    usable: pick(by.usable), blocked: pick(by.blocked), unstated: pick(by.unstated), unread: pick(by.unread) };
}

/** the one-line reading of knownAt(), as [en, jp]: what exists, and the reason each part is not used. null when the catalogue lists nothing here. */
export function sentence(k) {
  if (!k || !k.total) return null;
  const c = k.counts, en = [], jp = [];
  if (c.usable) { const x = k.usable[0]; en.push(c.usable + ' listed under a licence that permits commercial use (' + (x.licence || 'open licence') + ', ' + x.provider + ') — not yet read at the publisher and not built into IntMap'); jp.push('商用可と記された許諾のもの ' + c.usable + ' 件（' + (x.licence || '公開ライセンス') + '・' + x.provider + '）— 公表元での確認も取り込みもまだ'); }
  if (c.blocked) { en.push(c.blocked + ' whose licence forbids commercial use or derivatives — never used'); jp.push('商用利用・改変を禁じる許諾のもの ' + c.blocked + ' 件 — 使いません'); }
  if (c.unstated) { en.push(c.unstated + ' with no licence stated (that is not permission) — never used'); jp.push('許諾の記載がないもの ' + c.unstated + ' 件（記載がないことは許可ではありません）— 使いません'); }
  if (c.unread) { en.push(c.unread + ' under terms nobody has read yet — not used until read'); jp.push('条件をまだ誰も読んでいないもの ' + c.unread + ' 件 — 読むまで使いません'); }
  return ['The open-timetable catalogue lists ' + k.total + ' feed(s) whose stated service area includes this point: ' + en.join('; ') + '.', '公開時刻表のカタログに、この地点を含む運行範囲のものが ' + k.total + ' 件あります: ' + jp.join('；') + '。'];
}
