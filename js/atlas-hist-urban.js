/* ============================================================================
 *  IntMap · js/atlas-hist-urban.js — Atlas's answer from the historical urban-population record
 * ----------------------------------------------------------------------------
 *  The run of `time.cityPopulation` (js/atlas-cap-time.js), imported on first use so the Atlas chunk does not
 *  carry it (check:perf). The rule is js/hist-urban.js, the same functions the map layer reads.
 * ==========================================================================*/
import { readWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
/* ══ (hist-urban-population) THE HISTORICAL URBAN-POPULATION RECORD, FOR ATLAS ═══════════════════════════════
   The rule is js/hist-urban.js (stateAt / activeAt / historyOf / findCity — the functions the map layer reads), over the
   bundle data/hist-urban.json. This gathers the answer as VALUES (`exec.cityPopulation`, which Atlas receives whole) and
   writes the same facts in words. «Not listed» and «outside the record's years» are observations, not failures. */
export async function cityPopulation(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc, note = K.note;
  const HU = await import('./hist-urban.js');
  let data;
  try { data = await HU.loadRecord(document.baseURI, { readWithin, clockFor }); }
  catch (e) { return R(false, warn(esc(L('The historical urban-population record could not be read: ', '歴史上の都市人口の記録を読めませんでした: ') + (e && e.message ? e.message : e))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } }); }
  const HS = window.IntMapHistScale;
  const yearText = (y) => (HS && HS.yearText) ? HS.yearText(y, 'en') : (y >= 1 ? String(y) : (1 - y) + ' BC');
  const yearsOf = (r) => ({ year: r, yearText: yearText(r) });
  const hasYear = a.year != null && String(a.year).trim() !== '' && isFinite(+a.year);
  const bc = String(a.era == null ? 'AD' : a.era).trim().toUpperCase() === 'BC';
  const cityQ = a.city == null ? '' : String(a.city).trim();
  const limit = a.limit != null && isFinite(+a.limit) && +a.limit >= 1 ? Math.round(+a.limit) : 10;
  let year = null;
  if (hasYear) {
    const n = Math.abs(Math.round(+a.year));
    if (n < 1) return R(false, warn(esc(L('Give the year as it is written (1 BC and AD 1 are the first years): a positive integer, with era BC or AD.', '年は表記どおり（紀元前1年・紀元1年が最初）に、正の整数と era（BC か AD）で指定してください。'))), { meta: { code: 'BAD_YEAR', category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
    year = (HS && HS.fromEra) ? HS.fromEra(n, bc) : (bc ? 1 - n : n);
  }
  const src = data.source;
  const tables = data.tables.map((t) => ({ key: t.key, label: t.label, book: t.book, doi: t.doi, threshold: L(t.threshold[0], t.threshold[1]) }));
  const caveats = {
    notListedIsNotAbsent: L('A city absent from a year is NOT LISTED there — each table lists cities only above its size threshold — which is not the same as not existing.', '記録にない都市は「収録されていない」のであって、存在しなかったという意味ではありません（各表は一定規模以上の都市だけを収録）。'),
    nothingInterpolated: L('Figures are as stated by the book for statedYear; nothing is interpolated. A figure is shown only within the record’s own restatement window (shownUntil).', '数字は、その本が statedYear について述べたとおりで、補間はしていません。記録自身の再掲の窓（shownUntil）の内側でだけ示されます。'),
    bothBooks: L('Where Chandler and Modelski state the same year, both figures are returned; neither is preferred.', 'Chandler と Modelski が同じ年を述べる場合は両方の数字を返し、どちらも優先しません。'),
    certainty: L('certainty is the geocoding rank 1–3 (1 = confirmed by three geocoders); it rates the position of the point, not the population.', 'certainty は位置の確からしさ（1〜3、1 は3つのジオコーダーで確認）で、人口の確からしさではありません。'),
    thresholds: tables.map((t) => ({ book: t.label, threshold: t.threshold })),
  };
  const source = { publisher: src.publisher, title: src.title, citation: src.citation, url: src.url, licence: src.licence, licenceUrl: src.licenceUrl, retrievedAt: data.retrievedAt };
  const span = { from: data.span.from, to: data.span.to, fromText: yearText(data.span.from), toText: yearText(data.span.to) };
  const countryOf = (c) => { for (const r of c.r) if (r.c) return r.c; return ''; };
  const bookOf = (key) => { const t = data.tables.find((x) => x.key === key); return t ? t.label : key; };
  const figs = (s) => s.figures.map((f) => ({ population: f.population, book: bookOf(f.table), statedYear: s.year, statedYearText: yearText(s.year), certainty: f.certainty }));
  const figWords = (fs) => fs.map((f) => f.population.toLocaleString('en-US') + ' (' + f.book + ')').join(' / ');
  const cite = '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">' + esc(src.citation) + ' · ' + esc(src.licence) + ' · ' + esc(src.url) + '<br>' + esc(caveats.notListedIsNotAbsent + ' ' + caveats.nothingInterpolated + ' ' + caveats.bothBooks + ' ' + caveats.certainty) + '<br>' + tables.map((t) => esc(t.label + ': ' + t.threshold)).join('<br>') + '</div>';
  const meta = { code: 'OK', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true };
  const out = (html, result) => R(true, html, { exec: { cityPopulation: Object.assign({ source, span, caveats }, result) }, meta });

  /* ── a city (and perhaps a year) ── */
  if (cityQ) {
    const found = HU.findCity(data, cityQ);
    if (!found.length) return out(note(esc(L('The record lists no city named «' + cityQ + '». (Not listed is not the same as never existed: only cities above each table’s size threshold are in it.)', '記録に「' + cityQ + '」という名前の都市はありません（収録は各表の規模以上の都市だけで、存在しなかったという意味ではありません）。'))) + cite, { kind: 'city', query: cityQ, found: 0, cities: [] });
    const cities = found.map((c) => {
      const hist = HU.historyOf(data, c).map((h) => ({ year: h.year, yearText: yearText(h.year), population: h.population, book: bookOf(h.table), certainty: h.certainty }));
      const o = { name: c.n, otherNames: HU.namesOf(c).filter((n) => n !== c.n), country: countryOf(c), lon: c.lon, lat: c.lat, history: hist };
      if (c.same) o.sameCoordinatesAs = c.same;
      if (year !== null) {
        const s = HU.stateAt(data, c, year);
        if (s) o.atYear = { listed: true, statedYear: s.year, statedYearText: yearText(s.year), shownUntil: s.until - 1, shownUntilText: yearText(s.until - 1), figures: figs(s) };
        else {
          const before = c.f.filter((f) => f[0] <= year).map((f) => f[0]).pop(), after = c.f.find((f) => f[0] > year);
          o.atYear = { listed: false, nearestEarlierStatedYear: before === undefined ? null : before, nearestLaterStatedYear: after ? after[0] : null, statement: L('The record lists no figure for this city at ' + yearText(year) + '.', 'この記録には ' + yearText(year) + ' のこの都市の数字がありません。') };
        }
      }
      return o;
    });
    let h = note('✓ ' + esc(L('Population record: ' + cityQ + (year !== null ? ' · ' + yearText(year) : ''), '人口の記録: ' + cityQ + (year !== null ? ' · ' + yearText(year) : ''))));
    for (const c of cities) {
      h += '<div style="margin-top:6px;"><b>' + esc(c.name) + '</b> — ' + esc(c.country) + ' (' + c.lat.toFixed(2) + ', ' + c.lon.toFixed(2) + ')';
      if (c.atYear) h += '<div>' + esc(c.atYear.listed ? yearText(year) + ': ' + figWords(c.atYear.figures) + L(' as stated for ', ' ・述べられた年 ') + c.atYear.statedYearText : c.atYear.statement) + '</div>';
      const shown = c.history.map((x) => x.yearText + ': ' + x.population.toLocaleString('en-US') + ' (' + x.book + ')').join(' · ');
      h += '<div style="font-size:12px;color:var(--text-muted);">' + esc(shown) + '</div></div>';
    }
    return out(h + cite, { kind: 'city', query: cityQ, found: cities.length, year: year === null ? null : yearsOf(year), cities });
  }

  /* ── a year ── */
  if (year !== null) {
    if (year < data.span.from || year > data.span.to) return out(note(esc(L('The record spans ' + span.fromText + ' to ' + span.toText + ' and states nothing for ' + yearText(year) + '.', 'この記録は ' + span.fromText + ' から ' + span.toText + ' までで、' + yearText(year) + ' については何も述べていません。'))) + cite, { kind: 'year', year: yearsOf(year), inSpan: false, count: 0, cities: [] });
    const act = HU.activeAt(data, year);
    const list = act.slice(0, limit).map(({ city, state }) => { const o = { name: city.n, country: countryOf(city), lon: city.lon, lat: city.lat, figures: figs(state), shownUntil: state.until - 1, shownUntilText: yearText(state.until - 1) }; if (city.same) o.sameCoordinatesAs = city.same; return o; });
    if (!act.length) return out(note(esc(L('The record lists no city at ' + yearText(year) + ' (inside its span, but no table states or carries a figure for that year).', yearText(year) + ' に収録されている都市はありません（記録の範囲内ですが、その年を述べる、または引き継ぐ表がありません）。'))) + cite, { kind: 'year', year: yearsOf(year), inSpan: true, count: 0, cities: [] });
    const rows = list.map((c) => '<li><b>' + esc(c.name) + '</b>, ' + esc(c.country) + ' — ' + esc(figWords(c.figures)) + ' <span style="color:var(--text-muted);font-size:11px;">(' + esc(L('stated for ', '述べられた年: ') + c.figures[0].statedYearText) + ')</span></li>').join('');
    return out(note('✓ ' + esc(L('Largest cities the record lists at ' + yearText(year) + ' (' + list.length + ' of ' + act.length + ')', yearText(year) + ' に記録が収録する大きい都市（' + act.length + ' 件中 ' + list.length + ' 件）'))) + '<ol style="margin:4px 0 4px 18px;padding:0;">' + rows + '</ol>' + cite, { kind: 'year', year: yearsOf(year), inSpan: true, count: act.length, returned: list.length, cities: list });
  }

  /* ── neither: the record itself ── */
  return out(note('✓ ' + esc(L('Historical urban-population record: ' + span.fromText + ' to ' + span.toText + ' · ' + data.cities.length + ' cities', '歴史上の都市人口の記録: ' + span.fromText + ' 〜 ' + span.toText + ' · ' + data.cities.length + ' 都市'))) + '<div>' + esc(L('Give a year (with era BC/AD) for the largest cities, or a city name for its population history.', '年（era は BC/AD）で大きい都市、都市名でその人口の推移を返します。')) + '</div>' + cite, { kind: 'record', cities: data.cities.length });
}
