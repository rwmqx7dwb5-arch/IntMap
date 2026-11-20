/* ============================================================================
 *  IntMap · Atlas capabilities — the `siting.*` namespace   (js/atlas-cap-siting.js)
 * ----------------------------------------------------------------------------
 *  `siting.compare` — 「半導体工場を置くなら、どの県が電力・用地・人材・研究・規制の点で有利か」を、公開統計の実数で並べる。
 *  エンジン・データ・手法の説明は js/siting.js と data/siting-jp.json。ここは扉と引数の束縛だけ。
 *  ⚠ 能力表の書式・生成の仕組みは js/atlas-cap-data.js の冒頭と同じ（`node scripts/atlas-caps.mjs --write`）。
 * ==========================================================================*/
import { str, int, list } from './atlas-caps.js';
import { loadSiting, compare } from './siting.js';

const fmt = (v, unit) => {
  if (v == null) return '—';
  if (unit === 'ratio' || unit === 'JPY/kWh') return (+v).toFixed(2);
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100);
};
const ABOUT_EN = { power: 'Electricity', water: 'Industrial water', land: 'Industrial land', labor: 'Labour', research: 'Research', regulation: 'Regulation', logistics: 'Logistics' };
const ABOUT_JP = { power: '電力', water: '工業用水', land: '産業用地', labor: '労働力', research: '研究機関', regulation: '規制', logistics: '物流' };

export default [
  {
    /* column 7 'read', 8 'none': it reads files IntMap ships and changes no setting. No column 11: the answer carries published figures
       and statute text that IntMap shipped, not anything fetched from a third party during the turn. */
    row: ['siting.compare', 'siting', 'compareSites,industrialSiting,siteSelection,locationComparison,compareLocations', 'data', 'none', '', 'explanation', 'read', 'none', '', ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 50, text: 'COMPARE PREFECTURES AS A PLANT SITE — power, land, labour, research, rules (工場・産業立地の比較: 電力価格・産業用地の地価・最低賃金と労働力・大学・工場立地法を、県ごとに公開統計の実数で並べる): {"type":"siting","country"?:"JP","areas"?:[str],"dimensions"?:["power"|"land"|"labor"|"research"|"regulation"],"sector"?:str,"rankBy"?:METRIC,"top"?:int}. Japan only today, by prefecture (47). The table gives each metric\'s value, its RANK among all prefectures (1 = the better end: lowest price, highest count), the source and year, and — in each prefecture — the company sites IntMap carries there (`sector`:"semi" for semiconductor firms). It does NOT add the metrics into one score: say which matter for the plant and read the ranks. `areas` names prefectures (Kumamoto, 熊本, JP-43); with none it ranks all by `rankBy` (power_spot_avg, land_ind_median, labor_min_wage, labor_openings_ratio, research_universities, …) or by the number of `sector` sites. It states what it did not measure (industrial water and logistics are not loaded; electricity is the WHOLESALE price of the price area, not a plant\'s tariff; the land figure counts only the announced parcels, with the sample size shown). Never fill a gap from memory — say it is a gap.' },
    ],
    schema: () => ({ type: 'object', properties: { country: str(), areas: list(str()), dimensions: list(str()), metrics: list(str()), sector: str(), rankBy: str(), top: int(1, 47) } }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const fail = (msg, code, retryable) => R(false, warn(esc(msg)), { meta: { code, category: 'input', retryable: !!retryable, produced: [], userGoalSatisfied: false } });
      const cc = String(a.country || 'JP').slice(0, 2).toUpperCase();
      const data = await loadSiting(cc);
      if (!data) return fail(L('IntMap has no siting data for «' + cc + '» yet (Japan only today).', '«' + cc + '» の産業立地データはまだありません（現在は日本のみ）。'), 'NO_DATA', false);
      const r = compare(data, { areas: a.areas, dimensions: a.dimensions, metrics: a.metrics, sector: a.sector, rankBy: a.rankBy, top: a.top });
      if (!r.ok) {
        const why = r.code === 'NO_AREA' ? L('None of these named a prefecture: ' + r.missing.join(', '), '県として解釈できませんでした: ' + r.missing.join('、'))
          : r.code === 'BAD_METRIC' ? L('Unknown metric «' + r.metric + '». Known: ' + r.known.join(', '), '指標 «' + r.metric + '» はありません。使える指標: ' + r.known.join(', ')) : L('The siting data could not be read.', '産業立地データを読めませんでした。');
        return fail(why, r.code, false);
      }
      const label = (id) => esc(L(r.metrics[id].label.en, r.metrics[id].label.jp));
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Siting comparison — Japan, by prefecture', '産業立地の比較 — 日本・都道府県別')) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + esc(L('Rank = position among all ' + r.scope.of + ' prefectures, 1 being the better end of that metric. There is no combined score: weigh the metrics for your plant.', '順位は全 ' + r.scope.of + ' 都道府県の中での位置（1 がその指標の良い側）。総合点は出していません。工場に応じて指標を選んでください。')) + '</div>';
      h += '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse;"><tr style="text-align:left;color:var(--text-muted)"><th style="padding:3px 4px;"></th>' + r.metricIds.map((id) => '<th style="padding:3px 4px;">' + label(id) + '<br><span style="font-weight:400">' + esc(r.metrics[id].unit) + '</span></th>').join('') + '</tr>';
      for (const row of r.rows) {
        h += '<tr style="border-top:1px solid var(--border,#3333);vertical-align:top"><td style="padding:3px 4px;white-space:nowrap">' + esc(L(row.name, row.nameLocal)) + (row.powerArea ? '<br><span style="color:var(--text-muted)">' + esc(row.powerArea) + '</span>' : '') + '</td>';
        for (const id of r.metricIds) { const c = row.values[id]; h += '<td style="padding:3px 4px;">' + esc(fmt(c.v, r.metrics[id].unit)) + (c.rank ? ' <span style="color:var(--text-muted)">#' + c.rank + '/' + c.of + '</span>' : '') + '</td>'; }
        h += '</tr>';
        if (row.anchors.length) h += '<tr><td></td><td colspan="' + r.metricIds.length + '" style="padding:0 4px 4px;color:var(--text-muted)">' + esc(L('Company sites in IntMap (' + row.anchors.length + '): ', 'IntMap にある企業拠点 (' + row.anchors.length + '): ')) + esc(row.anchors.slice(0, 6).map((x) => x.name + (x.precision ? ' [' + ['exact', 'city', 'region'][x.precision] + ']' : '')).join('; ')) + (row.anchors.length > 6 ? '…' : '') + '</td></tr>';
        if (row.note) h += '<tr><td></td><td colspan="' + r.metricIds.length + '" style="padding:0 4px 4px;color:#ff9f0a">' + esc(row.note) + '</td></tr>';
        if (row.pending && row.pending.labor_min_wage && r.metricIds.includes('labor_min_wage')) h += '<tr><td></td><td colspan="' + r.metricIds.length + '" style="padding:0 4px 4px;color:#ff9f0a">' + esc(L('Minimum wage rises to ' + row.pending.labor_min_wage.wage + ' yen on ' + row.pending.labor_min_wage.from + '.', '最低賃金は ' + row.pending.labor_min_wage.from + ' から ' + row.pending.labor_min_wage.wage + ' 円に改定されます。')) + '</td></tr>';
      }
      h += '</table></div>';
      if (r.noSectorMatch) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('No company site in this data belongs to sector «' + a.sector + '».', '企業区分 «' + a.sector + '» の拠点はこのデータにありません。')) + '</div>';
      if (r.unresolved.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Not found as prefectures: ' + r.unresolved.join(', '), '県として見つからなかった: ' + r.unresolved.join('、'))) + '</div>';
      if (r.rules.length) h += '<div style="font-size:11px;margin-top:6px;"><b>' + esc(L('Rules (national)', '規則（国）')) + '</b><br>' + r.rules.map((x) => esc(L(x.en, x.text)) + ' <span style="color:var(--text-muted)">' + esc(x.ref) + '</span>').join('<br>') + '</div>';
      const used = [...new Set(r.metricIds.map((id) => r.metrics[id].dimension))];
      h += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">' + esc(L('Not measured: ', '載せていないもの: ')) + r.gaps.map((g) => esc(L(ABOUT_EN[g.dimension] || g.dimension, ABOUT_JP[g.dimension] || g.dimension) + ' — ' + g.reason)).join('<br>') + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(L('Sources: ', '出典: ')) + Object.values(r.sources).map((s) => esc(s.name)).join('; ') + '</div>';
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: 'siting', produced: ['explanation'], userGoalSatisfied: true, siting: { country: r.country, areas: r.rows.map((x) => x.id), dimensions: used, gaps: r.gaps.map((g) => g.dimension), generatedAt: r.generatedAt } } });
    },
  },
];
