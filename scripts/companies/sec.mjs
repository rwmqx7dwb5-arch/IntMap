/* ============================================================================
 *  IntMap · company build — SEC EDGAR company facts (the annual financial figures of US filers)
 *  Used by scripts/companies/build.mjs. Moved out of it so the financial figures can be measured and
 *  re-read on their own (tests/countries-companies-checks.test.mjs evaluates newestAnnual).
 * ==========================================================================*/
import { httpJSON, cacheGet, cachePut, SEC_UA } from './wd.mjs';

/* ── SEC EDGAR ───────────────────────────────────────────────────────────── */
export const SEC_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss'],
  totalAssets: ['Assets'],
};
let _secTickers = null;
export async function secTickerMap() {
  if (_secTickers) return _secTickers;
  const cached = cacheGet('sec', 'company_tickers', 7 * 24 * 3600 * 1000);
  const j = cached || cachePut('sec', 'company_tickers', await httpJSON('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } }));
  const m = new Map();
  for (const k of Object.keys(j || {})) {
    const r = j[k];
    if (r && r.ticker) m.set(String(r.ticker).toUpperCase(), String(r.cik_str).padStart(10, '0'));
  }
  _secTickers = m;
  return m;
}
export async function secConcept(cik, tag) {
  const key = cik + '/' + tag;
  const hit = cacheGet('sec', key, 30 * 24 * 3600 * 1000);
  if (hit !== null) return hit;
  let j = null;
  try {
    j = await httpJSON('https://data.sec.gov/api/xbrl/companyconcept/CIK' + cik + '/us-gaap/' + tag + '.json', { retries: 2, headers: { 'User-Agent': SEC_UA } });
  } catch (_) { j = null; }
  cachePut('sec', key, j || false);
  return j;
}
/** Latest annual (FY, 10-K) figure with its own fiscal year and currency. */
export function secLatestAnnual(concept) {
  if (!concept || !concept.units) return null;
  for (const cur of Object.keys(concept.units)) {
    /* ⚠ NOT EVERY UNIT BUCKET IS A LIST. Measured mid-run: one filer's concept
       came back with a non-array under a unit key and the whole build died on
       `.filter is not a function` — after forty minutes of upstream work. A
       malformed bucket is one company's missing number, never the run. */
    if (!Array.isArray(concept.units[cur])) continue;
    const rows = concept.units[cur].filter((u) => u && u.fp === 'FY' && u.form && String(u.form).indexOf('10-K') === 0 && u.end);
    if (!rows.length) continue;
    /* ⚠ TWO SHAPES. Income-statement facts are DURATIONS (start..end) and only a
       ~365-day one is the annual figure; balance-sheet facts (Assets) are
       INSTANTS and carry no `start` at all. Requiring `start` silently dropped
       every balance-sheet tag — measured on Apple, where totalAssets fell back to
       a 2021 Wikidata value while revenue was FY2025 from the filing. */
    const durations = rows.filter((u) => u.start);
    const annual = durations.length
      ? durations.filter((u) => { const d = (Date.parse(u.end) - Date.parse(u.start)) / 86400000; return d > 300 && d < 400; })
      : rows;
    const pick = (annual.length ? annual : rows).sort((a, b) => (a.fy - b.fy) || (Date.parse(a.end) - Date.parse(b.end))).pop();
    if (!pick) continue;
    return { value: pick.val, currency: cur, fiscalYear: 'FY' + pick.fy, end: pick.end };
  }
  return null;
}


/* ⚠ THE NEWEST ANNUAL FIGURE ACROSS THE TAGS, NOT THE FIRST TAG THAT ANSWERS. A filer moves a line item from one
   us-gaap tag to another over the years, and the old tag keeps its last value for ever. Breaking on the first tag
   with any value shipped NVIDIA's revenue as FY2022 ($26.9B, the last year under
   RevenueFromContractWithCustomerExcludingAssessedTax) beside FY2026 profit and assets (measured 2026-11-17).
   Every tag is read and the annual row with the latest period end wins; the tag order only breaks a tie. */
export function newestAnnual(answers) {
  let best = null;
  for (const got of answers) if (got && (!best || Date.parse(got.end) > Date.parse(best.end))) best = got;
  return best;
}
/** { revenue, operatingIncome, netIncome, totalAssets } for one CIK — each the newest annual figure of its tags. */
export async function secFinancials(cik) {
  const out = {};
  for (const [field, tags] of Object.entries(SEC_TAGS)) {
    const answers = [];
    for (const tag of tags) answers.push(secLatestAnnual(await secConcept(cik, tag)));
    const best = newestAnnual(answers);
    if (best) out[field] = best;
  }
  return out;
}
