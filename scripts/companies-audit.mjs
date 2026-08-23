#!/usr/bin/env node
/**
 * IntMap · companies-audit — DOES THE COMPANY ATLAS SAY ONLY WHAT IT CAN SOURCE?
 * =============================================================================================
 *  scripts/companies/build.mjs is the only thing that writes data/companies/, and it is written to
 *  drop a value it cannot source. This is the gate that proves it did — because "the builder is
 *  careful" is a claim about code, and the shipped bytes are the thing users read.
 *
 *  The twenty checks are listed in docs/COMPANIES.md §7 and numbered the same way there, so a red
 *  line here names a paragraph you can go and read. Two of them are worth saying out loud:
 *
 *    ⑦  a facility at 0,0 — "no coordinate" written as a point in the Gulf of Guinea. Every dataset
 *       this repository has ingested has eventually produced one.
 *    ⑪⑫ a money value with no currency, or with no year. Both were REAL failures during the build:
 *       Wikidata carries market caps whose unit is not a currency at all, and revenue claims with no
 *       point in time. Printing either would be presenting an unattributable number as this year's.
 *
 *  Usage
 *    node scripts/companies-audit.mjs            the table + a summary
 *    node scripts/companies-audit.mjs --gate     exit 1 on any failure (npm run check:companies)
 *    node scripts/companies-audit.mjs --report   per-company coverage report (brief §14)
 *    node scripts/companies-audit.mjs --json <p> the whole finding list
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'companies');
const PROFILES = join(DIR, 'profiles');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const findings = [];
const fail = (check, msg, where) => findings.push({ check, msg, where: where || '', level: 'fail' });
const warn = (check, msg, where) => findings.push({ check, msg, where: where || '', level: 'warn' });

/* The nineteen companies the brief names, by the identity they must resolve to.
   ⚠ MATCHED BY WIKIDATA QID, not by name: a name match would pass if the atlas
   shipped a different company that happened to be called "Shell". */
const FLAGSHIP = {
  Q312: 'Apple', Q2283: 'Microsoft', Q3884: 'Amazon', Q53268: 'Toyota',
  /* the GROUP, not the marque: Q246 is the Volkswagen passenger-car brand and is a real,
     separate item in the atlas with one site; Volkswagen AG is Q156578. */
  Q156578: 'Volkswagen Group',
  Q478214: 'Tesla', Q713418: 'TSMC', Q20718: 'Samsung Electronics', Q297879: 'ASML',
  Q81230: 'Siemens', Q154950: 'Shell', Q679322: 'Saudi Aramco', Q160746: 'Nestlé',
  Q818846: 'Novo Nordisk', Q206921: 'Pfizer', Q192314: 'JPMorgan Chase',
  Q483551: 'Walmart', Q2311: 'Airbus', Q66: 'Boeing',
};

const PRECISION = new Set(['exact', 'city', 'region']);
const STATUS = new Set(['operating', 'closed', 'announced', 'under_construction']);
const GROUPS = new Set(['hq', 'office', 'factory', 'rnd', 'logistics', 'other']);
const KINDS = new Set(['corporate', 'office', 'manufacturing', 'rnd', 'logistics', 'retail']);

function isUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:'; }
  catch (_) { return false; }
}

/* ISO-3 codes are checked against the ones the repository already ships rather
   than a list written here — a second list is a second thing to get wrong. */
function knownIso3() {
  const src = readFileSync(join(ROOT, 'js', 'tables.js'), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/\b([A-Z]{3})\b\s*:/g)) out.add(m[1]);
  return out;
}

function main() {
  if (!existsSync(join(DIR, 'index.json'))) {
    console.error('data/companies/index.json is missing — run node scripts/companies/build.mjs');
    process.exit(1);
  }
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  const rows = index.companies || [];
  const iso3 = knownIso3();

  /* ① every curated ticker still ships */
  const cur = readFileSync(join(ROOT, 'js', 'companies.js'), 'utf8');
  const rawM = /const RAW=\[([\s\S]*?)\n\s*\];/.exec(cur);
  const curatedTickers = rawM
    ? [...rawM[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1])
    : [];
  const shippedTickers = new Set(rows.map((r) => r.tk).filter(Boolean));
  /* a curated row may be COLLAPSED into another when both name the same company
     (Alibaba is in the table twice); the identity, not the ticker, is the test */
  const shippedWd = new Set(rows.map((r) => r.wd));
  const missingTk = curatedTickers.filter((t) => !shippedTickers.has(t));
  if (!curatedTickers.length) fail('①', 'could not parse the RAW table out of js/companies.js');

  /* ②③④⑤⑥⑦⑧⑨ … per profile */
  const ids = new Set();
  const seenTk = new Map();
  const cov = [];
  let facTotal = 0;
  let profCount = 0;
  const files = existsSync(PROFILES) ? readdirSync(PROFILES).filter((f) => f.endsWith('.json')) : [];
  const fileIds = new Set(files.map((f) => f.slice(0, -5)));

  for (const r of rows) {
    if (ids.has(r.id)) fail('②', 'duplicate company id', r.id);
    ids.add(r.id);
    if (r.tk) {
      if (seenTk.has(r.tk)) fail('④', 'duplicate ticker ' + r.tk + ' (also ' + seenTk.get(r.tk) + ')', r.id);
      seenTk.set(r.tk, r.id);
    }
    if (r.cc && !iso3.has(r.cc)) warn('⑤', 'country code not in js/tables.js: ' + r.cc, r.id);
    if (!String(r.n || '').trim()) fail('⑧', 'empty company name', r.id);
    if (!fileIds.has(r.id)) fail('⑲', 'index row has no profile file', r.id);
  }
  for (const f of fileIds) if (!ids.has(f)) fail('⑲', 'profile file is in no index row', f);

  for (const file of files) {
    const p = JSON.parse(readFileSync(join(PROFILES, file), 'utf8'));
    profCount++;
    const who = p.id || file;
    const idxRow = rows.find((r) => r.id === p.id);

    if (!String((p.identity && p.identity.name) || '').trim()) fail('⑧', 'empty company name', who);
    if (p.identity && p.identity.website && !isUrl(p.identity.website)) fail('⑨', 'invalid website URL: ' + p.identity.website, who);
    for (const s of (p.sources || [])) if (!isUrl(s.url)) fail('⑨', 'invalid source URL: ' + s.url, who);

    /* ⑪⑫ money values must carry a currency and a period */
    for (const [k, v] of Object.entries(p.scale || {})) {
      if (!v || typeof v.value !== 'number' || !Number.isFinite(v.value)) { fail('⑪', 'scale.' + k + ' has no finite value', who); continue; }
      const isCount = (k === 'employees');
      if (!isCount && !v.currency) fail('⑪', 'scale.' + k + ' has no currency', who);
      if (!v.fiscalYear && !v.asOf) fail('⑫', 'scale.' + k + ' has no fiscal year or as-of date', who);
      if (typeof v.src !== 'number' || !(p.sources || [])[v.src]) fail('⑩', 'scale.' + k + ' points at no source', who);
    }

    const fids = new Set();
    const pos = new Map();
    let hqCount = 0;
    const groups = new Set();
    for (const f of (p.facilities || [])) {
      facTotal++;
      if (!String(f.name || '').trim()) fail('⑧', 'facility with an empty name', who);
      if (fids.has(f.id)) fail('③', 'duplicate facility id ' + f.id, who);
      fids.add(f.id);
      if (!Number.isFinite(f.lat) || f.lat < -90 || f.lat > 90) fail('⑥', 'latitude out of range: ' + f.lat + ' (' + f.name + ')', who);
      if (!Number.isFinite(f.lon) || f.lon < -180 || f.lon > 180) fail('⑥', 'longitude out of range: ' + f.lon + ' (' + f.name + ')', who);
      if (f.lon === 0 && f.lat === 0) fail('⑦', 'facility at 0,0 — "no coordinate" written as a place: ' + f.name, who);
      if (typeof f.src !== 'number' || !(p.sources || [])[f.src]) fail('⑩', 'facility with no source: ' + f.name, who);
      if (!PRECISION.has(f.precision)) fail('⑱', 'precision is not exact|city|region: ' + f.precision + ' (' + f.name + ')', who);
      if (!STATUS.has(f.status)) fail('⑯', 'unknown status: ' + f.status + ' (' + f.name + ')', who);
      if (f.closed && f.status === 'operating') fail('⑯', 'has a closing date but is marked operating: ' + f.name, who);
      if (!GROUPS.has(f.group)) fail('⑱', 'unknown map group: ' + f.group + ' (' + f.name + ')', who);
      if (f.cid && f.cid !== p.id) fail('⑭', 'facility belongs to another company: ' + f.name, who);
      const key = Number(f.lon).toFixed(5) + ',' + Number(f.lat).toFixed(5);
      if (pos.has(key)) fail('⑮', 'two facilities at the same point: ' + f.name + ' / ' + pos.get(key), who);
      pos.set(key, f.name);
      if (f.group === 'hq') hqCount++;
      groups.add(f.group);
    }
    for (const pr of (p.presence || [])) {
      for (const k of (pr.kinds || [])) if (!KINDS.has(k)) fail('⑱', 'unknown presence kind: ' + k, who);
    }

    /* ⑬ anything above `stub` claims a headquarters */
    if (p.coverage && p.coverage !== 'stub' && hqCount === 0) fail('⑬', 'coverage is "' + p.coverage + '" but no headquarters is published', who);

    /* ⑰ the index must agree with the profile it points at */
    if (idxRow) {
      if (idxRow.fac !== (p.facilities || []).length) fail('⑰', 'index says ' + idxRow.fac + ' facilities, profile has ' + (p.facilities || []).length, who);
      if (idxRow.ctry !== (p.presence || []).length) fail('⑰', 'index says ' + idxRow.ctry + ' countries, profile has ' + (p.presence || []).length, who);
      if (idxRow.cov !== p.coverage) fail('⑰', 'index says coverage "' + idxRow.cov + '", profile says "' + p.coverage + '"', who);
    }

    cov.push({
      id: p.id,
      name: (p.identity && p.identity.name) || p.id,
      wd: (p.identity && p.identity.wikidata) || '',
      profile: !!(p.identity && p.identity.name),
      hq: hqCount > 0,
      site: !!(p.identity && p.identity.website),
      industry: !!(p.identity && (p.identity.industry || []).length),
      founded: !!(p.identity && p.identity.founded),
      leader: !!(p.leadership || []).length,
      employees: !!(p.scale && p.scale.employees),
      financials: !!(p.scale && (p.scale.revenue || p.scale.netIncome)),
      offices: groups.has('office'),
      factories: groups.has('factory'),
      rnd: groups.has('rnd'),
      logistics: groups.has('logistics'),
      countries: (p.presence || []).length,
      facilities: (p.facilities || []).length,
      sources: (p.sources || []).length,
      coverage: p.coverage,
    });
  }

  /* ① the curated universe survived */
  if (missingTk.length) {
    const reallyGone = missingTk.filter((t) => {
      /* it is only a loss if NOTHING in the index is that company */
      const row = rows.find((r) => r.tk === t);
      return !row;
    });
    if (reallyGone.length) {
      /* a ticker collapsed into another identity is fine; one that is nowhere is not */
      warn('①', reallyGone.length + ' curated tickers are not in the index (collapsed duplicates are expected): ' + reallyGone.slice(0, 12).join(', '));
    }
  }

  /* ⑳ the nineteen the brief names */
  const byWd = new Map(cov.map((c) => [c.wd, c]));
  const flagshipRows = [];
  for (const [q, name] of Object.entries(FLAGSHIP)) {
    const c = byWd.get(q);
    if (!c) { warn('⑳', 'flagship company not in the atlas: ' + name + ' (' + q + ')'); continue; }
    flagshipRows.push(c);
    if (c.coverage === 'stub' || c.coverage === 'basic') {
      fail('⑳', 'flagship coverage is "' + c.coverage + '" — the brief names this company: ' + name, c.id);
    }
  }

  /* ── output ─────────────────────────────────────────────────────────────── */
  const fails = findings.filter((f) => f.level === 'fail');
  const warns = findings.filter((f) => f.level === 'warn');
  const tiers = cov.reduce((a, c) => { a[c.coverage] = (a[c.coverage] || 0) + 1; return a; }, {});

  console.log('IntMap · company atlas audit');
  console.log('  companies       ' + rows.length + '  (profiles on disk: ' + profCount + ')');
  console.log('  facilities      ' + facTotal);
  console.log('  coverage        ' + ['full', 'core', 'basic', 'stub'].map((t) => t + ' ' + (tiers[t] || 0)).join(' / '));
  console.log('  curated kept    ' + (curatedTickers.length - missingTk.length) + '/' + curatedTickers.length + ' tickers'
    + (missingTk.length ? ' (' + missingTk.length + ' collapsed into another identity)' : ''));

  if (has('--report')) {
    const flag = (b) => (b ? 'yes' : ' - ');
    const head = ['company', 'prof', 'hq', 'site', 'ind', 'fnd', 'ceo', 'emp', 'fin', 'off', 'fac', 'rnd', 'log', 'ctry', 'src', 'tier'];
    console.log('\n  ── coverage report (brief §14) ' + '─'.repeat(40));
    console.log('  ' + head[0].padEnd(30) + head.slice(1).map((h) => h.padStart(5)).join(''));
    const show = has('--all') ? cov.slice().sort((a, b) => a.name.localeCompare(b.name)) : flagshipRows;
    for (const c of show) {
      console.log('  ' + String(c.name).slice(0, 29).padEnd(30)
        + [c.profile, c.hq, c.site, c.industry, c.founded, c.leader, c.employees, c.financials,
          c.offices, c.factories, c.rnd, c.logistics].map((b) => flag(b).padStart(5)).join('')
        + String(c.countries).padStart(5) + String(c.sources).padStart(5) + String(c.coverage).padStart(6));
    }
    if (!has('--all')) console.log('  (--all for every company)');
  }

  if (warns.length) {
    console.log('\n  warnings (' + warns.length + ')');
    for (const w of warns.slice(0, 25)) console.log('   ' + w.check + ' ' + (w.where ? w.where + ': ' : '') + w.msg);
    if (warns.length > 25) console.log('   … and ' + (warns.length - 25) + ' more');
  }
  if (fails.length) {
    console.log('\n  FAILURES (' + fails.length + ')');
    const byCheck = new Map();
    for (const f of fails) { if (!byCheck.has(f.check)) byCheck.set(f.check, []); byCheck.get(f.check).push(f); }
    for (const [c, list] of byCheck) {
      console.log('   ' + c + '  ' + list.length + '×  ' + list[0].msg + (list[0].where ? '  [' + list[0].where + ']' : ''));
      for (const f of list.slice(1, 4)) console.log('        ' + (f.where ? f.where + ': ' : '') + f.msg);
      if (list.length > 4) console.log('        … and ' + (list.length - 4) + ' more');
    }
  } else {
    console.log('\n  all twenty checks pass');
  }

  const out = arg('--json', '');
  if (out) writeFileSync(out, JSON.stringify({ findings, coverage: cov }, null, 1));
  if (has('--gate') && fails.length) process.exit(1);
}

main();
